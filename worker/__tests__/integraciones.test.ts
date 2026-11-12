// @vitest-environment node
// Pruebas con D1 local en memoria y servicios simulados: no se llama a OpenAI, Meta ni Cloudflare.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { colmados, configuracionSistema, pedidos } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { http } from "../lib/whatsapp";
import { ia } from "../chat/adaptador";
import { cifrar, descifrar, envEfectivo, olvidarCache, llaveOpenAI } from "../lib/integraciones";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let admin: Client, dueno: Client;
let negocioId: number;
const fetchOriginal = http.fetch;
let salientes: Array<{ url: string; init?: RequestInit }> = [];
let respuesta: (url: string) => Response = () => new Response("{}", { status: 200 });
const avisos: Array<{ sala: string; cuerpo: string }> = [];

async function login(email: string, password: string, extra: Record<string, unknown> = {}) {
  const c = t.client();
  const r = await c.request("POST", "/api/auth/login", { username: email, password, ...extra });
  return { c, r };
}

beforeAll(async () => {
  t = await createTestApp();
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
  http.fetch = async (url, init) => { salientes.push({ url, init }); return respuesta(url); };
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "admin1234", firstName: "Ada", role: "platform_admin" });
  const [n] = await t.db.insert(colmados).values({ nombre: "N", slug: "n-int", whatsappNumero: "18091113333", direccion: "A", planId: 1 }).returning();
  negocioId = n.id;
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: n.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, n.id));
  admin = (await login("admin@delywa.test", "admin1234")).c;
  dueno = (await login("dueno@delywa.test", "dueno1234")).c;
}, 60_000);
afterAll(async () => { http.fetch = fetchOriginal; await t?.dispose(); });
beforeEach(() => { salientes = []; respuesta = () => new Response("{}", { status: 200 }); });

describe("cifrado de llaves", () => {
  it("cifra y descifra; con otra clave maestra no se puede leer", async () => {
    const guardado = await cifrar("sk-secreto-123", "a");
    expect(guardado).toMatch(/^v1:/);
    expect(guardado).not.toContain("sk-secreto");
    expect(await descifrar(guardado, "a")).toBe("sk-secreto-123");
    expect(await descifrar(guardado, "b")).toBeNull();
  });
});

describe("panel de integraciones", () => {
  it("solo el administrador de la plataforma entra", async () => {
    expect((await dueno.request("GET", "/api/admin/integraciones")).status).toBe(403);
    expect((await t.client().request("GET", "/api/admin/integraciones")).status).toBe(401);
  });

  it("crea solo el token del webhook y muestra la dirección para Meta", async () => {
    const r = await admin.request("GET", "/api/admin/integraciones");
    expect(r.status).toBe(200);
    expect(r.json.claveMaestra).toBe(true);
    expect(r.json.meta.webhookUrl).toBe("https://delywa.com/api/webhook/whatsapp");
    expect(r.json.meta.verifyToken).toMatch(/^[0-9a-f]{48}$/);
    // El token sirve para que Meta verifique el webhook.
    const token = r.json.meta.verifyToken;
    const v = await t.client().raw("GET", `/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=hola`);
    expect(v.status).toBe(200);
    expect(await v.text()).toBe("hola");
  });

  it("guarda las llaves cifradas, nunca las devuelve completas y las usa el resto del sistema", async () => {
    const r = await admin.request("PUT", "/api/admin/integraciones", { valores: {
      openai_api_key: "sk-prueba-abcdefgh1234", meta_app_id: "123456789", meta_app_secret: "secreto-meta-xyz9", meta_config_id: "98765",
    } });
    expect(r.status).toBe(200);
    const openai = r.json.campos.find((x: any) => x.campo === "openai_api_key");
    expect(openai).toMatchObject({ configurado: true, origen: "panel", vista: "••••1234" });
    expect(JSON.stringify(r.json)).not.toContain("sk-prueba");
    expect(JSON.stringify(r.json)).not.toContain("secreto-meta");
    const [fila] = await t.db.select().from(configuracionSistema).where(eq(configuracionSistema.clave, "integracion:openai_api_key"));
    expect(fila.valor).toMatch(/^v1:/);
    // No sale por la API genérica de configuración.
    const todas = await admin.request("GET", "/api/configuracion");
    expect(todas.json.some((x: any) => x.clave.startsWith("integracion:"))).toBe(false);
    expect((await admin.request("GET", "/api/configuracion/integracion:openai_api_key")).status).toBe(404);
    // El botón de Facebook recibe el ID de la app guardado en el panel.
    const meta = await t.client().request("GET", "/api/meta/config");
    expect(meta.json).toEqual({ configured: true, appId: "123456789", configId: "98765" });
  });

  it("rechaza valores mal escritos y campos desconocidos", async () => {
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { meta_app_id: "abc" } })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { ai_gateway_url: "https://otro.com/x" } })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { inventado: "x" } })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { turnstile_activo: "true" } })).status).toBe(400);
  });

  it("borra un valor del panel cuando se manda vacío", async () => {
    await admin.request("PUT", "/api/admin/integraciones", { valores: { meta_graph_version: "v25.0" } });
    const r = await admin.request("PUT", "/api/admin/integraciones", { valores: { meta_graph_version: "" } });
    expect(r.json.campos.find((x: any) => x.campo === "meta_graph_version").configurado).toBe(false);
  });

  it("prueba la llave de OpenAI sin gastar (lista modelos) e informa si la rechazan", async () => {
    const ok = await admin.request("POST", "/api/admin/integraciones/probar-openai");
    expect(ok.json.ok).toBe(true);
    expect(salientes[0].url).toBe("https://api.openai.com/v1/models");
    expect((salientes[0].init?.headers as any).Authorization).toBe("Bearer sk-prueba-abcdefgh1234");
    respuesta = () => new Response("{}", { status: 401 });
    expect((await admin.request("POST", "/api/admin/integraciones/probar-openai")).json.ok).toBe(false);
  });

  it("prueba la app de Meta con el token en el encabezado, no en la dirección", async () => {
    respuesta = () => new Response(JSON.stringify({ name: "Delywa" }), { status: 200 });
    const r = await admin.request("POST", "/api/admin/integraciones/probar-meta");
    expect(r.json).toMatchObject({ ok: true });
    expect(salientes[0].url).not.toContain("secreto");
    expect((salientes[0].init?.headers as any).Authorization).toBe("Bearer 123456789|secreto-meta-xyz9");
  });
});

describe("llave de OpenAI por negocio", () => {
  it("el negocio puede tener su propia llave; si no, usa la de la plataforma", async () => {
    let r = await admin.request("GET", `/api/admin/colmados/${negocioId}/ia`);
    expect(r.json).toMatchObject({ llavePropia: false, usaLlaveDePlataforma: true });
    r = await admin.request("PUT", `/api/admin/colmados/${negocioId}/ia`, { openaiApiKey: "sk-negocio-propia-9876" });
    expect(r.json).toMatchObject({ llavePropia: true, vista: "••••9876" });
    olvidarCache(t.env);
    const env = await envEfectivo(t.env);
    expect(llaveOpenAI(env, negocioId)).toBe("sk-negocio-propia-9876");
    expect(llaveOpenAI(env, negocioId + 999)).toBe("sk-prueba-abcdefgh1234");
    expect(llaveOpenAI(env)).toBe("sk-prueba-abcdefgh1234");
    expect((await dueno.request("PUT", `/api/admin/colmados/${negocioId}/ia`, { openaiApiKey: null })).status).toBe(403);
    r = await admin.request("PUT", `/api/admin/colmados/${negocioId}/ia`, { openaiApiKey: null });
    expect(r.json.llavePropia).toBe(false);
  });

  it("la fábrica de IA usa la llave del negocio", () => {
    const env = { OPENAI_API_KEY: "sk-plataforma", __integraciones: { valores: {}, openaiPorNegocio: { 7: "sk-del-7" }, ilegibles: [] } } as any;
    expect((ia.crear(env, 7) as any).apiKey).toBe("sk-del-7");
    expect((ia.crear(env) as any).apiKey).toBe("sk-plataforma");
  });
});

describe("Turnstile en el login", () => {
  it("no se exige hasta probarlo; al probarlo se activa y luego el login lo pide", async () => {
    await admin.request("PUT", "/api/admin/integraciones", { valores: { turnstile_site_key: "0x4AAAAAAAsitio", turnstile_secret_key: "0x4AAAAAAAsecreto" } });
    expect((await t.client().request("GET", "/api/auth/turnstile")).json).toEqual({ activo: false });
    expect((await login("dueno@delywa.test", "dueno1234")).r.status).toBe(200);

    respuesta = () => new Response(JSON.stringify({ success: false }), { status: 200 });
    expect((await admin.request("POST", "/api/admin/integraciones/probar-turnstile", { token: "malo" })).json.ok).toBe(false);
    expect((await t.client().request("GET", "/api/auth/turnstile")).json.activo).toBe(false);

    respuesta = () => new Response(JSON.stringify({ success: true }), { status: 200 });
    expect((await admin.request("POST", "/api/admin/integraciones/probar-turnstile", { token: "bueno" })).json.ok).toBe(true);
    expect(salientes.at(-1)!.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect((await t.client().request("GET", "/api/auth/turnstile")).json).toEqual({ activo: true, siteKey: "0x4AAAAAAAsitio" });

    // Se pide solo después de 3 fallos desde la conexión.
    const h = { "CF-Connecting-IP": "10.7.7.7" };
    expect((await t.client().request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "dueno1234" }, h)).status).toBe(200);
    for (let i = 0; i < 3; i++) await t.client().request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "mala" }, h);
    const pide = await t.client().request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "dueno1234" }, h);
    expect(pide.status).toBe(403);
    expect(pide.json).toMatchObject({ turnstile: true, siteKey: "0x4AAAAAAAsitio" });
    respuesta = () => new Response(JSON.stringify({ success: false }), { status: 200 });
    expect((await t.client().request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "dueno1234", turnstileToken: "falso" }, h)).status).toBe(403);
    respuesta = () => new Response(JSON.stringify({ success: true }), { status: 200 });
    expect((await t.client().request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "dueno1234", turnstileToken: "real" }, h)).status).toBe(200);
  });

  it("cambiar las claves lo apaga hasta volver a probar", async () => {
    await admin.request("PUT", "/api/admin/integraciones", { valores: { turnstile_secret_key: "0x4AAAAAAAotro" } });
    expect((await t.client().request("GET", "/api/auth/turnstile")).json.activo).toBe(false);
    expect((await login("dueno@delywa.test", "dueno1234")).r.status).toBe(200);
  });
});

describe("tiempo real", () => {
  it("al cambiar un pedido avisa a la sala de ese negocio, sin datos del cliente", async () => {
    (t.env as any).SALAS = {
      idFromName: (n: string) => n,
      get: (id: string) => ({ fetch: async (_u: string, init?: RequestInit) => { avisos.push({ sala: id, cuerpo: String(init?.body) }); return new Response(null, { status: 204 }); } }),
    };
    try {
      const [p] = await t.db.insert(pedidos).values({ colmadoId: negocioId, clienteWhatsapp: "18095550000", clienteNombre: "Ana",
        clienteUbicacion: "Calle 1", productos: "[]", total: "100", montoPago: "0", metodoPago: "efectivo", estado: "pendiente" } as any).returning();
      const r = await dueno.request("PATCH", `/api/pedidos/${p.id}/estado`, { estado: "en_preparacion" });
      expect(r.status).toBeLessThan(400);
      expect(avisos.at(-1)).toEqual({ sala: `negocio:${negocioId}`, cuerpo: JSON.stringify({ tipo: "cambio", temas: ["pedidos"] }) });
      // Una lectura no avisa.
      const antes = avisos.length;
      await dueno.request("GET", `/api/colmados/${negocioId}/pedidos`);
      expect(avisos.length).toBe(antes);
    } finally {
      (t.env as any).SALAS = undefined;
    }
  });

  it("la conexión exige sesión y acceso a la sucursal", async () => {
    (t.env as any).SALAS = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response("ok", { status: 200 }) }) };
    try {
      expect((await t.client().request("GET", `/api/tiempo-real?colmadoId=${negocioId}`, undefined, { Upgrade: "websocket" })).status).toBe(401);
      expect((await dueno.request("GET", `/api/tiempo-real?colmadoId=${negocioId + 999}`, undefined, { Upgrade: "websocket" })).status).toBe(403);
      expect((await dueno.request("GET", `/api/tiempo-real?colmadoId=${negocioId}`)).status).toBe(426);
      expect((await dueno.request("GET", `/api/tiempo-real?colmadoId=${negocioId}`, undefined, { Upgrade: "websocket" })).status).toBe(200);
    } finally {
      (t.env as any).SALAS = undefined;
    }
  });
});
