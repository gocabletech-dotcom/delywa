import { Hono, type Context } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { jergaAprendizaje, paises, plantillasJerga } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { CLAVE_UMBRAL, colmadosQueLaUsan, normalizar, olvidarCacheJerga, umbralColmados } from "../lib/jerga";
import { upsertConfiguracion } from "../storage/catalogos";

// Plataforma → Jerga: lo que aprendieron los colmados de cada país.
// Las palabras que ya usan suficientes colmados entran solas al diccionario del país;
// aquí se ven todas, y la plataforma puede aprobar antes de tiempo o descartar.

export const jergaAprendidaRoutes = new Hono<AppEnv>();
jergaAprendidaRoutes.use("/api/admin/jerga-aprendida", requireAuth, requireAdmin);
jergaAprendidaRoutes.use("/api/admin/jerga-aprendida/*", requireAuth, requireAdmin);

jergaAprendidaRoutes.get("/api/admin/jerga-aprendida", async (c) => {
  const db = getDb(c.env.DB);
  const paisId = Number(c.req.query("paisId")) || null;
  const grupos = await db
    .select({
      paisId: jergaAprendizaje.paisId, tipoNegocio: jergaAprendizaje.tipoNegocio, jerga: jergaAprendizaje.jerga,
      productoIdentificado: jergaAprendizaje.productoIdentificado,
      colmados: sql<number>`count(distinct ${jergaAprendizaje.colmadoId})`,
      veces: sql<number>`sum(${jergaAprendizaje.vecesUsado})`,
      ultimoUso: sql<number>`max(${jergaAprendizaje.ultimoUso})`,
    })
    .from(jergaAprendizaje)
    .where(paisId ? eq(jergaAprendizaje.paisId, paisId) : undefined)
    .groupBy(jergaAprendizaje.paisId, jergaAprendizaje.tipoNegocio, jergaAprendizaje.jerga, jergaAprendizaje.productoIdentificado)
    .orderBy(desc(sql`count(distinct ${jergaAprendizaje.colmadoId})`), desc(sql`max(${jergaAprendizaje.ultimoUso})`))
    .limit(500);
  const delPais = await db.select().from(plantillasJerga).where(paisId ? eq(plantillasJerga.paisId, paisId) : undefined);
  const listaPaises = await db.select({ id: paises.id, nombre: paises.nombre, bandera: paises.bandera }).from(paises);
  const umbral = await umbralColmados(db);
  return c.json({
    umbral,
    palabras: grupos.map((g) => {
      const enPais = delPais.find((p) => p.paisId === g.paisId && p.tipoNegocio === g.tipoNegocio && p.jerga === g.jerga);
      let estado: "en_pais" | "descartada" | "otro_producto" | "pendiente" = "pendiente";
      if (enPais && !enPais.activo) estado = "descartada";
      else if (enPais && enPais.productoIdentificado === g.productoIdentificado) estado = "en_pais";
      else if (enPais) estado = "otro_producto";
      const pais = listaPaises.find((p) => p.id === g.paisId);
      return {
        ...g, colmados: Number(g.colmados), veces: Number(g.veces), ultimoUso: Number(g.ultimoUso),
        paisNombre: pais?.nombre ?? null, paisBandera: pais?.bandera ?? null,
        estado, productoEnPais: enPais && enPais.activo ? enPais.productoIdentificado : null,
      };
    }),
  });
});

async function grupo(c: Context<AppEnv>) {
  const body = ((await c.req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const paisId = Number(body.paisId);
  const tipoNegocio = typeof body.tipoNegocio === "string" ? body.tipoNegocio.trim() : "";
  const jerga = typeof body.jerga === "string" ? normalizar(body.jerga) : "";
  const productoIdentificado = typeof body.productoIdentificado === "string" ? body.productoIdentificado.trim().slice(0, 120) : "";
  if (!Number.isInteger(paisId) || !tipoNegocio || !jerga || !productoIdentificado) return null;
  return { paisId, tipoNegocio, jerga, productoIdentificado };
}

/** Aprobar: entra al diccionario del país ya (o reemplaza lo descartado / el otro producto). */
jergaAprendidaRoutes.post("/api/admin/jerga-aprendida/aprobar", async (c) => {
  const g = await grupo(c);
  if (!g) return c.json({ error: "Datos incompletos" }, 400);
  const db = getDb(c.env.DB);
  const n = await colmadosQueLaUsan(db, g.paisId, g.tipoNegocio, g.jerga, g.productoIdentificado);
  const [existente] = await db.select().from(plantillasJerga).where(and(
    eq(plantillasJerga.paisId, g.paisId), eq(plantillasJerga.tipoNegocio, g.tipoNegocio), eq(plantillasJerga.jerga, g.jerga),
  ));
  if (existente) {
    await db.update(plantillasJerga).set({ productoIdentificado: g.productoIdentificado, activo: true, colmadosAprendida: n, precioSugerido: existente.productoIdentificado === g.productoIdentificado ? existente.precioSugerido : null })
      .where(eq(plantillasJerga.id, existente.id));
  } else {
    await db.insert(plantillasJerga).values({ ...g, precioSugerido: null, activo: true, origen: "aprendida", colmadosAprendida: n, descripcion: "Aprendida de los colmados (aprobada por la plataforma)" });
  }
  olvidarCacheJerga();
  return c.json({ success: true });
});

/** Descartar: no se usa en el país y no vuelve a entrar sola. */
jergaAprendidaRoutes.post("/api/admin/jerga-aprendida/descartar", async (c) => {
  const g = await grupo(c);
  if (!g) return c.json({ error: "Datos incompletos" }, 400);
  const db = getDb(c.env.DB);
  const [existente] = await db.select().from(plantillasJerga).where(and(
    eq(plantillasJerga.paisId, g.paisId), eq(plantillasJerga.tipoNegocio, g.tipoNegocio), eq(plantillasJerga.jerga, g.jerga),
  ));
  if (existente) {
    if (existente.productoIdentificado !== g.productoIdentificado && existente.activo) {
      return c.json({ error: "En el país esa palabra ya significa otro producto; descartarla quitaría ese significado. Edítala en la lista de jerga del país." }, 409);
    }
    await db.update(plantillasJerga).set({ activo: false }).where(eq(plantillasJerga.id, existente.id));
  } else {
    await db.insert(plantillasJerga).values({ ...g, precioSugerido: null, activo: false, origen: "aprendida", descripcion: "Descartada por la plataforma" });
  }
  olvidarCacheJerga();
  return c.json({ success: true });
});

jergaAprendidaRoutes.put("/api/admin/jerga-aprendida/umbral", async (c) => {
  const body = ((await c.req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const umbral = Number(body.umbral);
  if (!Number.isInteger(umbral) || umbral < 1 || umbral > 50) return c.json({ error: "El número de colmados debe estar entre 1 y 50" }, 400);
  await upsertConfiguracion(getDb(c.env.DB), CLAVE_UMBRAL, String(umbral), "Colmados distintos que deben usar una palabra para que entre al diccionario del país", "numero");
  return c.json({ success: true, umbral });
});
