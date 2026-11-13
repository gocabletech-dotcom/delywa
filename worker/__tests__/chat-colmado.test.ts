// @vitest-environment node
// Pruebas con D1 local en memoria e IA simulada: no se llama a Cloudflare AI, OpenAI ni Meta.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { botNoEntendidos, botRegistro, chatWebMensajes, chatWebSesiones, clienteDirecciones, clientes, colmados, diccionarioJerga, pedidos, whatsappConversaciones, whatsappMensajes } from "@shared/schema";
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

async function abrir(telefono: string, nombre = "Ana", aparato?: string) {
  const s = await c().request("POST", "/api/chat-colmado/colmado-el-sol/sesion", { nombre, telefono, aparato });
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

  it("al cliente que vuelve se le pide la ubicación de nuevo, sin mostrar la anterior", async () => {
    const id = await abrir("8095551111", "Luis");
    await decir(id, "una funda de hielo");
    const r = await decir(id, "eso es todo");
    expect(r[0].contenido).toContain("¿A dónde te lo llevamos?");
    expect(r[0].contenido).not.toContain("Duarte");
    expect(r[0].opciones.map((o: any) => o.texto)).toEqual(["📍 Enviar mi ubicación"]);
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

describe("casa guardada, inactividad y memoria del último pedido", () => {
  const A = "a".repeat(32), B = "b".repeat(32);
  const tel = "8095553333";
  let id = "";
  async function ubicar(sessionId: string, latitude: number, longitude: number) {
    const antes = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`)).json.mensajes.at(-1)?.id ?? 0;
    expect((await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/ubicacion`, { latitude, longitude })).status).toBe(200);
    return (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes?despues=${antes}`)).json.mensajes.filter((m: any) => m.rol === "assistant");
  }
  const entregar = async (sessionId: string) => {
    const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, sessionId));
    await t.db.update(pedidos).set({ estado: "entregado" }).where(eq(pedidos.id, s.pedidoId!));
  };

  it("después del primer pedido ofrece guardar la dirección como su casa", async () => {
    id = await abrir(tel, "Marta", A);
    await decir(id, "un pan");
    await decir(id, "eso es todo");
    const u = await ubicar(id, 18.48, -69.9);
    expect(textos(u)).toContain("¿Cómo vas a pagar?");
    const r = await decir(id, "tarjeta");
    expect(r.at(-1).contenido).toContain("¿Guardo esta dirección como tu casa?");
    const g = await decir(id, "Sí, es mi casa");
    expect(g[0].contenido).toContain("¡Guardada!");
    const casas = await t.db.select().from(clienteDirecciones);
    expect(casas).toHaveLength(1);
    expect(casas[0].etiqueta).toBe("Casa");
    expect(Number(casas[0].latitud)).toBeCloseTo(18.48);
  });

  it("«llévamelo a mi casa» usa la dirección guardada y no la muestra al cliente", async () => {
    await entregar(id);
    const r = await decir(id, "una malta, llévamela a mi casa");
    expect(r[0].contenido).toContain("Malta");
    expect(r[0].contenido.toLowerCase()).not.toContain("casa");
    const r2 = await decir(id, "eso es todo");
    expect(r2.map((m: any) => m.contenido)).toEqual(["🏠 Te lo llevamos a tu casa.", "¿Cómo vas a pagar?"]);
    const r3 = await decir(id, "tarjeta");
    expect(r3[0].contenido).toContain("🏠 Tu casa (dirección guardada)");
    expect(r3[0].contenido).not.toContain("18.48");
    expect(r3).toHaveLength(1); // ya tiene casa: no se ofrece otra vez
    const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, id));
    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, s.pedidoId!));
    expect(p.clienteUbicacion).toContain("🏠 Casa (guardada)");
    expect(Number(p.clienteLatitud)).toBeCloseTo(18.48);
  });

  it("si manda una ubicación lejos de su casa, pregunta a cuál de las dos va", async () => {
    await entregar(id);
    await decir(id, "un pan");
    const r = await decir(id, "eso es todo");
    expect(r[0].opciones.map((o: any) => o.texto)).toEqual(["📍 Enviar mi ubicación", "🏠 A mi casa"]);
    const lejos = await ubicar(id, 18.6, -69.9);
    expect(lejos[0].contenido).toContain("estás en otro lugar");
    const r2 = await decir(id, "🏠 A mi casa");
    expect(r2.map((m: any) => m.contenido)).toEqual(["🏠 Perfecto, te lo llevamos a tu casa.", "¿Cómo vas a pagar?"]);
    const r3 = await decir(id, "tarjeta");
    expect(r3[0].contenido).toContain("🏠 Tu casa (dirección guardada)");
  });

  it("cerca de su casa no pregunta; y «aquí donde estoy» respeta la ubicación nueva", async () => {
    await entregar(id);
    await decir(id, "un pan");
    await decir(id, "eso es todo");
    expect(textos(await ubicar(id, 18.4801, -69.9001))).toContain("¿Cómo vas a pagar?");
    await decir(id, "tarjeta");
    await entregar(id);
    await decir(id, "un pan");
    await decir(id, "eso es todo");
    await ubicar(id, 18.6, -69.9);
    const r = await decir(id, "📍 Aquí donde estoy");
    expect(r[0].contenido).toContain("ahí donde estás");
    const fin = await decir(id, "tarjeta");
    expect(fin[0].contenido).toContain("Tu ubicación compartida");
    const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, id));
    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, s.pedidoId!));
    expect(Number(p.clienteLatitud)).toBeCloseTo(18.6);
  });

  it("10 minutos sin actividad: se cierra y solo se reabre con el mismo teléfono y aparato", async () => {
    const viejo = new Date(Date.now() - 11 * 60_000);
    await t.db.update(chatWebSesiones).set({ fechaUltimaActividad: viejo }).where(eq(chatWebSesiones.sessionId, id));
    await t.db.update(chatWebMensajes).set({ fechaCreacion: viejo }).where(eq(chatWebMensajes.sessionId, id));
    const cerrado = await c().request("GET", `/api/chat-colmado/sesion/${id}/mensajes`);
    expect(cerrado.status).toBe(423);
    expect(cerrado.json.inactiva).toBe(true);
    expect((await c().request("POST", `/api/chat-colmado/sesion/${id}/mensaje`, { texto: "hola" })).status).toBe(423);
    // Otro aparato con el mismo número: conversación nueva, sin el historial.
    const otro = await abrir(tel, "Marta", B);
    expect(otro).not.toBe(id);
    expect((await c().request("GET", `/api/chat-colmado/sesion/${otro}/mensajes`)).json.mensajes).toHaveLength(0);
    // Mismo aparato: la misma conversación, con sus mensajes.
    const s = await c().request("POST", "/api/chat-colmado/colmado-el-sol/sesion", { nombre: "Marta", telefono: tel, aparato: A });
    expect(s.json.sessionId).toBe(id);
    expect(s.json.reanudada).toBe(true);
    expect((await c().request("GET", `/api/chat-colmado/sesion/${id}/mensajes`)).json.mensajes.length).toBeGreaterThan(5);
  });

  it("un mensaje reciente del colmado mantiene el chat abierto", async () => {
    await t.db.update(chatWebSesiones).set({ fechaUltimaActividad: new Date(Date.now() - 11 * 60_000) }).where(eq(chatWebSesiones.sessionId, id));
    await t.db.insert(chatWebMensajes).values({ sessionId: id, rol: "assistant", contenido: "Tu pedido va en camino" });
    expect((await c().request("GET", `/api/chat-colmado/sesion/${id}/mensajes`)).status).toBe(200);
  });

  it("otro día: conversación nueva que recuerda el último pedido solo en el mismo aparato", async () => {
    const antier = new Date(Date.now() - 2 * 24 * 3600_000);
    await t.db.update(chatWebSesiones).set({ fechaCreacion: antier }).where(and(eq(chatWebSesiones.clienteWhatsapp, "18095553333")));
    const nueva = await abrir(tel, "Marta", A);
    expect(nueva).not.toBe(id);
    expect((await c().request("GET", `/api/chat-colmado/sesion/${nueva}/mensajes`)).json.mensajes).toHaveLength(0);
    const hola = await decir(nueva, "Hola");
    expect(hola[0].contenido).toContain("Marta");
    expect(hola[0].opciones.map((o: any) => o.texto)).toEqual(["🔁 Repetir mi último pedido"]);
    const rep = await decir(nueva, "🔁 Repetir mi último pedido");
    expect(rep[0].contenido).toContain("Tu último pedido 🔁");
    expect(rep[0].contenido).toContain("Pan");
    // Un aparato que nunca se usó con ese número no puede ver el pedido anterior.
    const C = "c".repeat(32);
    const ajeno = await abrir(tel, "Marta", C);
    const hola2 = await decir(ajeno, "Hola");
    expect(hola2[0].opciones ?? null).toBeNull();
    const rep2 = await decir(ajeno, "repetir mi último pedido");
    expect(rep2[0].contenido).toContain("Por seguridad");
    expect(rep2[0].contenido).not.toContain("Pan");
    // Los datos del cliente siguen en el sistema.
    const [cl] = await t.db.select().from(clientes).where(eq(clientes.whatsappNumero, "18095553333"));
    expect(cl.nombre).toBe("Marta");
  });
});

describe("pedido por dinero en el chat", () => {
  it("«10 pesos de ajo» se anota como RD$10 y llega al colmado con ese precio", async () => {
    const id = await abrir("8095554444", "Pedro");
    const r = await decir(id, "dame 10 pesos de ajo y 2 libras de arroz");
    expect(r[0].contenido).toContain("• RD$10 de Ajo");
    expect(r[0].contenido).toContain("• 2 libras de Arroz");
    const r2 = await decir(id, "y 15 de ajo");
    expect(r2[0].contenido).toContain("• RD$15 de Ajo");
    await decir(id, "eso es todo");
    await decir(id, "Calle Sol #5, frente al parque");
    const fin = await decir(id, "tarjeta");
    expect(fin[0].contenido).toContain("• RD$25 de Ajo");
    const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, id));
    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, s.pedidoId!));
    const productos = typeof p.productos === "string" ? JSON.parse(p.productos) : p.productos;
    expect(productos).toContainEqual({ nombre: "Ajo (RD$25)", cantidad: 1, monto: 25 });
    expect(productos).toContainEqual({ nombre: "Arroz (libras)", cantidad: 2, monto: null });
  });

  it("cuando el colmado confirma, el chat sigue ligado al pedido (no empieza uno nuevo)", async () => {
    const id = await abrir("8095554444", "Pedro", "d".repeat(32));
    await decir(id, "un pan");
    await decir(id, "eso es todo");
    await decir(id, "Calle Sol #5, frente al parque");
    await decir(id, "tarjeta");
    await t.db.update(chatWebSesiones).set({ estadoConversacion: "finalizado" }).where(eq(chatWebSesiones.sessionId, id));
    const r = await decir(id, "gracias");
    expect(r[0].contenido).toContain("¡A la orden");
    expect(r[0].contenido).not.toContain("pedir");
  });
});

describe("sustitución de un producto en el chat de la página", () => {
  it("el cliente acepta un cambio y rechaza otro: el pedido queda confirmado con el total corregido", async () => {
    const id = await abrir("8095556666", "Carla");
    await decir(id, "un pan, una malta y un queso");
    await decir(id, "eso es todo");
    await decir(id, "Calle Luna #8, casa azul");
    await decir(id, "efectivo");
    await decir(id, "1000");
    const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, id));
    // Lo que hace el panel al confirmar con sustituciones.
    await t.db.update(pedidos).set({
      estado: "esperando_confirmacion_sustituciones", total: "350.00", totalConfirmado: "350.00",
      productos: JSON.stringify([{ nombre: "Pan", cantidad: 1, monto: 50 }, { nombre: "Malta", cantidad: 1, monto: 100 }, { nombre: "Queso", cantidad: 1, monto: 150 }]),
      sustituciones: [{ original: "Malta", nuevo: "Malta Morena", monto: 100, estado: "pendiente" }, { original: "Queso", nuevo: "Queso amarillo", monto: 150, estado: "pendiente" }],
    }).where(eq(pedidos.id, s.pedidoId!));
    await t.db.update(chatWebSesiones).set({ estadoConversacion: "esperando_confirmacion_sustitucion" }).where(eq(chatWebSesiones.sessionId, id));

    const duda = await decir(id, "¿y eso?");
    expect(duda[0].contenido).toContain("Malta Morena");
    expect(duda[0].opciones.map((o: any) => o.texto)).toEqual(["Sí, acepto", "No, quítalo"]);

    const r1 = await decir(id, "Sí, acepto");
    expect(r1[0].contenido).toContain("aceptaste el cambio");
    expect(r1[0].contenido).toContain("Queso amarillo");
    const r2 = await decir(id, "No, quítalo");
    expect(r2[0].contenido).toContain("quitamos *Queso*");
    expect(r2[0].contenido).toContain("Total a pagar: RD$200");
    expect(r2[0].contenido).toContain("devuelta: RD$800");

    const [p] = await t.db.select().from(pedidos).where(eq(pedidos.id, s.pedidoId!));
    expect(p.estado).toBe("pendiente");
    expect(Number(p.total)).toBe(200);
    expect(JSON.parse(p.productos).map((x: any) => x.nombre)).toEqual(["Pan", "Malta Morena"]);
    expect(p.sustituciones!.map((x) => x.estado)).toEqual(["aceptada", "rechazada"]);
  });
});

