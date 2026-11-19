// Consulta del padrón de contribuyentes de la DGII por RNC o cédula, con la API pública de
// rnc.urbanstockpos.com (sin clave; límite por IP). Dice si el negocio está activo y su razón social.

import { soloDigitos } from "@shared/certificacion";

export const PADRON_URL = "https://rnc.urbanstockpos.com/api/v1/rnc/";
/** Se reemplaza en las pruebas: nunca se consulta el servicio real. */
export const servicioPadron = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };

export type ResultadoPadron = "activo" | "suspendido" | "cese" | "baja" | "no_existe" | "invalido" | "no_disponible";

export type DatosPadron = {
  rnc: string; formateado: string; tipoDocumento: string; razonSocial: string; nombreComercial: string | null;
  actividad: string; estadoTexto: string; regimen: string; fechaInicio: string | null;
};

export type ConsultaPadron = { resultado: ResultadoPadron; datos?: DatosPadron; padronFecha?: string | null };

/** Convierte el estado de la DGII en uno de los nuestros. */
export function clasificarEstado(estado: string, activo: boolean): ResultadoPadron {
  const e = estado.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (activo || e === "ACTIVO") return "activo";
  if (e.includes("SUSPEN")) return "suspendido";
  if (e.includes("CESE")) return "cese";
  return "baja"; // DADO DE BAJA, ANULADO, RECHAZADO u otro estado que no permite facturar
}

export async function consultarPadron(numero: string): Promise<ConsultaPadron> {
  const n = soloDigitos(numero);
  if (n.length !== 9 && n.length !== 11) return { resultado: "invalido" };
  let res: Response;
  try {
    res = await servicioPadron.fetch(`${PADRON_URL}${n}`, { headers: { Accept: "application/json", "User-Agent": "Delywa/1.0 (+https://delywa.com)" }, signal: AbortSignal.timeout(6000) });
  } catch {
    return { resultado: "no_disponible" };
  }
  if (res.status === 404) return { resultado: "no_existe" };
  if (res.status === 400) return { resultado: "invalido" };
  if (!res.ok) return { resultado: "no_disponible" };
  const j: any = await res.json().catch(() => null);
  const d = j?.data;
  if (!j?.ok || j.found === false || !d) return { resultado: j?.ok ? "no_existe" : "no_disponible" };
  // Los registros de ejemplo del servicio no son contribuyentes reales.
  if (d.isTestExample || j.meta?.isTestExample) return { resultado: "no_existe" };
  const datos: DatosPadron = {
    rnc: soloDigitos(d.rnc) || n, formateado: String(d.formattedRnc ?? n), tipoDocumento: String(d.tipoDocumento ?? ""),
    razonSocial: String(d.razonSocial ?? "").trim(), nombreComercial: d.nombreComercial ? String(d.nombreComercial).trim() || null : null,
    actividad: String(d.actividadEconomica ?? "").trim(), estadoTexto: String(d.estado ?? "").trim(), regimen: String(d.regimenPago ?? "").trim(),
    fechaInicio: d.fechaInicio ?? null,
  };
  return { resultado: clasificarEstado(datos.estadoTexto, d.isActive === true), datos, padronFecha: j.meta?.padronFecha ?? null };
}

/** Lo que se le dice al negocio según lo que contestó la DGII. */
export function mensajePadron(r: ResultadoPadron, estadoTexto?: string | null): string {
  switch (r) {
    case "activo": return "Activo en la DGII. Llenamos la razón social tal como aparece en la DGII.";
    case "suspendido": return "Este RNC o cédula aparece SUSPENDIDO en la DGII. Antes de seguir, ve a la DGII (oficina o Oficina Virtual) y normaliza la suspensión: ponte al día con las declaraciones y pagos pendientes. Cuando la DGII lo active, vuelve aquí y toca «Verificar con la DGII».";
    case "cese": return "Este RNC o cédula está en CESE TEMPORAL de actividades en la DGII. Para facturar tienes que reactivarlo primero en la DGII. Cuando esté activo, vuelve aquí y toca «Verificar con la DGII».";
    case "baja": return `Este RNC o cédula aparece como ${estadoTexto || "dado de baja"} en la DGII y no puede emitir facturas electrónicas. Comunícate con la DGII para regularizarlo, o usa el RNC con el que opera tu negocio.`;
    case "no_existe": return "Ese número no aparece en el padrón de contribuyentes de la DGII. Revisa que esté bien escrito. Si es tu cédula y nunca te inscribiste, primero debes inscribirte en el RNC en la DGII.";
    case "invalido": return "El RNC tiene 9 números y la cédula 11. Revisa el número.";
    default: return "No pudimos consultar la DGII en este momento. Tus datos se guardaron; toca «Verificar con la DGII» más tarde.";
  }
}

/** Estados que no dejan seguir con la guía. */
export const BLOQUEA_SEGUIR = new Set<string>(["suspendido", "cese", "baja", "no_existe"]);
/** Cada cuánto se vuelve a consultar al abrir la guía (por si la DGII lo suspendió después). */
export const REVISAR_CADA_MS = 7 * 24 * 60 * 60 * 1000;
