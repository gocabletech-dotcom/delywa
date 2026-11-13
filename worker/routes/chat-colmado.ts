import { avisarNegocio } from "../lib/tiempo-real";
import { Hono, type Context } from "hono";
import { and, asc, count, desc, eq, gt, gte, max, ne } from "drizzle-orm";
import { toFile } from "openai";
import { chatWebMensajes, chatWebSesiones, paises, pedidos } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { permitirEvento } from "../lib/rate-limit";
import { soloDigitos } from "../lib/telefono";
import { ia } from "../chat/adaptador";
import { anotarNotaDeVoz, atenderChat, type Entrada } from "../bot/motor";
import { iaDisponible, transcribir } from "../bot/ia";
import { inicioDiaLocal } from "../lib/fechas";
import { getColmado, getColmadoTimezone, getPais } from "../storage/colmados";
import { addMensaje, getOrCreateCliente, getOrCreateConversacion } from "../storage/conversaciones";
import { getColmadoByCodigo } from "./menu-grafico";
import { telefonoConPais } from "./registro";

// Chat del colmado en la página (delywa.com/pedir/<colmado>): canal propio de DelyWa, sin las reglas de Meta.
// Lo atiende el bot por pasos de worker/bot/motor.ts (sin IA; la IA de Cloudflare solo cuando no entiende).
// La conversación y los pedidos aparecen en el panel del colmado igual que los de WhatsApp.

export const chatColmadoRoutes = new Hono<AppEnv>();

const MINUTO = 60_000;
const ipDe = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") ?? "sin-ip";
const demasiados = (c: Context<AppEnv>) => c.json({ error: "Demasiados mensajes seguidos. Espera un momento e intenta de nuevo." }, 429);
/**
 * Cuánto espera el bot antes de responder: rápido en las 2 primeras respuestas y luego
 * como una persona escribiendo. Las pruebas lo ponen en 0.
 */
export const tiempos = { primerasRespuestas: 2, rapidoMs: 2000, normalMs: 10_000, entreMensajesMs: 1200 };

/** Minutos sin actividad tras los que el chat vuelve a pedir nombre y teléfono. */
export const inactividad = { minutos: 10 };
const inactiva = (c: Context<AppEnv>) => c.json({ error: "Por tu seguridad cerramos el chat por inactividad. Escribe tus datos para continuar.", inactiva: true }, 423);

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

function nuevoSessionId(): string {
  return `chat_${[...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Datos públicos del colmado para la cabecera del chat. */
chatColmadoRoutes.get("/api/chat-colmado/:codigo/info", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "Negocio no encontrado" }, 404);
  const pais = colmado.paisId ? await getPais(db, colmado.paisId) : undefined;
  return c.json({
    id: colmado.id, nombre: colmado.nombre, logo: colmado.logo, colorPrimario: colmado.colorPrimario,
    direccion: colmado.direccion, estaAbierto: colmado.estaAbiertoManual !== false, mensajeCerrado: colmado.mensajeCerrado,
    prefijoTelefono: pais?.prefijoCelular ?? "1809", codigoPais: pais?.codigo ?? "DO",
  });
});

/** El cliente se identifica con nombre y teléfono, como en WhatsApp. */
chatColmadoRoutes.post("/api/chat-colmado/:codigo/sesion", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "Negocio no encontrado" }, 404);
  const body = await cuerpo(c);
  const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 80) : "";
  const pais = colmado.paisId ? (await db.select().from(paises).where(eq(paises.id, colmado.paisId)))[0] : undefined;
  const telefono = telefonoConPais(typeof body.telefono === "string" ? body.telefono : "", pais?.prefijoCelular ?? "1809");
  if (!nombre) return c.json({ error: "Escribe tu nombre." }, 400);
  if (!telefono) return c.json({ error: "Escribe tu número de teléfono completo." }, 400);
  if (!(await permitirEvento(db, `chat-sesion:${ipDe(c)}`, 30, 60 * MINUTO))) return demasiados(c);

  const aparato = typeof body.aparato === "string" && /^[0-9a-f]{32}$/.test(body.aparato) ? body.aparato : null;

  // Mismo teléfono, mismo aparato y mismo día: se reabre la conversación donde la dejó.
  // Desde otro aparato o en otro día empieza una conversación nueva (el número no está verificado).
  if (aparato) {
    const hoy = inicioDiaLocal(await getColmadoTimezone(db, colmado));
    const [anterior] = await db.select().from(chatWebSesiones)
      .where(and(eq(chatWebSesiones.colmadoId, colmado.id), eq(chatWebSesiones.clienteWhatsapp, telefono), eq(chatWebSesiones.aparato, aparato), gte(chatWebSesiones.fechaCreacion, hoy)))
      .orderBy(desc(chatWebSesiones.id)).limit(1);
    if (anterior) {
      await db.update(chatWebSesiones).set({ fechaUltimaActividad: new Date() }).where(eq(chatWebSesiones.id, anterior.id));
      return c.json({ sessionId: anterior.sessionId, nombre: anterior.clienteNombre || nombre, telefono, reanudada: true });
    }
  }

  const cliente = await getOrCreateCliente(db, colmado.id, telefono, { nombre });
  const conversacion = await getOrCreateConversacion(db, colmado.id, telefono, cliente.nombre || nombre);
  const sessionId = nuevoSessionId();
  await db.insert(chatWebSesiones).values({
    sessionId, colmadoId: colmado.id, clienteNombre: nombre, clienteWhatsapp: telefono, conversacionId: conversacion.id, aparato,
  });
  return c.json({ sessionId, nombre, telefono, reanudada: false });
});

async function sesionValida(c: Context<AppEnv>, db: Db) {
  const sessionId = c.req.param("sessionId") ?? "";
  if (!/^chat_[0-9a-f]{32}$/.test(sessionId)) return null;
  const [sesion] = await db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, sessionId));
  if (!sesion?.clienteWhatsapp) return null;
  const colmado = await getColmado(db, sesion.colmadoId);
  if (!colmado || colmado.estado !== "activo") return null;
  // Sin actividad (ni del cliente, ni del bot, ni del colmado) por 10 minutos: hay que identificarse de nuevo.
  const limite = Date.now() - inactividad.minutos * MINUTO;
  if (sesion.fechaUltimaActividad.getTime() < limite) {
    const [{ ultimo }] = await db.select({ ultimo: max(chatWebMensajes.fechaCreacion) }).from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, sessionId));
    if (!ultimo || new Date(ultimo).getTime() < limite) return "inactiva" as const;
  }
  return { sesion, colmado, telefono: soloDigitos(sesion.clienteWhatsapp) };
}
type SesionAbierta = Exclude<Awaited<ReturnType<typeof sesionValida>>, null | "inactiva">;

/** Mensajes de esta sesión (los del cliente, los del bot y los que mande el colmado desde el panel). */
chatColmadoRoutes.get("/api/chat-colmado/sesion/:sessionId/mensajes", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const despues = Number(c.req.query("despues")) || 0;
  const mensajes = await db.select({ id: chatWebMensajes.id, rol: chatWebMensajes.rol, contenido: chatWebMensajes.contenido, opciones: chatWebMensajes.opciones, fecha: chatWebMensajes.fechaCreacion })
    .from(chatWebMensajes)
    .where(and(eq(chatWebMensajes.sessionId, s.sesion.sessionId), gt(chatWebMensajes.id, despues)))
    .orderBy(asc(chatWebMensajes.id)).limit(200);
  let pedido = null;
  if (s.sesion.pedidoId) {
    const [p] = await db.select({ id: pedidos.id, estado: pedidos.estado, total: pedidos.total, metodoPago: pedidos.metodoPago })
      .from(pedidos).where(eq(pedidos.id, s.sesion.pedidoId));
    pedido = p ?? null;
  }
  return c.json({ mensajes, pedido });
});

const dormir = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Corre el bot en segundo plano: la página va leyendo las respuestas (con "escribiendo…" mientras tanto). */
function atender(c: Context<AppEnv>, s: SesionAbierta, entrada: Entrada) {
  const trabajo = (async () => {
    const db = getDb(c.env.DB);
    const [{ previas }] = await db.select({ previas: count() }).from(chatWebMensajes)
      .where(and(eq(chatWebMensajes.sessionId, s.sesion.sessionId), eq(chatWebMensajes.rol, "assistant")));
    // Se vuelve a leer la sesión justo antes de responder, por si llegaron dos mensajes seguidos.
    const [fresca] = await db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, s.sesion.sessionId));
    // ¿Este aparato ya se usó antes con este número? Entonces se le puede recordar su último pedido.
    const aparatoConocido = s.sesion.aparato
      ? (await db.select({ id: chatWebSesiones.id }).from(chatWebSesiones)
        .where(and(eq(chatWebSesiones.colmadoId, s.colmado.id), eq(chatWebSesiones.clienteWhatsapp, s.sesion.clienteWhatsapp!), eq(chatWebSesiones.aparato, s.sesion.aparato), ne(chatWebSesiones.id, s.sesion.id)))
        .limit(1)).length > 0
      : false;
    const respuestas = await atenderChat({ env: c.env, db, colmado: s.colmado, sesion: fresca ?? s.sesion, respuestasPrevias: previas, aparatoConocido }, entrada);
    await dormir(previas < tiempos.primerasRespuestas ? tiempos.rapidoMs : tiempos.normalMs);
    for (const [i, r] of respuestas.entries()) {
      if (i > 0) await dormir(tiempos.entreMensajesMs);
      await db.insert(chatWebMensajes).values({ sessionId: s.sesion.sessionId, rol: "assistant", contenido: r.texto, opciones: r.opciones ?? null });
    }
    await db.update(chatWebSesiones).set({ fechaUltimaActividad: new Date() }).where(eq(chatWebSesiones.sessionId, s.sesion.sessionId));
  })().catch((err) => console.error("[chat-colmado] El bot falló:", err instanceof Error ? err.message : err));
  try {
    c.executionCtx.waitUntil(trabajo);
    return Promise.resolve();
  } catch {
    return trabajo; // pruebas: sin executionCtx se espera aquí
  }
}

async function guardarDelCliente(db: Db, sessionId: string, contenido: string) {
  const [fila] = await db.insert(chatWebMensajes).values({ sessionId, rol: "user", contenido }).returning({ id: chatWebMensajes.id });
  await db.update(chatWebSesiones).set({ fechaUltimaActividad: new Date() }).where(eq(chatWebSesiones.sessionId, sessionId));
  return fila.id;
}

async function dentroDelLimite(c: Context<AppEnv>, db: Db, sessionId: string, porSesion = 40) {
  return (await permitirEvento(db, `chat-msg:${sessionId}`, porSesion, 10 * MINUTO))
    && (await permitirEvento(db, `chat-ip:${ipDe(c)}`, 200, 10 * MINUTO));
}

chatColmadoRoutes.post("/api/chat-colmado/sesion/:sessionId/mensaje", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const body = await cuerpo(c);
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (!texto) return c.json({ error: "Escribe un mensaje." }, 400);
  if (texto.length > 1500) return c.json({ error: "El mensaje es demasiado largo. Escríbelo en partes más cortas." }, 400);
  if (!(await dentroDelLimite(c, db, s.sesion.sessionId))) return demasiados(c);
  const id = await guardarDelCliente(db, s.sesion.sessionId, texto);
  await atender(c, s, { tipo: "texto", texto });
  return c.json({ ok: true, id });
});

chatColmadoRoutes.post("/api/chat-colmado/sesion/:sessionId/ubicacion", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const body = await cuerpo(c);
  const lat = Number(body.latitude), lon = Number(body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return c.json({ error: "Ubicación inválida" }, 400);
  if (!(await dentroDelLimite(c, db, s.sesion.sessionId))) return demasiados(c);
  await db.update(chatWebSesiones).set({ clienteLatitud: String(lat), clienteLongitud: String(lon) }).where(eq(chatWebSesiones.sessionId, s.sesion.sessionId));
  const id = await guardarDelCliente(db, s.sesion.sessionId, "📍 Ubicación compartida");
  await atender(c, s, { tipo: "ubicacion", latitud: lat, longitud: lon });
  return c.json({ ok: true, id });
});

/** Nota de voz: se pasa a texto y el bot la atiende como si la hubiera escrito. */
chatColmadoRoutes.post("/api/chat-colmado/sesion/:sessionId/voz", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const body = await cuerpo(c);
  const m = typeof body.audioData === "string" ? body.audioData.match(/^data:(audio\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/i) : null;
  if (!m) return c.json({ error: "Formato de audio inválido" }, 400);
  if (body.audioData.length > 4_200_000) return c.json({ error: "La nota de voz es demasiado larga. Graba una más corta." }, 413);
  if (!(await permitirEvento(db, `chat-voz:${s.sesion.sessionId}`, 10, 10 * MINUTO)) || !(await dentroDelLimite(c, db, s.sesion.sessionId))) return demasiados(c);
  let texto = "";
  try {
    if (iaDisponible(c.env)) {
      // Whisper de Cloudflare (Workers AI): gratis dentro del cupo diario.
      texto = await transcribir(c.env, m[2]);
    } else if (c.env.OPENAI_API_KEY) {
      // Respaldo si Workers AI no está conectado y hay llave de OpenAI.
      const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
      const archivo = await toFile(bytes, "nota.webm", { type: m[1] });
      const r = await ia.crear(c.env, s.colmado.id).audio.transcriptions.create({ file: archivo, model: "whisper-1", language: "es" });
      texto = (r.text || "").trim();
    }
    await anotarNotaDeVoz(db, s.colmado.id);
  } catch (err) {
    console.error("[chat-colmado] No se pudo transcribir:", err instanceof Error ? err.message : err);
  }
  if (!texto) return c.json({ error: "No pude entender la nota de voz. Intenta de nuevo o escribe tu pedido." }, 422);
  const id = await guardarDelCliente(db, s.sesion.sessionId, `🎤 ${texto}`);
  await atender(c, s, { tipo: "texto", texto });
  return c.json({ ok: true, id, texto });
});

/** Foto del comprobante de transferencia: se pega al pedido de esta sesión. */
chatColmadoRoutes.post("/api/chat-colmado/sesion/:sessionId/comprobante", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const body = await cuerpo(c);
  if (typeof body.comprobanteUrl !== "string" || !/^\/uploads\/comprobantes\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(body.comprobanteUrl)) {
    return c.json({ error: "Comprobante inválido. Sube la imagen de nuevo." }, 400);
  }
  if (!s.sesion.pedidoId) return c.json({ error: "Primero haz tu pedido; después envía el comprobante." }, 400);
  await db.update(pedidos).set({ comprobanteUrl: body.comprobanteUrl }).where(and(eq(pedidos.id, s.sesion.pedidoId), eq(pedidos.colmadoId, s.colmado.id)));
  const id = await guardarDelCliente(db, s.sesion.sessionId, "📸 Comprobante de pago enviado");
  const aviso = "¡Recibimos tu comprobante! 🙌 El colmado lo revisa y te confirma por aquí.";
  await db.insert(chatWebMensajes).values({ sessionId: s.sesion.sessionId, rol: "assistant", contenido: aviso });
  if (s.sesion.conversacionId) {
    await addMensaje(db, s.sesion.conversacionId, "user", `[Comprobante de pago: ${body.comprobanteUrl}]`);
    await addMensaje(db, s.sesion.conversacionId, "assistant", aviso);
  }
  // El panel ve el comprobante al momento para revisarlo.
  await avisarNegocio(c.env, s.colmado.id, ["pedidos", "conversaciones"]);
  return c.json({ ok: true, id });
});
