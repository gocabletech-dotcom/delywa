// @vitest-environment node
// Pruebas con D1 local en memoria, datos inventados y servicios simulados:
// ninguna petición sale a Meta ni a Evolution, y nunca se toca la base real.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, solicitudesEliminacion, whatsappConversaciones, whatsappMensajes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { addMensaje } from "../storage/conversaciones";
import { getColmado } from "../storage/colmados";
import { enviarWhatsApp, whatsappDisponible } from "../lib/mensajeria";
import { firmaWebhookEvolution, graphUrl, http, urlEvolutionValida } from "../lib/whatsapp";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, operador: Client, ajeno: Client, anon: Client;
let negocio: any, otro: any;

const original = http.fetch;
type Llamada = { url: string; init?: RequestInit };
let llamadas: Llamada[] = [];
/** Simula los servicios externos: cada respuesta se elige por un trozo de la dirección. */
function simular(respuestas: Record<string, { status?: number; body?: unknown }>) {
  llamadas = [];
  http.fetch = async (url, init) => {
    llamadas.push({ url, init });
    const clave = Object.keys(respuestas).find((k) => url.includes(k));
    const r = clave ? respuestas[clave] : { status: 404, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
}
afterEach(() => { http.fetch = original; });

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}
const negocioActual = async () => (await getColmado(t.db, negocio.id))!;

beforeAll(async () => {
  t = await createTestApp();
  t.env.META_APP_ID = "app-prueba";
  t.env.META_APP_SECRET = "secreto-de-prueba";
  t.env.META_CONFIG_ID = "config-prueba";
  t.env.WHATSAPP_VERIFY_TOKEN = "token-verificacion-prueba";
  [negocio] = await t.db.insert(colmados).values({ nombre: "Negocio", slug: "negocio-wa", whatsappNumero: "18092220001", direccion: "A", planId: 1 }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro", slug: "otro-wa", whatsappNumero: "18092220002", direccion: "B", planId: 1 }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  const op = await createUser(t.db, { idPrefix: "staff", email: "op@delywa.test", password: "op123456", firstName: "Omar", role: "operador_sucursal", colmadoId: negocio.id });
  await setUserSucursalIds(t.db, op.id, [negocio.id]);
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@delywa.test", password: "ajeno123", firstName: "Abel", role: "colmado_owner", colmadoId: otro.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otro.id));
  dueno = await login("dueno@delywa.test", "dueno1234");
  operador = await login("op@delywa.test", "op123456");
  ajeno = await login("ajeno@delywa.test", "ajeno123");
  anon = t.client();
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("Evolution API", () => {
  const config = { evolutionApiUrl: "https://evo.ejemplo.test/", evolutionApiKey: "llave-evo", evolutionInstanceName: "tienda_1" };

  it("solo el dueño o la plataforma conectan Evolution, y solo a direcciones públicas https", async () => {
    expect((await anon.request("POST", `/api/colmados/${negocio.id}/evolution-config`, config)).status).toBe(401);
    expect((await ajeno.request("POST", `/api/colmados/${negocio.id}/evolution-config`, config)).status).toBe(403);
    expect((await operador.request("POST", `/api/colmados/${negocio.id}/evolution-config`, config)).status).toBe(403);
    for (const mala of ["http://evo.ejemplo.test", "https://localhost:8080", "https://10.0.0.5", "https://169.254.169.254/latest", "https://servidor", "ftp://evo.ejemplo.test", "nada"]) {
      expect((await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-config`, { ...config, evolutionApiUrl: mala })).status, mala).toBe(400);
    }
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-config`, { ...config, evolutionInstanceName: "con espacios/../x" })).status).toBe(400);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-config`, config)).status).toBe(200);
    expect(await negocioActual()).toMatchObject({ evolutionApiUrl: "https://evo.ejemplo.test", whatsappProvider: "evolution" });
    // Guardar sin llave conserva la que ya estaba.
    await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-config`, { ...config, evolutionApiKey: "" });
    expect((await negocioActual()).evolutionApiKey).toBe("llave-evo");
  });

  it("prueba la conexión, pide el QR y registra el webhook firmado", async () => {
    simular({ "instance/connectionState/tienda_1": { body: { instance: { state: "open" } } }, "instance/connect/tienda_1": { body: { base64: "qr" } }, "webhook/set/tienda_1": { body: { ok: true } } });
    expect((await ajeno.request("POST", `/api/colmados/${negocio.id}/evolution-test`)).status).toBe(403);
    expect((await ajeno.request("POST", `/api/colmados/${otro.id}/evolution-test`)).status).toBe(400);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-test`)).json).toEqual({ connected: true, data: { state: "open" } });
    expect(llamadas[0].url).toBe("https://evo.ejemplo.test/instance/connectionState/tienda_1");
    expect((llamadas[0].init!.headers as any).apikey).toBe("llave-evo");
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/evolution-qr`)).json).toEqual({ base64: "qr" });

    const hook = await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-webhook`);
    const firma = await firmaWebhookEvolution({ apiKey: "llave-evo", instancia: "tienda_1" });
    expect(hook.json.webhookUrl).toBe(`https://delywa.com/api/webhook/evolution/tienda_1?firma=${firma}`);
    expect(JSON.parse(String(llamadas.at(-1)!.init!.body))).toMatchObject({ url: hook.json.webhookUrl, events: ["MESSAGES_UPSERT"] });

    simular({ connectionState: { status: 500 } });
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/evolution-test`)).json).toEqual({ connected: false, error: "Evolution respondió HTTP 500" });
  });

  it("envía por Evolution solo si la plataforma habilitó la tecnología", async () => {
    simular({ "message/sendText": { body: { key: {} } } });
    expect(whatsappDisponible(t.env, await negocioActual())).toBe(false);
    expect(await enviarWhatsApp(t.env, await negocioActual(), "+1 (809) 555-0001", "Hola")).toBe(false);
    expect(llamadas).toHaveLength(0);

    await t.db.update(colmados).set({ tecnologiasHabilitadas: { api_evo: true } }).where(eq(colmados.id, negocio.id));
    expect(whatsappDisponible(t.env, await negocioActual())).toBe(true);
    expect(await enviarWhatsApp(t.env, await negocioActual(), "+1 (809) 555-0001", "Hola")).toBe(true);
    expect(llamadas[0].url).toBe("https://evo.ejemplo.test/message/sendText/tienda_1");
    expect(JSON.parse(String(llamadas[0].init!.body))).toEqual({ number: "18095550001", text: "Hola" });

    simular({ "message/sendText": { status: 401 } });
    expect(await enviarWhatsApp(t.env, await negocioActual(), "18095550001", "Hola")).toBe(false);
  });
});

describe("Meta Cloud API", () => {
  it("entrega la configuración pública y verifica el webhook con el token", async () => {
    expect((await anon.request("GET", "/api/meta/config")).json).toEqual({ configured: true, appId: "app-prueba", configId: "config-prueba" });
    const ok = await anon.raw("GET", "/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token-verificacion-prueba&hub.challenge=12345");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    expect((await anon.raw("GET", "/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=delywa-demo_verify_token&hub.challenge=1")).status).toBe(403);
  });

  it("conecta el número con el registro integrado de Meta", async () => {
    simular({ "oauth/access_token": { body: { access_token: "token-del-negocio" } }, "/phone_numbers": { body: { data: [{ id: "555000111" }] } } });
    const datos = { code: "codigo", colmadoId: negocio.id, wabaId: "999000" };
    expect((await ajeno.request("POST", "/api/whatsapp/oauth/callback", datos)).status).toBe(403);
    expect((await operador.request("POST", "/api/whatsapp/oauth/callback", datos)).status).toBe(403);
    expect((await dueno.request("POST", "/api/whatsapp/oauth/callback", { colmadoId: negocio.id })).status).toBe(400);
    const res = await dueno.request("POST", "/api/whatsapp/oauth/callback", datos);
    expect(res.json).toMatchObject({ success: true, phoneNumberId: "555000111" });
    // El secreto de la app viaja en el cuerpo, no en la dirección.
    expect(llamadas[0].url).toBe(graphUrl("oauth/access_token"));
    expect(llamadas[0].url).not.toContain("secreto");
    expect(String(llamadas[0].init!.body)).toContain("client_secret=secreto-de-prueba");
    expect(await negocioActual()).toMatchObject({ whatsappPhoneNumberId: "555000111", whatsappAccessToken: "token-del-negocio", whatsappProvider: "meta" });

    simular({ "oauth/access_token": { status: 400, body: { error: { message: "Código vencido" } } } });
    expect((await dueno.request("POST", "/api/whatsapp/oauth/callback", datos)).json.error).toBe("Código vencido");
  });

  it("respeta la ventana de 24 horas al enviar texto libre", async () => {
    simular({ "/messages": { body: { messages: [{ id: "wamid" }] } } });
    const colmado = await negocioActual();
    expect(whatsappDisponible(t.env, colmado)).toBe(true);
    // El cliente nunca ha escrito: Meta no permite iniciar con texto libre.
    expect(await enviarWhatsApp(t.env, colmado, "18095550009", "Hola")).toBe(false);
    expect(llamadas).toHaveLength(0);

    const [conv] = await t.db.insert(whatsappConversaciones).values({ colmadoId: negocio.id, clienteWhatsapp: "18095550009" }).returning();
    await addMensaje(t.db, conv.id, "user", "Buenas");
    expect(await enviarWhatsApp(t.env, colmado, "+1 809-555-0009", "Su pedido va en camino")).toBe(true);
    expect(llamadas[0].url).toBe(graphUrl("555000111/messages"));
    expect((llamadas[0].init!.headers as any).Authorization).toBe("Bearer token-del-negocio");
    expect(JSON.parse(String(llamadas[0].init!.body))).toEqual({ messaging_product: "whatsapp", to: "18095550009", type: "text", text: { body: "Su pedido va en camino" } });

    await t.db.update(whatsappConversaciones).set({ ultimoMensajeCliente: new Date(Date.now() - 25 * 3_600_000) }).where(eq(whatsappConversaciones.id, conv.id));
    expect(await enviarWhatsApp(t.env, colmado, "18095550009", "Tarde")).toBe(false);
    expect(await enviarWhatsApp(t.env, colmado, "18095550009", "Tarde", { omitirVentana: true })).toBe(true);
  });

  it("el panel envía de verdad cuando hay canal, y lo guarda en la conversación", async () => {
    simular({ "/messages": { body: {} } });
    const [conv] = await t.db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.clienteWhatsapp, "18095550009"));
    await t.db.update(whatsappMensajes).set({ fechaEnvio: new Date(Date.now() - 25 * 3_600_000) }).where(eq(whatsappMensajes.conversacionId, conv.id));
    const fuera = await operador.request("POST", `/api/conversaciones/${conv.id}/send`, { message: "Hola" });
    expect(fuera.json.policyViolation).toBe("24h_window");
    await addMensaje(t.db, conv.id, "user", "Sigo aquí");
    const ok = await operador.request("POST", `/api/conversaciones/${conv.id}/send`, { message: "Con gusto" });
    expect(ok.json).toMatchObject({ success: true, whatsappEnviado: true, chatWeb: false });
    const mensajes = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conv.id));
    expect(mensajes.at(-1)).toMatchObject({ rol: "negocio", contenido: "Con gusto" });
  });
});

describe("eliminación de datos de Meta", () => {
  async function firmar(payload: unknown, secreto = "secreto-de-prueba") {
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const datos = b64(new TextEncoder().encode(JSON.stringify(payload)));
    const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return `${b64(new Uint8Array(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(datos))))}.${datos}`;
  }

  it("rechaza peticiones sin firma válida", async () => {
    expect((await anon.request("POST", "/api/webhook/data-deletion", {})).status).toBe(400);
    expect((await anon.request("POST", "/api/webhook/data-deletion", { signed_request: "abc.def" })).status).toBe(400);
    expect((await anon.request("POST", "/api/webhook/data-deletion", { signed_request: await firmar({ user_id: "18095550009" }, "otro-secreto") })).status).toBe(400);
    expect(await t.db.select().from(solicitudesEliminacion)).toHaveLength(0);
  });

  it("borra los datos del número una sola vez y deja el estado consultable", async () => {
    const signed_request = await firmar({ user_id: "18095550009" });
    const form = await anon.raw("POST", "/api/webhook/data-deletion", new URLSearchParams({ signed_request }).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    expect(form.status).toBe(200);
    const res = await form.json() as any;
    expect(res.confirmation_code).toMatch(/^del_[0-9a-f]{32}$/);
    expect(res.url).toBe(`https://delywa.com/deletion-status/${res.confirmation_code}`);
    expect(await t.db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.clienteWhatsapp, "18095550009"))).toHaveLength(0);

    expect((await anon.request("POST", "/api/webhook/data-deletion", { signed_request })).json).toEqual({ success: true, duplicate: true });
    const estado = await anon.request("GET", `/api/deletion-status/${res.confirmation_code}`);
    expect(estado.json).toMatchObject({ status: "completed", data_deleted: { conversaciones: 1, mensajes: 3 } });
    expect((await anon.request("GET", "/api/deletion-status/no-existe")).status).toBe(404);
  });
});

describe("utilidades", () => {
  it("valida direcciones de Evolution y usa una versión vigente de la Graph API", () => {
    expect(urlEvolutionValida("https://api.midominio.com/evo/")).toBe("https://api.midominio.com/evo");
    expect(urlEvolutionValida("https://usuario:clave@api.midominio.com")).toBeNull();
    expect(urlEvolutionValida("https://[::1]/")).toBeNull();
    expect(graphUrl("/123/messages")).toBe("https://graph.facebook.com/v24.0/123/messages");
  });
});
