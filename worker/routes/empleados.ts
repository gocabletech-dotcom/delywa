import { Hono, type Context } from "hono";
import { z } from "zod";
import type { NominaReglas, User } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth } from "../lib/auth";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "../lib/rate-limit";
import { rangoDiaLocal, inicioDiaLocal } from "../lib/fechas";
import { esFechaReal, getPoliticaNomina, NominaInvalida, validarReglas } from "../lib/nomina";
import { getColmado, getColmadoTimezone, getPais } from "../storage/colmados";
import { getAllPaises } from "../storage/catalogos";
import { getAccessibleColmadoIds } from "../storage/users";
import {
  actualizarEstadoNomina, corregirAsistencia, crearNomina, createEmpleado, getAsistenciaAbierta, getAsistenciaById,
  getAsistencias, getEmpleadoByCodigoAcceso, getEmpleadoById, getEmpleados, getNominaById, getNominaConfiguracion,
  getNominaConfiguracionAuditorias, getNominas, getPaisByCodigo, guardarNominaConfiguracion, marcarEntrada, marcarSalida,
  updateEmpleado, type DatosEmpleado, type EmpleadoConSucursales,
} from "../storage/empleados";

export const empleadoRoutes = new Hono<AppEnv>();

empleadoRoutes.onError((err, c) => {
  if (err instanceof NominaInvalida) return c.json({ error: err.message }, 400);
  throw err;
});

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

const raizDe = (colmado: { id: number; negocioPrincipalId?: number | null }) => colmado.negocioPrincipalId || colmado.id;

/** Solo el dueño y el administrador de pedidos gestionan personal. Devuelve el negocio principal y sus sucursales accesibles. */
async function gestor(db: Db, user: User): Promise<{ negocioId: number; sucursales: number[] } | null> {
  if (!user.colmadoId || !["colmado_owner", "admin_pedidos"].includes(user.role ?? "")) return null;
  const actual = await getColmado(db, user.colmadoId);
  if (!actual) return null;
  const negocioId = raizDe(actual);
  const accesibles = await Promise.all((await getAccessibleColmadoIds(db, user)).map((id) => getColmado(db, id)));
  // Solo sucursales del mismo negocio (el original no lo verificaba al asignar).
  return { negocioId, sucursales: accesibles.filter((s) => s && raizDe(s) === negocioId).map((s) => s!.id) };
}

// ---------- Empleados ----------

const texto = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v ?? null), z.string().max(max).nullable());
const monto = z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : Number(v)), z.number().finite().min(0).max(100_000_000));
const empleadoSchema = z.object({
  nombres: z.string().trim().min(1, "El nombre es requerido").max(120),
  apellidos: texto(120), cedula: texto(40), email: texto(160), telefono: texto(40), direccion: texto(300), puesto: texto(120),
  fechaIngreso: z.preprocess((v) => v || null, z.string().nullable().refine((v) => v === null || esFechaReal(v), "Fecha de ingreso inválida")),
  estado: z.enum(["activo", "inactivo"]),
  tipoPago: z.enum(["por_hora", "salario"], { errorMap: () => ({ message: "Tipo de pago inválido" }) }),
  tarifaHora: monto, salarioFijo: monto,
  periodoPago: z.enum(["semanal", "quincenal", "mensual"]),
  moneda: z.string().trim().min(1).max(8),
  notas: texto(1000),
});

/** Solo campos conocidos: el original copiaba el cuerpo entero y permitía cambiar el negocio o el código del empleado. */
function datosEmpleado(body: Record<string, any>, parcial: boolean): DatosEmpleado | Partial<DatosEmpleado> | string {
  const esquema = parcial ? empleadoSchema.partial() : empleadoSchema.partial({
    apellidos: true, cedula: true, email: true, telefono: true, direccion: true, puesto: true, fechaIngreso: true,
    estado: true, tarifaHora: true, salarioFijo: true, periodoPago: true, moneda: true, notas: true,
  });
  const r = esquema.safeParse(body);
  if (!r.success) return r.error.issues[0]?.message || "Datos del empleado inválidos";
  const { tarifaHora, salarioFijo, ...resto } = r.data;
  return {
    ...resto,
    ...(tarifaHora !== undefined ? { tarifaHora: tarifaHora.toFixed(2) } : {}),
    ...(salarioFijo !== undefined ? { salarioFijo: salarioFijo.toFixed(2) } : {}),
  } as Partial<DatosEmpleado>;
}

function sucursalesPedidas(body: Record<string, any>): number[] {
  return Array.isArray(body.sucursalIds) ? [...new Set<number>(body.sucursalIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))] : [];
}

const visible = (e: EmpleadoConSucursales, sucursales: number[]) => ({ ...e, sucursalIds: e.sucursalIds.filter((id) => sucursales.includes(id)) });

empleadoRoutes.get("/api/negocio/empleados", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para ver empleados" }, 403);
  return c.json((await getEmpleados(db, g.negocioId)).map((e) => visible(e, g.sucursales)));
});

empleadoRoutes.post("/api/negocio/empleados", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const body = await cuerpo(c);
  const g = await gestor(db, c.var.user);
  const pedidas = sucursalesPedidas(body);
  if (!g || !pedidas.length || !pedidas.every((id) => g.sucursales.includes(id))) {
    return c.json({ error: "No tienes permiso para asignar estas sucursales" }, 403);
  }
  const datos = datosEmpleado(body, false);
  if (typeof datos === "string") return c.json({ error: datos }, 400);
  return c.json(await createEmpleado(db, g.negocioId, datos as DatosEmpleado, pedidas), 201);
});

empleadoRoutes.patch("/api/negocio/empleados/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const body = await cuerpo(c);
  const g = await gestor(db, c.var.user);
  const actual = g ? await getEmpleadoById(db, Number(c.req.param("id"))) : undefined;
  if (!g || !actual || actual.negocioId !== g.negocioId) return c.json({ error: "No tienes permiso para modificar este empleado" }, 403);
  const pedidas = sucursalesPedidas(body);
  if (!pedidas.length || !pedidas.every((id) => g.sucursales.includes(id))) return c.json({ error: "Asignación de sucursales inválida" }, 403);
  const datos = datosEmpleado(body, true);
  if (typeof datos === "string") return c.json({ error: datos }, 400);
  const empleado = await updateEmpleado(db, actual.id, datos, pedidas, g.sucursales);
  return c.json(visible(empleado!, g.sucursales));
});

// ---------- Portal del empleado ----------

const CLAVES_PORTAL = ["portalEmployeeId", "portalEmployeeBranchId"] as const;
const datosPortal = (e: EmpleadoConSucursales) => ({ id: e.id, nombres: e.nombres, apellidos: e.apellidos, puesto: e.puesto });

empleadoRoutes.post("/api/empleado/portal/login", async (c) => {
  const db = getDb(c.env.DB);
  const session = c.var.session;
  // Un intento fallido nunca deja activa la sesión de otro empleado.
  session.unset(...CLAVES_PORTAL);
  const body = await cuerpo(c);
  const codigo = String(body.codigoAcceso || "").trim().toUpperCase();
  if (!codigo) return c.json({ error: "Ingresa tu código de acceso" }, 400);

  // El código es la única credencial: se limita por IP para que no se pueda adivinar.
  const ip = c.req.header("CF-Connecting-IP");
  const clave = `empleado:${ip ?? "sin-ip"}`;
  const bloqueado = await loginBlockedFor(db, clave, undefined);
  if (bloqueado > 0) {
    c.header("Retry-After", String(bloqueado));
    return c.json({ error: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(bloqueado / 60)} minuto(s).`, reason: "rate_limited" }, 429);
  }
  const empleado = await getEmpleadoByCodigoAcceso(db, codigo);
  if (!empleado || empleado.estado !== "activo" || empleado.sucursalIds.length === 0) {
    await recordLoginFailure(db, clave, undefined);
    return c.json({ error: "Código inválido, empleado inactivo o sin sucursales asignadas" }, 401);
  }
  await clearLoginFailures(db, clave);
  const pedida = body.sucursalId ? Number(body.sucursalId) : null;
  if (empleado.sucursalIds.length > 1 && (!pedida || !empleado.sucursalIds.includes(pedida))) {
    const sucursales = await Promise.all(empleado.sucursalIds.map(async (id) => ({ id, nombre: (await getColmado(db, id))?.nombre || `Sucursal ${id}` })));
    return c.json({ error: "Selecciona una sucursal autorizada", sucursales }, 400);
  }
  if (pedida && !empleado.sucursalIds.includes(pedida)) return c.json({ error: "Sucursal no autorizada" }, 403);
  const sucursalId = pedida || empleado.sucursalIds[0];
  session.regenerate();
  session.set("portalEmployeeId", empleado.id);
  session.set("portalEmployeeBranchId", sucursalId);
  return c.json({ employee: datosPortal(empleado), sucursalId });
});

/** Empleado de la sesión, si sigue activo y asignado a la sucursal con la que entró. */
async function empleadoDeSesion(c: Context<AppEnv>) {
  const id = Number(c.var.session.data.portalEmployeeId);
  const sucursalId = Number(c.var.session.data.portalEmployeeBranchId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(sucursalId)) return null;
  const empleado = await getEmpleadoById(getDb(c.env.DB), id);
  if (!empleado || empleado.estado !== "activo" || !empleado.sucursalIds.includes(sucursalId)) return null;
  return { empleado, sucursalId };
}

empleadoRoutes.get("/api/empleado/portal/session", async (c) => {
  const s = await empleadoDeSesion(c);
  if (!s) return c.json({ authenticated: false }, 401);
  const abierta = await getAsistenciaAbierta(getDb(c.env.DB), s.empleado.id);
  return c.json({ authenticated: true, employee: datosPortal(s.empleado), sucursalId: s.sucursalId, asistencia: abierta || null });
});

empleadoRoutes.post("/api/empleado/portal/entrada", async (c) => {
  if (!c.var.session.data.portalEmployeeId) return c.json({ error: "Sesión no iniciada" }, 401);
  const s = await empleadoDeSesion(c);
  if (!s) return c.json({ error: "Empleado no autorizado para esta sucursal" }, 403);
  return c.json(await marcarEntrada(getDb(c.env.DB), s.empleado.id, s.sucursalId), 201);
});

empleadoRoutes.post("/api/empleado/portal/salida", async (c) => {
  if (!c.var.session.data.portalEmployeeId) return c.json({ error: "Sesión no iniciada" }, 401);
  const db = getDb(c.env.DB);
  const s = await empleadoDeSesion(c);
  if (!s) return c.json({ error: "Empleado no autorizado para esta sucursal" }, 403);
  const abierta = await getAsistenciaAbierta(db, s.empleado.id);
  if (!abierta) return c.json({ error: "No tienes una jornada abierta" }, 400);
  if (abierta.sucursalId !== s.sucursalId) return c.json({ error: "Sucursal no autorizada" }, 403);
  return c.json(await marcarSalida(db, abierta));
});

empleadoRoutes.post("/api/empleado/portal/logout", (c) => {
  c.var.session.unset(...CLAVES_PORTAL);
  return c.json({ success: true });
});

// ---------- Asistencia (panel) ----------

empleadoRoutes.get("/api/negocio/asistencias", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para ver asistencia" }, 403);
  const { desde, hasta } = c.req.query();
  if ((desde && !esFechaReal(desde)) || (hasta && !esFechaReal(hasta))) return c.json({ error: "Fechas inválidas" }, 400);
  // Días completos en la zona horaria del negocio (el original usaba días UTC).
  const negocio = await getColmado(db, g.negocioId);
  const tz = negocio ? await getColmadoTimezone(db, negocio) : "America/Santo_Domingo";
  const mediodia = (f: string) => new Date(`${f}T12:00:00.000Z`);
  const lista = await getAsistencias(db, g.negocioId,
    desde ? inicioDiaLocal(tz, mediodia(desde)) : undefined, hasta ? rangoDiaLocal(tz, mediodia(hasta)).hasta : undefined);
  return c.json(lista.filter((a) => g.sucursales.includes(a.sucursalId)));
});

empleadoRoutes.post("/api/negocio/asistencias/entrada", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const body = await cuerpo(c);
  const g = await gestor(db, c.var.user);
  const sucursalId = Number(body.sucursalId);
  if (!g || !g.sucursales.includes(sucursalId)) return c.json({ error: "No tienes permiso para registrar esta entrada" }, 403);
  const empleado = await getEmpleadoById(db, Number(body.empleadoId));
  if (!empleado || empleado.negocioId !== g.negocioId || !empleado.sucursalIds.includes(sucursalId)) {
    return c.json({ error: "Empleado no asignado a esta sucursal" }, 404);
  }
  if (empleado.estado !== "activo") return c.json({ error: "El empleado está inactivo" }, 400);
  return c.json(await marcarEntrada(db, empleado.id, sucursalId), 201);
});

async function asistenciaGestionable(c: Context<AppEnv>, mensaje: string) {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return { error: c.json({ error: mensaje }, 403) };
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return { error: c.json({ error: "Asistencia inválida" }, 400) };
  const actual = await getAsistenciaById(db, id);
  if (!actual || actual.negocioId !== g.negocioId || !g.sucursales.includes(actual.sucursalId)) {
    return { error: c.json({ error: "No tienes permiso para esta asistencia" }, 403) };
  }
  return { db, actual };
}

empleadoRoutes.post("/api/negocio/asistencias/:id/salida", requireAuth, async (c) => {
  const r = await asistenciaGestionable(c, "No tienes permiso para registrar la salida");
  if (r.error) return r.error;
  return c.json(await marcarSalida(r.db, r.actual));
});

empleadoRoutes.patch("/api/negocio/asistencias/:id", requireAuth, async (c) => {
  const r = await asistenciaGestionable(c, "No tienes permiso para corregir asistencia");
  if (r.error) return r.error;
  const body = await cuerpo(c);
  const entrada = new Date(body.entrada);
  const salida = body.salida ? new Date(body.salida) : null;
  const invalida = Number.isNaN(entrada.getTime()) || (salida && (Number.isNaN(salida.getTime()) || salida <= entrada))
    // Una jornada de más de 24 horas o en el futuro es un error de captura.
    || (salida && salida.getTime() - entrada.getTime() > 24 * 3_600_000) || entrada.getTime() > Date.now() + 60_000;
  if (invalida) return c.json({ error: "Fechas de asistencia inválidas" }, 400);
  return c.json(await corregirAsistencia(r.db, r.actual.id, {
    entrada, salida, corregidaPor: c.var.user.id,
    // Las notas solo cambian si se envían (el original las borraba en cada corrección).
    ...(body.notas !== undefined ? { notas: typeof body.notas === "string" && body.notas.trim() ? body.notas.slice(0, 500) : null } : {}),
  }));
});

// ---------- Nómina ----------

empleadoRoutes.get("/api/negocio/nominas", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para ver nóminas" }, 403);
  return c.json(await getNominas(db, g.negocioId));
});

empleadoRoutes.get("/api/negocio/nominas/configuracion", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para ver la configuración de nómina" }, 403);
  const reglas = await getNominaConfiguracion(db, g.negocioId);
  const negocio = await getColmado(db, g.negocioId);
  const pais = negocio?.paisId ? await getPais(db, negocio.paisId) : undefined;
  const politica = getPoliticaNomina(pais?.codigo || "DO");
  return c.json({
    ...reglas, paisId: negocio?.paisId ?? null, paisCodigo: pais?.codigo || "DO",
    politica: politica ? { nombre: politica.nombre, descripcion: politica.descripcion, limites: politica.limites } : null,
  });
});

empleadoRoutes.get("/api/negocio/nominas/politicas", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para ver políticas de nómina" }, 403);
  const [negocio, paises] = await Promise.all([getColmado(db, g.negocioId), getAllPaises(db)]);
  const politicas = ["DO", "AR", "US"].flatMap((codigo) => {
    const politica = getPoliticaNomina(codigo);
    return politica ? [{ ...politica, paisId: paises.find((p) => p.codigo === codigo)?.id ?? null }] : [];
  });
  return c.json({ paisId: negocio?.paisId ?? null, politicas });
});

empleadoRoutes.get("/api/negocio/nominas/configuracion/auditoria", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para ver la auditoría de nómina" }, 403);
  return c.json(await getNominaConfiguracionAuditorias(db, g.negocioId));
});

empleadoRoutes.patch("/api/negocio/nominas/configuracion", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const user = c.var.user;
  const g = await gestor(db, user);
  if (!g) return c.json({ error: "No tienes permiso para guardar la configuración de nómina" }, 403);
  const body = await cuerpo(c);
  const reglas: NominaReglas = {
    horasOrdinariasDiarias: Number(body.horasOrdinariasDiarias), multiplicadorHoraExtra: Number(body.multiplicadorHoraExtra),
    multiplicadorFeriado: Number(body.multiplicadorFeriado), recargoNocturnoPorcentaje: Number(body.recargoNocturnoPorcentaje),
    retencionPorcentaje: Number(body.retencionPorcentaje), retencionFija: Number(body.retencionFija),
    horasPeriodoSalario: Number(body.horasPeriodoSalario),
    feriados: Array.isArray(body.feriados) ? [...new Set<string>(body.feriados)].sort() : [],
    origenConfiguracion: body.origenConfiguracion === "plantilla_pais" ? "plantilla_pais" : "manual",
    fechaConfiguracion: new Date().toISOString(),
  };
  const negocio = await getColmado(db, g.negocioId);
  const paisPedido = body.paisId ? Number(body.paisId) : null;
  const pais = paisPedido ? await getPais(db, paisPedido) : negocio?.paisId ? await getPais(db, negocio.paisId) : await getPaisByCodigo(db, "DO");
  if (!pais) return c.json({ error: "Selecciona un país válido para aplicar reglas de nómina" }, 400);
  const politica = getPoliticaNomina(pais.codigo);
  if (!politica) return c.json({ error: `No hay una política de nómina disponible para ${pais.nombre}` }, 400);
  const cambiaPais = negocio?.paisId !== pais.id;
  if (cambiaPais && user.role !== "colmado_owner") return c.json({ error: "Solo el dueño puede cambiar el país de referencia" }, 403);
  reglas.paisId = pais.id;
  reglas.paisCodigo = pais.codigo;
  validarReglas(reglas, politica);
  return c.json(await guardarNominaConfiguracion(db, g.negocioId, reglas, user.id, pais.id, cambiaPais));
});

empleadoRoutes.post("/api/negocio/nominas/calcular", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para calcular nómina" }, 403);
  const { periodoInicio, periodoFin } = await cuerpo(c);
  if (!esFechaReal(periodoInicio) || !esFechaReal(periodoFin) || periodoInicio > periodoFin) return c.json({ error: "Período inválido" }, 400);
  if (Date.parse(periodoFin) - Date.parse(periodoInicio) > 92 * 24 * 3_600_000) return c.json({ error: "El período no puede superar 3 meses" }, 400);
  return c.json(await crearNomina(db, g.negocioId, periodoInicio, periodoFin), 201);
});

empleadoRoutes.patch("/api/negocio/nominas/:id/estado", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestor(db, c.var.user);
  if (!g) return c.json({ error: "No tienes permiso para actualizar nómina" }, 403);
  const { estado } = await cuerpo(c);
  if (!["cerrada", "pagada"].includes(estado)) return c.json({ error: "Estado inválido" }, 400);
  const nomina = await getNominaById(db, Number(c.req.param("id")));
  if (!nomina || nomina.negocioId !== g.negocioId) return c.json({ error: "Nómina no encontrada" }, 404);
  return c.json(await actualizarEstadoNomina(db, nomina.id, estado, c.var.user.id));
});
