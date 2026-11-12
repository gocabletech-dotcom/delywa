import { like } from "drizzle-orm";
import { configuracionSistema } from "@shared/schema";
import type { Env } from "../env";
import { getDb, type Db } from "../db";
import { fijarVersionGraph } from "./whatsapp";

// Llaves de servicios externos (OpenAI, Meta, Turnstile) configurables desde
// el panel de plataforma. Se guardan en configuracion_sistema con el prefijo
// "integracion:"; las secretas van cifradas con AES-GCM usando la clave
// maestra DELYWA_CLAVE_MAESTRA, que vive como secreto del Worker (la crea el
// instalador) y nunca en la base de datos. Lo guardado en el panel tiene
// prioridad sobre un secreto de Cloudflare con el mismo nombre.

export const PREFIJO = "integracion:";

type Campo = { env?: keyof Env; secreto: boolean; etiqueta: string };

export const CAMPOS = {
  openai_api_key: { env: "OPENAI_API_KEY", secreto: true, etiqueta: "Llave de OpenAI" },
  ai_gateway_url: { env: "AI_GATEWAY_URL", secreto: false, etiqueta: "URL de Cloudflare AI Gateway (opcional)" },
  meta_app_id: { env: "META_APP_ID", secreto: false, etiqueta: "ID de la app de Meta" },
  meta_app_secret: { env: "META_APP_SECRET", secreto: true, etiqueta: "Clave secreta de la app de Meta" },
  meta_config_id: { env: "META_CONFIG_ID", secreto: false, etiqueta: "ID de configuración del registro integrado" },
  whatsapp_verify_token: { env: "WHATSAPP_VERIFY_TOKEN", secreto: true, etiqueta: "Token de verificación del webhook" },
  whatsapp_access_token: { env: "WHATSAPP_ACCESS_TOKEN", secreto: true, etiqueta: "Token de acceso global de WhatsApp (respaldo)" },
  meta_graph_version: { env: "META_GRAPH_VERSION", secreto: false, etiqueta: "Versión de la Graph API (opcional)" },
  turnstile_site_key: { secreto: false, etiqueta: "Clave del sitio de Turnstile" },
  turnstile_secret_key: { secreto: true, etiqueta: "Clave secreta de Turnstile" },
  turnstile_activo: { secreto: false, etiqueta: "Turnstile activo en el login" },
  resend_clave: { secreto: true, etiqueta: "Clave de Resend (API key)" },
  correo_desde: { secreto: false, etiqueta: "Remitente de los correos" },
} satisfies Record<string, Campo>;

export type NombreCampo = keyof typeof CAMPOS;
export const esCampo = (v: unknown): v is NombreCampo => typeof v === "string" && Object.hasOwn(CAMPOS, v);

/** Llave de OpenAI propia de un negocio (opcional): la paga ese negocio en lugar de la plataforma. */
export const claveOpenAINegocio = (colmadoId: number) => `${PREFIJO}openai_api_key@${colmadoId}`;

// ---------- Cifrado ----------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const desdeB64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function claveAES(maestra: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(maestra));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export class SinClaveMaestra extends Error {
  constructor() { super("Falta la clave maestra del servidor (DELYWA_CLAVE_MAESTRA). Vuelve a correr el instalador para crearla."); }
}

export async function cifrar(texto: string, maestra: string | undefined): Promise<string> {
  if (!maestra) throw new SinClaveMaestra();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveAES(maestra), new TextEncoder().encode(texto));
  return `v1:${b64(iv)}:${b64(new Uint8Array(datos))}`;
}

export async function descifrar(valor: string, maestra: string | undefined): Promise<string | null> {
  const [version, iv, datos] = valor.split(":");
  if (version !== "v1" || !iv || !datos || !maestra) return null;
  try {
    const texto = await crypto.subtle.decrypt({ name: "AES-GCM", iv: desdeB64(iv) }, await claveAES(maestra), desdeB64(datos));
    return new TextDecoder().decode(texto);
  } catch {
    // Clave maestra distinta a la que cifró el valor.
    return null;
  }
}

// ---------- Lectura ----------

export type Integraciones = {
  valores: Partial<Record<NombreCampo, string>>;
  /** Llaves de OpenAI propias por negocio. */
  openaiPorNegocio: Record<number, string>;
  /** Valores guardados que no se pudieron descifrar (clave maestra cambiada). */
  ilegibles: string[];
};

const cache = new WeakMap<object, { hasta: number; datos: Integraciones }>();
const VIGENCIA_MS = 30_000;

export function olvidarCache(env: Pick<Env, "DB">): void {
  cache.delete(env.DB);
}

export async function leerIntegraciones(env: Env, db: Db = getDb(env.DB)): Promise<Integraciones> {
  const guardado = cache.get(env.DB);
  if (guardado && guardado.hasta > Date.now()) return guardado.datos;
  const filas = await db.select().from(configuracionSistema).where(like(configuracionSistema.clave, `${PREFIJO}%`));
  const datos: Integraciones = { valores: {}, openaiPorNegocio: {}, ilegibles: [] };
  for (const fila of filas) {
    const nombre = fila.clave.slice(PREFIJO.length);
    const [campo, negocio] = nombre.split("@");
    if (!esCampo(campo) || !fila.valor) continue;
    const valor = CAMPOS[campo].secreto || negocio ? await descifrar(fila.valor, env.DELYWA_CLAVE_MAESTRA) : fila.valor;
    if (valor === null) { datos.ilegibles.push(nombre); continue; }
    if (negocio) {
      if (campo === "openai_api_key" && /^\d+$/.test(negocio)) datos.openaiPorNegocio[Number(negocio)] = valor;
    } else {
      datos.valores[campo] = valor;
    }
  }
  cache.set(env.DB, { hasta: Date.now() + VIGENCIA_MS, datos });
  return datos;
}

/**
 * El entorno con las llaves del panel encima de los secretos de Cloudflare.
 * Todas las rutas lo reciben ya resuelto, así que el resto del código sigue
 * leyendo env.OPENAI_API_KEY, env.META_APP_SECRET, etc.
 */
export async function envEfectivo(env: Env): Promise<Env> {
  if (env.__integraciones) return env;
  let datos: Integraciones;
  try {
    datos = await leerIntegraciones(env);
  } catch (err) {
    // Si la base de datos falla, se sigue con los secretos de Cloudflare.
    console.error("[integraciones] No se pudieron leer:", err instanceof Error ? err.message : err);
    return env;
  }
  const efectivo: Env = { ...env, __integraciones: datos, __base: env };
  for (const [campo, def] of Object.entries(CAMPOS) as Array<[NombreCampo, Campo]>) {
    const valor = datos.valores[campo];
    if (def.env && valor) (efectivo as any)[def.env] = valor;
  }
  fijarVersionGraph(efectivo.META_GRAPH_VERSION);
  return efectivo;
}

/** Llave de OpenAI para un negocio: la propia si la tiene; si no, la de la plataforma. */
export function llaveOpenAI(env: Env, colmadoId?: number | null): string | undefined {
  return (colmadoId ? env.__integraciones?.openaiPorNegocio[colmadoId] : undefined) || env.OPENAI_API_KEY;
}

/** Vista segura de un secreto para el panel: solo los últimos 4 caracteres. */
export function enmascarar(valor: string | undefined): string | null {
  if (!valor) return null;
  return valor.length <= 8 ? "••••" : `••••${valor.slice(-4)}`;
}
