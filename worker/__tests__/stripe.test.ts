// @vitest-environment node
// v2.63 · Pago del plan con Stripe (Checkout, cambio de plan, portal, cancelar, webhook). Stripe simulado: nunca se llama de verdad.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, planes, stripeFacturas, suscripciones } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { precioCobro, sincronizarSus, stripeHttp } from "../lib/stripe";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, admin: Client, despachador: Client;
let negocio: typeof colmados.$inferSelect, sucursal: typeof colmados.$inferSelect;
let idColmado = 0, idFull = 0;
const WHSEC = "whsec_pruebaDelywa1234567890";
const fetchOriginal = stripeHttp.fetch;

// ---------- Stripe simulado ----------
type Llamada = { metodo: string; ruta: string; params: URLSearchParams };
const llamadas: Llamada[] = [];
const precios = new Map<string, { id: string; unit_amount: number; recurring: { interval: string }; active: boolean; currency: string }>();
let sub: any = null;
let ultimaSesion: URLSearchParams | null = null;
let n = 0;
const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });

function stripeFalso(url: string, init?: RequestInit): Response {
  const u = new URL(url);
  const ruta = u.pathname.replace(/^\/v1/, "");
  const metodo = init?.method ?? "GET";
  const params = new URLSearchParams(metodo === "GET" ? u.search : String(init?.body ?? ""));
  llamadas.push({ metodo, ruta, params });
  if (!String((init?.headers as Record<string, string>)?.Authorization ?? "").startsWith("Bearer sk_test_")) return new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 });
  if (ruta === "/balance") return ok({ available: [{ currency: "usd", amount: 0 }] });
  if (ruta === "/products" && metodo === "POST") return ok({ id: `prod_${++n}` });
  if (/^\/products\//.test(ruta)) return ok({ id: ruta.split("/")[2] });
  if (ruta === "/prices" && metodo === "POST") {
    const p = { id: `price_${++n}`, unit_amount: Number(params.get("unit_amount")), recurring: { interval: params.get("recurring[interval]")! }, active: true, currency: params.get("currency")! };
    precios.set(p.id, p);
    return ok(p);
  }
  if (/^\/prices\//.test(ruta)) {
    const p = precios.get(ruta.split("/")[2]);
    if (!p) return new Response("{}", { status: 404 });
    if (metodo === "POST" && params.get("active") === "false") p.active = false;
    return ok(p);
  }
  if (ruta === "/checkout/sessions" && metodo === "POST") ultimaSesion = params;
  if (ruta === "/checkout/sessions" && metodo === "POST") return ok({ id: "cs_test_abc", url: "https://checkout.stripe.test/cs_test_abc" });
  if (ruta === "/checkout/sessions/cs_test_abc") {
    const pedido = ultimaSesion!;
    const precio = precios.get(pedido.get("line_items[0][price]")!)!;
    sub = {
      id: "sub_1", object: "subscription", status: "active", customer: "cus_1", livemode: false, cancel_at_period_end: false,
      current_period_start: Math.floor(Date.now() / 1000), current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      metadata: { app: "delywa", colmado_id: pedido.get("metadata[colmado_id]"), plan_id: pedido.get("metadata[plan_id]") },
      items: { data: [{ id: "si_1", price: precio }] },
    };
    return ok({ id: "cs_test_abc", client_reference_id: pedido.get("client_reference_id"), metadata: { app: "delywa", colmado_id: pedido.get("metadata[colmado_id]") }, subscription: "sub_1" });
  }
  if (ruta === "/subscriptions/sub_1") {
    if (metodo === "POST") {
      if (params.get("items[0][price]")) sub.items.data[0].price = precios.get(params.get("items[0][price]")!);
      if (params.get("cancel_at_period_end")) sub.cancel_at_period_end = params.get("cancel_at_period_end") === "true";
      if (params.get("metadata[plan_id]")) sub.metadata.plan_id = params.get("metadata[plan_id]");
    }
    return ok(sub);
  }
  if (ruta === "/billing_portal/sessions") return ok({ url: "https://billing.stripe.test/p/1" });
  if (ruta === "/charges/ch_1") return ok({ id: "ch_1", status: "succeeded", amount_refunded: 0, balance_transaction: { fee: 59, net: 940 } });
  return new Response(JSON.stringify({ error: { message: `sin simular: ${metodo} ${ruta}` } }), { status: 400 });
}

async function firmar(cuerpo: string, secreto = WHSEC) {
  const t0 = Math.floor(Date.now() / 1000);
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t0}.${cuerpo}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t0},v1=${h}`;
}
async function aviso(evento: Record<string, unknown>, secreto?: string) {
  const cuerpo = JSON.stringify({ livemode: false, ...evento });
  return t.client().raw("POST", "/api/stripe/webhook", cuerpo, { "Content-Type": "application/json", "Stripe-Signature": await firmar(cuerpo, secreto) });
}

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
  stripeHttp.fetch = async (url, init) => stripeFalso(String(url), init);
  const todos = await t.db.select().from(planes);
  idColmado = todos.find((p) => p.slug === "basico")!.id;
  idFull = todos.find((p) => p.slug === "profesional")!.id;
  const trial = todos.find((p) => p.esTrial)!.id;
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Paga", slug: "colmado-paga", whatsappNumero: "18094660001", direccion: "Calle 1", planId: trial, fechaInicioPlan: new Date() }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Paga Norte", slug: "paga-norte", whatsappNumero: "18094660002", direccion: "Calle 2", planId: trial, negocioPrincipalId: negocio.id }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "paga@delywa.test", password: "paga-clave-1234", firstName: "Pepa", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  await createUser(t.db, { idPrefix: "staff", email: "desp-paga@delywa.test", password: "desp-clave-1234", firstName: "Dani", role: "operador_sucursal", colmadoId: negocio.id });
  await createUser(t.db, { idPrefix: "admin", email: "plat-paga@delywa.test", password: "plataforma-clave-2", firstName: "Ana", role: "platform_admin" });
  dueno = await login("paga@delywa.test", "paga-clave-1234");
  despachador = await login("desp-paga@delywa.test", "desp-clave-1234");
  admin = await login("plat-paga@delywa.test", "plataforma-clave-2");
}, 60_000);
afterAll(async () => { stripeHttp.fetch = fetchOriginal; await t?.dispose(); });
beforeEach(() => { llamadas.length = 0; });

describe("sin llaves de Stripe", () => {
  it("Mi plan dice que el pago todavía no está activo y el checkout lo explica", async () => {
    const r = await dueno.request("GET", `/api/colmados/${negocio.id}/suscripcion`);
    expect(r.json.pago.activo).toBe(false);
    const c = await dueno.request("POST", `/api/colmados/${negocio.id}/plan/checkout`, { planId: idFull, periodo: "mes" });
    expect(c.status).toBe(503);
    expect(c.json.error).toMatch(/soporte@delywa\.com/);
  });
});

describe("Integraciones → Stripe", () => {
  it("no acepta una llave real en el campo de prueba y no cobra en real sin la llave real", async () => {
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { stripe_key: "sk_live_1234567890abcdef" } })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { stripe_webhook: "abc" } })).status).toBe(400);
    const r = await admin.request("PUT", "/api/admin/integraciones", { valores: { stripe_key: "sk_test_1234567890abcdef", stripe_webhook: WHSEC } });
    expect(r.status).toBe(200);
    expect(r.json.stripe.webhookUrl).toMatch(/\/api\/stripe\/webhook$/);
    expect(r.json.stripe.eventos).toContain("customer.subscription.updated");
    const real = await admin.request("PUT", "/api/admin/integraciones", { valores: { stripe_ambiente: "real" } });
    expect(real.status).toBe(400);
    expect(real.json.error).toMatch(/sk_live_/);
  });

  it("«Probar conexión» lee el saldo (no cobra nada)", async () => {
    const r = await admin.request("POST", "/api/admin/integraciones/probar-stripe");
    expect(r.json.ok).toBe(true);
    expect(r.json.mensaje).toMatch(/Prueba: la llave funciona/);
    expect(llamadas.map((l) => l.ruta)).toEqual(["/balance"]);
  });
});

describe("elegir y pagar el plan", () => {
  it("solo el dueño paga; la sucursal se cambia desde el principal", async () => {
    expect((await despachador.request("POST", `/api/colmados/${negocio.id}/plan/checkout`, { planId: idFull })).status).toBe(403);
    expect((await despachador.request("GET", `/api/colmados/${negocio.id}/suscripcion`)).json.pago.puedePagar).toBe(false);
    expect((await admin.request("POST", `/api/colmados/${sucursal.id}/plan/checkout`, { planId: idFull })).status).toBe(409);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/plan/checkout`, { planId: 1 })).status).toBe(400); // la prueba no se compra
  });

  it("crea el producto y los precios en dólares y abre el pago de Stripe", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/plan/checkout`, { planId: idFull, periodo: "mes" });
    expect(r.status).toBe(200);
    expect(r.json.url).toBe("https://checkout.stripe.test/cs_test_abc");
    const montos = llamadas.filter((l) => l.ruta === "/prices" && l.metodo === "POST").map((l) => [l.params.get("unit_amount"), l.params.get("recurring[interval]"), l.params.get("currency")]);
    expect(montos).toEqual([["2999", "month", "usd"], ["32989", "year", "usd"]]);
    const s = llamadas.find((l) => l.ruta === "/checkout/sessions")!.params;
    expect(s.get("mode")).toBe("subscription");
    expect(s.get("customer_email")).toBe("paga@delywa.test");
    expect(s.get("metadata[colmado_id]")).toBe(String(negocio.id));
    expect(s.get("success_url")).toMatch(/\/negocio\/settings\?seccion=plan&pago=ok&sesion=\{CHECKOUT_SESSION_ID\}$/);
    const [full] = await t.db.select().from(planes).where(eq(planes.id, idFull));
    expect(full.stripePrecio).toMatch(/^price_/);
    expect(full.stripePrecioReal).toBeNull();
  });

  it("al volver de Stripe queda en Full, con su fecha de renovación", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/plan/confirmar`, { sesion: "cs_test_abc" });
    expect(r.json.ok).toBe(true);
    const [c] = await t.db.select().from(colmados).where(eq(colmados.id, negocio.id));
    expect(c.planId).toBe(idFull);
    expect(c.fechaVencimiento!.getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    const mi = await dueno.request("GET", `/api/colmados/${negocio.id}/suscripcion`);
    expect(mi.json.vigente.nombre).toBe("Full");
    expect(mi.json.pago.suscripcion).toMatchObject({ planId: idFull, estado: "activa", periodo: "mes", cancelaAlFinal: false, conTarjeta: true });
  });

  it("cambiar a Colmado se hace en la misma suscripción, con prorrateo", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/plan/checkout`, { planId: idColmado, periodo: "mes" });
    expect(r.json).toMatchObject({ cambiado: true, plan: "Colmado" });
    const cambio = llamadas.find((l) => l.ruta === "/subscriptions/sub_1" && l.metodo === "POST")!.params;
    expect(cambio.get("proration_behavior")).toBe("create_prorations");
    expect(llamadas.some((l) => l.ruta === "/checkout/sessions")).toBe(false);
    const [c] = await t.db.select().from(colmados).where(eq(colmados.id, negocio.id));
    expect(c.planId).toBe(idColmado);
  });

  it("cancelar al final del período y deshacerlo; el portal de la tarjeta", async () => {
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/plan/cancelar`)).json.cancelaAlFinal).toBe(true);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/suscripcion`)).json.pago.suscripcion.cancelaAlFinal).toBe(true);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/plan/reactivar`)).json.cancelaAlFinal).toBe(false);
    const p = await dueno.request("POST", `/api/colmados/${negocio.id}/plan/portal`);
    expect(p.json.url).toBe("https://billing.stripe.test/p/1");
    expect(llamadas.find((l) => l.ruta === "/billing_portal/sessions")!.params.get("customer")).toBe("cus_1");
  });
});

describe("webhook de Stripe", () => {
  it("rechaza un aviso sin firma válida", async () => {
    const res = await aviso({ id: "evt_malo", type: "customer.subscription.updated", data: { object: sub } }, "whsec_otraFirmaCualquiera1234");
    expect(res.status).toBe(400);
  });

  it("un cobro fallido deja el pago atrasado (sigue funcionando) y no repite el mismo aviso", async () => {
    const evento = { id: "evt_1", type: "customer.subscription.updated", data: { object: { ...sub, status: "past_due" } } };
    expect((await aviso(evento)).status).toBe(200);
    const [s] = await t.db.select().from(suscripciones).where(eq(suscripciones.stripeSuscripcion, "sub_1"));
    expect(s.estado).toBe("atrasada");
    const otra = await aviso(evento);
    expect(await otra.json()).toMatchObject({ repetido: true });
  });

  it("guarda la factura pagada con la comisión de Stripe y lo neto", async () => {
    const factura = {
      id: "in_1", object: "invoice", number: "DLW-0001", status: "paid", billing_reason: "subscription_cycle", currency: "usd",
      total: 999, amount_paid: 999, amount_remaining: 0, charge: "ch_1", customer: "cus_1", customer_email: "paga@delywa.test",
      subscription: "sub_1", created: Math.floor(Date.now() / 1000), status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
      lines: { data: [{ price: sub.items.data[0].price, period: { start: 1, end: 2 } }] }, livemode: false,
    };
    expect((await aviso({ id: "evt_2", type: "invoice.paid", data: { object: factura } })).status).toBe(200);
    const [f] = await t.db.select().from(stripeFacturas).where(eq(stripeFacturas.id, "in_1"));
    expect([f.colmadoId, f.plan, f.total, f.comision, f.neto, f.modo]).toEqual([negocio.id, "Colmado", "9.99", "0.59", "9.40", "prueba"]);
  });

  it("una suscripción de prueba nunca pisa una real", async () => {
    await t.db.insert(suscripciones).values({ colmadoId: negocio.id, planId: idFull, fechaFin: new Date(Date.now() + 86400000), stripeSuscripcion: "sub_real", modo: "real" });
    expect(await sincronizarSus(t.db, { ...sub, status: "active" }, "prueba")).toBeNull();
    await t.db.delete(suscripciones).where(eq(suscripciones.stripeSuscripcion, "sub_real"));
  });
});

describe("Plataforma → Planes", () => {
  it("cambiar el precio crea el precio nuevo en Stripe y archiva el viejo", async () => {
    const [antes] = await t.db.select().from(planes).where(eq(planes.id, idFull));
    const r = await admin.request("PATCH", `/api/planes/${idFull}`, { precioMensual: "34.99" });
    expect(r.status).toBe(200);
    expect(r.json.avisoStripe).toBeNull();
    const [despues] = await t.db.select().from(planes).where(eq(planes.id, idFull));
    expect(despues.stripePrecio).not.toBe(antes.stripePrecio);
    expect(precios.get(antes.stripePrecio!)!.active).toBe(false);
    expect(precios.get(despues.stripePrecio!)!.unit_amount).toBe(3499);
    expect(despues.stripePrecioAnual).toBe(antes.stripePrecioAnual); // el anual no cambió
  });
});

describe("sumar la comisión de Stripe", () => {
  it("cobra lo necesario para que quede el precio del plan, y lo muestra", async () => {
    expect(precioCobro("9.99", true)).toBe(10.6);
    expect(precioCobro("29.99", true)).toBe(31.2);
    expect(precioCobro("9.99", false)).toBe(9.99);
    const r = await admin.request("PUT", "/api/admin/integraciones", { valores: { stripe_sumar_comision: "true" } });
    expect(r.status).toBe(200);
    expect(r.json.stripe.sumarComision).toBe(true);
    const [colmado] = await t.db.select().from(planes).where(eq(planes.id, idColmado));
    expect(precios.get(colmado.stripePrecio!)!.unit_amount).toBe(1060);
    const pub = (await t.client().request("GET", "/api/planes?activos=true")).json.find((p: { id: number }) => p.id === idColmado);
    expect([pub.precioMensual, pub.precioCobro]).toEqual(["9.99", "10.60"]);
    await admin.request("PUT", "/api/admin/integraciones", { valores: { stripe_sumar_comision: "false" } });
    const [otra] = await t.db.select().from(planes).where(eq(planes.id, idColmado));
    expect(precios.get(otra.stripePrecio!)!.unit_amount).toBe(999);
  });
});
