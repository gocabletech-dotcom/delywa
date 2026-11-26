// Pago del plan con Stripe: el dueño elige su plan en Configuración → Mi plan (Checkout de Stripe),
// lo cambia en la misma suscripción (Stripe prorratea), gestiona su tarjeta en el portal de Stripe
// o lo cancela al final del período. Y el webhook que mantiene todo al día. Adaptado de FoodPOS.
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { planes, stripeEventos, type Plan } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { getColmado } from "../storage/colmados";
import {
  ErrorStripe, cfgStripe, correoDelDueno, firmaStripe, guardarFactura, sincronizarSus, stripeApi, stripePlan, suscripcionDe, type Modo,
} from "../lib/stripe";

export const planPagoRoutes = new Hono<AppEnv>();

/** Solo el dueño (o la plataforma) cambia y paga el plan. */
export const PUEDEN_PAGAR = ["platform_admin", "colmado_owner"];
const SIN_STRIPE = "El pago con tarjeta todavía no está activo. Escríbenos a soporte@delywa.com para cambiar de plan.";

const base = "/api/colmados/:id/plan";
planPagoRoutes.use(`${base}/*`, requireAuth, requireBusinessAccess(), async (c, next) => {
  if (!PUEDEN_PAGAR.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño del negocio puede cambiar o pagar el plan." }, 403);
  const negocio = await getColmado(getDb(c.env.DB), Number(c.req.param("id")));
  if (!negocio) return c.json({ error: "Negocio no encontrado" }, 404);
  if (negocio.negocioPrincipalId) return c.json({ error: "El plan se cambia desde el negocio principal: aplica a todas sus sucursales." }, 409);
  await next();
});

const origen = (c: Context<AppEnv>) => (c.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
const volverA = (c: Context<AppEnv>) => `${origen(c)}/negocio/settings?seccion=plan`;

/** La suscripción guardada solo sirve si es del ambiente que cobra ahora (lo pagado en prueba no es dinero real). */
async function suscripcionDelAmbiente(db: Db, colmadoId: number, modo: Modo) {
  const s = await suscripcionDe(db, colmadoId);
  return s && s.modo === modo ? s : null;
}

const precioDe = (p: Plan, modo: Modo, anual: boolean) =>
  modo === "real" ? (anual ? p.stripePrecioAnualReal : p.stripePrecioReal) : (anual ? p.stripePrecioAnual : p.stripePrecio);

function errorStripe(c: Context<AppEnv>, e: unknown) {
  if (e instanceof ErrorStripe) return c.json({ error: `Stripe no aceptó la operación: ${e.message}` }, 502);
  throw e;
}

planPagoRoutes.post(`${base}/checkout`, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const C = cfgStripe(c.env);
  if (!C.key) return c.json({ error: SIN_STRIPE }, 503);
  const body = (await c.req.json().catch(() => ({}))) as { planId?: number; periodo?: string };
  const anual = body.periodo === "anio";
  const [plan] = await db.select().from(planes).where(and(eq(planes.id, Number(body.planId)), eq(planes.activo, true)));
  if (!plan || plan.esTrial || !plan.visible || Number(plan.precioMensual) <= 0) return c.json({ error: "Ese plan no se puede elegir." }, 400);
  if (anual && !(Number(plan.precioAnual) > 0)) return c.json({ error: "Ese plan no tiene precio anual." }, 400);
  try {
    let precio = precioDe(plan, C.modo, anual);
    if (!precio) {
      const creado = await stripePlan(c.env, db, plan.id, C.modo); // un plan nuevo crea sus precios en Stripe la primera vez
      precio = (anual ? creado?.anio : creado?.mes) ?? null;
    }
    if (!precio) return c.json({ error: "Ese plan todavía no está listo para cobrar. Escríbenos a soporte@delywa.com." }, 409);
    const metadata = { app: "delywa", colmado_id: colmadoId, plan_id: plan.id };
    const sus = await suscripcionDelAmbiente(db, colmadoId, C.modo);
    // Ya paga por Stripe: se cambia el plan en la misma suscripción y Stripe cobra o abona la diferencia.
    if (sus?.stripeSuscripcion && (sus.estado === "activa" || sus.estado === "atrasada")) {
      const sub = await stripeApi<any>(C.key, "GET", `/subscriptions/${sus.stripeSuscripcion}`);
      const nueva = await stripeApi<any>(C.key, "POST", `/subscriptions/${sub.id}`, {
        items: [{ id: sub.items.data[0].id, price: precio }], proration_behavior: "create_prorations", cancel_at_period_end: false, metadata,
      });
      await sincronizarSus(db, nueva, C.modo);
      c.set("bitacoraDetalle", `Cambió el plan a ${plan.nombre} (${anual ? "anual" : "mensual"})`);
      return c.json({ cambiado: true, plan: plan.nombre });
    }
    const negocio = await getColmado(db, colmadoId);
    const correo = await correoDelDueno(db, colmadoId);
    const sesion = await stripeApi<any>(C.key, "POST", "/checkout/sessions", {
      mode: "subscription",
      ...(sus?.stripeCliente ? { customer: sus.stripeCliente } : correo ? { customer_email: correo } : {}),
      client_reference_id: String(colmadoId),
      line_items: [{ price: precio, quantity: 1 }],
      allow_promotion_codes: true,
      locale: "es",
      metadata,
      subscription_data: { metadata, description: `Delywa ${plan.nombre} · ${negocio?.nombre ?? ""}`.trim() },
      success_url: `${volverA(c)}&pago=ok&sesion={CHECKOUT_SESSION_ID}`,
      cancel_url: volverA(c),
    });
    c.set("bitacoraDetalle", `Abrió el pago del plan ${plan.nombre} (${anual ? "anual" : "mensual"})`);
    return c.json({ url: sesion.url });
  } catch (e) { return errorStripe(c, e); }
});

/** Al volver de Stripe: se confirma el pago sin esperar al webhook. */
planPagoRoutes.post(`${base}/confirmar`, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const C = cfgStripe(c.env);
  if (!C.key) return c.json({ error: SIN_STRIPE }, 503);
  const { sesion } = (await c.req.json().catch(() => ({}))) as { sesion?: string };
  if (!sesion || !/^cs_[\w]+$/.test(sesion)) return c.json({ error: "Falta la sesión de pago." }, 400);
  try {
    const s = await stripeApi<any>(C.key, "GET", `/checkout/sessions/${sesion}`);
    if (String(s.client_reference_id) !== String(colmadoId) || s.metadata?.app !== "delywa") return c.json({ error: "Ese pago no es de este negocio." }, 403);
    if (!s.subscription) return c.json({ ok: false, pendiente: true });
    const sub = await stripeApi<any>(C.key, "GET", `/subscriptions/${typeof s.subscription === "string" ? s.subscription : s.subscription.id}`);
    if (!sub.metadata?.colmado_id) sub.metadata = { ...(sub.metadata || {}), ...s.metadata };
    await sincronizarSus(db, sub, C.modo);
    return c.json({ ok: true });
  } catch (e) { return errorStripe(c, e); }
});

/** Portal de Stripe: cambiar la tarjeta, ver las facturas o cancelar. */
planPagoRoutes.post(`${base}/portal`, async (c) => {
  const db = getDb(c.env.DB);
  const C = cfgStripe(c.env);
  if (!C.key) return c.json({ error: SIN_STRIPE }, 503);
  const sus = await suscripcionDelAmbiente(db, Number(c.req.param("id")), C.modo);
  if (!sus?.stripeCliente) return c.json({ error: "Todavía no tienes un pago registrado. Elige un plan primero." }, 409);
  try {
    const p = await stripeApi<any>(C.key, "POST", "/billing_portal/sessions", { customer: sus.stripeCliente, return_url: volverA(c), locale: "es" });
    return c.json({ url: p.url });
  } catch (e) { return errorStripe(c, e); }
});

/** Cancelar (al final de lo pagado) o deshacer la cancelación. */
for (const [ruta, cancelar] of [["cancelar", true], ["reactivar", false]] as const) {
  planPagoRoutes.post(`${base}/${ruta}`, async (c) => {
    const db = getDb(c.env.DB);
    const C = cfgStripe(c.env);
    if (!C.key) return c.json({ error: SIN_STRIPE }, 503);
    const sus = await suscripcionDelAmbiente(db, Number(c.req.param("id")), C.modo);
    if (!sus?.stripeSuscripcion || sus.estado === "cancelada") return c.json({ error: "No tienes un plan pagado activo." }, 409);
    try {
      const sub = await stripeApi<any>(C.key, "POST", `/subscriptions/${sus.stripeSuscripcion}`, { cancel_at_period_end: cancelar });
      await sincronizarSus(db, sub, C.modo);
      c.set("bitacoraDetalle", cancelar ? "Canceló el plan al final del período" : "Deshizo la cancelación del plan");
      return c.json({ ok: true, cancelaAlFinal: cancelar });
    } catch (e) { return errorStripe(c, e); }
  });
}

// ---------- Webhook de Stripe ----------

planPagoRoutes.post("/api/stripe/webhook", async (c) => {
  const db = getDb(c.env.DB);
  const secretos = (["prueba", "real"] as Modo[]).map((m) => [m, cfgStripe(c.env, m).webhook] as const).filter(([, s]) => s);
  if (!secretos.length) return c.text("Stripe no configurado", 503);
  const cuerpo = await c.req.text();
  const firma = c.req.header("stripe-signature");
  let modo: Modo | null = null;
  for (const [m, secreto] of secretos) if (await firmaStripe(secreto, cuerpo, firma)) { modo = m; break; }
  if (!modo) return c.text("Firma no válida", 400);
  const ev = JSON.parse(cuerpo);
  if (typeof ev.livemode === "boolean") modo = ev.livemode ? "real" : "prueba";
  const C = cfgStripe(c.env, modo);
  if (!C.key) return c.text("Falta la llave de ese ambiente", 503);
  const [visto] = await db.select({ id: stripeEventos.id }).from(stripeEventos).where(eq(stripeEventos.id, ev.id));
  if (visto) return c.json({ ok: true, repetido: true });
  const o = ev.data?.object ?? {};
  try {
    if (ev.type === "checkout.session.completed" && o.subscription) {
      const sub = await stripeApi<any>(C.key, "GET", `/subscriptions/${o.subscription}`);
      if (!sub.metadata?.colmado_id && o.client_reference_id) sub.metadata = { ...(sub.metadata || {}), ...(o.metadata || {}), colmado_id: o.client_reference_id };
      await sincronizarSus(db, sub, modo);
    } else if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(ev.type)) {
      await sincronizarSus(db, ev.type.endsWith("deleted") ? { ...o, status: "canceled" } : o, modo);
    } else if ((ev.type === "invoice.paid" || ev.type === "invoice.payment_failed")) {
      const subId = o.subscription || o.parent?.subscription_details?.subscription;
      if (subId) await sincronizarSus(db, await stripeApi<any>(C.key, "GET", `/subscriptions/${subId}`), modo);
    }
    // Toda factura que cambia queda guardada para Ingresos (también los reembolsos).
    if (/^invoice\./.test(ev.type)) await guardarFactura(C.key, db, o, modo);
    if (ev.type === "charge.refunded" && o.invoice) await guardarFactura(C.key, db, { id: typeof o.invoice === "string" ? o.invoice : o.invoice.id }, modo);
  } catch (e) {
    console.error("[stripe] webhook", ev.type, e instanceof Error ? e.message : e);
    return c.text("Error al procesar el aviso", 500); // Stripe lo vuelve a mandar
  }
  await db.insert(stripeEventos).values({ id: ev.id, tipo: ev.type, modo }).onConflictDoNothing();
  return c.json({ ok: true });
});
