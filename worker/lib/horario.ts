import type { Colmado } from "@shared/schema";

export const DEFAULT_TIMEZONE = "America/Santo_Domingo";
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const TODOS_LOS_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export function formatTo12Hour(time24: string): string {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

type HorarioColmado = Pick<
  Colmado,
  "estaAbiertoManual" | "mensajeCerrado" | "horaApertura" | "horaCierre" | "diasServicio"
>;

/** Indica si el negocio está abierto ahora, según su horario y zona horaria. */
export function isColmadoAbierto(
  colmado: HorarioColmado,
  timezone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): { abierto: boolean; mensaje: string } {
  if (colmado.estaAbiertoManual === false) {
    return { abierto: false, mensaje: colmado.mensajeCerrado || "Estamos cerrados. Abrimos pronto." };
  }

  const localTime = new Date(now.toLocaleString("en-US", { timeZone: timezone || DEFAULT_TIMEZONE }));
  const currentTimeMinutes = localTime.getHours() * 60 + localTime.getMinutes();

  const [openHour, openMinute] = (colmado.horaApertura || "08:00").split(":").map(Number);
  const [closeHour, closeMinute] = (colmado.horaCierre || "22:00").split(":").map(Number);
  const openTimeMinutes = openHour * 60 + openMinute;
  const closeTimeMinutes = closeHour * 60 + closeMinute;

  const currentDay = DIAS_SEMANA[localTime.getDay()];
  const diasServicio = (colmado.diasServicio as string[] | null) || TODOS_LOS_DIAS;
  const cierre = colmado.mensajeCerrado || "";

  if (!diasServicio.includes(currentDay)) {
    const proximoDia = diasServicio[0] || "mañana";
    return { abierto: false, mensaje: `Hoy no abrimos. Volvemos el ${proximoDia}. ${cierre}`.trim() };
  }
  if (currentTimeMinutes < openTimeMinutes) {
    const apertura = formatTo12Hour(colmado.horaApertura || "08:00");
    return { abierto: false, mensaje: `Aún no abrimos. Abrimos a las ${apertura}. ${cierre}`.trim() };
  }
  if (currentTimeMinutes >= closeTimeMinutes) {
    const apertura = formatTo12Hour(colmado.horaApertura || "08:00");
    return { abierto: false, mensaje: `Ya cerramos. Abrimos mañana a las ${apertura}. ${cierre}`.trim() };
  }
  return { abierto: true, mensaje: "" };
}
