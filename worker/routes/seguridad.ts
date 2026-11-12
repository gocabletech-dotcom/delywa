import { Hono } from "hono";
import { and, desc, eq, lt } from "drizzle-orm";
import { bitacora, errores, respaldos } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { descargarRespaldo, iniciarRespaldo, pasoRespaldo } from "../lib/respaldo";

// Plataforma → Seguridad: bitácora, errores del sistema y respaldos. Solo platform_admin.
export const seguridadRoutes = new Hono<AppEnv>();
for (const ruta of ["/api/admin/bitacora", "/api/admin/errores", "/api/admin/respaldos", "/api/admin/respaldos/*"]) {
  seguridadRoutes.use(ruta, requireAuth, requireAdmin);
}

const antesDe = (v: string | undefined) => (Number(v) > 0 ? Number(v) : null);

seguridadRoutes.get("/api/admin/bitacora", async (c) => {
  const colmadoId = Number(c.req.query("colmadoId")) || null;
  const antes = antesDe(c.req.query("antes"));
  const filas = await getDb(c.env.DB).select().from(bitacora)
    .where(and(colmadoId ? eq(bitacora.colmadoId, colmadoId) : undefined, antes ? lt(bitacora.id, antes) : undefined))
    .orderBy(desc(bitacora.id)).limit(100);
  return c.json(filas);
});

seguridadRoutes.get("/api/admin/errores", async (c) => {
  const antes = antesDe(c.req.query("antes"));
  const filas = await getDb(c.env.DB).select().from(errores).where(antes ? lt(errores.id, antes) : undefined).orderBy(desc(errores.id)).limit(100);
  return c.json(filas);
});

seguridadRoutes.get("/api/admin/respaldos", async (c) => {
  const filas = await getDb(c.env.DB).select().from(respaldos).orderBy(desc(respaldos.dia)).limit(40);
  return c.json({ disponible: Boolean(c.env.RESPALDOS), respaldos: filas.map(({ tablas, ...r }) => ({ ...r, totalTablas: tablas.length })) });
});

/** "Respaldar ahora": empieza el de hoy y adelanta una parte; el cron sigue con el resto. */
seguridadRoutes.post("/api/admin/respaldos/ahora", async (c) => {
  if (!c.env.RESPALDOS) return c.json({ error: "El bucket de respaldos no está conectado. Vuelve a correr el instalador." }, 503);
  await iniciarRespaldo(c.env);
  const terminado = await pasoRespaldo(c.env);
  return c.json({ ok: true, terminado });
});

seguridadRoutes.get("/api/admin/respaldos/:dia/descargar", async (c) => {
  const dia = c.req.param("dia");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !c.env.RESPALDOS) return c.json({ error: "Respaldo no encontrado" }, 404);
  const [r] = await getDb(c.env.DB).select().from(respaldos).where(eq(respaldos.dia, dia));
  if (!r || r.estado !== "listo") return c.json({ error: "Ese respaldo todavía no está listo" }, 404);
  return new Response(descargarRespaldo(c.env, dia, r.parte), {
    headers: { "Content-Type": "application/sql; charset=utf-8", "Content-Disposition": `attachment; filename="delywa-respaldo-${dia}.sql"`, "Cache-Control": "no-store" },
  });
});
