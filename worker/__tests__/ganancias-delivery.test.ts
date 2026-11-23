// @vitest-environment node
// Portal de delivery → Ganancias, pago del período sin duplicados y cierre automático. D1 local en memoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, deliveries, deliveryAdelantos, pagosDelivery, pedidos, saldosDelivery } from "@shared/schema";
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

describe("v2.60: ajustes, envío, propinas, pago y recibo", () => {
  let pagoId = 0;
  let portal: Client;
  it("bonos, descuentos y el faltante de cuadres cambian el total; el faltante queda saldado", async () => {
    [{ id: pagoId }] = await t.db.select({ id: pagosDelivery.id }).from(pagosDelivery).where(eq(pagosDelivery.deliveryId, pedro.id));
    let r = await dueno.request("GET", `/api/pagos-delivery/${pagoId}`);
    expect(r.json.saldoCuadres).toBe(-75);
    r = await dueno.request("POST", `/api/pagos-delivery/${pagoId}/ajustes`, { tipo: "bono", monto: 300, motivo: "Semana sin fallas" });
    expect(Number(r.json.pago.montoTotal)).toBe(2450);
    r = await dueno.request("POST", `/api/pagos-delivery/${pagoId}/ajustes`, { tipo: "cuadre" });
    expect(Number(r.json.pago.montoTotal)).toBe(2375);
    expect(r.json.ajustes.map((a: any) => `${a.tipo}:${Number(a.monto)}`)).toEqual(["bono:300", "cuadre:-75"]);
    expect((await dueno.request("GET", `/api/pagos-delivery/${pagoId}`)).json.saldoCuadres).toBe(0);
    // Quitar el de cuadres vuelve a abrir el faltante.
    const cuadre = r.json.ajustes.find((a: any) => a.tipo === "cuadre");
    r = await dueno.request("DELETE", `/api/pagos-delivery/${pagoId}/ajustes/${cuadre.id}`);
    expect(Number(r.json.pago.montoTotal)).toBe(2450);
    expect((await dueno.request("GET", `/api/pagos-delivery/${pagoId}`)).json.saldoCuadres).toBe(-75);
    await dueno.request("POST", `/api/pagos-delivery/${pagoId}/ajustes`, { tipo: "descuento", monto: 50, motivo: "Uniforme" });
    // Recalcular conserva los ajustes.
    const semana = periodoAnterior("semanal", TZ, new Date());
    const rc = await dueno.request("POST", `/api/deliveries/${pedro.id}/pagos/calcular`, { periodoInicio: semana.inicio.toISOString(), periodoFin: semana.fin.toISOString() });
    expect(rc.json.id).toBe(pagoId);
    expect(Number(rc.json.montoTotal)).toBe(2400);
  });

  it("el envío es del delivery: se suma el costo de envío de sus entregas", async () => {
    expect((await dueno.request("PATCH", `/api/deliveries/${pedro.id}/config-pago`, { envioEsDelDelivery: true })).status).toBe(200);
    await t.db.update(pedidos).set({ costoDeliveryAplicado: "60", tipoEntrega: "delivery" }).where(eq(pedidos.deliveryId, pedro.id));
    const semana = periodoAnterior("semanal", TZ, new Date());
    const rc = await dueno.request("POST", `/api/deliveries/${pedro.id}/pagos/calcular`, { periodoInicio: semana.inicio.toISOString(), periodoFin: semana.fin.toISOString() });
    expect(Number(rc.json.envioCalculado)).toBe(180);
    expect(Number(rc.json.montoTotal)).toBe(2580);
  });

  it("propina de su entrega, marcar pagado con forma, aviso y «Recibí mi pago»", async () => {
    portal = t.client();
    expect((await portal.request("POST", "/api/portal-repartidor/login", { slug: "colmado-ganancias", whatsappNumero: "18095550101", codigoAcceso: "ABC234" }, { "CF-Connecting-IP": "10.0.0.32" })).status).toBe(200);
    const [hoy] = await t.db.select().from(pedidos).where(eq(pedidos.clienteNombre, "Hoy"));
    expect((await portal.request("POST", `/api/portal-repartidor/pedidos/${hoy.id}/propina`, { monto: 100 })).status).toBe(200);
    // No antes de pagar.
    expect((await portal.request("POST", `/api/portal-repartidor/pagos/${pagoId}/recibido`)).status).toBe(409);
    const pagado = await dueno.request("PATCH", `/api/pagos-delivery/${pagoId}/marcar-pagado`, { metodo: "transferencia" });
    expect(pagado.json).toMatchObject({ estado: "pagado", metodoPago: "transferencia" });
    expect((await dueno.request("POST", `/api/pagos-delivery/${pagoId}/ajustes`, { tipo: "bono", monto: 10 })).status).toBe(400);
    expect((await portal.request("POST", `/api/portal-repartidor/pagos/${pagoId}/recibido`)).status).toBe(200);
    const g = await portal.request("GET", "/api/portal-repartidor/ganancias");
    const p = g.json.pagos.find((x: any) => x.id === pagoId);
    expect(p).toMatchObject({ estado: "pagado", metodo: "transferencia", envio: 180, total: 2580 });
    expect(p.recibido).toBeTruthy();
    expect(p.ajustes.map((a: any) => a.tipo)).toEqual(["bono", "descuento"]);
    expect(g.json.hoy.propinas).toBe(100);
    expect(g.json.forma.envio).toBe(true);
  });
});

describe("v2.61: adelantos y mis números", () => {
  let portal: Client;
  beforeAll(async () => {
    portal = t.client();
    expect((await portal.request("POST", "/api/portal-repartidor/login", { slug: "colmado-ganancias", whatsappNumero: "18095550101", codigoAcceso: "ABC234" }, { "CF-Connecting-IP": "10.0.0.33" })).status).toBe(200);
  });

  it("pide hasta la mitad de lo ganado, uno a la vez; el colmado lo aprueba y se descuenta del pago", async () => {
    const g = await portal.request("GET", "/api/portal-repartidor/ganancias");
    const tope = g.json.adelantoDisponible;
    expect(tope).toBe(Math.floor(g.json.periodo.total * 0.5));
    expect((await portal.request("POST", "/api/portal-repartidor/adelantos", { monto: tope + 1 })).status).toBe(409);
    expect((await portal.request("POST", "/api/portal-repartidor/adelantos", { monto: 20 })).status).toBe(400);
    const r = await portal.request("POST", "/api/portal-repartidor/adelantos", { monto: 500, motivo: "Gomas de la moto" });
    expect(r.status).toBe(201);
    expect((await portal.request("POST", "/api/portal-repartidor/adelantos", { monto: 100 })).status).toBe(409);
    const lista = await dueno.request("GET", `/api/colmados/${negocio.id}/adelantos`);
    expect(lista.json.adelantos[0]).toMatchObject({ estado: "pendiente", monto: 500, repartidor: "Pedro Martínez" });
    const ap = await dueno.request("POST", `/api/adelantos/${r.json.id}/aprobar`, { metodo: "efectivo" });
    expect(ap.json.estado).toBe("aprobado");
    expect((await dueno.request("POST", `/api/adelantos/${r.json.id}/rechazar`)).status).toBe(409);
    // El pago del período actual lo descuenta.
    const p = periodoQueContiene("semanal", TZ, new Date());
    const pago = await dueno.request("POST", `/api/deliveries/${pedro.id}/pagos/calcular`, { periodoInicio: p.inicio.toISOString(), periodoFin: p.fin.toISOString() });
    const det = await dueno.request("GET", `/api/pagos-delivery/${pago.json.id}`);
    expect(det.json.ajustes.find((a: any) => a.tipo === "adelanto")).toMatchObject({ monto: "-500.00" });
    const [a] = await t.db.select().from(deliveryAdelantos).where(eq(deliveryAdelantos.id, r.json.id));
    expect(a).toMatchObject({ estado: "descontado", pagoId: pago.json.id });
    // Recalcular no lo descuenta dos veces.
    const otra = await dueno.request("POST", `/api/deliveries/${pedro.id}/pagos/calcular`, { periodoInicio: p.inicio.toISOString(), periodoFin: p.fin.toISOString() });
    expect((await dueno.request("GET", `/api/pagos-delivery/${otra.json.id}`)).json.ajustes.filter((x: any) => x.tipo === "adelanto")).toHaveLength(1);
    // Quitar el ajuste lo deja otra vez aprobado.
    const aj = det.json.ajustes.find((x: any) => x.tipo === "adelanto");
    await dueno.request("DELETE", `/api/pagos-delivery/${pago.json.id}/ajustes/${aj.id}`);
    expect((await t.db.select().from(deliveryAdelantos).where(eq(deliveryAdelantos.id, r.json.id)))[0].estado).toBe("aprobado");
    const g2 = await portal.request("GET", "/api/portal-repartidor/ganancias");
    expect(g2.json.adelantos[0]).toMatchObject({ estado: "aprobado", monto: 500 });
  });

  it("el repartidor cancela uno pendiente; el colmado puede rechazar con motivo", async () => {
    const r = await portal.request("POST", "/api/portal-repartidor/adelantos", { monto: 50 });
    expect(r.status).toBe(201);
    expect((await portal.request("POST", `/api/portal-repartidor/adelantos/${r.json.id}/cancelar`)).status).toBe(200);
    const r2 = await portal.request("POST", "/api/portal-repartidor/adelantos", { monto: 50 });
    const no = await dueno.request("POST", `/api/adelantos/${r2.json.id}/rechazar`, { respuesta: "Esta semana no" });
    expect(no.json).toMatchObject({ estado: "rechazado", respuesta: "Esta semana no" });
  });

  it("mis números: entregas, fallidas, % sin fallar, minutos y por día", async () => {
    await t.db.insert(pedidos).values({ colmadoId: negocio.id, clienteNombre: "Falla", clienteWhatsapp: "8095550000", clienteUbicacion: "Calle", productos: "[]", total: "100", montoPago: "100", estado: "retorno", deliveryId: pedro.id, motivoRetorno: "no_contesta" } as any);
    const ahora = Date.now();
    await t.db.insert(pedidos).values({ colmadoId: negocio.id, clienteNombre: "Rápido", clienteWhatsapp: "8095550000", clienteUbicacion: "Calle", productos: "[]", total: "100", montoPago: "100", estado: "entregado", deliveryId: pedro.id, cocinaListaAt: new Date(ahora - 20 * 60000), fechaEntrega: new Date(ahora) } as any);
    const r = await portal.request("GET", "/api/portal-repartidor/estadisticas");
    expect(r.status).toBe(200);
    expect(r.json.dias30.fallidas).toBe(1);
    expect(r.json.dias30.minutosPromedio).toBe(20);
    expect(r.json.dias30.exito).toBeLessThan(100);
    expect(r.json.porDia).toHaveLength(14);
    expect(r.json.porDia.at(-1).entregas).toBeGreaterThanOrEqual(2);
  });
});
