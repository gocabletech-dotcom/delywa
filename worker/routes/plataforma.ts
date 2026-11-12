import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { botIntenciones, conocimientoArchivos, mensajesSistema } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { isUniqueViolation } from "../lib/d1";
import { getConfiguracion, upsertConfiguracion } from "../storage/catalogos";
import { META_POLICIES } from "../data/meta-policies";

// Panel de plataforma: textos y reglas del bot. Todo es solo para platform_admin.
export const plataformaRoutes = new Hono<AppEnv>();
plataformaRoutes.use("/api/admin/bot-intenciones/*", requireAuth, requireAdmin);
plataformaRoutes.use("/api/admin/bot-intenciones", requireAuth, requireAdmin);
plataformaRoutes.use("/api/admin/conocimiento/*", requireAuth, requireAdmin);
plataformaRoutes.use("/api/admin/conocimiento", requireAuth, requireAdmin);

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

// ---------- Intenciones del bot ----------

function palabras(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 200);
}

plataformaRoutes.get("/api/admin/bot-intenciones", async (c) => {
  return c.json(await getDb(c.env.DB).select().from(botIntenciones).orderBy(botIntenciones.orden, botIntenciones.id));
});

plataformaRoutes.get("/api/admin/bot-intenciones/:id", async (c) => {
  const [row] = await getDb(c.env.DB).select().from(botIntenciones).where(eq(botIntenciones.id, Number(c.req.param("id")) || 0));
  return row ? c.json(row) : c.json({ error: "Intención no encontrada" }, 404);
});

plataformaRoutes.post("/api/admin/bot-intenciones", async (c) => {
  const body = await cuerpo(c);
  const codigo = texto(body.codigo, 60)?.toLowerCase();
  const nombre = texto(body.nombre, 120);
  const respuesta = texto(body.respuesta, 4000);
  if (!codigo || !nombre || !respuesta) return c.json({ error: "Código, nombre y respuesta son requeridos" }, 400);
  if (!/^[a-z0-9_]+$/.test(codigo)) return c.json({ error: "El código solo admite letras minúsculas, números y guion bajo" }, 400);
  try {
    const [row] = await getDb(c.env.DB).insert(botIntenciones).values({
      codigo, nombre, respuesta, icono: texto(body.icono, 16), accion: texto(body.accion, 60),
      palabrasClave: palabras(body.palabrasClave) ?? [], activo: body.activo !== false, orden: Number.isInteger(body.orden) ? body.orden : 0,
    }).returning();
    return c.json(row);
  } catch (err) {
    if (isUniqueViolation(err)) return c.json({ error: "Ya existe una intención con ese código" }, 400);
    throw err;
  }
});

plataformaRoutes.put("/api/admin/bot-intenciones/:id", async (c) => {
  const body = await cuerpo(c);
  const cambios: Partial<typeof botIntenciones.$inferInsert> = { fechaModificacion: new Date() };
  if (body.nombre !== undefined) {
    const v = texto(body.nombre, 120);
    if (!v) return c.json({ error: "El nombre no puede quedar vacío" }, 400);
    cambios.nombre = v;
  }
  if (body.respuesta !== undefined) {
    const v = texto(body.respuesta, 4000);
    if (!v) return c.json({ error: "La respuesta no puede quedar vacía" }, 400);
    cambios.respuesta = v;
  }
  if (body.icono !== undefined) cambios.icono = texto(body.icono, 16);
  if (body.accion !== undefined) cambios.accion = texto(body.accion, 60);
  if (body.palabrasClave !== undefined) {
    const v = palabras(body.palabrasClave);
    if (!v) return c.json({ error: "palabrasClave debe ser una lista" }, 400);
    cambios.palabrasClave = v;
  }
  if (body.activo !== undefined) cambios.activo = body.activo === true;
  if (body.orden !== undefined && Number.isInteger(body.orden)) cambios.orden = body.orden;
  const [row] = await getDb(c.env.DB).update(botIntenciones).set(cambios).where(eq(botIntenciones.id, Number(c.req.param("id")) || 0)).returning();
  return row ? c.json(row) : c.json({ error: "Intención no encontrada" }, 404);
});

plataformaRoutes.delete("/api/admin/bot-intenciones/:id", async (c) => {
  const db = getDb(c.env.DB);
  const [row] = await db.select().from(botIntenciones).where(eq(botIntenciones.id, Number(c.req.param("id")) || 0));
  if (!row) return c.json({ error: "Intención no encontrada" }, 404);
  if (row.codigo === "fallback") return c.json({ error: "No se puede eliminar la intención de fallback" }, 400);
  await db.delete(botIntenciones).where(eq(botIntenciones.id, row.id));
  return c.json({ success: true });
});

// ---------- Conocimiento por tipo de negocio ----------

plataformaRoutes.get("/api/admin/conocimiento/:tipoNegocio", async (c) => {
  return c.json(await getDb(c.env.DB).select().from(conocimientoArchivos)
    .where(eq(conocimientoArchivos.tipoNegocio, c.req.param("tipoNegocio"))).orderBy(conocimientoArchivos.fechaCreacion, conocimientoArchivos.id));
});

plataformaRoutes.post("/api/admin/conocimiento", async (c) => {
  const body = await cuerpo(c);
  const tipoNegocio = texto(body.tipoNegocio, 60);
  const nombre = texto(body.nombre, 160);
  const contenido = typeof body.contenido === "string" ? body.contenido.trim() : "";
  if (!tipoNegocio || !nombre || !contenido) return c.json({ error: "tipoNegocio, nombre y contenido son requeridos" }, 400);
  // Este texto entra al prompt de la IA: se limita para no inflar cada conversación.
  if (contenido.length > 100_000) return c.json({ error: "El contenido no puede superar 100,000 caracteres" }, 400);
  const [row] = await getDb(c.env.DB).insert(conocimientoArchivos).values({ tipoNegocio, nombre, contenido }).returning();
  return c.json(row);
});

plataformaRoutes.delete("/api/admin/conocimiento/:id", async (c) => {
  await getDb(c.env.DB).delete(conocimientoArchivos).where(eq(conocimientoArchivos.id, Number(c.req.param("id")) || 0));
  return c.json({ success: true });
});

// ---------- Textos globales ----------

// El original lo dejaba público aunque su propio comentario decía que era del administrador.
plataformaRoutes.get("/api/mensajes-sistema", requireAuth, requireAdmin, async (c) => {
  return c.json(await getDb(c.env.DB).select().from(mensajesSistema).orderBy(mensajesSistema.categoria, mensajesSistema.id));
});

plataformaRoutes.get("/api/admin/meta-policies", requireAuth, requireAdmin, (c) => c.json({ content: META_POLICIES }));

plataformaRoutes.get("/api/admin/system-prompt", requireAuth, requireAdmin, async (c) => {
  return c.json({ prompt: (await getConfiguracion(getDb(c.env.DB), "system_prompt_global"))?.valor || "" });
});

plataformaRoutes.put("/api/admin/system-prompt", requireAuth, requireAdmin, async (c) => {
  const { prompt } = await cuerpo(c);
  if (typeof prompt !== "string") return c.json({ error: "prompt es requerido" }, 400);
  if (prompt.length > 50_000) return c.json({ error: "El prompt no puede superar 50,000 caracteres" }, 400);
  const config = await upsertConfiguracion(getDb(c.env.DB), "system_prompt_global", prompt, "System prompt global para el bot de WhatsApp");
  return c.json({ prompt: config.valor });
});

// ---------- Plantilla de Meta para avisos de código postal ----------

const ZIP_NOMBRE = "zip_alert_meta_template_name";
const ZIP_IDIOMA = "zip_alert_meta_template_language";

/** Los nombres de plantilla de Meta son identificadores en minúsculas; el idioma es un locale como es_ES. */
export function validarPlantillaZip(name: unknown, language: unknown): { name: string; language: string } | null {
  if (typeof name !== "string" || typeof language !== "string") return null;
  const n = name.trim();
  const l = language.trim();
  if (!/^[a-z0-9](?:[a-z0-9_-]{0,63})$/.test(n) || !/^[a-z]{2,3}_[A-Z]{2,3}(?:_[A-Za-z0-9]+)?$/.test(l)) return null;
  return { name: n, language: l };
}

/** Configuración guardada → variables de entorno → valores por defecto. La usa también el aviso ZIP de la capa 4. */
export async function getPlantillaZip(db: ReturnType<typeof getDb>): Promise<{ name: string; language: string }> {
  const [nombre, idioma] = await Promise.all([getConfiguracion(db, ZIP_NOMBRE), getConfiguracion(db, ZIP_IDIOMA)]);
  return validarPlantillaZip(nombre?.valor, idioma?.valor)
    ?? validarPlantillaZip(process.env.WHATSAPP_ZIP_ALERT_TEMPLATE_NAME, process.env.WHATSAPP_ZIP_ALERT_TEMPLATE_LANGUAGE)
    ?? { name: "zip_alert_operativo", language: "es_ES" };
}

plataformaRoutes.get("/api/admin/zip-alert-template", requireAuth, requireAdmin, async (c) => c.json(await getPlantillaZip(getDb(c.env.DB))));

plataformaRoutes.put("/api/admin/zip-alert-template", requireAuth, requireAdmin, async (c) => {
  const body = await cuerpo(c);
  const plantilla = validarPlantillaZip(body.name, body.language);
  if (!plantilla) {
    return c.json({ error: "El nombre debe ser un identificador en minúsculas y el idioma debe tener formato de locale, por ejemplo es_ES" }, 400);
  }
  const db = getDb(c.env.DB);
  await upsertConfiguracion(db, ZIP_NOMBRE, plantilla.name, "Nombre de la plantilla aprobada de Meta para avisos ZIP", "texto");
  await upsertConfiguracion(db, ZIP_IDIOMA, plantilla.language, "Idioma de la plantilla de Meta para avisos ZIP", "texto");
  return c.json(plantilla);
});
