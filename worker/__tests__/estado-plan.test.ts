// @vitest-environment node
// v2.64 · Estado del plan: 3 días de gracia, modo limitado, cobro fallido, cortesía e Ingresos. D1 local en memoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { avisosEnviados, colmados, planes, stripeFacturas } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { DIAS_GRACIA, estadoSegunFecha, revisarPlanes } from "../lib/estado-plan";
import { sincronizarSus } from "../lib/stripe";

const DIA = 86400000;
let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, admin: Client;
let negocio: typeof colmados.$inferSelect, sucursal: typeof colmados.$inferSelect;
let idTrial = 0, idFull = 0;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}
const vence = (dias: number) => t.db.update(colmados).set({ fechaVencimiento: new Date(Date.now() + dias * DIA) }).where(eq(colmados.id, negocio.id));
const estadoDe = async (id: number) => (await t.db.select({ e: colmados.estadoSuscripcion }).from(colmados).where(eq(colmados.id, id)))[0].e;

beforeAll(async () => {
  t = await createTestApp();
  const todos = await t.db.select().from(planes);
  idTrial = todos.find((p) => p.esTrial)!.id;
  idFull = todos.find((p) => p.slug === "profesional")!.id;
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Vence", slug: "colmado-vence", whatsappNumero: "18094770001", direccion: "Calle 1", planId: idTrial }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Vence Norte", slug: "vence-norte", whatsappNumero: "18094770002", direccion: "Calle 2", planId: idTrial, negocioPrincipalId: negocio.id }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "vence@delywa.test", password: "vence-clave-123", firstName: "Lola", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  await createUser(t.db, { idPrefix: "admin", email: "plat-vence@delywa.test", password: "plataforma-clave-3", firstName: "Ana", role: "platform_admin" });
  dueno = await login("vence@delywa.test", "vence-clave-123");
  admin = await login("plat-vence@delywa.test", "plataforma-clave-3");
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("estado según la fecha", () => {
  it("activa hasta la fecha, 3 días de gracia y luego modo limitado; la cortesía nunca vence", () => {
    const fin = new Date("2026-12-10T12:00:00Z");
    expect(DIAS_GRACIA).toBe(3);
    expect(estadoSegunFecha(fin, false, new Date("2026-12-10T11:00:00Z"))).toBe("activa");
    expect(estadoSegunFecha(fin, false, new Date("2026-12-12T12:00:00Z"))).toBe("en_gracia");
    expect(estadoSegunFecha(fin, false, new Date("2026-12-13T13:00:00Z"))).toBe("suspendida");
    expect(estadoSegunFecha(fin, true, new Date("2027-06-01T00:00:00Z"))).toBe("activa");
  });
});

describe("revisión de cada hora", () => {
  it("al vencer entra en gracia (la sucursal también) y avisa una sola vez", async () => {
    await vence(-1);
    const cambios = await revisarPlanes(t.env, t.db);
    expect(cambios.find((x) => x.colmadoId === negocio.id)?.nuevoEstado).toBe("en_gracia");
    expect(await estadoDe(negocio.id)).toBe("en_gracia");
    expect(await estadoDe(sucursal.id)).toBe("en_gracia");
    expect((await revisarPlanes(t.env, t.db)).length).toBe(0);
    const avisos = await t.db.select().from(avisosEnviados).where(like(avisosEnviados.clave, `plan:en_gracia:${negocio.id}:%`));
    expect(avisos.length).toBe(1);
  });

  it("en gracia todo sigue funcionando", async () => {
    expect((await t.client().request("GET", "/api/chat-colmado/colmado-vence/info")).json.estaAbierto).toBe(true);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/mostrador/hoy`)).status).toBe(200);
  });

  it("después de los 3 días pasa a modo limitado", async () => {
    await vence(-(DIAS_GRACIA + 1));
    await revisarPlanes(t.env, t.db);
    expect(await estadoDe(negocio.id)).toBe("suspendida");
    expect(await estadoDe(sucursal.id)).toBe("suspendida");
  });
});

describe("modo limitado", () => {
  it("el chat dice que no recibe pedidos y el bot no toma pedidos", async () => {
    const info = await t.client().request("GET", "/api/chat-colmado/colmado-vence/info");
    expect(info.json.estaAbierto).toBe(false);
    expect(info.json.mensajeCerrado).toMatch(/no está recibiendo pedidos/);
  });

  it("la tienda y el mostrador no aceptan pedidos nuevos; el panel sí abre", async () => {
    const tienda = await t.client().request("POST", "/api/menu-grafico/pedido", {
      colmadoId: negocio.id, clienteNombre: "Ana", clienteWhatsapp: "8095551111", tipoEntrega: "pickup", productos: [{ id: 1, cantidad: 1 }],
    });
    expect(tienda.status).toBe(409);
    const mostrador = await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "efectivo", items: [{ nombre: "Pan", cantidad: 1, precio: 10 }] });
    expect(mostrador.status).toBe(402);
    expect(mostrador.json.planVencido).toBe(true);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/pedidos`)).status).toBe(200);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/suscripcion`)).json.estadoSuscripcion).toBe("suspendida");
  });

  it("al pagar sale del modo limitado al instante, con su sucursal", async () => {
    const [full] = await t.db.select().from(planes).where(eq(planes.id, idFull));
    await t.db.update(planes).set({ stripePrecio: "price_full_mes" }).where(eq(planes.id, full.id));
    const ahora = Math.floor(Date.now() / 1000);
    await sincronizarSus(t.db, {
      id: "sub_v1", status: "active", customer: "cus_v1", livemode: false, cancel_at_period_end: false,
      current_period_start: ahora, current_period_end: ahora + 30 * 86400,
      metadata: { app: "delywa", colmado_id: String(negocio.id), plan_id: String(idFull) },
      items: { data: [{ id: "si_v1", price: { id: "price_full_mes", recurring: { interval: "month" } } }] },
    }, "prueba");
    expect(await estadoDe(negocio.id)).toBe("activa");
    expect(await estadoDe(sucursal.id)).toBe("activa");
    expect((await t.client().request("GET", "/api/chat-colmado/colmado-vence/info")).json.estaAbierto).toBe(true);
  });

  it("una suscripción cancelada por no pagar termina cuando Stripe la cerró", async () => {
    const cerrada = Math.floor(Date.now() / 1000) - 5 * 86400;
    await sincronizarSus(t.db, {
      id: "sub_v1", status: "canceled", ended_at: cerrada, customer: "cus_v1", livemode: false,
      current_period_start: cerrada - 86400, current_period_end: cerrada + 25 * 86400,
      metadata: { app: "delywa", colmado_id: String(negocio.id), plan_id: String(idFull) },
      items: { data: [{ id: "si_v1", price: { id: "price_full_mes", recurring: { interval: "month" } } }] },
    }, "prueba");
    const [c] = await t.db.select().from(colmados).where(eq(colmados.id, negocio.id));
    expect(Math.round(c.fechaVencimiento!.getTime() / 1000)).toBe(cerrada);
    expect(c.estadoSuscripcion).toBe("suspendida");
  });
});

describe("cortesía", () => {
  it("la plataforma la pone: todo incluido, activa y sin vencer", async () => {
    const r = await admin.request("PATCH", `/api/colmados/${negocio.id}`, { cortesia: true });
    expect(r.status).toBe(200);
    expect(await estadoDe(negocio.id)).toBe("activa");
    await revisarPlanes(t.env, t.db);
    expect(await estadoDe(negocio.id)).toBe("activa");
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/suscripcion`)).json.vigente.nombre).toBe("Cortesía");
  });

  it("el dueño no puede ponérsela", async () => {
    await dueno.request("PATCH", `/api/colmados/${negocio.id}`, { cortesia: false, nombre: "Colmado Vence" });
    const [c] = await t.db.select().from(colmados).where(eq(colmados.id, negocio.id));
    expect(c.cortesia).toBe(true);
  });

  it("al quitarla vuelve a su plan y su fecha", async () => {
    await admin.request("PATCH", `/api/colmados/${negocio.id}`, { cortesia: false });
    expect(await estadoDe(negocio.id)).toBe("suspendida");
  });
});

describe("cobro fallido e Ingresos", () => {
  it("un cobro fallido se avisa una sola vez por factura", async () => {
    const { avisarCobroFallido } = await import("../lib/estado-plan");
    await avisarCobroFallido(t.env, t.db, negocio.id, "in_falla", "29.99", "Fondos insuficientes");
    await avisarCobroFallido(t.env, t.db, negocio.id, "in_falla", "29.99", "Fondos insuficientes");
    expect((await t.db.select().from(avisosEnviados).where(eq(avisosEnviados.clave, "cobro-fallido:in_falla"))).length).toBe(1);
  });

  it("Ingresos suma lo cobrado, la comisión y lo neto del mes (solo la plataforma)", async () => {
    const hoy = new Date();
    await t.db.insert(stripeFacturas).values([
      { id: "in_a", colmadoId: negocio.id, estado: "paid", plan: "Full", total: "29.99", pagado: "29.99", comision: "1.17", neto: "28.82", creada: hoy, modo: "real" },
      { id: "in_b", colmadoId: negocio.id, estado: "paid", plan: "Colmado", total: "9.99", pagado: "9.99", comision: "0.59", neto: "9.40", creada: hoy, modo: "real" },
      { id: "in_c", colmadoId: negocio.id, estado: "open", plan: "Colmado", total: "9.99", pagado: "0", pendiente: "9.99", creada: hoy, modo: "real" },
      { id: "in_d", colmadoId: negocio.id, estado: "paid", plan: "Full", total: "29.99", pagado: "29.99", creada: hoy, modo: "prueba" },
    ] as any);
    expect((await dueno.request("GET", "/api/admin/ingresos")).status).toBe(403);
    const r = await admin.request("GET", `/api/admin/ingresos?modo=real&mes=${hoy.toISOString().slice(0, 7)}`);
    expect(r.status).toBe(200);
    expect(r.json.totales).toMatchObject({ cobrado: 39.98, comision: 1.76, neto: 38.22, porCobrar: 9.99, pagos: 2 });
    expect(r.json.facturas.length).toBe(3);
    expect(r.json.facturas[0].negocio).toBe("Colmado Vence");
  });
});
