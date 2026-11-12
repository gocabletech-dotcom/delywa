import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { permitirEvento } from "../lib/rate-limit";
import { ejecutar, type AppLike } from "../chat/adaptador";
import { registrarGeneradores } from "../chat/motor-generadores";

// Generación con IA (solo platform_admin): plantilla de menú y jerga.
export const generadorRoutes = new Hono<AppEnv>();

const manejadores = new Map<string, (req: any, res: any) => any>();
const registro: AppLike = {
  get: (ruta: string, ...h: unknown[]) => void manejadores.set(`GET ${ruta}`, h.at(-1) as any),
  post: (ruta: string, ...h: unknown[]) => void manejadores.set(`POST ${ruta}`, h.at(-1) as any),
};
registrarGeneradores(registro);

async function generar(c: Context<AppEnv>, ruta: string) {
  // Cada generación es una llamada grande a la IA: tope de 20 por hora por administrador.
  if (!(await permitirEvento(getDb(c.env.DB), `generar-ia:${c.var.user.id}`, 20, 3_600_000))) {
    return c.json({ error: "Demasiadas generaciones seguidas. Intenta de nuevo más tarde." }, 429);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  const r = await ejecutar(
    { env: c.env, db: getDb(c.env.DB), origen: new URL(c.req.url).origin }, manejadores, `POST ${ruta}`,
    { body, params: c.req.param(), session: { userId: c.var.user.id } },
  );
  return c.json(r.body as any, r.status as any);
}

for (const ruta of ["/api/admin/plantillas/generar", "/api/admin/jerga/generar-ia", "/api/admin/paises/:id/generar-jerga"]) {
  generadorRoutes.post(ruta, requireAuth, requireAdmin, (c) => generar(c, ruta));
}
