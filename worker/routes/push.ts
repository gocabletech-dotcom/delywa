import { Hono } from "hono";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { ofertas, pushSuscripciones } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { canUserAccessColmado } from "../storage/users";
import { ADMINISTRADORES, OPERADORES, nombreUsuario } from "../lib/permisos";
import { enviarPush, llavesVapid } from "../lib/push";
import { getColmado, getColmadoTimezone } from "../storage/colmados";
import { inicioDiaLocal } from "../lib/fechas";

// Notificaciones del navegador (mejora 6) y ofertas (mejora 12). Todo gratis: Web Push, sin WhatsApp.

export const pushRoutes = new Hono<AppEnv>();

/** Suscripción que manda el navegador (PushSubscription.toJSON()). */
export function leerSuscripcion(v: any): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = typeof v?.endpoint === "string" ? v.endpoint : "";
  const p256dh = typeof v?.keys?.p256dh === "string" ? v.keys.p256dh : "";
  const auth = typeof v?.keys?.auth === "string" ? v.keys.auth : "";
  // Solo los servicios de push de los navegadores (https), para que nadie haga que el servidor llame a otro lado.
  if (!/^https:\/\/[a-z0-9.-]+\.(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|push\.apple\.com)\//i.test(endpoint) || endpoint.length > 1000) return null;
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,60}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

export async function guardarSuscripcion(db: Db, s: { endpoint: string; p256dh: string; auth: string }, datos: { tipo: "negocio" | "cliente" | "delivery"; colmadoId: number; userId?: string | null; telefono?: string | null; ofertas?: boolean }) {
  await db.insert(pushSuscripciones).values({ ...s, ...datos, ofertas: datos.ofertas ?? true })
    .onConflictDoUpdate({ target: pushSuscripciones.endpoint, set: { p256dh: s.p256dh, auth: s.auth, tipo: datos.tipo, colmadoId: datos.colmadoId, userId: datos.userId ?? null, telefono: datos.telefono ?? null, ofertas: datos.ofertas ?? true, fallos: 0 } });
}

pushRoutes.get("/api/push/clave", async (c) => {
  try { return c.json({ publica: (await llavesVapid(c.env, getDb(c.env.DB))).publica }); }
  catch { return c.json({ error: "Las notificaciones no están listas todavía." }, 503); }
});

pushRoutes.post("/api/push/negocio", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => null)) || {};
  const colmadoId = Number(body.colmadoId);
  if (!OPERADORES.includes(c.var.user.role ?? "") || !(await canUserAccessColmado(db, c.var.user, colmadoId))) return c.json({ error: "Sin permiso" }, 403);
  const s = leerSuscripcion(body.suscripcion);
  if (!s) return c.json({ error: "El navegador no mandó una suscripción válida." }, 400);
  await guardarSuscripcion(db, s, { tipo: "negocio", colmadoId, userId: c.var.user.id });
  return c.json({ ok: true });
});

pushRoutes.post("/api/push/prueba", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const subs = await db.select().from(pushSuscripciones).where(and(eq(pushSuscripciones.tipo, "negocio"), eq(pushSuscripciones.userId, c.var.user.id))).limit(10);
  if (!subs.length) return c.json({ error: "Este usuario no tiene avisos activados en ningún aparato." }, 404);
  const n = await enviarPush(c.env, db, subs, { titulo: "🔔 Delywa", texto: "Así te van a llegar los pedidos nuevos. ¡Listo!", url: "/negocio/pedidos", etiqueta: "prueba" });
  return c.json({ enviados: n });
});

/** Apagar los avisos de este aparato (el endpoint solo lo conoce ese navegador). */
pushRoutes.post("/api/push/quitar", async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  if (typeof body.endpoint !== "string") return c.json({ error: "Falta el aparato" }, 400);
  await getDb(c.env.DB).delete(pushSuscripciones).where(eq(pushSuscripciones.endpoint, body.endpoint));
  return c.json({ ok: true });
});

// ---------- Ofertas ----------

const base = "/api/colmados/:id/ofertas";
for (const r of [base, `${base}/*`]) {
  pushRoutes.use(r, requireAuth, requireBusinessAccess(), async (c, next) => {
    if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero publican ofertas." }, 403);
    await next();
  });
}

async function lista(db: Db, colmadoId: number) {
  const filas = await db.select().from(ofertas).where(eq(ofertas.colmadoId, colmadoId)).orderBy(desc(ofertas.id)).limit(30);
  const [s] = await db.select({ n: sql<number>`count(*)` }).from(pushSuscripciones)
    .where(and(eq(pushSuscripciones.tipo, "cliente"), eq(pushSuscripciones.colmadoId, colmadoId), eq(pushSuscripciones.ofertas, true)));
  return { ofertas: filas.map((o) => ({ ...o, vigente: o.activa && o.hasta.getTime() > Date.now() })), suscritos: Number(s?.n ?? 0) };
}

pushRoutes.get(base, async (c) => c.json(await lista(getDb(c.env.DB), Number(c.req.param("id")))));

pushRoutes.post(base, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const texto = typeof body.texto === "string" ? body.texto.trim().slice(0, 160) : "";
  if (texto.length < 5) return c.json({ error: "Escribe la oferta, por ejemplo: «Hoy pollo a RD$95 la libra»." }, 400);
  const horas = Math.min(Math.max(Number(body.horas) || 24, 1), 24 * 14);
  // Un aviso a los clientes por día (para que no lo sientan como spam ni apaguen los avisos).
  let aviso: string | null = null;
  if (body.avisar) {
    const desde = inicioDiaLocal(await getColmadoTimezone(db, colmado));
    const [hoy] = await db.select({ id: ofertas.id }).from(ofertas).where(and(eq(ofertas.colmadoId, colmadoId), isNotNull(ofertas.aviso), gte(ofertas.fechaCreacion, desde))).limit(1);
    if (hoy) return c.json({ error: "Ya mandaste un aviso de oferta hoy. Publícala sin aviso o espera a mañana." }, 409);
    aviso = "pendiente";
  }
  await db.insert(ofertas).values({ colmadoId, texto, hasta: new Date(Date.now() + horas * 3600_000), aviso, creadoPor: nombreUsuario(c.var.user) });
  return c.json(await lista(db, colmadoId), 201);
});

pushRoutes.patch(`${base}/:oid`, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  await db.update(ofertas).set({ activa: false, aviso: sql`case when ${ofertas.aviso} in ('pendiente','enviando') then 'enviado' else ${ofertas.aviso} end` })
    .where(and(eq(ofertas.id, Number(c.req.param("oid"))), eq(ofertas.colmadoId, colmadoId)));
  return c.json(await lista(db, colmadoId));
});

/** Ofertas vigentes de un colmado (para su chat). */
export async function ofertasVigentes(db: Db, colmadoIds: number[]) {
  const filas = await db.select({ id: ofertas.id, texto: ofertas.texto, hasta: ofertas.hasta }).from(ofertas)
    .where(and(inArray(ofertas.colmadoId, colmadoIds), eq(ofertas.activa, true), gte(ofertas.hasta, new Date()))).orderBy(desc(ofertas.id)).limit(3);
  return filas;
}
