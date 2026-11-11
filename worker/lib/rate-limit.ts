import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { loginIntentos } from "@shared/schema";
import type { Db } from "../db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_USER = 5;
const MAX_PER_IP = 30;

function keys(username: string, ip: string | undefined): { user: string; ip?: string } {
  return { user: `user:${username}`, ip: ip ? `ip:${ip}` : undefined };
}

/** Devuelve los segundos que faltan para poder reintentar, o 0 si no está bloqueado. */
export async function loginBlockedFor(db: Db, username: string, ip: string | undefined): Promise<number> {
  const k = keys(username, ip);
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db
    .select({ clave: loginIntentos.clave, total: sql<number>`count(*)`, primero: sql<number>`min(${loginIntentos.fecha})` })
    .from(loginIntentos)
    .where(and(inArray(loginIntentos.clave, k.ip ? [k.user, k.ip] : [k.user]), gt(loginIntentos.fecha, since)))
    .groupBy(loginIntentos.clave);
  let retryAt = 0;
  for (const row of rows) {
    const limit = row.clave === k.user ? MAX_PER_USER : MAX_PER_IP;
    if (row.total >= limit) retryAt = Math.max(retryAt, Number(row.primero) + WINDOW_MS);
  }
  return retryAt > Date.now() ? Math.ceil((retryAt - Date.now()) / 1000) : 0;
}

export async function recordLoginFailure(db: Db, username: string, ip: string | undefined): Promise<void> {
  const k = keys(username, ip);
  await db.batch([
    db.insert(loginIntentos).values(k.ip ? [{ clave: k.user }, { clave: k.ip }] : [{ clave: k.user }]),
    // Limpieza oportunista de intentos viejos.
    db.delete(loginIntentos).where(lt(loginIntentos.fecha, new Date(Date.now() - 24 * 60 * 60 * 1000))),
  ]);
}

export async function clearLoginFailures(db: Db, username: string): Promise<void> {
  await db.delete(loginIntentos).where(eq(loginIntentos.clave, `user:${username}`));
}
