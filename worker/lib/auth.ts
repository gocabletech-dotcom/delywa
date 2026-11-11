import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { recordActivity } from "./session";
import { isColmadoAbierto } from "./horario";
import { getColmado, getColmadoTimezone } from "../storage/colmados";
import { canUserAccessColmado, getUserById } from "../storage/users";

const ONE_HOUR_MS = 3_600_000;

/**
 * Exige una sesión de usuario válida y deja el usuario en c.var.user.
 * Si la sesión lleva más de 1 hora inactiva y el negocio está cerrado, se
 * cierra y el frontend redirige a /login?reason=inactivity.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = c.var.session;
  const userId = session.data.userId;
  if (!userId) return c.json({ message: "Unauthorized" }, 401);

  const db = getDb(c.env.DB);
  const user = await getUserById(db, userId);
  if (!user) {
    session.destroy();
    return c.json({ message: "Unauthorized" }, 401);
  }

  const sessionColmadoId = session.data.colmadoId;
  const lastActivity = recordActivity(session);
  if (sessionColmadoId && lastActivity && Date.now() - lastActivity > ONE_HOUR_MS) {
    try {
      const colmado = await getColmado(db, sessionColmadoId);
      if (colmado) {
        const timezone = await getColmadoTimezone(db, colmado);
        if (!isColmadoAbierto(colmado, timezone).abierto) {
          session.destroy();
          return c.json({ error: "Sesión cerrada por inactividad", reason: "inactivity_closed" }, 401);
        }
      }
    } catch (err) {
      // Si la verificación falla no se bloquea el acceso.
      console.error("[requireAuth] Error al verificar inactividad:", err);
    }
  }

  c.set("user", user);
  await next();
};

/** Solo administradores de la plataforma. Usar después de requireAuth. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Acceso denegado" }, 403);
  await next();
};

/**
 * Exige que el usuario tenga acceso a la sucursal del parámetro de ruta.
 * El servidor es la fuente de verdad; ocultar enlaces en la interfaz no basta.
 */
export function requireBusinessAccess(param = "id"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const colmadoId = Number(c.req.param(param));
    if (!Number.isInteger(colmadoId) || !(await canUserAccessColmado(getDb(c.env.DB), c.var.user, colmadoId))) {
      return c.json({ error: "No tienes permiso para acceder a esta sucursal" }, 403);
    }
    await next();
  };
}
