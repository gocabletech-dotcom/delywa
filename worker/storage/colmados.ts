import { eq, or } from "drizzle-orm";
import { colmados, paises, type Colmado } from "@shared/schema";
import type { Db } from "../db";
import { DEFAULT_TIMEZONE } from "../lib/horario";

export async function getColmado(db: Db, id: number): Promise<Colmado | undefined> {
  const [colmado] = await db.select().from(colmados).where(eq(colmados.id, id));
  return colmado;
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

/** Zona horaria IANA del negocio según su país; República Dominicana por defecto. */
export async function getColmadoTimezone(db: Db, colmado: { paisId?: number | null }): Promise<string> {
  if (colmado.paisId) {
    const [pais] = await db.select({ zonaHoraria: paises.zonaHoraria }).from(paises).where(eq(paises.id, colmado.paisId));
    if (pais?.zonaHoraria) return pais.zonaHoraria;
  }
  return DEFAULT_TIMEZONE;
}
