import { SQLiteNumeric } from "drizzle-orm/sqlite-core";

// PostgreSQL devolvía las columnas decimal como texto con escala fija ("75.00").
// SQLite/D1 las devuelve como número (75). Para que la API y las pantallas sigan
// recibiendo exactamente lo mismo, toda columna numeric se convierte a texto con
// su escala al leerla: 7 decimales para coordenadas y 2 para dinero y horas.
const COORDENADA = /latitud|longitud/;

export function formatDecimal(columnName: string, value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(COORDENADA.test(columnName) ? 7 : 2);
}

const proto = SQLiteNumeric.prototype as unknown as {
  name: string;
  mapFromDriverValue(value: unknown): unknown;
  mapToDriverValue(value: unknown): unknown;
};

proto.mapFromDriverValue = function (value: unknown) {
  return value === null || value === undefined ? value : formatDecimal(this.name, value);
};

// Al guardar se envía como número para que SUM, ORDER BY y las comparaciones
// de SQLite sean numéricas.
proto.mapToDriverValue = function (value: unknown) {
  if (typeof value !== "string") return value;
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : value;
};
