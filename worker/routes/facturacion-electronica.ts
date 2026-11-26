import { Hono } from "hono";
import { desc, eq, isNull } from "drizzle-orm";
import { colmados, configuracionSistema, feCertificacion, users, type FeCertificacion, type PasoCertificacion, type SecuenciaENcf } from "@shared/schema";
import {
  ENTIDADES_CERTIFICADO, PASOS_CERTIFICACION, TIPOS_CONTRIBUYENTE, TIPOS_ENCF, encfValido, revisarIdentificacion, soloDigitos,
  type ClavePaso, type ProveedorFE,
} from "@shared/certificacion";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth, requireBusinessAccess } from "../lib/auth";
import { requierePlan } from "../lib/plan";
import { ADMINISTRADORES } from "../lib/permisos";
import { cifrar, SinClaveMaestra } from "../lib/integraciones";
import { anotar } from "../lib/seguridad";
import { permitirEvento } from "../lib/rate-limit";
import { BLOQUEA_SEGUIR, consultarPadron, mensajePadron, REVISAR_CADA_MS, type ConsultaPadron } from "../lib/padron-dgii";
import {
  CLAVE_PROVEEDOR, CertificadoInvalido, diasParaVencer, estadoPasos, leerCertificacion, leerP12, leerProveedor,
  negocioPrincipalId, obligado, resumenAvance,
} from "../lib/certificacion";

// Facturación electrónica, parte 1: guía para que el negocio quede autorizado por la DGII
// como emisor electrónico. La emisión de e-CF viene después, con el proveedor elegido.
export const facturacionElectronicaRoutes = new Hono<AppEnv>();

const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const PASOS_MANUALES = new Set(PASOS_CERTIFICACION.filter((p) => !p.automatico).map((p) => p.clave));
const MAX_CERT_BYTES = 60_000;

/** Lo que ve el negocio. Nunca incluye el certificado ni su contraseña. */
async function vista(db: ReturnType<typeof getDb>, colmadoId: number, f: FeCertificacion | undefined) {
  const pasos = estadoPasos(f);
  const dias = diasParaVencer(f?.certVence);
  return {
    colmadoId,
    datos: {
      rnc: f?.rnc ?? "", razonSocial: f?.razonSocial ?? "", nombreComercial: f?.nombreComercial ?? "",
      direccionFiscal: f?.direccionFiscal ?? "", tipoContribuyente: f?.tipoContribuyente ?? "", correoFiscal: f?.correoFiscal ?? "",
      repNombre: f?.repNombre ?? "", repCedula: f?.repCedula ?? "", repCargo: f?.repCargo ?? "", repCorreo: f?.repCorreo ?? "",
    },
    identificacion: f?.rnc ? revisarIdentificacion(f.rnc) : null,
    dgii: f?.dgiiEstado ? {
      estado: f.dgiiEstado, estadoTexto: f.dgiiEstadoTexto ?? null, actividad: f.dgiiActividad ?? null, regimen: f.dgiiRegimen ?? null,
      padronFecha: f.dgiiPadronFecha ?? null, consultadoAt: f.dgiiConsultadoAt ?? null,
      mensaje: mensajePadron(f.dgiiEstado as any, f.dgiiEstadoTexto), bloquea: BLOQUEA_SEGUIR.has(f.dgiiEstado),
    } : null,
    certificado: {
      estado: f?.certEstado ?? "no_tiene", entidad: f?.certEntidad ?? "", titular: f?.certTitular ?? "", vence: f?.certVence ?? "",
      subido: Boolean(f?.certArchivo), subidoAt: f?.certSubidoAt ?? null, diasParaVencer: dias,
    },
    pasos,
    avance: resumenAvance(pasos),
    secuencias: f?.secuencias ?? [],
    autorizadoAt: f?.autorizadoAt ?? null,
    plazo: obligado(f?.tipoContribuyente),
    proveedor: await leerProveedor(db),
    actualizadoAt: f?.actualizadoAt ?? null,
  };
}

/** Crea la fila si no existe y aplica los cambios. */
async function guardar(db: ReturnType<typeof getDb>, colmadoId: number, cambios: Partial<typeof feCertificacion.$inferInsert>, quien: string) {
  const valores = { ...cambios, actualizadoPor: quien, actualizadoAt: new Date() };
  await db.insert(feCertificacion).values({ colmadoId, ...valores }).onConflictDoUpdate({ target: feCertificacion.colmadoId, set: valores });
}

/** Consulta el padrón de la DGII y guarda el estado. Si lo encuentra, la razón social queda como en la DGII. */
async function verificarConDgii(db: ReturnType<typeof getDb>, colmadoId: number, rnc: string, quien: string): Promise<ConsultaPadron> {
  const r = await consultarPadron(rnc);
  if (r.resultado === "no_disponible" || r.resultado === "invalido") return r;
  const actual = await leerCertificacion(db, colmadoId);
  const cambios: Partial<typeof feCertificacion.$inferInsert> = {
    dgiiEstado: r.resultado, dgiiEstadoTexto: r.datos?.estadoTexto ?? null, dgiiActividad: r.datos?.actividad || null,
    dgiiRegimen: r.datos?.regimen || null, dgiiPadronFecha: r.padronFecha ?? null, dgiiConsultadoAt: new Date(),
  };
  if (r.datos?.razonSocial) cambios.razonSocial = r.datos.razonSocial.slice(0, 200);
  if (r.datos?.nombreComercial && !actual?.nombreComercial) cambios.nombreComercial = r.datos.nombreComercial.slice(0, 200);
  await guardar(db, colmadoId, cambios, quien);
  return r;
}

/** Si la DGII dice que el RNC no está activo, no se sigue con la guía. */
function bloqueoDgii(f: FeCertificacion | undefined) {
  if (!f?.dgiiEstado || !BLOQUEA_SEGUIR.has(f.dgiiEstado)) return null;
  return { error: mensajePadron(f.dgiiEstado as any, f.dgiiEstadoTexto), dgii: f.dgiiEstado };
}

// ---------- Negocio (dueño y colmadero) ----------

const rutaNegocio = "/api/colmados/:id/facturacion-electronica";
facturacionElectronicaRoutes.use(rutaNegocio, requireAuth, requireBusinessAccess());
facturacionElectronicaRoutes.use(`${rutaNegocio}/*`, requireAuth, requireBusinessAccess());
facturacionElectronicaRoutes.use(rutaNegocio, requierePlan("facturacion_electronica"));
facturacionElectronicaRoutes.use(`${rutaNegocio}/*`, requierePlan("facturacion_electronica"));
facturacionElectronicaRoutes.use(`${rutaNegocio}`, async (c, next) => {
  if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero manejan la facturación electrónica." }, 403);
  await next();
});
facturacionElectronicaRoutes.use(`${rutaNegocio}/*`, async (c, next) => {
  if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero manejan la facturación electrónica." }, 403);
  await next();
});

facturacionElectronicaRoutes.get(rutaNegocio, async (c) => {
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const f = await leerCertificacion(db, id);
  // Se vuelve a consultar la DGII cada semana, por si suspendió o activó el RNC después.
  const vieja = !f?.dgiiConsultadoAt || Date.now() - new Date(f.dgiiConsultadoAt).getTime() > REVISAR_CADA_MS;
  if (f?.rnc && f.dgiiEstado && vieja && (await permitirEvento(db, `padron:${id}`, 15, 10 * 60_000))) {
    await verificarConDgii(db, id, f.rnc, c.var.user.id);
    return c.json(await vista(db, id, await leerCertificacion(db, id)));
  }
  return c.json(await vista(db, id, f));
});

/** «Verificar con la DGII»: consulta el padrón con el RNC o la cédula y llena la razón social. */
facturacionElectronicaRoutes.post(`${rutaNegocio}/verificar-rnc`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const b = (await c.req.json().catch(() => null)) || {};
  const actual = await leerCertificacion(db, id);
  const rnc = soloDigitos(b.rnc) || actual?.rnc || "";
  if (rnc.length !== 9 && rnc.length !== 11) return c.json({ error: "El RNC tiene 9 números y la cédula 11. Revisa el número.", campo: "rnc" }, 400);
  if (!(await permitirEvento(db, `padron:${id}`, 15, 10 * 60_000))) return c.json({ error: "Muchas consultas seguidas. Espera unos minutos y vuelve a intentar." }, 429);
  if (rnc !== actual?.rnc) {
    await guardar(db, id, { rnc, dgiiEstado: null, dgiiEstadoTexto: null, dgiiActividad: null, dgiiRegimen: null, dgiiPadronFecha: null, dgiiConsultadoAt: null }, c.var.user.id);
  }
  const r = await verificarConDgii(db, id, rnc, c.var.user.id);
  await anotar(db, { userId: c.var.user.id, usuario: c.var.user.email, rol: c.var.user.role, colmadoId: id, accion: "Verificó su RNC o cédula con la DGII", detalle: `${rnc} · ${r.datos?.estadoTexto || r.resultado}`, ip: c.req.header("CF-Connecting-IP") ?? null });
  return c.json({ ...(await vista(db, id, await leerCertificacion(db, id))), verificacion: { resultado: r.resultado, mensaje: mensajePadron(r.resultado, r.datos?.estadoTexto) } });
});

/** Datos fiscales y del firmante. */
facturacionElectronicaRoutes.put(`${rutaNegocio}/datos`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const b = (await c.req.json().catch(() => null)) || {};
  const rnc = soloDigitos(b.rnc);
  if (rnc && rnc.length !== 9 && rnc.length !== 11) return c.json({ error: "El RNC tiene 9 números y la cédula 11. Revisa el número.", campo: "rnc" }, 400);
  const repCedula = soloDigitos(b.repCedula);
  if (repCedula && repCedula.length !== 11) return c.json({ error: "La cédula del firmante tiene 11 números.", campo: "repCedula" }, 400);
  const tipo = texto(b.tipoContribuyente, 30);
  if (tipo && !TIPOS_CONTRIBUYENTE[tipo]) return c.json({ error: "Tipo de contribuyente no válido.", campo: "tipoContribuyente" }, 400);
  for (const campo of ["correoFiscal", "repCorreo"] as const) {
    const v = texto(b[campo], 200);
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return c.json({ error: "Ese correo no es válido.", campo }, 400);
  }
  const antes = await leerCertificacion(db, id);
  const cambioRnc = (rnc || null) !== (antes?.rnc ?? null);
  // Con el RNC verificado, la razón social es la de la DGII y no se cambia a mano.
  const razonDgii = !cambioRnc && antes?.dgiiEstado && antes.dgiiEstado !== "no_existe" ? antes.razonSocial : null;
  await guardar(db, id, {
    ...(cambioRnc ? { dgiiEstado: null, dgiiEstadoTexto: null, dgiiActividad: null, dgiiRegimen: null, dgiiPadronFecha: null, dgiiConsultadoAt: null } : {}),
    rnc: rnc || null, razonSocial: razonDgii || texto(b.razonSocial) || null, nombreComercial: texto(b.nombreComercial) || null,
    direccionFiscal: texto(b.direccionFiscal, 300) || null, tipoContribuyente: tipo || null, correoFiscal: texto(b.correoFiscal) || null,
    repNombre: texto(b.repNombre) || null, repCedula: repCedula || null, repCargo: texto(b.repCargo, 100) || null, repCorreo: texto(b.repCorreo) || null,
  }, c.var.user.id);
  // RNC nuevo o nunca verificado: se consulta la DGII al guardar.
  let verificacion: { resultado: string; mensaje: string } | undefined;
  if (rnc && (cambioRnc || !antes?.dgiiEstado) && (await permitirEvento(db, `padron:${id}`, 15, 10 * 60_000))) {
    const r = await verificarConDgii(db, id, rnc, c.var.user.id);
    verificacion = { resultado: r.resultado, mensaje: mensajePadron(r.resultado, r.datos?.estadoTexto) };
  }
  return c.json({ ...(await vista(db, id, await leerCertificacion(db, id))), verificacion });
});

/** Estado del certificado (sin subir el archivo todavía) o subida del .p12 con su contraseña. */
facturacionElectronicaRoutes.put(`${rutaNegocio}/certificado`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const bloqueo = bloqueoDgii(await leerCertificacion(db, id));
  if (bloqueo) return c.json(bloqueo, 409);
  const b = (await c.req.json().catch(() => null)) || {};
  const estado = texto(b.estado, 20);
  const entidad = texto(b.entidad, 30);
  if (estado && !["no_tiene", "en_tramite", "listo"].includes(estado)) return c.json({ error: "Estado no válido." }, 400);
  if (entidad && !ENTIDADES_CERTIFICADO[entidad]) return c.json({ error: "Entidad no válida." }, 400);
  const cambios: Partial<typeof feCertificacion.$inferInsert> = {};
  if (estado) cambios.certEstado = estado;
  if (entidad) cambios.certEntidad = entidad;
  if (typeof b.vence === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.vence)) cambios.certVence = b.vence;

  if (typeof b.archivo === "string" && b.archivo) {
    // El certificado es de la persona que firma: solo lo sube el dueño (o la plataforma).
    if (!["colmado_owner", "platform_admin"].includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño puede subir el certificado digital." }, 403);
    const archivo = b.archivo.replace(/^data:[^,]*,/, "");
    if (archivo.length > MAX_CERT_BYTES * 1.4) return c.json({ error: "El archivo es demasiado grande para ser un certificado digital." }, 400);
    const clave = typeof b.clave === "string" ? b.clave : "";
    if (!clave) return c.json({ error: "Escribe la contraseña del certificado." }, 400);
    let datos;
    try { datos = leerP12(archivo, clave); } catch (err) {
      if (err instanceof CertificadoInvalido) return c.json({ error: err.message }, 400);
      throw err;
    }
    if (!datos.tieneLlave) return c.json({ error: "Ese archivo no trae la llave privada. Pide a la entidad el archivo .p12 completo." }, 400);
    if (Date.parse(`${datos.vence}T23:59:59Z`) < Date.now()) return c.json({ error: `Ese certificado venció el ${datos.vence}. Renuévalo con la entidad que lo emitió.` }, 400);
    try {
      cambios.certArchivo = await cifrar(archivo, c.env.DELYWA_CLAVE_MAESTRA);
      cambios.certClave = await cifrar(clave, c.env.DELYWA_CLAVE_MAESTRA);
    } catch (err) {
      if (err instanceof SinClaveMaestra) return c.json({ error: err.message }, 503);
      throw err;
    }
    Object.assign(cambios, { certEstado: "listo", certTitular: datos.titular, certVence: datos.vence, certSubidoAt: new Date() });
    // Si el certificado trae la cédula y no se ha escrito el firmante, se completa.
    const actual = await leerCertificacion(db, id);
    if (!actual?.repNombre && datos.titular) cambios.repNombre = datos.titular;
    if (!actual?.repCedula && datos.cedula) cambios.repCedula = datos.cedula;
    await anotar(db, { userId: c.var.user.id, usuario: c.var.user.email, rol: c.var.user.role, colmadoId: id, accion: "Subió el certificado digital de facturación electrónica", detalle: `${datos.titular} · vence ${datos.vence}`, ip: c.req.header("CF-Connecting-IP") ?? null });
  }
  if (!Object.keys(cambios).length) return c.json({ error: "No hay nada que guardar." }, 400);
  await guardar(db, id, cambios, c.var.user.id);
  return c.json(await vista(db, id, await leerCertificacion(db, id)));
});

/** Quita el certificado guardado (por ejemplo, para subir uno renovado). */
facturacionElectronicaRoutes.delete(`${rutaNegocio}/certificado`, async (c) => {
  if (!["colmado_owner", "platform_admin"].includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño puede quitar el certificado digital." }, 403);
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  await guardar(db, id, { certArchivo: null, certClave: null, certSubidoAt: null, certTitular: null, certVence: null, certEstado: "no_tiene" }, c.var.user.id);
  await anotar(db, { userId: c.var.user.id, usuario: c.var.user.email, rol: c.var.user.role, colmadoId: id, accion: "Quitó el certificado digital de facturación electrónica", ip: c.req.header("CF-Connecting-IP") ?? null });
  return c.json(await vista(db, id, await leerCertificacion(db, id)));
});

/** Marca un paso que se hace fuera de Delywa (OFV, Portal de Certificación). */
facturacionElectronicaRoutes.put(`${rutaNegocio}/pasos/:paso`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const paso = c.req.param("paso") as ClavePaso;
  if (!PASOS_MANUALES.has(paso)) return c.json({ error: "Ese paso se completa solo con los datos." }, 400);
  const bloqueo = bloqueoDgii(await leerCertificacion(db, id));
  if (bloqueo) return c.json(bloqueo, 409);
  const b = (await c.req.json().catch(() => null)) || {};
  const estado = texto(b.estado, 20) as PasoCertificacion["estado"];
  if (!["pendiente", "en_curso", "listo"].includes(estado)) return c.json({ error: "Estado no válido." }, 400);
  const fecha = typeof b.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : estado === "listo" ? new Date().toISOString().slice(0, 10) : null;
  const actual = await leerCertificacion(db, id);
  const pasos = { ...(actual?.pasos ?? {}), [paso]: { estado, fecha, nota: texto(b.nota, 500) || null } };
  const cambios: Partial<typeof feCertificacion.$inferInsert> = { pasos };
  if (paso === "autorizado") cambios.autorizadoAt = estado === "listo" ? new Date(`${fecha}T12:00:00Z`) : null;
  await guardar(db, id, cambios, c.var.user.id);
  return c.json(await vista(db, id, await leerCertificacion(db, id)));
});

/** Rangos de e-NCF que autorizó la DGII. Se envía la lista completa. */
facturacionElectronicaRoutes.put(`${rutaNegocio}/secuencias`, async (c) => {
  const db = getDb(c.env.DB);
  const id = await negocioPrincipalId(db, Number(c.req.param("id")));
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const b = (await c.req.json().catch(() => null)) || {};
  const bloqueo = bloqueoDgii(await leerCertificacion(db, id));
  if (bloqueo) return c.json(bloqueo, 409);
  if (!Array.isArray(b.secuencias) || b.secuencias.length > 20) return c.json({ error: "Lista de secuencias no válida." }, 400);
  const lista: SecuenciaENcf[] = [];
  for (const s of b.secuencias) {
    const tipo = texto(s?.tipo, 2);
    const desde = texto(s?.desde, 13).toUpperCase();
    const hasta = texto(s?.hasta, 13).toUpperCase();
    const vence = typeof s?.vence === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.vence) ? s.vence : null;
    if (!TIPOS_ENCF[tipo]) return c.json({ error: "Elige el tipo de comprobante de cada rango." }, 400);
    if (!encfValido(desde, tipo) || !encfValido(hasta, tipo)) {
      return c.json({ error: `Los e-NCF de tipo ${tipo} tienen 13 caracteres y empiezan con E${tipo} (por ejemplo E${tipo}0000000001).` }, 400);
    }
    if (hasta < desde) return c.json({ error: `En el rango de tipo ${tipo}, «hasta» no puede ser menor que «desde».` }, 400);
    lista.push({ tipo, desde, hasta, vence });
  }
  await guardar(db, id, { secuencias: lista }, c.var.user.id);
  return c.json(await vista(db, id, await leerCertificacion(db, id)));
});

// ---------- Plataforma ----------

facturacionElectronicaRoutes.use("/api/admin/facturacion-electronica/*", requireAuth, requireAdmin);

/** Avance de todos los negocios principales. */
facturacionElectronicaRoutes.get("/api/admin/facturacion-electronica/negocios", async (c) => {
  const db = getDb(c.env.DB);
  const filas = await db.select({ c: colmados, f: feCertificacion, duenoCorreo: users.email })
    .from(colmados)
    .leftJoin(feCertificacion, eq(feCertificacion.colmadoId, colmados.id))
    .leftJoin(users, eq(users.id, colmados.ownerUserId))
    .where(isNull(colmados.negocioPrincipalId))
    .orderBy(desc(feCertificacion.actualizadoAt));
  return c.json(filas.map(({ c: n, f, duenoCorreo }) => {
    const pasos = estadoPasos(f ?? undefined);
    return {
      colmadoId: n.id, nombre: n.nombre, estadoNegocio: n.estado, duenoCorreo,
      rnc: f?.rnc ?? null, razonSocial: f?.razonSocial ?? null, tipoContribuyente: f?.tipoContribuyente ?? null,
      dgiiEstado: f?.dgiiEstado ?? null, dgiiEstadoTexto: f?.dgiiEstadoTexto ?? null,
      certificado: { estado: f?.certEstado ?? "no_tiene", subido: Boolean(f?.certArchivo), vence: f?.certVence ?? null, diasParaVencer: diasParaVencer(f?.certVence) },
      avance: resumenAvance(pasos), pasos, autorizadoAt: f?.autorizadoAt ?? null, actualizadoAt: f?.actualizadoAt ?? null,
    };
  }));
});

/** Datos del proveedor certificado que el negocio copia en el Portal de Certificación. */
facturacionElectronicaRoutes.get("/api/admin/facturacion-electronica/proveedor", async (c) => c.json(await leerProveedor(getDb(c.env.DB))));

facturacionElectronicaRoutes.put("/api/admin/facturacion-electronica/proveedor", async (c) => {
  const db = getDb(c.env.DB);
  const b = (await c.req.json().catch(() => null)) || {};
  const p: ProveedorFE = {
    nombre: texto(b.nombre), rnc: soloDigitos(b.rnc).slice(0, 11), software: texto(b.software), version: texto(b.version, 50),
    urlRecepcion: texto(b.urlRecepcion, 300), urlAprobacion: texto(b.urlAprobacion, 300), urlAutenticacion: texto(b.urlAutenticacion, 300),
    contacto: texto(b.contacto, 300),
  };
  for (const k of ["urlRecepcion", "urlAprobacion", "urlAutenticacion"] as const) {
    if (p[k] && !/^https:\/\/[^\s]+$/.test(p[k])) return c.json({ error: "Las direcciones deben empezar con https://", campo: k }, 400);
  }
  const valor = JSON.stringify(p);
  await db.insert(configuracionSistema).values({ clave: CLAVE_PROVEEDOR, valor, tipo: "json", descripcion: "Proveedor de facturación electrónica (datos para la postulación ante la DGII)" })
    .onConflictDoUpdate({ target: configuracionSistema.clave, set: { valor, fechaModificacion: new Date() } });
  return c.json(p);
});
