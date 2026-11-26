// Plataforma → Ingresos: lo que pagan los colmados por su plan (facturas de Stripe), con la comisión de Stripe
// y lo neto, por mes y por ambiente; los negocios con pago atrasado y cuántos hay en cada plan.
import { Hono } from "hono";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { colmados, planes, stripeFacturas, suscripciones } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { cfgStripe } from "../lib/stripe";

export const ingresosRoutes = new Hono<AppEnv>();
ingresosRoutes.use("/api/admin/ingresos", requireAuth, requireAdmin);

const n = (v: string | null | undefined) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

ingresosRoutes.get("/api/admin/ingresos", async (c) => {
  const db = getDb(c.env.DB);
  const mes = /^\d{4}-\d{2}$/.test(c.req.query("mes") ?? "") ? c.req.query("mes")! : new Date().toISOString().slice(0, 7);
  const modo = c.req.query("modo") === "prueba" ? "prueba" : c.req.query("modo") === "real" ? "real" : cfgStripe(c.env).ambiente;
  const [a, m] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(a, m - 1, 1)), hasta = new Date(Date.UTC(a, m, 1));

  const facturas = await db.select({ f: stripeFacturas, negocio: colmados.nombre }).from(stripeFacturas)
    .leftJoin(colmados, eq(colmados.id, stripeFacturas.colmadoId))
    .where(and(eq(stripeFacturas.modo, modo), gte(stripeFacturas.creada, desde), lt(stripeFacturas.creada, hasta)))
    .orderBy(desc(stripeFacturas.creada)).limit(500);

  const pagadas = facturas.filter(({ f }) => f.estado === "paid");
  const totales = {
    cobrado: r2(pagadas.reduce((s, { f }) => s + n(f.pagado), 0)),
    comision: r2(pagadas.reduce((s, { f }) => s + n(f.comision), 0)),
    neto: r2(pagadas.reduce((s, { f }) => s + (f.neto != null ? n(f.neto) : n(f.pagado) - n(f.comision)), 0)),
    reembolsado: r2(facturas.reduce((s, { f }) => s + n(f.reembolsado), 0)),
    porCobrar: r2(facturas.filter(({ f }) => f.estado === "open").reduce((s, { f }) => s + n(f.pendiente), 0)),
    pagos: pagadas.length,
  };

  // Negocios por plan (los principales) y los que tienen el pago atrasado.
  const negocios = await db.select({ id: colmados.id, nombre: colmados.nombre, plan: planes.nombre, esTrial: planes.esTrial, cortesia: colmados.cortesia, estado: colmados.estadoSuscripcion, principal: colmados.negocioPrincipalId, vence: colmados.fechaVencimiento })
    .from(colmados).leftJoin(planes, eq(planes.id, colmados.planId));
  const principales = negocios.filter((x) => !x.principal);
  const porPlan: Record<string, number> = {};
  for (const x of principales) {
    const clave = x.cortesia ? "Cortesía" : x.estado === "suspendida" ? "Modo limitado" : x.plan ?? "Sin plan";
    porPlan[clave] = (porPlan[clave] ?? 0) + 1;
  }
  const atrasadas = await db.select({ colmadoId: suscripciones.colmadoId, estado: suscripciones.estado, fechaFin: suscripciones.fechaFin, negocio: colmados.nombre })
    .from(suscripciones).innerJoin(colmados, eq(colmados.id, suscripciones.colmadoId))
    .where(and(eq(suscripciones.modo, modo), eq(suscripciones.estado, "atrasada")));
  // Mensual que se espera: los que pagan ahora por Stripe (el anual se cuenta dividido entre 12).
  const activas = await db.select({ periodo: suscripciones.periodo, mensual: planes.precioMensual, anual: planes.precioAnual })
    .from(suscripciones).innerJoin(planes, eq(planes.id, suscripciones.planId))
    .where(and(eq(suscripciones.modo, modo), eq(suscripciones.estado, "activa")));
  const recurrenteMensual = r2(activas.reduce((s, x) => s + (x.periodo === "anio" ? n(x.anual) / 12 : n(x.mensual)), 0));

  return c.json({
    mes, modo, totales, recurrenteMensual, suscripcionesActivas: activas.length, porPlan,
    atrasadas,
    proximosAVencer: principales.filter((x) => x.estado === "en_gracia").map((x) => ({ id: x.id, nombre: x.nombre, plan: x.plan, vence: x.vence })),
    facturas: facturas.map(({ f, negocio }) => ({
      id: f.id, negocio: negocio ?? "—", numero: f.numero, estado: f.estado, motivo: f.motivo, plan: f.plan, total: f.total, pagado: f.pagado,
      comision: f.comision, neto: f.neto, reembolsado: f.reembolsado, creada: f.creada, pagadaEn: f.pagadaEn, intentos: f.intentos, error: f.error, url: f.url,
    })),
  });
});
