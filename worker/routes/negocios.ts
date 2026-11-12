import { Hono } from "hono";
import { fromZodError } from "zod-validation-error";
import { insertColmadoSchema, type Colmado } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAdmin, requireAuth, requireBusinessAccess } from "../lib/auth";
import { isUniqueViolation } from "../lib/d1";
import { claveDebil } from "../lib/claves";
import { archivosDelNegocio, borrarArchivosHuerfanos } from "../lib/archivos";
import {
  aplicarPlantillaMenu, assignColmadoOwner, createColmado, createSucursal, deleteColmado, enrichColmadoWithMoneda,
  getAllColmados, getColmado, getPais, getSucursalesByOwner, isOwnerOfColmado, setColmadoEstado, toSafeColmado,
  updateColmado, updateColmadoTecnologias, updateColmadoWhatsappConfig, type InsertColmado,
} from "../storage/colmados";
import {
  canUserAccessColmado, createUser, getAccessibleColmadoIds, getUserByEmail, getUserById, toPublicUser, updateUserRole,
} from "../storage/users";
import { createOrUpdateMetodosPago, getAllPlanes, getMetodosPago, getPlatformStats } from "../storage/catalogos";

const TIPOS_SIN_MENU = ["colmado", "colmadon"];
const ESTADOS_NEGOCIO = ["activo", "inactivo", "suspendido", "pendiente_revision", "rechazado"];
const ESTADOS_SUSCRIPCION = ["activa", "en_gracia", "suspendida"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const negocioRoutes = new Hono<AppEnv>();

async function crearNegocio(db: Db, data: InsertColmado): Promise<Colmado> {
  const colmado = await createColmado(db, data);
  if (!TIPOS_SIN_MENU.includes(colmado.tipoNegocio)) {
    try {
      await aplicarPlantillaMenu(db, colmado.id, colmado.tipoNegocio);
    } catch (err) {
      // El negocio ya existe; la plantilla se puede aplicar luego desde el panel.
      console.error("[negocios] No se pudo aplicar la plantilla de menú:", err);
    }
  }
  return colmado;
}

// ---------- Sucursales del negocio en sesión ----------

negocioRoutes.get("/api/negocio/sucursales", requireAuth, async (c) => {
  const user = c.var.user;
  if (!user.colmadoId) return c.json({ error: "No tienes sucursales asignadas" }, 403);
  const db = getDb(c.env.DB);
  const registros = user.role === "colmado_owner"
    ? await getSucursalesByOwner(db, user.id)
    : (await Promise.all((await getAccessibleColmadoIds(db, user)).map((id) => getColmado(db, id)))).filter(
        (s): s is Colmado => Boolean(s),
      );
  const sucursales = await Promise.all(registros.map(async (sucursal) => {
    const pais = sucursal.paisId ? await getPais(db, sucursal.paisId) : undefined;
    return { ...toSafeColmado(sucursal, user.role === "colmado_owner"), paisCodigo: pais?.codigo || null };
  }));
  return c.json({ sucursales, sucursalActivaId: c.var.session.data.colmadoId || user.colmadoId });
});

negocioRoutes.post("/api/negocio/sucursales", requireAuth, async (c) => {
  const user = c.var.user;
  if (user.role !== "colmado_owner" || !user.colmadoId) return c.json({ error: "Solo el dueño puede crear sucursales" }, 403);
  const body = (await c.req.json().catch(() => null)) || {};
  const { nombre, whatsappNumero, direccion, ciudad, provincia, codigoPostal, latitud, longitud } = body;
  if (typeof nombre !== "string" || !nombre.trim() || typeof whatsappNumero !== "string" || !whatsappNumero.trim() ||
      typeof direccion !== "string" || !direccion.trim()) {
    return c.json({ error: "Nombre, WhatsApp y dirección son obligatorios" }, 400);
  }
  const db = getDb(c.env.DB);
  try {
    const sucursal = await createSucursal(db, user.colmadoId, {
      nombre: nombre.trim(),
      whatsappNumero: whatsappNumero.trim(),
      direccion: direccion.trim(),
      ciudad: ciudad || null,
      provincia: provincia || null,
      codigoPostal: codigoPostal || null,
      latitud: latitud != null && latitud !== "" ? String(latitud) : null,
      longitud: longitud != null && longitud !== "" ? String(longitud) : null,
    });
    return c.json(await enrichColmadoWithMoneda(db, toSafeColmado(sucursal, true)), 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ese número de WhatsApp ya está registrado" }, 409);
    throw error;
  }
});

negocioRoutes.post("/api/negocio/sucursales/:id/seleccionar", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.var.user;
  if (!user.colmadoId || !Number.isInteger(id) || !(await canUserAccessColmado(getDb(c.env.DB), user, id))) {
    return c.json({ error: "No tienes permiso para seleccionar esta sucursal" }, 403);
  }
  c.var.session.set("colmadoId", id);
  return c.json({ success: true, sucursalId: id });
});

// Un usuario recién creado (rol "pending") registra su propio negocio.
negocioRoutes.post("/api/user/register-colmado", requireAuth, async (c) => {
  const user = c.var.user;
  if (user.role !== "pending") return c.json({ error: "Tu cuenta ya tiene un rol asignado" }, 403);
  const body = (await c.req.json().catch(() => null)) || {};
  const { nombre, whatsappNumero, direccion } = body;
  if (typeof nombre !== "string" || !nombre.trim() || typeof whatsappNumero !== "string" || !whatsappNumero.trim() ||
      typeof direccion !== "string" || !direccion.trim()) {
    return c.json({ error: "Nombre, WhatsApp y dirección son obligatorios" }, 400);
  }
  const db = getDb(c.env.DB);
  // El plan siempre es el de prueba; solo la plataforma asigna planes pagos.
  const trial = (await getAllPlanes(db)).find((p) => p.esTrial && p.activo) ?? (await getAllPlanes(db))[0];
  if (!trial) return c.json({ error: "No hay planes configurados" }, 500);
  try {
    const colmado = await crearNegocio(db, {
      nombre: nombre.trim(), whatsappNumero: whatsappNumero.trim(), direccion: direccion.trim(),
      planId: trial.id, estado: "activo", ownerUserId: user.id,
    });
    await updateUserRole(db, user.id, "colmado_owner", colmado.id, null);
    c.var.session.set("colmadoId", colmado.id);
    c.var.session.set("userRole", "colmado_owner");
    return c.json(toSafeColmado(colmado, true), 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Este número de WhatsApp ya está registrado" }, 409);
    throw error;
  }
});

// ---------- Negocios ----------

negocioRoutes.get("/api/colmados", requireAuth, requireAdmin, async (c) => c.json(await getAllColmados(getDb(c.env.DB))));
negocioRoutes.get("/api/admin/colmados", requireAuth, requireAdmin, async (c) => c.json(await getAllColmados(getDb(c.env.DB))));

// Público: lo usan las páginas de pedido y seguimiento. Nunca incluye credenciales.
negocioRoutes.get("/api/colmados/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const colmado = Number.isInteger(id) ? await getColmado(db, id) : undefined;
  if (!colmado) return c.json({ error: "Colmado no encontrado" }, 404);
  let conAcceso = false;
  const userId = c.var.session.data.userId;
  if (userId) {
    const user = await getUserById(db, userId);
    conAcceso = Boolean(user && (user.role === "platform_admin" || (user.role === "colmado_owner" && await isOwnerOfColmado(db, user.id, id))));
  }
  return c.json(await enrichColmadoWithMoneda(db, toSafeColmado(colmado, conAcceso)));
});

negocioRoutes.post("/api/colmados", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = insertColmadoSchema.safeParse(body);
  if (!result.success) return c.json({ error: fromZodError(result.error).message }, 400);
  try {
    return c.json(await crearNegocio(getDb(c.env.DB), result.data as InsertColmado), 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Este número de WhatsApp ya está registrado" }, 409);
    throw error;
  }
});

negocioRoutes.patch("/api/colmados/:id", requireAuth, async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const user = c.var.user;
  const esAdmin = user.role === "platform_admin";
  if (!Number.isInteger(id) || !(esAdmin || (user.role === "colmado_owner" && await isOwnerOfColmado(db, user.id, id)))) {
    return c.json({ error: "No tienes permiso para modificar este colmado" }, 403);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  const updateData: Record<string, unknown> = {};

  const texto = [
    "nombre", "direccion", "ciudad", "provincia", "logo", "descripcion", "encargadoNombre", "telefonoAlternativo",
    "tiempoEstimado", "horaApertura", "horaCierre", "mensajeCerrado", "mensajeBienvenida", "mensajeConfirmacion",
    "tipoNegocio", "whatsappNumero",
  ] as const;
  for (const key of texto) if (body[key] !== undefined) updateData[key] = body[key];
  for (const key of ["latitud", "longitud"] as const) {
    if (body[key] !== undefined) updateData[key] = body[key] === null || body[key] === "" ? null : String(body[key]);
  }
  for (const key of ["costoDelivery", "radioEntrega", "pedidoMinimo", "impuesto"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === "") { updateData[key] = null; continue; }
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < 0) return c.json({ error: `Valor inválido para ${key}` }, 400);
    updateData[key] = String(body[key]);
  }
  if (body.colorPrimario !== undefined) {
    if (typeof body.colorPrimario !== "string" || !HEX_COLOR.test(body.colorPrimario)) {
      return c.json({ error: "El color debe ser un código HEX válido, por ejemplo #25D366" }, 400);
    }
    updateData.colorPrimario = body.colorPrimario.toUpperCase();
  }
  if (body.diasServicio !== undefined) {
    if (!Array.isArray(body.diasServicio) || body.diasServicio.some((d: unknown) => typeof d !== "string")) {
      return c.json({ error: "Los días de servicio no son válidos" }, 400);
    }
    updateData.diasServicio = body.diasServicio;
  }
  if (body.estaAbiertoManual !== undefined) updateData.estaAbiertoManual = Boolean(body.estaAbiertoManual);
  if (body.tituloCompartirPedido !== undefined) updateData.tituloCompartirPedido = body.tituloCompartirPedido || null;
  if (body.descripcionCompartirPedido !== undefined) updateData.descripcionCompartirPedido = body.descripcionCompartirPedido || null;
  if (body.codigoPostal !== undefined) updateData.codigoPostal = body.codigoPostal || null;
  if (body.botPromptCustom !== undefined) updateData.botPromptCustom = body.botPromptCustom || null;
  if (body.paisId !== undefined) {
    updateData.paisId = body.paisId === null || body.paisId === "" || body.paisId === 0 ? null : parseInt(body.paisId);
  }

  // Plan, facturación y tecnologías: solo la plataforma. Un dueño no puede
  // cambiarse el plan ni extender su propia suscripción.
  if (esAdmin) {
    if (body.planId !== undefined) updateData.planId = Number(body.planId);
    if (body.fechaInicioPlan !== undefined) updateData.fechaInicioPlan = body.fechaInicioPlan ? new Date(body.fechaInicioPlan) : null;
    if (body.fechaVencimiento !== undefined) updateData.fechaVencimiento = body.fechaVencimiento ? new Date(body.fechaVencimiento) : null;
    if (body.estadoSuscripcion !== undefined) {
      if (!ESTADOS_SUSCRIPCION.includes(body.estadoSuscripcion)) return c.json({ error: "Estado de suscripción inválido" }, 400);
      updateData.estadoSuscripcion = body.estadoSuscripcion;
    }
    if (body.diaCorte !== undefined) updateData.diaCorte = parseInt(body.diaCorte);
    if (body.diasGracia !== undefined) updateData.diasGracia = parseInt(body.diasGracia);
    if (body.tecnologiasHabilitadas !== undefined) updateData.tecnologiasHabilitadas = body.tecnologiasHabilitadas;
  }
  for (const key of ["fechaInicioPlan", "fechaVencimiento"] as const) {
    const value = updateData[key];
    if (value instanceof Date && Number.isNaN(value.getTime())) return c.json({ error: "Fecha inválida" }, 400);
  }
  for (const key of ["planId", "diaCorte", "diasGracia", "paisId"] as const) {
    if (updateData[key] !== undefined && updateData[key] !== null && !Number.isInteger(updateData[key])) {
      return c.json({ error: `Valor inválido para ${key}` }, 400);
    }
  }
  for (const key of ["nombre", "direccion", "whatsappNumero", "tipoNegocio"] as const) {
    if (updateData[key] !== undefined && (typeof updateData[key] !== "string" || !(updateData[key] as string).trim())) {
      return c.json({ error: `El campo ${key} no puede quedar vacío` }, 400);
    }
  }

  if (Object.keys(updateData).length === 0) return c.json({ error: "Se requiere al menos un campo para actualizar" }, 400);
  try {
    const updated = await updateColmado(db, id, updateData);
    if (!updated) return c.json({ error: "Colmado no encontrado" }, 404);
    return c.json(await enrichColmadoWithMoneda(db, toSafeColmado(updated, true)));
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Este número de WhatsApp ya está registrado" }, 409);
    throw error;
  }
});

negocioRoutes.patch("/api/admin/colmados/:id/tecnologias", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const tecnologias: Record<string, boolean> = {};
  for (const key of ["api_evo", "meta", "link_pedido"] as const) {
    if (body[key] !== undefined) tecnologias[key] = Boolean(body[key]);
  }
  if (Object.keys(tecnologias).length === 0) return c.json({ error: "Se requiere al menos una tecnología" }, 400);
  const db = getDb(c.env.DB);
  const colmado = await getColmado(db, id);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const merged = { ...(colmado.tecnologiasHabilitadas || {}), ...tecnologias };
  await updateColmadoTecnologias(db, id, merged);
  return c.json({ tecnologiasHabilitadas: merged });
});

negocioRoutes.post("/api/colmados/:id/assign-owner", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo el administrador puede asignar dueños" }, 403);
  const colmadoId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  if (!body.ownerUserId) return c.json({ error: "Se requiere el ID del usuario dueño" }, 400);
  const db = getDb(c.env.DB);
  const [colmado, owner] = await Promise.all([getColmado(db, colmadoId), getUserById(db, String(body.ownerUserId))]);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  if (!owner || owner.role === "platform_admin") return c.json({ error: "Usuario no válido para ser dueño" }, 400);
  await assignColmadoOwner(db, colmadoId, owner.id);
  return c.json(await getColmado(db, colmadoId));
});

negocioRoutes.post("/api/colmados/:id/owner", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo el administrador puede crear dueños" }, 403);
  const colmadoId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const { email, password, firstName } = body;
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password || typeof firstName !== "string" || !firstName.trim()) {
    return c.json({ error: "Se requiere email, contraseña y nombre" }, 400);
  }
  { const debil = await claveDebil(password); if (debil) return c.json({ error: debil }, 400); }
  const db = getDb(c.env.DB);
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
  if (await getUserByEmail(db, email)) return c.json({ error: "Ya existe un usuario con este email" }, 409);
  const owner = await createUser(db, { idPrefix: "owner", email, password, firstName, role: "colmado_owner", colmadoId });
  await updateColmado(db, colmadoId, { ownerUserId: owner.id });
  return c.json({ user: toPublicUser(owner) }, 201);
});

negocioRoutes.delete("/api/colmados/:id", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") {
    return c.json({ error: "Solo el administrador de la plataforma puede eliminar colmados" }, 403);
  }
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const archivos = Number.isInteger(id) ? await archivosDelNegocio(db, id) : [];
  await deleteColmado(db, id);
  // Sus fotos, logo y comprobantes se borran de R2 (si nadie más los usa).
  const tarea = borrarArchivosHuerfanos(c.env, archivos);
  try { c.executionCtx.waitUntil(tarea); } catch { await tarea; }
  return c.json({ success: true, message: "Colmado eliminado" });
});

negocioRoutes.patch("/api/colmados/:id/estado", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") {
    return c.json({ error: "Solo el administrador de la plataforma puede cambiar el estado" }, 403);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  if (!ESTADOS_NEGOCIO.includes(body.estado)) return c.json({ error: "Estado inválido" }, 400);
  const updated = await setColmadoEstado(getDb(c.env.DB), Number(c.req.param("id")), body.estado);
  if (!updated) return c.json({ error: "Negocio no encontrado" }, 404);
  return c.json({ success: true, colmado: updated });
});

negocioRoutes.patch("/api/colmados/:id/whatsapp-config", requireAuth, async (c) => {
  const colmadoId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const user = c.var.user;
  if (!(user.role === "platform_admin" || (user.role === "colmado_owner" && await isOwnerOfColmado(db, user.id, colmadoId)))) {
    return c.json({ error: "No tienes permiso para modificar este colmado" }, 403);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  const { phoneNumberId, accessToken } = body;
  if (typeof phoneNumberId !== "string" || !phoneNumberId.trim() || typeof accessToken !== "string" || !accessToken.trim()) {
    return c.json({ error: "Se requieren phoneNumberId y accessToken" }, 400);
  }
  await updateColmadoWhatsappConfig(db, colmadoId, phoneNumberId.trim(), accessToken.trim());
  return c.json({ success: true });
});

// ---------- Métodos de pago ----------

// Público: el chat de pedidos necesita saber cómo se puede pagar.
negocioRoutes.get("/api/colmados/:id/metodos-pago", async (c) => {
  const colmadoId = Number(c.req.param("id"));
  const metodos = Number.isInteger(colmadoId) ? await getMetodosPago(getDb(c.env.DB), colmadoId) : undefined;
  return c.json(metodos ?? {
    id: 0, colmadoId, efectivo: true, transferencia: false, tarjeta: false, bancos: [], fechaModificacion: new Date(),
  });
});

negocioRoutes.put("/api/colmados/:id/metodos-pago", requireAuth, requireBusinessAccess(), async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const data: Parameters<typeof createOrUpdateMetodosPago>[2] = {};
  for (const key of ["efectivo", "transferencia", "tarjeta"] as const) {
    if (body[key] !== undefined) data[key] = Boolean(body[key]);
  }
  if (body.bancos !== undefined) {
    if (!Array.isArray(body.bancos)) return c.json({ error: "La lista de bancos no es válida" }, 400);
    data.bancos = body.bancos
      .filter((b: any) => b && typeof b.nombre === "string" && typeof b.numeroCuenta === "string")
      .map((b: any) => ({
        nombre: b.nombre, numeroCuenta: b.numeroCuenta,
        ...(typeof b.tipoCuenta === "string" ? { tipoCuenta: b.tipoCuenta } : {}),
        ...(typeof b.titular === "string" ? { titular: b.titular } : {}),
      }));
  }
  return c.json(await createOrUpdateMetodosPago(getDb(c.env.DB), Number(c.req.param("id")), data));
});

// ---------- Plataforma ----------

negocioRoutes.get("/api/admin/stats", requireAuth, requireAdmin, async (c) => c.json(await getPlatformStats(getDb(c.env.DB))));

negocioRoutes.post("/api/admin/check-subscriptions", requireAuth, requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const updates: unknown[] = [];
  const hoy = new Date();
  for (const colmado of await getAllColmados(db)) {
    const diaCorte = colmado.diaCorte || 28;
    const diasGracia = colmado.diasGracia || 6;
    let fechaVencimiento = colmado.fechaVencimiento ? new Date(colmado.fechaVencimiento) : null;
    if (!fechaVencimiento) {
      const mes = hoy.getUTCDate() <= diaCorte ? hoy.getUTCMonth() : hoy.getUTCMonth() + 1;
      fechaVencimiento = new Date(Date.UTC(hoy.getUTCFullYear(), mes, diaCorte, 23, 59, 59));
    }
    const fechaSuspension = new Date(fechaVencimiento.getTime() + diasGracia * 24 * 60 * 60 * 1000);
    const nuevoEstado = hoy <= fechaVencimiento ? "activa" : hoy <= fechaSuspension ? "en_gracia" : "suspendida";
    if (colmado.estadoSuscripcion !== nuevoEstado || !colmado.fechaVencimiento) {
      await updateColmado(db, colmado.id, { estadoSuscripcion: nuevoEstado, fechaVencimiento });
      updates.push({
        colmadoId: colmado.id, nombre: colmado.nombre, estadoAnterior: colmado.estadoSuscripcion, nuevoEstado, fechaVencimiento,
      });
    }
  }
  return c.json({ success: true, actualizados: updates.length, detalles: updates });
});
