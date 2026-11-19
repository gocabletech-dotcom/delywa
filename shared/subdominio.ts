// Enlace amigable del chat de cada colmado: colmadolasombrita.delywa.com (como los subdominios de FoodPOS).
// El subdominio es el slug sin guiones. El enlace viejo delywa.com/pedir/<slug> sigue funcionando.

export const DOMINIO_BASE = "delywa.com";

/** Nombres que nunca son de un colmado. */
export const SUBDOMINIOS_RESERVADOS = new Set([
  "www", "app", "api", "admin", "panel", "plataforma", "mail", "email", "correo", "smtp", "imap", "pop", "ftp", "webmail",
  "ns1", "ns2", "soporte", "ayuda", "manual", "static", "cdn", "img", "uploads", "blog", "status", "dev", "test", "staging",
  "delywa", "delivery", "repartidor", "pedir", "login", "negocio", "cliente", "clientes",
]);

/** colmado-la-sombrita → colmadolasombrita */
export const subdominioDeSlug = (slug: string | null | undefined) => String(slug ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 63);

/** El subdominio de un colmado si la dirección es <algo>.delywa.com (o <algo>.localhost para probar en la computadora). */
export function subdominioDelHost(host: string, bases: string[] = [DOMINIO_BASE, "localhost"]): string | null {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  for (const base of bases) {
    if (!h.endsWith(`.${base}`)) continue;
    const etiqueta = h.slice(0, -(base.length + 1));
    if (!etiqueta || etiqueta.includes(".") || SUBDOMINIOS_RESERVADOS.has(etiqueta)) return null;
    return /^[a-z0-9-]{1,63}$/.test(etiqueta) ? etiqueta : null;
  }
  return null;
}

/**
 * Enlace del chat para los clientes. En delywa.com: https://colmadolasombrita.delywa.com.
 * En otra dirección (la computadora del programador): <origen>/pedir/<slug>.
 */
export function enlaceChat(slug: string | null | undefined, origen: string): string {
  if (!slug) return "";
  let host = "";
  try { host = new URL(origen).hostname; } catch { /* origen inválido */ }
  const sub = subdominioDeSlug(slug);
  if ((host === DOMINIO_BASE || host === `www.${DOMINIO_BASE}`) && sub) return `https://${sub}.${DOMINIO_BASE}`;
  return `${origen.replace(/\/+$/, "")}/pedir/${slug}`;
}
