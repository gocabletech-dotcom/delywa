import { and, desc, eq, gt, inArray, isNull, lte, ne, not, sql } from "drizzle-orm";
import {
  cuadres, deliveries, pagosDelivery, paradasRuta, pedidos, rutas, saldosDelivery, users,
  type Cuadre, type Delivery, type PagoDelivery, type ParadaRuta, type Pedido, type Ruta, type SaldoDelivery,
} from "@shared/schema";
import type { Db } from "../db";
import { chunkRows } from "../lib/d1";
import { soloDigitos } from "../lib/telefono";
import { claveAgrupacion } from "../lib/fechas";
import { calcularEtaSencilla, extraerCoordenadas } from "../lib/routeOptimizer";
import { generarCodigoAcceso } from "../lib/turno-repartidor";

export type InsertDelivery = typeof deliveries.$inferInsert;
export type InsertRuta = typeof rutas.$inferInsert;
export type InsertParada = Omit<typeof paradasRuta.$inferInsert, "rutaId">;

/** Error de datos que la ruta devuelve como 400 con su mensaje. */
export class DatosInvalidos extends Error {}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dinero = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// ---------- Repartidores ----------

export { getDeliveryById } from "./pedidos";

export async function getDeliveriesByColmado(db: Db, colmadoId: number): Promise<Delivery[]> {
  return db.select().from(deliveries).where(eq(deliveries.colmadoId, colmadoId)).orderBy(deliveries.id);
}

export async function createDelivery(db: Db, data: Omit<InsertDelivery, "codigoAcceso">): Promise<Delivery> {
  const [row] = await db.insert(deliveries).values({ ...data, codigoAcceso: generarCodigoAcceso() }).returning();
  return row;
}

/** Crea el repartidor y su usuario (rol delivery) en una sola transacción. */
export async function createDeliveryConUsuario(
  db: Db,
  data: { colmadoId: number; nombre: string; whatsappNumero: string },
): Promise<{ delivery: Delivery; userId: string }> {
  // D1 no permite transacciones interactivas: se reserva el id y se insertan
  // ambas filas en un batch. Si otro alta tomó el mismo id, el batch falla entero.
  const [{ siguiente }] = await db.select({ siguiente: sql<number>`coalesce(max(${deliveries.id}), 0) + 1` }).from(deliveries);
  const userId = `delivery-${crypto.randomUUID()}`;
  const [[delivery]] = await db.batch([
    db.insert(deliveries).values({
      id: siguiente, colmadoId: data.colmadoId, nombre: data.nombre, whatsappNumero: data.whatsappNumero,
      estado: "activo", codigoAcceso: generarCodigoAcceso(),
    }).returning(),
    db.insert(users).values({
      id: userId, firstName: data.nombre, whatsappNumero: data.whatsappNumero, role: "delivery",
      colmadoId: data.colmadoId, deliveryId: siguiente,
    }),
  ]);
  return { delivery, userId };
}

export async function updateDeliveryEstado(db: Db, id: number, estado: string, origen = "dashboard"): Promise<Delivery | undefined> {
  const [row] = await db.update(deliveries)
    .set(estado === "activo"
      ? { estado, ultimaActivacion: new Date(), ultimaActivacionOrigen: origen }
      : { estado, ultimaActivacionOrigen: null })
    .where(eq(deliveries.id, id))
    .returning();
  return row;
}

export async function updateDeliveryConfigPago(db: Db, id: number, config: Partial<InsertDelivery>): Promise<Delivery | undefined> {
  const [row] = await db.update(deliveries).set(config).where(eq(deliveries.id, id)).returning();
  return row;
}

export async function updateDeliveryCodigoAcceso(db: Db, id: number): Promise<string> {
  const codigo = generarCodigoAcceso();
  await db.update(deliveries).set({ codigoAcceso: codigo }).where(eq(deliveries.id, id));
  return codigo;
}

export async function updateDeliveryHeartbeat(db: Db, id: number): Promise<void> {
  await db.update(deliveries).set({ ultimaUbicacionAt: new Date() }).where(eq(deliveries.id, id));
}

export async function updateDeliveryUbicacion(db: Db, id: number, lat: number, lon: number): Promise<void> {
  await db.update(deliveries)
    .set({ ultimaLatitud: String(lat), ultimaLongitud: String(lon), ultimaUbicacionAt: new Date() })
    .where(eq(deliveries.id, id));
}

/** Pendientes que impiden borrar a un repartidor sin perder dinero por cuadrar. */
export async function pendientesDelRepartidor(db: Db, id: number): Promise<{ cuadres: number; saldos: number }> {
  const [[c], [s]] = await db.batch([
    db.select({ n: sql<number>`count(*)` }).from(cuadres).where(and(eq(cuadres.deliveryId, id), eq(cuadres.estado, "pendiente"))),
    db.select({ n: sql<number>`count(*)` }).from(saldosDelivery).where(and(eq(saldosDelivery.deliveryId, id), eq(saldosDelivery.estado, "pendiente"))),
  ]);
  return { cuadres: Number(c.n), saldos: Number(s.n) };
}

/**
 * Borra al repartidor. Sus pedidos aún abiertos quedan sin asignar para
 * reasignarlos; el usuario creado para él se borra y una cuenta vinculada
 * por el propio repartidor vuelve a quedar sin rol.
 */
export async function deleteDelivery(db: Db, id: number): Promise<void> {
  await db.batch([
    db.update(pedidos).set({ deliveryId: null })
      .where(and(eq(pedidos.deliveryId, id), not(inArray(pedidos.estado, ["entregado", "cancelado", "retorno", "fusionado"])))),
    db.delete(users).where(and(eq(users.deliveryId, id), eq(users.role, "delivery"), isNull(users.password), isNull(users.email))),
    db.update(users).set({ role: "pending", colmadoId: null, deliveryId: null, updatedAt: new Date() })
      .where(and(eq(users.deliveryId, id), eq(users.role, "delivery"))),
    db.delete(deliveries).where(eq(deliveries.id, id)),
  ]);
}

/** Busca un repartidor del negocio por número (solo dígitos) y código, sin distinguir mayúsculas. */
export async function getDeliveryByPortalLogin(db: Db, colmadoId: number, whatsapp: string, codigo: string): Promise<Delivery | undefined> {
  const lista = await db.select().from(deliveries)
    .where(and(eq(deliveries.colmadoId, colmadoId), eq(sql`upper(trim(${deliveries.codigoAcceso}))`, codigo.trim().toUpperCase())));
  const digitos = soloDigitos(whatsapp);
  return lista.find((d) => soloDigitos(d.whatsappNumero) === digitos);
}

/** Repartidores de cualquier negocio con ese número y código (para vincular una cuenta). */
export async function getDeliveriesParaVincular(db: Db, whatsapp: string, codigo: string): Promise<Delivery[]> {
  const lista = await db.select().from(deliveries)
    .where(eq(sql`upper(trim(${deliveries.codigoAcceso}))`, codigo.trim().toUpperCase()));
  const digitos = soloDigitos(whatsapp);
  return lista.filter((d) => soloDigitos(d.whatsappNumero) === digitos);
}

// ---------- Pedidos del repartidor ----------

export async function getPedidosByDelivery(db: Db, deliveryId: number, limite?: number): Promise<Pedido[]> {
  const q = db.select().from(pedidos).where(eq(pedidos.deliveryId, deliveryId)).orderBy(desc(pedidos.fechaCreacion), desc(pedidos.id));
  return limite ? q.limit(limite) : q;
}

/** Asigna solo si el pedido sigue listo, no es pickup ni está fusionado. */
export async function asignarPedidoADelivery(db: Db, pedidoId: number, deliveryId: number): Promise<boolean> {
  const rows = await db.update(pedidos).set({ deliveryId })
    .where(and(eq(pedidos.id, pedidoId), eq(pedidos.estado, "listo"), ne(pedidos.tipoEntrega, "pickup")))
    .returning({ id: pedidos.id });
  return rows.length > 0;
}

// ---------- Reportes y nómina ----------

export async function getReporteVentasDelivery(
  db: Db, colmadoId: number, agrupacion: "dia" | "semana" | "mes", desde: Date, hasta: Date, timeZone: string,
) {
  const filas = await db
    .select({ deliveryId: pedidos.deliveryId, nombre: deliveries.nombre, fecha: pedidos.fechaEntrega, total: pedidos.total })
    .from(pedidos)
    .innerJoin(deliveries, eq(pedidos.deliveryId, deliveries.id))
    .where(and(
      eq(pedidos.colmadoId, colmadoId), eq(pedidos.estado, "entregado"),
      sql`${pedidos.fechaEntrega} >= ${desde.getTime()}`, sql`${pedidos.fechaEntrega} <= ${hasta.getTime()}`,
    ));
  // SQLite no tiene date_trunc: se agrupa aquí por día/semana/mes local del negocio.
  const grupos = new Map<string, { deliveryId: number; deliveryNombre: string; bucket: string; totalPedidos: number; totalVentas: number }>();
  for (const f of filas) {
    if (!f.deliveryId || !f.fecha) continue;
    const bucket = claveAgrupacion(timeZone, f.fecha, agrupacion);
    const k = `${f.deliveryId}|${bucket}`;
    const g = grupos.get(k) ?? { deliveryId: f.deliveryId, deliveryNombre: f.nombre || `Repartidor #${f.deliveryId}`, bucket, totalPedidos: 0, totalVentas: 0 };
    g.totalPedidos += 1;
    g.totalVentas = Math.round((g.totalVentas + num(f.total)) * 100) / 100;
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.deliveryId - b.deliveryId);
}

export async function calcularPagoDelivery(db: Db, delivery: Delivery, periodoInicio: Date, periodoFin: Date): Promise<PagoDelivery> {
  const entregas = await db.select({ total: pedidos.total }).from(pedidos).where(and(
    eq(pedidos.deliveryId, delivery.id), eq(pedidos.estado, "entregado"),
    gt(pedidos.fechaEntrega, periodoInicio), lte(pedidos.fechaEntrega, periodoFin),
  ));
  const totalPedidos = entregas.length;
  const totalVentas = entregas.reduce((s, p) => s + num(p.total), 0);
  const modeloPago = delivery.modeloPago || "comision";
  const salario = modeloPago === "salario" || modeloPago === "mixto" ? num(delivery.salarioMonto) : 0;
  const comision = modeloPago === "comision" || modeloPago === "mixto"
    ? num(delivery.comisionFija) * totalPedidos + (totalVentas * num(delivery.comisionPorcentaje)) / 100
    : 0;
  const [pago] = await db.insert(pagosDelivery).values({
    deliveryId: delivery.id, colmadoId: delivery.colmadoId, periodoInicio, periodoFin, totalPedidos,
    totalVentas: dinero(totalVentas), modeloPago, salarioCalculado: dinero(salario), comisionCalculada: dinero(comision),
    montoTotal: dinero(salario + comision),
  }).returning();
  return pago;
}

export async function getHistorialPagosDelivery(db: Db, deliveryId: number, limite = 50): Promise<PagoDelivery[]> {
  return db.select().from(pagosDelivery).where(eq(pagosDelivery.deliveryId, deliveryId)).orderBy(desc(pagosDelivery.periodoInicio)).limit(limite);
}

export async function getHistorialPagosColmado(db: Db, colmadoId: number, limite = 100): Promise<PagoDelivery[]> {
  return db.select().from(pagosDelivery).where(eq(pagosDelivery.colmadoId, colmadoId)).orderBy(desc(pagosDelivery.periodoInicio)).limit(limite);
}

export async function getPagoDeliveryById(db: Db, id: number): Promise<PagoDelivery | undefined> {
  const [row] = await db.select().from(pagosDelivery).where(eq(pagosDelivery.id, id));
  return row;
}

export async function marcarPagoDeliveryComoPagado(db: Db, id: number, pagadoPor: string | null): Promise<PagoDelivery | undefined> {
  const [row] = await db.update(pagosDelivery)
    .set({ estado: "pagado", fechaPago: new Date(), pagadoPor })
    .where(eq(pagosDelivery.id, id))
    .returning();
  return row;
}

// ---------- Cuadres ----------

const vueltoDe = (p: Pick<Pedido, "vueltoEntregado">) => num(p.vueltoEntregado);

/** Pedidos entregados en efectivo y retornos en que se dio vuelto, aún sin cuadre. */
export async function getPedidosSinCuadre(db: Db, deliveryId: number): Promise<Pedido[]> {
  const lista = await db.select().from(pedidos).where(and(
    eq(pedidos.deliveryId, deliveryId), isNull(pedidos.cuadreId), inArray(pedidos.estado, ["entregado", "retorno"]),
  )).orderBy(desc(pedidos.fechaCreacion));
  const entregados = lista.filter((p) => p.estado === "entregado" && p.metodoPago === "efectivo");
  const retornos = lista.filter((p) => p.estado === "retorno" && vueltoDe(p) > 0);
  return [...entregados, ...retornos];
}

export async function getCuadresByDelivery(db: Db, deliveryId: number): Promise<Cuadre[]> {
  return db.select().from(cuadres).where(eq(cuadres.deliveryId, deliveryId)).orderBy(desc(cuadres.fechaCreacion), desc(cuadres.id));
}

export async function tieneCuadrePendiente(db: Db, deliveryId: number): Promise<boolean> {
  const [row] = await db.select({ id: cuadres.id }).from(cuadres)
    .where(and(eq(cuadres.deliveryId, deliveryId), eq(cuadres.estado, "pendiente"))).limit(1);
  return !!row;
}

export async function getCuadresByColmado(db: Db, colmadoId: number, estado?: string) {
  const rows = await db.select({ cuadre: cuadres, repartidorNombre: deliveries.nombre }).from(cuadres)
    .leftJoin(deliveries, eq(cuadres.deliveryId, deliveries.id))
    .where(estado ? and(eq(cuadres.colmadoId, colmadoId), eq(cuadres.estado, estado)) : eq(cuadres.colmadoId, colmadoId))
    .orderBy(desc(cuadres.fechaCreacion), desc(cuadres.id));
  return rows.map((r) => ({ ...r.cuadre, repartidorNombre: r.repartidorNombre ?? "Desconocido" }));
}

export async function getCuadreById(db: Db, id: number): Promise<Cuadre | undefined> {
  const [row] = await db.select().from(cuadres).where(eq(cuadres.id, id));
  return row;
}

/**
 * Crea el cuadre y vincula los pedidos. Todo va en un solo batch (transacción):
 * si algún pedido cambió entre la validación y la escritura, una sentencia de
 * control falla a propósito y no se guarda nada.
 */
export async function createCuadre(
  db: Db,
  data: { deliveryId: number; colmadoId: number; fechaCuadre: string; notasRepartidor: string | null },
  pedidoIds: number[],
): Promise<Cuadre> {
  const ids = [...new Set(pedidoIds)];
  if (ids.length !== pedidoIds.length) throw new DatosInvalidos("Hay pedidos repetidos en el cuadre");
  if (ids.length > 80) throw new DatosInvalidos("Un cuadre puede incluir como máximo 80 pedidos");
  const lista = await db.select().from(pedidos).where(inArray(pedidos.id, ids));
  if (lista.length !== ids.length) throw new DatosInvalidos("Uno o más pedidos no fueron encontrados");

  const entregados: Pedido[] = [];
  const retornos: Pedido[] = [];
  for (const p of lista) {
    if (p.deliveryId !== data.deliveryId) throw new DatosInvalidos(`Pedido #${p.id} no pertenece a este repartidor`);
    if (p.cuadreId !== null) throw new DatosInvalidos(`Pedido #${p.id} ya fue incluido en un cuadre anterior`);
    if (p.estado === "entregado") {
      if (p.metodoPago !== "efectivo") throw new DatosInvalidos(`Pedido #${p.id} no es de pago en efectivo`);
      entregados.push(p);
    } else if (p.estado === "retorno") {
      if (vueltoDe(p) <= 0) throw new DatosInvalidos(`Pedido #${p.id} es retorno sin vuelto registrado`);
      retornos.push(p);
    } else {
      throw new DatosInvalidos(`Pedido #${p.id} no está en estado válido para cuadre (debe ser entregado o retorno con vuelto)`);
    }
  }

  let cobrado = 0, devuelta = 0, vueltoRetornado = 0, recibidoNegocio = 0;
  for (const p of entregados) {
    // Cobrado = valor del pedido (totalConfirmado); la devuelta al cliente es informativa.
    const totalOrden = num(p.totalConfirmado ?? p.total);
    cobrado += totalOrden;
    if (p.vueltoEntregado !== null && p.vueltoEntregado !== undefined) {
      if (vueltoDe(p) > 0) devuelta += vueltoDe(p);
    } else if (p.necesitaDevuelta && p.montoPago) {
      const d = num(p.montoPago) - totalOrden;
      if (d > 0) devuelta += d;
    }
    // Efectivo que el negocio le dio al repartidor para el cambio: lo debe devolver.
    if (p.vueltoEntregadoAlDelivery && vueltoDe(p) > 0) recibidoNegocio += vueltoDe(p);
  }
  for (const p of retornos) vueltoRetornado += vueltoDe(p);
  const neto = cobrado + recibidoNegocio + vueltoRetornado;

  const [{ siguiente }] = await db.select({ siguiente: sql<number>`coalesce(max(${cuadres.id}), 0) + 1` }).from(cuadres);
  const enlazar = (lote: Pedido[], estado: string) => db.update(pedidos).set({ cuadreId: siguiente }).where(and(
    inArray(pedidos.id, lote.map((p) => p.id)), isNull(pedidos.cuadreId), eq(pedidos.estado, estado),
    eq(pedidos.deliveryId, data.deliveryId), ...(estado === "entregado" ? [eq(pedidos.metodoPago, "efectivo")] : []),
  ));
  try {
    const [[cuadre]] = await db.batch([
      db.insert(cuadres).values({
        id: siguiente, ...data, pedidosIds: ids,
        totalEfectivoCobrado: dinero(cobrado), totalDevueltaEntregada: dinero(devuelta), totalVueltoRetornado: dinero(vueltoRetornado),
        totalEfectivoRecibidoNegocio: dinero(recibidoNegocio), netoAEntregar: dinero(neto), estado: "pendiente",
      }).returning(),
      ...(entregados.length ? [enlazar(entregados, "entregado")] : []),
      ...(retornos.length ? [enlazar(retornos, "retorno")] : []),
      // Control: si no quedaron vinculados todos, viola NOT NULL y se revierte el batch.
      db.update(cuadres).set({ fechaCuadre: sql`NULL` }).where(and(
        eq(cuadres.id, siguiente),
        sql`(select count(*) from ${pedidos} where ${pedidos.cuadreId} = ${siguiente}) <> ${ids.length}`,
      )),
    ] as const);
    return cuadre;
  } catch (err) {
    if (err instanceof Error && /constraint|UNIQUE|NOT NULL/i.test(err.message + String((err as any).cause ?? ""))) {
      throw new DatosInvalidos("Los pedidos cambiaron mientras se creaba el cuadre; la operación fue revertida. Intenta de nuevo.");
    }
    throw err;
  }
}

/**
 * Confirma el cuadre una sola vez. Si se indica el monto recibido, la diferencia
 * (recibido − neto) se suma al saldo pendiente del repartidor.
 */
export async function confirmarCuadre(db: Db, cuadre: Cuadre, notasNegocio?: string, montoRecibido?: number): Promise<Cuadre | undefined> {
  const diferencia = montoRecibido !== undefined ? montoRecibido - num(cuadre.netoAEntregar) : undefined;
  const [row] = await db.update(cuadres).set({
    estado: "confirmado", fechaConfirmacion: new Date(),
    ...(notasNegocio !== undefined ? { notasNegocio } : {}),
    ...(montoRecibido !== undefined ? { montoRecibido: dinero(montoRecibido), diferencia: dinero(diferencia!) } : {}),
  }).where(and(eq(cuadres.id, cuadre.id), eq(cuadres.estado, "pendiente"))).returning();
  if (row && diferencia !== undefined && Math.abs(diferencia) >= 0.005) {
    await sumarASaldo(db, cuadre.deliveryId, cuadre.colmadoId, Math.round(diferencia * 100) / 100);
  }
  return row;
}

/** Suma la diferencia al saldo abierto del repartidor, o lo abre. Un solo upsert atómico. */
async function sumarASaldo(db: Db, deliveryId: number, colmadoId: number, diferencia: number): Promise<void> {
  await db.insert(saldosDelivery)
    .values({ deliveryId, colmadoId, saldoPendiente: dinero(diferencia), estado: "pendiente" })
    .onConflictDoUpdate({
      target: [saldosDelivery.deliveryId, saldosDelivery.colmadoId],
      targetWhere: sql`estado = 'pendiente'`,
      set: { saldoPendiente: sql`round(${saldosDelivery.saldoPendiente} + ${diferencia}, 2)` },
    });
}

export async function getSaldosByColmado(db: Db, colmadoId: number) {
  const rows = await db.select({ saldo: saldosDelivery, nombre: deliveries.nombre }).from(saldosDelivery)
    .leftJoin(deliveries, eq(saldosDelivery.deliveryId, deliveries.id))
    .where(eq(saldosDelivery.colmadoId, colmadoId))
    .orderBy(desc(saldosDelivery.fechaCreacion), desc(saldosDelivery.id));
  return rows.map((r) => ({ ...r.saldo, deliveryNombre: r.nombre || `Repartidor #${r.saldo.deliveryId}` }));
}

export async function getSaldoById(db: Db, id: number): Promise<SaldoDelivery | undefined> {
  const [row] = await db.select().from(saldosDelivery).where(eq(saldosDelivery.id, id));
  return row;
}

export async function marcarSaldoSaldado(db: Db, id: number): Promise<SaldoDelivery | undefined> {
  const [row] = await db.update(saldosDelivery).set({ estado: "saldado", fechaSaldado: new Date() })
    .where(and(eq(saldosDelivery.id, id), eq(saldosDelivery.estado, "pendiente"))).returning();
  return row;
}

// ---------- Rutas ----------

export async function getRutaActivaDelivery(db: Db, deliveryId: number): Promise<Ruta | null> {
  const [row] = await db.select().from(rutas)
    .where(and(eq(rutas.deliveryId, deliveryId), not(inArray(rutas.estado, ["completada", "cancelada"]))))
    .orderBy(desc(rutas.fechaCreacion), desc(rutas.id)).limit(1);
  return row ?? null;
}

/** Cancela la ruta activa anterior y crea la nueva con sus paradas en un solo batch. */
export async function reemplazarRutaActiva(db: Db, ruta: InsertRuta, paradas: InsertParada[]): Promise<Ruta> {
  const [{ siguiente }] = await db.select({ siguiente: sql<number>`coalesce(max(${rutas.id}), 0) + 1` }).from(rutas);
  const filas = paradas.map((p) => ({ ...p, rutaId: siguiente }));
  const [, [nueva]] = await db.batch([
    db.update(rutas).set({ estado: "cancelada" })
      .where(and(eq(rutas.deliveryId, ruta.deliveryId), not(inArray(rutas.estado, ["completada", "cancelada"])))),
    db.insert(rutas).values({ ...ruta, id: siguiente }).returning(),
    ...chunkRows(filas, 10).map((lote) => db.insert(paradasRuta).values(lote)),
  ] as const);
  return nueva;
}

export async function getParadasConPedido(db: Db, rutaId: number): Promise<Array<ParadaRuta & { pedido: Pedido }>> {
  const rows = await db.select().from(paradasRuta)
    .innerJoin(pedidos, eq(paradasRuta.pedidoId, pedidos.id))
    .where(eq(paradasRuta.rutaId, rutaId))
    .orderBy(paradasRuta.orden);
  return rows.map((r) => ({ ...r.paradas_ruta, pedido: r.pedidos }));
}

/** La parada con la ruta a la que pertenece (para verificar que es del repartidor). */
export async function getParadaConRuta(db: Db, paradaId: number) {
  const [row] = await db.select({ parada: paradasRuta, deliveryId: rutas.deliveryId, rutaId: rutas.id }).from(paradasRuta)
    .innerJoin(rutas, eq(paradasRuta.rutaId, rutas.id)).where(eq(paradasRuta.id, paradaId));
  return row;
}

/** Marca la parada y, si ya no queda ninguna pendiente, completa la ruta. */
export async function marcarParadaEstado(db: Db, paradaId: number, rutaId: number, estado: string, motivo?: string): Promise<ParadaRuta | undefined> {
  const [[row]] = await db.batch([
    db.update(paradasRuta)
      .set({ estado, motivoNoEntregado: estado === "no_entregado" ? motivo ?? null : null, fechaCompletado: estado === "pendiente" ? null : new Date() })
      .where(eq(paradasRuta.id, paradaId)).returning(),
    db.update(rutas).set({ estado: "completada", fechaCompletada: new Date() }).where(and(
      eq(rutas.id, rutaId),
      sql`not exists (select 1 from ${paradasRuta} where ${paradasRuta.rutaId} = ${rutaId} and ${paradasRuta.estado} = 'pendiente')`,
    )),
  ] as const);
  return row;
}

/** El pedido se cerró (entregado, devuelto o cancelado) desde cualquier lado: sus paradas pendientes se cierran igual. */
export async function cerrarParadasDelPedido(db: Db, pedidoId: number, estado: "entregado" | "no_entregado", motivo?: string | null): Promise<void> {
  const abiertas = await db.select({ id: paradasRuta.id, rutaId: paradasRuta.rutaId }).from(paradasRuta)
    .where(and(eq(paradasRuta.pedidoId, pedidoId), eq(paradasRuta.estado, "pendiente")));
  for (const p of abiertas) await marcarParadaEstado(db, p.id, p.rutaId, estado, motivo ?? undefined);
}

/** Repartidores del negocio con su posición, su ruta activa y el ETA de sus pedidos abiertos. */
export async function getDeliveriesConUbicacion(db: Db, colmadoId: number) {
  const lista = await getDeliveriesByColmado(db, colmadoId);
  const abiertos = lista.length
    ? await db.select().from(pedidos).where(and(
      inArray(pedidos.deliveryId, lista.map((d) => d.id)),
      inArray(pedidos.estado, ["pendiente", "confirmado", "listo", "en_camino", "llegando"]),
    ))
    : [];
  return Promise.all(lista.map(async (d) => {
    const ruta = await getRutaActivaDelivery(db, d.id);
    const paradas = ruta ? await getParadasConPedido(db, ruta.id) : [];
    const dLat = d.ultimaLatitud ? parseFloat(d.ultimaLatitud) : NaN;
    const dLon = d.ultimaLongitud ? parseFloat(d.ultimaLongitud) : NaN;
    const pedidosPendientes = abiertos.filter((p) => p.deliveryId === d.id).map((p) => {
      const parada = paradas.find((x) => x.pedidoId === p.id);
      let eta: Record<string, unknown> | null = null;
      if (parada?.tiempoDesdeAnteriorMinutos != null) {
        eta = {
          distanciaKm: num(parada.distanciaDesdeAnteriorKm), minutosEstimados: parada.tiempoDesdeAnteriorMinutos,
          horaEstimadaLlegada: parada.horaEstimadaLlegada || "", fuente: ruta?.fuenteDistancias === "vial" ? "vial" : "gps", trafico: ruta?.trafico === true,
        };
      }
      if (!eta && Number.isFinite(dLat) && Number.isFinite(dLon)) {
        const destino = p.clienteLatitud && p.clienteLongitud
          ? { lat: parseFloat(p.clienteLatitud), lon: parseFloat(p.clienteLongitud) }
          : extraerCoordenadas(p.clienteUbicacion || "");
        if (destino && Number.isFinite(destino.lat) && Number.isFinite(destino.lon)) {
          eta = { ...calcularEtaSencilla(dLat, dLon, destino.lat, destino.lon), fuente: "gps", trafico: false };
        }
      }
      return {
        id: p.id, codigoSeguimiento: p.codigoSeguimiento, clienteNombre: p.clienteNombre, clienteUbicacion: p.clienteUbicacion,
        clienteLatitud: p.clienteLatitud, clienteLongitud: p.clienteLongitud, estado: p.estado, eta,
      };
    });
    const { codigoAcceso: _codigo, ...publico } = d;
    return {
      ...publico, paradasTotal: paradas.length, paradasPendientes: paradas.filter((x) => x.estado === "pendiente").length,
      paradas, pedidosPendientes,
    };
  }));
}
