// Cobro de los planes de Delywa con Stripe (adaptado de FoodPOS, src/stripe.js).
// Dos ambientes guardados a la vez en Plataforma → Integraciones: «prueba» (stripe_key, stripe_webhook)
// y «real» (stripe_key_real, stripe_webhook_real). stripe_ambiente dice cuál está activo.
// Delywa cobra en dólares a su propia cuenta de Stripe; no hay Stripe Connect (los colmados no cobran aquí).
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { colmados, planes, stripeFacturas, suscripciones, users, type Plan } from "@shared/schema";
import type { Env } from "../env";
import type { Db } from "../db";
import { estadoSegunFecha } from "./estado-plan";

export type Modo = "prueba" | "real";
export const sufijo = (modo: Modo) => (modo === "real" ? "_real" : "");

/** Se reemplaza en las pruebas: nunca se llama a Stripe de verdad desde ellas. */
export const stripeHttp = { fetch: (url: string, init?: RequestInit) => fetch(url, init) };

export class ErrorStripe extends Error {
  constructor(mensaje: string, public estado = 502) { super(mensaje); }
}

export type ConfigStripe = { key: string; webhook: string; modo: Modo; ambiente: Modo; listo: boolean; sumarComision: boolean };

/** Comisión de Stripe para tarjetas: 2.9 % + US$0.30. */
export const COMISION_STRIPE = { porcentaje: 0.029, fijo: 0.3 };

/** Lo que se cobra para que, después de la comisión de Stripe, quede el precio del plan (como FoodPOS). */
export function precioCobro(base: string | number | null | undefined, sumar: boolean): number {
  const b = Number(base ?? 0);
  if (!sumar || b <= 0) return Math.round(b * 100) / 100;
  return Math.ceil(((b + COMISION_STRIPE.fijo) / (1 - COMISION_STRIPE.porcentaje)) * 100) / 100;
}

/** El plan con lo que de verdad se cobra (precioCobro y precioCobroAnual), para mostrarlo. */
export function conPrecioCobro<T extends { precioMensual: string; precioAnual: string | null }>(env: Env, p: T) {
  const sumar = cfgStripe(env).sumarComision;
  return { ...p, precioCobro: precioCobro(p.precioMensual, sumar).toFixed(2), precioCobroAnual: p.precioAnual ? precioCobro(p.precioAnual, sumar).toFixed(2) : null };
}

/** Configuración de un ambiente (o del activo). Lee lo guardado en Integraciones (env ya resuelto con envEfectivo). */
export function cfgStripe(env: Env, modo?: Modo): ConfigStripe {
  const v = env.__integraciones?.valores ?? {};
  const ambiente: Modo = v.stripe_ambiente === "real" ? "real" : "prueba";
  const m = modo ?? ambiente;
  const key = (m === "real" ? v.stripe_key_real : v.stripe_key) || "";
  const webhook = (m === "real" ? v.stripe_webhook_real : v.stripe_webhook) || "";
  return { key, webhook, modo: m, ambiente, listo: !!key, sumarComision: v.stripe_sumar_comision === "true" };
}

// ---------- API de Stripe (formulario a[b][0][c]=x) ----------

type Params = Record<string, unknown>;
export function stripeForm(o: Params | undefined, pre = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(o || {})) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" && x !== null ? stripeForm(x as Params, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`)));
    else if (typeof v === "object") stripeForm(v as Params, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripeApi<T = any>(key: string, metodo: "GET" | "POST" | "DELETE", ruta: string, params?: Params): Promise<T> {
  const query = params && metodo === "GET" ? `?${stripeForm(params).join("&")}` : "";
  const res = await stripeHttp.fetch(`https://api.stripe.com/v1${ruta}${query}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: params && metodo !== "GET" ? stripeForm(params).join("&") : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new ErrorStripe(j?.error?.message || `Stripe respondió ${res.status}`);
  return j as T;
}

// ---------- Planes en Stripe ----------

const idsPlan = (p: Plan, modo: Modo) => modo === "real"
  ? { producto: p.stripeProductoReal, mes: p.stripePrecioReal, anio: p.stripePrecioAnualReal }
  : { producto: p.stripeProducto, mes: p.stripePrecio, anio: p.stripePrecioAnual };

const centavos = (monto: string | number | null | undefined) => Math.round(Number(monto ?? 0) * 100);

/**
 * Crea o pone al día el producto y los precios del plan en Stripe. Un precio no se puede cambiar:
 * si el monto cambió se crea uno nuevo y el viejo se archiva. Devuelve null sin llave o si el plan es gratis.
 */
export async function stripePlan(env: Env, db: Db, planId: number, modo?: Modo) {
  const C = cfgStripe(env, modo);
  if (!C.key) return null;
  const [p] = await db.select().from(planes).where(eq(planes.id, planId));
  if (!p || p.esTrial || centavos(p.precioMensual) <= 0) return null;
  const ids = idsPlan(p, C.modo);
  let producto = ids.producto;
  // Si el producto guardado no existe en esta cuenta (otra llave u otro ambiente), se crea uno nuevo.
  if (producto && !(await stripeApi(C.key, "POST", `/products/${producto}`, { name: `Delywa ${p.nombre}` }).then(() => true).catch(() => false))) producto = null;
  if (!producto) producto = (await stripeApi<{ id: string }>(C.key, "POST", "/products", { name: `Delywa ${p.nombre}`, metadata: { app: "delywa", plan_id: p.id } })).id;
  const asegurar = async (actual: string | null, monto: number, intervalo: "month" | "year") => {
    if (!monto) {
      if (actual) await stripeApi(C.key, "POST", `/prices/${actual}`, { active: false }).catch(() => {});
      return null;
    }
    if (actual) {
      const pr = await stripeApi<any>(C.key, "GET", `/prices/${actual}`).catch(() => null);
      if (pr && pr.active && pr.unit_amount === monto && pr.recurring?.interval === intervalo && pr.currency === "usd") return actual;
      await stripeApi(C.key, "POST", `/prices/${actual}`, { active: false }).catch(() => {});
    }
    return (await stripeApi<{ id: string }>(C.key, "POST", "/prices", {
      product: producto, currency: "usd", unit_amount: monto, recurring: { interval: intervalo }, metadata: { app: "delywa", plan_id: p.id },
    })).id;
  };
  const mes = await asegurar(ids.mes, centavos(precioCobro(p.precioMensual, C.sumarComision)), "month");
  const anio = await asegurar(ids.anio, p.precioAnual ? centavos(precioCobro(p.precioAnual, C.sumarComision)) : 0, "year");
  await db.update(planes).set(C.modo === "real"
    ? { stripeProductoReal: producto, stripePrecioReal: mes, stripePrecioAnualReal: anio }
    : { stripeProducto: producto, stripePrecio: mes, stripePrecioAnual: anio }).where(eq(planes.id, p.id));
  return { producto, mes, anio };
}

/** Pone al día en Stripe un plan en los ambientes que tengan llave (al editarlo en Plataforma). No falla: devuelve el aviso. */
export async function sincronizarPlanEnStripe(env: Env, db: Db, planId: number): Promise<string | null> {
  const avisos: string[] = [];
  for (const modo of ["prueba", "real"] as Modo[]) {
    if (!cfgStripe(env, modo).key) continue;
    try { await stripePlan(env, db, planId, modo); } catch (e) { avisos.push(`${modo}: ${e instanceof Error ? e.message : e}`); }
  }
  return avisos.length ? `No se pudo poner al día en Stripe (${avisos.join("; ")}).` : null;
}

// ---------- Suscripción de cada negocio ----------

const ESTADO_STRIPE: Record<string, string> = {
  active: "activa", trialing: "activa", past_due: "atrasada", unpaid: "atrasada", paused: "atrasada",
  canceled: "cancelada", incomplete_expired: "cancelada", incomplete: "pendiente",
};

export async function suscripcionDe(db: Db, colmadoId: number) {
  const [s] = await db.select().from(suscripciones)
    .where(and(eq(suscripciones.colmadoId, colmadoId), isNotNull(suscripciones.stripeSuscripcion)))
    .orderBy(desc(suscripciones.id)).limit(1);
  return s ?? null;
}

async function planPorPrecio(db: Db, precio: string | null | undefined): Promise<Plan | undefined> {
  if (!precio) return undefined;
  const todos = await db.select().from(planes);
  return todos.find((p) => [p.stripePrecio, p.stripePrecioAnual, p.stripePrecioReal, p.stripePrecioAnualReal].includes(precio));
}

/** Guarda en Delywa lo que dice la suscripción de Stripe y le pone al negocio el plan pagado. */
export async function sincronizarSus(db: Db, sub: any, modo?: Modo): Promise<number | null> {
  const colmadoId = Number(sub?.metadata?.colmado_id || 0);
  if (!colmadoId || sub?.metadata?.app !== "delywa") return null;
  const m: Modo = modo ?? (sub.livemode ? "real" : "prueba");
  const [negocio] = await db.select({ id: colmados.id }).from(colmados).where(eq(colmados.id, colmadoId));
  if (!negocio) return null;
  // Una suscripción de prueba nunca pisa una real.
  if (m !== "real") {
    const [real] = await db.select({ id: suscripciones.id }).from(suscripciones).where(and(
      eq(suscripciones.colmadoId, colmadoId), eq(suscripciones.modo, "real"), isNotNull(suscripciones.stripeSuscripcion), ne(suscripciones.stripeSuscripcion, sub.id)));
    if (real) return null;
  }
  const item = sub.items?.data?.[0];
  const precio: string | undefined = item?.price?.id;
  const plan = (await planPorPrecio(db, precio)) ?? (sub.metadata?.plan_id ? (await db.select().from(planes).where(eq(planes.id, Number(sub.metadata.plan_id))))[0] : undefined);
  if (!plan) return null;
  const finS = sub.current_period_end ?? item?.current_period_end;
  const inicioS = sub.current_period_start ?? item?.current_period_start ?? sub.start_date;
  let fin = finS ? new Date(finS * 1000) : new Date(Date.now() + 30 * 86400000);
  // Cancelada: termina cuando Stripe la cerró (si fue por no pagar, ya). Impaga (se acabaron los reintentos): desde hoy.
  if (sub.status === "canceled" && sub.ended_at) fin = new Date(sub.ended_at * 1000);
  if (sub.status === "unpaid") fin = new Date(Math.min(fin.getTime(), Date.now()));
  const anual = item?.price?.recurring?.interval === "year";
  const estado = ESTADO_STRIPE[sub.status] ?? "pendiente";
  const datos = {
    colmadoId, planId: plan.id, fechaFin: fin, estado, renovacionAutomatica: !sub.cancel_at_period_end,
    stripeCliente: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null, stripeSuscripcion: sub.id,
    modo: m, periodo: anual ? "anio" : "mes", cancelaAlFinal: !!sub.cancel_at_period_end,
    ...(inicioS ? { fechaInicio: new Date(inicioS * 1000) } : {}),
  };
  const [existente] = await db.select({ id: suscripciones.id }).from(suscripciones).where(and(eq(suscripciones.colmadoId, colmadoId), eq(suscripciones.stripeSuscripcion, sub.id)));
  if (existente) await db.update(suscripciones).set(datos).where(eq(suscripciones.id, existente.id));
  else await db.insert(suscripciones).values(datos);
  // El negocio queda con el plan pagado hasta el fin del período. Cancelada: conserva lo pagado hasta esa fecha.
  if (estado === "activa" || estado === "atrasada" || estado === "cancelada") {
    const [c] = await db.select({ cortesia: colmados.cortesia }).from(colmados).where(eq(colmados.id, colmadoId));
    const nuevoEstado = estadoSegunFecha(fin, !!c?.cortesia);
    await db.update(colmados).set({
      planId: plan.id, fechaVencimiento: fin, estadoSuscripcion: nuevoEstado,
      ...(estado === "cancelada" ? {} : { fechaInicioPlan: datos.fechaInicio ?? new Date() }),
    }).where(eq(colmados.id, colmadoId));
    // Las sucursales siguen al principal al instante (pagar saca del modo limitado sin esperar al cron).
    await db.update(colmados).set({ estadoSuscripcion: nuevoEstado }).where(eq(colmados.negocioPrincipalId, colmadoId));
  }
  return colmadoId;
}

// ---------- Webhook ----------

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Firma del webhook: HMAC-SHA256 de "t.cuerpo" con el secreto (whsec_…), con 5 minutos de tolerancia. */
export async function firmaStripe(secreto: string, cuerpo: string, cabecera: string | null | undefined): Promise<boolean> {
  const partes = String(cabecera || "").split(",").map((x) => x.trim());
  const t = (partes.find((x) => x.startsWith("t=")) || "").slice(2);
  const v1s = partes.filter((x) => x.startsWith("v1=")).map((x) => x.slice(3));
  if (!t || !v1s.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = hex(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${cuerpo}`))));
  return v1s.some((v) => v.length === h.length && [...v].reduce((a, ch, i) => a | (ch.charCodeAt(0) ^ h.charCodeAt(i)), 0) === 0);
}

const fechaDe = (t: number | null | undefined) => (t ? new Date(t * 1000) : null);
const dinero = (c: number | null | undefined) => ((c || 0) / 100).toFixed(2);

/** Guarda una factura de Stripe con su cobro (comisión y neto) para Ingresos. */
export async function guardarFactura(key: string, db: Db, inv: any, modo: Modo): Promise<void> {
  if (!inv?.id) return;
  if (!inv.lines || inv.charge === undefined) inv = await stripeApi(key, "GET", `/invoices/${inv.id}`);
  const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? inv.parent?.subscription_details?.subscription;
  let colmadoId = Number(inv.subscription_details?.metadata?.colmado_id || inv.parent?.subscription_details?.metadata?.colmado_id || inv.metadata?.colmado_id || 0) || null;
  if (!colmadoId && (subId || inv.customer)) {
    const [s] = await db.select({ c: suscripciones.colmadoId }).from(suscripciones)
      .where(subId ? eq(suscripciones.stripeSuscripcion, subId) : eq(suscripciones.stripeCliente, inv.customer)).limit(1);
    colmadoId = s?.c ?? null;
  }
  const linea = inv.lines?.data?.[0];
  const precio = linea?.price?.id ?? linea?.pricing?.price_details?.price;
  const plan = await planPorPrecio(db, precio);
  let comision: string | null = null, neto: string | null = null, reembolsado = "0", error: string | null = null;
  const cargoId = typeof inv.charge === "string" ? inv.charge : inv.charge?.id;
  if (cargoId) {
    try {
      const ch = await stripeApi<any>(key, "GET", `/charges/${cargoId}`, { expand: ["balance_transaction"] });
      const bt = ch.balance_transaction && typeof ch.balance_transaction === "object" ? ch.balance_transaction : null;
      if (bt) { comision = dinero(bt.fee); neto = dinero(bt.net); }
      reembolsado = dinero(ch.amount_refunded);
      if (ch.status === "failed") error = ch.failure_message || ch.outcome?.seller_message || "Pago rechazado";
    } catch (e) { console.error("[stripe] cargo", e instanceof Error ? e.message : e); }
  }
  if (!error && inv.last_finalization_error) error = inv.last_finalization_error.message;
  const fila = {
    id: inv.id as string, colmadoId, numero: inv.number ?? null, estado: inv.status ?? null, motivo: inv.billing_reason ?? null,
    plan: plan?.nombre ?? null, moneda: inv.currency || "usd", total: dinero(inv.total), pagado: dinero(inv.amount_paid), pendiente: dinero(inv.amount_remaining),
    comision, neto, reembolsado, periodoInicio: fechaDe(linea?.period?.start ?? inv.period_start), periodoFin: fechaDe(linea?.period?.end ?? inv.period_end),
    creada: fechaDe(inv.created), pagadaEn: fechaDe(inv.status_transitions?.paid_at), intentos: inv.attempt_count || 0, error,
    correo: inv.customer_email ?? null, url: inv.hosted_invoice_url ?? null, pdf: inv.invoice_pdf ?? null,
    modo: inv.livemode === true ? "real" : inv.livemode === false ? "prueba" : modo, actualizado: new Date(),
  };
  const { id, ...cambios } = fila;
  await db.insert(stripeFacturas).values(fila as any).onConflictDoUpdate({
    target: stripeFacturas.id,
    set: { ...cambios, comision: comision ?? undefined, neto: neto ?? undefined, error: error ?? undefined } as any,
  });
}

/** Correo para el recibo de Stripe: el del dueño del negocio. */
export async function correoDelDueno(db: Db, colmadoId: number): Promise<string | undefined> {
  const [c] = await db.select({ owner: colmados.ownerUserId }).from(colmados).where(eq(colmados.id, colmadoId));
  if (!c?.owner) return undefined;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, c.owner));
  return u?.email ?? undefined;
}
