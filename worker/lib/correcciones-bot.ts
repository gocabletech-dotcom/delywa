import { and, desc, eq } from "drizzle-orm";
import { botCorrecciones, chatWebSesiones, diccionarioJerga, type Colmado } from "@shared/schema";
import type { Db } from "../db";
import { aprenderJerga, normalizar } from "./jerga";
import { sonido } from "../bot/productos";

// Fase 4: el bot aprende de las correcciones del colmadero.
// Cuando el colmadero cambia el nombre de un producto de un pedido del chat («Una fria» → «Presidente
// grande»), se guarda. Si la misma corrección se repite en pedidos distintos, el bot la aprende para
// ese colmado (diccionario propio); para el país queda «esperando» hasta que la plataforma la apruebe.
// Una sola vez puede ser una sustitución («no había Pepsi, le puse Coca»), por eso se espera a la segunda.
// El colmadero ve lo aprendido en Configuración → Lo que aprendió el bot, y puede olvidarlo o enseñarlo ya.

export const VECES_PARA_APRENDER = 2;

/** «Ajo (RD$10)» → «Ajo»; «Arroz (libras)» → «Arroz». */
export function sinDetalle(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
}

/** ¿Es solo ortografía o mayúsculas? Entonces no hay nada que aprender. */
function mismaPalabra(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b) || normalizar(a).split(" ").map(sonido).join(" ") === normalizar(b).split(" ").map(sonido).join(" ");
}

export type Correccion = { dicho: string; producto: string };

/** Solo los pedidos que salieron del chat de la página (el texto es del cliente, no del colmadero). */
export async function esPedidoDelChat(db: Db, pedidoId: number): Promise<boolean> {
  const [s] = await db.select({ id: chatWebSesiones.id }).from(chatWebSesiones).where(eq(chatWebSesiones.pedidoId, pedidoId)).limit(1);
  return Boolean(s);
}

export async function aprenderDeCorrecciones(db: Db, colmado: Pick<Colmado, "id" | "tipoNegocio" | "paisId">, pedidoId: number, cambios: Correccion[]): Promise<number> {
  let aprendidas = 0;
  const vistos = new Set<string>();
  for (const cambio of cambios.slice(0, 30)) {
    const dicho = normalizar(sinDetalle(cambio.dicho)).replace(/[^a-z0-9ñ\s]/g, " ").replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    const producto = sinDetalle(cambio.producto).slice(0, 80);
    if (dicho.length < 3 || !producto || dicho.split(" ").length > 6 || mismaPalabra(dicho, producto)) continue;
    if (vistos.has(`${dicho}|${normalizar(producto)}`)) continue;
    vistos.add(`${dicho}|${normalizar(producto)}`);
    const [antes] = await db.select().from(botCorrecciones)
      .where(and(eq(botCorrecciones.colmadoId, colmado.id), eq(botCorrecciones.dicho, dicho), eq(botCorrecciones.producto, producto)));
    if (antes?.estado === "descartada") continue;
    let fila = antes;
    if (!antes) {
      [fila] = await db.insert(botCorrecciones).values({ colmadoId: colmado.id, dicho, producto, ultimoPedidoId: pedidoId }).returning();
    } else if (antes.ultimoPedidoId !== pedidoId) {
      // Solo cuenta una vez por pedido (editar el mismo pedido dos veces no es repetirse).
      [fila] = await db.update(botCorrecciones).set({ veces: antes.veces + 1, ultimoPedidoId: pedidoId, fecha: new Date() })
        .where(eq(botCorrecciones.id, antes.id)).returning();
    }
    if (fila && fila.estado === "esperando" && fila.veces >= VECES_PARA_APRENDER) {
      await ensenar(db, colmado, fila.id, dicho, producto);
      aprendidas++;
    }
  }
  return aprendidas;
}

export async function ensenar(db: Db, colmado: Pick<Colmado, "id" | "tipoNegocio" | "paisId">, id: number, dicho: string, producto: string) {
  await aprenderJerga(db, colmado, dicho, producto, undefined, { promover: false });
  await db.update(botCorrecciones).set({ estado: "aprendida" }).where(eq(botCorrecciones.id, id));
}

/** Olvidar: sale del diccionario del colmado y no se vuelve a aprender sola. */
export async function olvidar(db: Db, colmadoId: number, id: number) {
  const [fila] = await db.select().from(botCorrecciones).where(and(eq(botCorrecciones.id, id), eq(botCorrecciones.colmadoId, colmadoId)));
  if (!fila) return false;
  if (fila.estado === "aprendida") {
    await db.delete(diccionarioJerga).where(and(eq(diccionarioJerga.colmadoId, colmadoId), eq(diccionarioJerga.jerga, fila.dicho), eq(diccionarioJerga.productoIdentificado, fila.producto)));
  }
  await db.update(botCorrecciones).set({ estado: "descartada" }).where(eq(botCorrecciones.id, id));
  return true;
}

export async function listaCorrecciones(db: Db, colmadoId: number) {
  return db.select({ id: botCorrecciones.id, dicho: botCorrecciones.dicho, producto: botCorrecciones.producto, veces: botCorrecciones.veces, estado: botCorrecciones.estado, fecha: botCorrecciones.fecha })
    .from(botCorrecciones).where(eq(botCorrecciones.colmadoId, colmadoId)).orderBy(desc(botCorrecciones.fecha)).limit(100);
}
