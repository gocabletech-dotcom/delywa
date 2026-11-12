import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { aceptacionesLegales, colmados, paises, tiposNegocioCatalogo, users } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { isUniqueViolation } from "../lib/d1";
import { permitirEvento } from "../lib/rate-limit";
import { soloDigitos } from "../lib/telefono";
import { turnstileDelLogin, verificarTurnstile } from "../lib/turnstile";
import { createColmado } from "../storage/colmados";
import { getAllPlanes } from "../storage/catalogos";
import { createUser, getUserByEmail, normalizeEmail } from "../storage/users";
import { VERSION_LEGAL } from "../data/legal";

// Registro público de negocios desde la página principal.
// El negocio nace APAGADO ("pendiente_revision"): no recibe pedidos, el bot no responde
// y no aparece en el menú ni en el chat web hasta que la plataforma revisa sus datos y lo activa.

export const ESTADO_EN_REVISION = "pendiente_revision";
export const ESTADO_RECHAZADO = "rechazado";

/** Tipos de negocio que se pueden registrar solos. Por ahora solo colmados. */
export const TIPOS_REGISTRO = ["colmado"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HORA = 60 * 60 * 1000;

export const registroRoutes = new Hono<AppEnv>();

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Número de WhatsApp con el código del país, solo dígitos (como lo guarda el resto del sistema).
 * Para RD el prefijo del catálogo es "1809": código 1 más el área por defecto.
 */
export function telefonoConPais(telefono: string, prefijo: string): string | null {
  const digitos = soloDigitos(telefono);
  const pref = soloDigitos(prefijo);
  if (!digitos || !pref) return null;
  let completo: string;
  if (pref.startsWith("1")) {
    // Plan de numeración de América del Norte (RD, EE. UU., Puerto Rico): 1 + 10 dígitos.
    if (digitos.length === 11 && digitos.startsWith("1")) completo = digitos;
    else if (digitos.length === 10) completo = `1${digitos}`;
    else if (digitos.length === 7 && pref.length === 4) completo = `${pref}${digitos}`;
    else return null;
  } else {
    completo = digitos.startsWith(pref) && digitos.length >= pref.length + 7 ? digitos : `${pref}${digitos}`;
  }
  return completo.length >= 10 && completo.length <= 15 ? completo : null;
}

/** Países y tipos de negocio para el formulario. */
registroRoutes.get("/api/registro-negocio/opciones", async (c) => {
  const db = getDb(c.env.DB);
  const [listaPaises, tipos] = await Promise.all([
    db.select({ id: paises.id, codigo: paises.codigo, nombre: paises.nombre, bandera: paises.bandera, prefijoCelular: paises.prefijoCelular })
      .from(paises).where(eq(paises.activo, true)).orderBy(paises.nombre),
    db.select({ slug: tiposNegocioCatalogo.slug, nombre: tiposNegocioCatalogo.nombre }).from(tiposNegocioCatalogo)
      .where(and(inArray(tiposNegocioCatalogo.slug, TIPOS_REGISTRO), eq(tiposNegocioCatalogo.activo, true))),
  ]);
  const turnstile = turnstileDelLogin(c.env);
  return c.json({
    paises: listaPaises,
    tipos: tipos.length ? tipos : TIPOS_REGISTRO.map((slug) => ({ slug, nombre: "Colmado" })),
    turnstileSiteKey: turnstile?.siteKey ?? null,
    versionLegal: VERSION_LEGAL,
  });
});

registroRoutes.post("/api/registro-negocio", async (c) => {
  const body = ((await c.req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const db = getDb(c.env.DB);
  const ip = c.req.header("CF-Connecting-IP");

  const turnstile = turnstileDelLogin(c.env);
  if (turnstile && !(await verificarTurnstile(turnstile.secreto, body.turnstileToken, ip))) {
    return c.json({ error: "Completa la verificación de seguridad e intenta de nuevo.", turnstile: true }, 400);
  }

  const nombreNegocio = texto(body.nombreNegocio, 100);
  const nombre = texto(body.nombre, 80);
  const correo = normalizeEmail(texto(body.correo, 120));
  const password = typeof body.password === "string" ? body.password : "";
  const direccion = texto(body.direccion, 200);
  const tipoNegocio = texto(body.tipoNegocio, 40) || TIPOS_REGISTRO[0];
  const paisId = Number(body.paisId);

  if (!nombreNegocio || !nombre || !direccion) return c.json({ error: "Completa el nombre del negocio, tu nombre y la dirección." }, 400);
  if (!EMAIL_RE.test(correo)) return c.json({ error: "El correo no es válido." }, 400);
  if (password.length < 10 || password.length > 200) return c.json({ error: "La contraseña debe tener al menos 10 caracteres." }, 400);
  if (!TIPOS_REGISTRO.includes(tipoNegocio)) return c.json({ error: "Ese tipo de negocio todavía no se puede registrar." }, 400);
  if (body.aceptaTerminos !== true) return c.json({ error: "Debes aceptar los términos, la política de privacidad y el acuerdo de tratamiento de datos." }, 400);

  const [pais] = Number.isInteger(paisId) ? await db.select().from(paises).where(and(eq(paises.id, paisId), eq(paises.activo, true))) : [];
  if (!pais) return c.json({ error: "Elige el país del negocio." }, 400);
  const whatsappNumero = telefonoConPais(texto(body.telefono, 30), pais.prefijoCelular);
  if (!whatsappNumero) return c.json({ error: "El teléfono no es válido. Escríbelo con todos sus dígitos." }, 400);

  // Máximo 5 registros por IP cada hora (evita que llenen la plataforma de solicitudes falsas).
  if (!(await permitirEvento(db, `registro:${ip ?? "sin-ip"}`, 5, HORA))) {
    return c.json({ error: "Demasiadas solicitudes desde esta conexión. Intenta en una hora." }, 429);
  }

  if (await getUserByEmail(db, correo)) return c.json({ error: "Ya existe una cuenta con ese correo. Inicia sesión." }, 409);
  const [repetido] = await db.select({ id: colmados.id }).from(colmados).where(eq(colmados.whatsappNumero, whatsappNumero));
  if (repetido) return c.json({ error: "Ese número de teléfono ya tiene un negocio registrado." }, 409);

  const planes = await getAllPlanes(db);
  const trial = planes.find((p) => p.esTrial && p.activo) ?? planes[0];
  if (!trial) return c.json({ error: "La plataforma todavía no tiene planes configurados." }, 503);

  let userId: string | null = null;
  try {
    const user = await createUser(db, { idPrefix: "owner", email: correo, password, firstName: nombre, role: "colmado_owner" });
    userId = user.id;
    const colmado = await createColmado(db, {
      nombre: nombreNegocio, whatsappNumero, direccion, planId: trial.id, paisId: pais.id, tipoNegocio,
      encargadoNombre: nombre, estado: ESTADO_EN_REVISION, ownerUserId: user.id,
    });
    const userAgent = (c.req.header("User-Agent") ?? "").slice(0, 300);
    await db.batch([
      db.update(users).set({ colmadoId: colmado.id, updatedAt: new Date() }).where(eq(users.id, user.id)),
      db.insert(aceptacionesLegales).values(["terminos", "privacidad", "dpa"].map((documento) => ({
        userId: user.id, colmadoId: colmado.id, documento, version: VERSION_LEGAL, ip: ip ?? null, userAgent,
      }))),
    ]);
    // Queda con la sesión iniciada: ve su panel con el aviso de "en revisión" y puede ir completando el menú.
    const session = c.var.session;
    session.regenerate();
    session.data = { userId: user.id, userRole: "colmado_owner", colmadoId: colmado.id, deliveryId: null, lastActivity: Date.now() };
    session.touch();
    return c.json({ success: true, colmadoId: colmado.id, estado: colmado.estado }, 201);
  } catch (err) {
    // Si algo falló a medias, no queda una cuenta sin negocio.
    if (userId) await db.delete(users).where(eq(users.id, userId)).catch(() => undefined);
    if (isUniqueViolation(err)) return c.json({ error: "Ese correo o teléfono ya está registrado." }, 409);
    throw err;
  }
});

// ---------- Revisión por la plataforma ----------

registroRoutes.get("/api/admin/solicitudes-negocio", requireAuth, requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const filas = await db
    .select({
      id: colmados.id, nombre: colmados.nombre, estado: colmados.estado, tipoNegocio: colmados.tipoNegocio,
      whatsappNumero: colmados.whatsappNumero, direccion: colmados.direccion, encargadoNombre: colmados.encargadoNombre,
      fechaSuscripcion: colmados.fechaSuscripcion, slug: colmados.slug,
      paisNombre: paises.nombre, paisBandera: paises.bandera,
      duenoId: users.id, duenoNombre: users.firstName, duenoCorreo: users.email,
    })
    .from(colmados)
    .leftJoin(paises, eq(paises.id, colmados.paisId))
    .leftJoin(users, eq(users.id, colmados.ownerUserId))
    .where(inArray(colmados.estado, [ESTADO_EN_REVISION, ESTADO_RECHAZADO]))
    .orderBy(desc(colmados.fechaSuscripcion));
  const ids = filas.map((f) => f.id);
  const aceptaciones = ids.length
    ? await db.select().from(aceptacionesLegales).where(inArray(aceptacionesLegales.colmadoId, ids))
    : [];
  return c.json(filas.map((f) => ({
    ...f,
    aceptaciones: aceptaciones.filter((a) => a.colmadoId === f.id).map((a) => ({ documento: a.documento, version: a.version, fecha: a.fecha, ip: a.ip })),
  })));
});

/** Activar (lo enciende) o rechazar (queda apagado, sin borrar nada). */
registroRoutes.post("/api/admin/solicitudes-negocio/:id/:accion", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const accion = c.req.param("accion");
  if (!Number.isInteger(id) || !["activar", "rechazar"].includes(accion)) return c.json({ error: "Solicitud no válida" }, 400);
  const nuevo = accion === "activar" ? "activo" : ESTADO_RECHAZADO;
  const [actualizado] = await getDb(c.env.DB).update(colmados).set({ estado: nuevo })
    .where(and(eq(colmados.id, id), inArray(colmados.estado, [ESTADO_EN_REVISION, ESTADO_RECHAZADO])))
    .returning({ id: colmados.id, estado: colmados.estado });
  if (!actualizado) return c.json({ error: "Ese negocio no está pendiente de revisión" }, 404);
  return c.json({ success: true, ...actualizado });
});
