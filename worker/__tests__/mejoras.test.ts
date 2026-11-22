// @vitest-environment node
// Mejoras de noviembre 2026 (v2.52 en adelante). D1 local en memoria; nada de producción.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, planes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { htmlTicket } from "../../client/src/lib/ticket";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let admin: Client, dueno: Client;
let negocio: typeof colmados.$inferSelect;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Mejoras", slug: "colmado-mejoras", whatsappNumero: "18094440009", direccion: "Calle 9", planId: 1 }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "mejoras@delywa.test", password: "mejoras-clave-1", firstName: "Meli", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  await createUser(t.db, { idPrefix: "admin", email: "salud@delywa.test", password: "salud-clave-12", firstName: "S", role: "platform_admin" });
  admin = await login("salud@delywa.test", "salud-clave-12");
  dueno = await login("mejoras@delywa.test", "mejoras-clave-1");
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("plan de prueba de 1 mes", () => {
  it("la migración 0024 deja el Trial en 30 días", async () => {
    const [trial] = await t.db.select().from(planes).where(eq(planes.esTrial, true));
    expect(trial.duracionDias).toBe(30);
    expect(trial.descripcionCorta).toBe("Prueba gratis por 1 mes");
  });
});

describe("Plataforma → Salud", () => {
  it("solo la plataforma la ve, con negocios, pedidos, errores e IA", async () => {
    const r = await admin.request("GET", "/api/admin/salud");
    expect(r.status).toBe(200);
    expect(r.json.negocios.activo).toBeGreaterThanOrEqual(1);
    expect(r.json.sinPedidos14d.map((s: any) => s.nombre)).toContain("Colmado Mejoras");
    expect(r.json).toHaveProperty("ia.cupo");
    expect(Array.isArray(r.json.avisos)).toBe(true);
    expect((await dueno.request("GET", "/api/admin/salud")).status).toBe(403);
  });
});

describe("ticket para imprimir", () => {
  it("arma el ticket con totales, devuelta y el ancho del papel; escapa el texto", () => {
    const html = htmlTicket({
      negocio: { nombre: "Colmado <El Sol>" }, titulo: "Pedido #7", fecha: new Date("2026-11-22T15:00:00Z"),
      lineas: [{ nombre: "Arroz", cantidad: 2, precio: 45 }], delivery: 50, total: 140, pago: { metodo: "efectivo", recibido: 200, devuelta: 60 },
    }, 58);
    expect(html).toContain("size: 58mm auto");
    expect(html).toContain("Colmado &lt;El Sol&gt;");
    expect(html).toContain("RD$140.00");
    expect(html).toContain("Devuelta");
    expect(html).toContain("RD$60.00");
  });
});
