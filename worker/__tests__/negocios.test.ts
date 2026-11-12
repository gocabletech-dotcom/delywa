// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, configuracionSistema, menuProductos, metodosPago, users } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";

let t: Awaited<ReturnType<typeof createTestApp>>;
let admin: ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;

async function login(email: string, password: string) {
  const c = t.client();
  const res = await c.request("POST", "/api/auth/login", { username: email, password });
  expect(res.status).toBe(200);
  return c;
}

const negocio = (extra: Record<string, unknown> = {}) => ({
  nombre: "Cafetería La Ñapa", whatsappNumero: "18095550001", direccion: "Av. Duarte 10", planId: 1,
  tipoNegocio: "cafeteria", estado: "activo", ...extra,
});

beforeAll(async () => {
  t = await createTestApp();
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "clave-admin-segura", firstName: "Admin", role: "platform_admin" });
  admin = await login("admin@delywa.test", "clave-admin-segura");
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("catálogos", () => {
  it("expone países, tipos y planes sembrados", async () => {
    const c = t.client();
    expect((await c.request("GET", "/api/paises")).json).toHaveLength(3);
    expect((await c.request("GET", "/api/tipos-negocio?activos=true")).json).toHaveLength(7);
    expect((await c.request("GET", "/api/tipos-negocio/farmacia")).json.slug).toBe("farmacia");
    const planes = (await c.request("GET", "/api/planes")).json;
    expect(planes.map((p: any) => p.slug)).toEqual(["trial", "basico", "profesional"]);
    expect(typeof planes[0].precioMensual).toBe("string");
    expect(Array.isArray(planes[0].caracteristicas)).toBe(true);
  });

  it("la configuración es solo para la plataforma y oculta el código de instalación", async () => {
    await t.db.insert(configuracionSistema).values({ clave: "setup_code", valor: "SECRETO", tipo: "texto" });
    expect((await t.client().request("GET", "/api/configuracion")).status).toBe(401);
    const res = await admin.request("GET", "/api/configuracion");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.json)).not.toContain("SECRETO");
    expect((await admin.request("GET", "/api/configuracion/setup_code")).status).toBe(404);
    expect((await admin.request("GET", "/api/configuracion/zip_alert_threshold_per_hour")).json.valor).toBe("5");
  });

  it("administra planes con validación y protege los que están en uso", async () => {
    expect((await admin.request("POST", "/api/planes", { nombre: "Sin precio" })).status).toBe(400);
    const creado = await admin.request("POST", "/api/planes", { nombre: "Oro", slug: "oro", precioMensual: "99.50", caracteristicas: ["A"] });
    expect(creado.status).toBe(201);
    expect((await admin.request("POST", "/api/planes", { nombre: "Oro 2", slug: "oro", precioMensual: "1" })).status).toBe(409);
    const editado = await admin.request("PATCH", `/api/planes/${creado.json.id}`, { precioMensual: "120", id: 1 });
    expect(editado.json).toMatchObject({ id: creado.json.id, precioMensual: "120.00" });
    expect((await admin.request("DELETE", `/api/planes/${creado.json.id}`)).status).toBe(200);
    expect((await t.client().request("DELETE", "/api/planes/1")).status).toBe(401);
  });

  it("administra países validando el patrón postal", async () => {
    const base = { codigo: "mx", nombre: "México", prefijoCelular: "52", moneda: "MXN", simboloMoneda: "$", zonaHoraria: "America/Mexico_City" };
    expect((await admin.request("POST", "/api/admin/paises", { ...base, patronCodigoPostal: "(" })).status).toBe(400);
    const mx = await admin.request("POST", "/api/admin/paises", { ...base, patronCodigoPostal: "\\d{5}" });
    expect(mx.json.codigo).toBe("MX");
    expect((await admin.request("POST", "/api/admin/paises", base)).status).toBe(409);
    expect((await admin.request("PATCH", `/api/admin/paises/${mx.json.id}`, { activo: false })).json.activo).toBe(false);
    expect((await t.client().request("GET", "/api/paises")).json).toHaveLength(3);
    expect((await admin.request("DELETE", `/api/admin/paises/${mx.json.id}`)).status).toBe(200);
  });
});

describe("negocios", () => {
  let cafe: any;
  let otro: any;
  let duenoCafe: typeof admin;
  let duenoOtro: typeof admin;

  it("solo la plataforma crea y lista negocios", async () => {
    const anon = t.client();
    expect((await anon.request("POST", "/api/colmados", negocio())).status).toBe(401);
    expect((await anon.request("GET", "/api/colmados")).status).toBe(401);
    expect((await admin.request("POST", "/api/colmados", { nombre: "Sin datos" })).status).toBe(400);

    const res = await admin.request("POST", "/api/colmados", negocio());
    expect(res.status).toBe(201);
    cafe = res.json;
    expect(cafe.slug).toBe("cafeteria-la-napa");
    // Se aplica la plantilla de menú del tipo de negocio.
    const menu = await t.db.select().from(menuProductos).where(eq(menuProductos.colmadoId, cafe.id));
    expect(menu.length).toBeGreaterThan(5);

    expect((await admin.request("POST", "/api/colmados", negocio({ nombre: "Otro" }))).status).toBe(409);
    otro = (await admin.request("POST", "/api/colmados", negocio({ whatsappNumero: "18095550002", tipoNegocio: "colmado" }))).json;
    expect(otro.slug).toBe("cafeteria-la-napa-1");
    expect(await t.db.select().from(menuProductos).where(eq(menuProductos.colmadoId, otro.id))).toHaveLength(0);
    expect((await admin.request("GET", "/api/admin/colmados")).json).toHaveLength(2);
  });

  it("crea los dueños y limita lo que cada uno puede cambiar", async () => {
    const owner = await admin.request("POST", `/api/colmados/${cafe.id}/owner`, { email: "cafe@delywa.test", password: "cafe-clave-segura", firstName: "Carla" });
    expect(owner.status).toBe(201);
    expect(owner.json.user).not.toHaveProperty("password");
    expect((await admin.request("POST", `/api/colmados/${cafe.id}/owner`, { email: "cafe@delywa.test", password: "cafe-clave-segura", firstName: "X" })).status).toBe(409);
    await admin.request("POST", `/api/colmados/${otro.id}/owner`, { email: "otro@delywa.test", password: "otro-clave-segura", firstName: "Omar" });
    duenoCafe = await login("cafe@delywa.test", "cafe-clave-segura");
    duenoOtro = await login("otro@delywa.test", "otro-clave-segura");

    const ok = await duenoCafe.request("PATCH", `/api/colmados/${cafe.id}`, { nombre: "Café Ñapa", costoDelivery: 75, colorPrimario: "#ff0000", diasServicio: ["lunes", "martes"] });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ nombre: "Café Ñapa", costoDelivery: "75.00", colorPrimario: "#FF0000", diasServicio: ["lunes", "martes"], simboloMoneda: "RD$" });
    expect((await duenoCafe.request("PATCH", `/api/colmados/${cafe.id}`, { colorPrimario: "rojo" })).status).toBe(400);
    expect((await duenoCafe.request("PATCH", `/api/colmados/${cafe.id}`, { costoDelivery: -5 })).status).toBe(400);
    expect((await duenoCafe.request("PATCH", `/api/colmados/${otro.id}`, { nombre: "Hackeado" })).status).toBe(403);

    // Un dueño no puede cambiarse el plan ni extender su suscripción.
    const intento = await duenoCafe.request("PATCH", `/api/colmados/${cafe.id}`, { planId: 3, estadoSuscripcion: "activa", fechaVencimiento: "2099-01-01", tecnologiasHabilitadas: { meta: true } });
    expect(intento.status).toBe(400);
    const [fila] = await t.db.select().from(colmados).where(eq(colmados.id, cafe.id));
    expect(fila.planId).toBe(1);
    expect(fila.fechaVencimiento).toBeNull();
    // La plataforma sí.
    const porAdmin = await admin.request("PATCH", `/api/colmados/${cafe.id}`, { planId: 2, fechaVencimiento: "2027-01-31T00:00:00Z" });
    expect(porAdmin.json.planId).toBe(2);
    expect((await admin.request("PATCH", `/api/admin/colmados/${cafe.id}/tecnologias`, { link_pedido: true })).json.tecnologiasHabilitadas).toEqual({ link_pedido: true });
  });

  it("nunca entrega credenciales al público", async () => {
    await t.db.update(colmados).set({ evolutionApiKey: "EVO-SECRETA", evolutionApiUrl: "https://evo.test", botPromptCustom: "prompt interno" }).where(eq(colmados.id, cafe.id));
    expect((await duenoOtro.request("PATCH", `/api/colmados/${cafe.id}/whatsapp-config`, { phoneNumberId: "1", accessToken: "x" })).status).toBe(403);
    expect((await duenoCafe.request("PATCH", `/api/colmados/${cafe.id}/whatsapp-config`, { phoneNumberId: "123", accessToken: "TOKEN-META-SECRETO" })).status).toBe(200);

    for (const cliente of [t.client(), duenoOtro]) {
      const pub = await cliente.request("GET", `/api/colmados/${cafe.id}`);
      expect(pub.status).toBe(200);
      expect(pub.json).toMatchObject({ nombre: "Café Ñapa", whatsappConfigured: true, codigoPais: "DO" });
      const texto = JSON.stringify(pub.json);
      for (const secreto of ["TOKEN-META-SECRETO", "EVO-SECRETA", "prompt interno", "ownerUserId", "evo.test"]) expect(texto).not.toContain(secreto);
    }
    const propio = await duenoCafe.request("GET", `/api/colmados/${cafe.id}`);
    expect(propio.json.evolutionApiKey).toBe("EVO-SECRETA");
    expect(JSON.stringify(propio.json)).not.toContain("TOKEN-META-SECRETO");
    expect((await t.client().request("GET", "/api/colmados/99999")).status).toBe(404);
  });

  it("gestiona sucursales y la sucursal activa de la sesión", async () => {
    expect((await duenoCafe.request("POST", "/api/negocio/sucursales", { nombre: "Sucursal Norte" })).status).toBe(400);
    const suc = await duenoCafe.request("POST", "/api/negocio/sucursales", { nombre: "Sucursal Norte", whatsappNumero: "18095550003", direccion: "Calle 2" });
    expect(suc.status).toBe(201);
    expect(suc.json).toMatchObject({ negocioPrincipalId: cafe.id, tipoNegocio: "cafeteria", planId: 2, colorPrimario: "#FF0000" });
    expect((await duenoCafe.request("POST", "/api/negocio/sucursales", { nombre: "Repetida", whatsappNumero: "18095550003", direccion: "Calle 3" })).status).toBe(409);

    const lista = await duenoCafe.request("GET", "/api/negocio/sucursales");
    expect(lista.json.sucursales.map((s: any) => s.id)).toEqual([cafe.id, suc.json.id]);
    expect(lista.json.sucursalActivaId).toBe(cafe.id);
    expect(lista.json.sucursales[0].paisCodigo).toBeNull();

    expect((await duenoCafe.request("POST", `/api/negocio/sucursales/${otro.id}/seleccionar`)).status).toBe(403);
    expect((await duenoCafe.request("POST", `/api/negocio/sucursales/${suc.json.id}/seleccionar`)).status).toBe(200);
    expect((await duenoCafe.request("GET", "/api/user/role")).json).toMatchObject({ colmadoId: suc.json.id, sucursalId: suc.json.id });
    // El dueño también administra la sucursal nueva.
    expect((await duenoCafe.request("PATCH", `/api/colmados/${suc.json.id}`, { horaCierre: "23:00" })).status).toBe(200);
    expect((await duenoOtro.request("POST", `/api/negocio/sucursales/${suc.json.id}/seleccionar`)).status).toBe(403);
  });

  it("protege métodos de pago y suscripciones por negocio", async () => {
    expect((await t.client().request("GET", `/api/colmados/${cafe.id}/metodos-pago`)).json).toMatchObject({ efectivo: true, transferencia: false, bancos: [] });
    const cuerpo = { transferencia: true, bancos: [{ nombre: "Banreservas", numeroCuenta: "123", titular: "Carla" }, { malo: 1 }] };
    expect((await duenoOtro.request("PUT", `/api/colmados/${cafe.id}/metodos-pago`, cuerpo)).status).toBe(403);
    expect((await t.client().request("PUT", `/api/colmados/${cafe.id}/metodos-pago`, cuerpo)).status).toBe(401);
    const guardado = await duenoCafe.request("PUT", `/api/colmados/${cafe.id}/metodos-pago`, cuerpo);
    expect(guardado.json).toMatchObject({ efectivo: true, transferencia: true, bancos: [{ nombre: "Banreservas", numeroCuenta: "123", titular: "Carla" }] });
    await duenoCafe.request("PUT", `/api/colmados/${cafe.id}/metodos-pago`, { tarjeta: true });
    const [fila] = await t.db.select().from(metodosPago).where(eq(metodosPago.colmadoId, cafe.id));
    expect(fila).toMatchObject({ transferencia: true, tarjeta: true });
    expect(fila.bancos).toHaveLength(1);

    expect((await duenoOtro.request("GET", `/api/colmados/${cafe.id}/suscripcion`)).status).toBe(403);
    const sus = await duenoCafe.request("GET", `/api/colmados/${cafe.id}/suscripcion`);
    expect(sus.json.plan.slug).toBe("basico");
    expect(sus.json.diasRestantes).toBeGreaterThan(0);
    expect(sus.json.expirado).toBe(false);
    expect((await duenoCafe.request("POST", `/api/colmados/${cafe.id}/suscripcion`, { planId: 3 })).status).toBe(403);
    const nueva = await admin.request("POST", `/api/colmados/${cafe.id}/suscripcion`, { planId: 3 });
    expect(nueva.status).toBe(201);
    expect(new Date(nueva.json.suscripcion.fechaFin).getTime()).toBeGreaterThan(Date.now());
    expect((await admin.request("GET", "/api/admin/suscripciones-por-vencer?dias=400")).json).toHaveLength(1);
    expect((await admin.request("DELETE", "/api/planes/2")).status).toBe(409);
  });

  it("un usuario pendiente registra su negocio con el plan de prueba", async () => {
    await createUser(t.db, { idPrefix: "staff", email: "nuevo@delywa.test", password: "nuevo1234", firstName: "Nico", role: "pending" });
    const nuevo = await login("nuevo@delywa.test", "nuevo1234");
    const res = await nuevo.request("POST", "/api/user/register-colmado", { nombre: "Colmado Nico", whatsappNumero: "18095550009", direccion: "Calle 9", planId: 3 });
    expect(res.status).toBe(201);
    expect(res.json.planId).toBe(1);
    expect((await nuevo.request("GET", "/api/user/role")).json).toMatchObject({ role: "colmado_owner", colmadoId: res.json.id, sucursales: [res.json.id] });
    expect((await nuevo.request("POST", "/api/user/register-colmado", { nombre: "Otro más", whatsappNumero: "18095550010", direccion: "Calle 10" })).status).toBe(403);
  });

  it("revisa suscripciones, estado y borra en cascada", async () => {
    const stats = await admin.request("GET", "/api/admin/stats");
    expect(stats.json).toMatchObject({ totalColmados: 4, totalPedidos: 0, totalVentas: "0" });
    await t.db.update(colmados).set({ fechaVencimiento: new Date(Date.now() - 30 * 86_400_000) }).where(eq(colmados.id, otro.id));
    const check = await admin.request("POST", "/api/admin/check-subscriptions");
    expect(check.json.detalles.find((d: any) => d.colmadoId === otro.id).nuevoEstado).toBe("suspendida");

    expect((await admin.request("PATCH", `/api/colmados/${otro.id}/estado`, { estado: "cualquiera" })).status).toBe(400);
    expect((await admin.request("PATCH", `/api/colmados/${otro.id}/estado`, { estado: "inactivo" })).json.colmado.estado).toBe("inactivo");
    expect((await duenoCafe.request("DELETE", `/api/colmados/${otro.id}`)).status).toBe(403);

    expect((await admin.request("DELETE", `/api/colmados/${cafe.id}`)).status).toBe(200);
    expect(await t.db.select().from(menuProductos).where(eq(menuProductos.colmadoId, cafe.id))).toHaveLength(0);
    expect(await t.db.select().from(metodosPago).where(eq(metodosPago.colmadoId, cafe.id))).toHaveLength(0);
    // El dueño conserva su cuenta porque aún tiene la sucursal; al borrarla, se elimina.
    expect(await t.db.select().from(users).where(eq(users.email, "cafe@delywa.test"))).toHaveLength(1);
    const restantes = await t.db.select().from(colmados).where(eq(colmados.whatsappNumero, "18095550003"));
    await admin.request("DELETE", `/api/colmados/${restantes[0].id}`);
    expect(await t.db.select().from(users).where(eq(users.email, "cafe@delywa.test"))).toHaveLength(0);
  });
});
