// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  chatWebMensajes, chatWebSesiones, colmados, deliveries, menuProductos, pedidos, planes, ventas, whatsappMensajes,
} from "@shared/schema";

vi.mock("../lib/routeOptimizer", async (original) => ({
  ...(await original<typeof import("../lib/routeOptimizer")>()),
  geocodificarDireccion: vi.fn(async () => ({ lat: 18.47, lon: -69.9 })),
}));

import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { enviarRecordatoriosComprobante } from "../lib/cron";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, operador: Client, colmadero: Client, ajeno: Client, anon: Client;
let cafe: any, otro: any;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

const CLIENTE = "+1 (809) 555-0101";
const pedirDelMenu = (extra: Record<string, unknown> = {}) => anon.request("POST", "/api/menu-grafico/pedido", {
  colmadoId: cafe.id, clienteNombre: "Luisa", clienteWhatsapp: CLIENTE, direccionTexto: "Calle El Sol #5, Santiago",
  productos: [{ nombre: "Mangú", cantidad: 2, precio: 150 }], ...extra,
});

beforeAll(async () => {
  t = await createTestApp();
  [cafe] = await t.db.insert(colmados).values({
    nombre: "Cafetería Ñapa", slug: "cafeteria-napa", whatsappNumero: "18092220001", direccion: "Av. Duarte 1", planId: 1,
    tipoNegocio: "cafeteria", costoDelivery: "50", latitud: "18.48", longitud: "-69.93", radioEntrega: "50",
  }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro", whatsappNumero: "18092220002", direccion: "X", planId: 1 }).returning();
  await t.db.insert(menuProductos).values([
    { colmadoId: cafe.id, nombre: "Mangú", precio: "150", categoria: "Desayuno" },
    { colmadoId: cafe.id, nombre: "Jugo", precio: "75", categoria: "Bebidas", inventario: 1 },
    { colmadoId: cafe.id, nombre: "Agotado", precio: "10", disponible: false },
  ]);
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: cafe.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, cafe.id));
  const op = await createUser(t.db, { idPrefix: "staff", email: "op@delywa.test", password: "op123456", firstName: "Omar", role: "operador_sucursal", colmadoId: cafe.id });
  await setUserSucursalIds(t.db, op.id, [cafe.id]);
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@delywa.test", password: "ajeno123", firstName: "Abel", role: "colmado_owner", colmadoId: otro.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otro.id));
  dueno = await login("dueno@delywa.test", "dueno1234");
  const col = await createUser(t.db, { idPrefix: "staff", email: "colmadero@delywa.test", password: "colmadero123", firstName: "Cora", role: "admin_pedidos", colmadoId: cafe.id });
  await setUserSucursalIds(t.db, col.id, [cafe.id]);
  colmadero = await login("colmadero@delywa.test", "colmadero123");
  operador = await login("op@delywa.test", "op123456");
  ajeno = await login("ajeno@delywa.test", "ajeno123");
  anon = t.client();
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("pedido desde el menú gráfico", () => {
  it("expone el negocio por su enlace y valida contra el menú vigente", async () => {
    for (const codigo of ["cafeteria-napa", `COLMADO${cafe.id}`, String(cafe.id), "Cafetería Ñapa"]) {
      expect((await anon.request("GET", `/api/menu-grafico/colmado/${encodeURIComponent(codigo)}`)).json.id).toBe(cafe.id);
    }
    expect((await anon.request("GET", "/api/menu-grafico/colmado/no-existe")).status).toBe(404);

    expect((await pedirDelMenu({ productos: [{ nombre: "Mangú", cantidad: 1, precio: 1 }] })).status).toBe(409);
    expect((await pedirDelMenu({ productos: [{ nombre: "Agotado", cantidad: 1, precio: 10 }] })).status).toBe(409);
    expect((await pedirDelMenu({ productos: [{ nombre: "Jugo", cantidad: 2, precio: 75 }] })).status).toBe(409);
    expect((await pedirDelMenu({ productos: [{ nombre: "Mangú", cantidad: 0, precio: 150 }] })).status).toBe(400);
    expect((await pedirDelMenu({ direccionTexto: "" })).status).toBe(400);
    expect((await pedirDelMenu({ colmadoId: otro.id })).status).toBe(409);
  });

  it("crea el pedido con el costo de delivery vigente y registra al cliente", async () => {
    const res = await pedirDelMenu();
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ estado: "pendiente_confirmacion", tipoEntrega: "delivery" });
    const [fila] = await t.db.select().from(pedidos).where(eq(pedidos.id, res.json.id));
    expect(fila).toMatchObject({ costoDeliveryAplicado: "50.00", costoDeliveryAplicadoFijado: true, total: "0.00" });
    expect(JSON.parse(fila.productos)).toEqual([{ nombre: "Mangú", monto: 300, cantidad: 2, precioUnitario: 150 }]);

    const buscado = await anon.request("POST", "/api/menu-grafico/buscar-cliente", { colmadoId: cafe.id, whatsapp: "18095550101" });
    expect(buscado.json).toMatchObject({ encontrado: true, cliente: { nombre: "Luisa", direccion: "Calle El Sol #5, Santiago" } });
    expect(buscado.json.pedidosRecientes).toHaveLength(1);
    expect((await anon.request("GET", `/api/menu-grafico/pedidos-cliente?colmadoId=${cafe.id}&whatsapp=%2B18095550101`)).json.pedidos).toHaveLength(1);
    expect((await anon.request("GET", `/api/pedidos/${res.json.id}/estado`)).json.estado).toBe("pendiente_confirmacion");
  });
});

describe("panel del negocio", () => {
  let pedidoId: number;

  it("lista los pedidos con su distancia y protege los de otros negocios", async () => {
    expect((await ajeno.request("GET", `/api/colmados/${cafe.id}/pedidos`)).status).toBe(403);
    const lista = await operador.request("GET", `/api/colmados/${cafe.id}/pedidos`);
    expect(lista.status).toBe(200);
    pedidoId = lista.json[0].id;
    expect(lista.json[0].metricasDistancia.estado).toBe("disponible");
    expect(lista.json[0].metricasDistancia.sucursales[0]).toMatchObject({ sucursalId: cafe.id, esSucursalOrigen: true });
    // La dirección se geocodificó y quedó guardada.
    const [fila] = await t.db.select().from(pedidos).where(eq(pedidos.id, pedidoId));
    expect(fila.clienteLatitud).toBe("18.4700000");
  });

  it("confirma una sola vez y, sin canal integrado, devuelve el mensaje para enviar a mano", async () => {
    expect((await ajeno.request("POST", `/api/pedidos/${pedidoId}/confirmar`, { totalConfirmado: 350 })).status).toBe(403);
    expect((await dueno.request("POST", `/api/pedidos/${pedidoId}/confirmar`, {})).status).toBe(400);
    const res = await operador.request("POST", `/api/pedidos/${pedidoId}/confirmar`, { totalConfirmado: "350" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, necesitaEnvioManual: true, whatsappNumero: CLIENTE, estado: "pendiente", total: "350.00" });
    expect(res.json.mensajeParaEnviar).toContain(`Pedido #${pedidoId} Confirmado`);
    expect(res.json.mensajeParaEnviar).toContain("Subtotal: RD$300");
    expect((await operador.request("POST", `/api/pedidos/${pedidoId}/confirmar`, { totalConfirmado: "350" })).status).toBe(400);
    const [fila] = await t.db.select().from(pedidos).where(eq(pedidos.id, pedidoId));
    expect(fila).toMatchObject({ estado: "pendiente", total: "350.00", totalConfirmado: "350.00" });
  });

  it("sigue el flujo de cocina y entrega, y cuenta la venta una sola vez", async () => {
    const estado = (e: string, c = operador, extra = {}) => c.request("PATCH", `/api/pedidos/${pedidoId}/estado`, { estado: e, ...extra });
    expect((await estado("listo")).status).toBe(409);
    expect((await estado("volando")).status).toBe(400);
    expect((await estado("en_preparacion")).status).toBe(200);
    expect((await estado("listo")).status).toBe(200);
    expect((await estado("en_camino")).json.reason).toBe("sin_delivery");

    const [rep] = await t.db.insert(deliveries).values({ colmadoId: cafe.id, nombre: "Pedro", whatsappNumero: "18093330000", ultimaLatitud: "18.475", ultimaLongitud: "-69.91" }).returning();
    await t.db.update(pedidos).set({ deliveryId: rep.id }).where(eq(pedidos.id, pedidoId));
    expect((await estado("en_camino")).status).toBe(200);

    const seguimiento = await anon.request("GET", `/api/seguimiento/${pedidoId}`);
    expect(seguimiento.json).toMatchObject({ estado: "en_camino", delivery: { nombre: "Pedro" }, destino: { lat: 18.47 } });
    expect(seguimiento.json.eta).not.toBeNull();

    // Dos "entregado" a la vez: solo uno cuenta en ventas.
    const [a, b] = await Promise.all([estado("entregado"), estado("entregado", dueno)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const hoy = await dueno.request("GET", `/api/colmados/${cafe.id}/ventas/hoy`);
    expect(hoy.json).toMatchObject({ totalVentas: "350.00", pedidosEntregados: 1, cuadrado: false });
    expect(await t.db.select().from(ventas)).toHaveLength(1);
    expect((await t.db.select().from(ventas))[0]).toMatchObject({ pedidosEntregados: 1, totalVentas: "350.00" });

    expect((await dueno.request("PATCH", `/api/colmados/${cafe.id}/ventas/cuadrar`, {})).status).toBe(200);
    expect((await dueno.request("GET", `/api/colmados/${cafe.id}/ventas/hoy`)).json.cuadrado).toBe(true);
    const historial = await dueno.request("GET", `/api/colmados/${cafe.id}/ventas?limit=7`);
    expect(historial.json[0]).toMatchObject({ totalVentas: "350.00", pedidosEntregados: 1 });
    expect((await dueno.request("GET", "/api/negocio/reportes")).json.reportes[0]).toMatchObject({ sucursalId: cafe.id, totalVentas: "350.00" });
    expect((await operador.request("GET", "/api/negocio/reportes")).status).toBe(403);
  });

  it("muestra los clientes con lo que han gastado", async () => {
    const lista = await dueno.request("GET", `/api/colmados/${cafe.id}/clientes`);
    expect(lista.json).toHaveLength(1);
    expect(lista.json[0]).toMatchObject({ clienteNombre: "Luisa", cantidadPedidos: 1, totalGastado: 350 });
    expect((await dueno.request("GET", `/api/colmados/${cafe.id}/clientes/${encodeURIComponent("18095550101")}/pedidos`)).json).toHaveLength(1);
    expect((await ajeno.request("PATCH", `/api/clientes/${lista.json[0].id}`, { nombre: "X" })).status).toBe(403);
    expect((await dueno.request("PATCH", `/api/clientes/${lista.json[0].id}`, { nombre: "Luisa M." })).status).toBe(200);
  });

  it("comparte el seguimiento con vista previa segura", async () => {
    await t.db.update(colmados).set({ tituloCompartirPedido: `<script>alert("x")</script>` }).where(eq(colmados.id, cafe.id));
    const res = await anon.request("GET", `/compartir/seguimiento/${pedidoId}`);
    expect(res.status).toBe(200);
    const html = await (await import("../index")).app.request(`https://delywa.test/compartir/seguimiento/${pedidoId}`, {}, t.env).then((r) => r.text());
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain(`<script>alert`);
    expect(html).toContain(`/seguimiento/${pedidoId}`);
  });
});

describe("fusionar, pickup, vuelto y borrado", () => {
  async function nuevoPedidoPendiente(extra: Partial<typeof pedidos.$inferInsert> = {}) {
    const [p] = await t.db.insert(pedidos).values({
      colmadoId: cafe.id, clienteNombre: "Luisa", clienteWhatsapp: "18095550101", clienteUbicacion: "Calle El Sol #5, Santiago",
      productos: JSON.stringify([{ nombre: "Mangú", monto: 150, cantidad: 1 }]), total: "200", montoPago: "500", metodoPago: "efectivo",
      estado: "pendiente", costoDeliveryAplicado: "50", costoDeliveryAplicadoFijado: true, ...extra,
    }).returning();
    return p;
  }

  it("el panel pide solo lo reciente y el historial se pide por mes", async () => {
    const viejoCerrado = await nuevoPedidoPendiente({ estado: "entregado", fechaCreacion: new Date("2026-03-15T16:00:00Z") });
    const viejoAbierto = await nuevoPedidoPendiente({ estado: "en_camino", fechaCreacion: new Date("2026-03-20T16:00:00Z") });
    const deHoy = await nuevoPedidoPendiente();
    const ids = (r: any) => r.json.map((p: any) => p.id);

    const recientes = await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos?recientes=1`);
    expect(recientes.status).toBe(200);
    expect(ids(recientes)).toContain(deHoy.id);
    expect(ids(recientes)).toContain(viejoAbierto.id); // sigue abierto: no se pierde de vista
    expect(ids(recientes)).not.toContain(viejoCerrado.id);

    const marzo = await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos?mes=2026-03`);
    expect(ids(marzo).sort()).toEqual([viejoCerrado.id, viejoAbierto.id].sort());
    expect(ids(await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos?mes=2026-02`))).toEqual([]);
    // El borde del mes es el del negocio (UTC-4): las 2:00 UTC del 1 de abril todavía son 31 de marzo.
    const borde = await nuevoPedidoPendiente({ estado: "entregado", fechaCreacion: new Date("2026-04-01T02:00:00Z") });
    expect(ids(await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos?mes=2026-03`))).toContain(borde.id);
    expect(ids(await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos?mes=2026-04`))).not.toContain(borde.id);

    expect((await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos?mes=marzo`)).status).toBe(400);
    const todos = await dueno.request("GET", `/api/colmados/${cafe.id}/pedidos`);
    expect(ids(todos)).toEqual(expect.arrayContaining([viejoCerrado.id, viejoAbierto.id, deHoy.id]));
  });

  it("un pedido ya confirmado se puede editar mientras no haya salido", async () => {
    const p = await nuevoPedidoPendiente();
    const r = await dueno.request("PATCH", `/api/pedidos/${p.id}/revisar-productos`, {
      productos: [{ nombre: "Mangú", cantidad: 2, monto: 150, textoOriginal: "Mangú", encontradoEnMenu: false }], totalConfirmado: "350.00",
    });
    expect(r.status).toBe(200);
    const [despues] = await t.db.select().from(pedidos).where(eq(pedidos.id, p.id));
    expect(Number(despues.total)).toBe(350);
    expect(JSON.parse(despues.productos)[0].cantidad).toBe(2);
    const enCamino = await nuevoPedidoPendiente({ estado: "en_camino" });
    const no = await dueno.request("PATCH", `/api/pedidos/${enCamino.id}/revisar-productos`, { productos: [{ nombre: "Mangú", cantidad: 1, monto: 150 }] });
    expect(no.status).toBe(400);
    expect(no.json.error).toContain("ya no se puede editar");
  });

  it("fusiona dos pedidos del mismo cliente con un solo cargo de delivery", async () => {
    const a = await nuevoPedidoPendiente();
    const b = await nuevoPedidoPendiente({ clienteWhatsapp: "+1 809-555-0101" });
    expect((await ajeno.request("POST", `/api/pedidos/${a.id}/fusionar/${b.id}`)).status).toBe(403);
    const res = await operador.request("POST", `/api/pedidos/${a.id}/fusionar/${b.id}`);
    expect(res.status).toBe(200);
    expect(res.json.pedido).toMatchObject({ total: "350.00", costoDeliveryAplicado: "50.00", necesitaDevuelta: true, vueltoEntregado: "150.00" });
    const [origen] = await t.db.select().from(pedidos).where(eq(pedidos.id, b.id));
    expect(origen).toMatchObject({ estado: "fusionado", fusionadoEnPedidoId: a.id });
    expect((await operador.request("PATCH", `/api/pedidos/${b.id}/estado`, { estado: "cancelado" })).json.reason).toBe("pedido_fusionado");
    expect((await operador.request("POST", `/api/pedidos/${a.id}/fusionar/${b.id}`)).status).toBe(400);
    expect((await anon.request("GET", `/api/seguimiento/${b.id}`)).status).toBe(410);
  });

  it("cambia a pickup quitando el delivery y recalculando la devuelta", async () => {
    const p = await nuevoPedidoPendiente({ totalConfirmado: "200" });
    const res = await operador.request("PATCH", `/api/pedidos/${p.id}/cambiar-a-pickup`);
    expect(res.json).toMatchObject({ tipoEntrega: "pickup", total: "150.00", totalConfirmado: "150.00", costoDeliveryAplicado: "0.00", vueltoEntregado: "350.00" });
    expect(res.json.clienteUbicacion).toBe("Recoger en Av. Duarte 1");
    expect((await operador.request("PATCH", `/api/pedidos/${p.id}/cambiar-a-pickup`)).json.reason).toBe("ya_pickup");
    expect((await operador.request("PATCH", `/api/pedidos/${p.id}/estado`, { estado: "en_camino" })).json.reason).toBe("pedido_pickup");
  });

  it("registra el vuelto entregado al repartidor y lo muestra en el historial", async () => {
    const p = await nuevoPedidoPendiente();
    expect((await ajeno.request("POST", `/api/colmados/${cafe.id}/pedidos/${p.id}/entregar-vuelto-delivery`, {})).status).toBe(403);
    const res = await dueno.request("POST", `/api/colmados/${cafe.id}/pedidos/${p.id}/entregar-vuelto-delivery`, {});
    expect(res.json).toEqual({ success: true, monto: 300 });
    expect((await dueno.request("PATCH", `/api/colmados/${cafe.id}/pedidos/${p.id}/vuelto`, { monto: -1 })).status).toBe(400);
    expect((await dueno.request("PATCH", `/api/colmados/${cafe.id}/pedidos/${p.id}/vuelto`, { monto: 250 })).status).toBe(200);
    const log = await dueno.request("GET", `/api/colmados/${cafe.id}/vueltos-log`);
    expect(log.json[0]).toMatchObject({ pedidoId: p.id, monto: "250.00", entregadoPor: "Dora", deliveryNombre: "Desconocido" });
  });

  it("solo administradores borran pedidos y el chat web queda sin pedido", async () => {
    const p = await nuevoPedidoPendiente();
    await t.db.insert(chatWebSesiones).values({ sessionId: "s-borrar", colmadoId: cafe.id, pedidoId: p.id });
    expect((await operador.request("DELETE", `/api/pedidos/${p.id}`)).status).toBe(403);
    expect((await dueno.request("DELETE", `/api/pedidos/${p.id}`)).status).toBe(200);
    expect((await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, "s-borrar")))[0].pedidoId).toBeNull();
  });
});

describe("chat web, pagos y límites", () => {
  it("si el pedido vino del chat web, la confirmación llega allí", async () => {
    const [p] = await t.db.insert(pedidos).values({
      colmadoId: cafe.id, clienteNombre: "Ana", clienteWhatsapp: "18096660000", clienteUbicacion: "Calle 2",
      productos: "[]", total: "100", montoPago: "0", estado: "pendiente_confirmacion",
    }).returning();
    await t.db.insert(chatWebSesiones).values({ sessionId: "s-chat", colmadoId: cafe.id, clienteWhatsapp: "18096660000" });
    const res = await dueno.request("POST", `/api/pedidos/${p.id}/confirmar`, {
      totalConfirmado: 150, sustituciones: [{ original: "Mangú", nuevo: "Tostones" }],
    });
    expect(res.json).toMatchObject({ necesitaEnvioManual: false, canalEnvio: "chat_web" });
    const mensajes = await t.db.select().from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, "s-chat"));
    expect(mensajes[0].contenido).toContain("Te ofrecemos: *Tostones*");
    expect((await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, "s-chat")))[0].estadoConversacion).toBe("esperando_confirmacion_sustitucion");
    expect((await t.db.select().from(pedidos).where(eq(pedidos.id, p.id)))[0].estado).toBe("esperando_confirmacion_sustituciones");
  });

  it("confirmar pago y cambiar método exigen sesión y acceso", async () => {
    const [p] = await t.db.insert(pedidos).values({
      colmadoId: cafe.id, clienteNombre: "Beto", clienteWhatsapp: "18097770000", clienteUbicacion: "Calle 3",
      productos: "[]", total: "100", montoPago: "0", estado: "esperando_comprobante", metodoPago: "transferencia",
    }).returning();
    expect((await anon.request("PATCH", `/api/pedidos/${p.id}/confirmar-pago`)).status).toBe(401);
    expect((await anon.request("PATCH", `/api/pedidos/${p.id}/metodo-pago`, { metodoPago: "efectivo" })).status).toBe(401);
    expect((await ajeno.request("PATCH", `/api/pedidos/${p.id}/confirmar-pago`)).status).toBe(403);

    // El recordatorio automático deja constancia en la conversación cuando hay chat.
    await t.db.insert(chatWebSesiones).values({ sessionId: "s-pago", colmadoId: cafe.id, pedidoId: p.id });
    await enviarRecordatoriosComprobante(t.env);
    expect((await t.db.select().from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, "s-pago")))[0].contenido).toContain("comprobante");
    await enviarRecordatoriosComprobante(t.env);
    expect(await t.db.select().from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, "s-pago"))).toHaveLength(1);

    const aviso = await dueno.request("POST", `/api/pedidos/${p.id}/avisar-comprobante`);
    expect(aviso.json).toMatchObject({ success: true, enviado: true });
    expect((await dueno.request("PATCH", `/api/pedidos/${p.id}/confirmar-pago`)).status).toBe(200);
    expect((await t.db.select().from(pedidos).where(eq(pedidos.id, p.id)))[0]).toMatchObject({ estado: "pendiente", comprobanteConfirmado: true });
    expect(await t.db.select().from(whatsappMensajes)).not.toHaveLength(0);
  });

  it("respeta el límite diario de pedidos del plan", async () => {
    await t.db.update(planes).set({ limitePedidosDiarios: 1 }).where(eq(planes.id, 1));
    const [p] = await t.db.insert(pedidos).values({
      colmadoId: otro.id, clienteNombre: "C", clienteWhatsapp: "18098880000", clienteUbicacion: "Calle 4", productos: "[]",
      total: "0", montoPago: "0", estado: "pendiente_confirmacion",
    }).returning();
    const [q] = await t.db.insert(pedidos).values({
      colmadoId: otro.id, clienteNombre: "D", clienteWhatsapp: "18098880001", clienteUbicacion: "Calle 5", productos: "[]",
      total: "0", montoPago: "0", estado: "pendiente_confirmacion",
    }).returning();
    expect((await ajeno.request("POST", `/api/pedidos/${p.id}/confirmar`, { totalConfirmado: 100 })).status).toBe(200);
    const bloqueado = await ajeno.request("POST", `/api/pedidos/${q.id}/confirmar`, { totalConfirmado: 100 });
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.json).toMatchObject({ limitExceeded: true, limite: 1, actual: 1 });
    await t.db.update(planes).set({ limitePedidosDiarios: null }).where(eq(planes.id, 1));
  });
});

describe("roles: colmadero (encargado) y despachador", () => {
  it("el despachador atiende pedidos pero no toca caja, formas de pago ni configuración", async () => {
    expect((await operador.request("GET", `/api/colmados/${cafe.id}/pedidos?recientes=1`)).status).toBe(200);
    expect((await operador.request("GET", `/api/colmados/${cafe.id}/ventas/hoy`)).status).toBe(200);
    expect((await operador.request("GET", `/api/colmados/${cafe.id}/ventas`)).status).toBe(403);
    expect((await operador.request("PATCH", `/api/colmados/${cafe.id}/ventas/cuadrar`, {})).status).toBe(403);
    expect((await operador.request("PUT", `/api/colmados/${cafe.id}/metodos-pago`, { efectivo: false })).status).toBe(403);
    expect((await operador.request("PATCH", `/api/colmados/${cafe.id}`, { horaCierre: "23:00" })).status).toBe(403);
    expect((await operador.request("POST", "/api/negocio/usuarios", { email: "x@delywa.test", password: "clave-larga-123", firstName: "X", role: "operador_sucursal" })).status).toBe(403);
  });

  it("el colmadero maneja caja, pagos y configuración del día a día, pero no la identidad del negocio ni los usuarios", async () => {
    expect((await colmadero.request("GET", `/api/colmados/${cafe.id}/ventas`)).status).toBe(200);
    expect((await colmadero.request("PUT", `/api/colmados/${cafe.id}/metodos-pago`, { efectivo: true, tarjeta: true })).status).toBe(200);
    const [antes] = await t.db.select().from(colmados).where(eq(colmados.id, cafe.id));
    const r = await colmadero.request("PATCH", `/api/colmados/${cafe.id}`, { horaCierre: "23:30", nombre: "Otro nombre", whatsappNumero: "18090000000" });
    expect(r.status).toBe(200);
    const [despues] = await t.db.select().from(colmados).where(eq(colmados.id, cafe.id));
    expect(despues.horaCierre).toBe("23:30");
    expect(despues.nombre).toBe(antes.nombre);
    expect(despues.whatsappNumero).toBe(antes.whatsappNumero);
    // Otro negocio: nada.
    expect((await colmadero.request("PATCH", `/api/colmados/${otro.id}`, { horaCierre: "20:00" })).status).toBe(403);
    expect((await colmadero.request("POST", "/api/negocio/usuarios", { email: "y@delywa.test", password: "clave-larga-123", firstName: "Y", role: "operador_sucursal" })).status).toBe(403);
    expect((await colmadero.request("PATCH", `/api/colmados/${cafe.id}/ventas/cuadrar`, {})).status).toBe(200);
  });
});

