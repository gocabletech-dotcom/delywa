import type { NominaReglas } from "@shared/schema";
import { politicasNominaSeed, type PoliticaNominaPais } from "@shared/seed-data";

/** Error de datos que la ruta devuelve como 400 con su mensaje. */
export class NominaInvalida extends Error {}

export const REGLAS_POR_DEFECTO: NominaReglas = {
  horasOrdinariasDiarias: 8, multiplicadorHoraExtra: 1.5, multiplicadorFeriado: 2, recargoNocturnoPorcentaje: 0,
  retencionPorcentaje: 0, retencionFija: 0, feriados: [], horasPeriodoSalario: 160, origenConfiguracion: "manual",
};

const NUMERICAS = [
  "horasOrdinariasDiarias", "multiplicadorHoraExtra", "multiplicadorFeriado", "recargoNocturnoPorcentaje",
  "retencionPorcentaje", "retencionFija", "horasPeriodoSalario",
] as const;

export function getPoliticaNomina(codigo: string): PoliticaNominaPais | undefined {
  return politicasNominaSeed.find((p) => p.codigo === codigo.toUpperCase());
}

/** Una fecha real con formato AAAA-MM-DD (rechaza 2026-02-30). */
export function esFechaReal(fecha: unknown): fecha is string {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export function validarReglas(reglas: NominaReglas, politica?: PoliticaNominaPais): void {
  const invalido = !reglas || !Array.isArray(reglas.feriados)
    || NUMERICAS.some((k) => typeof reglas[k] !== "number" || !Number.isFinite(reglas[k]) || reglas[k] < 0)
    || reglas.horasOrdinariasDiarias === 0 || reglas.horasPeriodoSalario === 0;
  if (invalido) throw new NominaInvalida("Las reglas deben contener valores numéricos válidos");
  if (reglas.feriados.length > 60 || !reglas.feriados.every(esFechaReal)) {
    throw new NominaInvalida("Cada feriado debe ser una fecha real con formato AAAA-MM-DD");
  }
  // El original aceptaba retenciones de más del 100 %.
  if (reglas.retencionPorcentaje > 100) throw new NominaInvalida("La retención no puede superar 100%");
  if (reglas.horasOrdinariasDiarias > 24) throw new NominaInvalida("Las horas ordinarias no pueden superar 24 horas diarias");
  if (!politica) return;
  const l = politica.limites;
  if (reglas.horasOrdinariasDiarias > l.horasOrdinariasDiariasMax) throw new NominaInvalida(`En ${politica.nombre}, las horas ordinarias no pueden superar ${l.horasOrdinariasDiariasMax} horas diarias`);
  if (reglas.multiplicadorHoraExtra < l.multiplicadorHoraExtraMin) throw new NominaInvalida(`El multiplicador de hora extra para ${politica.nombre} debe ser al menos ${l.multiplicadorHoraExtraMin}`);
  if (reglas.multiplicadorFeriado < l.multiplicadorFeriadoMin) throw new NominaInvalida(`El multiplicador de feriado para ${politica.nombre} debe ser al menos ${l.multiplicadorFeriadoMin}`);
  if (reglas.recargoNocturnoPorcentaje > l.recargoNocturnoMax) throw new NominaInvalida(`El recargo nocturno no puede superar ${l.recargoNocturnoMax}%`);
}

export type JornadaDia = { dia: string; horas: number };

/**
 * Cálculo de un empleado. Las horas llegan sumadas por día local: el tope de
 * horas ordinarias es diario, así que dos turnos el mismo día se suman antes
 * de separar las extra (el original aplicaba el tope a cada turno por separado).
 */
export function calcularDetalle(
  empleado: { tipoPago: string; tarifaHora: string | null; salarioFijo: string | null },
  dias: JornadaDia[],
  reglas: NominaReglas,
) {
  let ordinarias = 0, extra = 0, feriado = 0;
  for (const { dia, horas } of dias) {
    if (reglas.feriados.includes(dia)) feriado += horas;
    else {
      ordinarias += Math.min(horas, reglas.horasOrdinariasDiarias);
      extra += Math.max(0, horas - reglas.horasOrdinariasDiarias);
    }
  }
  const fijo = Number(empleado.salarioFijo || 0);
  const tarifa = Number(empleado.tarifaHora || 0) || fijo / reglas.horasPeriodoSalario;
  const base = empleado.tipoPago === "por_hora" ? ordinarias * tarifa : fijo;
  const extras = extra * tarifa * reglas.multiplicadorHoraExtra;
  const feriados = feriado * tarifa * reglas.multiplicadorFeriado;
  const recargo = ((base + extras + feriados) * reglas.recargoNocturnoPorcentaje) / 100;
  const bruto = base + extras + feriados + recargo;
  const descuentos = Math.min(bruto, (bruto * reglas.retencionPorcentaje) / 100 + (bruto > 0 ? reglas.retencionFija : 0));
  return {
    horasTrabajadas: (ordinarias + extra + feriado).toFixed(2), tarifaHora: tarifa.toFixed(2), salarioBase: base.toFixed(2),
    horasOrdinarias: ordinarias.toFixed(2), horasExtra: extra.toFixed(2), horasFeriado: feriado.toFixed(2),
    bruto: bruto.toFixed(2), descuentos: descuentos.toFixed(2), ajustes: recargo.toFixed(2),
    total: Math.max(0, bruto - descuentos).toFixed(2), notas: recargo ? `Recargo aplicado: ${recargo.toFixed(2)}` : null,
  };
}
