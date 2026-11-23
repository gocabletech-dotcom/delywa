import { and, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { deliveries, pagoDeliveryAjustes, pagosDelivery, pedidos, saldosDelivery, type Delivery } from "@shared/schema";
import type { Db } from "../db";
import { fechaLocal, inicioDiaLocal } from "./fechas";

// Ganancias del repartidor (portal de delivery) y cierre automático de su período de pago.
// El repartidor ve solo lo que gana (salario y comisiones), nunca las ventas del colmado.

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Instante en que empieza el día local «AAAA-MM-DD». */
function inicioDe(tz: string, ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return inicioDiaLocal(tz, new Date(Date.UTC(y, m - 1, d, 16)));
}
const ymd = (y: number, m: number, d: number) => {
  const f = new Date(Date.UTC(y, m - 1, d));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(f.getUTCDate()).padStart(2, "0")}`;
};

export type Periodo = { inicio: Date; fin: Date; desde: string; hasta: string; tipo: string };

/**
 * Período de pago que contiene `fecha`, en la zona del negocio. `fin` es el último milisegundo del
 * período (las entregas se cuentan con inicio < fechaEntrega ≤ fin, como el cálculo del panel).
 * Semanal: lunes a domingo. Quincenal: del 1 al 15 y del 16 al último. Mensual: el mes.
 * Personalizado se muestra como semanal (el colmado calcula sus fechas a mano).
 */
export function periodoQueContiene(periodoPago: string, tz: string, fecha: Date = new Date()): Periodo {
  const [y, m, d] = fechaLocal(tz, fecha).split("-").map(Number);
  let desde: string, siguiente: string;
  if (periodoPago === "mensual") { desde = ymd(y, m, 1); siguiente = ymd(y, m + 1, 1); }
  else if (periodoPago === "quincenal") { desde = d <= 15 ? ymd(y, m, 1) : ymd(y, m, 16); siguiente = d <= 15 ? ymd(y, m, 16) : ymd(y, m + 1, 1); }
  else {
    const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
    const atras = (dia + 6) % 7;
    desde = ymd(y, m, d - atras); siguiente = ymd(y, m, d - atras + 7);
  }
  const inicio = inicioDe(tz, desde);
  const finExclusivo = inicioDe(tz, siguiente);
  const [sy, sm, sd] = siguiente.split("-").map(Number);
  return { inicio, fin: new Date(finExclusivo.getTime() - 1), desde, hasta: ymd(sy, sm, sd - 1), tipo: periodoPago === "personalizado" ? "semanal" : periodoPago };
}

/** Período que terminó justo antes del que contiene `fecha`. */
export function periodoAnterior(periodoPago: string, tz: string, fecha: Date = new Date()): Periodo {
  return periodoQueContiene(periodoPago, tz, new Date(periodoQueContiene(periodoPago, tz, fecha).inicio.getTime() - 1));
}

export type Resumen = { entregas: number; ventas: number; salario: number; comision: number; envio: number; propinas: number; total: number };

/** Lo que gana el repartidor en un rango, según su forma de pago (salario, comisión o mixto). */
export async function resumenDe(db: Db, delivery: Delivery, inicio: Date, fin: Date, conSalario = true): Promise<Resumen> {
  const entregas = await db.select({ total: pedidos.total, envio: pedidos.costoDeliveryAplicado, tipo: pedidos.tipoEntrega, propina: pedidos.propina }).from(pedidos).where(and(
    eq(pedidos.deliveryId, delivery.id), eq(pedidos.estado, "entregado"), gt(pedidos.fechaEntrega, inicio), lte(pedidos.fechaEntrega, fin),
  ));
  const ventas = entregas.reduce((s, p) => s + num(p.total), 0);
  const modelo = delivery.modeloPago || "comision";
  const salario = conSalario && (modelo === "salario" || modelo === "mixto") ? num(delivery.salarioMonto) : 0;
  const comision = modelo === "comision" || modelo === "mixto" ? num(delivery.comisionFija) * entregas.length + (ventas * num(delivery.comisionPorcentaje)) / 100 : 0;
  // «El envío es del delivery»: el costo de envío de cada entrega se le suma.
  const envio = delivery.envioEsDelDelivery ? entregas.filter((p) => p.tipo !== "pickup").reduce((s, p) => s + num(p.envio), 0) : 0;
  // Las propinas son suyas: se muestran, pero no las paga el colmado.
  const propinas = entregas.reduce((s, p) => s + num(p.propina), 0);
  return { entregas: entregas.length, ventas: r2(ventas), salario: r2(salario), comision: r2(comision), envio: r2(envio), propinas: r2(propinas), total: r2(salario + comision + envio) };
}

/**
 * Crea el pago del período, o lo recalcula si ya existía y sigue pendiente (antes cada «Calcular»
 * creaba otro pago igual). Un pago ya pagado no se toca.
 */
export async function guardarPagoDelPeriodo(db: Db, delivery: Delivery, inicio: Date, fin: Date) {
  const r = await resumenDe(db, delivery, inicio, fin);
  const valores = {
    totalPedidos: r.entregas, totalVentas: r.ventas.toFixed(2), modeloPago: delivery.modeloPago || "comision",
    salarioCalculado: r.salario.toFixed(2), comisionCalculada: r.comision.toFixed(2), envioCalculado: r.envio.toFixed(2), montoTotal: r.total.toFixed(2),
  };
  const [existente] = await db.select().from(pagosDelivery).where(and(eq(pagosDelivery.deliveryId, delivery.id), eq(pagosDelivery.periodoInicio, inicio), eq(pagosDelivery.periodoFin, fin)));
  if (existente) {
    if (existente.estado === "pagado") return existente;
    // Los bonos y descuentos ya puestos se conservan.
    const [act] = await db.update(pagosDelivery).set({ ...valores, montoTotal: r2(r.total + num(existente.ajustesTotal)).toFixed(2) }).where(eq(pagosDelivery.id, existente.id)).returning();
    return act;
  }
  const [nuevo] = await db.insert(pagosDelivery).values({ deliveryId: delivery.id, colmadoId: delivery.colmadoId, periodoInicio: inicio, periodoFin: fin, ...valores }).returning();
  return nuevo;
}

/**
 * Cron: al terminar la semana, quincena o mes de cada repartidor, deja su pago pendiente (una vez).
 * Solo el período que acaba de terminar (no rellena meses viejos), y solo si trabajó o tiene salario.
 */
export async function cerrarPeriodosVencidos(db: Db, tzDe: (colmadoId: number) => Promise<string>, ahora = new Date(), alCrear?: (d: Delivery, monto: number, pagoId: number) => Promise<unknown>): Promise<number> {
  const lista = await db.select().from(deliveries).where(ne(deliveries.periodoPago, "personalizado"));
  let creados = 0;
  for (const d of lista) {
    const tz = await tzDe(d.colmadoId);
    const p = periodoAnterior(d.periodoPago, tz, ahora);
    if (d.fechaRegistro.getTime() > p.fin.getTime()) continue;
    const [ya] = await db.select({ id: pagosDelivery.id }).from(pagosDelivery).where(and(eq(pagosDelivery.deliveryId, d.id), eq(pagosDelivery.periodoInicio, p.inicio), eq(pagosDelivery.periodoFin, p.fin)));
    if (ya) continue;
    const r = await resumenDe(db, d, p.inicio, p.fin);
    if (!r.entregas && !r.salario) continue;
    if (d.estado === "inactivo" && !r.entregas) continue;
    const pago = await guardarPagoDelPeriodo(db, d, p.inicio, p.fin);
    creados++;
    if (alCrear) await alCrear(d, num(pago.montoTotal), pago.id).catch(() => undefined);
  }
  return creados;
}

/** Lo que el repartidor le debe al colmado (faltantes de cuadres) o el colmado a él (sobrantes). */
export async function saldoDeCuadres(db: Db, delivery: Delivery): Promise<number> {
  const [s] = await db.select().from(saldosDelivery).where(and(eq(saldosDelivery.deliveryId, delivery.id), eq(saldosDelivery.colmadoId, delivery.colmadoId), eq(saldosDelivery.estado, "pendiente")));
  return r2(num(s?.saldoPendiente));
}

/** Día de pago: el día siguiente al cierre del período. */
export function cobraEl(p: Periodo): string {
  const [y, m, d] = p.hasta.split("-").map(Number);
  return ymd(y, m, d + 1);
}


// ---------- Ajustes del pago (bonos, descuentos y cuadres) ----------

export class AjusteInvalido extends Error {}

/** Vuelve a sumar los ajustes y el total del pago. */
export async function recalcularTotal(db: Db, pagoId: number) {
  const ajustes = await db.select({ monto: pagoDeliveryAjustes.monto }).from(pagoDeliveryAjustes).where(eq(pagoDeliveryAjustes.pagoId, pagoId));
  const suma = r2(ajustes.reduce((s, a) => s + num(a.monto), 0));
  const [p] = await db.select().from(pagosDelivery).where(eq(pagosDelivery.id, pagoId));
  const base = num(p.salarioCalculado) + num(p.comisionCalculada) + num(p.envioCalculado);
  const [act] = await db.update(pagosDelivery).set({ ajustesTotal: suma.toFixed(2), montoTotal: Math.max(0, r2(base + suma)).toFixed(2) }).where(eq(pagosDelivery.id, pagoId)).returning();
  return act;
}

/**
 * Agrega un bono (+), un descuento (−) o el saldo de cuadres al pago pendiente.
 * «cuadre» toma todo el saldo abierto del repartidor (faltante = descuento, sobrante = bono) y lo deja en 0.
 */
export async function agregarAjuste(db: Db, pagoId: number, tipo: string, montoPedido: number, motivo: string | null, usuario: string) {
  const [p] = await db.select().from(pagosDelivery).where(eq(pagosDelivery.id, pagoId));
  if (!p) throw new AjusteInvalido("Pago no encontrado");
  if (p.estado === "pagado") throw new AjusteInvalido("Ese pago ya se hizo; no se puede cambiar.");
  let monto: number;
  if (tipo === "cuadre") {
    const [s] = await db.select().from(saldosDelivery).where(and(eq(saldosDelivery.deliveryId, p.deliveryId), eq(saldosDelivery.colmadoId, p.colmadoId), eq(saldosDelivery.estado, "pendiente")));
    monto = r2(num(s?.saldoPendiente));
    if (!s || Math.abs(monto) < 0.005) throw new AjusteInvalido("No tiene saldo de cuadres pendiente.");
    await db.update(saldosDelivery).set({ saldoPendiente: "0", estado: "saldado", fechaSaldado: new Date() }).where(eq(saldosDelivery.id, s.id));
    motivo = motivo || (monto < 0 ? "Faltante de cuadres" : "Sobrante de cuadres");
  } else if (tipo === "bono" || tipo === "descuento" || tipo === "adelanto") {
    if (!Number.isFinite(montoPedido) || montoPedido <= 0 || montoPedido > 1_000_000) throw new AjusteInvalido("Escribe el monto.");
    monto = tipo === "bono" ? r2(montoPedido) : -r2(montoPedido);
  } else throw new AjusteInvalido("Tipo de ajuste inválido.");
  await db.insert(pagoDeliveryAjustes).values({ pagoId, tipo, monto: monto.toFixed(2), motivo: motivo?.slice(0, 200) ?? null, usuario });
  return recalcularTotal(db, pagoId);
}

/** Quita un ajuste de un pago pendiente; si era de cuadres, el saldo vuelve a quedar abierto. */
export async function quitarAjuste(db: Db, pagoId: number, ajusteId: number) {
  const [p] = await db.select().from(pagosDelivery).where(eq(pagosDelivery.id, pagoId));
  if (!p || p.estado === "pagado") throw new AjusteInvalido("Ese pago ya se hizo; no se puede cambiar.");
  const [a] = await db.select().from(pagoDeliveryAjustes).where(and(eq(pagoDeliveryAjustes.id, ajusteId), eq(pagoDeliveryAjustes.pagoId, pagoId)));
  if (!a) throw new AjusteInvalido("Ajuste no encontrado");
  if (a.tipo === "cuadre") {
    await db.insert(saldosDelivery).values({ deliveryId: p.deliveryId, colmadoId: p.colmadoId, saldoPendiente: num(a.monto).toFixed(2), estado: "pendiente" })
      .onConflictDoUpdate({ target: [saldosDelivery.deliveryId, saldosDelivery.colmadoId], targetWhere: sql`estado = 'pendiente'`, set: { saldoPendiente: sql`round(${saldosDelivery.saldoPendiente} + ${num(a.monto)}, 2)` } });
  }
  await db.delete(pagoDeliveryAjustes).where(eq(pagoDeliveryAjustes.id, a.id));
  return recalcularTotal(db, pagoId);
}

export async function ajustesDe(db: Db, pagoIds: number[]) {
  if (!pagoIds.length) return [];
  return db.select().from(pagoDeliveryAjustes).where(inArray(pagoDeliveryAjustes.pagoId, pagoIds)).orderBy(pagoDeliveryAjustes.id);
}
