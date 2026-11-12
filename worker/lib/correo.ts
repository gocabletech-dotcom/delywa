import type { Env } from "../env";

// Correos con Resend (resend.com, plan gratis de 3,000 al mes).
// La clave y el remitente se ponen en Plataforma → Integraciones → Correo. Sin ellos no se manda nada
// y todo lo demás sigue funcionando (recuperar contraseña y el código de registro quedan apagados).

/** Las pruebas reemplazan esta función: nunca se manda un correo de verdad. */
export const servicioCorreo = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };
export const SOPORTE = "soporte@delywa.com";

export function correoListo(env: Env): boolean {
  const v = env.__integraciones?.valores;
  return Boolean(v?.resend_clave && v?.correo_desde);
}

export const escHtml = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Marco común de todos los correos de Delywa. */
export function plantillaCorreo(titulo: string, cuerpo: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px;margin:auto">
<div style="background:#25D366;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-size:20px;font-weight:bold">DelyWa</div>
<div style="border:1px solid #eee;border-top:0;padding:20px;border-radius:0 0 10px 10px"><h2 style="margin-top:0;font-size:18px">${escHtml(titulo)}</h2>${cuerpo}
<p style="color:#888;font-size:12px;margin-top:24px">¿Preguntas? Escríbenos a ${SOPORTE}.</p></div></div>`;
}

export function boton(texto: string, enlace: string): string {
  return `<p style="margin:24px 0"><a href="${escHtml(enlace)}" style="background:#25D366;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escHtml(texto)}</a></p>
<p style="color:#666;font-size:13px">O copia este enlace en tu navegador:<br>${escHtml(enlace)}</p>`;
}

export class CorreoNoConfigurado extends Error {
  constructor() { super("El envío de correos no está configurado (Plataforma → Integraciones → Correo)."); }
}

function mensajeResend(estado: number, cuerpo: { message?: string; error?: string }): string {
  const m = String(cuerpo.message || cuerpo.error || "");
  if (estado === 401 || (estado === 403 && /api key/i.test(m))) return "Resend rechazó la clave. Crea una nueva en resend.com → API Keys y pégala otra vez.";
  if (estado === 403 && /domain|verify/i.test(m)) return "El dominio del remitente todavía no está verificado en Resend (resend.com → Domains).";
  if (estado === 422) return `Resend no aceptó el correo: ${m}`;
  if (estado === 429) return "Resend dice que se enviaron demasiados correos seguidos o se llegó al límite del plan.";
  return `Resend respondió ${estado}${m ? `: ${m}` : ""}`;
}

export async function enviarCorreo(env: Env, datos: { para: string; asunto: string; html: string; responder?: string }): Promise<void> {
  const v = env.__integraciones?.valores;
  if (!v?.resend_clave || !v.correo_desde) throw new CorreoNoConfigurado();
  const res = await servicioCorreo.fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${v.resend_clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: v.correo_desde, to: [datos.para], subject: datos.asunto, html: datos.html, reply_to: datos.responder || SOPORTE }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(mensajeResend(res.status, await res.json().catch(() => ({}))));
}
