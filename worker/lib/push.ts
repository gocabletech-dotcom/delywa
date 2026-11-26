import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { buildPushHTTPRequest } from "@pushforge/builder";
import { colmados, ofertas, pushSuscripciones, type Colmado } from "@shared/schema";
import type { Env } from "../env";
import type { Db } from "../db";
import { getConfiguracion, upsertConfiguracion } from "../storage/catalogos";
import { cifrar, descifrar } from "./integraciones";
import { tieneFuncion } from "./plan";
import { mismoTelefono } from "./telefono";

// Notificaciones del navegador (Web Push), gratis: no pasan por WhatsApp ni cuestan por mensaje.
// Las llaves VAPID se crean solas la primera vez y la privada se guarda cifrada con la clave maestra.
// En Android y en computadoras funcionan desde el navegador; en iPhone hay que «Agregar a inicio».

const CLAVE_VAPID = "integracion:vapid";
export const CONTACTO_PUSH = "mailto:soporte@delywa.com";
/** Las pruebas cambian esta función: nunca se llama a Google, Mozilla ni Apple desde una prueba. */
export const pushHttp = { fetch: (url: string, init: RequestInit) => fetch(url, init) };

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desdeB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));

type Llaves = { privada: JsonWebKey; publica: string };
let enMemoria: Llaves | null = null;

export async function llavesVapid(env: Env, db: Db): Promise<Llaves> {
  if (enMemoria) return enMemoria;
  const guardada = await getConfiguracion(db, CLAVE_VAPID);
  if (guardada?.valor) {
    const texto = await descifrar(guardada.valor, env.DELYWA_CLAVE_MAESTRA);
    if (texto) { enMemoria = JSON.parse(texto); return enMemoria!; }
  }
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const privada = await crypto.subtle.exportKey("jwk", par.privateKey) as JsonWebKey;
  const publica = b64url(new Uint8Array([4, ...desdeB64url(privada.x!), ...desdeB64url(privada.y!)]));
  const llaves = { privada, publica };
  await upsertConfiguracion(db, CLAVE_VAPID, await cifrar(JSON.stringify(llaves), env.DELYWA_CLAVE_MAESTRA), "Llaves de las notificaciones del navegador (se crean solas)");
  enMemoria = llaves;
  return llaves;
}
/** Para las pruebas. */
export const olvidarLlavesEnMemoria = () => { enMemoria = null; };

export type AvisoPush = { titulo: string; texto: string; url?: string; etiqueta?: string };
type Sub = typeof pushSuscripciones.$inferSelect;

/** Manda el aviso a cada suscripción; borra las que el navegador ya no acepta (404/410). */
export async function enviarPush(env: Env, db: Db, subs: Sub[], aviso: AvisoPush, opciones: { urgencia?: "normal" | "high"; ttl?: number } = {}): Promise<number> {
  if (!subs.length) return 0;
  let llaves: Llaves;
  try { llaves = await llavesVapid(env, db); } catch (err) {
    console.error("[push] Sin llaves:", err instanceof Error ? err.message : err);
    return 0;
  }
  const payload = { title: aviso.titulo.slice(0, 80), body: aviso.texto.replace(/[*_~]/g, "").slice(0, 200), url: aviso.url ?? "/", tag: aviso.etiqueta ?? "" };
  let enviados = 0;
  const muertas: number[] = [];
  await Promise.all(subs.slice(0, 40).map(async (s) => {
    try {
      const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK: llaves.privada,
        subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message: { payload, adminContact: CONTACTO_PUSH, options: { ttl: opciones.ttl ?? 6 * 3600, urgency: opciones.urgencia ?? "high", ...(aviso.etiqueta ? { topic: aviso.etiqueta.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}) } },
      });
      const r = await pushHttp.fetch(endpoint, { method: "POST", headers, body });
      if (r.status === 404 || r.status === 410) muertas.push(s.id);
      else if (r.ok) enviados++;
    } catch (err) {
      console.error("[push] No se pudo enviar:", err instanceof Error ? err.message : err);
    }
  }));
  if (muertas.length) await db.delete(pushSuscripciones).where(inArray(pushSuscripciones.id, muertas)).catch(() => undefined);
  return enviados;
}

/** Al personal del negocio (y del principal, si es una sucursal: el dueño suele estar ahí). */
export async function avisarAlNegocio(env: Env, db: Db, colmado: Pick<Colmado, "id" | "negocioPrincipalId">, aviso: AvisoPush): Promise<number> {
  const ids = [colmado.id, ...(colmado.negocioPrincipalId ? [colmado.negocioPrincipalId] : [])];
  const subs = await db.select().from(pushSuscripciones).where(and(eq(pushSuscripciones.tipo, "negocio"), inArray(pushSuscripciones.colmadoId, ids))).limit(40);
  return enviarPush(env, db, subs, aviso);
}

/** Al cliente que aceptó avisos en el chat de ese colmado. */
export async function avisarAlCliente(env: Env, db: Db, colmado: Pick<Colmado, "id" | "nombre" | "slug">, telefono: string | null | undefined, texto: string, url?: string): Promise<number> {
  if (!telefono) return 0;
  const subs = await db.select().from(pushSuscripciones)
    .where(and(eq(pushSuscripciones.tipo, "cliente"), eq(pushSuscripciones.colmadoId, colmado.id), mismoTelefono(pushSuscripciones.telefono, telefono))).limit(5);
  return enviarPush(env, db, subs, { titulo: colmado.nombre, texto, url, etiqueta: `pedido-${colmado.id}` });
}

/**
 * Cron: reparte los avisos de ofertas de a 40 por vuelta (el plan gratis de Workers permite 50
 * conexiones por ejecución). Una oferta con 400 clientes tarda unos 50 minutos en llegar a todos.
 */
export async function repartirOfertas(env: Env, db: Db, urlDe: (c: Colmado) => string): Promise<number> {
  const [oferta] = await db.select().from(ofertas).where(and(inArray(ofertas.aviso, ["pendiente", "enviando"]), eq(ofertas.activa, true))).limit(1);
  if (!oferta) return 0;
  if (oferta.hasta.getTime() < Date.now()) { await db.update(ofertas).set({ aviso: "enviado" }).where(eq(ofertas.id, oferta.id)); return 0; }
  const [colmado] = await db.select().from(colmados).where(eq(colmados.id, oferta.colmadoId));
  // Si el plan ya no incluye ofertas, no se reparte.
  if (!(await tieneFuncion(db, oferta.colmadoId, "ofertas"))) { await db.update(ofertas).set({ aviso: "enviado" }).where(eq(ofertas.id, oferta.id)); return 0; }
  const subs = await db.select().from(pushSuscripciones)
    .where(and(eq(pushSuscripciones.tipo, "cliente"), eq(pushSuscripciones.colmadoId, oferta.colmadoId), eq(pushSuscripciones.ofertas, true), gt(pushSuscripciones.id, oferta.avisoCursor)))
    .orderBy(pushSuscripciones.id).limit(40);
  const enviados = colmado ? await enviarPush(env, db, subs, { titulo: `🔥 ${colmado.nombre}`, texto: oferta.texto, url: urlDe(colmado), etiqueta: `oferta-${oferta.id}` }, { urgencia: "normal", ttl: 12 * 3600 }) : 0;
  const ultimo = subs.at(-1)?.id ?? oferta.avisoCursor;
  await db.update(ofertas).set({ aviso: subs.length < 40 ? "enviado" : "enviando", avisoCursor: ultimo, avisados: sql`${ofertas.avisados} + ${enviados}` }).where(eq(ofertas.id, oferta.id));
  return enviados;
}

/** Pedido nuevo (chat, WhatsApp o menú): aviso con sonido al personal del negocio. */
export async function avisarPedidoNuevo(env: Env, db: Db, pedido: { id: number; colmadoId: number; clienteNombre: string; productos: string; origen?: string | null }) {
  if (pedido.origen === "mostrador") return 0;
  try {
    const [colmado] = await db.select().from(colmados).where(eq(colmados.id, pedido.colmadoId));
    if (!colmado) return 0;
    let n = 0;
    try { const l = JSON.parse(pedido.productos); n = Array.isArray(l) ? l.length : 0; } catch { /* texto */ }
    return await avisarAlNegocio(env, db, colmado, {
      titulo: `🛒 Pedido nuevo #${pedido.id}`,
      texto: `${pedido.clienteNombre || "Cliente"}${n ? ` · ${n} producto${n === 1 ? "" : "s"}` : ""} · ${colmado.nombre}. Toca para confirmarlo.`,
      url: "/negocio/pedidos", etiqueta: `pedido-nuevo-${pedido.id}`,
    });
  } catch (err) {
    console.error("[push] Aviso de pedido nuevo:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Al repartidor (portal de delivery): pedido asignado, pago listo, pago hecho. */
export async function avisarAlRepartidor(env: Env, db: Db, deliveryId: number, aviso: AvisoPush): Promise<number> {
  const subs = await db.select().from(pushSuscripciones).where(and(eq(pushSuscripciones.tipo, "delivery"), eq(pushSuscripciones.userId, `delivery:${deliveryId}`))).limit(5);
  return enviarPush(env, db, subs, aviso).catch(() => 0);
}
