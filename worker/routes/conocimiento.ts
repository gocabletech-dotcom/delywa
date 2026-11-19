import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { conocimientoArchivos } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES } from "../lib/permisos";
import { negocioPrincipalId } from "../lib/certificacion";
import { nivelDe } from "../lib/conocimiento";
import { getColmado } from "../storage/colmados";

// Conocimiento del bot por niveles (decisión del 2026-11-18):
//  - Plataforma → Conocimiento: entradas para todos los negocios de un tipo, o solo para un país.
//  - Negocio → Configuración → Chat y bot: las preguntas frecuentes propias del colmado.
// El bot solo recibe la parte que tiene que ver con cada mensaje (lib/conocimiento.ts).

export const conocimientoRoutes = new Hono<AppEnv>();

export const LIMITES_PREGUNTAS = { cantidad: 30, pregunta: 200, respuesta: 1500 };
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- Negocio: preguntas frecuentes ----------

const ruta = "/api/colmados/:id/preguntas-frecuentes";
conocimientoRoutes.use(ruta, requireAuth, requireBusinessAccess());
conocimientoRoutes.use(`${ruta}/*`, requireAuth, requireBusinessAccess());
const soloAdministradores = async (c: any, next: () => Promise<void>) => {
  if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero cambian las preguntas frecuentes." }, 403);
  await next();
};
conocimientoRoutes.use(ruta, soloAdministradores);
conocimientoRoutes.use(`${ruta}/*`, soloAdministradores);

/** Las preguntas son del negocio principal: valen para todas sus sucursales. */
async function principal(c: any): Promise<number | null> {
  return negocioPrincipalId(getDb(c.env.DB), Number(c.req.param("id")));
}

const lista = async (db: ReturnType<typeof getDb>, colmadoId: number) =>
  (await db.select().from(conocimientoArchivos).where(eq(conocimientoArchivos.colmadoId, colmadoId)).orderBy(conocimientoArchivos.id))
    .map((f) => ({ id: f.id, pregunta: f.nombre, respuesta: f.contenido }));

conocimientoRoutes.get(ruta, async (c) => {
  const id = await principal(c);
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  return c.json({ preguntas: await lista(getDb(c.env.DB), id), limites: LIMITES_PREGUNTAS });
});

conocimientoRoutes.post(ruta, async (c) => {
  const db = getDb(c.env.DB);
  const id = await principal(c);
  const negocio = id ? await getColmado(db, id) : undefined;
  if (!id || !negocio) return c.json({ error: "Negocio no encontrado" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const pregunta = texto(body.pregunta, LIMITES_PREGUNTAS.pregunta);
  const respuesta = texto(body.respuesta, LIMITES_PREGUNTAS.respuesta);
  if (!pregunta || !respuesta) return c.json({ error: "Escribe la pregunta y la respuesta." }, 400);
  if ((await lista(db, id)).length >= LIMITES_PREGUNTAS.cantidad) return c.json({ error: `Máximo ${LIMITES_PREGUNTAS.cantidad} preguntas por negocio.` }, 400);
  await db.insert(conocimientoArchivos).values({ tipoNegocio: negocio.tipoNegocio || "colmado", colmadoId: id, nombre: pregunta, contenido: respuesta });
  return c.json({ preguntas: await lista(db, id) }, 201);
});

conocimientoRoutes.put(`${ruta}/:preguntaId`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await principal(c);
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const pregunta = texto(body.pregunta, LIMITES_PREGUNTAS.pregunta);
  const respuesta = texto(body.respuesta, LIMITES_PREGUNTAS.respuesta);
  if (!pregunta || !respuesta) return c.json({ error: "Escribe la pregunta y la respuesta." }, 400);
  const r = await db.update(conocimientoArchivos).set({ nombre: pregunta, contenido: respuesta })
    .where(and(eq(conocimientoArchivos.id, Number(c.req.param("preguntaId")) || 0), eq(conocimientoArchivos.colmadoId, id))).returning();
  if (!r.length) return c.json({ error: "Pregunta no encontrada" }, 404);
  return c.json({ preguntas: await lista(db, id) });
});

conocimientoRoutes.delete(`${ruta}/:preguntaId`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await principal(c);
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  await db.delete(conocimientoArchivos).where(and(eq(conocimientoArchivos.id, Number(c.req.param("preguntaId")) || 0), eq(conocimientoArchivos.colmadoId, id)));
  return c.json({ preguntas: await lista(db, id) });
});

// ---------- Plataforma: general o por país ----------

conocimientoRoutes.use("/api/admin/conocimiento-niveles/*", requireAuth, requireAdmin);
conocimientoRoutes.use("/api/admin/conocimiento-niveles", requireAuth, requireAdmin);

/** Lista del tipo de negocio, con su nivel. No incluye las preguntas de cada negocio. */
conocimientoRoutes.get("/api/admin/conocimiento-niveles/:tipoNegocio", async (c) => {
  const filas = await getDb(c.env.DB).select().from(conocimientoArchivos)
    .where(and(eq(conocimientoArchivos.tipoNegocio, c.req.param("tipoNegocio")), isNull(conocimientoArchivos.colmadoId)))
    .orderBy(desc(conocimientoArchivos.fechaCreacion));
  return c.json(filas.map((f) => ({ ...f, nivel: nivelDe(f) })));
});

conocimientoRoutes.post("/api/admin/conocimiento-niveles", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const tipoNegocio = texto(body.tipoNegocio, 60);
  const nombre = texto(body.nombre, 160);
  const contenido = typeof body.contenido === "string" ? body.contenido.trim() : "";
  const paisId = Number(body.paisId) || null;
  if (!tipoNegocio || !nombre || !contenido) return c.json({ error: "Tipo de negocio, nombre y contenido son obligatorios" }, 400);
  if (contenido.length > 100_000) return c.json({ error: "El contenido no puede superar 100,000 caracteres" }, 400);
  const [fila] = await getDb(c.env.DB).insert(conocimientoArchivos).values({ tipoNegocio, nombre, contenido, paisId }).returning();
  return c.json({ ...fila, nivel: nivelDe(fila) }, 201);
});
