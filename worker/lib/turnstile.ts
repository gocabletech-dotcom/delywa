import type { Env } from "../env";
import { http } from "./whatsapp";

// Cloudflare Turnstile: comprueba que quien inicia sesión es una persona.
// Las claves se ponen en Plataforma → Integraciones y solo se exige después de una prueba exitosa,
// así un error en las claves no deja a nadie fuera del sistema.

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verificarTurnstile(secreto: string, token: unknown, ip?: string): Promise<boolean> {
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", secreto);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await http.fetch(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    return data.success === true;
  } catch {
    console.error("[turnstile] No se pudo contactar a Cloudflare");
    return false;
  }
}

/** Datos de Turnstile para el login, solo si está activo y probado. */
export function turnstileDelLogin(env: Env): { siteKey: string; secreto: string } | null {
  const v = env.__integraciones?.valores;
  if (v?.turnstile_activo !== "true" || !v.turnstile_site_key || !v.turnstile_secret_key) return null;
  return { siteKey: v.turnstile_site_key, secreto: v.turnstile_secret_key };
}
