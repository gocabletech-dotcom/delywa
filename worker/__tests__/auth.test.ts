// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, configuracionSistema, sessions, users, loginIntentos } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { hashPassword, verifyPassword } from "../lib/password";
import { isColmadoAbierto } from "../lib/horario";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => { t = await createTestApp(); }, 60_000);
afterAll(async () => { await t?.dispose(); });

const ADMIN = { email: "admin@delywa.test", password: "clave-admin-segura", firstName: "Admin" };

async function nuevoColmado(nombre: string, whatsapp: string, extra: Partial<typeof colmados.$inferInsert> = {}) {
  const [c] = await t.db.insert(colmados).values({ nombre, whatsappNumero: whatsapp, direccion: "Calle 1", planId: 1, ...extra }).returning();
  return c;
}

describe("contraseñas", () => {
  it("verifica la correcta y rechaza la incorrecta o un formato desconocido", async () => {
    const hash = await hashPassword("secreto123");
    expect(hash.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("secreto123", hash)).toBe(true);
    expect(await verifyPassword("secreto124", hash)).toBe(false);
    expect(await verifyPassword("x", "$2b$10$abcdefghijklmnopqrstuv")).toBe(false);
    expect(await verifyPassword("x", null)).toBe(false);
  });
});

describe("horario", () => {
  const base = { estaAbiertoManual: true, mensajeCerrado: null, horaApertura: "08:00", horaCierre: "22:00", diasServicio: null };
  it("abre y cierra según la hora local del negocio", () => {
    // 2026-11-11 16:00 UTC = 12:00 en Santo Domingo (UTC-4)
    expect(isColmadoAbierto(base, "America/Santo_Domingo", new Date("2026-11-11T16:00:00Z")).abierto).toBe(true);
    // 03:00 UTC = 23:00 del día anterior en Santo Domingo
    expect(isColmadoAbierto(base, "America/Santo_Domingo", new Date("2026-11-11T03:00:00Z")).abierto).toBe(false);
    expect(isColmadoAbierto({ ...base, estaAbiertoManual: false }, undefined, new Date("2026-11-11T16:00:00Z")).abierto).toBe(false);
    // miércoles fuera de los días de servicio
    expect(isColmadoAbierto({ ...base, diasServicio: ["lunes"] }, undefined, new Date("2026-11-11T16:00:00Z")).abierto).toBe(false);
  });
});

describe("primer acceso", () => {
  it("no está disponible sin código de instalación", async () => {
    const c = t.client();
    expect((await c.request("GET", "/api/auth/setup")).json).toEqual({ disponible: false });
    expect((await c.request("POST", "/api/auth/setup", { ...ADMIN, codigo: "x" })).status).toBe(403);
  });

  it("crea el administrador una sola vez con el código correcto", async () => {
    await t.db.insert(configuracionSistema).values({ clave: "setup_code", valor: "CODIGO-123", tipo: "texto" });
    const c = t.client();
    expect((await c.request("GET", "/api/auth/setup")).json).toEqual({ disponible: true });
    expect((await c.request("POST", "/api/auth/setup", { ...ADMIN, codigo: "MAL" })).status).toBe(403);
    expect((await c.request("POST", "/api/auth/setup", { ...ADMIN, password: "corta", codigo: "CODIGO-123" })).status).toBe(400);

    const ok = await c.request("POST", "/api/auth/setup", { ...ADMIN, codigo: "CODIGO-123" });
    expect(ok.status).toBe(201);
    expect(c.cookies.has("delywa_sid")).toBe(true);
    expect((await c.request("GET", "/api/auth/session")).json.user.role).toBe("platform_admin");

    // El código se borra y ya no se puede crear otro administrador.
    expect(await t.db.select().from(configuracionSistema).where(eq(configuracionSistema.clave, "setup_code"))).toHaveLength(0);
    await t.db.insert(configuracionSistema).values({ clave: "setup_code", valor: "OTRO", tipo: "texto" });
    const again = await t.client().request("POST", "/api/auth/setup", { email: "b@x.test", password: "otra-clave-larga", firstName: "B", codigo: "OTRO" });
    expect(again.status).toBe(403);
    await t.db.delete(loginIntentos);
  });
});

describe("inicio de sesión", () => {
  it("rechaza credenciales incorrectas sin distinguir usuario inexistente", async () => {
    const c = t.client();
    const a = await c.request("POST", "/api/auth/login", { username: ADMIN.email, password: "incorrecta" });
    const b = await c.request("POST", "/api/auth/login", { username: "nadie@delywa.test", password: "incorrecta" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json).toEqual(b.json);
    expect(c.cookies.has("delywa_sid")).toBe(false);
    await t.db.delete(loginIntentos);
  });

  it("inicia sesión, guarda la sesión antes de responder y la cierra", async () => {
    const c = t.client();
    const login = await c.request("POST", "/api/auth/login", { username: ADMIN.email.toUpperCase(), password: ADMIN.password });
    expect(login.status).toBe(200);
    expect(login.json).toMatchObject({ success: true, role: "platform_admin" });
    expect(login.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    expect(login.headers.getSetCookie()[0]).toMatch(/Secure/i);

    // Peticiones inmediatas tras el login ya ven la sesión.
    const [session, user] = await Promise.all([c.request("GET", "/api/auth/session"), c.request("GET", "/api/auth/user")]);
    expect(session.json.isAuthenticated).toBe(true);
    expect(user.status).toBe(200);
    expect(user.json.email).toBe(ADMIN.email);
    expect(user.json).not.toHaveProperty("password");

    const sid = c.cookies.get("delywa_sid")!;
    expect((await c.request("POST", "/api/auth/logout")).status).toBe(200);
    expect(c.cookies.has("delywa_sid")).toBe(false);
    expect(await t.db.select().from(sessions).where(eq(sessions.sid, sid))).toHaveLength(0);
    // La cookie vieja ya no sirve.
    c.cookies.set("delywa_sid", sid);
    expect((await c.request("GET", "/api/auth/user")).status).toBe(401);
  });

  it("cambia el identificador de sesión al iniciar sesión", async () => {
    const c = t.client();
    await c.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    const first = c.cookies.get("delywa_sid");
    await c.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    const second = c.cookies.get("delywa_sid");
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(await t.db.select().from(sessions).where(eq(sessions.sid, first!))).toHaveLength(0);
  });

  it("ignora cookies de sesión inventadas", async () => {
    const c = t.client();
    c.cookies.set("delywa_sid", "f".repeat(64));
    expect((await c.request("GET", "/api/auth/session")).json).toEqual({ isAuthenticated: false });
    expect((await c.request("GET", "/api/admin/users")).status).toBe(401);
  });

  it("bloquea tras 5 intentos fallidos, incluso con la contraseña correcta", async () => {
    const c = t.client();
    for (let i = 0; i < 5; i++) {
      expect((await c.request("POST", "/api/auth/login", { username: ADMIN.email, password: "mala" })).status).toBe(401);
    }
    const blocked = await c.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    await t.db.delete(loginIntentos);
    expect((await c.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password })).status).toBe(200);
  });
});

describe("roles y sucursales", () => {
  it("aplica los permisos de dueño, empleados y administrador", async () => {
    const principal = await nuevoColmado("Colmado A", "18090000001");
    const sucursal = await nuevoColmado("Colmado A2", "18090000002", { negocioPrincipalId: principal.id });
    const ajeno = await nuevoColmado("Colmado B", "18090000003");
    const duenoA = await createUser(t.db, { idPrefix: "owner", email: "a@delywa.test", password: "duenoA123", firstName: "Ana", role: "colmado_owner", colmadoId: principal.id });
    const duenoB = await createUser(t.db, { idPrefix: "owner", email: "b@delywa.test", password: "duenoB123", firstName: "Beto", role: "colmado_owner", colmadoId: ajeno.id });
    await t.db.update(colmados).set({ ownerUserId: duenoA.id }).where(eq(colmados.id, principal.id));
    await t.db.update(colmados).set({ ownerUserId: duenoB.id }).where(eq(colmados.id, ajeno.id));

    const a = t.client();
    await a.request("POST", "/api/auth/login", { username: "a@delywa.test", password: "duenoA123" });
    expect((await a.request("GET", "/api/user/role")).json).toMatchObject({ role: "colmado_owner", sucursales: [principal.id, sucursal.id] });

    // El dueño no puede asignar sucursales ajenas ni crear roles no permitidos.
    const nuevo = { email: "Emp@Delywa.test", password: "emp12345", firstName: "Eva", role: "operador_sucursal" };
    expect((await a.request("POST", "/api/negocio/usuarios", { ...nuevo, sucursalIds: [ajeno.id] })).status).toBe(400);
    expect((await a.request("POST", "/api/negocio/usuarios", { ...nuevo, role: "platform_admin", sucursalIds: [sucursal.id] })).status).toBe(400);
    const creado = await a.request("POST", "/api/negocio/usuarios", { ...nuevo, sucursalIds: [sucursal.id, ajeno.id] });
    expect(creado.status).toBe(201);
    expect(creado.json).toMatchObject({ email: "emp@delywa.test", sucursalIds: [sucursal.id] });
    expect((await a.request("POST", "/api/negocio/usuarios", { ...nuevo, sucursalIds: [sucursal.id] })).status).toBe(409);

    const lista = await a.request("GET", "/api/negocio/usuarios-sucursales");
    expect(lista.json.sucursales).toHaveLength(2);
    expect(JSON.stringify(lista.json)).not.toContain("pbkdf2$");

    // El empleado solo ve su sucursal y no gestiona usuarios.
    const e = t.client();
    await e.request("POST", "/api/auth/login", { username: "emp@delywa.test", password: "emp12345" });
    expect((await e.request("GET", "/api/user/role")).json).toMatchObject({ role: "operador_sucursal", sucursales: [sucursal.id] });
    expect((await e.request("GET", "/api/negocio/usuarios-sucursales")).status).toBe(403);
    expect((await e.request("POST", "/api/negocio/usuarios", { ...nuevo, email: "x@x.test", sucursalIds: [sucursal.id] })).status).toBe(403);
    expect((await e.request("GET", "/api/admin/users")).status).toBe(403);
    expect((await e.request("DELETE", `/api/users/${duenoA.id}`)).status).toBe(403);

    // Otro dueño no puede tocar al empleado de A.
    const b = t.client();
    await b.request("POST", "/api/auth/login", { username: "b@delywa.test", password: "duenoB123" });
    const cambio = { email: "emp@delywa.test", firstName: "Eva", role: "admin_pedidos", sucursalIds: [ajeno.id] };
    expect((await b.request("PATCH", `/api/negocio/usuarios/${creado.json.id}`, cambio)).status).toBe(404);
    expect((await b.request("PUT", `/api/negocio/usuarios-sucursales/${creado.json.id}`, { sucursalIds: [ajeno.id] })).status).toBe(404);

    // El dueño A sí puede, pero no convertirlo en dueño.
    expect((await a.request("PATCH", `/api/negocio/usuarios/${creado.json.id}`, { ...cambio, role: "colmado_owner", sucursalIds: [principal.id] })).status).toBe(400);
    const editado = await a.request("PATCH", `/api/negocio/usuarios/${creado.json.id}`, { ...cambio, sucursalIds: [principal.id, sucursal.id] });
    expect(editado.status).toBe(200);
    expect(editado.json).toMatchObject({ role: "admin_pedidos", sucursalIds: [principal.id, sucursal.id] });

    // Administrador de plataforma: lista sin contraseñas y gestiona usuarios.
    const adm = t.client();
    await adm.request("POST", "/api/auth/login", { username: ADMIN.email, password: ADMIN.password });
    const todos = await adm.request("GET", "/api/admin/users");
    expect(todos.status).toBe(200);
    expect(todos.json.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(todos.json)).not.toContain("pbkdf2$");
    const yo = todos.json.find((u: any) => u.email === ADMIN.email);
    expect((await adm.request("DELETE", `/api/users/${yo.id}`)).status).toBe(400);
    expect((await adm.request("PATCH", `/api/admin/users/${yo.id}/role`, { role: "pending" })).status).toBe(400);
    expect((await adm.request("DELETE", `/api/users/${creado.json.id}`)).status).toBe(200);
    // La sesión del usuario eliminado deja de servir.
    expect((await e.request("GET", "/api/auth/user")).status).toBe(401);
  });

  it("cierra la sesión inactiva más de una hora si el negocio está cerrado", async () => {
    const cerrado = await nuevoColmado("Colmado C", "18090000004", { estaAbiertoManual: false });
    await createUser(t.db, { idPrefix: "owner", email: "c@delywa.test", password: "duenoC123", firstName: "Caro", role: "colmado_owner", colmadoId: cerrado.id });
    const c = t.client();
    await c.request("POST", "/api/auth/login", { username: "c@delywa.test", password: "duenoC123" });
    expect((await c.request("GET", "/api/auth/user")).status).toBe(200);

    const sid = c.cookies.get("delywa_sid")!;
    const [row] = await t.db.select().from(sessions).where(eq(sessions.sid, sid));
    await t.db.update(sessions).set({ sess: { ...(row.sess as object), lastActivity: Date.now() - 2 * 3_600_000 } }).where(eq(sessions.sid, sid));
    const res = await c.request("GET", "/api/auth/user");
    expect(res.status).toBe(401);
    expect(res.json.reason).toBe("inactivity_closed");
    expect(await t.db.select().from(sessions).where(eq(sessions.sid, sid))).toHaveLength(0);
  });

  it("los endpoints no migrados responden 501", async () => {
    expect((await t.client().request("GET", "/api/pedidos")).status).toBe(501);
    expect(await t.db.select().from(users)).not.toHaveLength(0);
  });
});
