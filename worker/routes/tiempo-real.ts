import { Hono, type Context, type MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { deliveries, pedidos, whatsappConversaciones } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAuth } from "../lib/auth";
import { avisarNegocio, temasDeRuta } from "../lib/tiempo-real";
import { canUserAccessColmado } from "../storage/users";

export const tiempoRealRoutes = new Hono<AppEnv>();

/** El panel abre aquí su conexión de tiempo real. Solo usuarios con acceso a esa sucursal. */
tiempoRealRoutes.get("/api/tiempo-real", requireAuth, async (c) => {
  if (!c.env.SALAS) return c.json({ error: "Tiempo real no disponible" }, 503);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "Se esperaba WebSocket" }, 426);
  const colmadoId = Number(c.req.query("colmadoId"));
  if (!Number.isInteger(colmadoId) || colmadoId <= 0 || !(await canUserAccessColmado(getDb(c.env.DB), c.var.user, colmadoId))) {
    return c.json({ error: "No tienes permiso para acceder a esta sucursal" }, 403);
  }
  const sala = c.env.SALAS.get(c.env.SALAS.idFromName(`negocio:${colmadoId}`));
  return sala.fetch("https://sala/conectar", { headers: { Upgrade: "websocket" } });
});

/** Sucursal a la que pertenece lo que se está cambiando (se averigua antes, por si la ruta lo borra). */
async function negocioDeLaRuta(c: Context<AppEnv>, ruta: string): Promise<number | null> {
  const db = getDb(c.env.DB);
  let m = ruta.match(/^\/api\/colmados\/(\d+)/);
  if (m) return Number(m[1]);
  m = ruta.match(/^\/api\/pedidos\/(\d+)/);
  if (m) {
    const [fila] = await db.select({ id: pedidos.colmadoId }).from(pedidos).where(eq(pedidos.id, Number(m[1])));
    return fila?.id ?? null;
  }
  m = ruta.match(/^\/api\/conversaciones\/(\d+)/);
  if (m) {
    const [fila] = await db.select({ id: whatsappConversaciones.colmadoId }).from(whatsappConversaciones).where(eq(whatsappConversaciones.id, Number(m[1])));
    return fila?.id ?? null;
  }
  m = ruta.match(/^\/api\/deliveries\/(\d+)/);
  if (m) {
    const [fila] = await db.select({ id: deliveries.colmadoId }).from(deliveries).where(eq(deliveries.id, Number(m[1])));
    return fila?.id ?? null;
  }
  const datos = c.var.session?.data;
  if (ruta.startsWith("/api/portal-repartidor/")) return datos?.portalColmadoId ?? null;
  return datos?.colmadoId ?? null;
}

/** Después de cada cambio que sale bien, avisa a los demás paneles abiertos de esa sucursal. */
export const avisarCambios: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ruta = new URL(c.req.url).pathname;
  const temas = c.req.method === "GET" || !c.env.SALAS ? [] : temasDeRuta(ruta);
  if (temas.length === 0) return next();
  const colmadoId = await negocioDeLaRuta(c, ruta).catch(() => null);
  await next();
  if (!colmadoId || c.res.status >= 400) return;
  const aviso = avisarNegocio(c.env, colmadoId, temas);
  try {
    c.executionCtx.waitUntil(aviso);
  } catch {
    await aviso;
  }
};
