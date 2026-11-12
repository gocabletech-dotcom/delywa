// @vitest-environment node
// Pruebas con D1 local en memoria y datos inventados: nunca tocan la base real.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, cuadres, deliveries, paradasRuta, pedidos, planes, rutas, saldosDelivery, users } from "@shared/schema";

vi.mock("../lib/routeOptimizer", async (original) => ({
  ...(await original<typeof import("../lib/routeOptimizer")>()),
  geocodificarDireccion: vi.fn(async () => ({ lat: 18.47, lon: -69.9 })),
}));

import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { sesionPortalVencida, turnoTerminadoHoy, ventanaDeGracia, generarCodigoAcceso } from "../lib/turno-repartidor";
import { claveAgrupacion } from "../lib/fechas";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, operador: Client, ajeno: Client, anon: Client, pendiente: Client;
let negocio: any, otro: any;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

/** Pedido de prueba ya listo en cocina, pagado en efectivo. */
async function pedidoListo(extra: Partial<typeof pedidos.$inferInsert> = {}) {
  const [p] = await t.db.insert(pedidos).values({
    colmadoId: negocio.id, clienteNombre: "Cliente Prueba", clienteWhatsapp: "18095550199", clienteUbicacion: "Calle Falsa 123, Santo Domingo",
    productos: JSON.stringify([{ nombre: "Pan", cantidad: 2, monto: 100 }]), total: "150", totalConfirmado: "150",
    montoPago: "200", metodoPago: "efectivo", estado: "listo", tipoEntrega: "delivery", ...extra,
  }).returning();
  return p;
}

const portalLogin = (c: Client, numero: string, codigo: string) =>
  c.request("POST", "/api/portal-repartidor/login", { slug: "colmado-prueba", whatsappNumero: numero, codigoAcceso: codigo }, { "CF-Connecting-IP": "10.0.0.9" });

beforeAll(async () => {
  t = await createTestApp();
  const [basico] = await t.db.select().from(planes).where(eq(planes.slug, "basico"));
  [negocio] = await t.db.insert(colmados).values({
    nombre: "Colmado Prueba", slug: "colmado-prueba", whatsappNumero: "18093330001", direccion: "Av. Prueba 1", planId: basico.id,
    latitud: "18.48", longitud: "-69.93", horaApertura: "00:00", horaCierre: "23:59",
  }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro", slug: "otro-prueba", whatsappNumero: "18093330002", direccion: "X", planId: basico.id }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  const op = await createUser(t.db, { idPrefix: "staff", email: "op@delywa.test", password: "op123456", firstName: "Omar", role: "operador_sucursal", colmadoId: negocio.id });
  await setUserSucursalIds(t.db, op.id, [negocio.id]);
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@delywa.test", password: "ajeno123", firstName: "Abel", role: "colmado_owner", colmadoId: otro.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otro.id));
  await createUser(t.db, { idPrefix: "staff", email: "nuevo@delywa.test", password: "nuevo123", firstName: "Nora", role: "pending" });
  dueno = await login("dueno@delywa.test", "dueno1234");
  operador = await login("op@delywa.test", "op123456");
  ajeno = await login("ajeno@delywa.test", "ajeno123");
  pendiente = await login("nuevo@delywa.test", "nuevo123");
  anon = t.client();
}, 60_000);
afterAll(async () => { await t?.dispose(); });

let repartidor: any, segundo: any;

describe("alta y administración de repartidores", () => {
  it("crea el repartidor con su usuario y respeta el límite del plan", async () => {
    expect((await ajeno.request("POST", `/api/colmados/${negocio.id}/deliveries/user`, { nombre: "X", whatsappNumero: "1809" })).status).toBe(403);
    expect((await operador.request("POST", `/api/colmados/${negocio.id}/deliveries/user`, { nombre: "X", whatsappNumero: "1809" })).status).toBe(403);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/deliveries/user`, { nombre: "", whatsappNumero: "1809" })).status).toBe(400);

    const res = await dueno.request("POST", `/api/colmados/${negocio.id}/deliveries/user`, { nombre: "Rafa", whatsappNumero: "+1 809-444-0001" });
    expect(res.status).toBe(201);
    repartidor = res.json.delivery;
    expect(repartidor).toMatchObject({ nombre: "Rafa", estado: "activo", colmadoId: negocio.id });
    expect(repartidor.codigoAcceso).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    const [u] = await t.db.select().from(users).where(eq(users.deliveryId, repartidor.id));
    expect(u).toMatchObject({ role: "delivery", colmadoId: negocio.id, password: null });

    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/deliveries/user`, { nombre: "Dup", whatsappNumero: "18094440001" })).status).toBe(409);
    segundo = (await dueno.request("POST", "/api/deliveries", { colmadoId: negocio.id, nombre: "Sara", whatsappNumero: "18094440002" })).json;
    const lleno = await dueno.request("POST", "/api/deliveries", { colmadoId: negocio.id, nombre: "Tercero", whatsappNumero: "18094440003" });
    expect(lleno.status).toBe(403);
    expect(lleno.json.code).toBe("PLAN_LIMIT_EXCEEDED");
  });

  it("solo los administradores del negocio ven el código de acceso", async () => {
    expect((await ajeno.request("GET", `/api/colmados/${negocio.id}/deliveries`)).status).toBe(403);
    const op = await operador.request("GET", `/api/colmados/${negocio.id}/deliveries`);
    expect(op.json).toHaveLength(2);
    expect(op.json[0].codigoAcceso).toBeUndefined();
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/deliveries`)).json[0].codigoAcceso).toBe(repartidor.codigoAcceso);
  });

  it("regenera el código y valida la configuración de pago", async () => {
    expect((await ajeno.request("POST", `/api/deliveries/${segundo.id}/generar-codigo`)).status).toBe(403);
    const nuevo = await dueno.request("POST", `/api/deliveries/${segundo.id}/generar-codigo`);
    expect(nuevo.json.codigoAcceso).toMatch(/^[A-Z2-9]{6}$/);
    segundo.codigoAcceso = nuevo.json.codigoAcceso;

    expect((await dueno.request("PATCH", `/api/deliveries/${repartidor.id}/config-pago`, { modeloPago: "regalo" })).status).toBe(400);
    expect((await dueno.request("PATCH", `/api/deliveries/${repartidor.id}/config-pago`, { comisionPorcentaje: 150 })).status).toBe(400);
    const ok = await dueno.request("PATCH", `/api/deliveries/${repartidor.id}/config-pago`, { modeloPago: "mixto", salarioMonto: 1000, comisionFija: "25", comisionPorcentaje: 10 });
    expect(ok.json).toMatchObject({ modeloPago: "mixto", salarioMonto: "1000.00", comisionFija: "25.00", comisionPorcentaje: "10.00" });
  });

  it("el límite de activos aplica al reactivar", async () => {
    await dueno.request("PATCH", `/api/deliveries/${segundo.id}/estado`, { estado: "en_descanso" });
    expect((await dueno.request("PATCH", `/api/deliveries/${segundo.id}/estado`, { estado: "volando" })).status).toBe(400);
    expect((await ajeno.request("PATCH", `/api/deliveries/${segundo.id}/estado`, { estado: "inactivo" })).status).toBe(403);
    expect((await dueno.request("PATCH", `/api/deliveries/${segundo.id}/estado`, { estado: "activo" })).status).toBe(200);
  });
});

describe("portal del repartidor", () => {
  let portal: Client;

  it("rechaza credenciales malas y limita los intentos", async () => {
    const intruso = t.client();
    expect((await portalLogin(intruso, "18094440002", "ZZZZZZ")).status).toBe(401);
    for (let i = 0; i < 4; i++) await portalLogin(intruso, "18094440002", "ZZZZZZ");
    const bloqueado = await portalLogin(intruso, "18094440002", segundo.codigoAcceso);
    expect(bloqueado.status).toBe(429);
    expect(Number(bloqueado.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("entra con número y código, sin importar formato ni mayúsculas", async () => {
    portal = t.client();
    const res = await portalLogin(portal, "(809) 444-0001".replace("(809)", "1809"), repartidor.codigoAcceso.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.json.delivery).toMatchObject({ id: repartidor.id, nombre: "Rafa" });
    const me = await portal.request("GET", "/api/portal-repartidor/me");
    expect(me.json.colmado).toMatchObject({ id: negocio.id, simboloMoneda: "RD$" });
    expect(me.json.delivery.codigoAcceso).toBeUndefined();
    expect((await anon.request("GET", "/api/portal-repartidor/me")).status).toBe(401);
  });

  it("la ubicación solo la envía el propio repartidor con sesión", async () => {
    expect((await anon.request("POST", `/api/deliveries/${repartidor.id}/ubicacion`, { latitud: 18.5, longitud: -69.9 })).status).toBe(401);
    expect((await portal.request("POST", `/api/deliveries/${segundo.id}/ubicacion`, { latitud: 18.5, longitud: -69.9 })).status).toBe(403);
    expect((await portal.request("POST", `/api/deliveries/${repartidor.id}/ubicacion`, { latitud: 200, longitud: -69.9 })).status).toBe(400);
    expect((await portal.request("POST", `/api/deliveries/${repartidor.id}/ubicacion`, { latitud: 18.5, longitud: -69.9 })).status).toBe(200);
    const flota = await operador.request("GET", `/api/colmados/${negocio.id}/deliveries/ubicaciones`);
    const fila = flota.json.find((d: any) => d.id === repartidor.id);
    expect(fila).toMatchObject({ ultimaLatitud: "18.5000000", ultimaLongitud: "-69.9000000" });
    expect(fila.codigoAcceso).toBeUndefined();
  });

  let pedido: any;

  it("asigna un pedido listo del mismo negocio y deja el aviso para enviar a mano", async () => {
    const enCocina = await pedidoListo({ estado: "en_preparacion" });
    expect((await operador.request("PATCH", `/api/pedidos/${enCocina.id}/asignar`, { deliveryId: repartidor.id })).json.reason).toBe("pedido_no_listo");
    pedido = await pedidoListo();
    const [ajenoRep] = await t.db.insert(deliveries).values({ colmadoId: otro.id, nombre: "Ajeno", whatsappNumero: "18097770000" }).returning();
    expect((await operador.request("PATCH", `/api/pedidos/${pedido.id}/asignar`, { deliveryId: ajenoRep.id })).status).toBe(404);
    expect((await ajeno.request("PATCH", `/api/pedidos/${pedido.id}/asignar`, { deliveryId: repartidor.id })).status).toBe(403);

    const res = await operador.request("PATCH", `/api/pedidos/${pedido.id}/asignar`, { deliveryId: repartidor.id });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, necesitaEnvioManual: true, whatsappNumero: "+1 809-444-0001" });
    expect(res.json.mensajeParaEnviar).toContain(`pedido #${pedido.id}`);
    expect(res.json.mensajeParaEnviar).toContain("• Pan (RD$100)");
    expect(res.json.mensajeParaEnviar).toContain("Devuelta: RD$50");

    const reenvio = await operador.request("POST", `/api/pedidos/${pedido.id}/reenviar-delivery`);
    expect(reenvio.json.enlaceWhatsApp).toMatch(/^https:\/\/wa\.me\/18094440001\?text=/);
  });

  it("el repartidor mueve sus pedidos, no los ajenos, y no reabre uno cerrado", async () => {
    const lista = await portal.request("GET", "/api/portal-repartidor/pedidos");
    expect(lista.json.map((p: any) => p.id)).toContain(pedido.id);
    const otroPedido = await pedidoListo();
    expect((await portal.request("PATCH", `/api/portal-repartidor/pedidos/${otroPedido.id}/estado`, { estado: "en_camino" })).status).toBe(403);
    expect((await portal.request("PATCH", `/api/portal-repartidor/pedidos/${pedido.id}/estado`, { estado: "listo" })).status).toBe(400);

    expect((await portal.request("PATCH", `/api/portal-repartidor/pedidos/${pedido.id}/estado`, { estado: "en_camino" })).status).toBe(200);
    expect((await portal.request("PATCH", `/api/portal-repartidor/pedidos/${pedido.id}/estado`, { estado: "entregado" })).status).toBe(200);
    const [fila] = await t.db.select().from(pedidos).where(eq(pedidos.id, pedido.id));
    expect(fila.estado).toBe("entregado");
    expect(fila.fechaEntrega).toBeInstanceOf(Date);
    expect((await portal.request("PATCH", `/api/portal-repartidor/pedidos/${pedido.id}/estado`, { estado: "cancelado" })).json.reason).toBe("pedido_cerrado");
  });

  let cuadreId: number;

  it("cuadra el efectivo una sola vez y bloquea nuevas asignaciones hasta confirmarlo", async () => {
    // Retorno en que el negocio le dio 40 de vuelto: el repartidor debe devolverlos.
    const retorno = await pedidoListo({ estado: "retorno", deliveryId: repartidor.id, vueltoEntregado: "40" });
    const sinCuadre = await portal.request("GET", "/api/portal-repartidor/pedidos-sin-cuadre");
    expect(sinCuadre.json.map((p: any) => p.id).sort()).toEqual([pedido.id, retorno.id].sort());

    expect((await portal.request("POST", "/api/portal-repartidor/cuadre", { pedidoIds: [] })).status).toBe(400);
    const ajenoPedido = await pedidoListo({ estado: "entregado" });
    expect((await portal.request("POST", "/api/portal-repartidor/cuadre", { pedidoIds: [ajenoPedido.id] })).status).toBe(400);

    const res = await portal.request("POST", "/api/portal-repartidor/cuadre", { pedidoIds: [pedido.id, retorno.id], notasRepartidor: "Todo bien" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ estado: "pendiente", totalEfectivoCobrado: "150.00", totalVueltoRetornado: "40.00", netoAEntregar: "190.00", pedidosIds: [pedido.id, retorno.id] });
    cuadreId = res.json.id;
    expect((await portal.request("POST", "/api/portal-repartidor/cuadre", { pedidoIds: [pedido.id] })).json.error).toContain("ya fue incluido");
    expect((await portal.request("GET", "/api/portal-repartidor/cuadres?limit=1")).json).toMatchObject({ total: 1, limit: 1 });

    const nuevo = await pedidoListo();
    expect((await operador.request("PATCH", `/api/pedidos/${nuevo.id}/asignar`, { deliveryId: repartidor.id })).json.reason).toBe("cuadre_pendiente");
  });

  it("al confirmar con faltante queda un saldo pendiente; solo se confirma una vez", async () => {
    expect((await operador.request("PATCH", `/api/colmados/${negocio.id}/cuadres/${cuadreId}/confirmar`, { montoRecibido: 150 })).status).toBe(403);
    expect((await ajeno.request("GET", `/api/colmados/${negocio.id}/cuadres`)).status).toBe(403);
    const lista = await dueno.request("GET", `/api/colmados/${negocio.id}/cuadres?estado=pendiente`);
    expect(lista.json[0]).toMatchObject({ id: cuadreId, repartidorNombre: "Rafa" });
    expect((await dueno.request("PATCH", `/api/colmados/${negocio.id}/cuadres/${cuadreId}/confirmar`, { montoRecibido: -1 })).status).toBe(400);

    const ok = await dueno.request("PATCH", `/api/colmados/${negocio.id}/cuadres/${cuadreId}/confirmar`, { montoRecibido: 150, notasNegocio: "Faltan 40" });
    expect(ok.json).toMatchObject({ estado: "confirmado", montoRecibido: "150.00", diferencia: "-40.00", notasNegocio: "Faltan 40" });
    expect((await dueno.request("PATCH", `/api/colmados/${negocio.id}/cuadres/${cuadreId}/confirmar`, { montoRecibido: 150 })).status).toBe(400);

    const saldos = await dueno.request("GET", `/api/colmados/${negocio.id}/saldos-delivery`);
    expect(saldos.json).toHaveLength(1);
    expect(saldos.json[0]).toMatchObject({ saldoPendiente: "-40.00", estado: "pendiente", deliveryNombre: "Rafa" });
  });

  it("un segundo faltante se suma al mismo saldo abierto", async () => {
    const p2 = await pedidoListo({ estado: "entregado", deliveryId: repartidor.id, total: "100", totalConfirmado: "100", fechaEntrega: new Date() });
    const c2 = await portal.request("POST", "/api/portal-repartidor/cuadre", { pedidoIds: [p2.id] });
    await dueno.request("PATCH", `/api/colmados/${negocio.id}/cuadres/${c2.json.id}/confirmar`, { montoRecibido: 90 });
    const filas = await t.db.select().from(saldosDelivery).where(eq(saldosDelivery.deliveryId, repartidor.id));
    expect(filas).toHaveLength(1);
    expect(filas[0].saldoPendiente).toBe("-50.00");
  });

  it("no se borra a un repartidor con saldo pendiente; al saldarlo sí", async () => {
    const borrar = await dueno.request("DELETE", `/api/deliveries/${repartidor.id}`);
    expect(borrar.status).toBe(409);
    expect(borrar.json.reason).toBe("pendientes_de_cuadre");
    const [saldo] = await t.db.select().from(saldosDelivery).where(eq(saldosDelivery.deliveryId, repartidor.id));
    expect((await ajeno.request("PATCH", `/api/saldos-delivery/${saldo.id}/saldar`)).status).toBe(403);
    expect((await dueno.request("PATCH", `/api/saldos-delivery/${saldo.id}/saldar`)).json.estado).toBe("saldado");
  });

  it("optimiza la ruta del propio repartidor y completa la ruta al marcar todas las paradas", async () => {
    const a = await pedidoListo({ estado: "en_camino", deliveryId: repartidor.id, clienteLatitud: "18.49", clienteLongitud: "-69.95" });
    const b = await pedidoListo({ estado: "en_camino", deliveryId: repartidor.id, clienteUbicacion: "Casa 18.50,-69.96" });
    expect((await portal.request("POST", `/api/deliveries/${segundo.id}/rutas/optimizar`, { pedidosIds: [a.id] })).status).toBe(403);
    const res = await portal.request("POST", `/api/deliveries/${repartidor.id}/rutas/optimizar`, { pedidosIds: [a.id, b.id] });
    expect(res.status).toBe(200);
    expect(res.json.paradas).toHaveLength(2);
    expect(res.json.ruta.estado).toBe("en_progreso");

    // Una segunda optimización cancela la anterior.
    const otra = await portal.request("POST", `/api/deliveries/${repartidor.id}/rutas/optimizar`, { pedidosIds: [a.id, b.id] });
    const [vieja] = await t.db.select().from(rutas).where(eq(rutas.id, res.json.ruta.id));
    expect(vieja.estado).toBe("cancelada");
    const activa = await portal.request("GET", `/api/deliveries/${repartidor.id}/rutas/activa`);
    expect(activa.json.ruta.id).toBe(otra.json.ruta.id);

    const [p1, p2] = activa.json.paradas;
    expect((await anon.request("PATCH", `/api/paradas-ruta/${p1.id}/estado`, { estado: "entregado" })).status).toBe(401);
    await portal.request("PATCH", `/api/paradas-ruta/${p1.id}/estado`, { estado: "entregado" });
    const ultima = await portal.request("PATCH", `/api/paradas-ruta/${p2.id}/estado`, { estado: "no_entregado", motivo: "No estaba" });
    expect(ultima.json).toMatchObject({ estado: "no_entregado", motivoNoEntregado: "No estaba" });
    const [completa] = await t.db.select().from(rutas).where(eq(rutas.id, otra.json.ruta.id));
    expect(completa.estado).toBe("completada");
    expect(await t.db.select().from(paradasRuta).where(eq(paradasRuta.rutaId, otra.json.ruta.id))).toHaveLength(2);
  });

  it("al ponerse en descanso puede volver a entrar; si el dueño lo deshabilita, no", async () => {
    await portal.request("POST", "/api/portal-repartidor/desactivar");
    const [fila] = await t.db.select().from(deliveries).where(eq(deliveries.id, repartidor.id));
    expect(fila.estado).toBe("en_descanso");
    expect((await portal.request("GET", "/api/portal-repartidor/me")).status).toBe(200);
    expect((await portal.request("POST", "/api/portal-repartidor/activar")).json.delivery.estado).toBe("activo");

    await dueno.request("PATCH", `/api/deliveries/${repartidor.id}/estado`, { estado: "inactivo" });
    expect((await portal.request("GET", "/api/portal-repartidor/me")).json.reason).toBe("account_disabled");
    expect((await portal.request("GET", "/api/portal-repartidor/me")).status).toBe(401);
    expect((await portalLogin(t.client(), "18094440001", repartidor.codigoAcceso)).json.reason).toBe("account_disabled");
    const nuevo = await pedidoListo();
    expect((await operador.request("PATCH", `/api/pedidos/${nuevo.id}/asignar`, { deliveryId: repartidor.id })).json.reason).toBe("delivery_deshabilitado");
  });
});

describe("nómina y reportes", () => {
  it("calcula el pago con salario y comisión, y protege el historial", async () => {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const hasta = new Date(Date.now() + 60 * 1000).toISOString();
    const res = await dueno.request("POST", `/api/deliveries/${repartidor.id}/pagos/calcular`, { periodoInicio: desde, periodoFin: hasta });
    expect(res.status).toBe(200);
    // 2 entregas (150 + 100): 1000 + 25×2 + 10% de 250
    expect(res.json).toMatchObject({ totalPedidos: 2, totalVentas: "250.00", salarioCalculado: "1000.00", comisionCalculada: "75.00", montoTotal: "1075.00", estado: "pendiente" });
    expect((await ajeno.request("GET", `/api/deliveries/${repartidor.id}/pagos`)).status).toBe(403);
    expect((await ajeno.request("PATCH", `/api/pagos-delivery/${res.json.id}/marcar-pagado`, {})).status).toBe(403);
    const pagado = await dueno.request("PATCH", `/api/pagos-delivery/${res.json.id}/marcar-pagado`, {});
    expect(pagado.json).toMatchObject({ estado: "pagado", pagadoPor: "Dora" });
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/deliveries/pagos`)).json).toHaveLength(1);
  });

  it("agrupa las ventas por repartidor en la zona del negocio", async () => {
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/deliveries/reporte-ventas?agrupacion=anio`)).status).toBe(400);
    const res = await dueno.request("GET", `/api/colmados/${negocio.id}/deliveries/reporte-ventas?agrupacion=mes`);
    const fila = res.json.find((r: any) => r.deliveryId === repartidor.id);
    expect(fila).toMatchObject({ deliveryNombre: "Rafa", totalPedidos: 2, totalVentas: 250 });
    expect(fila.bucket).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe("vincular cuenta y borrar repartidor", () => {
  it("solo una cuenta sin rol se vincula, y con el código correcto", async () => {
    expect((await dueno.request("POST", "/api/user/register-delivery", { whatsappNumero: "18094440002", codigoAcceso: segundo.codigoAcceso })).status).toBe(403);
    expect((await pendiente.request("POST", "/api/user/register-delivery", { whatsappNumero: "18094440002" })).status).toBe(400);
    expect((await pendiente.request("POST", "/api/user/register-delivery", { whatsappNumero: "18094440002", codigoAcceso: "AAAAAA" })).status).toBe(404);
    const ok = await pendiente.request("POST", "/api/user/register-delivery", { whatsappNumero: "18094440002", codigoAcceso: segundo.codigoAcceso });
    expect(ok.status).toBe(200);
    expect(ok.json.codigoAcceso).toBeUndefined();
    expect((await pendiente.request("GET", "/api/auth/user")).json).toMatchObject({ role: "delivery", deliveryId: segundo.id });
  });

  it("al borrar, los pedidos abiertos quedan sin asignar y la cuenta vinculada vuelve a no tener rol", async () => {
    const abierto = await pedidoListo({ deliveryId: segundo.id });
    const res = await dueno.request("DELETE", `/api/deliveries/${segundo.id}`);
    expect(res.status).toBe(200);
    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, abierto.id));
    expect(p.deliveryId).toBeNull();
    const [u] = await t.db.select().from(users).where(eq(users.email, "nuevo@delywa.test"));
    expect(u).toMatchObject({ role: "pending", deliveryId: null });
    expect(await t.db.select().from(cuadres).where(eq(cuadres.deliveryId, segundo.id))).toHaveLength(0);
  });
});

describe("turno del repartidor por zona horaria", () => {
  const negocioRD = { horaCierre: "22:00", diasServicio: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] };
  // Miércoles 12 nov 2026 en Santo Domingo (UTC-4): 22:00 local = 02:00 UTC del 13.
  const cierre = Date.UTC(2026, 10, 13, 2, 0);
  const tz = "America/Santo_Domingo";

  it("da una hora de gracia después del cierre y luego termina el turno", () => {
    expect(ventanaDeGracia(negocioRD, tz, cierre - 60_000).enGracia).toBe(false);
    expect(ventanaDeGracia(negocioRD, tz, cierre + 30 * 60_000)).toEqual({ enGracia: true, terminaEn: cierre + 3_600_000 });
    expect(turnoTerminadoHoy(negocioRD, tz, cierre + 59 * 60_000)).toBe(false);
    expect(turnoTerminadoHoy(negocioRD, tz, cierre + 61 * 60_000)).toBe(true);
  });

  it("vence una sesión abierta ayer que cruzó la medianoche, pero no una nueva", () => {
    const madrugada = Date.UTC(2026, 10, 13, 5, 30); // 01:30 del jueves en RD
    expect(sesionPortalVencida(negocioRD, tz, cierre - 3 * 3_600_000, madrugada)).toBe(true);
    expect(sesionPortalVencida(negocioRD, tz, madrugada - 60_000, madrugada)).toBe(false);
  });

  it("respeta los días sin servicio y otras zonas horarias", () => {
    const soloLunes = { horaCierre: "22:00", diasServicio: ["lunes"] };
    expect(turnoTerminadoHoy(soloLunes, tz, cierre + 2 * 3_600_000)).toBe(false);
    // Madrid (UTC+1 en noviembre): 22:00 local = 21:00 UTC.
    expect(turnoTerminadoHoy(negocioRD, "Europe/Madrid", Date.UTC(2026, 10, 12, 22, 30))).toBe(true);
    expect(turnoTerminadoHoy(negocioRD, "Europe/Madrid", Date.UTC(2026, 10, 12, 21, 30))).toBe(false);
  });

  it("agrupa por semana desde el lunes y genera códigos válidos", () => {
    expect(claveAgrupacion(tz, new Date(Date.UTC(2026, 10, 15, 3, 0)), "semana")).toBe("2026-11-09"); // sáb 14 local
    expect(claveAgrupacion(tz, new Date(Date.UTC(2026, 10, 12, 15, 0)), "dia")).toBe("2026-11-12");
    for (let i = 0; i < 50; i++) expect(generarCodigoAcceso()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
});
