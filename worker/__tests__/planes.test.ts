// @vitest-environment node
// v2.62 · Planes por funciones: Gratis (todo, 14 días), Colmado (US$9.99) y Full (US$29.99). D1 local en memoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, deliveries, planes } from "@shared/schema";
import { CLAVES_FUNCIONES, precioPlan } from "@shared/funciones-plan";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { planDe, tieneFuncion } from "../lib/plan";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, admin: Client;
let negocio: typeof colmados.$inferSelect, sucursal: typeof colmados.$inferSelect;
let idColmado = 0, idFull = 0, idTrial = 0;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  const todos = await t.db.select().from(planes);
  idTrial = todos.find((p) => p.slug === "trial")!.id;
  idColmado = todos.find((p) => p.slug === "basico")!.id;
  idFull = todos.find((p) => p.slug === "profesional")!.id;
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Plan", slug: "colmado-plan", whatsappNumero: "18094550001", direccion: "Calle 1", planId: idColmado }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Plan Norte", slug: "plan-norte", whatsappNumero: "18094550002", direccion: "Calle 2", planId: idTrial, negocioPrincipalId: negocio.id }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "plan@delywa.test", password: "plan-clave-123", firstName: "Pepe", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  await createUser(t.db, { idPrefix: "admin", email: "plataforma@delywa.test", password: "plataforma-clave-1", firstName: "Ana", role: "platform_admin" });
  dueno = await login("plan@delywa.test", "plan-clave-123");
  admin = await login("plataforma@delywa.test", "plataforma-clave-1");
  await t.db.insert(deliveries).values({ colmadoId: negocio.id, nombre: "Lalo Plan", whatsappNumero: "18095550301", estado: "disponible", codigoAcceso: "PLN234" });
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("los tres planes", () => {
  it("quedan en dólares, con sus funciones, límites y precio anual con 1 mes gratis", async () => {
    const [trial, colmado, full] = await Promise.all([idTrial, idColmado, idFull].map(async (id) => (await t.db.select().from(planes).where(eq(planes.id, id)))[0]));
    expect([trial.nombre, trial.duracionDias, trial.esTrial, trial.moneda]).toEqual(["Gratis", 14, true, "USD"]);
    expect([colmado.nombre, colmado.precioMensual, colmado.precioAnual, colmado.limiteDeliveries, colmado.limitePedidosDiarios]).toEqual(["Colmado", "9.99", "109.89", 2, 100]);
    expect(colmado.funciones).toEqual(["ia", "mostrador", "fiado"]);
    expect([full.nombre, full.precioMensual, full.precioAnual, full.limiteDeliveries, full.soportePrioritario]).toEqual(["Full", "29.99", "329.89", null, true]);
    expect(full.funciones).toEqual(CLAVES_FUNCIONES);
    expect(precioPlan(full.precioMensual, full.moneda)).toBe("US$29.99");
    expect(precioPlan("0")).toBe("US$0");
  });

  it("la página pública no ve los datos de Stripe", async () => {
    const r = await t.client().request("GET", "/api/planes?activos=true");
    expect(r.status).toBe(200);
    expect(r.json.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(r.json[0])).not.toContain("stripePrecio");
  });

  it("la plataforma solo guarda funciones que existen y el anual vacío queda sin anual", async () => {
    const [p] = await t.db.insert(planes).values({ nombre: "Raro", slug: "raro", precioMensual: "5", duracionDias: 30 }).returning();
    const r = await admin.request("PATCH", `/api/planes/${p.id}`, { funciones: ["fiado", "inventada", "ia"], precioAnual: "" });
    expect(r.status).toBe(200);
    expect(r.json.funciones).toEqual(["fiado", "ia"]);
    expect(r.json.precioAnual).toBeNull();
  });
});

describe("plan vigente", () => {
  it("la prueba lo trae todo; la sucursal usa el plan de su negocio principal", async () => {
    const [enPrueba] = await t.db.insert(colmados).values({ nombre: "En prueba", slug: "en-prueba", whatsappNumero: "18094550003", direccion: "C3", planId: idTrial }).returning();
    expect((await planDe(t.db, enPrueba.id))!.todo).toBe(true);
    const p = await planDe(t.db, sucursal.id);
    expect(p!.nombre).toBe("Colmado");
    expect(await tieneFuncion(t.db, sucursal.id, "compras")).toBe(false);
  });

  it("cortesía lo incluye todo", async () => {
    const [c] = await t.db.insert(colmados).values({ nombre: "Regalo", slug: "regalo", whatsappNumero: "18094550004", direccion: "C4", planId: idColmado, cortesia: true }).returning();
    const p = await planDe(t.db, c.id);
    expect([p!.nombre, p!.todo]).toEqual(["Cortesía", true]);
    expect(await tieneFuncion(t.db, c.id, "empleados")).toBe(true);
  });

  it("«Mi plan» trae lo que puede usar y los planes que se muestran", async () => {
    const r = await dueno.request("GET", `/api/colmados/${negocio.id}/suscripcion`);
    expect(r.status).toBe(200);
    expect(r.json.vigente.nombre).toBe("Colmado");
    expect(r.json.vigente.funciones).toEqual(["ia", "mostrador", "fiado"]);
    expect(r.json.planes.map((p: { nombre: string }) => p.nombre)).toEqual(expect.arrayContaining(["Gratis", "Colmado", "Full"]));
    expect(Object.keys(r.json.plan)).not.toContain("stripeProducto");
  });
});

describe("con el plan Colmado", () => {
  it("usa fiado y mostrador", async () => {
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/fiado`)).status).toBe(200);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/mostrador/hoy`)).status).toBe(200);
  });

  it("compras, ofertas, empleados, facturación y nómina del delivery dicen que están en Full", async () => {
    for (const ruta of [`/api/colmados/${negocio.id}/compras`, `/api/colmados/${negocio.id}/suplidores`, `/api/colmados/${negocio.id}/ofertas`,
      `/api/colmados/${negocio.id}/facturacion-electronica`, `/api/colmados/${negocio.id}/adelantos`, "/api/negocio/empleados"]) {
      const r = await dueno.request("GET", ruta);
      expect(r.status, ruta).toBe(403);
      expect(r.json.planSugerido, ruta).toBe("Full");
      expect(r.json.error, ruta).toMatch(/Tu plan Colmado no incluye/);
    }
  });

  it("el portal del repartidor no muestra Ganancias", async () => {
    const portal = t.client();
    expect((await portal.request("POST", "/api/portal-repartidor/login", { slug: "colmado-plan", whatsappNumero: "18095550301", codigoAcceso: "PLN234" }, { "CF-Connecting-IP": "10.0.0.61" })).status).toBe(200);
    expect((await portal.request("GET", "/api/portal-repartidor/me")).json.ganancias).toBe(false);
    expect((await portal.request("GET", "/api/portal-repartidor/ganancias")).status).toBe(403);
    expect((await portal.request("GET", "/api/portal-repartidor/estadisticas")).status).toBe(403);
  });

  it("al pasar a Full se abre todo", async () => {
    await t.db.update(colmados).set({ planId: idFull }).where(eq(colmados.id, negocio.id));
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/compras`)).status).toBe(200);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/ofertas`)).status).toBe(200);
    expect((await dueno.request("GET", "/api/negocio/empleados")).status).toBe(200);
    await t.db.update(colmados).set({ planId: idColmado }).where(eq(colmados.id, negocio.id));
  });

  it("un plan sin fiado no deja vender fiado en el mostrador", async () => {
    const [sinFiado] = await t.db.insert(planes).values({ nombre: "Mínimo", slug: "minimo", precioMensual: "1", duracionDias: 30, funciones: ["mostrador"] }).returning();
    await t.db.update(colmados).set({ planId: sinFiado.id }).where(eq(colmados.id, negocio.id));
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "fiado", clienteId: 1, items: [{ nombre: "Pan", cantidad: 1, precio: 10 }] });
    expect(r.status).toBe(403);
    expect(r.json.planFalta).toBe("fiado");
    await t.db.update(colmados).set({ planId: idColmado }).where(eq(colmados.id, negocio.id));
  });
});
