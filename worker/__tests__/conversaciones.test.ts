// @vitest-environment node
// Pruebas con D1 local en memoria y datos inventados: nunca tocan la base real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  botIntenciones, chatWebMensajes, chatWebSesiones, clientes, colmados, productosRestringidos, whatsappConversaciones,
  whatsappMensajes, zipAlertaEventos,
} from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { pareceCuentaBancaria } from "../routes/conversaciones";
import { validarPlantillaZip } from "../routes/plataforma";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let admin: Client, dueno: Client, operador: Client, ajeno: Client, anon: Client;
let negocio: any, otro: any, conv: any, convWeb: any;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Negocio", slug: "negocio-conv", whatsappNumero: "18091230001", direccion: "A", planId: 1 }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro", slug: "otro-conv", whatsappNumero: "18091230002", direccion: "B", planId: 1 }).returning();
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "admin1234", firstName: "Ada", role: "platform_admin" });
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  const op = await createUser(t.db, { idPrefix: "staff", email: "op@delywa.test", password: "op123456", firstName: "Omar", role: "operador_sucursal", colmadoId: negocio.id });
  await setUserSucursalIds(t.db, op.id, [negocio.id]);
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@delywa.test", password: "ajeno123", firstName: "Abel", role: "colmado_owner", colmadoId: otro.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otro.id));
  admin = await login("admin@delywa.test", "admin1234");
  dueno = await login("dueno@delywa.test", "dueno1234");
  operador = await login("op@delywa.test", "op123456");
  ajeno = await login("ajeno@delywa.test", "ajeno123");
  anon = t.client();

  [conv] = await t.db.insert(whatsappConversaciones).values({ colmadoId: negocio.id, clienteWhatsapp: "18095550001", clienteNombre: "Carla", direccionTexto: "Calle 1", noLeidosColmado: 2, ultimoPedidoEstado: "pendiente" }).returning();
  [convWeb] = await t.db.insert(whatsappConversaciones).values({ colmadoId: negocio.id, clienteWhatsapp: "18095550002", clienteNombre: "Web" }).returning();
  await t.db.insert(whatsappMensajes).values([
    { conversacionId: conv.id, rol: "user", contenido: "Hola" },
    { conversacionId: conv.id, rol: "assistant", contenido: "Pedido recibido [Contexto de dirección para IA: interno] Formato: usar la dirección del menú gráfico." },
    { conversacionId: conv.id, rol: "user", contenido: "Viejo", fechaEnvio: new Date(Date.now() - 3 * 24 * 3_600_000) },
  ]);
  await t.db.insert(chatWebSesiones).values({ sessionId: "sesion-prueba", colmadoId: negocio.id, conversacionId: convWeb.id, clienteWhatsapp: "18095550002" });
  await t.db.insert(productosRestringidos).values({ palabraClave: "cigarrillo-prueba", categoria: "tabaco" });
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("conversaciones", () => {
  it("lista, cuenta no leídas y oculta el contexto interno de los mensajes", async () => {
    expect((await ajeno.request("GET", `/api/colmados/${negocio.id}/conversaciones`)).status).toBe(403);
    expect((await operador.request("GET", `/api/colmados/${negocio.id}/conversaciones`)).json).toHaveLength(2);
    expect((await operador.request("GET", `/api/colmados/${negocio.id}/conversaciones?estado=pendiente`)).json).toHaveLength(1);
    expect((await operador.request("GET", `/api/colmados/${negocio.id}/conversaciones/unread`)).json).toEqual({ count: 1 });

    expect((await ajeno.request("GET", `/api/conversaciones/${conv.id}/mensajes`)).status).toBe(403);
    expect((await anon.request("GET", `/api/conversaciones/${conv.id}/mensajes`)).status).toBe(401);
    const mensajes = (await operador.request("GET", `/api/conversaciones/${conv.id}/mensajes`)).json;
    expect(mensajes).toHaveLength(3);
    expect(mensajes.map((m: any) => m.contenido)).toContain("Pedido recibido");

    await operador.request("PATCH", `/api/conversaciones/${conv.id}/read`);
    expect((await operador.request("GET", `/api/colmados/${negocio.id}/conversaciones/unread`)).json.count).toBe(0);
    expect((await operador.request("PATCH", `/api/conversaciones/${conv.id}`, { clienteNombre: " Carla R. ", direccionTexto: "" })).json).toMatchObject({ clienteNombre: "Carla R.", direccionTexto: "Calle 1" });
  });

  it("aplica las políticas al enviar y no registra como enviado lo que no tiene canal", async () => {
    const enviar = (id: number, message: unknown, c = operador) => c.request("POST", `/api/conversaciones/${id}/send`, { message });
    expect((await enviar(conv.id, "hola", ajeno)).status).toBe(403);
    expect((await enviar(conv.id, "  ")).status).toBe(400);
    expect((await enviar(conv.id, "Deposita a la cuenta: 123456789012")).json.policyViolation).toBe("bank_account");
    expect((await enviar(conv.id, "Tenemos Cigarrillo-Prueba en oferta")).json.policyViolation).toBe("tobacco");

    // Sin WhatsApp integrado ni chat web: devuelve el enlace para enviarlo a mano y no guarda nada.
    const manual = await enviar(conv.id, "Tu pedido va en camino");
    expect(manual.status).toBe(409);
    expect(manual.json).toMatchObject({ reason: "sin_canal", necesitaEnvioManual: true, whatsappNumero: "18095550001" });
    expect(manual.json.enlaceWhatsApp).toContain("https://wa.me/18095550001?text=");
    expect(await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conv.id))).toHaveLength(3);

    // Con chat web: llega al chat del cliente y queda una sola vez en la conversación.
    const web = await enviar(convWeb.id, "Ya salió tu pedido");
    expect(web.json).toMatchObject({ success: true, chatWeb: true, whatsappEnviado: false });
    expect(await t.db.select().from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, "sesion-prueba"))).toHaveLength(1);
    const guardados = await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, convWeb.id));
    expect(guardados).toHaveLength(1);
    expect(guardados[0]).toMatchObject({ rol: "negocio", contenido: "Ya salió tu pedido" });
  });

  it("las cifras de mensajes son solo del propio negocio", async () => {
    expect((await ajeno.request("GET", `/api/colmados/${negocio.id}/analytics/mensajes`)).status).toBe(403);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/analytics/mensajes`)).json)
      .toEqual({ mensajesEnviados: 2, mensajesRecibidos: 2, conversacionesActivas: 1, conversacionesTotal: 2 });
    const desde = new Date(Date.now() - 3_600_000).toISOString();
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/analytics/mensajes?desde=${encodeURIComponent(desde)}`)).json.mensajesRecibidos).toBe(1);

    await t.db.insert(zipAlertaEventos).values([
      { colmadoId: negocio.id, canal: "web", direccionRecibida: "Calle sin ZIP" },
      { colmadoId: negocio.id, canal: "meta", fechaCreacion: new Date(Date.now() - 10 * 24 * 3_600_000) },
    ]);
    expect((await operador.request("GET", `/api/colmados/${negocio.id}/analytics/zip-alertas`)).status).toBe(403);
    expect((await dueno.request("GET", `/api/colmados/${negocio.id}/analytics/zip-alertas`)).json).toEqual({ count: 1, dias: 7 });
    const detalle = (await dueno.request("GET", `/api/colmados/${negocio.id}/analytics/zip-alertas/detalle?limit=1`)).json;
    expect(detalle).toMatchObject({ limit: 1, offset: 0, hasMore: true, dias: 30 });
    expect(detalle.eventos[0].direccionRecibida).toBe("Calle sin ZIP");
  });

  it("solo un administrador del negocio borra la conversación; el cliente se conserva", async () => {
    expect((await operador.request("DELETE", `/api/conversaciones/${convWeb.id}`)).status).toBe(403);
    expect((await ajeno.request("DELETE", `/api/conversaciones/${convWeb.id}`)).status).toBe(403);
    expect((await dueno.request("DELETE", `/api/conversaciones/${convWeb.id}`)).status).toBe(200);
    expect(await t.db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, "sesion-prueba"))).toHaveLength(0);
    expect(await t.db.select().from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, "sesion-prueba"))).toHaveLength(0);
    expect(await t.db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, convWeb.id))).toHaveLength(0);
    const [cliente] = await t.db.select().from(clientes).where(eq(clientes.whatsappNumero, "18095550002"));
    expect(cliente).toMatchObject({ colmadoId: negocio.id, nombre: "Web" });
    expect((await dueno.request("DELETE", `/api/conversaciones/${convWeb.id}`)).status).toBe(404);
  });
});

describe("panel de plataforma", () => {
  it("todo es solo para el administrador de la plataforma", async () => {
    for (const ruta of ["/api/admin/bot-intenciones", "/api/admin/conocimiento/colmado", "/api/mensajes-sistema", "/api/admin/meta-policies", "/api/admin/system-prompt", "/api/admin/zip-alert-template"]) {
      expect((await anon.request("GET", ruta)).status, ruta).toBe(401);
      expect((await dueno.request("GET", ruta)).status, ruta).toBe(403);
      expect((await admin.request("GET", ruta)).status, ruta).toBe(200);
    }
    expect((await dueno.request("POST", "/api/admin/bot-intenciones", { codigo: "x", nombre: "x", respuesta: "x" })).status).toBe(403);
    expect((await dueno.request("PUT", "/api/admin/system-prompt", { prompt: "x" })).status).toBe(403);
    expect((await admin.request("GET", "/api/admin/meta-policies")).json.content.length).toBeGreaterThan(500);
    expect((await admin.request("GET", "/api/mensajes-sistema")).json.length).toBeGreaterThan(0);
  });

  it("administra las intenciones del bot y protege la de fallback", async () => {
    expect((await admin.request("POST", "/api/admin/bot-intenciones", { codigo: "promo", nombre: "Promo" })).status).toBe(400);
    expect((await admin.request("POST", "/api/admin/bot-intenciones", { codigo: "Con Espacios", nombre: "X", respuesta: "Y" })).status).toBe(400);
    const nueva = await admin.request("POST", "/api/admin/bot-intenciones", { codigo: "promo_prueba", nombre: "Promo", respuesta: "Hoy 2x1", palabrasClave: ["oferta", " oferta ", 5, "promo"] });
    expect(nueva.json).toMatchObject({ codigo: "promo_prueba", activo: true, palabrasClave: ["oferta", "promo"] });
    expect((await admin.request("POST", "/api/admin/bot-intenciones", { codigo: "promo_prueba", nombre: "Otra", respuesta: "Z" })).json.error).toContain("Ya existe");
    expect((await admin.request("PUT", `/api/admin/bot-intenciones/${nueva.json.id}`, { respuesta: "" })).status).toBe(400);
    expect((await admin.request("PUT", `/api/admin/bot-intenciones/${nueva.json.id}`, { activo: false, orden: 9 })).json).toMatchObject({ activo: false, orden: 9, respuesta: "Hoy 2x1" });
    expect((await admin.request("GET", `/api/admin/bot-intenciones/${nueva.json.id}`)).json.codigo).toBe("promo_prueba");
    expect((await admin.request("DELETE", `/api/admin/bot-intenciones/${nueva.json.id}`)).json.success).toBe(true);
    expect((await admin.request("GET", `/api/admin/bot-intenciones/${nueva.json.id}`)).status).toBe(404);

    let [fallback] = await t.db.select().from(botIntenciones).where(eq(botIntenciones.codigo, "fallback"));
    if (!fallback) [fallback] = await t.db.insert(botIntenciones).values({ codigo: "fallback", nombre: "Fallback", respuesta: "No entendí" }).returning();
    expect((await admin.request("DELETE", `/api/admin/bot-intenciones/${fallback.id}`)).status).toBe(400);
  });

  it("guarda conocimiento, el prompt global y la plantilla ZIP", async () => {
    expect((await admin.request("POST", "/api/admin/conocimiento", { tipoNegocio: "colmado", nombre: "Guía" })).status).toBe(400);
    const archivo = await admin.request("POST", "/api/admin/conocimiento", { tipoNegocio: "colmado", nombre: "Guía", contenido: "Texto de prueba" });
    expect((await admin.request("GET", "/api/admin/conocimiento/colmado")).json).toHaveLength(1);
    await admin.request("DELETE", `/api/admin/conocimiento/${archivo.json.id}`);
    expect((await admin.request("GET", "/api/admin/conocimiento/colmado")).json).toHaveLength(0);

    expect((await admin.request("PUT", "/api/admin/system-prompt", { prompt: 5 })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/system-prompt", { prompt: "Sé breve." })).json).toEqual({ prompt: "Sé breve." });
    expect((await admin.request("GET", "/api/admin/system-prompt")).json.prompt).toBe("Sé breve.");

    expect((await admin.request("GET", "/api/admin/zip-alert-template")).json).toEqual({ name: "zip_alert_operativo", language: "es_ES" });
    expect((await admin.request("PUT", "/api/admin/zip-alert-template", { name: "Con Mayúsculas", language: "es_ES" })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/zip-alert-template", { name: "aviso_zip", language: "es_MX" })).json).toEqual({ name: "aviso_zip", language: "es_MX" });
    expect((await admin.request("GET", "/api/admin/zip-alert-template")).json.name).toBe("aviso_zip");
  });

  it("detecta cuentas bancarias sin confundirlas con teléfonos", () => {
    expect(pareceCuentaBancaria("Mi cuenta: 12345678")).toBe(true);
    expect(pareceCuentaBancaria("Envíalo al 960123456789012")).toBe(true);
    expect(pareceCuentaBancaria("Llámame al 809-555-1234")).toBe(false);
    expect(pareceCuentaBancaria("Son 2 jugos y 1 pan")).toBe(false);
    expect(validarPlantillaZip("ok_1", "es")).toBeNull();
  });
});
