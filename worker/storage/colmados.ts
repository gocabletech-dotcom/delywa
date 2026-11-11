import { and, desc, eq, not, or } from "drizzle-orm";
import {
  colmados, paises, users, menuPlantillas, menuPlantillaItems, menuProductos,
  type Colmado, type Pais, type TecnologiasHabilitadas,
} from "@shared/schema";
import type { Db } from "../db";
import { DEFAULT_TIMEZONE } from "../lib/horario";
import { chunkRows } from "../lib/d1";

export type InsertColmado = Omit<typeof colmados.$inferInsert, "id" | "fechaSuscripcion" | "slug">;

export async function getColmado(db: Db, id: number): Promise<Colmado | undefined> {
  const [colmado] = await db.select().from(colmados).where(eq(colmados.id, id));
  return colmado;
}

export async function getAllColmados(db: Db): Promise<Colmado[]> {
  return db.select().from(colmados).orderBy(desc(colmados.fechaSuscripcion));
}

export async function getAllColmadoIds(db: Db): Promise<number[]> {
  const rows = await db.select({ id: colmados.id }).from(colmados);
  return rows.map((row) => row.id);
}

/** Sucursales del dueño: su negocio principal y las que cuelgan de él. */
export async function getSucursalesByOwner(db: Db, ownerUserId: string): Promise<Colmado[]> {
  const [principal] = await db
    .select()
    .from(colmados)
    .where(eq(colmados.ownerUserId, ownerUserId))
    .orderBy(colmados.id)
    .limit(1);
  if (!principal) return [];
  return db
    .select()
    .from(colmados)
    .where(or(eq(colmados.id, principal.id), eq(colmados.negocioPrincipalId, principal.id)))
    .orderBy(colmados.id);
}

export async function isOwnerOfColmado(db: Db, ownerUserId: string, colmadoId: number): Promise<boolean> {
  return (await getSucursalesByOwner(db, ownerUserId)).some((sucursal) => sucursal.id === colmadoId);
}

export async function getPais(db: Db, id: number): Promise<Pais | undefined> {
  const [pais] = await db.select().from(paises).where(eq(paises.id, id));
  return pais;
}

/** Zona horaria IANA del negocio según su país; República Dominicana por defecto. */
export async function getColmadoTimezone(db: Db, colmado: { paisId?: number | null }): Promise<string> {
  if (colmado.paisId) {
    const pais = await getPais(db, colmado.paisId);
    if (pais?.zonaHoraria) return pais.zonaHoraria;
  }
  return DEFAULT_TIMEZONE;
}

export async function enrichColmadoWithMoneda<T extends { paisId?: number | null }>(db: Db, colmado: T) {
  let simboloMoneda = "RD$";
  let monedaNombre = "Peso Dominicano";
  let codigoPais = "DO";
  if (colmado.paisId) {
    const pais = await getPais(db, colmado.paisId);
    if (pais?.simboloMoneda) simboloMoneda = pais.simboloMoneda;
    if (pais?.moneda) monedaNombre = pais.moneda;
    if (pais?.codigo) codigoPais = pais.codigo;
  }
  return { ...colmado, simboloMoneda, monedaNombre, codigoPais };
}

/**
 * Quita las credenciales antes de enviar un negocio al navegador.
 * `conAcceso` = el usuario administra ese negocio; el público nunca recibe
 * llaves de Evolution, el prompt del bot ni el id del dueño.
 */
export function toSafeColmado<T extends Partial<Colmado>>(colmado: T, conAcceso: boolean) {
  const { whatsappAccessToken, evolutionApiKey, evolutionApiUrl, botPromptCustom, ownerUserId, ...publico } = colmado;
  const whatsappConfigured = Boolean(colmado.whatsappPhoneNumberId && whatsappAccessToken);
  if (!conAcceso) return { ...publico, whatsappConfigured };
  return { ...publico, evolutionApiKey, evolutionApiUrl, botPromptCustom, ownerUserId, whatsappConfigured };
}

// ---------- Slugs ----------

export function generateSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureUniqueSlug(db: Db, baseSlug: string, excludeId?: number): Promise<string> {
  const base = baseSlug || "negocio";
  let slug = base;
  for (let counter = 1; ; counter++) {
    const where = excludeId ? and(eq(colmados.slug, slug), not(eq(colmados.id, excludeId))) : eq(colmados.slug, slug);
    const [existing] = await db.select({ id: colmados.id }).from(colmados).where(where).limit(1);
    if (!existing) return slug;
    slug = `${base}-${counter}`;
  }
}

// ---------- Altas, cambios y bajas ----------

export async function createColmado(db: Db, data: InsertColmado): Promise<Colmado> {
  const slug = await ensureUniqueSlug(db, generateSlug(data.nombre));
  const [colmado] = await db.insert(colmados).values({ ...data, slug }).returning();
  return colmado;
}

export async function updateColmado(
  db: Db,
  id: number,
  data: Partial<Omit<Colmado, "id" | "fechaSuscripcion">>,
): Promise<Colmado | undefined> {
  const [updated] = await db.update(colmados).set(data).where(eq(colmados.id, id)).returning();
  return updated;
}

export async function updateColmadoTecnologias(db: Db, id: number, tecnologias: TecnologiasHabilitadas): Promise<void> {
  await db.update(colmados).set({ tecnologiasHabilitadas: tecnologias }).where(eq(colmados.id, id));
}

export async function updateColmadoWhatsappConfig(db: Db, id: number, phoneNumberId: string, accessToken: string): Promise<void> {
  const colmado = await getColmado(db, id);
  await db
    .update(colmados)
    .set({
      whatsappPhoneNumberId: phoneNumberId,
      whatsappAccessToken: accessToken,
      whatsappProvider: "meta",
      tecnologiasHabilitadas: { ...(colmado?.tecnologiasHabilitadas || {}), meta: true },
    })
    .where(eq(colmados.id, id));
}

export async function setColmadoEstado(db: Db, id: number, estado: string): Promise<Colmado | null> {
  const [updated] = await db.update(colmados).set({ estado }).where(eq(colmados.id, id)).returning();
  return updated || null;
}

export async function assignColmadoOwner(db: Db, colmadoId: number, ownerUserId: string): Promise<void> {
  await db.batch([
    db.update(colmados).set({ ownerUserId }).where(eq(colmados.id, colmadoId)),
    db.update(users).set({ role: "colmado_owner", colmadoId, updatedAt: new Date() }).where(eq(users.id, ownerUserId)),
  ]);
}

/**
 * Borra el negocio (las tablas hijas caen en cascada) y su usuario dueño,
 * salvo que ese dueño todavía tenga otra sucursal.
 */
export async function deleteColmado(db: Db, id: number): Promise<void> {
  const colmado = await getColmado(db, id);
  if (!colmado) return;
  await db.delete(colmados).where(eq(colmados.id, id));
  if (colmado.ownerUserId) {
    const [otra] = await db.select({ id: colmados.id }).from(colmados).where(eq(colmados.ownerUserId, colmado.ownerUserId)).limit(1);
    if (!otra) await db.delete(users).where(eq(users.id, colmado.ownerUserId));
  }
}

/** Crea una sucursal que hereda la configuración del negocio principal. */
export async function createSucursal(db: Db, principalId: number, data: Partial<InsertColmado>): Promise<Colmado> {
  const principal = await getColmado(db, principalId);
  if (!principal) throw new Error("Negocio principal no encontrado");
  const nombre = data.nombre?.trim() || `${principal.nombre} - Nueva sucursal`;
  const slug = await ensureUniqueSlug(db, generateSlug(nombre));
  const [sucursal] = await db
    .insert(colmados)
    .values({
      nombre,
      slug,
      whatsappNumero: data.whatsappNumero || `${principal.whatsappNumero}-${Date.now()}`,
      direccion: data.direccion || principal.direccion,
      ciudad: data.ciudad ?? principal.ciudad,
      provincia: data.provincia ?? principal.provincia,
      codigoPostal: data.codigoPostal ?? principal.codigoPostal,
      planId: principal.planId,
      estado: "activo",
      ownerUserId: principal.ownerUserId,
      tipoNegocio: data.tipoNegocio || principal.tipoNegocio,
      impuesto: data.impuesto ?? principal.impuesto,
      logo: data.logo ?? principal.logo,
      colorPrimario: data.colorPrimario ?? principal.colorPrimario,
      descripcion: data.descripcion ?? principal.descripcion,
      encargadoNombre: data.encargadoNombre ?? principal.encargadoNombre,
      telefonoAlternativo: data.telefonoAlternativo ?? principal.telefonoAlternativo,
      latitud: data.latitud ?? principal.latitud,
      longitud: data.longitud ?? principal.longitud,
      costoDelivery: data.costoDelivery ?? principal.costoDelivery,
      radioEntrega: data.radioEntrega ?? principal.radioEntrega,
      tiempoEstimado: data.tiempoEstimado ?? principal.tiempoEstimado,
      pedidoMinimo: data.pedidoMinimo ?? principal.pedidoMinimo,
      horaApertura: data.horaApertura ?? principal.horaApertura,
      horaCierre: data.horaCierre ?? principal.horaCierre,
      diasServicio: data.diasServicio ?? principal.diasServicio,
      estaAbiertoManual: data.estaAbiertoManual ?? principal.estaAbiertoManual,
      mensajeCerrado: data.mensajeCerrado ?? principal.mensajeCerrado,
      mensajeBienvenida: data.mensajeBienvenida ?? principal.mensajeBienvenida,
      mensajeConfirmacion: data.mensajeConfirmacion ?? principal.mensajeConfirmacion,
      paisId: data.paisId ?? principal.paisId,
      tecnologiasHabilitadas: data.tecnologiasHabilitadas ?? principal.tecnologiasHabilitadas,
      botPromptCustom: data.botPromptCustom ?? principal.botPromptCustom,
      negocioPrincipalId: principal.negocioPrincipalId || principal.id,
    })
    .returning();
  return sucursal;
}

/** Copia al negocio los productos de la plantilla de menú de su tipo. */
export async function aplicarPlantillaMenu(db: Db, colmadoId: number, tipoNegocio: string): Promise<number> {
  const rows = await db
    .select({ categoria: menuPlantillas.categoria, item: menuPlantillaItems })
    .from(menuPlantillaItems)
    .innerJoin(menuPlantillas, eq(menuPlantillaItems.plantillaId, menuPlantillas.id))
    .where(eq(menuPlantillas.tipoNegocio, tipoNegocio))
    .orderBy(menuPlantillas.orden, menuPlantillaItems.orden);
  const productos = rows.map(({ categoria, item }) => ({
    colmadoId,
    nombre: item.nombre,
    descripcion: item.descripcion,
    precio: item.precioSugerido,
    categoria,
    disponible: true,
    orden: item.orden,
  }));
  if (!productos.length) return 0;
  const inserts = chunkRows(productos, 7).map((chunk) => db.insert(menuProductos).values(chunk));
  await db.batch(inserts as [typeof inserts[0], ...typeof inserts]);
  return productos.length;
}
