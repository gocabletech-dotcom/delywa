import { sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export const soloDigitos = (numero: string) => numero.replace(/\D/g, "");

/**
 * Compara un número guardado con uno recibido usando solo los dígitos.
 * Los pedidos viejos pueden tener "+", espacios o guiones; los webhooks traen
 * solo dígitos. SQLite no tiene regexp_replace: se quitan los separadores comunes.
 */
export function mismoTelefono(column: SQLiteColumn, numero: string): SQL {
  const digitos = soloDigitos(numero);
  return sql`replace(replace(replace(replace(replace(replace(${column}, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '') = ${digitos}`;
}
