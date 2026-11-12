import type { Colmado } from "@shared/schema";
import { diaSemanaLocal, horaLocalEnDia, inicioDiaLocal } from "./fechas";

// Horario del portal del repartidor. El turno termina una hora después del
// cierre del negocio. El original usaba un desfase fijo de UTC-4 (República
// Dominicana); aquí se usa la zona horaria del país del negocio.

export const UNA_HORA_MS = 3_600_000;
const TODOS_LOS_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

type Horario = Pick<Colmado, "horaCierre" | "diasServicio">;

/** Cierre de hoy y de ayer (UTC ms), o null si ese día no hay servicio. */
export function cierresDelNegocio(colmado: Horario, timeZone: string, ahora = Date.now()) {
  const dias = (colmado.diasServicio as string[] | null) || TODOS_LOS_DIAS;
  const cierre = colmado.horaCierre || "22:00";
  const hoy = new Date(ahora);
  const ayer = new Date(inicioDiaLocal(timeZone, hoy).getTime() - 1);
  return {
    hoy: dias.includes(diaSemanaLocal(timeZone, hoy)) ? horaLocalEnDia(timeZone, cierre, hoy).getTime() : null,
    ayer: dias.includes(diaSemanaLocal(timeZone, ayer)) ? horaLocalEnDia(timeZone, cierre, ayer).getTime() : null,
  };
}

/** Ya pasó el cierre de hoy + 1 hora: no se permite entrar al portal. */
export function turnoTerminadoHoy(colmado: Horario, timeZone: string, ahora = Date.now()): boolean {
  const { hoy } = cierresDelNegocio(colmado, timeZone, ahora);
  return hoy !== null && ahora >= hoy + UNA_HORA_MS;
}

/**
 * La sesión del portal vence si pasó el cierre de hoy + 1 hora, o si se abrió
 * antes del cierre de ayer + 1 hora y ya pasó ese momento (turnos que cruzan la medianoche).
 */
export function sesionPortalVencida(colmado: Horario, timeZone: string, creadaEn: number | undefined, ahora = Date.now()): boolean {
  const { hoy, ayer } = cierresDelNegocio(colmado, timeZone, ahora);
  if (hoy !== null && ahora >= hoy + UNA_HORA_MS) return true;
  return !!creadaEn && ayer !== null && ahora >= ayer + UNA_HORA_MS && creadaEn < ayer + UNA_HORA_MS;
}

/** El negocio ya cerró pero el repartidor sigue dentro de la hora de gracia. */
export function ventanaDeGracia(colmado: Horario, timeZone: string, ahora = Date.now()): { enGracia: boolean; terminaEn: number | null } {
  const { hoy } = cierresDelNegocio(colmado, timeZone, ahora);
  if (hoy === null) return { enGracia: false, terminaEn: null };
  const enGracia = ahora >= hoy && ahora < hoy + UNA_HORA_MS;
  return { enGracia, terminaEn: enGracia ? hoy + UNA_HORA_MS : null };
}

const CARACTERES_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Código de acceso de 6 caracteres con aleatoriedad criptográfica (el original usaba Math.random). */
export function generarCodigoAcceso(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  // 256 no es múltiplo de 32: se usan los 5 bits bajos para no sesgar la distribución.
  return Array.from(bytes, (b) => CARACTERES_CODIGO[b & 31]).join("");
}
