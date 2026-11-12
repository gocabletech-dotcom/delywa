// @vitest-environment node
// Pruebas con D1 local en memoria, datos inventados e IA simulada:
// no se llama a OpenAI (no gasta saldo) ni se toca la base real.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { chatWebSesiones, colmados, menuProductos, pedidos, whatsappMensajes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { ia } from "../chat/adaptador";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let negocio: any, restaurante: any;
let llamadasIA: Array<{ model: string; ultimo: string }> = [];
let fallaIA = false;
const crearOriginal = ia.crear;

/** IA simulada: responde el JSON que el motor espera según lo último que dijo el cliente. */
function iaSimulada() {
  return {
    chat: { completions: { create: async (args: any) => {
      const ultimo = String(args.messages.at(-1).content).toLowerCase();
      llamadasIA.push({ model: args.model, ultimo });
      if (fallaIA) throw new Error("servicio no disponible");
      let datos: any = { accion: "conversacion", respuesta: "¿Qué deseas pedir?", terminoPedido: false };
      if (ultimo.includes("pan")) datos = { accion: "capturar_productos", productos: [{ nombre: "Pan", precio: 25, cantidad: 2 }], respuesta: "Anotado", terminoPedido: false };
      return { choices: [{ message: { content: JSON.stringify(datos) } }] };
    } } },
    audio: { transcriptions: { create: async () => ({ text: " quiero 2 pan " }) } },
  } as any;
}

let ipN = 0;
const enviar = (c: Client, ruta: string, body: unknown) => c.request("POST", ruta, body, { "CF-Connecting-IP": `10.20.0.${++ipN % 250}` });
async function nuevaSesion(c: Client, whatsapp = "18095551234", colmadoId = negocio.id) {
  const r = await enviar(c, "/api/chat-web/session", { colmadoId, clienteNombre: "Ana", clienteWhatsapp: whatsapp });
  expect(r.status).toBe(200);
  return r.json;
}
const decir = (c: Client, sessionId: string, mensaje: string) => enviar(c, "/api/chat-web/message", { sessionId, mensaje });
const sesionDb = async (sessionId: string) => (await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, sessionId)))[0];

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado IA", slug: "colmado-ia", whatsappNumero: "18093330001", direccion: "Av. 1", planId: 1, costoDelivery: "50" }).returning();
  [restaurante] = await t.db.insert(colmados).values({ nombre: "Resto IA", slug: "resto-ia", whatsappNumero: "18093330002", direccion: "Av. 2", planId: 1, tipoNegocio: "restaurante" }).returning();
  await t.db.insert(menuProductos).values([
    { colmadoId: restaurante.id, nombre: "Pizza", categoria: "Comidas", precio: "300", disponible: true },
    { colmadoId: restaurante.id, nombre: "Agotado", categoria: "Comidas", precio: "100", disponible: true, inventario: 0 },
  ]);
  ia.crear = iaSimulada;
}, 60_000);
afterAll(async () => { ia.crear = crearOriginal; await t?.dispose(); });
beforeEach(() => { llamadasIA = []; fallaIA = false; });

describe("datos públicos para la página del chat", () => {
  it("entrega el negocio, su formato de dirección y el menú disponible", async () => {
    const c = t.client();
    expect((await c.request("GET", "/api/chat-web/colmado/no-existe")).status).toBe(404);
    const n = (await c.request("GET", "/api/chat-web/colmado/colmado-ia")).json;
    expect(n).toMatchObject({ id: negocio.id, nombre: "Colmado IA", codigoPais: "DO", etiquetaEstado: "Provincia" });
    expect(n.whatsappAccessToken).toBeUndefined();
    expect((await c.request("GET", "/api/chat-web/menu/colmado-ia")).json).toMatchObject({ usaMenu: false, categorias: [] });
    const menu = (await c.request("GET", "/api/chat-web/menu/resto-ia")).json;
    expect(menu).toMatchObject({ usaMenu: true, simboloMoneda: "RD$", categorias: ["Comidas"] });
    expect(menu.productosPorCategoria.Comidas.map((p: any) => p.nombre)).toEqual(["Pizza"]);
  });
});

describe("conversación completa hasta crear el pedido", () => {
  const c = () => t.client();
  let sessionId: string;

  it("abre la sesión con un identificador imposible de adivinar", async () => {
    expect((await enviar(c(), "/api/chat-web/session", {})).status).toBe(400);
    expect((await enviar(c(), "/api/chat-web/session", { colmadoId: 99999 })).status).toBe(404);
    const s = await nuevaSesion(c());
    expect(s.sessionId).toMatch(/^chat_[0-9a-f]{32}$/);
    expect(s).toMatchObject({ isReturningClient: false, carritoGuardado: false, historialMensajes: [] });
    sessionId = s.sessionId;
  });

  it("saluda, anota productos, cobra y crea el pedido con la dirección", async () => {
    const hola = await decir(c(), sessionId, "hola");
    expect(hola.json.respuesta).toContain("Bienvenido a *Colmado IA*");
    expect(llamadasIA[0].model).toBe("gpt-4o");

    const pan = await decir(c(), sessionId, "quiero 2 pan");
    expect(pan.json.respuesta).toContain("✅ *Anotado:*\n• 2x Pan - RD$25");
    expect(pan.json.opciones).toContain("✅ Confirmar pedido");
    expect((await sesionDb(sessionId)).productosCapturados).toMatchObject([{ nombre: "Pan", monto: 25, cantidad: 2 }]);

    // El método de pago y el monto se resuelven sin IA.
    llamadasIA = [];
    const pago = await decir(c(), sessionId, "efectivo");
    expect(pago.json.respuesta).toContain("(Total: RD$75)");
    const monto = await decir(c(), sessionId, "500");
    expect(monto.json.respuesta).toContain("Devuelta: RD$425");
    expect(llamadasIA).toHaveLength(0);
    expect((await sesionDb(sessionId)).estadoConversacion).toBe("esperando_ubicacion");

    const fin = await decir(c(), sessionId, "Calle 5 #10, Santo Domingo");
    expect(fin.json.respuesta).toMatch(/Pedido #\d+ recibido/);
    const [pedido] = await t.db.select().from(pedidos).where(eq(pedidos.colmadoId, negocio.id));
    expect(pedido).toMatchObject({
      clienteNombre: "Ana", clienteWhatsapp: "18095551234", clienteUbicacion: "Calle 5 #10, Santo Domingo",
      total: "75.00", montoPago: "500.00", metodoPago: "efectivo", estado: "pendiente_confirmacion", costoDeliveryAplicado: "50.00",
    });
    expect(JSON.parse(pedido.productos)).toMatchObject([{ nombre: "Pan", monto: 25, cantidad: 2 }]);
    expect(await sesionDb(sessionId)).toMatchObject({ estadoConversacion: "pedido_creado", pedidoId: pedido.id });
  });

  it("la conversación queda en el panel del negocio y la sesión se puede recargar", async () => {
    const s = await sesionDb(sessionId);
    const guardados = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, s.conversacionId!));
    expect(guardados.map((m) => m.rol)).toContain("cliente");
    expect(guardados.map((m) => m.rol)).toContain("negocio");

    const g = await c().request("GET", `/api/chat-web/session/${sessionId}`);
    expect(g.json).toMatchObject({ pedidoEstado: "pendiente_confirmacion", estadoConversacion: "pedido_creado", metodosHabilitados: ["💵 Efectivo"], colmado: { nombre: "Colmado IA" } });
    expect(g.json.mensajes.length).toBeGreaterThanOrEqual(10);
    expect((await c().request("GET", "/api/chat-web/session/chat_no_existe")).status).toBe(404);

    const activo = await c().request("GET", `/api/chat-web/check-pedido?colmadoId=${negocio.id}&whatsapp=(809) 555-1234`);
    expect(activo.json.pedido).toMatchObject({ estado: "pendiente_confirmacion", total: "75.00" });
    expect((await c().request("GET", `/api/chat-web/check-pedido?colmadoId=${negocio.id}&whatsapp=8090000000`)).json).toEqual({ pedido: null });
  });

  it("guarda la ubicación GPS y liga el comprobante solo si es un archivo de este servidor", async () => {
    expect((await enviar(c(), "/api/chat-web/location", { sessionId, latitude: 200, longitude: 0 })).status).toBe(400);
    expect((await enviar(c(), "/api/chat-web/location", { sessionId, latitude: 18.47, longitude: -69.9 })).status).toBe(200);

    for (const mala of ["javascript:alert(1)", "https://otro.sitio/foto.jpg", "/uploads/productos/1/x.png"]) {
      expect((await enviar(c(), "/api/chat-web/comprobante", { sessionId, comprobanteUrl: mala })).status, mala).toBe(400);
    }
    const ruta = "/uploads/comprobantes/123e4567-e89b-12d3-a456-426614174000.jpg";
    const ok = await enviar(c(), "/api/chat-web/comprobante", { sessionId, comprobanteUrl: ruta });
    expect(ok.json).toMatchObject({ success: true });
    const [pedido] = await t.db.select().from(pedidos).where(eq(pedidos.colmadoId, negocio.id));
    expect(pedido).toMatchObject({ comprobanteUrl: ruta, estado: "esperando_confirmacion_pago" });
  });
});

describe("cliente que regresa", () => {
  it("recupera el carrito pendiente una sola vez", async () => {
    const c = t.client();
    const primera = await nuevaSesion(c, "18095559999");
    await decir(c, primera.sessionId, "quiero 2 pan");
    const [a, b] = await Promise.all([nuevaSesion(t.client(), "18095559999"), nuevaSesion(t.client(), "18095559999")]);
    expect([a.carritoGuardado, b.carritoGuardado].sort()).toEqual([false, true]);
    const ganadora = a.carritoGuardado ? a : b;
    expect(ganadora.isReturningClient).toBe(true);
    expect(ganadora.mensajeBienvenida).toContain("• 2x Pan (RD$25)");
    expect(await sesionDb(ganadora.sessionId)).toMatchObject({ estadoConversacion: "retomando_carrito", productosCapturados: [{ nombre: "Pan" }] });
    expect((await sesionDb(primera.sessionId)).estado).toBe("finalizada");
  });
});

describe("notas de voz", () => {
  it("transcribe y sigue el mismo flujo que un mensaje escrito", async () => {
    const c = t.client();
    const { sessionId } = await nuevaSesion(c, "18095557777");
    expect((await enviar(c, "/api/chat-web/voice-message", { sessionId, audioData: "no-es-audio" })).status).toBe(400);
    expect((await enviar(c, "/api/chat-web/voice-message", { sessionId, audioData: "data:audio/webm;base64," + "A".repeat(4_300_000) })).status).toBe(413);
    const r = await enviar(c, "/api/chat-web/voice-message", { sessionId, audioData: "data:audio/webm;base64,AAAA" });
    expect(r.json.transcribedText).toBe("quiero 2 pan");
    expect(r.json.respuesta).toContain("Pan");
    expect((await sesionDb(sessionId)).productosCapturados).toHaveLength(1);
  });
});

describe("protecciones de un chat público que usa IA de pago", () => {
  it("rechaza mensajes vacíos, enormes o de sesiones inexistentes", async () => {
    const c = t.client();
    const { sessionId } = await nuevaSesion(c, "18095556666");
    expect((await decir(c, sessionId, "   ")).status).toBe(400);
    expect((await decir(c, sessionId, "x".repeat(1501))).status).toBe(400);
    expect((await decir(c, "chat_inventada", "hola")).status).toBe(404);
    expect(llamadasIA).toHaveLength(0);
  });

  it("si la IA falla responde con un mensaje amable y conserva el carrito", async () => {
    const c = t.client();
    const { sessionId } = await nuevaSesion(c, "18095555555");
    await decir(c, sessionId, "quiero 2 pan");
    fallaIA = true;
    const r = await decir(c, sessionId, "y qué más venden");
    expect(r.status).toBe(200);
    expect(r.json.respuesta).toContain("hubo un error");
    expect((await sesionDb(sessionId)).productosCapturados).toHaveLength(1);
  });

  it("limita los mensajes por sesión y las sesiones por IP", async () => {
    const c = t.client();
    const { sessionId } = await nuevaSesion(c, "18095554444");
    let ultimo = 200;
    for (let i = 0; i < 41; i++) ultimo = (await decir(c, sessionId, "efectivo")).status;
    expect(ultimo).toBe(429);

    let sesiones = 200;
    for (let i = 0; i < 31; i++) sesiones = (await c.request("POST", "/api/chat-web/session", { colmadoId: negocio.id }, { "CF-Connecting-IP": "10.99.99.99" })).status;
    expect(sesiones).toBe(429);
  }, 120_000);
});
