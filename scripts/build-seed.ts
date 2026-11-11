// Genera migrations/0001_seed.sql con los datos base de la plataforma.
// Uso: npm run db:seed:build
import { writeFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  paises, tiposNegocioCatalogo, planes, configuracionSistema, mensajesSistema,
  botIntenciones, menuPlantillas, menuPlantillaItems,
} from "../shared/schema";
import { tiposNegocioSeed, planesSeed, configuracionSistemaSeed, menuPlantillasSeed } from "../shared/seed-data";
import { paisesDefault, mensajesSistemaDefault, botIntencionesDefault, zipAlertConfigDefault } from "../shared/seed-defaults";

function lit(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return lit(JSON.stringify(value));
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insert(table: SQLiteTable, row: Record<string, unknown>, extra: Record<string, string> = {}): string {
  const columns = getTableColumns(table);
  const names: string[] = [];
  const values: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const column = columns[key as keyof typeof columns];
    if (!column) throw new Error(`Columna desconocida ${getTableName(table)}.${key}`);
    names.push(`\`${column.name}\``);
    values.push(lit(value));
  }
  for (const [name, expr] of Object.entries(extra)) {
    names.push(`\`${name}\``);
    values.push(expr);
  }
  return `INSERT OR IGNORE INTO \`${getTableName(table)}\` (${names.join(", ")}) VALUES (${values.join(", ")});`;
}

const out: string[] = ["-- Datos base de Delywa. Archivo generado por scripts/build-seed.ts; no editar a mano."];
const section = (title: string) => out.push("", `-- ${title}`);

section("Países");
for (const row of paisesDefault) out.push(insert(paises, row));
section("Tipos de negocio");
for (const row of tiposNegocioSeed) out.push(insert(tiposNegocioCatalogo, row));
section("Planes");
for (const row of planesSeed) out.push(insert(planes, row));
section("Configuración del sistema");
for (const row of [...configuracionSistemaSeed, ...zipAlertConfigDefault]) out.push(insert(configuracionSistema, row));
section("Mensajes del sistema");
for (const row of mensajesSistemaDefault) out.push(insert(mensajesSistema, row));
section("Intenciones del bot");
for (const row of botIntencionesDefault) out.push(insert(botIntenciones, row));
section("Plantillas de menú");
for (const { plantilla, items } of menuPlantillasSeed) {
  out.push(insert(menuPlantillas, plantilla));
  const parent = `(SELECT id FROM menu_plantillas WHERE tipo_negocio = ${lit(plantilla.tipoNegocio)} AND categoria = ${lit(plantilla.categoria)} ORDER BY id DESC LIMIT 1)`;
  for (const item of items) out.push(insert(menuPlantillaItems, item, { plantilla_id: parent }));
}

writeFileSync(new URL("../migrations/0001_seed.sql", import.meta.url), out.join("\n") + "\n");
console.log(`0001_seed.sql: ${out.filter((l) => l.startsWith("INSERT")).length} filas`);
