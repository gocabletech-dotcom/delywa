import { Hono } from "hono";
import { fromZodError } from "zod-validation-error";
import { insertPlanSchema } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth, requireBusinessAccess } from "../lib/auth";
import { isUniqueViolation, isValidZipPattern } from "../lib/d1";
import { getColmado } from "../storage/colmados";
import {
  cancelarSuscripcion, esClavePrivada, countColmadosByPlan, createPais, createPlan, createSuscripcion, createTipoNegocio,
  deletePais, deletePlan, deleteTipoNegocio, getAllConfiguracion, getAllPaises, getAllPlanes, getConfiguracion, getPlan,
  getPlanesActivos, getSuscripcionActiva, getSuscripcionesProximasAVencer, getTipoNegocioBySlug, getTiposNegocio,
  getTiposNegocioActivos, updatePais, updatePlan, updateTipoNegocio, type InsertPlan,
} from "../storage/catalogos";

const DIA_MS = 24 * 60 * 60 * 1000;

export const catalogoRoutes = new Hono<AppEnv>();

// ---------- Catálogos públicos ----------

catalogoRoutes.get("/api/paises", async (c) => {
  return c.json((await getAllPaises(getDb(c.env.DB))).filter((p) => p.activo));
});

catalogoRoutes.get("/api/tipos-negocio", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(c.req.query("activos") === "true" ? await getTiposNegocioActivos(db) : await getTiposNegocio(db));
});

catalogoRoutes.get("/api/tipos-negocio/:slug", async (c) => {
  const tipo = await getTipoNegocioBySlug(getDb(c.env.DB), c.req.param("slug"));
  return tipo ? c.json(tipo) : c.json({ error: "Tipo de negocio no encontrado" }, 404);
});

catalogoRoutes.get("/api/planes", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(c.req.query("activos") === "true" ? await getPlanesActivos(db) : await getAllPlanes(db));
});

catalogoRoutes.get("/api/planes/:id", async (c) => {
  const plan = await getPlan(getDb(c.env.DB), Number(c.req.param("id")));
  return plan ? c.json(plan) : c.json({ error: "Plan no encontrado" }, 404);
});

// ---------- Configuración del sistema (solo plataforma) ----------

catalogoRoutes.get("/api/configuracion", requireAuth, requireAdmin, async (c) => c.json(await getAllConfiguracion(getDb(c.env.DB))));

catalogoRoutes.get("/api/configuracion/:clave", requireAuth, requireAdmin, async (c) => {
  const clave = c.req.param("clave");
  const config = esClavePrivada(clave) ? undefined : await getConfiguracion(getDb(c.env.DB), clave);
  return config ? c.json(config) : c.json({ error: "Configuración no encontrada" }, 404);
});

// ---------- Planes (solo plataforma) ----------

catalogoRoutes.post("/api/planes", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo administradores pueden crear planes" }, 403);
  const result = insertPlanSchema.safeParse(await c.req.json().catch(() => null));
  if (!result.success) return c.json({ error: fromZodError(result.error).message }, 400);
  try {
    return c.json(await createPlan(getDb(c.env.DB), result.data as InsertPlan), 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ya existe un plan con ese identificador" }, 409);
    throw error;
  }
});

catalogoRoutes.patch("/api/planes/:id", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo administradores pueden editar planes" }, 403);
  const result = insertPlanSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!result.success) return c.json({ error: fromZodError(result.error).message }, 400);
  if (Object.keys(result.data).length === 0) return c.json({ error: "Se requiere al menos un campo" }, 400);
  try {
    const plan = await updatePlan(getDb(c.env.DB), Number(c.req.param("id")), result.data as Partial<InsertPlan>);
    return plan ? c.json(plan) : c.json({ error: "Plan no encontrado" }, 404);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ya existe un plan con ese identificador" }, 409);
    throw error;
  }
});

catalogoRoutes.delete("/api/planes/:id", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo administradores pueden eliminar planes" }, 403);
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const enUso = await countColmadosByPlan(db, id);
  if (enUso > 0) return c.json({ error: `No se puede eliminar: ${enUso} negocio(s) usan este plan` }, 409);
  await deletePlan(db, id);
  return c.json({ success: true });
});

// ---------- Suscripciones ----------

catalogoRoutes.get("/api/colmados/:colmadoId/suscripcion", requireAuth, requireBusinessAccess("colmadoId"), async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmado(db, Number(c.req.param("colmadoId")));
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const plan = colmado.planId ? (await getPlan(db, colmado.planId)) ?? null : null;

  let fechaFin: Date | null = null;
  if (colmado.fechaVencimiento) fechaFin = new Date(colmado.fechaVencimiento);
  else if (plan?.esTrial && colmado.fechaInicioPlan) {
    fechaFin = new Date(new Date(colmado.fechaInicioPlan).getTime() + (plan.duracionDias || 15) * DIA_MS);
  }
  const diasRestantes = fechaFin ? Math.ceil((fechaFin.getTime() - Date.now()) / DIA_MS) : 0;

  return c.json({
    suscripcion: { fechaInicio: colmado.fechaInicioPlan || colmado.fechaSuscripcion, fechaFin: colmado.fechaVencimiento },
    plan,
    diasRestantes,
    proximoAVencer: fechaFin ? diasRestantes <= 5 && diasRestantes > 0 : false,
    expirado: fechaFin ? diasRestantes <= 0 : false,
    estadoSuscripcion: colmado.estadoSuscripcion || "activa",
    fechaVencimiento: colmado.fechaVencimiento || null,
  });
});

catalogoRoutes.post("/api/colmados/:colmadoId/suscripcion", requireAuth, requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("colmadoId"));
  const body = (await c.req.json().catch(() => null)) || {};
  const plan = await getPlan(db, Number(body.planId));
  if (!plan) return c.json({ error: "Plan no encontrado" }, 404);
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
  const actual = await getSuscripcionActiva(db, colmadoId);
  if (actual) await cancelarSuscripcion(db, actual.id);
  const fechaInicio = new Date();
  const suscripcion = await createSuscripcion(db, {
    colmadoId, planId: plan.id, fechaInicio, fechaFin: new Date(fechaInicio.getTime() + plan.duracionDias * DIA_MS),
    estado: "activa", renovacionAutomatica: false,
  });
  return c.json({ suscripcion, plan }, 201);
});

catalogoRoutes.post("/api/colmados/:colmadoId/suscripcion/cancelar", requireAuth, requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const actual = await getSuscripcionActiva(db, Number(c.req.param("colmadoId")));
  if (actual) await cancelarSuscripcion(db, actual.id);
  return c.json({ success: true });
});

catalogoRoutes.get("/api/admin/suscripciones-por-vencer", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo administradores" }, 403);
  const dias = parseInt(c.req.query("dias") || "") || 5;
  return c.json(await getSuscripcionesProximasAVencer(getDb(c.env.DB), dias));
});

// ---------- Tipos de negocio (solo plataforma) ----------

catalogoRoutes.get("/api/admin/tipos-negocio", requireAuth, requireAdmin, async (c) => c.json(await getTiposNegocio(getDb(c.env.DB))));

catalogoRoutes.post("/api/admin/tipos-negocio", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const { slug, nombre, descripcion, icono, orden } = body;
  if (typeof slug !== "string" || !slug.trim() || typeof nombre !== "string" || !nombre.trim()) {
    return c.json({ error: "Slug y nombre son requeridos" }, 400);
  }
  const db = getDb(c.env.DB);
  if (await getTipoNegocioBySlug(db, slug)) return c.json({ error: "Ya existe un tipo con ese slug" }, 400);
  return c.json(await createTipoNegocio(db, { slug: slug.trim(), nombre: nombre.trim(), descripcion, icono, orden: Number(orden) || 0 }));
});

catalogoRoutes.put("/api/admin/tipos-negocio/:id", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const data: Parameters<typeof updateTipoNegocio>[2] = {};
  if (body.nombre !== undefined) data.nombre = String(body.nombre);
  if (body.descripcion !== undefined) data.descripcion = body.descripcion;
  if (body.icono !== undefined) data.icono = body.icono;
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  if (body.orden !== undefined) data.orden = Number(body.orden) || 0;
  if (Object.keys(data).length === 0) return c.json({ error: "Se requiere al menos un campo" }, 400);
  const tipo = await updateTipoNegocio(getDb(c.env.DB), Number(c.req.param("id")), data);
  return tipo ? c.json(tipo) : c.json({ error: "Tipo de negocio no encontrado" }, 404);
});

catalogoRoutes.delete("/api/admin/tipos-negocio/:id", requireAuth, requireAdmin, async (c) => {
  await deleteTipoNegocio(getDb(c.env.DB), Number(c.req.param("id")));
  return c.json({ success: true });
});

// ---------- Países (solo plataforma) ----------

catalogoRoutes.get("/api/admin/paises", requireAuth, requireAdmin, async (c) => c.json(await getAllPaises(getDb(c.env.DB))));

function patronInvalido(patron: unknown): boolean {
  return patron !== undefined && patron !== null && patron !== "" && (typeof patron !== "string" || !isValidZipPattern(patron));
}

catalogoRoutes.post("/api/admin/paises", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const { codigo, nombre, bandera, prefijoCelular, moneda, simboloMoneda, zonaHoraria, activo, patronCodigoPostal } = body;
  if (![codigo, nombre, prefijoCelular, moneda, simboloMoneda, zonaHoraria].every((v) => typeof v === "string" && v.trim())) {
    return c.json({ error: "código, nombre, prefijoCelular, moneda, simboloMoneda y zonaHoraria son requeridos" }, 400);
  }
  if (patronInvalido(patronCodigoPostal)) {
    return c.json({ error: "El patrón de código postal no es una expresión regular válida" }, 400);
  }
  try {
    return c.json(await createPais(getDb(c.env.DB), {
      codigo, nombre, bandera: bandera || null, prefijoCelular, moneda, simboloMoneda, zonaHoraria,
      activo: activo !== false, patronCodigoPostal: patronCodigoPostal || null,
    }));
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ya existe un país con ese código" }, 409);
    throw error;
  }
});

catalogoRoutes.patch("/api/admin/paises/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  const body = (await c.req.json().catch(() => null)) || {};
  const data: Record<string, unknown> = {};
  for (const key of ["codigo", "nombre", "bandera", "prefijoCelular", "moneda", "simboloMoneda", "zonaHoraria", "activo"] as const) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  for (const key of ["etiquetaEstado", "etiquetaCodigoPostal", "ejemploDireccion", "ejemploCiudad", "ejemploEstado", "ejemploCodigoPostal"] as const) {
    if (body[key] !== undefined) data[key] = body[key] || null;
  }
  if (body.requiereCodigoPostal !== undefined) data.requiereCodigoPostal = Boolean(body.requiereCodigoPostal);
  if (patronInvalido(body.patronCodigoPostal)) {
    return c.json({ error: "El patrón de código postal no es una expresión regular válida" }, 400);
  }
  if (body.patronCodigoPostal !== undefined) data.patronCodigoPostal = body.patronCodigoPostal || null;
  if (Object.keys(data).length === 0) return c.json({ error: "Se requiere al menos un campo" }, 400);
  try {
    const pais = await updatePais(getDb(c.env.DB), id, data);
    return pais ? c.json(pais) : c.json({ error: "País no encontrado" }, 404);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ya existe un país con ese código" }, 409);
    throw error;
  }
});

catalogoRoutes.delete("/api/admin/paises/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  await deletePais(getDb(c.env.DB), id);
  return c.json({ success: true });
});
