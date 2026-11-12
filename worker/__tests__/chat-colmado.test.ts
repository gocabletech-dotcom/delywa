// @vitest-environment node
// Pruebas con D1 local en memoria e IA simulada: no se llama a Cloudflare AI, OpenAI ni Meta.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { botNoEntendidos, botRegistro, chatWebSesiones, colmados, diccionarioJerga, pedidos, whatsappConversaciones, whatsappMensajes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { http } from "../lib/whatsapp";
import { tiempos } from "../routes/chat-colmado";
import { workersAI } from "../bot/ia";

let t: Awaited<ReturnType<typeof createTestApp>>;
let colmado: typeof colmados.$inferSelect;
const fetchOriginal = http.fetch;
const tiemposOriginales = { ...tiempos };
const runOriginal = workersAI.run;
const salientes: string[] = [];
let llamadasIA = 0;
let respuestaIA: unknown = null;
const c = () => t.client();

async function abrir(telefono: string, nombre = "Ana") {
  const s = await c().request("POST", "/api/chat-colmado/colmado-el-sol/sesion", { nombre, telefono });
  expect(s.status).toBe(200);
  return s.json.sessionId as string;
}
/** Manda un mensaje y devuelve las respuestas nuevas del bot. */
async function decir(sessionId: string, texto: string) {
  const antes = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`)).json.mensajes.at(-1)?.id ?? 0;
  const r = await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/mensaje`, { texto });
  expect(r.status).toBe(200);
  const nuevos = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes?despues=${antes}`)).json.mensajes;
  return nuevos.filter((m: any) => m.rol === "assistant");
}
const textos = (ms: any[]) => ms.map((m) => m.contenido).join("\n---\n");

beforeAll(async () => {
  t = await createTestApp();
  Object.assign(tiempos, { rapidoMs: 0, normalMs: 0, entreMensajesMs: 0 });
  [colmado] = await t.db.insert(colmados).values({ nombre: "Colmado El Sol", slug: "colmado-el-sol", whatsappNumero: "18094440001", direccion: "Calle 1, Los Mina",
    planId: 1, horaApertura: "00:00", horaCierre: "23:59", costoDelivery: "50" }).returning();
  http.fetch = async (url) => { salientes.push(url); return new Response("{}", { status: 200 }); };
  workersAI.simulada = true;
  workersAI.run = async (_env, modelo, entrada: any) => {
    llamadasIA++;
    if (modelo.includes("whisper")) return { text: "dos fundas de pan" };
    return { response: respuestaIA ?? { tipo: "otro", productos: [], respuesta: null } };
  };
}, 60_000);
afterAll(async () => {
  http.fetch = fetchOriginal; Object.assign(tiempos, tiemposOriginales); workersAI.run = runOriginal; workersAI.simulada = false;
  await t?.dispose();
});
beforeEach(() => { respuestaIA = null; });

describe("bot por pasos del chat de la página (sin IA)", () => {
  let sessionId = "";

  it("saluda según la hora con el nombre del cliente", async () => {
    sessionId = await abrir("809-555-7777");
    const r = await decir(sessionId, "Hola");
    expect(r).toHaveLength(1);
    expect(r[0].contenido).toMatch(/^(Buenos días|Buenas tardes|Buenas noches), Ana 👋\n¿En qué te puedo ayudar\?$/);
  });

  it("anota el pedido y pregunta «¿Algo más?»", async () => {
    let r = await decir(sessionId, "dame 2 libras de arroz y una fría");
    expect(r[0].contenido).toContain("• 2 libras de Arroz");
    expect(r[0].contenido).toContain("• 1 Cerveza Presidente");
    expect(r[0].contenido).toContain("¿Algo más?");
    expect(r[0].opciones).toEqual([{ texto: "Eso es todo" }]);
    r = await decir(sessionId, "también un aceite");
    expect(r[0].contenido).toContain("• 1 Aceite");
  });

  it("«no» → muestra todo y pregunta «¿Eso es todo?»; «sí» → pide la ubicación", async () => {
    let r = await decir(sessionId, "no, nada más");
    expect(r[0].contenido).toContain("¿Eso es todo?");
    expect(r[0].contenido).toContain("• 2 libras de Arroz");
    r = await decir(sessionId, "Sí, eso es todo");
    expect(r[0].contenido).toContain("¿A dónde te lo llevamos?");
    expect(r[0].opciones).toEqual([{ texto: "📍 Enviar mi ubicación", accion: "ubicacion" }]);
  });

  it("ubicación → forma de pago → efectivo pregunta la devuelta → pedido creado", async () => {
    await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/ubicacion`, { latitude: 18.48, longitude: -69.9 });
    let ultimos = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`)).json.mensajes.slice(-2);
    expect(ultimos[1].contenido).toBe("¿Cómo vas a pagar?");
    expect(ultimos[1].opciones.map((o: any) => o.texto)).toEqual(["💵 Efectivo", "💳 Tarjeta", "🏦 Transferencia"]);

    let r = await decir(sessionId, "💵 Efectivo");
    expect(r[0].contenido).toContain("¿Con cuánto vas a pagar?");
    r = await decir(sessionId, "1000");
    expect(r[0].contenido).toMatch(/¡Listo, Ana! Este es tu pedido #\d+/);
    expect(r[0].contenido).toContain("te llevamos la devuelta");
    expect(r[0].contenido).toContain("está verificando tu pedido");

    const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, sessionId));
    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, s.pedidoId!));
    expect(p).toMatchObject({ estado: "pendiente_confirmacion", metodoPago: "efectivo", necesitaDevuelta: true, clienteWhatsapp: "18095557777", clienteLatitud: "18.4800000" });
    expect(Number(p.montoPago)).toBe(1000);
    expect(JSON.parse(String(p.productos))).toEqual([
      { nombre: "Arroz (libras)", cantidad: 2, monto: null }, { nombre: "Cerveza Presidente", cantidad: 1, monto: null }, { nombre: "Aceite", cantidad: 1, monto: null },
    ]);
    // Sin IA y sin WhatsApp.
    expect(llamadasIA).toBe(0);
    expect(salientes.filter((u) => u.includes("graph.facebook.com"))).toEqual([]);
    // El colmado ve la conversación completa en su panel.
    const [conv] = await t.db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.clienteWhatsapp, "18095557777"));
    const enPanel = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conv.id));
    expect(enPanel.length).toBeGreaterThanOrEqual(14);
  });

  it("después del pedido: estado y gracias", async () => {
    expect((await decir(sessionId, "¿cómo va mi pedido?"))[0].contenido).toContain("el colmado lo está verificando");
    expect((await decir(sessionId, "gracias"))[0].contenido).toContain("¡A la orden, Ana!");
  });

  it("tarjeta no pregunta devuelta; «eso es todo» va directo a la ubicación", async () => {
    const id = await abrir("8095551111", "Luis");
    await decir(id, "un pan");
    const r1 = await decir(id, "eso es todo");
    expect(r1[0].contenido).toContain("¿A dónde te lo llevamos?");
    const r2 = await decir(id, "Calle Duarte #12, al lado de la iglesia");
    expect(r2.map((m: any) => m.contenido)).toEqual(["📍 Anotada la dirección.", "¿Cómo vas a pagar?"]);
    const r3 = await decir(id, "tarjeta");
    expect(r3[0].contenido).toContain("💳 Tarjeta");
    expect(r3[0].contenido).not.toContain("devuelta");
  });

  it("el cliente que vuelve: «¿a la misma dirección?» sin mostrarla", async () => {
    const id = await abrir("8095551111", "Luis");
    await decir(id, "una funda de hielo");
    const r = await decir(id, "eso es todo");
    expect(r[0].contenido).toBe("¿Te lo llevamos a la misma dirección de tu último pedido?");
    expect(r[0].contenido).not.toContain("Duarte");
    const r2 = await decir(id, "Sí, a la misma");
    expect(r2[0].contenido).toBe("¿Cómo vas a pagar?");
  });

  it("contesta preguntas frecuentes sin IA y sigue en el mismo paso", async () => {
    const id = await abrir("8095552222", "Rosa");
    const r = await decir(id, "¿a qué hora cierran?");
    expect(textos(r)).toContain("Abrimos de 00:00 a 23:59");
    expect(textos(r)).toContain("¿Qué te gustaría pedir?");
    expect(llamadasIA).toBe(0);
  });
});

describe("la IA de Cloudflare solo cuando no entiende", () => {
  it("lo que entiende la IA se le enseña al diccionario", async () => {
    const id = await abrir("8095553333", "Pepe");
    const antes = llamadasIA;
    respuestaIA = { tipo: "productos", productos: [{ nombre: "Cerveza Heineken", cantidad: 1, unidad: null, jergaOriginal: "la de botella verde" }], respuesta: null };
    const r = await decir(id, "mándame la que siempre me tomo, la de botella verde que me gusta tanto");
    expect(llamadasIA).toBe(antes + 1);
    expect(r[0].contenido).toContain("• 1 Cerveza Heineken");
    const dicc = await t.db.select().from(diccionarioJerga).where(and(eq(diccionarioJerga.colmadoId, colmado.id), eq(diccionarioJerga.jerga, "la de botella verde")));
    expect(dicc).toHaveLength(1);
    const [m] = await t.db.select().from(botRegistro).where(eq(botRegistro.colmadoId, colmado.id));
    expect(m.conIa).toBeGreaterThanOrEqual(1);
  });

  it("si la IA tampoco entiende, pide que lo escriba de nuevo y lo registra", async () => {
    const id = await abrir("8095554444", "Mia");
    respuestaIA = { tipo: "otro", productos: [], respuesta: null };
    const r = await decir(id, "?? jajaja ??");
    expect(r[0].contenido).toContain("no te entendí bien");
    expect((await t.db.select().from(botNoEntendidos)).some((x) => x.texto === "?? jajaja ??")).toBe(true);
  });

  it("nota de voz con Whisper de Cloudflare", async () => {
    const id = await abrir("8095555555", "Tito");
    const audio = `data:audio/webm;base64,${btoa("audio-de-prueba")}`;
    const r = await c().request("POST", `/api/chat-colmado/sesion/${id}/voz`, { audioData: audio });
    expect(r.json).toMatchObject({ ok: true, texto: "dos fundas de pan" });
    const ms = (await c().request("GET", `/api/chat-colmado/sesion/${id}/mensajes`)).json.mensajes;
    expect(ms.map((m: any) => m.contenido)).toContain("🎤 dos fundas de pan");
    expect(textos(ms)).toContain("• 2 fundas de Pan");
  });
});

describe("seguridad del chat", () => {
  it("el comprobante se pega al pedido de la sesión", async () => {
    const id = await abrir("8095556666", "Ana");
    const url = "/uploads/comprobantes/00000000-0000-4000-8000-000000000000.jpg";
    expect((await c().request("POST", `/api/chat-colmado/sesion/${id}/comprobante`, { comprobanteUrl: "https://otro.com/x.png" })).status).toBe(400);
    expect((await c().request("POST", `/api/chat-colmado/sesion/${id}/comprobante`, { comprobanteUrl: url })).status).toBe(400);
    const [p] = await t.db.insert(pedidos).values({ colmadoId: colmado.id, clienteNombre: "Ana", clienteWhatsapp: "18095556666", clienteUbicacion: "Calle 2",
      productos: "[]", total: "100", montoPago: "0", metodoPago: "transferencia", estado: "esperando_pago" } as any).returning();
    await t.db.update(chatWebSesiones).set({ pedidoId: p.id }).where(eq(chatWebSesiones.sessionId, id));
    expect((await c().request("POST", `/api/chat-colmado/sesion/${id}/comprobante`, { comprobanteUrl: url })).status).toBe(200);
    expect((await t.db.select().from(pedidos).where(eq(pedidos.id, p.id)))[0].comprobanteUrl).toBe(url);
  });

  it("un colmado cerrado avisa; uno apagado no abre el chat; una sesión falsa no lee nada", async () => {
    const id = await abrir("8095557778", "Leo");
    await t.db.update(colmados).set({ estaAbiertoManual: false, mensajeCerrado: "Hoy cerramos temprano." }).where(eq(colmados.id, colmado.id));
    expect((await decir(id, "un pan"))[0].contenido).toContain("Hoy cerramos temprano.");
    await t.db.update(colmados).set({ estaAbiertoManual: true }).where(eq(colmados.id, colmado.id));

    expect((await c().request("GET", `/api/chat-colmado/sesion/chat_${"0".repeat(32)}/mensajes`)).status).toBe(404);
    await t.db.update(colmados).set({ estado: "pendiente_revision" }).where(eq(colmados.id, colmado.id));
    expect((await c().request("GET", "/api/chat-colmado/colmado-el-sol/info")).status).toBe(404);
    expect((await c().request("POST", `/api/chat-colmado/sesion/${id}/mensaje`, { texto: "hola" })).status).toBe(404);
    await t.db.update(colmados).set({ estado: "activo" }).where(eq(colmados.id, colmado.id));
  });
});
