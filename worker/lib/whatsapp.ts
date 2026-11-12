import type { Colmado } from "@shared/schema";
import type { Env } from "../env";

// Clientes HTTP de WhatsApp: Meta Cloud API y Evolution API.
// Nunca se registra el cuerpo de las respuestas (pueden traer teléfonos y texto de clientes): solo el código HTTP.

/** Las pruebas reemplazan esta función para no llamar a servicios reales. */
export const http = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };

/**
 * Versión de la Graph API. El original usaba v18.0, que Meta retiró en enero de 2026.
 * Se puede cambiar sin tocar código con la variable META_GRAPH_VERSION.
 */
export function graphUrl(ruta: string): string {
  const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_VERSION ?? "") ? process.env.META_GRAPH_VERSION : "v24.0";
  return `https://graph.facebook.com/${version}/${ruta.replace(/^\/+/, "")}`;
}

const TIEMPO_MAXIMO_MS = 15_000;

async function pedir(url: string, init: RequestInit, etiqueta: string): Promise<Response | null> {
  try {
    const res = await http.fetch(url, { ...init, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
    if (!res.ok) console.error(`[whatsapp] ${etiqueta}: respuesta HTTP ${res.status}`);
    return res;
  } catch (err) {
    console.error(`[whatsapp] ${etiqueta}: sin respuesta (${err instanceof Error ? err.name : "error"})`);
    return null;
  }
}

// ---------- Meta Cloud API ----------

export type CredencialesMeta = { phoneNumberId: string; accessToken: string };

type Tecnologias = { api_evo?: boolean; meta?: boolean; link_pedido?: boolean };
const tecnologias = (colmado: Colmado) => (colmado.tecnologiasHabilitadas || {}) as Tecnologias;

/** Credenciales de Meta del negocio; el token global es solo respaldo, como en el original. */
export function credencialesMeta(env: Env, colmado: Colmado): CredencialesMeta | null {
  const accessToken = colmado.whatsappAccessToken || env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = colmado.whatsappPhoneNumberId;
  return accessToken && phoneNumberId ? { phoneNumberId, accessToken } : null;
}

const soloDigitos = (numero: string) => numero.replace(/\D/g, "");

async function enviarMeta(c: CredencialesMeta, cuerpo: Record<string, unknown>, etiqueta: string): Promise<boolean> {
  const res = await pedir(graphUrl(`${c.phoneNumberId}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
  }, etiqueta);
  return !!res?.ok;
}

export const enviarTextoMeta = (c: CredencialesMeta, to: string, texto: string) =>
  enviarMeta(c, { to: soloDigitos(to), type: "text", text: { body: texto } }, "texto por Meta");

/** Plantilla aprobada de Meta: es lo único que se puede enviar fuera de la ventana de 24 horas. */
export const enviarPlantillaMeta = (c: CredencialesMeta, to: string, nombre: string, idioma: string, parametros: string[]) =>
  enviarMeta(c, {
    to: soloDigitos(to), type: "template",
    template: { name: nombre, language: { code: idioma }, components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }] },
  }, "plantilla por Meta");

// ---------- Evolution API ----------

export type CredencialesEvolution = { url: string; apiKey: string; instancia: string };

/**
 * La dirección de Evolution la escribe el negocio: debe ser https y pública.
 * Sin esto, el servidor podría ser usado para llamar a direcciones internas.
 */
export function urlEvolutionValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  let url: URL;
  try { url = new URL(valor.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const interno = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
    || /^\d+(\.\d+){3}$/.test(host) || host.includes(":") || !host.includes(".");
  if (interno) return null;
  return (url.origin + url.pathname).replace(/\/+$/, "");
}

export const instanciaValida = (valor: unknown): valor is string => typeof valor === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(valor);

export function credencialesEvolution(colmado: Colmado): CredencialesEvolution | null {
  const url = urlEvolutionValida(colmado.evolutionApiUrl);
  if (!url || !colmado.evolutionApiKey || !instanciaValida(colmado.evolutionInstanceName)) return null;
  return { url, apiKey: colmado.evolutionApiKey, instancia: colmado.evolutionInstanceName };
}

export async function evolution(c: CredencialesEvolution, metodo: string, ruta: string, cuerpo?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await pedir(`${c.url}/${ruta}/${encodeURIComponent(c.instancia)}`, {
    method: metodo,
    headers: { apikey: c.apiKey, ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  }, `Evolution ${ruta}`);
  if (!res) return { ok: false, status: 0, data: null };
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

export const enviarTextoEvolution = async (c: CredencialesEvolution, to: string, texto: string) =>
  (await evolution(c, "POST", "message/sendText", { number: soloDigitos(to), text: texto })).ok;

/** Firma que va en la URL del webhook de Evolution, para aceptar solo avisos de la instancia del negocio. */
export async function firmaWebhookEvolution(c: Pick<CredencialesEvolution, "apiKey" | "instancia">): Promise<string> {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(c.apiKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(`delywa-webhook:${c.instancia}`));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

// ---------- Canal del negocio ----------

export type Canal = { tipo: "evolution"; evolution: CredencialesEvolution } | { tipo: "meta"; meta: CredencialesMeta };

/**
 * Canal de WhatsApp listo para enviar. Como en el original, la plataforma debe
 * haber habilitado la tecnología para el negocio (api_evo o meta en true).
 */
export function canalDelNegocio(env: Env, colmado: Colmado): Canal | null {
  const evo = colmado.whatsappProvider === "evolution" ? credencialesEvolution(colmado) : null;
  if (evo) return tecnologias(colmado).api_evo === true ? { tipo: "evolution", evolution: evo } : null;
  if (tecnologias(colmado).meta !== true) return null;
  const meta = credencialesMeta(env, colmado);
  return meta ? { tipo: "meta", meta } : null;
}

/**
 * Nota de voz por Meta: primero se sube el audio a la Media API y luego se envía
 * el mensaje con el id devuelto. WhatsApp acepta OGG/Opus; el WebM del navegador
 * usa el mismo códec, así que se declara como OGG (igual que el original).
 */
export async function enviarAudioMeta(c: CredencialesMeta, to: string, audio: ArrayBuffer, tipo: string): Promise<boolean> {
  const mime = tipo.includes("webm") || !tipo ? "audio/ogg" : tipo;
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), mime.includes("ogg") ? "voice.ogg" : "voice.webm");
  form.append("type", mime);
  form.append("messaging_product", "whatsapp");
  const subida = await pedir(graphUrl(`${c.phoneNumberId}/media`), { method: "POST", headers: { Authorization: `Bearer ${c.accessToken}` }, body: form }, "subir audio a Meta");
  const id = subida?.ok ? ((await subida.json().catch(() => null)) as any)?.id : null;
  if (!id) return false;
  return enviarMeta(c, { to: soloDigitos(to), type: "audio", audio: { id: String(id) } }, "nota de voz por Meta");
}
