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

// ---------- Plantilla de los correos ----------
// HTML de correo "a la antigua" (tablas y estilos en línea) para que se vea bien en Gmail, Outlook,
// Apple Mail y en el teléfono. El logo se sirve desde delywa.com/correo-logo.png (240 px, liviano).

const SITIO = "https://delywa.com";
const VERDE = "#25D366";
const VERDE_OSCURO = "#0f5132";
const FUENTE = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Da estilo a las etiquetas simples del cuerpo (p, ul, li, a) que no lo traen. */
function conEstilos(cuerpo: string): string {
  return cuerpo
    .replace(/<p>/g, `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:#334155">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 14px;padding-left:20px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:#334155">`)
    .replace(/<li>/g, `<li style="margin:0 0 6px">`)
    .replace(/<table style="/g, `<table style="font-family:${FUENTE};`);
}

/**
 * Marco común de todos los correos de DelyWa: logo, título, contenido, ayuda y pie.
 * `resumen` es el texto corto que el correo muestra en la bandeja junto al asunto.
 */
export function plantillaCorreo(titulo: string, cuerpo: string, opciones: { resumen?: string } = {}): string {
  const resumen = opciones.resumen ?? titulo;
  const anio = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escHtml(titulo)}</title></head>
<body style="margin:0;padding:0;background:#eef5f0;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef5f0">${escHtml(resumen)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef5f0">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
    <tr><td align="center" style="padding:0 0 18px">
      <a href="${SITIO}" style="text-decoration:none"><img src="${SITIO}/correo-logo.png" width="120" height="120" alt="DelyWa" style="display:block;width:120px;height:120px;border:0;border-radius:24px;background:#ffffff"></a>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 2px 10px rgba(15,81,50,.08)">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:6px;background:${VERDE};background-image:linear-gradient(90deg,${VERDE},#7ed957);font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 8px">
          <h1 style="margin:0 0 18px;font-family:${FUENTE};font-size:22px;line-height:1.3;font-weight:700;color:${VERDE_OSCURO}">${escHtml(titulo)}</h1>
          ${conEstilos(cuerpo)}
        </td></tr>
        <tr><td style="padding:8px 32px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2fbf5;border-radius:12px">
            <tr><td style="padding:14px 16px;font-family:${FUENTE};font-size:13px;line-height:1.5;color:#475569">
              ¿Necesitas ayuda? Escríbenos a <a href="mailto:${SOPORTE}" style="color:${VERDE_OSCURO};font-weight:600">${SOPORTE}</a>. Respondemos en español.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:22px 12px 0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:#64748b">
      <strong style="color:${VERDE_OSCURO}">DelyWa</strong> · La forma más fácil de vender por WhatsApp<br>
      <a href="${SITIO}" style="color:#64748b">delywa.com</a> · <a href="${SITIO}/legal#terminos" style="color:#64748b">Términos</a> · <a href="${SITIO}/legal#privacidad" style="color:#64748b">Privacidad</a><br>
      © ${anio} DelyWa · Hecho en República Dominicana 🇩🇴<br>
      <span style="color:#94a3b8">Recibes este correo por tu cuenta en DelyWa.</span>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

/** Botón grande que funciona en todos los programas de correo, con el enlace escrito debajo por si no abre. */
export function boton(texto: string, enlace: string): string {
  const url = escHtml(enlace);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px"><tr>
<td align="center" bgcolor="${VERDE}" style="border-radius:12px;background:${VERDE}">
<a href="${url}" style="display:inline-block;padding:14px 26px;font-family:${FUENTE};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${escHtml(texto)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-family:${FUENTE};font-size:12px;line-height:1.5;color:#94a3b8">Si el botón no abre, copia este enlace en tu navegador:<br><a href="${url}" style="color:${VERDE_OSCURO};word-break:break-all">${url}</a></p>`;
}

/** Recuadro destacado (por ejemplo, el código de 6 números). */
export function destacado(texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px"><tr>
<td style="background:#f2fbf5;border:2px dashed ${VERDE};border-radius:14px;padding:14px 28px;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${VERDE_OSCURO}">${escHtml(texto)}</td>
</tr></table>`;
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
  if (!res.ok) throw new Error(mensajeResend(res.status, (await res.json().catch(() => ({}))) as { message?: string; error?: string }));
}
