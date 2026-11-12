// @vitest-environment node
// Pruebas con D1 local en memoria, datos inventados, IA y WhatsApp simulados:
// no se llama a OpenAI ni a Meta y nunca se toca la base real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, menuPlantillas, plantillasJerga, whatsappConversaciones, whatsappMensajes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { addMensaje } from "../storage/conversaciones";
import { ia } from "../chat/adaptador";
import { http } from "../lib/whatsapp";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let admin: Client, dueno: Client;
let respuestaIA = "{}";
const crearOriginal = ia.crear;
const fetchOriginal = http.fetch;
let salientes: Array<{ url: string; body: unknown }> = [];

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  ia.crear = () => ({ chat: { completions: { create: async () => ({ choices: [{ message: { content: respuestaIA } }] }) } } }) as any;
  http.fetch = async (url, init) => {
    salientes.push({ url, body: init?.body });
    return new Response(url.endsWith("/media") ? JSON.stringify({ id: "media-123" }) : "{}", { status: 200 });
  };
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "admin1234", firstName: "Ada", role: "platform_admin" });
  const [negocio] = await t.db.insert(colmados).values({ nombre: "N", slug: "n-gen", whatsappNumero: "18091112222", direccion: "A", planId: 1,
    whatsappPhoneNumberId: "PN-VOZ", whatsappAccessToken: "tok", tecnologiasHabilitadas: { meta: true } }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  admin = await login("admin@delywa.test", "admin1234");
  dueno = await login("dueno@delywa.test", "dueno1234");
}, 60_000);
afterAll(async () => { ia.crear = crearOriginal; http.fetch = fetchOriginal; await t?.dispose(); });

describe("generación de plantillas de menú con IA", () => {
  it("solo el administrador de la plataforma la usa", async () => {
    expect((await dueno.request("POST", "/api/admin/plantillas/generar", { tipoNegocio: "x", nombreTipo: "X" })).status).toBe(403);
    expect((await t.client().request("POST", "/api/admin/plantillas/generar", {})).status).toBe(401);
  });

  it("guarda las categorías y productos que devuelve la IA", async () => {
    respuestaIA = JSON.stringify({ categorias: [
      { nombre: "Pizzas", orden: 1, productos: [{ nombre: "Pepperoni", precioSugerido: "450", orden: 1 }, { nombre: "Hawaiana", precioSugerido: "abc", orden: 2 }] },
      { nombre: "Bebidas", orden: 2, productos: [{ nombre: "Refresco", precioSugerido: "60", orden: 1 }] },
    ] });
    const r = await admin.request("POST", "/api/admin/plantillas/generar", { tipoNegocio: "pizzeria_prueba", nombreTipo: "Pizzería" });
    expect(r.status).toBe(200);
    expect(r.json.message).toBe("Se crearon 2 categorías para Pizzería");
    const pizzas = r.json.plantillas.find((p: any) => p.categoria === "Pizzas");
    expect(pizzas.items.map((i: any) => [i.nombre, i.precioSugerido])).toEqual([["Pepperoni", "450.00"], ["Hawaiana", "0.00"]]);
    // Ya existe: no se duplica.
    expect((await admin.request("POST", "/api/admin/plantillas/generar", { tipoNegocio: "pizzeria_prueba", nombreTipo: "Pizzería" })).status).toBe(400);
    expect(await t.db.select().from(menuPlantillas).where(eq(menuPlantillas.tipoNegocio, "pizzeria_prueba"))).toHaveLength(2);
  });

  it("si la IA responde algo inválido no guarda nada", async () => {
    respuestaIA = "no es json";
    expect((await admin.request("POST", "/api/admin/plantillas/generar", { tipoNegocio: "otro_tipo", nombreTipo: "Otro" })).status).toBe(500);
    respuestaIA = JSON.stringify({ categorias: [] });
    expect((await admin.request("POST", "/api/admin/plantillas/generar", { tipoNegocio: "otro_tipo", nombreTipo: "Otro" })).status).toBe(500);
    expect(await t.db.select().from(menuPlantillas).where(eq(menuPlantillas.tipoNegocio, "otro_tipo"))).toHaveLength(0);
  });
});

describe("generación de jerga con IA", () => {
  it("crea la jerga del tipo de negocio sin repetir expresiones", async () => {
    respuestaIA = JSON.stringify({ jergas: [
      { jerga: "Muslito", producto: "Muslo de pollo", precio: 120, descripcion: "pieza" },
      { jerga: "muslito", producto: "Muslo de pollo", precio: null },
      { jerga: "Papitas", producto: "Papas fritas", precio: null },
    ] });
    const r = await admin.request("POST", "/api/admin/jerga/generar-ia", { tipoNegocio: "pica_pollo" });
    expect(r.status).toBe(200);
    const filas = await t.db.select().from(plantillasJerga).where(eq(plantillasJerga.tipoNegocio, "pica_pollo"));
    expect(filas.map((f) => f.jerga).sort()).toEqual(["muslito", "papitas"]);
    expect((await dueno.request("POST", "/api/admin/jerga/generar-ia", { tipoNegocio: "pica_pollo" })).status).toBe(403);
  });

  it("limita las generaciones por administrador", async () => {
    respuestaIA = JSON.stringify({ jergas: [] });
    let ultimo = 200;
    for (let i = 0; i < 20; i++) ultimo = (await admin.request("POST", "/api/admin/jerga/generar-ia", { tipoNegocio: "colmado" })).status;
    expect(ultimo).toBe(429);
  });
});

describe("nota de voz desde el panel", () => {
  it("sube el audio a Meta y lo envía dentro de la ventana de 24 horas", async () => {
    const [negocio] = await t.db.select().from(colmados).where(eq(colmados.slug, "n-gen"));
    const [conv] = await t.db.insert(whatsappConversaciones).values({ colmadoId: negocio.id, clienteWhatsapp: "18095550123" }).returning();
    const audio = () => { const f = new FormData(); f.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "voice.ogg"); return f; };

    expect((await dueno.raw("POST", `/api/conversaciones/${conv.id}/send-voice`, audio())).status).toBe(400); // el cliente no ha escrito
    await addMensaje(t.db, conv.id, "user", "Hola");
    const noAudio = new FormData(); noAudio.append("audio", new Blob(["texto"], { type: "text/plain" }), "x.txt");
    expect((await dueno.raw("POST", `/api/conversaciones/${conv.id}/send-voice`, noAudio)).status).toBe(400);

    salientes = [];
    const ok = await dueno.raw("POST", `/api/conversaciones/${conv.id}/send-voice`, audio());
    expect(ok.status).toBe(200);
    expect(salientes.map((s) => s.url)).toEqual([expect.stringMatching(/\/PN-VOZ\/media$/), expect.stringMatching(/\/PN-VOZ\/messages$/)]);
    expect(JSON.parse(String(salientes[1].body))).toMatchObject({ to: "18095550123", type: "audio", audio: { id: "media-123" } });
    const msgs = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conv.id));
    expect(msgs.at(-1)).toMatchObject({ rol: "negocio", contenido: "[Nota de voz enviada]" });
  });
});
