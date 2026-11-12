import { Hono, type Context } from "hono";
import { eq, inArray, sql } from "drizzle-orm";
import {
  chatWebMensajes, chatWebSesiones, metaWebhookEventos, solicitudesEliminacion, whatsappConversaciones, whatsappMensajes,
  type Colmado,
} from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth } from "../lib/auth";
import { timingSafeEqual } from "../lib/password";
import { urlPublica } from "../lib/mensajeria";
import { soloDigitos } from "../lib/telefono";
import {
  credencialesEvolution, evolution, firmaWebhookEvolution, graphUrl, http, instanciaValida, urlEvolutionValida,
} from "../lib/whatsapp";
import { getColmado, isOwnerOfColmado, updateColmado, updateColmadoWhatsappConfig } from "../storage/colmados";

// Conexión de WhatsApp de cada negocio: Meta (registro integrado) y Evolution API.
export const whatsappRoutes = new Hono<AppEnv>();

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

/**
 * Conectar o cambiar el WhatsApp de un negocio es solo del dueño o de la plataforma.
 * En el original cualquier usuario con sesión podía cambiar la conexión de Evolution de cualquier negocio.
 */
async function negocioConfigurable(c: Context<AppEnv>, id: number): Promise<{ colmado: Colmado; db: Db } | { error: Response }> {
  const db = getDb(c.env.DB);
  const colmado = Number.isInteger(id) ? await getColmado(db, id) : undefined;
  if (!colmado) return { error: c.json({ error: "Negocio no encontrado" }, 404) };
  const user = c.var.user;
  if (!(user.role === "platform_admin" || (user.role === "colmado_owner" && (await isOwnerOfColmado(db, user.id, id))))) {
    return { error: c.json({ error: "No tienes permiso para configurar el WhatsApp de este negocio" }, 403) };
  }
  return { colmado, db };
}

// ---------- Meta: registro integrado ----------

// Público: el identificador de la app y el de configuración no son secretos; los usa el botón de Facebook.
whatsappRoutes.get("/api/meta/config", (c) => {
  const { META_APP_ID: appId, META_CONFIG_ID: configId } = c.env;
  return c.json(appId && configId ? { configured: true, appId, configId } : { configured: false });
});

whatsappRoutes.post("/api/whatsapp/oauth/callback", requireAuth, async (c) => {
  const body = await cuerpo(c);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code || !body.colmadoId) return c.json({ error: "Código y colmadoId requeridos" }, 400);
  const r = await negocioConfigurable(c, Number(body.colmadoId));
  if ("error" in r) return r.error;
  const { META_APP_ID: appId, META_APP_SECRET: appSecret } = c.env;
  if (!appId || !appSecret) return c.json({ error: "Meta App no configurado en el servidor" }, 500);

  // El secreto de la app va en el cuerpo de la petición, no en la dirección (el original lo ponía en la URL).
  const tokenRes = await http.fetch(graphUrl("oauth/access_token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appId, client_secret: appSecret, code }).toString(),
  }).catch(() => null);
  const token = (await tokenRes?.json().catch(() => null)) as any;
  if (!tokenRes?.ok || !token?.access_token) {
    console.error(`[whatsapp] Intercambio de código de Meta falló: HTTP ${tokenRes?.status ?? "sin respuesta"}`);
    return c.json({ error: token?.error?.message || "Error al obtener token" }, 400);
  }
  const accessToken = String(token.access_token);

  let phoneNumberId = typeof body.phoneNumberId === "string" && /^\d{5,30}$/.test(body.phoneNumberId) ? body.phoneNumberId : "";
  const wabaId = typeof body.wabaId === "string" && /^\d{5,30}$/.test(body.wabaId) ? body.wabaId : "";
  if (!phoneNumberId && wabaId) {
    const res = await http.fetch(graphUrl(`${wabaId}/phone_numbers`), { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null);
    const telefonos = (await res?.json().catch(() => null)) as any;
    phoneNumberId = telefonos?.data?.[0]?.id ? String(telefonos.data[0].id) : "";
  }
  if (!phoneNumberId) return c.json({ error: "No se pudo obtener el Phone Number ID" }, 400);

  await updateColmadoWhatsappConfig(r.db, r.colmado.id, phoneNumberId, accessToken);
  return c.json({ success: true, phoneNumberId, message: "WhatsApp conectado exitosamente" });
});

// Verificación del webhook de Meta. Sin token configurado no se verifica (el original aceptaba uno fijo de demostración).
whatsappRoutes.get("/api/webhook/whatsapp", (c) => {
  const esperado = c.env.WHATSAPP_VERIFY_TOKEN;
  const recibido = c.req.query("hub.verify_token") ?? "";
  if (esperado && c.req.query("hub.mode") === "subscribe" && timingSafeEqual(new TextEncoder().encode(recibido), new TextEncoder().encode(esperado))) {
    return c.text(c.req.query("hub.challenge") ?? "", 200);
  }
  return c.body(null, 403);
});

// ---------- Meta: eliminación de datos ----------

function base64UrlABytes(texto: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(texto)) return null;
  try {
    return Uint8Array.from(atob(texto.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
  } catch { return null; }
}

/** Valida el signed_request de Meta (HMAC-SHA256 con el secreto de la app) y devuelve el usuario. */
export async function verificarSignedRequest(signedRequest: unknown, appSecret: string | undefined): Promise<{ userId: string } | null> {
  if (!appSecret || typeof signedRequest !== "string") return null;
  const partes = signedRequest.split(".");
  if (partes.length !== 2) return null;
  const firma = base64UrlABytes(partes[0]);
  const datos = base64UrlABytes(partes[1]);
  if (!firma || !datos) return null;
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("HMAC", clave, firma, new TextEncoder().encode(partes[1])))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(datos));
    return typeof payload?.user_id === "string" && payload.user_id.trim() ? { userId: payload.user_id.trim() } : null;
  } catch { return null; }
}

/** Borra conversaciones, mensajes y chats web de ese número en un solo batch. */
async function borrarDatosDeWhatsapp(db: Db, numero: string): Promise<{ conversaciones: number; mensajes: number }> {
  const digitos = soloDigitos(numero);
  if (digitos.length < 7) return { conversaciones: 0, mensajes: 0 };
  const coincide = (columna: any) => sql`replace(replace(replace(replace(${columna}, '+', ''), '-', ''), ' ', ''), '.', '') = ${digitos}`;
  const convs = (await db.select({ id: whatsappConversaciones.id }).from(whatsappConversaciones).where(coincide(whatsappConversaciones.clienteWhatsapp))).map((x) => x.id).slice(0, 90);
  const sesiones = await db.select({ sessionId: chatWebSesiones.sessionId }).from(chatWebSesiones)
    .where(convs.length ? sql`${coincide(chatWebSesiones.clienteWhatsapp)} or ${inArray(chatWebSesiones.conversacionId, convs)}` : coincide(chatWebSesiones.clienteWhatsapp));
  const ids = sesiones.map((s) => s.sessionId).slice(0, 90);
  const [{ n }] = convs.length
    ? await db.select({ n: sql<number>`count(*)` }).from(whatsappMensajes).where(inArray(whatsappMensajes.conversacionId, convs))
    : [{ n: 0 }];
  const sentencias = [
    ...(ids.length ? [db.delete(chatWebMensajes).where(inArray(chatWebMensajes.sessionId, ids)), db.delete(chatWebSesiones).where(inArray(chatWebSesiones.sessionId, ids))] : []),
    ...(convs.length ? [db.delete(whatsappMensajes).where(inArray(whatsappMensajes.conversacionId, convs)), db.delete(whatsappConversaciones).where(inArray(whatsappConversaciones.id, convs))] : []),
  ];
  if (sentencias.length) await db.batch(sentencias as any);
  return { conversaciones: convs.length, mensajes: Number(n) };
}

whatsappRoutes.post("/api/webhook/data-deletion", async (c) => {
  const db = getDb(c.env.DB);
  // Meta lo envía como formulario; también se acepta JSON.
  const tipo = c.req.header("Content-Type") ?? "";
  const signedRequest = tipo.includes("json") ? (await cuerpo(c)).signed_request : (await c.req.parseBody().catch(() => ({} as Record<string, unknown>))).signed_request;
  if (!signedRequest) return c.json({ error: "Missing signed_request" }, 400);
  const firmado = await verificarSignedRequest(signedRequest, c.env.META_APP_SECRET?.trim());
  if (!firmado) return c.json({ error: "Invalid signed_request" }, 400);

  // Meta puede reenviar la misma petición: solo se procesa una vez.
  const huella = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(signedRequest))))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const nuevo = await db.insert(metaWebhookEventos).values({ eventId: `data-deletion:${huella}` }).onConflictDoNothing().returning();
  if (!nuevo.length) return c.json({ success: true, duplicate: true });

  const confirmationCode = `del_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.insert(solicitudesEliminacion).values({ confirmationCode, userId: firmado.userId, estado: "pending" });
  const datosEliminados = await borrarDatosDeWhatsapp(db, firmado.userId);
  await db.update(solicitudesEliminacion).set({ estado: "completed", datosEliminados, fechaCompletado: new Date() })
    .where(eq(solicitudesEliminacion.confirmationCode, confirmationCode));
  return c.json({ url: `${urlPublica(c.env, new URL(c.req.url).origin)}/deletion-status/${confirmationCode}`, confirmation_code: confirmationCode });
});

whatsappRoutes.get("/api/deletion-status/:confirmationCode", async (c) => {
  const [s] = await getDb(c.env.DB).select().from(solicitudesEliminacion).where(eq(solicitudesEliminacion.confirmationCode, c.req.param("confirmationCode")));
  if (!s) return c.json({ error: "Deletion request not found" }, 404);
  return c.json({ confirmation_code: s.confirmationCode, status: s.estado, requested_at: s.fechaSolicitud, completed_at: s.fechaCompletado, data_deleted: s.datosEliminados });
});

// ---------- Evolution API ----------

whatsappRoutes.post("/api/colmados/:id/evolution-config", requireAuth, async (c) => {
  const r = await negocioConfigurable(c, Number(c.req.param("id")));
  if ("error" in r) return r.error;
  const body = await cuerpo(c);
  const url = urlEvolutionValida(body.evolutionApiUrl);
  if (!url) return c.json({ error: "La dirección de Evolution API debe ser pública y empezar con https://" }, 400);
  if (!instanciaValida(body.evolutionInstanceName)) return c.json({ error: "Nombre de instancia inválido (letras, números, guion, punto o guion bajo)" }, 400);
  // Si no se envía la llave se conserva la guardada: el panel nunca la recibe de vuelta.
  const apiKey = typeof body.evolutionApiKey === "string" && body.evolutionApiKey.trim() ? body.evolutionApiKey.trim().slice(0, 300) : r.colmado.evolutionApiKey;
  if (!apiKey) return c.json({ error: "Se requiere la llave de Evolution API" }, 400);
  await updateColmado(r.db, r.colmado.id, { evolutionApiUrl: url, evolutionApiKey: apiKey, evolutionInstanceName: body.evolutionInstanceName, whatsappProvider: "evolution" });
  return c.json({ success: true });
});

async function conEvolution(c: Context<AppEnv>) {
  const r = await negocioConfigurable(c, Number(c.req.param("id")));
  if ("error" in r) return r;
  const credenciales = credencialesEvolution(r.colmado);
  if (!credenciales) return { error: c.json({ error: "Evolution API not configured" }, 400) };
  return { ...r, credenciales };
}

whatsappRoutes.post("/api/colmados/:id/evolution-test", requireAuth, async (c) => {
  const r = await conEvolution(c);
  if ("error" in r) return r.error;
  const res = await evolution(r.credenciales, "GET", "instance/connectionState");
  if (!res.ok) return c.json({ connected: false, error: res.status ? `Evolution respondió HTTP ${res.status}` : "Evolution no respondió" });
  const estado = res.data?.state ?? res.data?.instance?.state;
  return c.json({ connected: estado === "open", data: { state: estado ?? null } });
});

whatsappRoutes.get("/api/colmados/:id/evolution-qr", requireAuth, async (c) => {
  const r = await conEvolution(c);
  if ("error" in r) return r.error;
  const res = await evolution(r.credenciales, "GET", "instance/connect");
  if (!res.ok || !res.data) return c.json({ error: "Could not get QR code" }, 502);
  return c.json(res.data);
});

whatsappRoutes.post("/api/colmados/:id/evolution-logout", requireAuth, async (c) => {
  const r = await conEvolution(c);
  if ("error" in r) return r.error;
  const res = await evolution(r.credenciales, "DELETE", "instance/logout");
  if (!res.ok) return c.json({ error: "No se pudo cerrar la sesión en Evolution" }, 502);
  return c.json({ success: true, data: res.data });
});

whatsappRoutes.post("/api/colmados/:id/evolution-webhook", requireAuth, async (c) => {
  const r = await conEvolution(c);
  if ("error" in r) return r.error;
  const base = urlPublica(c.env, new URL(c.req.url).origin);
  // La firma en la dirección permite aceptar solo los avisos de la instancia de este negocio.
  const webhookUrl = `${base}/api/webhook/evolution/${encodeURIComponent(r.credenciales.instancia)}?firma=${await firmaWebhookEvolution(r.credenciales)}`;
  const res = await evolution(r.credenciales, "POST", "webhook/set", { url: webhookUrl, webhook_by_events: false, webhook_base64: false, events: ["MESSAGES_UPSERT"] });
  if (!res.ok) return c.json({ error: "Evolution no aceptó el webhook" }, 502);
  return c.json({ success: true, webhookUrl, data: res.data });
});
