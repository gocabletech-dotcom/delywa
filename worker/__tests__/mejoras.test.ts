// @vitest-environment node
// Mejoras de noviembre 2026 (v2.52 en adelante). D1 local en memoria; nada de producción.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, deliveries, fiadoMovimientos, menuProductos, pedidos, planes, ventas } from "@shared/schema";
import { tiempos } from "../routes/chat-colmado";
import { pushHttp, repartirOfertas, olvidarLlavesEnMemoria } from "../lib/push";
import { pushSuscripciones, chatWebSesiones } from "@shared/schema";
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

describe("productos, inventario y venta de mostrador", () => {
  let arroz: any, cerveza: any;
  it("un colmado ya puede tener su lista de productos con existencias y mínimo", async () => {
    const r1 = await dueno.request("POST", `/api/colmados/${negocio.id}/menu`, { nombre: "Arroz (libra)", precio: "45", inventario: 10, inventarioMinimo: 8 });
    expect(r1.status).toBe(201);
    arroz = r1.json;
    expect(arroz.inventarioMinimo).toBe(8);
    cerveza = (await dueno.request("POST", `/api/colmados/${negocio.id}/menu`, { nombre: "Presidente grande", precio: "200", inventario: 1 })).json;
  });

  it("vende en mostrador: precio del servidor, devuelta, descuenta inventario, cuenta en ventas y avisa lo bajo", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, {
      metodoPago: "efectivo", recibido: 500,
      items: [{ menuProductoId: arroz.id, cantidad: 3, precio: 1 }, { nombre: "Funda de hielo", precio: 50, cantidad: 1 }],
    });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ total: 185, devuelta: 315 });
    expect(r.json.avisos).toContain("Quedan 7 de «Arroz (libra)».");
    const [a] = await t.db.select().from(menuProductos).where(eq(menuProductos.id, arroz.id));
    expect(a.inventario).toBe(7);
    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, r.json.pedidoId));
    expect(p).toMatchObject({ estado: "entregado", origen: "mostrador", tipoEntrega: "pickup" });
    const [v] = await t.db.select().from(ventas).where(eq(ventas.colmadoId, negocio.id));
    expect(Number(v.totalVentas)).toBe(185);
    const hoy = await dueno.request("GET", `/api/colmados/${negocio.id}/mostrador/hoy`);
    expect(hoy.json).toMatchObject({ ventas: 1, total: 185 });
  });

  it("no vende más de lo que hay ni lo agotado; avisa en Inicio", async () => {
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "tarjeta", items: [{ menuProductoId: cerveza.id, cantidad: 2 }] })).status).toBe(409);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "tarjeta", items: [{ menuProductoId: cerveza.id, cantidad: 1 }] })).status).toBe(201);
    const otra = await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "tarjeta", items: [{ menuProductoId: cerveza.id, cantidad: 1 }] });
    expect(otra.status).toBe(409);
    expect(otra.json.error).toContain("agotado");
    const al = await dueno.request("GET", `/api/colmados/${negocio.id}/inventario/alertas`);
    expect(al.json.agotados.map((x: any) => x.nombre)).toEqual(["Presidente grande"]);
    expect(al.json.bajos.map((x: any) => x.nombre)).toEqual(["Arroz (libra)"]);
  });

  it("el bot del chat dice que no hay lo agotado y no lo anota", async () => {
    Object.assign(tiempos, { rapidoMs: 0, normalMs: 0, entreMensajesMs: 0 });
    const s = await t.client().request("POST", "/api/chat-colmado/colmado-mejoras/sesion", { nombre: "Tavo", telefono: "8095550701" });
    const id = s.json.sessionId;
    await t.client().request("POST", `/api/chat-colmado/sesion/${id}/mensaje`, { texto: "dame 2 presidente grande y un pan" });
    const ms = (await t.client().request("GET", `/api/chat-colmado/sesion/${id}/mensajes`)).json.mensajes.filter((m: any) => m.rol === "assistant");
    const texto = ms.map((m: any) => m.contenido).join("\n");
    expect(texto).toContain("no tenemos *Presidente grande*");
    expect(texto).toContain("Pan");
  });
});

describe("fiado", () => {
  let cuenta: any;
  it("crea la cuenta con lo que ya debía y un límite", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/fiado`, { nombre: "Doña Carmen", telefono: "809-555-1234", limite: 1000, saldoInicial: 300 });
    expect(r.status).toBe(201);
    cuenta = r.json;
    expect(cuenta).toMatchObject({ saldo: 300, limite: 1000, disponible: 700 });
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/fiado`, { nombre: "Otra", telefono: "8095551234" })).status).toBe(409);
  });

  it("fía desde el mostrador sin pasar del límite", async () => {
    const ok = await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "fiado", clienteId: cuenta.id, items: [{ nombre: "Salami", precio: 600, cantidad: 1 }] });
    expect(ok.status).toBe(201);
    expect(ok.json.fiado).toMatchObject({ nombre: "Doña Carmen", saldo: 900 });
    const pasa = await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "fiado", clienteId: cuenta.id, items: [{ nombre: "Queso", precio: 200, cantidad: 1 }] });
    expect(pasa.status).toBe(409);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/mostrador`, { metodoPago: "fiado", items: [{ nombre: "Queso", precio: 200, cantidad: 1 }] })).status).toBe(400);
  });

  it("abonos bajan el saldo, no más de lo que debe, y queda todo en movimientos", async () => {
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/fiado/${cuenta.id}/abono`, { monto: 1000 })).status).toBe(409);
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/fiado/${cuenta.id}/abono`, { monto: 400, metodoPago: "transferencia" });
    expect(r.json.saldo).toBe(500);
    const d = await dueno.request("GET", `/api/colmados/${negocio.id}/fiado/${cuenta.id}`);
    expect(d.json.movimientos.map((m: any) => `${m.tipo}:${m.monto}`)).toEqual(["abono:400", "cargo:600", "cargo:300"]);
    const lista = await dueno.request("GET", `/api/colmados/${negocio.id}/fiado?buscar=carmen`);
    expect(lista.json).toMatchObject({ totalFiado: 500, conDeuda: 1 });
    // No se cierra con deuda.
    expect((await dueno.request("PATCH", `/api/colmados/${negocio.id}/fiado/${cuenta.id}`, { activo: false })).status).toBe(409);
    const movs = await t.db.select().from(fiadoMovimientos).where(eq(fiadoMovimientos.cuentaId, cuenta.id));
    expect(movs).toHaveLength(3);
  });
});

describe("avisos del navegador y ofertas", () => {
  const enviados: string[] = [];
  let respuesta = 201;
  const fetchOriginal = pushHttp.fetch;
  async function suscripcion(n: number) {
    const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    const crudo = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return { endpoint: `https://fcm.googleapis.com/fcm/send/prueba-${n}`, keys: { p256dh: b64(crudo), auth: b64(crypto.getRandomValues(new Uint8Array(16))) } };
  }
  beforeAll(() => {
    (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
    olvidarLlavesEnMemoria();
    pushHttp.fetch = async (url) => { enviados.push(url); return new Response("", { status: respuesta }); };
  });
  afterAll(() => { pushHttp.fetch = fetchOriginal; });

  it("el personal activa avisos y le llega el pedido nuevo del chat", async () => {
    const clave = await t.client().request("GET", "/api/push/clave");
    expect(clave.json.publica).toMatch(/^B[A-Za-z0-9_-]{80,}$/);
    expect((await dueno.request("POST", "/api/push/negocio", { colmadoId: negocio.id, suscripcion: { endpoint: "https://evil.example/x", keys: {} } })).status).toBe(400);
    expect((await dueno.request("POST", "/api/push/negocio", { colmadoId: negocio.id, suscripcion: await suscripcion(1) })).status).toBe(200);
    enviados.length = 0;
    const s = await t.client().request("POST", "/api/chat-colmado/colmado-mejoras/sesion", { nombre: "Rita", telefono: "8095550801" });
    const id = s.json.sessionId;
    for (const texto of ["dame un pan", "eso es todo", "Calle 5 #3, frente al parque", "tarjeta"]) await t.client().request("POST", `/api/chat-colmado/sesion/${id}/mensaje`, { texto });
    expect(enviados).toContain("https://fcm.googleapis.com/fcm/send/prueba-1");
    expect((await dueno.request("POST", "/api/push/prueba")).json.enviados).toBe(1);
  });

  it("el cliente acepta avisos de su pedido y de ofertas; la oferta sale en el chat y en el saludo", async () => {
    const s = await t.client().request("POST", "/api/chat-colmado/colmado-mejoras/sesion", { nombre: "Lino", telefono: "8095550802" });
    const id = s.json.sessionId;
    expect((await t.client().request("POST", `/api/chat-colmado/sesion/${id}/push`, { suscripcion: await suscripcion(2), ofertas: true })).status).toBe(200);
    const [sub] = await t.db.select().from(pushSuscripciones).where(eq(pushSuscripciones.endpoint, "https://fcm.googleapis.com/fcm/send/prueba-2"));
    expect(sub).toMatchObject({ tipo: "cliente", colmadoId: negocio.id, ofertas: true });

    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/ofertas`, { texto: "Hoy pollo a RD$95 la libra", horas: 12, avisar: true });
    expect(r.status).toBe(201);
    expect(r.json.suscritos).toBe(1);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/ofertas`, { texto: "Otra oferta del día", avisar: true })).status).toBe(409);

    enviados.length = 0;
    respuesta = 410; // el navegador ya no acepta: se borra la suscripción
    expect(await repartirOfertas(t.env, t.db, () => "https://colmadomejoras.delywa.com")).toBe(0);
    expect(enviados).toEqual(["https://fcm.googleapis.com/fcm/send/prueba-2"]);
    expect(await t.db.select().from(pushSuscripciones).where(eq(pushSuscripciones.id, sub.id))).toHaveLength(0);
    respuesta = 201;

    const info = await t.client().request("GET", "/api/chat-colmado/colmado-mejoras/info");
    expect(info.json.ofertas.map((o: any) => o.texto)).toEqual(["Hoy pollo a RD$95 la libra"]);
    const s2 = await t.client().request("POST", "/api/chat-colmado/colmado-mejoras/sesion", { nombre: "Ana", telefono: "8095550803" });
    await t.client().request("POST", `/api/chat-colmado/sesion/${s2.json.sessionId}/mensaje`, { texto: "hola" });
    const ms = (await t.client().request("GET", `/api/chat-colmado/sesion/${s2.json.sessionId}/mensajes`)).json.mensajes;
    expect(ms.find((m: any) => m.rol === "assistant").contenido).toContain("🔥 *Hoy:* Hoy pollo a RD$95 la libra");
  });
});

describe("el cliente ve al delivery en el mapa", () => {
  it("solo mientras va en camino, con ubicación reciente, y solo su pedido", async () => {
    const cliente = t.client();
    const s = await cliente.request("POST", "/api/chat-colmado/colmado-mejoras/sesion", { nombre: "Mapa", telefono: "8095550901" });
    const id = s.json.sessionId;
    for (const texto of ["dame un pan", "eso es todo", "Calle 9 #1, al lado del parque", "tarjeta"]) await cliente.request("POST", `/api/chat-colmado/sesion/${id}/mensaje`, { texto });
    const [ses] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, id));
    const pedidoId = ses.pedidoId!;
    const ruta = `/api/chat-colmado/sesion/${id}/pedidos/${pedidoId}/delivery`;
    expect((await cliente.request("GET", ruta)).json).toEqual({ visible: false });

    const [d] = await t.db.insert(deliveries).values({ colmadoId: negocio.id, nombre: "Pedro Martínez", whatsappNumero: "8095559999", ultimaLatitud: "18.4861", ultimaLongitud: "-69.9312", ultimaUbicacionAt: new Date() } as any).returning();
    await t.db.update(pedidos).set({ estado: "en_camino", deliveryId: d.id, clienteLatitud: "18.49", clienteLongitud: "-69.93" }).where(eq(pedidos.id, pedidoId));
    const r = await cliente.request("GET", ruta);
    expect(r.json).toMatchObject({ visible: true, estado: "en_camino", delivery: { nombre: "Pedro", lat: 18.4861, lon: -69.9312 }, destino: { lat: 18.49, lon: -69.93 } });
    expect(JSON.stringify(r.json)).not.toContain("8095559999");

    // Ubicación vieja: no se muestra dónde estaba.
    await t.db.update(deliveries).set({ ultimaUbicacionAt: new Date(Date.now() - 60 * 60_000) }).where(eq(deliveries.id, d.id));
    expect((await cliente.request("GET", ruta)).json.delivery.lat).toBeNull();

    // Otra sesión (otro teléfono) no ve ese pedido.
    const otra = await t.client().request("POST", "/api/chat-colmado/colmado-mejoras/sesion", { nombre: "Otro", telefono: "8095550902" });
    expect((await t.client().request("GET", `/api/chat-colmado/sesion/${otra.json.sessionId}/pedidos/${pedidoId}/delivery`)).status).toBe(404);
  });
});
