import { avisarNegocio } from "../lib/tiempo-real";
import { Hono, type Context } from "hono";
import { and, asc, count, desc, eq, gt, gte, inArray, max, ne } from "drizzle-orm";
import { toFile } from "openai";
import { chatWebMensajes, chatWebSesiones, deliveries, menuProductos, paises, pedidos } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { permitirEvento } from "../lib/rate-limit";
import { mismoTelefono, soloDigitos } from "../lib/telefono";
import { ia } from "../chat/adaptador";
import { anotarNotaDeVoz, atenderChat, type Entrada } from "../bot/motor";
import { CupoAgotado, iaDisponible, transcribir } from "../bot/ia";
import { tieneFuncion } from "../lib/plan";
import { avisarAlNegocio } from "../lib/push";
import { guardarSuscripcion, leerSuscripcion, ofertasVigentes } from "./push";
import { inicioDiaLocal } from "../lib/fechas";
import { getColmado, getColmadoTimezone, getPais } from "../storage/colmados";
import { addMensaje, getOrCreateCliente, getOrCreateConversacion } from "../storage/conversaciones";
import { getColmadoByCodigo } from "./menu-grafico";
import { telefonoInternacional } from "./registro";

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
export const inactividad = { minutos: 10, esperandoComprobanteMinutos: 60 };
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
    ofertas: await ofertasVigentes(db, [colmado.id, ...(colmado.negocioPrincipalId ? [colmado.negocioPrincipalId] : [])]).catch(() => []),
  });
});

/** El cliente acepta avisos en su celular: de su pedido siempre, y de ofertas si quiere. */
chatColmadoRoutes.post("/api/chat-colmado/sesion/:sessionId/push", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const body = await cuerpo(c);
  const sus = leerSuscripcion(body.suscripcion);
  if (!sus) return c.json({ error: "Tu navegador no permitió los avisos." }, 400);
  if (!(await permitirEvento(db, `chat-push:${ipDe(c)}`, 10, 60 * MINUTO))) return demasiados(c);
  await guardarSuscripcion(db, sus, { tipo: "cliente", colmadoId: s.colmado.id, telefono: s.sesion.clienteWhatsapp, ofertas: body.ofertas !== false });
  return c.json({ ok: true });
});

/** El cliente se identifica con nombre y teléfono, como en WhatsApp. */
chatColmadoRoutes.post("/api/chat-colmado/:codigo/sesion", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "Negocio no encontrado" }, 404);
  const body = await cuerpo(c);
  const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 80) : "";
  const pais = colmado.paisId ? (await db.select().from(paises).where(eq(paises.id, colmado.paisId)))[0] : undefined;
  const telefono = telefonoInternacional(typeof body.telefono === "string" ? body.telefono : "", pais?.prefijoCelular ?? "1809");
  if (!nombre) return c.json({ error: "Escribe tu nombre." }, 400);
  if (!telefono) return c.json({ error: "Escribe tu número de teléfono completo." }, 400);
  if (!(await permitirEvento(db, `chat-sesion:${ipDe(c)}`, 30, 60 * MINUTO))) return demasiados(c);

  const aparato = typeof body.aparato === "string" && /^[0-9a-f]{32}$/.test(body.aparato) ? body.aparato : null;

  // Mismo teléfono, mismo aparato y mismo día: se reabre la conversación donde la dejó.
  // Desde otro aparato o en otro día empieza una conversación nueva (el número no está verificado).
  if (aparato) {
    const hoy = inicioDiaLocal(await getColmadoTimezone(db, colmado));
    const [anterior] = await db.select().from(chatWebSesiones)
      .where(and(eq(chatWebSesiones.colmadoId, colmado.id), mismoTelefono(chatWebSesiones.clienteWhatsapp, telefono), eq(chatWebSesiones.aparato, aparato), gte(chatWebSesiones.fechaCreacion, hoy)))
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
    if (!ultimo || new Date(ultimo).getTime() < limite) {
      // Quien está haciendo la transferencia en su banco puede tardar: si su pedido espera el comprobante,
      // el chat aguanta hasta una hora para que pueda volver y enviar la foto.
      let esperaFoto = false;
      if (sesion.pedidoId) {
        const [p] = await db.select({ metodoPago: pedidos.metodoPago, comprobanteUrl: pedidos.comprobanteUrl, comprobanteConfirmado: pedidos.comprobanteConfirmado, estado: pedidos.estado })
          .from(pedidos).where(eq(pedidos.id, sesion.pedidoId));
        esperaFoto = !!p && p.metodoPago === "transferencia" && !p.comprobanteUrl && !p.comprobanteConfirmado && !["entregado", "cancelado", "fusionado", "retorno"].includes(p.estado);
      }
      const limiteFoto = Date.now() - inactividad.esperandoComprobanteMinutos * MINUTO;
      const referencia = Math.max(sesion.fechaUltimaActividad.getTime(), ultimo ? new Date(ultimo).getTime() : 0);
      if (!esperaFoto || referencia < limiteFoto) return "inactiva" as const;
    }
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

/**
 * «Mis pedidos»: los pedidos de este cliente en este colmado, solo los hechos desde este mismo aparato
 * (el teléfono no está verificado: así nadie ve los pedidos de otro escribiendo su número).
 */
chatColmadoRoutes.get("/api/chat-colmado/sesion/:sessionId/pedidos", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const ids = new Set<number>();
  if (s.sesion.pedidoId) ids.add(s.sesion.pedidoId);
  if (s.sesion.aparato) {
    const filas = await db.select({ pedidoId: chatWebSesiones.pedidoId }).from(chatWebSesiones)
      .where(and(eq(chatWebSesiones.colmadoId, s.colmado.id), mismoTelefono(chatWebSesiones.clienteWhatsapp, s.sesion.clienteWhatsapp!), eq(chatWebSesiones.aparato, s.sesion.aparato)))
      .orderBy(desc(chatWebSesiones.id)).limit(60);
    for (const f of filas) if (f.pedidoId) ids.add(f.pedidoId);
  }
  if (!ids.size) return c.json({ pedidos: [] });
  const lista = await db.select().from(pedidos).where(and(eq(pedidos.colmadoId, s.colmado.id), inArray(pedidos.id, [...ids].slice(0, 60))))
    .orderBy(desc(pedidos.id)).limit(20);
  const productosDe = (texto: string) => {
    try {
      const l = JSON.parse(texto);
      if (Array.isArray(l)) return l.slice(0, 30).map((x: any) => ({ nombre: String(x.nombre || x.name || "Producto"), cantidad: Number(x.cantidad) || 1, unidad: x.unidad ?? null, monto: x.monto ?? null }));
    } catch { /* texto libre */ }
    return [{ nombre: String(texto || "Productos").slice(0, 200), cantidad: 1, unidad: null, monto: null }];
  };
  return c.json({
    pedidos: lista.map((p) => ({
      id: p.id, estado: p.estado, total: p.totalConfirmado || p.total, metodoPago: p.metodoPago, tipoEntrega: p.tipoEntrega,
      fecha: p.fechaCreacion, productos: productosDe(p.productos), pagoAprobado: Boolean(p.comprobanteConfirmado),
      motivoRetorno: p.motivoRetorno ?? null, actual: p.id === s.sesion.pedidoId,
    })),
  });
});

/**
 * Mejora 10: dónde va el delivery, solo mientras el pedido de esa sesión está en camino y con una ubicación
 * de los últimos 20 minutos. No da el teléfono ni el apellido del repartidor.
 */
chatColmadoRoutes.get("/api/chat-colmado/sesion/:sessionId/pedidos/:pedidoId/delivery", async (c) => {
  const db = getDb(c.env.DB);
  const s = await sesionValida(c, db);
  if (!s) return c.json({ error: "Sesión no encontrada" }, 404);
  if (s === "inactiva") return inactiva(c);
  const pedidoId = Number(c.req.param("pedidoId"));
  // El pedido tiene que ser de este teléfono en este colmado (igual que «Mis pedidos»).
  const [suyo] = pedidoId === s.sesion.pedidoId ? [{ id: s.sesion.id }] : s.sesion.aparato && s.sesion.clienteWhatsapp
    ? await db.select({ id: chatWebSesiones.id }).from(chatWebSesiones)
      .where(and(eq(chatWebSesiones.colmadoId, s.colmado.id), eq(chatWebSesiones.pedidoId, pedidoId), mismoTelefono(chatWebSesiones.clienteWhatsapp, s.sesion.clienteWhatsapp), eq(chatWebSesiones.aparato, s.sesion.aparato)))
    : [];
  const [p] = suyo ? await db.select().from(pedidos).where(and(eq(pedidos.id, pedidoId), eq(pedidos.colmadoId, s.colmado.id))) : [];
  if (!p) return c.json({ error: "Pedido no encontrado" }, 404);
  if (!["en_camino", "llegando"].includes(p.estado) || !p.deliveryId) return c.json({ visible: false });
  const [d] = await db.select({ nombre: deliveries.nombre, lat: deliveries.ultimaLatitud, lon: deliveries.ultimaLongitud, en: deliveries.ultimaUbicacionAt })
    .from(deliveries).where(eq(deliveries.id, p.deliveryId));
  const reciente = d?.en && Date.now() - new Date(d.en).getTime() < 20 * 60_000 && d.lat != null && d.lon != null;
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return c.json({
    visible: true,
    estado: p.estado,
    delivery: { nombre: String(d?.nombre || "El delivery").split(" ")[0], lat: reciente ? num(d!.lat) : null, lon: reciente ? num(d!.lon) : null, actualizado: reciente ? d!.en : null },
    destino: { lat: num(p.clienteLatitud), lon: num(p.clienteLongitud) },
    colmado: { lat: num(s.colmado.latitud), lon: num(s.colmado.longitud) },
  });
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
        .where(and(eq(chatWebSesiones.colmadoId, s.colmado.id), mismoTelefono(chatWebSesiones.clienteWhatsapp, s.sesion.clienteWhatsapp!), eq(chatWebSesiones.aparato, s.sesion.aparato), ne(chatWebSesiones.id, s.sesion.id)))
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

const EXTENSION_AUDIO: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };

/** Guarda la nota de voz en R2 (audios/<negocio>/…). Solo la oye el personal de ese negocio. */
async function guardarAudio(env: AppEnv["Bindings"], colmadoId: number, tipo: string, base64: string): Promise<string | null> {
  const mime = tipo.toLowerCase().split(";")[0];
  const ext = EXTENSION_AUDIO[mime];
  if (!ext || !env.UPLOADS) return null;
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  if (!bytes.byteLength || bytes.byteLength > 3_200_000) return null;
  const clave = `audios/${colmadoId}/${crypto.randomUUID()}.${ext}`;
  await env.UPLOADS.put(clave, bytes, { httpMetadata: { contentType: mime, cacheControl: "private, no-store" } });
  return `/uploads/${clave}`;
}

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
  let sinCupo = false;
  try {
    if (!(await tieneFuncion(db, s.colmado.id, "ia"))) {
      // El plan del colmado no incluye notas de voz: el colmadero igual la escucha.
      sinCupo = true;
    } else if (iaDisponible(c.env)) {
      // Whisper de Cloudflare (Workers AI): gratis dentro del cupo diario.
      // Los productos del menú de este colmado ayudan a que Whisper oiga bien las marcas.
      const delMenu = await db.select({ nombre: menuProductos.nombre }).from(menuProductos)
        .where(eq(menuProductos.colmadoId, s.colmado.negocioPrincipalId || s.colmado.id)).limit(40).catch(() => []);
      texto = await transcribir(c.env, m[2], delMenu.map((x) => x.nombre).join(", "), db);
    } else if (c.env.OPENAI_API_KEY) {
      // Respaldo si Workers AI no está conectado y hay llave de OpenAI.
      const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
      const archivo = await toFile(bytes, "nota.webm", { type: m[1] });
      const r = await ia.crear(c.env, s.colmado.id).audio.transcriptions.create({ file: archivo, model: "whisper-1", language: "es" });
      texto = (r.text || "").trim();
    }
    await anotarNotaDeVoz(db, s.colmado.id);
  } catch (err) {
    sinCupo = err instanceof CupoAgotado;
    console.error("[chat-colmado] No se pudo transcribir:", err instanceof Error ? err.message : err);
  }
  // El audio original queda para que el colmadero lo escuche al lado de la transcripción.
  const audioUrl = await guardarAudio(c.env, s.colmado.id, m[1], m[2]).catch((err) => {
    console.error("[chat-colmado] No se pudo guardar el audio:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!texto) {
    // Aunque no se entendió, el colmadero la puede escuchar.
    if (audioUrl && s.sesion.conversacionId) {
      await addMensaje(db, s.sesion.conversacionId, "user", "🎤 Nota de voz (no se pudo pasar a texto)", { audioUrl });
      await avisarNegocio(c.env, s.colmado.id, ["conversaciones"]);
    }
    return c.json({ error: sinCupo
      ? "Ahora mismo no puedo escuchar notas de voz 🙏 Escríbeme tu pedido, por favor. El colmado sí puede escuchar la que mandaste."
      : "No pude entender la nota de voz. Intenta de nuevo o escribe tu pedido." }, 422);
  }
  const id = await guardarDelCliente(db, s.sesion.sessionId, `🎤 ${texto}`);
  await atender(c, s, { tipo: "texto", texto, audioUrl: audioUrl ?? undefined, voz: true });
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
  await avisarAlNegocio(c.env, db, s.colmado, { titulo: `📸 Comprobante del pedido #${s.sesion.pedidoId}`, texto: `${s.sesion.clienteNombre || "El cliente"} envió la foto de la transferencia. Revísala antes de despachar.`, url: "/negocio/pedidos", etiqueta: `comprobante-${s.sesion.pedidoId}` }).catch(() => 0);
  return c.json({ ok: true, id });
});
