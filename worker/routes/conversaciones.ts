import { Hono, type Context } from "hono";
import type { WhatsappConversacion } from "@shared/schema";
import { stripInternalAddressContext } from "@shared/visible-message";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES, puedeOperar } from "../lib/permisos";
import { enlaceWhatsApp, enviarWhatsApp, whatsappDisponible } from "../lib/mensajeria";
import { canalDelNegocio, enviarAudioMeta } from "../lib/whatsapp";
import { getColmado } from "../storage/colmados";
import { getProductosRestringidos } from "../storage/menu";
import {
  addChatWebMensaje, addMensaje, contarNoLeidas, deleteConversacion, getAnalyticsMensajes, getChatWebSessionByConversacionId,
  getConversacionById, getConversaciones, getMensajes, getUltimoMensajeCliente, marcarConversacionLeida, updateConversacion,
} from "../storage/conversaciones";
import { and, desc, eq, sql } from "drizzle-orm";
import { chatWebMensajes, zipAlertaEventos } from "@shared/schema";

export const conversacionRoutes = new Hono<AppEnv>();

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

/** Carga la conversación y exige que el usuario opere su sucursal. */
async function conversacionOperable(c: Context<AppEnv>, roles?: string[]): Promise<{ conversacion: WhatsappConversacion } | { error: Response }> {
  const db = getDb(c.env.DB);
  const conversacion = await getConversacionById(db, Number(c.req.param("id")));
  if (!conversacion) return { error: c.json({ error: "Conversación no encontrada" }, 404) };
  if (!(await puedeOperar(db, c.var.user, conversacion.colmadoId, roles))) {
    return { error: c.json({ error: "No tienes permiso para operar esta sucursal" }, 403) };
  }
  return { conversacion };
}

// ---------- Lista y lectura ----------

conversacionRoutes.get("/api/colmados/:id/conversaciones", requireAuth, requireBusinessAccess(), async (c) => {
  return c.json(await getConversaciones(getDb(c.env.DB), Number(c.req.param("id")), c.req.query("estado") || undefined));
});

conversacionRoutes.get("/api/colmados/:id/conversaciones/unread", requireAuth, requireBusinessAccess(), async (c) => {
  return c.json({ count: await contarNoLeidas(getDb(c.env.DB), Number(c.req.param("id"))) });
});

conversacionRoutes.get("/api/conversaciones/:id/mensajes", requireAuth, async (c) => {
  const r = await conversacionOperable(c);
  if ("error" in r) return r.error;
  const limite = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "", 10) || 50));
  const mensajes = await getMensajes(getDb(c.env.DB), r.conversacion.id, limite);
  // Los pedidos viejos del menú guardaron instrucciones internas para la IA junto al mensaje: no se muestran.
  return c.json(mensajes.map((m) => ({ ...m, contenido: stripInternalAddressContext(m.contenido) })));
});

conversacionRoutes.patch("/api/conversaciones/:id/read", requireAuth, async (c) => {
  const r = await conversacionOperable(c);
  if ("error" in r) return r.error;
  await marcarConversacionLeida(getDb(c.env.DB), r.conversacion.id);
  return c.json({ success: true });
});

conversacionRoutes.patch("/api/conversaciones/:id", requireAuth, async (c) => {
  const r = await conversacionOperable(c);
  if ("error" in r) return r.error;
  const db = getDb(c.env.DB);
  const { clienteNombre, direccionTexto } = await cuerpo(c);
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  await updateConversacion(db, r.conversacion.id, { clienteNombre: texto(clienteNombre, 120), direccionTexto: texto(direccionTexto, 500) });
  return c.json(await getConversacionById(db, r.conversacion.id));
});

/** Borrar historial es de administradores del negocio (el original lo permitía a cualquier operador). */
conversacionRoutes.delete("/api/conversaciones/:id", requireAuth, async (c) => {
  const r = await conversacionOperable(c, ADMINISTRADORES);
  if ("error" in r) return r.error;
  await deleteConversacion(getDb(c.env.DB), r.conversacion);
  return c.json({ success: true, message: "Conversación eliminada" });
});

// ---------- Enviar mensaje ----------

const PATRONES_CUENTA = [
  /cuenta[:\s]*[\d\-]{8,}/i, /cta[:\s]*[\d\-]{8,}/i, /n[uú]mero de cuenta[:\s]*[\d\-]+/i,
  /transferir a[:\s]*[\d\-]{10,}/i, /banco[:\s]*[\w\s]+[:\s]*[\d\-]{10,}/i,
];

/** Política de WhatsApp: no enviar números de cuenta bancaria. Un teléfono no cuenta. */
export function pareceCuentaBancaria(texto: string): boolean {
  if (PATRONES_CUENTA.some((p) => p.test(texto))) return true;
  if (!/\b\d{10,20}\b/.test(texto)) return false;
  return !/\b(\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/.test(texto);
}

conversacionRoutes.post("/api/conversaciones/:id/send", requireAuth, async (c) => {
  const r = await conversacionOperable(c);
  if ("error" in r) return r.error;
  const db = getDb(c.env.DB);
  const { message } = await cuerpo(c);
  if (typeof message !== "string" || !message.trim()) return c.json({ error: "Mensaje requerido" }, 400);
  if (message.length > 4000) return c.json({ error: "El mensaje es demasiado largo" }, 400);

  if (pareceCuentaBancaria(message)) {
    return c.json({
      error: "⚠️ No se pueden enviar números de cuenta bancaria por WhatsApp. Por favor, contacta al cliente por llamada para darle los datos de pago.",
      policyViolation: "bank_account",
    }, 400);
  }
  const minusculas = message.toLowerCase();
  const tabaco = (await getProductosRestringidos(db)).some((p) => p.activo && p.categoria === "tabaco" && minusculas.includes(p.palabraClave.toLowerCase()));
  if (tabaco) {
    return c.json({ error: "⚠️ No se puede promocionar productos de tabaco por WhatsApp según las políticas de Meta.", policyViolation: "tobacco" }, 400);
  }

  const conversacion = r.conversacion;
  const colmado = await getColmado(db, conversacion.colmadoId);
  if (!colmado) return c.json({ error: "Colmado no encontrado" }, 404);
  const chatWeb = await getChatWebSessionByConversacionId(db, conversacion.id);
  const hayWhatsApp = whatsappDisponible(c.env, colmado);

  // Sin WhatsApp integrado (capa 4) y sin chat web no hay por dónde entregar: no se guarda como enviado.
  if (!hayWhatsApp && !chatWeb) {
    return c.json({
      error: "WhatsApp aún no está conectado para este negocio. Abre WhatsApp para enviar el mensaje a mano.",
      reason: "sin_canal", necesitaEnvioManual: true, whatsappNumero: conversacion.clienteWhatsapp,
      mensajeParaEnviar: message, enlaceWhatsApp: enlaceWhatsApp(conversacion.clienteWhatsapp, message),
    }, 409);
  }

  // Ventana de 24 horas de Meta: solo aplica si la respuesta sale por la API de Meta.
  if (hayWhatsApp && colmado.whatsappProvider !== "evolution" && !chatWeb) {
    const ultimo = await getUltimoMensajeCliente(db, conversacion.id);
    if (!ultimo) {
      return c.json({
        error: "⚠️ No hay mensajes del cliente en esta conversación. Según las políticas de Meta, solo puedes responder después de que el cliente te escriba.",
        policyViolation: "no_customer_message",
      }, 400);
    }
    const horas = (Date.now() - ultimo.fechaEnvio.getTime()) / 3_600_000;
    if (horas > 24) {
      return c.json({
        error: "⚠️ Han pasado más de 24 horas desde el último mensaje del cliente. Según las políticas de Meta, solo puedes responder dentro de 24 horas. Usa el Chat Web o espera a que el cliente te escriba nuevamente.",
        policyViolation: "24h_window", horasTranscurridas: Math.round(horas),
      }, 400);
    }
  }

  const whatsappEnviado = hayWhatsApp ? await enviarWhatsApp(c.env, colmado, conversacion.clienteWhatsapp, message) : false;
  if (!whatsappEnviado && !chatWeb) return c.json({ error: "No se pudo enviar el mensaje por WhatsApp", reason: "envio_fallido" }, 502);
  // El mensaje del chat web también queda en la conversación.
  if (chatWeb) await addChatWebMensaje(db, chatWeb.sessionId, "assistant", message);
  else await addMensaje(db, conversacion.id, "negocio", message);
  return c.json({ success: true, whatsappEnviado, chatWeb: !!chatWeb });
});

// ---------- Nota de voz ----------

const MAX_AUDIO = 16 * 1024 * 1024;

conversacionRoutes.post("/api/conversaciones/:id/send-voice", requireAuth, async (c) => {
  const r = await conversacionOperable(c);
  if ("error" in r) return r.error;
  const db = getDb(c.env.DB);
  const conversacion = r.conversacion;
  if (Number(c.req.header("Content-Length") || 0) > MAX_AUDIO + 64 * 1024) return c.json({ error: "La nota de voz es demasiado grande (máximo 16 MB)" }, 413);
  const form = await c.req.formData().catch(() => null);
  const archivo = form?.get("audio");
  if (!archivo || typeof archivo === "string") return c.json({ error: "Archivo de audio requerido" }, 400);
  const blob = archivo as unknown as Blob;
  if (!blob.type.startsWith("audio/")) return c.json({ error: "Solo se permiten archivos de audio" }, 400);
  if (blob.size > MAX_AUDIO) return c.json({ error: "La nota de voz es demasiado grande (máximo 16 MB)" }, 413);

  // Ventana de 24 horas de Meta.
  const ultimo = await getUltimoMensajeCliente(db, conversacion.id);
  if (!ultimo) {
    return c.json({ error: "⚠️ No hay mensajes del cliente en esta conversación. Según las políticas de Meta, solo puedes responder después de que el cliente te escriba.", policyViolation: "no_customer_message" }, 400);
  }
  const horas = (Date.now() - ultimo.fechaEnvio.getTime()) / 3_600_000;
  if (horas > 24) {
    return c.json({ error: "⚠️ Han pasado más de 24 horas desde el último mensaje del cliente. Según las políticas de Meta, solo puedes responder dentro de 24 horas.", policyViolation: "24h_window", horasTranscurridas: Math.round(horas) }, 400);
  }
  const colmado = await getColmado(db, conversacion.colmadoId);
  if (!colmado) return c.json({ error: "Colmado no encontrado" }, 404);
  // Como en el original, las notas de voz solo salen por Meta; además se exige que la plataforma lo haya habilitado.
  const canal = canalDelNegocio(c.env, colmado);
  if (canal?.tipo !== "meta") return c.json({ error: "Las notas de voz solo se pueden enviar con WhatsApp de Meta conectado" }, 400);
  if (!(await enviarAudioMeta(canal.meta, conversacion.clienteWhatsapp, await blob.arrayBuffer(), blob.type))) {
    return c.json({ error: "Error al enviar nota de voz" }, 502);
  }
  await addMensaje(db, conversacion.id, "negocio", "[Nota de voz enviada]");
  // En el chat web solo queda constancia; no se duplica en la conversación.
  const chatWeb = await getChatWebSessionByConversacionId(db, conversacion.id);
  if (chatWeb) await db.insert(chatWebMensajes).values({ sessionId: chatWeb.sessionId, rol: "assistant", contenido: "[Nota de voz enviada]" });
  return c.json({ success: true });
});

// ---------- Analytics ----------

function fecha(valor: string | undefined): Date | undefined {
  if (!valor) return undefined;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// El original devolvía estas cifras a cualquier usuario con sesión, de cualquier negocio.
conversacionRoutes.get("/api/colmados/:colmadoId/analytics/mensajes", requireAuth, requireBusinessAccess("colmadoId"), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("colmadoId"));
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
  return c.json(await getAnalyticsMensajes(db, colmadoId, fecha(c.req.query("desde")), fecha(c.req.query("hasta"))));
});

conversacionRoutes.get("/api/colmados/:colmadoId/analytics/zip-alertas", requireAuth, requireBusinessAccess("colmadoId"), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("colmadoId"));
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "No tienes permiso para ver alertas de este negocio" }, 403);
  const pedido = parseInt(c.req.query("dias") || "7", 10);
  const dias = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, 365) : 7;
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(zipAlertaEventos).where(and(
    eq(zipAlertaEventos.colmadoId, colmadoId), sql`${zipAlertaEventos.fechaCreacion} > ${Date.now() - dias * 24 * 3_600_000}`,
  ));
  return c.json({ count: Number(row?.n || 0), dias });
});

conversacionRoutes.get("/api/colmados/:colmadoId/analytics/zip-alertas/detalle", requireAuth, requireBusinessAccess("colmadoId"), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("colmadoId"));
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "No tienes permiso para ver alertas de este negocio" }, 403);
  const l = parseInt(c.req.query("limit") || "20", 10);
  const o = parseInt(c.req.query("offset") || "0", 10);
  const limit = Number.isInteger(l) ? Math.min(Math.max(l, 1), 50) : 20;
  const offset = Number.isInteger(o) ? Math.max(o, 0) : 0;
  // Se pide una fila de más para saber si hay otra página sin un segundo conteo.
  const filas = await db.select().from(zipAlertaEventos).where(and(
    eq(zipAlertaEventos.colmadoId, colmadoId), sql`${zipAlertaEventos.fechaCreacion} > ${Date.now() - 30 * 24 * 3_600_000}`,
  )).orderBy(desc(zipAlertaEventos.fechaCreacion), desc(zipAlertaEventos.id)).limit(limit + 1).offset(offset);
  return c.json({ eventos: filas.slice(0, limit), limit, offset, hasMore: filas.length > limit, dias: 30 });
});
