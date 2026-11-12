import { eq, inArray } from "drizzle-orm";
import { colmados, menuProductos, pedidos } from "@shared/schema";
import type { Env } from "../env";
import { getDb, type Db } from "../db";

// Fotos que ya nadie usa: cuando se borra un producto o un negocio, o se cambia la foto de un producto,
// el archivo viejo se borra de R2 (si ningún otro producto, logo o pedido lo sigue usando).

const PROPIAS = /^\/uploads\/(productos|logos|comprobantes)\/[A-Za-z0-9/_.-]+$/;

async function enUso(db: Db, url: string): Promise<boolean> {
  const [p] = await db.select({ id: menuProductos.id }).from(menuProductos).where(eq(menuProductos.imagen, url)).limit(1);
  if (p) return true;
  const [l] = await db.select({ id: colmados.id }).from(colmados).where(eq(colmados.logo, url)).limit(1);
  if (l) return true;
  const [pe] = await db.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.comprobanteUrl, url)).limit(1);
  return Boolean(pe);
}

/** Borra el archivo de R2 si es nuestro y ya nadie lo usa. Nunca rompe la petición. */
export async function borrarSiHuerfano(env: Env, url: string | null | undefined): Promise<boolean> {
  if (!url || !PROPIAS.test(url)) return false;
  try {
    const db = getDb(env.DB);
    if (await enUso(db, url)) return false;
    await env.UPLOADS.delete(url.slice("/uploads/".length));
    return true;
  } catch (err) {
    console.error("[archivos] No se pudo borrar:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Antes de borrar un negocio: las fotos, el logo y los comprobantes que tenía (y sus sucursales). */
export async function archivosDelNegocio(db: Db, colmadoId: number): Promise<string[]> {
  const ids = [colmadoId, ...(await db.select({ id: colmados.id }).from(colmados).where(eq(colmados.negocioPrincipalId, colmadoId))).map((x) => x.id)];
  const [fotos, logos, comprobantes] = await Promise.all([
    db.select({ url: menuProductos.imagen }).from(menuProductos).where(inArray(menuProductos.colmadoId, ids)),
    db.select({ url: colmados.logo }).from(colmados).where(inArray(colmados.id, ids)),
    db.select({ url: pedidos.comprobanteUrl }).from(pedidos).where(inArray(pedidos.colmadoId, ids)),
  ]);
  return [...new Set([...fotos, ...logos, ...comprobantes].map((x) => x.url).filter((u): u is string => Boolean(u)))];
}

/** Después de borrar el negocio: se borran los archivos que quedaron sin uso. */
export async function borrarArchivosHuerfanos(env: Env, urls: string[]): Promise<number> {
  let n = 0;
  for (const url of urls) if (await borrarSiHuerfano(env, url)) n++;
  return n;
}
