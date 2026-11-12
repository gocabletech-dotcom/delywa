import { and, eq, isNull, or, sql } from "drizzle-orm";
import { diccionarioJerga, jergaAprendizaje, paises, plantillasJerga, type Colmado } from "@shared/schema";
import type { Db } from "../db";
import { getConfiguracion } from "../storage/catalogos";

// Diccionario de jerga compartido por país.
//
// - Cada colmado tiene su diccionario propio (diccionario_jerga): lo que aprende el bot ahí,
//   con el precio de ese colmado.
// - Todos los colmados de un país usan además el diccionario del país (plantillas_jerga):
//   el que carga la plataforma y lo que aprendieron los demás colmados.
// - Cada palabra nueva que aprende el bot en un colmado se anota en jerga_aprendizaje.
//   Cuando la misma palabra para el mismo producto aparece en suficientes colmados distintos
//   (por defecto 2, se cambia en Plataforma → Jerga), entra sola al diccionario del país.
//   Así una palabra rara de un solo cliente no se le enseña a todo el país.

export const CLAVE_UMBRAL = "jerga_umbral_colmados";
export const UMBRAL_POR_DEFECTO = 2;
const MAX_EN_PROMPT = 30;
const VIGENCIA_CACHE_MS = 60_000;

export type JergaEncontrada = {
  /** "n:<id>" diccionario del colmado, "p:<id>" diccionario del país. */
  id: string;
  jerga: string;
  productoIdentificado: string;
  precioSugerido: string | null;
  origen: "negocio" | "pais";
};

/** Minúsculas, sin tildes y con espacios simples: "Fría" y "fria" son la misma palabra. */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** La expresión aparece como palabra completa ("pan" no coincide dentro de "pantalón"). */
export function contieneExpresion(textoNormalizado: string, jerga: string): boolean {
  const j = normalizar(jerga);
  if (j.length < 2) return false;
  const escapada = j.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escapada}($|[^a-z0-9])`).test(textoNormalizado);
}

/** País del colmado; si no tiene, República Dominicana (el software está hecho para RD). */
export async function paisDelColmado(db: Db, colmado: Pick<Colmado, "paisId">): Promise<number | null> {
  if (colmado.paisId) return colmado.paisId;
  const [rd] = await db.select({ id: paises.id }).from(paises).where(eq(paises.codigo, "DO"));
  return rd?.id ?? null;
}

type FilaPais = { id: number; jerga: string; productoIdentificado: string; precioSugerido: string | null; origen: string };
const cache = new Map<string, { hasta: number; filas: FilaPais[] }>();

export function olvidarCacheJerga(): void {
  cache.clear();
}

/** Diccionario activo del país para un tipo de negocio (más las expresiones globales sin país). */
export async function diccionarioDelPais(db: Db, tipoNegocio: string, paisId: number | null): Promise<FilaPais[]> {
  const clave = `${tipoNegocio}:${paisId ?? "-"}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.filas;
  const filas = await db
    .select({ id: plantillasJerga.id, jerga: plantillasJerga.jerga, productoIdentificado: plantillasJerga.productoIdentificado, precioSugerido: plantillasJerga.precioSugerido, origen: plantillasJerga.origen })
    .from(plantillasJerga)
    .where(and(
      eq(plantillasJerga.tipoNegocio, tipoNegocio),
      eq(plantillasJerga.activo, true),
      paisId !== null ? or(isNull(plantillasJerga.paisId), eq(plantillasJerga.paisId, paisId)) : isNull(plantillasJerga.paisId),
    ));
  cache.set(clave, { hasta: Date.now() + VIGENCIA_CACHE_MS, filas });
  return filas;
}

/**
 * Expresiones de jerga que aparecen en el mensaje del cliente: primero las del colmado
 * (con su precio), luego las del país. Si una palabra está en los dos, gana la del colmado.
 */
export async function buscarJerga(db: Db, colmado: Pick<Colmado, "id" | "tipoNegocio" | "paisId">, texto: string): Promise<JergaEncontrada[]> {
  const t = normalizar(texto);
  if (!t) return [];
  const paisId = await paisDelColmado(db, colmado);
  const [propias, delPais] = await Promise.all([
    db.select().from(diccionarioJerga).where(eq(diccionarioJerga.colmadoId, colmado.id)),
    diccionarioDelPais(db, colmado.tipoNegocio || "colmado", paisId),
  ]);
  const vistas = new Set<string>();
  const resultado: JergaEncontrada[] = [];
  for (const e of propias) {
    const clave = normalizar(e.jerga);
    if (vistas.has(clave) || !contieneExpresion(t, e.jerga)) continue;
    vistas.add(clave);
    resultado.push({ id: `n:${e.id}`, jerga: e.jerga, productoIdentificado: e.productoIdentificado, precioSugerido: e.precioSugerido, origen: "negocio" });
  }
  for (const e of delPais) {
    const clave = normalizar(e.jerga);
    if (vistas.has(clave) || !contieneExpresion(t, e.jerga)) continue;
    vistas.add(clave);
    // El precio de lo aprendido en otro colmado no aplica aquí; el de la plataforma es solo una referencia.
    resultado.push({ id: `p:${e.id}`, jerga: e.jerga, productoIdentificado: e.productoIdentificado, precioSugerido: e.origen === "manual" ? e.precioSugerido : null, origen: "pais" });
  }
  // Las expresiones más largas primero ("una fría grande" antes que "fría").
  return resultado.sort((a, b) => b.jerga.length - a.jerga.length).slice(0, MAX_EN_PROMPT);
}

export async function incrementarUsoJerga(db: Db, id: string | number): Promise<void> {
  const [origen, numero] = typeof id === "number" ? ["n", id] : [id.slice(0, 1), Number(id.slice(2))];
  if (!Number.isInteger(numero)) return;
  if (origen === "p") {
    await db.update(plantillasJerga).set({ vecesUsado: sql`${plantillasJerga.vecesUsado} + 1` }).where(eq(plantillasJerga.id, numero));
  } else {
    await db.update(diccionarioJerga).set({ vecesUsado: sql`coalesce(${diccionarioJerga.vecesUsado}, 1) + 1`, ultimoUso: new Date() }).where(eq(diccionarioJerga.id, numero));
  }
}

export async function umbralColmados(db: Db): Promise<number> {
  const valor = Number((await getConfiguracion(db, CLAVE_UMBRAL))?.valor);
  return Number.isInteger(valor) && valor >= 1 && valor <= 50 ? valor : UMBRAL_POR_DEFECTO;
}

/** Cuántos colmados distintos del país usan esa palabra para ese producto. */
export async function colmadosQueLaUsan(db: Db, paisId: number, tipoNegocio: string, jerga: string, producto: string): Promise<number> {
  const [fila] = await db.select({ total: sql<number>`count(distinct ${jergaAprendizaje.colmadoId})` }).from(jergaAprendizaje).where(and(
    eq(jergaAprendizaje.paisId, paisId), eq(jergaAprendizaje.tipoNegocio, tipoNegocio),
    eq(jergaAprendizaje.jerga, jerga), eq(jergaAprendizaje.productoIdentificado, producto),
  ));
  return Number(fila?.total ?? 0);
}

/**
 * Pasa una palabra aprendida al diccionario del país si ya la usan suficientes colmados.
 * No toca lo que cargó la plataforma ni lo que la plataforma descartó (activo = false).
 */
export async function promoverSiCorresponde(db: Db, paisId: number, tipoNegocio: string, jerga: string, producto: string): Promise<boolean> {
  const n = await colmadosQueLaUsan(db, paisId, tipoNegocio, jerga, producto);
  const [existente] = await db.select().from(plantillasJerga).where(and(
    eq(plantillasJerga.tipoNegocio, tipoNegocio), eq(plantillasJerga.paisId, paisId), eq(plantillasJerga.jerga, jerga),
  ));
  if (existente) {
    // Ya está en el país: solo se actualiza el conteo si es la misma aprendida.
    if (existente.origen === "aprendida" && existente.activo && existente.productoIdentificado === producto) {
      await db.update(plantillasJerga).set({ colmadosAprendida: n }).where(eq(plantillasJerga.id, existente.id));
    }
    return false;
  }
  if (n < (await umbralColmados(db))) return false;
  await db.insert(plantillasJerga).values({
    tipoNegocio, paisId, jerga, productoIdentificado: producto, precioSugerido: null, activo: true,
    origen: "aprendida", colmadosAprendida: n, descripcion: "Aprendida de los colmados",
  });
  olvidarCacheJerga();
  return true;
}

/** Lo que aprendió el bot en un colmado: va a su diccionario y alimenta el del país. */
export async function aprenderJerga(db: Db, colmado: Pick<Colmado, "id" | "tipoNegocio" | "paisId">, jergaCruda: string, productoCrudo: string, precio?: string) {
  const jerga = normalizar(jergaCruda).slice(0, 80);
  const producto = productoCrudo.trim().slice(0, 120);
  if (jerga.length < 3 || !producto || jerga === normalizar(producto)) return null;

  // 1. Diccionario propio del colmado (con su precio).
  const [existente] = await db.select().from(diccionarioJerga).where(and(eq(diccionarioJerga.colmadoId, colmado.id), eq(diccionarioJerga.jerga, jerga)));
  let entrada;
  if (existente) {
    const veces = (existente.vecesUsado || 1) + 1;
    await db.update(diccionarioJerga).set({ productoIdentificado: producto, precioSugerido: precio || existente.precioSugerido, vecesUsado: veces, ultimoUso: new Date() })
      .where(eq(diccionarioJerga.id, existente.id));
    entrada = { ...existente, productoIdentificado: producto, vecesUsado: veces };
  } else {
    [entrada] = await db.insert(diccionarioJerga).values({ colmadoId: colmado.id, jerga, productoIdentificado: producto, precioSugerido: precio, vecesUsado: 1 }).returning();
  }

  // 2. Aprendizaje del país.
  const paisId = await paisDelColmado(db, colmado);
  if (paisId !== null) {
    const tipo = colmado.tipoNegocio || "colmado";
    await db.insert(jergaAprendizaje).values({ paisId, tipoNegocio: tipo, jerga, productoIdentificado: producto, colmadoId: colmado.id })
      .onConflictDoUpdate({
        target: [jergaAprendizaje.paisId, jergaAprendizaje.tipoNegocio, jergaAprendizaje.jerga, jergaAprendizaje.productoIdentificado, jergaAprendizaje.colmadoId],
        set: { vecesUsado: sql`${jergaAprendizaje.vecesUsado} + 1`, ultimoUso: new Date() },
      });
    await promoverSiCorresponde(db, paisId, tipo, jerga, producto);
  }
  return entrada;
}
