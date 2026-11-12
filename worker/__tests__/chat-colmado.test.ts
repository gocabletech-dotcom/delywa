// @vitest-environment node
// Pruebas con D1 local en memoria, IA y WhatsApp simulados: no se llama a OpenAI ni a Meta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { chatWebSesiones, colmados, deliveries, diccionarioJerga, jergaAprendizaje, pedidos, whatsappConversaciones, whatsappMensajes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { ia } from "../chat/adaptador";
import { http } from "../lib/whatsapp";
import { pausaWeb } from "../routes/chat-colmado";

let t: Awaited<ReturnType<typeof createTestApp>>;
let colmado: typeof colmados.$inferSelect;
const crearOriginal = ia.crear;
const fetchOriginal = http.fetch;
const pausaOriginal = [...pausaWeb];
const salientes: string[] = [];
let sessionId = "";
const c = () => t.client();

beforeAll(async () => {
  t = await createTestApp();
  pausaWeb[0] = 0; pausaWeb[1] = 0;
  // Sin WhatsApp Business: el chat de la página igual funciona.
  [colmado] = await t.db.insert(colmados).values({ nombre: "Colmado El Sol", slug: "colmado-el-sol", whatsappNumero: "18094440001", direccion: "Calle 1",
    planId: 1, horaApertura: "00:00", horaCierre: "23:59", costoDelivery: "50" }).returning();
  ia.crear = () => ({ chat: { completions: { create: async (args: any) => {
    const ultimo = String(args.messages.at(-1).content).toLowerCase();
    const datos = ultimo.includes("una fr")
      ? { respuesta: "Anotada una Presidente bien fría 🍺", productos: [{ nombre: "Cerveza Presidente", monto: 150, cantidad: 1, jergaOriginal: "una fria" }], crearPedido: false }
      : ultimo.includes("pan")
      ? { respuesta: "Anotado: 2 panes. ¿A qué dirección te lo enviamos?", productos: [{ nombre: "Pan", monto: 50, cantidad: 2, jergaOriginal: "pan" }], crearPedido: false }
      : { respuesta: "¡Hola! ¿Qué deseas pedir?", productos: null, crearPedido: false };
    return { choices: [{ message: { content: JSON.stringify(datos) } }] };
  } } } }) as any;
  http.fetch = async (url) => { salientes.push(url); return new Response("{}", { status: 200 }); };
}, 60_000);
afterAll(async () => { ia.crear = crearOriginal; http.fetch = fetchOriginal; pausaWeb[0] = pausaOriginal[0]; pausaWeb[1] = pausaOriginal[1]; await t?.dispose(); });

describe("chat del colmado en la página", () => {
  it("muestra el colmado y pide nombre y teléfono", async () => {
    const info = await c().request("GET", "/api/chat-colmado/colmado-el-sol/info");
    expect(info.json).toMatchObject({ nombre: "Colmado El Sol", estaAbierto: true });
    expect((await c().request("POST", "/api/chat-colmado/colmado-el-sol/sesion", { nombre: "Ana", telefono: "12" })).status).toBe(400);
    const s = await c().request("POST", "/api/chat-colmado/colmado-el-sol/sesion", { nombre: "Ana", telefono: "809-555-7777" });
    expect(s.status).toBe(200);
    expect(s.json).toMatchObject({ telefono: "18095557777", sessionId: expect.stringMatching(/^chat_[0-9a-f]{32}$/) });
    sessionId = s.json.sessionId;
  });

  it("el bot de WhatsApp responde en la página y el colmado lo ve en Conversaciones", async () => {
    const r = await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/mensaje`, { texto: "Hola" });
    expect(r.status).toBe(200);
    const m = await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`);
    expect(m.json.mensajes.map((x: any) => [x.rol, x.contenido])).toEqual([["user", "Hola"], ["assistant", "¡Hola! ¿Qué deseas pedir?"]]);
    // Nada salió por WhatsApp.
    expect(salientes.filter((u) => u.includes("graph.facebook.com"))).toEqual([]);
    const [conv] = await t.db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.clienteWhatsapp, "18095557777"));
    const enPanel = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conv.id));
    expect(enPanel.map((x) => x.contenido)).toEqual(expect.arrayContaining(["Hola", "¡Hola! ¿Qué deseas pedir?"]));
  });

  it("solo devuelve los mensajes nuevos", async () => {
    const primeros = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`)).json.mensajes;
    await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/mensaje`, { texto: "dame 2 pan" });
    const nuevos = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes?despues=${primeros.at(-1).id}`)).json.mensajes;
    expect(nuevos.map((x: any) => x.contenido)).toEqual(["dame 2 pan", "Anotado: 2 panes. ¿A qué dirección te lo enviamos?"]);
  });

  it("aprende la jerga igual que por WhatsApp y alimenta el diccionario del país", async () => {
    await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/mensaje`, { texto: "mándame una fría" });
    const propia = await t.db.select().from(diccionarioJerga).where(eq(diccionarioJerga.colmadoId, colmado.id));
    expect(propia.map((j) => [j.jerga, j.productoIdentificado])).toContainEqual(["una fria", "Cerveza Presidente"]);
    const pais = await t.db.select().from(jergaAprendizaje).where(eq(jergaAprendizaje.colmadoId, colmado.id));
    expect(pais.map((j) => j.jerga)).toContain("una fria");
  });

  it("nadie se hace pasar por un repartidor desde la página", async () => {
    await t.db.insert(deliveries).values({ colmadoId: colmado.id, nombre: "Rafa", whatsappNumero: "18095558888", estado: "activo", codigoAcceso: "ABC123" } as any);
    const s = await c().request("POST", "/api/chat-colmado/colmado-el-sol/sesion", { nombre: "X", telefono: "8095558888" });
    await c().request("POST", `/api/chat-colmado/sesion/${s.json.sessionId}/mensaje`, { texto: "activo" });
    const m = (await c().request("GET", `/api/chat-colmado/sesion/${s.json.sessionId}/mensajes`)).json.mensajes;
    // Lo atiende como cliente (la IA), no como comando de repartidor.
    expect(m.at(-1).contenido).toBe("¡Hola! ¿Qué deseas pedir?");
  });

  it("el comprobante se pega al pedido de la sesión", async () => {
    expect((await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/comprobante`, { comprobanteUrl: "https://otro.com/x.png" })).status).toBe(400);
    const url = "/uploads/comprobantes/00000000-0000-4000-8000-000000000000.jpg";
    expect((await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/comprobante`, { comprobanteUrl: url })).status).toBe(400);
    const [p] = await t.db.insert(pedidos).values({ colmadoId: colmado.id, clienteNombre: "Ana", clienteWhatsapp: "18095557777", clienteUbicacion: "Calle 2",
      productos: "[]", total: "100", montoPago: "0", metodoPago: "transferencia", estado: "esperando_pago" } as any).returning();
    await t.db.update(chatWebSesiones).set({ pedidoId: p.id }).where(eq(chatWebSesiones.sessionId, sessionId));
    expect((await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/comprobante`, { comprobanteUrl: url })).status).toBe(200);
    expect((await t.db.select().from(pedidos).where(eq(pedidos.id, p.id)))[0].comprobanteUrl).toBe(url);
    const m = await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`);
    expect(m.json.pedido).toMatchObject({ id: p.id, estado: "esperando_pago" });
  });

  it("un colmado apagado no abre el chat; una sesión falsa no lee nada", async () => {
    expect((await c().request("GET", `/api/chat-colmado/sesion/chat_${"0".repeat(32)}/mensajes`)).status).toBe(404);
    await t.db.update(colmados).set({ estado: "pendiente_revision" }).where(eq(colmados.id, colmado.id));
    expect((await c().request("GET", "/api/chat-colmado/colmado-el-sol/info")).status).toBe(404);
    expect((await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/mensaje`, { texto: "hola" })).status).toBe(404);
    await t.db.update(colmados).set({ estado: "activo" }).where(eq(colmados.id, colmado.id));
  });
});
