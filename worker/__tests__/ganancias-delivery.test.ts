// @vitest-environment node
// Portal de delivery → Ganancias, pago del período sin duplicados y cierre automático. D1 local en memoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, deliveries, pagosDelivery, pedidos, saldosDelivery } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { cerrarPeriodosVencidos, periodoAnterior, periodoQueContiene } from "../lib/ganancias-delivery";

const TZ = "America/Santo_Domingo";
let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client;
let negocio: typeof colmados.$inferSelect;
let pedro: typeof deliveries.$inferSelect;

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Ganancias", slug: "colmado-ganancias", whatsappNumero: "18094440020", direccion: "Calle 20", planId: 1, horaApertura: "00:00", horaCierre: "23:59" }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "ganancias@delywa.test", password: "ganancias-clave-1", firstName: "Gina", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  dueno = t.client();
  expect((await dueno.request("POST", "/api/auth/login", { username: "ganancias@delywa.test", password: "ganancias-clave-1" })).status).toBe(200);
  [pedro] = await t.db.insert(deliveries).values({
    colmadoId: negocio.id, nombre: "Pedro Martínez", whatsappNumero: "18095550101", estado: "disponible", codigoAcceso: "ABC234",
    modeloPago: "mixto", salarioMonto: "2000", comisionFija: "50", comisionPorcentaje: "0", periodoPago: "semanal", fechaRegistro: new Date("2026-10-01T12:00:00Z"),
  }).returning();
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("períodos de pago (hora de RD)", () => {
  it("semanal de lunes a domingo, quincenal 1–15 / 16–fin y mensual", () => {
    const jueves = new Date("2026-11-19T15:00:00Z");
    const s = periodoQueContiene("semanal", TZ, jueves);
    expect([s.desde, s.hasta]).toEqual(["2026-11-16", "2026-11-22"]);
    expect(s.inicio.toISOString()).toBe("2026-11-16T04:00:00.000Z");
    expect(s.fin.toISOString()).toBe("2026-11-23T03:59:59.999Z");
    expect([periodoQueContiene("quincenal", TZ, jueves).desde, periodoQueContiene("quincenal", TZ, jueves).hasta]).toEqual(["2026-11-16", "2026-11-30"]);
    expect(periodoQueContiene("quincenal", TZ, new Date("2026-11-05T15:00:00Z")).hasta).toBe("2026-11-15");
    expect([periodoQueContiene("mensual", TZ, jueves).desde, periodoQueContiene("mensual", TZ, jueves).hasta]).toEqual(["2026-11-01", "2026-11-30"]);
    // Domingo 11 p. m. en RD (lunes 3 a. m. UTC) sigue siendo la misma semana.
    expect(periodoQueContiene("semanal", TZ, new Date("2026-11-23T03:00:00Z")).desde).toBe("2026-11-16");
    expect(periodoAnterior("semanal", TZ, jueves).desde).toBe("2026-11-09");
  });
});

describe("pago del período", () => {
  it("calcular dos veces el mismo período no duplica el pago", async () => {
    const semana = periodoAnterior("semanal", TZ, new Date());
    await t.db.insert(pedidos).values([1, 2, 3].map((i) => ({
      colmadoId: negocio.id, clienteNombre: `C${i}`, clienteWhatsapp: "8095550000", clienteUbicacion: "Calle", productos: "[]", total: "500", montoPago: "500",
      estado: "entregado", deliveryId: pedro.id, fechaEntrega: new Date(semana.inicio.getTime() + i * 3600_000),
    })) as any);
    const cuerpo = { periodoInicio: semana.inicio.toISOString(), periodoFin: semana.fin.toISOString() };
    const a = await dueno.request("POST", `/api/deliveries/${pedro.id}/pagos/calcular`, cuerpo);
    const b = await dueno.request("POST", `/api/deliveries/${pedro.id}/pagos/calcular`, cuerpo);
    expect(a.json.id).toBe(b.json.id);
    expect(Number(b.json.montoTotal)).toBe(2150); // 2000 de salario + 3 × 50
    expect(await t.db.select().from(pagosDelivery).where(eq(pagosDelivery.deliveryId, pedro.id))).toHaveLength(1);
    // El cron no crea otro para el período que ya tiene pago.
    expect(await cerrarPeriodosVencidos(t.db, async () => TZ)).toBe(0);
  });

  it("el cron deja pendiente el pago del período que terminó, una sola vez", async () => {
    await t.db.delete(pagosDelivery);
    expect(await cerrarPeriodosVencidos(t.db, async () => TZ)).toBe(1);
    expect(await cerrarPeriodosVencidos(t.db, async () => TZ)).toBe(0);
    const [p] = await t.db.select().from(pagosDelivery).where(eq(pagosDelivery.deliveryId, pedro.id));
    expect(p).toMatchObject({ estado: "pendiente", totalPedidos: 3 });
  });
});

describe("portal → Ganancias", () => {
  it("el repartidor ve lo que gana, sus pagos y lo que debe; nunca las ventas", async () => {
    const hoy = new Date();
    await t.db.insert(pedidos).values({ colmadoId: negocio.id, clienteNombre: "Hoy", clienteWhatsapp: "8095550000", clienteUbicacion: "Calle", productos: "[]", total: "1000", montoPago: "1000", estado: "entregado", deliveryId: pedro.id, fechaEntrega: hoy } as any);
    await t.db.insert(saldosDelivery).values({ deliveryId: pedro.id, colmadoId: negocio.id, saldoPendiente: "-75", estado: "pendiente" });
    const portal = t.client();
    expect((await portal.request("POST", "/api/portal-repartidor/login", { slug: "colmado-ganancias", whatsappNumero: "18095550101", codigoAcceso: "ABC234" }, { "CF-Connecting-IP": "10.0.0.31" })).status).toBe(200);
    const r = await portal.request("GET", "/api/portal-repartidor/ganancias");
    expect(r.status).toBe(200);
    expect(r.json.hoy).toMatchObject({ entregas: 1, comision: 50, total: 50 });
    expect(r.json.periodo).toMatchObject({ salario: 2000, tipo: "semanal" });
    expect(r.json.periodo.total).toBeGreaterThanOrEqual(2050);
    expect(r.json.pagos[0]).toMatchObject({ estado: "pendiente", entregas: 3, total: 2150 });
    expect(r.json.saldoCuadres).toBe(-75);
    expect(r.json.forma).toMatchObject({ modelo: "mixto", salario: 2000, porEntrega: 50 });
    expect(JSON.stringify(r.json)).not.toMatch(/ventas/i);
    // Sin sesión del portal no hay nada.
    expect((await t.client().request("GET", "/api/portal-repartidor/ganancias")).status).toBe(401);
  });
});
