import { Hono, type Context } from "hono";
import { metaWebhookEventos } from "@shared/schema";
import type { AppEnv, Env } from "../env";
import { getDb } from "../db";
import { urlPublica } from "../lib/mensajeria";
import { getColmadoPorInstancia } from "../storage/colmados";
import { timingSafeEqual } from "../lib/password";
import { credencialesEvolution, firmaWebhookEvolution, instanciaValida } from "../lib/whatsapp";
import { ejecutar, type AppLike } from "../chat/adaptador";
import { registrarWebhooks } from "../chat/motor-whatsapp";

// Mensajes entrantes de WhatsApp (Meta y Evolution).
//
// El webhook solo comprueba que el aviso es legítimo, lo deja en la cola y
// responde enseguida; el bot (worker/chat/motor-whatsapp.ts, código del
// servidor original) lo atiende desde la cola. El original respondía a Meta
// después de pensar y de esperar 8 a 12 segundos por mensaje, con lo que Meta
// podía dar el aviso por perdido y reenviarlo.
export const webhookRoutes = new Hono<AppEnv>();

export type AvisoWebhook =
  | { tipo: "meta"; body: unknown }
  | { tipo: "evolution"; instancia: string; body: unknown };

const manejadores = new Map<string, (req: any, res: any) => any>();
const registro: AppLike = {
  get: (ruta: string, ...h: unknown[]) => void manejadores.set(`GET ${ruta}`, h.at(-1) as any),
  post: (ruta: string, ...h: unknown[]) => void manejadores.set(`POST ${ruta}`, h.at(-1) as any),
};
registrarWebhooks(registro);

/** Las pruebas ponen la pausa en cero. */
export const pausas = { enCola: [8000, 12000] as [number, number], sinCola: [500, 1500] as [number, number] };

/** Atiende un aviso con el bot. Lo llaman la cola y, si no hay cola, el propio webhook. */
export async function procesarAviso(env: Env, aviso: AvisoWebhook, demoraMs: [number, number] = pausas.enCola): Promise<void> {
  const base = { env, db: getDb(env.DB), origen: urlPublica(env), demoraMs };
  if (aviso.tipo === "meta") await ejecutar(base, manejadores, "POST /api/webhook/whatsapp", { body: aviso.body });
  else await ejecutar(base, manejadores, "POST /api/webhook/evolution/:instanceName", { body: aviso.body, params: { instanceName: aviso.instancia } });
}

const LIMITE_COLA_BYTES = 100_000; // un mensaje de Queues admite hasta 128 KB

async function despachar(c: Context<AppEnv>, aviso: AvisoWebhook, bytes: number): Promise<void> {
  if (c.env.COLA_WEBHOOKS && bytes <= LIMITE_COLA_BYTES) {
    await c.env.COLA_WEBHOOKS.send(aviso);
    return;
  }
  // Sin cola (desarrollo o pruebas): se atiende después de responder, con una pausa corta.
  const tarea = procesarAviso(c.env, aviso, pausas.sinCola).catch((err) => console.error("[webhook] Error al atender el aviso:", err instanceof Error ? err.message : err));
  let ctx: { waitUntil(tarea: Promise<unknown>): void } | undefined;
  try { ctx = c.executionCtx; } catch { ctx = undefined; }
  if (ctx) ctx.waitUntil(tarea);
  else await tarea;
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const iguales = (a: string, b: string) => timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));

/** Firma de Meta: HMAC-SHA256 del cuerpo exacto recibido, con el secreto de la app. */
export async function firmaMetaValida(cuerpo: string, firma: string | undefined, appSecret: string | undefined): Promise<boolean> {
  if (!appSecret || !firma || !/^sha256=[a-f0-9]{64}$/i.test(firma)) return false;
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperada = `sha256=${hex(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo)))}`;
  return iguales(esperada, firma.toLowerCase());
}

// ---------- Meta ----------

webhookRoutes.post("/api/webhook/whatsapp", async (c) => {
  const crudo = await c.req.text();
  if (crudo.length > 1_000_000) return c.body(null, 413);
  if (!(await firmaMetaValida(crudo, c.req.header("x-hub-signature-256"), c.env.META_APP_SECRET?.trim()))) return c.body(null, 403);
  let body: any;
  try { body = JSON.parse(crudo); } catch { return c.body(null, 200); }
  // Solo los avisos con mensajes llevan trabajo; los de estado (entregado, leído) se descartan aquí.
  const traeMensajes = body?.object === "whatsapp_business_account" && Array.isArray(body.entry)
    && body.entry.some((e: any) => Array.isArray(e?.changes) && e.changes.some((ch: any) => ch?.field === "messages" && Array.isArray(ch?.value?.messages) && ch.value.messages.length));
  if (traeMensajes) await despachar(c, { tipo: "meta", body }, crudo.length);
  return c.body(null, 200);
});

// ---------- Evolution ----------

webhookRoutes.post("/api/webhook/evolution/:instanceName", async (c) => {
  const instancia = c.req.param("instanceName");
  if (!instanciaValida(instancia)) return c.body(null, 404);
  const db = getDb(c.env.DB);
  const colmado = await getColmadoPorInstancia(db, instancia);
  const credenciales = colmado ? credencialesEvolution(colmado) : null;
  if (!credenciales) return c.body(null, 404);
  // El original aceptaba cualquier aviso: quien conociera el nombre de la instancia podía hacerse pasar por un cliente.
  if (!iguales(c.req.query("firma") ?? "", await firmaWebhookEvolution(credenciales))) return c.body(null, 403);

  const crudo = await c.req.text();
  if (crudo.length > 1_000_000) return c.body(null, 413);
  let body: any;
  try { body = JSON.parse(crudo); } catch { return c.body(null, 200); }
  const data = body?.data;
  if (body?.event !== "messages.upsert" || !data || data.key?.fromMe) return c.body(null, 200);
  // Evolution puede repetir un aviso: cada mensaje se atiende una sola vez.
  const idMensaje = typeof data.key?.id === "string" ? data.key.id.slice(0, 120) : "";
  if (idMensaje) {
    const nuevo = await db.insert(metaWebhookEventos).values({ eventId: `evolution:${instancia}:${idMensaje}` }).onConflictDoNothing().returning();
    if (!nuevo.length) return c.body(null, 200);
  }
  await despachar(c, { tipo: "evolution", instancia, body }, crudo.length);
  return c.body(null, 200);
});
