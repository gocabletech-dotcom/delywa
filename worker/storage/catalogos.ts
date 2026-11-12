import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import {
  planes, suscripciones, colmados, tiposNegocioCatalogo, configuracionSistema, paises, metodosPago,
  deliveries, pedidos, ventas,
  type Plan, type Suscripcion, type TipoNegocioCatalogo,
  type ConfiguracionSistema, type Pais, type MetodosPago, type Colmado,
} from "@shared/schema";
import type { Db } from "../db";

// Tipos de inserción tomados de las tablas (los de zod solo validan en tiempo de ejecución).
export type InsertPlan = typeof planes.$inferInsert;
export type InsertSuscripcion = typeof suscripciones.$inferInsert;
export type InsertPais = typeof paises.$inferInsert;
export type InsertMetodosPago = typeof metodosPago.$inferInsert;

// ---------- Planes ----------
export const getAllPlanes = (db: Db): Promise<Plan[]> => db.select().from(planes).orderBy(planes.orden);
export const getPlanesActivos = (db: Db): Promise<Plan[]> =>
  db.select().from(planes).where(eq(planes.activo, true)).orderBy(planes.orden);
export async function getPlan(db: Db, id: number): Promise<Plan | undefined> {
  const [plan] = await db.select().from(planes).where(eq(planes.id, id));
  return plan;
}
export async function createPlan(db: Db, plan: InsertPlan): Promise<Plan> {
  const [created] = await db.insert(planes).values(plan).returning();
  return created;
}
export async function updatePlan(db: Db, id: number, data: Partial<InsertPlan>): Promise<Plan | undefined> {
  const [updated] = await db.update(planes).set(data).where(eq(planes.id, id)).returning();
  return updated;
}
export async function deletePlan(db: Db, id: number): Promise<void> {
  await db.delete(planes).where(eq(planes.id, id));
}
export async function countColmadosByPlan(db: Db, planId: number): Promise<number> {
  const rows = await db.select({ id: colmados.id }).from(colmados).where(eq(colmados.planId, planId));
  return rows.length;
}

// ---------- Suscripciones ----------
export async function getSuscripcionActiva(db: Db, colmadoId: number): Promise<Suscripcion | undefined> {
  const [suscripcion] = await db
    .select()
    .from(suscripciones)
    .where(and(eq(suscripciones.colmadoId, colmadoId), eq(suscripciones.estado, "activa")))
    .orderBy(desc(suscripciones.fechaCreacion))
    .limit(1);
  return suscripcion;
}
export async function createSuscripcion(db: Db, data: InsertSuscripcion): Promise<Suscripcion> {
  const [created] = await db.insert(suscripciones).values(data).returning();
  return created;
}
export async function cancelarSuscripcion(db: Db, id: number): Promise<void> {
  await db.update(suscripciones).set({ estado: "cancelada" }).where(eq(suscripciones.id, id));
}
export async function getSuscripcionesProximasAVencer(
  db: Db,
  diasAntes: number,
): Promise<Array<Suscripcion & { colmado: Colmado; plan: Plan }>> {
  const ahora = new Date();
  const fechaLimite = new Date(ahora.getTime() + diasAntes * 24 * 60 * 60 * 1000);
  const result = await db
    .select({ suscripcion: suscripciones, colmado: colmados, plan: planes })
    .from(suscripciones)
    .innerJoin(colmados, eq(suscripciones.colmadoId, colmados.id))
    .innerJoin(planes, eq(suscripciones.planId, planes.id))
    .where(and(eq(suscripciones.estado, "activa"), lte(suscripciones.fechaFin, fechaLimite), gt(suscripciones.fechaFin, ahora)));
  return result.map((r) => ({ ...r.suscripcion, colmado: r.colmado, plan: r.plan }));
}

// ---------- Tipos de negocio ----------
export const getTiposNegocio = (db: Db): Promise<TipoNegocioCatalogo[]> =>
  db.select().from(tiposNegocioCatalogo).orderBy(tiposNegocioCatalogo.orden);
export const getTiposNegocioActivos = (db: Db): Promise<TipoNegocioCatalogo[]> =>
  db.select().from(tiposNegocioCatalogo).where(eq(tiposNegocioCatalogo.activo, true)).orderBy(tiposNegocioCatalogo.orden);
export async function getTipoNegocioBySlug(db: Db, slug: string): Promise<TipoNegocioCatalogo | undefined> {
  const [tipo] = await db.select().from(tiposNegocioCatalogo).where(eq(tiposNegocioCatalogo.slug, slug));
  return tipo;
}
export async function createTipoNegocio(
  db: Db,
  data: { slug: string; nombre: string; descripcion?: string; icono?: string; orden?: number },
): Promise<TipoNegocioCatalogo> {
  const [tipo] = await db
    .insert(tiposNegocioCatalogo)
    .values({ slug: data.slug, nombre: data.nombre, descripcion: data.descripcion || null, icono: data.icono || null, orden: data.orden || 0, activo: true })
    .returning();
  return tipo;
}
export async function updateTipoNegocio(
  db: Db,
  id: number,
  data: { nombre?: string; descripcion?: string; icono?: string; activo?: boolean; orden?: number },
): Promise<TipoNegocioCatalogo | undefined> {
  const [tipo] = await db.update(tiposNegocioCatalogo).set(data).where(eq(tiposNegocioCatalogo.id, id)).returning();
  return tipo;
}
export async function deleteTipoNegocio(db: Db, id: number): Promise<void> {
  await db.delete(tiposNegocioCatalogo).where(eq(tiposNegocioCatalogo.id, id));
}

// ---------- Configuración del sistema ----------
/** Claves internas que nunca se devuelven por la API. */
export const CLAVES_PRIVADAS = new Set(["setup_code"]);
/** Llaves de servicios (OpenAI, Meta, Turnstile): solo se leen y guardan desde /api/admin/integraciones. */
export const esClavePrivada = (clave: string) => CLAVES_PRIVADAS.has(clave) || clave.startsWith("integracion:");

export async function getConfiguracion(db: Db, clave: string): Promise<ConfiguracionSistema | undefined> {
  const [config] = await db.select().from(configuracionSistema).where(eq(configuracionSistema.clave, clave));
  return config;
}
export async function getAllConfiguracion(db: Db): Promise<ConfiguracionSistema[]> {
  const all = await db.select().from(configuracionSistema);
  return all.filter((c) => !esClavePrivada(c.clave) && !c.clave.startsWith("zip_alert_cooldown"));
}
export async function upsertConfiguracion(
  db: Db,
  clave: string,
  valor: string,
  descripcion?: string,
  tipo = "texto",
): Promise<ConfiguracionSistema> {
  const [row] = await db
    .insert(configuracionSistema)
    .values({ clave, valor, descripcion: descripcion || "", tipo })
    .onConflictDoUpdate({
      target: configuracionSistema.clave,
      set: { valor, fechaModificacion: new Date(), ...(descripcion ? { descripcion } : {}) },
    })
    .returning();
  return row;
}

// ---------- Países ----------
export const getAllPaises = (db: Db): Promise<Pais[]> => db.select().from(paises).orderBy(paises.nombre);
export async function createPais(db: Db, data: InsertPais): Promise<Pais> {
  const [pais] = await db.insert(paises).values({ ...data, codigo: data.codigo.toUpperCase() }).returning();
  return pais;
}
export async function updatePais(db: Db, id: number, data: Partial<InsertPais>): Promise<Pais | undefined> {
  const updateData = { ...data };
  if (updateData.codigo) updateData.codigo = updateData.codigo.toUpperCase();
  const [pais] = await db.update(paises).set(updateData).where(eq(paises.id, id)).returning();
  return pais;
}
export async function deletePais(db: Db, id: number): Promise<void> {
  await db.delete(paises).where(eq(paises.id, id));
}

// ---------- Métodos de pago ----------
export async function getMetodosPago(db: Db, colmadoId: number): Promise<MetodosPago | undefined> {
  const [result] = await db.select().from(metodosPago).where(eq(metodosPago.colmadoId, colmadoId));
  return result;
}
export async function createOrUpdateMetodosPago(
  db: Db,
  colmadoId: number,
  data: Partial<Pick<InsertMetodosPago, "efectivo" | "transferencia" | "tarjeta" | "bancos">>,
): Promise<MetodosPago> {
  const set: Record<string, unknown> = { fechaModificacion: new Date() };
  for (const key of ["efectivo", "transferencia", "tarjeta", "bancos"] as const) {
    if (data[key] !== undefined) set[key] = data[key];
  }
  const [row] = await db
    .insert(metodosPago)
    .values({
      colmadoId,
      efectivo: data.efectivo ?? true,
      transferencia: data.transferencia ?? false,
      tarjeta: data.tarjeta ?? false,
      bancos: data.bancos ?? [],
    })
    .onConflictDoUpdate({ target: metodosPago.colmadoId, set })
    .returning();
  return row;
}

// ---------- Estadísticas de la plataforma ----------
export async function getPlatformStats(db: Db) {
  const [row] = await db
    .select({
      totalColmados: sql<number>`(SELECT count(*) FROM ${colmados})`,
      totalDeliveries: sql<number>`(SELECT count(*) FROM ${deliveries})`,
      totalPedidos: sql<number>`(SELECT count(*) FROM ${pedidos})`,
      totalVentas: sql<number>`(SELECT COALESCE(SUM(total_ventas), 0) FROM ${ventas})`,
    })
    .from(sql`(SELECT 1)`);
  return {
    totalColmados: Number(row.totalColmados),
    totalDeliveries: Number(row.totalDeliveries),
    totalPedidos: Number(row.totalPedidos),
    totalVentas: String(row.totalVentas ?? 0),
  };
}
