import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { base32, codigoEn, deBase32, pasoActual, verificarCodigo } from "../lib/dos-pasos";
import { instalarSecretos } from "../lib/secretos";

let t: Awaited<ReturnType<typeof createTestApp>>;
const ADMIN = { email: "dos@delywa.test", password: "plataforma-dos-pasos-1" };

beforeAll(async () => {
  t = await createTestApp();
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-dos-pasos";
  instalarSecretos("clave-maestra-dos-pasos");
  await createUser(t.db, { idPrefix: "admin", email: ADMIN.email, password: ADMIN.password, firstName: "Plata", role: "platform_admin" });
  await createUser(t.db, { idPrefix: "owner", email: "duena-2p@delywa.test", password: "duena-dos-pasos-1", firstName: "Duna", role: "colmado_owner" });
});
afterAll(async () => { instalarSecretos(undefined); await t.dispose(); });

describe("códigos de la app (TOTP)", () => {
  it("coincide con el ejemplo del RFC 6238 y no acepta el mismo código dos veces", () => {
    // Secreto del RFC ("12345678901234567890") en el segundo 59: 287082.
    const secreto = base32(new TextEncoder().encode("12345678901234567890"));
    expect(deBase32(secreto).toString()).toBe("12345678901234567890");
    expect(codigoEn(secreto, 1)).toBe("287082");
    const ahora = Date.now();
    const codigo = codigoEn(secreto, pasoActual(ahora));
    const paso = verificarCodigo(secreto, codigo, null, ahora);
    expect(paso).toBe(pasoActual(ahora));
    expect(verificarCodigo(secreto, codigo, paso, ahora)).toBeNull();
    expect(verificarCodigo(secreto, "000000", null, ahora)).toBeNull();
  });
});

describe("verificación en dos pasos de la cuenta de plataforma", () => {
  it("se activa con el primer código y después la contraseña sola no basta", async () => {
    const a = t.client();
    await a.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    expect((await a.request("GET", "/api/auth/dos-pasos")).json).toMatchObject({ disponible: true, activo: false });
    const inicio = await a.request("POST", "/api/auth/dos-pasos/iniciar");
    expect(inicio.json.enlace).toContain("otpauth://totp/DelyWa");
    const secreto = inicio.json.secreto as string;
    expect((await a.request("POST", "/api/auth/dos-pasos/activar", { codigo: "123456" })).status).toBe(400);
    const activada = await a.request("POST", "/api/auth/dos-pasos/activar", { codigo: codigoEn(secreto, pasoActual()) });
    expect(activada.status).toBe(200);
    expect(activada.json.codigosRespaldo).toHaveLength(8);
    // El secreto no sale nunca hacia el navegador.
    expect(JSON.stringify((await a.request("GET", "/api/auth/user")).json)).not.toContain(secreto);
    // En la base queda cifrado.
    const fila = await t.env.DB.prepare("SELECT dos_pasos_secreto AS s FROM users WHERE email = ?").bind(ADMIN.email).first<{ s: string }>();
    expect(fila!.s).toMatch(/^c1:/);

    // Entrar de nuevo: la contraseña sola no abre la sesión.
    const b = t.client();
    const paso1 = await b.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    expect(paso1.json).toMatchObject({ requiereDosPasos: true });
    expect((await b.request("GET", "/api/auth/user")).status).toBe(401);
    expect((await b.request("POST", "/api/auth/dos-pasos/verificar", { codigo: "000000" })).status).toBe(400);
    // El mismo código que se usó para activar ya no sirve; uno de respaldo sí, una sola vez.
    const respaldo = activada.json.codigosRespaldo[0] as string;
    expect((await b.request("POST", "/api/auth/dos-pasos/verificar", { codigo: respaldo.toLowerCase() })).status).toBe(200);
    expect((await b.request("GET", "/api/auth/user")).status).toBe(200);
    expect((await b.request("GET", "/api/auth/dos-pasos")).json.respaldosRestantes).toBe(7);
    const c2 = t.client();
    await c2.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    expect((await c2.request("POST", "/api/auth/dos-pasos/verificar", { codigo: respaldo })).status).toBe(400);
    // Sin el paso de la contraseña, el código no abre nada.
    expect((await t.client().request("POST", "/api/auth/dos-pasos/verificar", { codigo: activada.json.codigosRespaldo[1] })).status).toBe(401);

    // Apagarla pide contraseña y código.
    expect((await b.request("POST", "/api/auth/dos-pasos/desactivar", { password: "mala", codigo: activada.json.codigosRespaldo[1] })).status).toBe(400);
    expect((await b.request("POST", "/api/auth/dos-pasos/desactivar", { password: ADMIN.password, codigo: activada.json.codigosRespaldo[1] })).status).toBe(200);
    expect((await t.client().request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password })).json).toMatchObject({ success: true });
  });

  it("los negocios no la tienen", async () => {
    const d = t.client();
    await d.request("POST", "/api/auth/login", { username: "duena-2p@delywa.test", password: "duena-dos-pasos-1" });
    expect((await d.request("GET", "/api/auth/dos-pasos")).json.disponible).toBe(false);
    expect((await d.request("POST", "/api/auth/dos-pasos/iniciar")).status).toBe(403);
  });
});
