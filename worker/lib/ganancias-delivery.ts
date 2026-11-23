import { and, eq, gt, lte, ne } from "drizzle-orm";
import { deliveries, pagosDelivery, pedidos, saldosDelivery, type Delivery } from "@shared/schema";
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

export type Resumen = { entregas: number; ventas: number; salario: number; comision: number; total: number };

/** Lo que gana el repartidor en un rango, según su forma de pago (salario, comisión o mixto). */
export async function resumenDe(db: Db, delivery: Delivery, inicio: Date, fin: Date, conSalario = true): Promise<Resumen> {
  const entregas = await db.select({ total: pedidos.total }).from(pedidos).where(and(
    eq(pedidos.deliveryId, delivery.id), eq(pedidos.estado, "entregado"), gt(pedidos.fechaEntrega, inicio), lte(pedidos.fechaEntrega, fin),
  ));
  const ventas = entregas.reduce((s, p) => s + num(p.total), 0);
  const modelo = delivery.modeloPago || "comision";
  const salario = conSalario && (modelo === "salario" || modelo === "mixto") ? num(delivery.salarioMonto) : 0;
  const comision = modelo === "comision" || modelo === "mixto" ? num(delivery.comisionFija) * entregas.length + (ventas * num(delivery.comisionPorcentaje)) / 100 : 0;
  return { entregas: entregas.length, ventas: r2(ventas), salario: r2(salario), comision: r2(comision), total: r2(salario + comision) };
}

/**
 * Crea el pago del período, o lo recalcula si ya existía y sigue pendiente (antes cada «Calcular»
 * creaba otro pago igual). Un pago ya pagado no se toca.
 */
export async function guardarPagoDelPeriodo(db: Db, delivery: Delivery, inicio: Date, fin: Date) {
  const r = await resumenDe(db, delivery, inicio, fin);
  const valores = {
    totalPedidos: r.entregas, totalVentas: r.ventas.toFixed(2), modeloPago: delivery.modeloPago || "comision",
    salarioCalculado: r.salario.toFixed(2), comisionCalculada: r.comision.toFixed(2), montoTotal: r.total.toFixed(2),
  };
  const [existente] = await db.select().from(pagosDelivery).where(and(eq(pagosDelivery.deliveryId, delivery.id), eq(pagosDelivery.periodoInicio, inicio), eq(pagosDelivery.periodoFin, fin)));
  if (existente) {
    if (existente.estado === "pagado") return existente;
    const [act] = await db.update(pagosDelivery).set(valores).where(eq(pagosDelivery.id, existente.id)).returning();
    return act;
  }
  const [nuevo] = await db.insert(pagosDelivery).values({ deliveryId: delivery.id, colmadoId: delivery.colmadoId, periodoInicio: inicio, periodoFin: fin, ...valores }).returning();
  return nuevo;
}

/**
 * Cron: al terminar la semana, quincena o mes de cada repartidor, deja su pago pendiente (una vez).
 * Solo el período que acaba de terminar (no rellena meses viejos), y solo si trabajó o tiene salario.
 */
export async function cerrarPeriodosVencidos(db: Db, tzDe: (colmadoId: number) => Promise<string>, ahora = new Date()): Promise<number> {
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
    await guardarPagoDelPeriodo(db, d, p.inicio, p.fin);
    creados++;
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

