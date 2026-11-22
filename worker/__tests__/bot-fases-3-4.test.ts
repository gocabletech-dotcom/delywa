// @vitest-environment node
// Fases 3 y 4 del bot del chat de la página: IA con el menú y cupo gratis, y aprender de las correcciones
// del colmadero. D1 local en memoria e IA simulada: no se llama a Cloudflare AI, OpenAI ni Meta.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { botCorrecciones, chatWebSesiones, colmados, diccionarioJerga, iaConsumo, menuProductos, pedidos } from "@shared/schema";
import { createTestApp } from "./helpers";
import { http } from "../lib/whatsapp";
import { tiempos } from "../routes/chat-colmado";
import { workersAI } from "../bot/ia";
import { createUser } from "../storage/users";
import { upsertConfiguracion } from "../storage/catalogos";
import { CLAVE_CUPO, diaIa, neuronasTexto, neuronasVoz } from "../lib/cupo-ia";
import { apareceEnMensaje, leerPedido, singular } from "../bot/productos";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client;
let colmado: typeof colmados.$inferSelect;
const fetchOriginal = http.fetch;
const tiemposOriginales = { ...tiempos };
const runOriginal = workersAI.run;
let llamadasIA = 0;
let ultimoPrompt = "";
let respuestaIA: unknown = null;
const c = () => t.client();

async function abrir(telefono: string, nombre = "Ana") {
  const s = await c().request("POST", "/api/chat-colmado/colmado-la-luna/sesion", { nombre, telefono });
  expect(s.status).toBe(200);
  return s.json.sessionId as string;
}
async function decir(sessionId: string, texto: string) {
  const antes = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes`)).json.mensajes.at(-1)?.id ?? 0;
  const r = await c().request("POST", `/api/chat-colmado/sesion/${sessionId}/mensaje`, { texto });
  expect(r.status).toBe(200);
  const nuevos = (await c().request("GET", `/api/chat-colmado/sesion/${sessionId}/mensajes?despues=${antes}`)).json.mensajes;
  return nuevos.filter((m: any) => m.rol === "assistant");
}
async function pedidoCompleto(telefono: string, mensaje: string) {
  const id = await abrir(telefono);
  await decir(id, mensaje);
  await decir(id, "eso es todo");
  await decir(id, "Calle Luna #3, frente al parque");
  await decir(id, "tarjeta");
  const [s] = await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, id));
  expect(s.pedidoId).toBeTruthy();
  return s.pedidoId!;
}

beforeAll(async () => {
  t = await createTestApp();
  Object.assign(tiempos, { rapidoMs: 0, normalMs: 0, entreMensajesMs: 0 });
  [colmado] = await t.db.insert(colmados).values({ nombre: "Colmado La Luna", slug: "colmado-la-luna", whatsappNumero: "18094440002", direccion: "Calle 2, Villa Mella",
    planId: 1, horaApertura: "00:00", horaCierre: "23:59", costoDelivery: "50" }).returning();
  await t.db.insert(menuProductos).values([
    { colmadoId: colmado.id, nombre: "Presidente grande", precio: "200" },
    { colmadoId: colmado.id, nombre: "Salami Induveca", precio: "150" },
  ]);
  const d = await createUser(t.db, { idPrefix: "owner", email: "luna@delywa.test", password: "luna-clave-123", firstName: "Lulu", role: "colmado_owner", colmadoId: colmado.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, colmado.id));
  dueno = t.client();
  expect((await dueno.request("POST", "/api/auth/login", { username: "luna@delywa.test", password: "luna-clave-123" })).status).toBe(200);
  http.fetch = async () => new Response("{}", { status: 200 });
  workersAI.simulada = true;
  workersAI.run = async (_env, modelo, entrada: any) => {
    llamadasIA++;
    if (modelo.includes("whisper")) return { text: "dos fundas de pan" };
    ultimoPrompt = entrada.messages?.[0]?.content ?? "";
    return { response: respuestaIA ?? { tipo: "otro", productos: [], respuesta: null }, usage: { prompt_tokens: 900, completion_tokens: 120 } };
  };
}, 60_000);
afterAll(async () => {
  http.fetch = fetchOriginal; Object.assign(tiempos, tiemposOriginales); workersAI.run = runOriginal; workersAI.simulada = false;
  await t?.dispose();
});
beforeEach(async () => {
  respuestaIA = null;
  await t.db.delete(iaConsumo);
  await upsertConfiguracion(t.db, CLAVE_CUPO, "9000");
});

describe("reglas nuevas", () => {
  it("singular y jerga con o sin plural", () => {
    expect(singular("cervezas")).toBe("cerveza");
    expect(singular("panes")).toBe("pan");
    expect(singular("tres")).toBe("tres");
    const jerga = new Map([["cervezas jumbo presidente", "Presidente grande"]]);
    expect(leerPedido("dame 3 cerveza jumbo presidente", jerga)).toMatchObject([{ nombre: "Presidente grande", cantidad: 3 }]);
  });

  it("la IA no puede inventar productos que el cliente no nombró", () => {
    expect(apareceEnMensaje("la de botella verde", "mándame la de botella verde")).toBe(true);
    expect(apareceEnMensaje("sebolla", "dame una cebolla")).toBe(true);
    expect(apareceEnMensaje("Aceite Crisol", "dame dos libras de arroz")).toBe(false);
  });

  it("cuenta las neuronas como la tabla de precios de Cloudflare", () => {
    // 1,000 tokens de entrada + 100 de salida en Llama 3.3 70B ≈ 26.7 + 20.5.
    expect(Math.round(neuronasTexto(4000, 100))).toBe(47);
    // Nota de 15 s en WebM (unos 45 KB) ≈ 12 neuronas.
    expect(Math.round(neuronasVoz(60_000))).toBe(12);
  });
});

describe("fase 3: IA con el menú y sin pasarse del cupo gratis", () => {
  it("la IA recibe el menú, quita lo inventado y pregunta si entendió bien", async () => {
    const id = await abrir("8095550301", "Rosa");
    respuestaIA = { tipo: "productos", respuesta: null, productos: [
      { nombre: "Presidente grande", cantidad: 2, unidad: null, jergaOriginal: "de las verdes grandes" },
      { nombre: "Aceite Crisol", cantidad: 1, unidad: null, jergaOriginal: "aceite" },
    ] };
    const r = await decir(id, "mándame dos de las verdes grandes que tú sabe, la de siempre mi hermano");
    expect(ultimoPrompt).toContain("Presidente grande, Salami Induveca");
    expect(r[0].contenido).toContain("Creo que me pediste esto");
    expect(r[0].contenido).toContain("De las verdes grandes");
    expect(r[0].contenido).not.toContain("Aceite");
    expect(r[0].opciones.map((o: any) => o.texto)).toEqual(["Sí, está bien", "Corregir", "Eso es todo"]);
    const [hoy] = await t.db.select().from(iaConsumo).where(eq(iaConsumo.dia, diaIa()));
    expect(hoy.llamadasTexto).toBe(1);
    expect(hoy.neuronas).toBeGreaterThan(40);
  });

  it("sin cupo no llama a la IA: el mensaje le llega al colmado", async () => {
    await upsertConfiguracion(t.db, CLAVE_CUPO, "0");
    const id = await abrir("8095550302", "Beto");
    const antes = llamadasIA;
    respuestaIA = { tipo: "pregunta", productos: [], respuesta: "Sí." };
    const r = await decir(id, "?? jajaja ??");
    expect(llamadasIA).toBe(antes);
    expect(r[0].contenido).toContain("no te entendí");
    const [hoy] = await t.db.select().from(iaConsumo).where(eq(iaConsumo.dia, diaIa()));
    expect(hoy.sinCupo).toBe(1);
  });

  it("sin cupo, la nota de voz no se transcribe y se le pide que escriba", async () => {
    await upsertConfiguracion(t.db, CLAVE_CUPO, "0");
    const id = await abrir("8095550303", "Lola");
    const antes = llamadasIA;
    const r = await c().request("POST", `/api/chat-colmado/sesion/${id}/voz`, { audioData: `data:audio/webm;base64,${btoa("audio")}` });
    expect(r.status).toBe(422);
    expect(r.json.error).toContain("no puedo escuchar notas de voz");
    expect(llamadasIA).toBe(antes);
  });

  it("el cupo nunca pasa de lo gratis y se ve en Plataforma", async () => {
    const admin = t.client();
    await createUser(t.db, { idPrefix: "admin", email: "plat@delywa.test", password: "plataforma-123", firstName: "P", role: "platform_admin" });
    expect((await admin.request("POST", "/api/auth/login", { username: "plat@delywa.test", password: "plataforma-123" })).status).toBe(200);
    expect((await admin.request("PUT", "/api/admin/bot-chat/cupo", { cupo: 20000 })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/bot-chat/cupo", { cupo: 7000 })).status).toBe(200);
    const r = await admin.request("GET", "/api/admin/bot-chat");
    expect(r.json.ia).toMatchObject({ cupo: 7000, gratis: 10000 });
    expect((await dueno.request("PUT", "/api/admin/bot-chat/cupo", { cupo: 100 })).status).toBe(403);
  });
});

describe("fase 4: aprende de las correcciones del colmadero", () => {
  const confirmar = (pedidoId: number, nombre: string, original: string) =>
    dueno.request("POST", `/api/pedidos/${pedidoId}/confirmar`, {
      totalConfirmado: "450", sustituciones: [], productosAdicionales: [],
      productosActualizados: [{ nombre, cantidad: 2, monto: 200, textoOriginal: original, encontradoEnMenu: false }],
    });

  it("a la segunda vez en otro pedido lo aprende, y se puede olvidar", async () => {
    const p1 = await pedidoCompleto("8095550401", "dame 2 frias de litro");
    const [anotado] = JSON.parse((await t.db.select().from(pedidos).where(eq(pedidos.id, p1)))[0].productos);
    expect((await confirmar(p1, "Presidente grande", anotado.nombre)).status).toBe(200);
    let [fila] = await t.db.select().from(botCorrecciones).where(eq(botCorrecciones.colmadoId, colmado.id));
    expect(fila).toMatchObject({ dicho: "frias de litro", producto: "Presidente grande", veces: 1, estado: "esperando" });

    const p2 = await pedidoCompleto("8095550402", "dame 2 frias de litro");
    expect((await confirmar(p2, "Presidente grande", anotado.nombre)).status).toBe(200);
    [fila] = await t.db.select().from(botCorrecciones).where(eq(botCorrecciones.colmadoId, colmado.id));
    expect(fila).toMatchObject({ veces: 2, estado: "aprendida" });

    // Ahora el bot escribe el producto como el colmadero.
    const id = await abrir("8095550403", "Nelo");
    const r = await decir(id, "mándame 3 fria de litro");
    expect(r[0].contenido).toContain("3 Presidente grande");

    const lista = await dueno.request("GET", `/api/colmados/${colmado.id}/bot-aprendido`);
    expect(lista.json.correcciones).toHaveLength(1);
    const olvidado = await dueno.request("DELETE", `/api/colmados/${colmado.id}/bot-aprendido/${fila.id}`);
    expect(olvidado.json.correcciones[0].estado).toBe("descartada");
    const dicc = await t.db.select().from(diccionarioJerga).where(and(eq(diccionarioJerga.colmadoId, colmado.id), eq(diccionarioJerga.jerga, "frias de litro")));
    expect(dicc).toHaveLength(0);
    // Descartada: aunque la vuelva a corregir, no se aprende sola.
    const p3 = await pedidoCompleto("8095550404", "dame 2 frias de litro");
    await confirmar(p3, "Presidente grande", anotado.nombre);
    [fila] = await t.db.select().from(botCorrecciones).where(eq(botCorrecciones.colmadoId, colmado.id));
    expect(fila.estado).toBe("descartada");
  });

  it("no aprende de cambios de ortografía, ni de pedidos que no son del chat; «Enseñar ya» lo aprende de una", async () => {
    const p1 = await pedidoCompleto("8095550405", "un salamii");
    await confirmar(p1, "Salami", "Salamii");
    const otros = await t.db.select().from(botCorrecciones).where(and(eq(botCorrecciones.colmadoId, colmado.id), eq(botCorrecciones.dicho, "salamii")));
    expect(otros).toHaveLength(0);

    const p2 = await pedidoCompleto("8095550406", "un salami de los buenos");
    await confirmar(p2, "Salami Induveca", "Salami de los buenos");
    const [fila] = await t.db.select().from(botCorrecciones).where(and(eq(botCorrecciones.colmadoId, colmado.id), eq(botCorrecciones.producto, "Salami Induveca")));
    expect(fila.estado).toBe("esperando");
    const r = await dueno.request("POST", `/api/colmados/${colmado.id}/bot-aprendido/${fila.id}/ensenar`);
    expect(r.json.correcciones.find((x: any) => x.id === fila.id).estado).toBe("aprendida");
  });
});
