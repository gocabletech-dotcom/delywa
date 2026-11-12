import { desc, eq, lt } from "drizzle-orm";
import { respaldos } from "@shared/schema";
import type { Env } from "../env";
import { getDb } from "../db";

// Respaldo diario de toda la base D1 en R2 (bucket delywa-respaldos), como en FoodPOS.
// Se hace por partes en el cron (cada 5 minutos) para no pasar los límites de un Worker:
// cada vuelta copia hasta ~2,000 filas. Se guardan 30 días; los más viejos se borran solos.
// El archivo que se descarga es SQL, con el mismo formato que "wrangler d1 export".
// No se copian las sesiones ni los contadores de intentos.

const EXCLUIDAS = new Set(["sessions", "login_intentos", "respaldos", "_cf_KV", "_cf_METADATA"]);
const FILAS_POR_CONSULTA = 500;
export const LIMITE = { filasPorVuelta: 2000, diasGuardados: 30 };

const ident = (n: string) => `"${n.replace(/"/g, '""')}"`;

function valorSql(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v) || Array.isArray(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : Uint8Array.from(v as number[]);
    return `X'${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const hoyUtc = () => new Date().toISOString().slice(0, 10);
const clave = (dia: string, parte: number) => `${dia}/${String(parte).padStart(5, "0")}.sql`;

/** Empieza el respaldo de hoy (si no existe ya). Devuelve false si no hay bucket. */
export async function iniciarRespaldo(env: Env, dia = hoyUtc()): Promise<boolean> {
  if (!env.RESPALDOS) return false;
  const db = getDb(env.DB);
  const [existente] = await db.select().from(respaldos).where(eq(respaldos.dia, dia));
  if (existente && existente.estado !== "fallido") return true;
  const { results } = await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table','index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid")
    .all<{ name: string; sql: string }>();
  const tablasEsquema = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all<{ name: string }>()).results
    .map((r) => r.name).filter((n) => !EXCLUIDAS.has(n));
  // Parte 0: la estructura (tablas e índices), sin las tablas excluidas.
  const esquema = results
    .filter((r) => {
      const tabla = /^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)\s+[`"]?([^\s`"(]+)[`"]?(?:\s+ON\s+[`"]?([^\s`"(]+))?/i.exec(r.sql);
      const nombre = tabla?.[2] ?? tabla?.[1] ?? r.name;
      return !EXCLUIDAS.has(nombre) && !EXCLUIDAS.has(r.name);
    })
    .map((r) => `${r.sql};`).join("\n");
  const cabecera = `-- Respaldo de DelyWa ${dia}. Restaurar solo sobre una base VACÍA:\n-- npx wrangler d1 execute <base-nueva> --remote --file delywa-respaldo-${dia}.sql\nPRAGMA defer_foreign_keys = true;\n`;
  await env.RESPALDOS.put(clave(dia, 0), `${cabecera}${esquema}\n`);
  const fila = { dia, estado: "en_curso", tablas: tablasEsquema, tablaActual: 0, ultimoRowid: 0, parte: 1, filas: 0, bytes: cabecera.length + esquema.length, inicio: new Date(), fin: null, error: null };
  await db.insert(respaldos).values(fila).onConflictDoUpdate({ target: respaldos.dia, set: fila });
  return true;
}

/** Una vuelta del respaldo en curso: copia hasta LIMITE.filasPorVuelta filas. Devuelve true si terminó. */
export async function pasoRespaldo(env: Env): Promise<boolean> {
  if (!env.RESPALDOS) return false;
  const db = getDb(env.DB);
  const [r] = await db.select().from(respaldos).where(eq(respaldos.estado, "en_curso")).orderBy(desc(respaldos.dia)).limit(1);
  if (!r) return false;
  try {
    let { tablaActual, ultimoRowid, parte, filas, bytes } = r;
    let copiadas = 0;
    let texto = "";
    while (tablaActual < r.tablas.length && copiadas < LIMITE.filasPorVuelta) {
      const tabla = r.tablas[tablaActual];
      const { results } = await env.DB.prepare(`SELECT rowid AS __rowid__, * FROM ${ident(tabla)} WHERE rowid > ? ORDER BY rowid LIMIT ${FILAS_POR_CONSULTA}`)
        .bind(ultimoRowid).all<Record<string, unknown>>();
      for (const fila of results) {
        const { __rowid__, ...datos } = fila;
        const columnas = Object.keys(datos);
        texto += `INSERT INTO ${ident(tabla)} (${columnas.map(ident).join(",")}) VALUES (${columnas.map((k) => valorSql(datos[k])).join(",")});\n`;
        ultimoRowid = Number(__rowid__);
      }
      copiadas += results.length;
      if (results.length < FILAS_POR_CONSULTA) { tablaActual++; ultimoRowid = 0; }
    }
    if (texto) {
      await env.RESPALDOS.put(clave(r.dia, parte), texto);
      parte++;
      bytes += texto.length;
    }
    filas += copiadas;
    const terminado = tablaActual >= r.tablas.length;
    await db.update(respaldos).set({ tablaActual, ultimoRowid, parte, filas, bytes, ...(terminado ? { estado: "listo", fin: new Date() } : {}) })
      .where(eq(respaldos.dia, r.dia));
    return terminado;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error("[respaldo] Falló:", mensaje);
    await db.update(respaldos).set({ estado: "fallido", error: mensaje.slice(0, 300) }).where(eq(respaldos.dia, r.dia));
    return false;
  }
}

/** Borra los respaldos de más de 30 días (sus archivos en R2 y su fila). */
export async function borrarRespaldosViejos(env: Env): Promise<number> {
  if (!env.RESPALDOS) return 0;
  const db = getDb(env.DB);
  const corte = new Date(Date.now() - LIMITE.diasGuardados * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const viejos = await db.select({ dia: respaldos.dia }).from(respaldos).where(lt(respaldos.dia, corte));
  for (const { dia } of viejos) {
    let cursor: string | undefined;
    do {
      const lista = await env.RESPALDOS.list({ prefix: `${dia}/`, cursor });
      if (lista.objects.length) await env.RESPALDOS.delete(lista.objects.map((o) => o.key));
      cursor = lista.truncated ? lista.cursor : undefined;
    } while (cursor);
    await db.delete(respaldos).where(eq(respaldos.dia, dia));
  }
  return viejos.length;
}

/** El archivo .sql completo de un día, armado al vuelo con sus partes. */
export function descargarRespaldo(env: Env, dia: string, partes: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    async pull(control) {
      while (i < partes) {
        const objeto = await env.RESPALDOS!.get(clave(dia, i++));
        if (objeto) { control.enqueue(new Uint8Array(await objeto.arrayBuffer())); return; }
      }
      control.close();
    },
  });
}
