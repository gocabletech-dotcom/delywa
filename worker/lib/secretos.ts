import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { codecSecretos } from "@shared/columns";
import type { Env } from "../env";

// Cifrado de las columnas secretas de la base (tokens de WhatsApp de Meta y llave de Evolution de cada
// negocio). Formato guardado: "c1:<iv>:<datos+sello>" en base64, AES-256-GCM con una llave derivada de
// DELYWA_CLAVE_MAESTRA. Es transparente: el resto del código (incluido el bot) lee y escribe texto normal.
// Un valor guardado sin el prefijo es de antes del cifrado y se lee tal cual; el cron los va cifrando.

const PREFIJO = "c1:";
let llave: Buffer | null = null;
let maestraActual: string | undefined;

/** Se llama al empezar cada petición, cada vuelta del cron y cada lote de la cola. */
export function instalarSecretos(maestra: string | undefined): void {
  if (maestra === maestraActual) return;
  maestraActual = maestra;
  llave = maestra ? createHash("sha256").update(`delywa-columnas:${maestra}`).digest() : null;
}

function cifrar(texto: string): string {
  // Sin clave maestra no se puede cifrar: se guarda como antes (el instalador siempre la crea).
  if (!llave || texto.startsWith(PREFIJO)) return texto;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llave, iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final(), c.getAuthTag()]);
  return `${PREFIJO}${iv.toString("base64")}:${datos.toString("base64")}`;
}

function descifrar(guardado: string): string {
  if (!guardado.startsWith(PREFIJO)) return guardado;
  if (!llave) return "";
  try {
    const [iv, datos] = guardado.slice(PREFIJO.length).split(":").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", llave, iv);
    d.setAuthTag(datos.subarray(datos.length - 16));
    return Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]).toString("utf8");
  } catch {
    // Clave maestra distinta o dato dañado: se trata como "sin token" en vez de romper la petición.
    console.error("[secretos] No se pudo descifrar una columna secreta");
    return "";
  }
}

codecSecretos.cifrar = cifrar;
codecSecretos.descifrar = descifrar;

/** Cifra los tokens que se guardaron antes de esta versión. Devuelve cuántos negocios tocó. */
export async function cifrarSecretosPendientes(env: Env): Promise<number> {
  instalarSecretos(env.DELYWA_CLAVE_MAESTRA);
  if (!llave) return 0;
  const pendiente = (col: string) => `(${col} IS NOT NULL AND ${col} <> '' AND ${col} NOT LIKE 'c1:%')`;
  const { results } = await env.DB.prepare(
    `SELECT id, whatsapp_access_token AS meta, evolution_api_key AS evo FROM colmados WHERE ${pendiente("whatsapp_access_token")} OR ${pendiente("evolution_api_key")} LIMIT 50`,
  ).all<{ id: number; meta: string | null; evo: string | null }>();
  for (const f of results) {
    await env.DB.prepare("UPDATE colmados SET whatsapp_access_token = ?, evolution_api_key = ? WHERE id = ?")
      .bind(f.meta ? cifrar(f.meta) : f.meta, f.evo ? cifrar(f.evo) : f.evo, f.id).run();
  }
  return results.length;
}
