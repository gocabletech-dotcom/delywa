import { and, eq, isNull, or } from "drizzle-orm";
import { conocimientoArchivos, type Colmado } from "@shared/schema";
import type { Db } from "../db";

// Conocimiento del bot por niveles (plataforma, país y negocio) y solo la parte que sirve.
// Antes se mandaba entero, en cada mensaje, todo lo del tipo de negocio. Ahora:
//  1. Se juntan las entradas del negocio (y su principal), de su país y de toda la plataforma.
//  2. Cada entrada se parte en trozos (párrafos o preguntas).
//  3. Se eligen los trozos que comparten más palabras con lo que escribió el cliente, con preferencia
//     por lo del negocio, luego lo del país y al final lo general, hasta un tope de caracteres.
// Sin mensaje (o sin coincidencias) van primero las preguntas del negocio, hasta el mismo tope.

export const TOPE_CONOCIMIENTO = { caracteres: 3500, trozos: 6 };
export const NIVELES = ["plataforma", "pais", "negocio"] as const;
export type Nivel = (typeof NIVELES)[number];

const VACIAS = new Set("a al algo alguna alguno ante como con cual cuando de del desde donde el ella en entre es esa ese eso esta este esto fue ha hay la las le lo los mas me mi muy no o para pero por que se si sin su sus te tengo ti tu un una uno unos y ya yo hola buenas buenos dias tardes noches favor quiero dame tiene tienen venden vende venta usted ustedes puedo pueden hacen".split(" "));

export function palabras(texto: string): string[] {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/).filter((p) => p.length > 2 && !VACIAS.has(p)).map((p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p));
}

export function nivelDe(e: { paisId: number | null; colmadoId: number | null }): Nivel {
  return e.colmadoId ? "negocio" : e.paisId ? "pais" : "plataforma";
}

/** Parte un texto en trozos: por línea en blanco, y si queda muy largo, por línea. */
function trozos(texto: string): string[] {
  return texto.split(/\n\s*\n/).flatMap((b) => (b.length > 700 ? b.split(/\n/) : [b])).map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 1200));
}

export async function conocimientoRelevante(db: Db, colmado: Pick<Colmado, "id" | "tipoNegocio" | "paisId" | "negocioPrincipalId">, mensaje?: string | null) {
  const tipo = colmado.tipoNegocio || "colmado";
  const negocios = [colmado.id, colmado.negocioPrincipalId].filter((x): x is number => Boolean(x));
  const filas = await db.select().from(conocimientoArchivos).where(or(
    // Del negocio (o de su principal), sin importar el tipo.
    ...negocios.map((id) => eq(conocimientoArchivos.colmadoId, id)),
    // Del tipo de negocio: generales y del país del negocio.
    and(eq(conocimientoArchivos.tipoNegocio, tipo), isNull(conocimientoArchivos.colmadoId),
      colmado.paisId ? or(isNull(conocimientoArchivos.paisId), eq(conocimientoArchivos.paisId, colmado.paisId)) : isNull(conocimientoArchivos.paisId)),
  )).orderBy(conocimientoArchivos.fechaCreacion);

  const buscadas = new Set(palabras(mensaje ?? ""));
  const peso: Record<Nivel, number> = { negocio: 3, pais: 2, plataforma: 1 };
  const candidatos = filas.flatMap((f) => {
    const nivel = nivelDe(f);
    const delTitulo = new Set(palabras(f.nombre));
    return trozos(f.contenido).map((t, orden) => {
      const suyas = new Set([...palabras(t), ...delTitulo]);
      const coinciden = [...buscadas].filter((p) => suyas.has(p)).length;
      return { nombre: f.nombre, contenido: t, nivel, coinciden, puntos: coinciden * 10 + peso[nivel], orden };
    });
  });
  // Con un trozo que comparte 2 palabras o más, los que comparten una sola sobran.
  const mejor = Math.max(0, ...candidatos.map((c) => c.coinciden));
  const conCoincidencia = candidatos.filter((c) => c.coinciden > 0 && c.coinciden >= Math.min(mejor, 2));
  const elegibles = (conCoincidencia.length ? conCoincidencia : candidatos.filter((c) => c.nivel === "negocio"))
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden);

  const elegidos: Array<{ nombre: string; contenido: string }> = [];
  let usados = 0;
  for (const c of elegibles) {
    if (elegidos.length >= TOPE_CONOCIMIENTO.trozos || usados + c.contenido.length > TOPE_CONOCIMIENTO.caracteres) continue;
    // Trozos del mismo documento van juntos bajo su título.
    const previo = elegidos.find((e) => e.nombre === c.nombre);
    if (previo) previo.contenido += `\n\n${c.contenido}`;
    else elegidos.push({ nombre: c.nombre, contenido: c.contenido });
    usados += c.contenido.length;
  }
  return elegidos;
}

/** Texto listo para el prompt del bot del chat de la página (vacío si no hay nada que sirva). */
export async function conocimientoParaPrompt(db: Db, colmado: Parameters<typeof conocimientoRelevante>[1], mensaje: string): Promise<string> {
  const partes = await conocimientoRelevante(db, colmado, mensaje);
  return partes.map((p) => `${p.nombre}:\n${p.contenido}`).join("\n\n");
}
