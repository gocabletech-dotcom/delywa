import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asistenteConversaciones, asistenteMensajes, planes } from "@shared/schema";
import { correosEnviados, createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { normal, responder, type PlanPublico } from "../lib/asistente-pagina";

// Asistente del chat de la página principal: contesta por palabras clave, sin IA.
let t: Awaited<ReturnType<typeof createTestApp>>;
const PLANES: PlanPublico[] = [
  { nombre: "Trial", precio: 0, trial: true, dias: 30, descripcion: null, caracteristicas: [] },
  { nombre: "Básico", precio: 999, trial: false, dias: 30, descripcion: null, caracteristicas: [] },
];

beforeAll(async () => {
  t = await createTestApp();
  // Las claves de Integraciones se guardan cifradas.
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
  await createUser(t.db, { idPrefix: "admin", email: "admin-asis@delywa.test", password: "admin-segura-123", firstName: "Ada", role: "platform_admin" });
});
afterAll(() => t.dispose());

describe("lo que contesta", () => {
  it("entiende las preguntas comunes, con acentos o sin ellos", () => {
    expect(normal("¿Cuánto CUESTA?")).toBe("cuanto cuesta");
    expect(responder("¿Cuánto cuesta Delywa?", { planes: PLANES })?.tema).toBe("precio");
    expect(responder("como piden mis clientes", { planes: PLANES })?.tema).toBe("pedir_cliente");
    expect(responder("tengo 3 repartidores en motor", { planes: PLANES })?.tema).toBe("delivery");
    expect(responder("cobran comision por pedido?", { planes: PLANES })?.tema).toBe("comision");
    expect(responder("necesito hablar con una persona", { planes: PLANES })?.tema).toBe("humano");
    expect(responder("klk", { planes: PLANES })?.tema).toBe("saludo");
    // Un saludo con una pregunta contesta la pregunta.
    expect(responder("hola, cuanto cuesta?", { planes: PLANES })?.tema).toBe("precio");
  });

  it("los días de prueba y los planes salen de la base", () => {
    const r = responder("hay prueba gratis?", { planes: PLANES })!;
    expect(r.texto).toContain("1 mes gratis");
    const r15 = responder("hay prueba gratis?", { planes: [{ ...PLANES[0], dias: 15 }, PLANES[1]] })!;
    expect(r15.texto).toContain("15 días");
    const p = responder("precios", { planes: PLANES })!;
    expect(p.planes?.map((x) => x.nombre)).toEqual(["Básico"]);
  });

  it("si no sabe, no inventa: ofrece soporte", () => {
    const r = responder("¿se puede conectar con un dron submarino?", { planes: PLANES })!;
    expect(r.tema).toBeNull();
    expect(r.acciones).toContain("soporte");
  });

  it("lo enseñado va primero", () => {
    const r = responder("sirve para ferreterias?", { planes: PLANES, aprendidas: [{ id: 9, pregunta: "¿Sirve para ferreterías?", respuesta: "Por ahora es para colmados." }] })!;
    expect(r).toMatchObject({ tema: "aprendida", aprendidaId: 9, texto: "Por ahora es para colmados." });
  });
});

describe("API del chat", () => {
  it("contesta, guarda la conversación y anota lo que no supo", async () => {
    const c = t.client();
    const a = await c.request("POST", "/api/asistente", { tema: "precio" });
    expect(a.status).toBe(200);
    expect(a.json.conv).toMatch(/^[a-f0-9]{32}$/);
    const [trial] = await t.db.select().from(planes).where(eq(planes.esTrial, true));
    expect(a.json.respuesta.planes.length).toBeGreaterThan(0);
    expect(a.json.respuesta.texto).toContain(trial.duracionDias % 30 === 0 ? "mes" : `${trial.duracionDias} días`);
    expect(a.json.respuesta.aprendidaId).toBeUndefined();
    const b = await c.request("POST", "/api/asistente", { texto: "y el dron submarino?", conv: a.json.conv });
    expect(b.json.conv).toBe(a.json.conv);
    expect(b.json.respuesta.tema).toBeNull();
    const [conv] = await t.db.select().from(asistenteConversaciones).where(eq(asistenteConversaciones.token, a.json.conv));
    expect(conv.mensajes).toBe(4);
    const msjs = await t.db.select().from(asistenteMensajes).where(eq(asistenteMensajes.convId, conv.id));
    expect(msjs.find((m) => m.texto === "y el dron submarino?")?.tema).toBeNull();
    expect((await c.request("POST", "/api/asistente", {})).status).toBe(400);
    // Crear mi negocio desde el chat.
    await c.request("POST", "/api/asistente/evento", { conv: a.json.conv });
    const [despues] = await t.db.select().from(asistenteConversaciones).where(eq(asistenteConversaciones.id, conv.id));
    expect(despues.convirtio).toBe(true);
  });

  it("soporte: sin correo configurado devuelve mailto; con correo le escribe a soporte", async () => {
    const c = t.client();
    const falta = await c.request("POST", "/api/asistente/soporte", { nombre: "Juan", necesita: "Info" }, { "CF-Connecting-IP": "10.9.0.1" });
    expect(falta.status).toBe(400);
    const sin = await c.request("POST", "/api/asistente/soporte", { nombre: "Juan", whatsapp: "8095551234", necesita: "Quiero una demo" }, { "CF-Connecting-IP": "10.9.0.1" });
    expect(sin.json).toMatchObject({ ok: true, enviado: false });
    expect(sin.json.mailto).toContain("mailto:soporte@delywa.com");

    const admin = t.client();
    await admin.request("POST", "/api/auth/login", { username: "admin-asis@delywa.test", password: "admin-segura-123" });
    await admin.request("PUT", "/api/admin/integraciones", { valores: { resend_clave: "re_prueba_123456", correo_desde: "DelyWa <no-responder@delywa.com>" } });
    correosEnviados.length = 0;
    const con = await c.request("POST", "/api/asistente/soporte", { nombre: "Ana <b>", correo: "ana@ejemplo.test", negocio: "Colmado Ana", necesita: "¿Cómo pago?" }, { "CF-Connecting-IP": "10.9.0.2" });
    expect(con.json).toMatchObject({ ok: true, enviado: true });
    expect(correosEnviados[0].to).toEqual(["soporte@delywa.com"]);
    expect(correosEnviados[0].html).toContain("Ana &lt;b&gt;");
    expect(correosEnviados[1].to).toEqual(["ana@ejemplo.test"]);
  });

  it("frena a quien manda demasiado", async () => {
    const c = t.client();
    let ultimo = 0;
    for (let i = 0; i < 31; i++) ultimo = (await c.request("POST", "/api/asistente", { tema: "saludo" }, { "CF-Connecting-IP": "10.9.9.9" })).status;
    expect(ultimo).toBe(429);
  });
});

describe("Plataforma → Asistente de la página", () => {
  it("solo la plataforma lo ve; enseña, usa y borra respuestas", async () => {
    expect((await t.client().request("GET", "/api/admin/asistente")).status).toBe(401);
    const admin = t.client();
    await admin.request("POST", "/api/auth/login", { username: "admin-asis@delywa.test", password: "admin-segura-123" });
    const d = await admin.request("GET", "/api/admin/asistente");
    expect(d.status).toBe(200);
    expect(d.json.sinRespuesta.some((s: any) => s.texto === "y el dron submarino?")).toBe(true);
    expect(d.json.temas.some((x: any) => x.tema === "precio")).toBe(true);

    const nueva = await admin.request("POST", "/api/admin/asistente/respuestas", { pregunta: "¿Sirve para ferreterías?", respuesta: "Por ahora es para colmados." });
    expect(nueva.status).toBe(201);
    const r = await t.client().request("POST", "/api/asistente", { texto: "sirve para ferreterias?" }, { "CF-Connecting-IP": "10.9.0.5" });
    expect(r.json.respuesta.texto).toBe("Por ahora es para colmados.");
    const despues = await admin.request("GET", "/api/admin/asistente");
    expect(despues.json.aprendidas[0].usos).toBe(1);
    const conv = despues.json.conversaciones[0];
    expect((await admin.request("GET", `/api/admin/asistente/conversacion/${conv.id}`)).json.length).toBeGreaterThan(0);

    await admin.request("PUT", `/api/admin/asistente/respuestas/${nueva.json.id}`, { activo: false });
    const r2 = await t.client().request("POST", "/api/asistente", { texto: "sirve para ferreterias?" }, { "CF-Connecting-IP": "10.9.0.6" });
    expect(r2.json.respuesta.texto).not.toBe("Por ahora es para colmados.");
    expect((await admin.request("DELETE", `/api/admin/asistente/respuestas/${nueva.json.id}`)).status).toBe(200);
  });
});
