import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  menuProductos, menuProductoSucursales, menuPlantillas, menuPlantillaItems, diccionarioJerga, plantillasJerga,
  productosRestringidos, paises,
  type MenuProducto, type MenuProductoSucursal, type MenuPlantilla, type MenuPlantillaItem, type DiccionarioJerga,
  type PlantillaJerga, type ProductoRestringido,
} from "@shared/schema";
import type { Db } from "../db";
import { chunkRows } from "../lib/d1";
import { getColmado } from "./colmados";

export type InsertMenuProducto = typeof menuProductos.$inferInsert;
export type InsertPlantillaJerga = typeof plantillasJerga.$inferInsert;
export type InsertProductoRestringido = typeof productosRestringidos.$inferInsert;
type BatchItem = Parameters<Db["batch"]>[0][number];

/** Colmados y colmadones toman pedidos de forma libre, sin menú estructurado. */
export const TIPOS_SIN_MENU = ["colmado", "colmadon"];
export const tieneMenuPermitido = (tipoNegocio: string) => !TIPOS_SIN_MENU.includes(tipoNegocio);

async function runBatch(db: Db, statements: BatchItem[]): Promise<void> {
  if (statements.length) await db.batch(statements as [BatchItem, ...BatchItem[]]);
}

// ---------- Productos ----------

/**
 * Menú efectivo de una sucursal: sus productos propios más los del negocio
 * principal, con el precio, disponibilidad e inventario propios de la sucursal.
 */
export async function getMenuProductos(db: Db, colmadoId: number): Promise<MenuProducto[]> {
  const colmado = await getColmado(db, colmadoId);
  const principalId = colmado?.negocioPrincipalId || colmadoId;
  const productos = await db
    .select()
    .from(menuProductos)
    .where(or(eq(menuProductos.colmadoId, colmadoId), eq(menuProductos.colmadoId, principalId)))
    .orderBy(asc(menuProductos.orden), asc(menuProductos.nombre));
  if (principalId === colmadoId || productos.length === 0) return productos;

  const overrides = await db.select().from(menuProductoSucursales).where(eq(menuProductoSucursales.sucursalId, colmadoId));
  const byProduct = new Map(overrides.map((o) => [o.menuProductoId, o]));
  return productos.map((producto) => {
    const override = byProduct.get(producto.id);
    if (!override) return producto;
    return {
      ...producto,
      precio: override.precio ?? producto.precio,
      disponible: override.disponible ?? producto.disponible,
      inventario: override.inventario ?? producto.inventario,
    };
  });
}

export async function getCategorias(db: Db, colmadoId: number): Promise<string[]> {
  const colmado = await getColmado(db, colmadoId);
  const principalId = colmado?.negocioPrincipalId || colmadoId;
  const rows = await db
    .selectDistinct({ categoria: menuProductos.categoria })
    .from(menuProductos)
    .where(or(eq(menuProductos.colmadoId, colmadoId), eq(menuProductos.colmadoId, principalId)))
    .orderBy(menuProductos.categoria);
  return rows.map((r) => r.categoria);
}

export async function getMenuProducto(db: Db, id: number): Promise<MenuProducto | undefined> {
  const [producto] = await db.select().from(menuProductos).where(eq(menuProductos.id, id));
  return producto;
}

export async function createMenuProducto(db: Db, data: InsertMenuProducto): Promise<MenuProducto> {
  const [created] = await db.insert(menuProductos).values(data).returning();
  return created;
}

export async function updateMenuProducto(db: Db, id: number, data: Partial<InsertMenuProducto>): Promise<MenuProducto | undefined> {
  const [updated] = await db.update(menuProductos).set(data).where(eq(menuProductos.id, id)).returning();
  return updated;
}

export async function deleteMenuProducto(db: Db, id: number): Promise<void> {
  await db.delete(menuProductos).where(eq(menuProductos.id, id));
}

export async function upsertMenuProductoSucursal(
  db: Db,
  productoId: number,
  sucursalId: number,
  data: { precio?: string | null; disponible?: boolean | null; inventario?: number | null },
): Promise<MenuProductoSucursal> {
  const set: Record<string, unknown> = { fechaModificacion: new Date() };
  for (const key of ["precio", "disponible", "inventario"] as const) if (data[key] !== undefined) set[key] = data[key];
  const [row] = await db
    .insert(menuProductoSucursales)
    .values({ menuProductoId: productoId, sucursalId, ...data })
    .onConflictDoUpdate({ target: [menuProductoSucursales.menuProductoId, menuProductoSucursales.sucursalId], set })
    .returning();
  return row;
}

/**
 * Reemplaza el menú de la sucursal destino por una copia del menú efectivo de
 * la sucursal origen. Todo se ejecuta en un solo batch atómico de D1.
 */
export async function copiarMenuASucursal(
  db: Db,
  sourceSucursalId: number,
  targetSucursalId: number,
): Promise<{ copied: number; removed: number }> {
  if (sourceSucursalId === targetSucursalId) throw new Error("La sucursal origen y destino deben ser diferentes");

  const sourceProducts = await getMenuProductos(db, sourceSucursalId);
  const targetProducts = await db.select({ id: menuProductos.id }).from(menuProductos).where(eq(menuProductos.colmadoId, targetSucursalId));
  // Productos que la sucursal destino ya hereda de su negocio principal: no se
  // duplican, se copia su precio, disponibilidad e inventario como variación local.
  const targetBranch = await getColmado(db, targetSucursalId);
  const targetCatalogIds = targetBranch?.negocioPrincipalId
    ? new Set(
        (await db.select({ id: menuProductos.id }).from(menuProductos).where(eq(menuProductos.colmadoId, targetBranch.negocioPrincipalId)))
          .map((p) => p.id),
      )
    : new Set<number>();
  const inheritedToOverride = sourceProducts.filter((p) => targetCatalogIds.has(p.id));
  const toInsert = sourceProducts.filter((p) => !targetCatalogIds.has(p.id));

  const statements: BatchItem[] = [
    // Las variaciones por sucursal de esos productos caen en cascada.
    db.delete(menuProductos).where(eq(menuProductos.colmadoId, targetSucursalId)),
  ];
  const nuevos = toInsert.map((p) => ({
    colmadoId: targetSucursalId,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio,
    categoria: p.categoria,
    imagen: p.imagen,
    disponible: p.disponible,
    inventario: p.inventario,
    orden: p.orden,
  }));
  for (const chunk of chunkRows(nuevos, 9)) statements.push(db.insert(menuProductos).values(chunk));
  const overrides = inheritedToOverride.map((p) => ({
    menuProductoId: p.id,
    sucursalId: targetSucursalId,
    precio: p.precio,
    disponible: p.disponible,
    inventario: p.inventario,
  }));
  for (const chunk of chunkRows(overrides, 6)) {
    statements.push(
      db.insert(menuProductoSucursales).values(chunk).onConflictDoUpdate({
        target: [menuProductoSucursales.menuProductoId, menuProductoSucursales.sucursalId],
        set: {
          precio: sqlExcluded("precio"),
          disponible: sqlExcluded("disponible"),
          inventario: sqlExcluded("inventario"),
          fechaModificacion: new Date(),
        },
      }),
    );
  }
  await runBatch(db, statements);
  return { copied: nuevos.length + overrides.length, removed: targetProducts.length };
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// ---------- Plantillas de menú ----------

type PlantillaConItems = MenuPlantilla & { items: MenuPlantillaItem[] };

async function withItems(db: Db, plantillas: MenuPlantilla[], soloActivos: boolean): Promise<PlantillaConItems[]> {
  if (!plantillas.length) return [];
  const ids = plantillas.map((p) => p.id);
  const items: MenuPlantillaItem[] = [];
  for (const chunk of chunkRows(ids, 1)) {
    const where = soloActivos
      ? and(inArray(menuPlantillaItems.plantillaId, chunk), eq(menuPlantillaItems.activo, true))
      : inArray(menuPlantillaItems.plantillaId, chunk);
    items.push(...(await db.select().from(menuPlantillaItems).where(where).orderBy(menuPlantillaItems.orden)));
  }
  return plantillas.map((p) => ({ ...p, items: items.filter((i) => i.plantillaId === p.id) }));
}

export async function getPlantillasByTipoNegocio(db: Db, tipoNegocio: string): Promise<PlantillaConItems[]> {
  const plantillas = await db
    .select()
    .from(menuPlantillas)
    .where(and(eq(menuPlantillas.tipoNegocio, tipoNegocio), eq(menuPlantillas.activo, true)))
    .orderBy(menuPlantillas.orden);
  return withItems(db, plantillas, true);
}

export async function getAllPlantillas(db: Db): Promise<PlantillaConItems[]> {
  const plantillas = await db.select().from(menuPlantillas).orderBy(menuPlantillas.tipoNegocio, menuPlantillas.orden);
  return withItems(db, plantillas, false);
}

// ---------- Diccionario de jerga del negocio ----------

export async function getDiccionarioByColmado(db: Db, colmadoId: number): Promise<DiccionarioJerga[]> {
  return db.select().from(diccionarioJerga).where(eq(diccionarioJerga.colmadoId, colmadoId)).orderBy(desc(diccionarioJerga.vecesUsado));
}

export async function getJerga(db: Db, id: number): Promise<DiccionarioJerga | undefined> {
  const [row] = await db.select().from(diccionarioJerga).where(eq(diccionarioJerga.id, id));
  return row;
}

export async function updateJerga(
  db: Db,
  id: number,
  data: Partial<Pick<DiccionarioJerga, "jerga" | "productoIdentificado" | "precioSugerido">>,
): Promise<DiccionarioJerga | undefined> {
  const [updated] = await db.update(diccionarioJerga).set(data).where(eq(diccionarioJerga.id, id)).returning();
  return updated;
}

export async function deleteJerga(db: Db, id: number): Promise<void> {
  await db.delete(diccionarioJerga).where(eq(diccionarioJerga.id, id));
}

/** Plantillas globales (sin país) más las del país del negocio. */
export async function getPlantillasJergaForColmado(db: Db, tipoNegocio: string, paisId: number | null): Promise<PlantillaJerga[]> {
  return db
    .select()
    .from(plantillasJerga)
    .where(and(
      eq(plantillasJerga.tipoNegocio, tipoNegocio),
      paisId !== null ? or(isNull(plantillasJerga.paisId), eq(plantillasJerga.paisId, paisId)) : isNull(plantillasJerga.paisId),
    ))
    .orderBy(plantillasJerga.jerga);
}

/** Copia al diccionario del negocio las expresiones de plantilla que aún no tiene. */
export async function copiarPlantillasJergaAColmado(db: Db, colmadoId: number): Promise<number> {
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return 0;
  let paisId = colmado.paisId ?? null;
  if (paisId === null) {
    const [rd] = await db.select({ id: paises.id }).from(paises).where(eq(paises.codigo, "DO"));
    paisId = rd?.id ?? null;
  }
  const plantillas = (await getPlantillasJergaForColmado(db, colmado.tipoNegocio, paisId)).filter((p) => p.activo);
  const existentes = new Set((await getDiccionarioByColmado(db, colmadoId)).map((j) => j.jerga.toLowerCase()));
  const nuevas = new Map<string, typeof diccionarioJerga.$inferInsert>();
  for (const p of plantillas) {
    const jerga = p.jerga.toLowerCase();
    if (existentes.has(jerga) || nuevas.has(jerga)) continue;
    nuevas.set(jerga, { colmadoId, jerga, productoIdentificado: p.productoIdentificado, precioSugerido: p.precioSugerido, vecesUsado: 0 });
  }
  const rows = [...nuevas.values()];
  await runBatch(db, chunkRows(rows, 5).map((chunk) => db.insert(diccionarioJerga).values(chunk)));
  return rows.length;
}

// ---------- Plantillas de jerga (plataforma) ----------

export const getAllPlantillasJerga = (db: Db): Promise<PlantillaJerga[]> =>
  db.select().from(plantillasJerga).orderBy(plantillasJerga.tipoNegocio, plantillasJerga.jerga);
export const getPlantillasJerga = (db: Db, tipoNegocio: string): Promise<PlantillaJerga[]> =>
  db.select().from(plantillasJerga).where(eq(plantillasJerga.tipoNegocio, tipoNegocio)).orderBy(plantillasJerga.jerga);
export const getPlantillasJergaByPais = (db: Db, paisId: number): Promise<PlantillaJerga[]> =>
  db.select().from(plantillasJerga).where(eq(plantillasJerga.paisId, paisId)).orderBy(plantillasJerga.tipoNegocio, plantillasJerga.jerga);
export async function createPlantillaJerga(db: Db, data: InsertPlantillaJerga): Promise<PlantillaJerga> {
  const [row] = await db.insert(plantillasJerga).values(data).returning();
  return row;
}
export async function updatePlantillaJerga(db: Db, id: number, data: Partial<InsertPlantillaJerga>): Promise<PlantillaJerga | undefined> {
  const [row] = await db.update(plantillasJerga).set(data).where(eq(plantillasJerga.id, id)).returning();
  return row;
}
export async function deletePlantillaJerga(db: Db, id: number): Promise<void> {
  await db.delete(plantillasJerga).where(eq(plantillasJerga.id, id));
}

// ---------- Productos restringidos (verificación de edad) ----------

export const getProductosRestringidos = (db: Db): Promise<ProductoRestringido[]> =>
  db.select().from(productosRestringidos).orderBy(productosRestringidos.categoria, productosRestringidos.palabraClave);
export async function createProductoRestringido(db: Db, data: InsertProductoRestringido): Promise<ProductoRestringido> {
  const [row] = await db.insert(productosRestringidos).values(data).returning();
  return row;
}
export async function updateProductoRestringido(
  db: Db,
  id: number,
  data: Partial<InsertProductoRestringido>,
): Promise<ProductoRestringido | undefined> {
  const [row] = await db.update(productosRestringidos).set(data).where(eq(productosRestringidos.id, id)).returning();
  return row;
}
export async function deleteProductoRestringido(db: Db, id: number): Promise<void> {
  await db.delete(productosRestringidos).where(eq(productosRestringidos.id, id));
}
