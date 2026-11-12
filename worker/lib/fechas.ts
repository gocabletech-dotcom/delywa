// Fechas por zona horaria del negocio. SQLite no tiene AT TIME ZONE, así que
// los rangos de "un día local" se calculan aquí y se consultan como intervalos UTC.

const DIA_MS = 24 * 60 * 60 * 1000;

function partes(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Diferencia en ms entre la hora local de la zona y UTC en ese instante. */
function offsetMs(timeZone: string, date: Date): number {
  const p = partes(timeZone, date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" de la fecha en la zona horaria indicada. */
export function fechaLocal(timeZone: string, date: Date = new Date()): string {
  const p = partes(timeZone, date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Instante UTC en que empieza el día local que contiene `date`. */
export function inicioDiaLocal(timeZone: string, date: Date = new Date()): Date {
  const p = partes(timeZone, date);
  const guess = Date.UTC(p.y, p.m - 1, p.d);
  let inicio = guess - offsetMs(timeZone, new Date(guess));
  // Corrección por cambio de horario en ese día.
  inicio = guess - offsetMs(timeZone, new Date(inicio));
  return new Date(inicio);
}

export function rangoDiaLocal(timeZone: string, date: Date = new Date()): { desde: Date; hasta: Date } {
  const desde = inicioDiaLocal(timeZone, date);
  const siguiente = inicioDiaLocal(timeZone, new Date(desde.getTime() + DIA_MS + 2 * 60 * 60 * 1000));
  return { desde, hasta: siguiente };
}
