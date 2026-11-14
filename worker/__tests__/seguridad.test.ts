// @vitest-environment node
// Pruebas con D1 y R2 locales en memoria y correo simulado: no se manda nada de verdad ni se toca producción.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bitacora, colmados, errores, paises, planes, recuperaciones, respaldos, users } from "@shared/schema";
import { correosEnviados, createTestApp } from "./helpers";
import { createUser, updateUser } from "../storage/users";
import { LIMITE, iniciarRespaldo, pasoRespaldo } from "../lib/respaldo";
import { envEfectivo, olvidarCache } from "../lib/integraciones";
import { avisosFinDePrueba } from "../lib/avisos";
import { registrarError } from "../lib/seguridad";

let t: Awaited<ReturnType<typeof createTestApp>>;
let admin: ReturnType<typeof t.client>;
const enlaceDe = (html: string) => (html.match(/recuperar\?t=([0-9a-f]{48})/) || [])[1];

beforeAll(async () => {
  t = await createTestApp();
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "admin-segura-123", firstName: "Ada", role: "platform_admin" });
  admin = t.client();
  await admin.request("POST", "/api/auth/login", { username: "admin@delywa.test", password: "admin-segura-123" });
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("encabezados de seguridad", () => {
  it("toda respuesta del servidor los lleva", async () => {
    const r = await t.client().raw("GET", "/api/health");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("strict-transport-security")).toContain("max-age");
  });
});

describe("correo con Resend", () => {
  it("sin configurar, no se ofrece recuperar contraseña", async () => {
    expect((await t.client().request("GET", "/api/auth/recuperar")).json.disponible).toBe(false);
    expect((await t.client().request("POST", "/api/auth/recuperar", { email: "admin@delywa.test" })).status).toBe(503);
  });

  it("se configura en Integraciones y se prueba", async () => {
    expect((await admin.request("PUT", "/api/admin/integraciones", { valores: { correo_desde: "sin arroba" } })).status).toBe(400);
    const r = await admin.request("PUT", "/api/admin/integraciones", { valores: { resend_clave: "re_prueba_123456", correo_desde: "DelyWa <no-responder@delywa.com>" } });
    expect(r.status).toBe(200);
    const p = await admin.request("POST", "/api/admin/integraciones/probar-correo");
    expect(p.json.ok).toBe(true);
    expect(correosEnviados.at(-1)).toMatchObject({ to: ["admin@delywa.test"], from: "DelyWa <no-responder@delywa.com>" });
    // Plantilla con el logo de delywa.com.
    expect(correosEnviados.at(-1)!.html).toContain('src="https://delywa.com/correo-logo.png"');
  });
});

describe("¿Olvidaste tu contraseña?", () => {
  it("manda un enlace de un solo uso, cambia la contraseña y cierra las sesiones", async () => {
    const dueno = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "clave-vieja-123", firstName: "Dora", role: "colmado_owner" });
    const sesionVieja = t.client();
    expect((await sesionVieja.request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "clave-vieja-123" })).status).toBe(200);

    const antes = correosEnviados.length;
    // Misma respuesta exista o no la cuenta.
    const nadie = await t.client().request("POST", "/api/auth/recuperar", { email: "nadie@delywa.test" });
    const r = await t.client().request("POST", "/api/auth/recuperar", { email: "dueno@delywa.test" });
    expect(r.json.mensaje).toBe(nadie.json.mensaje);
    expect(correosEnviados.length).toBe(antes + 1);
    const token = enlaceDe(correosEnviados.at(-1)!.html);
    expect(token).toBeTruthy();
    // La base guarda solo la huella del enlace.
    expect((await t.db.select().from(recuperaciones)).some((x) => x.tokenHash === token)).toBe(false);

    expect((await t.client().request("POST", "/api/auth/recuperar/cambiar", { token, password: "corta" })).status).toBe(400);
    expect((await t.client().request("POST", "/api/auth/recuperar/cambiar", { token, password: "clave-nueva-456" })).status).toBe(200);
    expect((await t.client().request("POST", "/api/auth/recuperar/cambiar", { token, password: "otra-nueva-789" })).status).toBe(400);
    expect((await sesionVieja.request("GET", "/api/auth/session")).json.isAuthenticated).toBe(false);
    expect((await t.client().request("POST", "/api/auth/login", { username: "dueno@delywa.test", password: "clave-nueva-456" })).status).toBe(200);
    expect((await t.db.select().from(bitacora).where(eq(bitacora.userId, dueno.id))).some((b) => b.accion.includes("contraseña"))).toBe(true);
  });
});

describe("aviso de equipo nuevo", () => {
  it("el primer equipo no avisa; uno nuevo sí; el mismo equipo no vuelve a avisar", async () => {
    await createUser(t.db, { idPrefix: "owner", email: "eva@delywa.test", password: "clave-de-eva-12", firstName: "Eva", role: "colmado_owner" });
    const avisos = () => correosEnviados.filter((x) => x.to[0] === "eva@delywa.test" && x.subject.includes("Nuevo inicio")).length;
    const casa = t.client();
    await casa.request("POST", "/api/auth/login", { username: "eva@delywa.test", password: "clave-de-eva-12" });
    expect(avisos()).toBe(0);
    await t.client().request("POST", "/api/auth/login", { username: "eva@delywa.test", password: "clave-de-eva-12" });
    expect(avisos()).toBe(1);
    await casa.request("POST", "/api/auth/login", { username: "eva@delywa.test", password: "clave-de-eva-12" });
    expect(avisos()).toBe(1);
  });
});

describe("código de registro por correo", () => {
  it("primero manda el código y crea el negocio solo con el código correcto", async () => {
    const [rd] = await t.db.select().from(paises).where(eq(paises.codigo, "DO"));
    const datos = { paisId: rd.id, tipoNegocio: "colmado", nombreNegocio: "Colmado Código", nombre: "Lia", telefono: "8095550199", direccion: "Calle 9", correo: "lia@delywa.test", password: "clave-de-lia-12", aceptaTerminos: true };
    const h = { "CF-Connecting-IP": "10.3.3.3" };
    const r1 = await t.client().request("POST", "/api/registro-negocio", datos, h);
    expect(r1.json).toMatchObject({ codigoEnviado: true });
    const codigo = (correosEnviados.at(-1)!.subject.match(/^(\d{6})/) || [])[1];
    expect(codigo).toMatch(/^\d{6}$/);
    expect((await t.db.select().from(users).where(eq(users.email, "lia@delywa.test")))).toHaveLength(0);
    const malo = codigo === "000000" ? "111111" : "000000";
    expect((await t.client().request("POST", "/api/registro-negocio", { ...datos, codigo: malo }, h)).status).toBe(400);
    const r2 = await t.client().request("POST", "/api/registro-negocio", { ...datos, codigo }, h);
    expect(r2.status).toBe(201);
    // El correo queda confirmado: el panel no le pide confirmarlo otra vez.
    const [lia] = await t.db.select().from(users).where(eq(users.email, "lia@delywa.test"));
    expect(lia.emailVerificadoAt).toBeTruthy();
  });
});

describe("confirmar el correo de una cuenta que ya existe", () => {
  it("manda el código, lo revisa, marca el correo y lo vuelve a pedir si cambia el correo", async () => {
    await createUser(t.db, { idPrefix: "owner", email: "rafa@delywa.test", password: "clave-de-rafa-12", firstName: "Rafa", role: "colmado_owner" });
    const c = t.client();
    await c.request("POST", "/api/auth/login", { username: "rafa@delywa.test", password: "clave-de-rafa-12" });
    let ses = (await c.request("GET", "/api/auth/session")).json;
    expect(ses).toMatchObject({ correoActivo: true, user: { emailVerificado: false } });
    // Sin sesión no se puede pedir.
    expect((await t.client().request("POST", "/api/auth/correo/codigo")).status).toBe(401);

    const r1 = await c.request("POST", "/api/auth/correo/codigo");
    expect(r1.json).toMatchObject({ ok: true, correo: "rafa@delywa.test" });
    const codigo = (correosEnviados.at(-1)!.subject.match(/^(\d{6})/) || [])[1];
    expect(correosEnviados.at(-1)!.to).toEqual(["rafa@delywa.test"]);
    const malo = codigo === "000000" ? "111111" : "000000";
    expect((await c.request("POST", "/api/auth/correo/confirmar", { codigo: malo })).status).toBe(400);
    expect((await c.request("POST", "/api/auth/correo/confirmar", { codigo })).status).toBe(200);
    // Un código sirve una sola vez.
    expect((await c.request("POST", "/api/auth/correo/confirmar", { codigo })).status).toBe(400);
    ses = (await c.request("GET", "/api/auth/session")).json;
    expect(ses.user.emailVerificado).toBe(true);
    expect((await c.request("POST", "/api/auth/correo/codigo")).json).toMatchObject({ yaConfirmado: true });

    // Si cambian el correo, hay que confirmarlo otra vez.
    const [rafa] = await t.db.select().from(users).where(eq(users.email, "rafa@delywa.test"));
    await updateUser(t.db, rafa.id, { email: "rafa.nuevo@delywa.test" });
    const [despues] = await t.db.select().from(users).where(eq(users.id, rafa.id));
    expect(despues.emailVerificadoAt).toBeNull();
  });

  it("no manda más de 4 códigos por hora a la misma cuenta", async () => {
    await createUser(t.db, { idPrefix: "owner", email: "tito@delywa.test", password: "clave-de-tito-12", firstName: "Tito", role: "colmado_owner" });
    const c = t.client();
    await c.request("POST", "/api/auth/login", { username: "tito@delywa.test", password: "clave-de-tito-12" });
    const estados = [];
    for (let i = 0; i < 5; i++) estados.push((await c.request("POST", "/api/auth/correo/codigo")).status);
    expect(estados).toEqual([200, 200, 200, 200, 429]);
  });
});

describe("errores del sistema y bitácora", () => {
  it("cada error se guarda con su referencia y con 5 en 10 minutos avisa una vez", async () => {
    const env = await envEfectivo(t.env);
    const antes = correosEnviados.length;
    for (let i = 0; i < 6; i++) await registrarError(env, { ref: `ref${i}`, metodo: "GET", ruta: "/api/prueba", error: new Error("falla de prueba") });
    expect((await t.db.select().from(errores)).length).toBeGreaterThanOrEqual(6);
    const avisos = correosEnviados.slice(antes).filter((x) => x.subject.includes("errores"));
    expect(avisos).toHaveLength(1);
    const lista = await admin.request("GET", "/api/admin/errores");
    expect(lista.json[0]).toMatchObject({ ruta: "/api/prueba", mensaje: "falla de prueba" });
  });

  it("anota quién cambió qué, sin datos secretos", async () => {
    await admin.request("PUT", "/api/admin/integraciones", { valores: { openai_api_key: "sk-secreto-de-prueba-99" } });
    const lista = await admin.request("GET", "/api/admin/bitacora");
    const fila = lista.json.find((b: any) => b.accion === "PUT /api/admin/integraciones");
    expect(fila).toMatchObject({ usuario: "admin@delywa.test", rol: "platform_admin" });
    expect(fila.detalle).toContain("Llave de OpenAI");
    expect(JSON.stringify(lista.json)).not.toContain("sk-secreto");
    expect((await t.client().request("GET", "/api/admin/bitacora")).status).toBe(401);
  });
});

describe("respaldo diario en R2", () => {
  it("copia toda la base por partes, sin sesiones, y se descarga como .sql", async () => {
    const limite = LIMITE.filasPorVuelta;
    LIMITE.filasPorVuelta = 50; // varias vueltas, como en producción
    try {
      const env = await envEfectivo(t.env);
      expect(await iniciarRespaldo(env, "2026-01-01")).toBe(true);
      let vueltas = 0;
      while (!(await pasoRespaldo(env)) && vueltas < 500) vueltas++;
      expect(vueltas).toBeGreaterThan(1);
      const [r] = await t.db.select().from(respaldos).where(eq(respaldos.dia, "2026-01-01"));
      expect(r.estado).toBe("listo");
      const lista = await admin.request("GET", "/api/admin/respaldos");
      expect(lista.json.respaldos[0]).toMatchObject({ dia: "2026-01-01", estado: "listo" });
      const d = await admin.raw("GET", "/api/admin/respaldos/2026-01-01/descargar");
      expect(d.headers.get("content-disposition")).toContain("delywa-respaldo-2026-01-01.sql");
      const sqlTexto = await d.text();
      expect(sqlTexto).toContain("CREATE TABLE `colmados`");
      expect(sqlTexto).toContain(`INSERT INTO "users"`);
      expect(sqlTexto).toContain("admin@delywa.test");
      expect(sqlTexto).not.toContain(`INSERT INTO "sessions"`);
      expect(sqlTexto).not.toContain("CREATE TABLE `sessions`");
      expect((await t.client().raw("GET", "/api/admin/respaldos/2026-01-01/descargar")).status).toBe(401);
    } finally {
      LIMITE.filasPorVuelta = limite;
    }
  });
});

describe("aviso de fin de prueba", () => {
  it("avisa 3 días antes, una sola vez", async () => {
    const [trial] = await t.db.select().from(planes).where(eq(planes.esTrial, true));
    const d = await createUser(t.db, { idPrefix: "owner", email: "prueba@delywa.test", password: "clave-prueba-12", firstName: "Pablo", role: "colmado_owner" });
    await t.db.insert(colmados).values({ nombre: "Colmado Prueba", slug: "colmado-prueba-fin", whatsappNumero: "18095550777", direccion: "A", planId: trial.id, ownerUserId: d.id,
      fechaVencimiento: new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000) });
    olvidarCache(t.env);
    const env = await envEfectivo(t.env);
    expect(await avisosFinDePrueba(env)).toBe(1);
    expect(await avisosFinDePrueba(env)).toBe(0);
    expect(correosEnviados.at(-1)).toMatchObject({ to: ["prueba@delywa.test"] });
    expect(correosEnviados.at(-1)!.subject).toContain("termina en 3 días");
  });
});

describe("peticiones desde otra página", () => {
  it("rechaza un cambio con la sesión si viene de otro sitio, y acepta el propio", async () => {
    await createUser(t.db, { idPrefix: "owner", email: "otro-sitio@delywa.test", password: "clave-otro-sitio-1", firstName: "Oto", role: "colmado_owner" });
    const c = t.client();
    await c.request("POST", "/api/auth/login", { username: "otro-sitio@delywa.test", password: "clave-otro-sitio-1" });
    expect((await c.request("POST", "/api/auth/logout", undefined, { Origin: "https://malo.example" })).status).toBe(403);
    expect((await c.request("GET", "/api/auth/session")).json.isAuthenticated).toBe(true);
    expect((await c.request("POST", "/api/auth/logout", undefined, { Origin: "https://delywa.test" })).status).toBe(200);
  });
});
