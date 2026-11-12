import { and, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import {
  asistencias, colmados, empleadoSucursales, empleados, nominaConfiguracionAuditorias, nominaConfiguraciones, nominaDetalles,
  nominas, paises, type Asistencia, type Empleado, type InsertEmpleado, type Nomina, type NominaConfiguracionAuditoria,
  type NominaDetalle, type NominaReglas, type Pais,
} from "@shared/schema";
import type { Db } from "../db";
import { chunkRows, isUniqueViolation } from "../lib/d1";
import { fechaLocal, inicioDiaLocal, rangoDiaLocal } from "../lib/fechas";
import { calcularDetalle, getPoliticaNomina, NominaInvalida, REGLAS_POR_DEFECTO, validarReglas, type JornadaDia } from "../lib/nomina";
import { generarCodigoAcceso } from "../lib/turno-repartidor";
import { getColmado, getColmadoTimezone, getPais } from "./colmados";

export type EmpleadoConSucursales = Empleado & { sucursalIds: number[] };
export type DatosEmpleado = Omit<InsertEmpleado, "id" | "negocioId" | "codigoAcceso" | "fechaCreacion" | "fechaActualizacion">;

// ---------- Empleados ----------

async function conSucursales(db: Db, filas: Empleado[]): Promise<EmpleadoConSucursales[]> {
  if (!filas.length) return [];
  const asignadas = (await Promise.all(chunkRows(filas.map((f) => f.id), 1).map((ids) =>
    db.select().from(empleadoSucursales).where(inArray(empleadoSucursales.empleadoId, ids))))).flat();
  return filas.map((f) => ({ ...f, sucursalIds: asignadas.filter((a) => a.empleadoId === f.id).map((a) => a.sucursalId) }));
}

export async function getEmpleados(db: Db, negocioId: number): Promise<EmpleadoConSucursales[]> {
  return conSucursales(db, await db.select().from(empleados).where(eq(empleados.negocioId, negocioId)).orderBy(empleados.nombres, empleados.apellidos));
}

export async function getEmpleadoById(db: Db, id: number): Promise<EmpleadoConSucursales | undefined> {
  if (!Number.isInteger(id)) return undefined;
  return (await conSucursales(db, await db.select().from(empleados).where(eq(empleados.id, id)).limit(1)))[0];
}

export async function getEmpleadoByCodigoAcceso(db: Db, codigo: string): Promise<EmpleadoConSucursales | undefined> {
  return (await conSucursales(db, await db.select().from(empleados).where(eq(empleados.codigoAcceso, codigo.toUpperCase())).limit(1)))[0];
}

/** Crea el empleado y sus sucursales en un solo batch. El código es único: si choca, se genera otro. */
export async function createEmpleado(db: Db, negocioId: number, data: DatosEmpleado, sucursalIds: number[]): Promise<EmpleadoConSucursales> {
  for (let intento = 0; ; intento++) {
    const [{ siguiente }] = await db.select({ siguiente: sql<number>`coalesce(max(${empleados.id}), 0) + 1` }).from(empleados);
    try {
      const [[empleado]] = await db.batch([
        db.insert(empleados).values({ ...data, id: siguiente, negocioId, codigoAcceso: generarCodigoAcceso() }).returning(),
        db.insert(empleadoSucursales).values(sucursalIds.map((sucursalId) => ({ empleadoId: siguiente, sucursalId }))),
      ]);
      return { ...empleado, sucursalIds };
    } catch (err) {
      if (intento >= 3 || !isUniqueViolation(err)) throw err;
    }
  }
}

/**
 * Actualiza datos y sucursales. Solo se reemplazan las sucursales que quien
 * edita puede administrar; las demás asignaciones se conservan.
 */
export async function updateEmpleado(
  db: Db, id: number, data: Partial<DatosEmpleado>, sucursalIds: number[], administrables: number[],
): Promise<EmpleadoConSucursales | undefined> {
  const [[empleado]] = await db.batch([
    db.update(empleados).set({ ...data, fechaActualizacion: new Date() }).where(eq(empleados.id, id)).returning(),
    db.delete(empleadoSucursales).where(and(eq(empleadoSucursales.empleadoId, id), inArray(empleadoSucursales.sucursalId, administrables))),
    db.insert(empleadoSucursales).values(sucursalIds.map((sucursalId) => ({ empleadoId: id, sucursalId }))).onConflictDoNothing(),
  ]);
  return empleado ? getEmpleadoById(db, id) : undefined;
}

// ---------- Asistencia ----------

export type AsistenciaConNombres = Asistencia & { empleadoNombre: string; sucursalNombre: string; negocioId: number };

function consultaAsistencias(db: Db) {
  return db.select({
    id: asistencias.id, empleadoId: asistencias.empleadoId, sucursalId: asistencias.sucursalId, entrada: asistencias.entrada,
    salida: asistencias.salida, horasTrabajadas: asistencias.horasTrabajadas, notas: asistencias.notas,
    corregidaPor: asistencias.corregidaPor, fechaCreacion: asistencias.fechaCreacion,
    empleadoNombre: sql<string>`trim(${empleados.nombres} || ' ' || coalesce(${empleados.apellidos}, ''))`,
    sucursalNombre: colmados.nombre, negocioId: empleados.negocioId,
  }).from(asistencias)
    .innerJoin(empleados, eq(empleados.id, asistencias.empleadoId))
    .innerJoin(colmados, eq(colmados.id, asistencias.sucursalId));
}

/** Asistencias cuya entrada cae en [desde, hasta). */
export async function getAsistencias(db: Db, negocioId: number, desde?: Date, hasta?: Date): Promise<AsistenciaConNombres[]> {
  return consultaAsistencias(db).where(and(
    eq(empleados.negocioId, negocioId),
    ...(desde ? [gte(asistencias.entrada, desde)] : []),
    ...(hasta ? [lt(asistencias.entrada, hasta)] : []),
  )).orderBy(desc(asistencias.entrada), desc(asistencias.id));
}

export async function getAsistenciaById(db: Db, id: number): Promise<AsistenciaConNombres | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const [row] = await consultaAsistencias(db).where(eq(asistencias.id, id));
  return row;
}

export async function getAsistenciaAbierta(db: Db, empleadoId: number): Promise<Asistencia | undefined> {
  const [row] = await db.select().from(asistencias)
    .where(and(eq(asistencias.empleadoId, empleadoId), isNull(asistencias.salida)))
    .orderBy(desc(asistencias.entrada)).limit(1);
  return row;
}

/** Abre la jornada. Un índice único impide dos jornadas abiertas aunque lleguen dos peticiones a la vez. */
export async function marcarEntrada(db: Db, empleadoId: number, sucursalId: number): Promise<Asistencia> {
  try {
    const [row] = await db.insert(asistencias).values({ empleadoId, sucursalId, entrada: new Date() }).returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new NominaInvalida("El empleado ya tiene una jornada abierta");
    throw err;
  }
}

const horasEntre = (entrada: Date, salida: Date) => Math.max(0, (salida.getTime() - entrada.getTime()) / 3_600_000).toFixed(2);

/** Cierra la jornada solo si sigue abierta. */
export async function marcarSalida(db: Db, abierta: Pick<Asistencia, "id" | "entrada">): Promise<Asistencia> {
  const salida = new Date();
  const [row] = await db.update(asistencias).set({ salida, horasTrabajadas: horasEntre(abierta.entrada, salida) })
    .where(and(eq(asistencias.id, abierta.id), isNull(asistencias.salida))).returning();
  if (!row) throw new NominaInvalida("Esta jornada ya está cerrada");
  return row;
}

export async function corregirAsistencia(
  db: Db, id: number, data: { entrada: Date; salida: Date | null; notas?: string | null; corregidaPor: string },
): Promise<Asistencia> {
  try {
    const [row] = await db.update(asistencias).set({
      entrada: data.entrada, salida: data.salida, horasTrabajadas: data.salida ? horasEntre(data.entrada, data.salida) : null,
      corregidaPor: data.corregidaPor, ...(data.notas !== undefined ? { notas: data.notas } : {}),
    }).where(eq(asistencias.id, id)).returning();
    if (!row) throw new NominaInvalida("Registro de asistencia no encontrado");
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new NominaInvalida("El empleado ya tiene otra jornada abierta; ciérrala antes de reabrir esta");
    throw err;
  }
}

// ---------- Configuración de nómina ----------

export async function getPaisByCodigo(db: Db, codigo: string): Promise<Pais | undefined> {
  const [row] = await db.select().from(paises).where(eq(paises.codigo, codigo.toUpperCase()));
  return row;
}

export async function getNominaConfiguracion(db: Db, negocioId: number): Promise<NominaReglas> {
  const [row] = await db.select().from(nominaConfiguraciones).where(eq(nominaConfiguraciones.negocioId, negocioId));
  if (row) return row.reglas;
  const negocio = await getColmado(db, negocioId);
  const pais = negocio?.paisId ? await getPais(db, negocio.paisId) : await getPaisByCodigo(db, "DO");
  const politica = getPoliticaNomina(pais?.codigo || "DO");
  if (!politica) return { ...REGLAS_POR_DEFECTO, feriados: [] };
  return { ...politica.reglas, feriados: [...politica.reglas.feriados], paisId: pais?.id ?? null, paisCodigo: politica.codigo, origenConfiguracion: "plantilla_pais" };
}

/** Guarda las reglas, deja la auditoría y, si cambió, el país del negocio: todo en un batch. */
export async function guardarNominaConfiguracion(
  db: Db, negocioId: number, reglas: NominaReglas, actorId: string, paisId: number | null, actualizarPais: boolean,
): Promise<NominaReglas> {
  const [anterior] = await db.select().from(nominaConfiguraciones).where(eq(nominaConfiguraciones.negocioId, negocioId));
  await db.batch([
    db.insert(nominaConfiguraciones).values({ negocioId, reglas, fechaActualizacion: new Date() })
      .onConflictDoUpdate({ target: nominaConfiguraciones.negocioId, set: { reglas, fechaActualizacion: new Date() } }),
    db.insert(nominaConfiguracionAuditorias).values({ negocioId, paisId, actorId, reglasAnteriores: anterior?.reglas ?? null, reglasNuevas: reglas }),
    ...(actualizarPais ? [db.update(colmados).set({ paisId }).where(eq(colmados.id, negocioId))] : []),
  ] as any);
  return reglas;
}

export async function getNominaConfiguracionAuditorias(db: Db, negocioId: number): Promise<NominaConfiguracionAuditoria[]> {
  return db.select().from(nominaConfiguracionAuditorias).where(eq(nominaConfiguracionAuditorias.negocioId, negocioId))
    .orderBy(desc(nominaConfiguracionAuditorias.fechaCreacion), desc(nominaConfiguracionAuditorias.id)).limit(10);
}

// ---------- Nóminas ----------

export type NominaConDetalles = Nomina & { detalles: NominaDetalle[] };

/**
 * Calcula la nómina del período (fechas AAAA-MM-DD, ambas incluidas) en la zona
 * horaria del negocio y la guarda con sus detalles en un solo batch.
 * Entran los empleados activos y los inactivos que trabajaron en el período.
 */
export async function crearNomina(db: Db, negocioId: number, periodoInicio: string, periodoFin: string): Promise<NominaConDetalles> {
  const negocio = await getColmado(db, negocioId);
  const tz = negocio ? await getColmadoTimezone(db, negocio) : "America/Santo_Domingo";
  const reglas = await getNominaConfiguracion(db, negocioId);
  validarReglas(reglas);
  const mediodia = (f: string) => new Date(`${f}T12:00:00.000Z`);
  const desde = inicioDiaLocal(tz, mediodia(periodoInicio));
  const hasta = rangoDiaLocal(tz, mediodia(periodoFin)).hasta;
  const [lista, asistenciasPeriodo] = await Promise.all([getEmpleados(db, negocioId), getAsistencias(db, negocioId, desde, hasta)]);

  const porEmpleado = new Map<number, Map<string, number>>();
  for (const a of asistenciasPeriodo) {
    const dias = porEmpleado.get(a.empleadoId) ?? new Map<string, number>();
    const dia = fechaLocal(tz, a.entrada);
    dias.set(dia, (dias.get(dia) ?? 0) + Number(a.horasTrabajadas || 0));
    porEmpleado.set(a.empleadoId, dias);
  }
  const [{ siguiente }] = await db.select({ siguiente: sql<number>`coalesce(max(${nominas.id}), 0) + 1` }).from(nominas);
  const detalles = lista.filter((e) => e.estado === "activo" || porEmpleado.has(e.id)).map((e) => {
    const dias: JornadaDia[] = [...(porEmpleado.get(e.id) ?? [])].map(([dia, horas]) => ({ dia, horas }));
    return { nominaId: siguiente, empleadoId: e.id, tipoPago: e.tipoPago, ...calcularDetalle(e, dias, reglas) };
  });
  const suma = (k: "horasTrabajadas" | "bruto" | "descuentos" | "total") => detalles.reduce((s, d) => s + Number(d[k]), 0).toFixed(2);
  const [[nomina]] = await db.batch([
    db.insert(nominas).values({
      id: siguiente, negocioId, periodoInicio, periodoFin, reglasAplicadas: { ...reglas, feriados: [...reglas.feriados] },
      totalHoras: suma("horasTrabajadas"), totalMonto: suma("total"), totalBruto: suma("bruto"), totalDescuentos: suma("descuentos"), totalNeto: suma("total"),
    }).returning(),
    ...chunkRows(detalles, 14).map((lote) => db.insert(nominaDetalles).values(lote)),
  ] as const);
  return { ...nomina, detalles: await db.select().from(nominaDetalles).where(eq(nominaDetalles.nominaId, siguiente)).orderBy(nominaDetalles.id) };
}

export async function getNominas(db: Db, negocioId: number): Promise<NominaConDetalles[]> {
  const lista = await db.select().from(nominas).where(eq(nominas.negocioId, negocioId)).orderBy(desc(nominas.fechaCreacion), desc(nominas.id)).limit(60);
  if (!lista.length) return [];
  const detalles = await db.select().from(nominaDetalles).where(inArray(nominaDetalles.nominaId, lista.map((n) => n.id))).orderBy(nominaDetalles.id);
  return lista.map((n) => ({ ...n, detalles: detalles.filter((d) => d.nominaId === n.id) }));
}

export async function getNominaById(db: Db, id: number): Promise<Nomina | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const [row] = await db.select().from(nominas).where(eq(nominas.id, id));
  return row;
}

/** Cierra o paga la nómina. Una nómina pagada ya no cambia. */
export async function actualizarEstadoNomina(db: Db, id: number, estado: "cerrada" | "pagada", userId: string): Promise<Nomina> {
  const [row] = await db.update(nominas)
    .set(estado === "cerrada" ? { estado, cerradoPor: userId, fechaCierre: new Date() } : { estado, pagadoPor: userId, fechaPago: new Date() })
    .where(and(eq(nominas.id, id), ne(nominas.estado, "pagada"))).returning();
  if (!row) throw new NominaInvalida("La nómina ya fue pagada");
  return row;
}
