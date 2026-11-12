// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, diccionarioJerga, menuProductos, menuProductoSucursales, plantillasJerga } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let admin: Client, dueno: Client, operador: Client, repartidor: Client, ajeno: Client;
let principal: any, sucursal: any, colmadoLibre: any, otroNegocio: any;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

async function negocio(nombre: string, whatsapp: string, extra: Partial<typeof colmados.$inferInsert> = {}) {
  const [row] = await t.db.insert(colmados).values({ nombre, whatsappNumero: whatsapp, direccion: "Calle 1", planId: 1, tipoNegocio: "cafeteria", ...extra }).returning();
  return row;
}

beforeAll(async () => {
  t = await createTestApp();
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "clave-admin-segura", firstName: "Admin", role: "platform_admin" });
  principal = await negocio("Café Central", "18091110001");
  sucursal = await negocio("Café Norte", "18091110002", { negocioPrincipalId: principal.id });
  colmadoLibre = await negocio("Colmado Libre", "18091110003", { tipoNegocio: "colmado" });
  otroNegocio = await negocio("Pizzería Ajena", "18091110004", { tipoNegocio: "pizzeria" });

  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: principal.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, principal.id));
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, sucursal.id));
  const op = await createUser(t.db, { idPrefix: "staff", email: "op@delywa.test", password: "op123456", firstName: "Omar", role: "operador_sucursal", colmadoId: sucursal.id });
  await setUserSucursalIds(t.db, op.id, [sucursal.id]);
  await createUser(t.db, { idPrefix: "staff", email: "rep@delywa.test", password: "rep12345", firstName: "Rita", role: "delivery", colmadoId: principal.id });
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@delywa.test", password: "ajeno123", firstName: "Abel", role: "colmado_owner", colmadoId: otroNegocio.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otroNegocio.id));

  admin = await login("admin@delywa.test", "clave-admin-segura");
  dueno = await login("dueno@delywa.test", "dueno1234");
  operador = await login("op@delywa.test", "op123456");
  repartidor = await login("rep@delywa.test", "rep12345");
  ajeno = await login("ajeno@delywa.test", "ajeno123");
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("menú", () => {
  let cafe: any;

  it("crea productos validando permisos, tipo de negocio y precio", async () => {
    const nuevo = { nombre: "Café con leche", precio: 85, categoria: "Bebidas", inventario: "12.7" };
    expect((await t.client().request("POST", `/api/colmados/${principal.id}/menu`, nuevo)).status).toBe(401);
    expect((await ajeno.request("POST", `/api/colmados/${principal.id}/menu`, nuevo)).status).toBe(403);
    expect((await repartidor.request("POST", `/api/colmados/${principal.id}/menu`, nuevo)).status).toBe(403);
    expect((await dueno.request("POST", `/api/colmados/${principal.id}/menu`, { nombre: "Sin precio" })).status).toBe(400);
    expect((await dueno.request("POST", `/api/colmados/${principal.id}/menu`, { ...nuevo, precio: -1 })).status).toBe(400);
    expect((await admin.request("POST", `/api/colmados/${colmadoLibre.id}/menu`, nuevo)).status).toBe(400);

    const res = await dueno.request("POST", `/api/colmados/${principal.id}/menu`, nuevo);
    expect(res.status).toBe(201);
    cafe = res.json;
    expect(cafe).toMatchObject({ nombre: "Café con leche", precio: "85.00", categoria: "Bebidas", disponible: true, inventario: 12 });
    await dueno.request("POST", `/api/colmados/${principal.id}/menu`, { nombre: "Croissant", precio: "60.5" });

    const publico = await t.client().request("GET", `/api/colmados/${principal.id}/menu`);
    expect(publico.json.map((p: any) => p.nombre)).toEqual(["Café con leche", "Croissant"]);
    expect((await t.client().request("GET", `/api/colmados/${principal.id}/menu/categorias`)).json).toEqual(["Bebidas", "General"]);
  });

  it("edita sin borrar el inventario cuando no se envía", async () => {
    const res = await dueno.request("PATCH", `/api/menu/${cafe.id}`, { disponible: false });
    expect(res.json).toMatchObject({ disponible: false, inventario: 12, precio: "85.00" });
    expect((await dueno.request("PATCH", `/api/menu/${cafe.id}`, { precio: "" })).status).toBe(400);
    expect((await dueno.request("PATCH", `/api/menu/${cafe.id}`, { precio: 90, disponible: true, inventario: "" })).json)
      .toMatchObject({ precio: "90.00", disponible: true, inventario: null });
    expect((await ajeno.request("PATCH", `/api/menu/${cafe.id}`, { precio: 1 })).status).toBe(403);
  });

  it("la sucursal hereda el menú y guarda su propio precio sin tocar el principal", async () => {
    const heredado = await operador.request("GET", `/api/colmados/${sucursal.id}/menu`);
    expect(heredado.json.find((p: any) => p.id === cafe.id).precio).toBe("90.00");

    // El operador no puede editar el producto del principal directamente…
    expect((await operador.request("PATCH", `/api/menu/${cafe.id}`, { precio: 1 })).status).toBe(403);
    // …pero sí su variación local.
    const local = await operador.request("PATCH", `/api/menu/${cafe.id}`, { sucursalId: sucursal.id, precio: 100, inventario: 3 });
    expect(local.json).toMatchObject({ id: cafe.id, precio: "100.00", inventario: 3 });
    expect((await t.client().request("GET", `/api/colmados/${principal.id}/menu`)).json.find((p: any) => p.id === cafe.id).precio).toBe("90.00");

    // Una sucursal que no hereda el producto no puede usarse para editarlo.
    expect((await ajeno.request("PATCH", `/api/menu/${cafe.id}`, { sucursalId: otroNegocio.id, precio: 1 })).status).toBe(400);

    // Borrar desde la sucursal solo lo oculta allí.
    expect((await operador.request("DELETE", `/api/menu/${cafe.id}`, { sucursalId: sucursal.id })).status).toBe(200);
    expect((await t.client().request("GET", `/api/colmados/${sucursal.id}/menu`)).json.find((p: any) => p.id === cafe.id).disponible).toBe(false);
    expect(await t.db.select().from(menuProductos).where(eq(menuProductos.id, cafe.id))).toHaveLength(1);
  });

  it("copia el menú completo entre sucursales del mismo negocio", async () => {
    await operador.request("POST", `/api/colmados/${sucursal.id}/menu`, { nombre: "Solo Norte", precio: 10 });
    expect((await operador.request("POST", `/api/colmados/${principal.id}/menu/copiar`, { targetSucursalId: sucursal.id })).status).toBe(403);
    expect((await dueno.request("POST", `/api/colmados/${principal.id}/menu/copiar`, { targetSucursalId: otroNegocio.id })).status).toBe(403);
    expect((await dueno.request("POST", `/api/colmados/${principal.id}/menu/copiar`, { targetSucursalId: principal.id })).status).toBe(400);

    const res = await dueno.request("POST", `/api/colmados/${principal.id}/menu/copiar`, { targetSucursalId: sucursal.id });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ success: true, copied: 2, removed: 1, target: "Café Norte" });
    const menuNorte = (await t.client().request("GET", `/api/colmados/${sucursal.id}/menu`)).json;
    expect(menuNorte.map((p: any) => p.nombre).sort()).toEqual(["Café con leche", "Croissant"]);
    expect(menuNorte.every((p: any) => p.colmadoId === principal.id)).toBe(true);
    expect(menuNorte.find((p: any) => p.id === cafe.id)).toMatchObject({ precio: "90.00", disponible: true });
    expect(await t.db.select().from(menuProductoSucursales).where(eq(menuProductoSucursales.sucursalId, sucursal.id))).toHaveLength(2);
  });

  it("aplica plantillas solo a menús vacíos", async () => {
    expect((await t.client().request("GET", "/api/plantillas-menu/pizzeria")).json.length).toBeGreaterThan(0);
    const todas = (await t.client().request("GET", "/api/plantillas-menu")).json;
    expect(todas.reduce((n: number, p: any) => n + p.items.length, 0)).toBe(114);

    expect((await dueno.request("POST", `/api/colmados/${principal.id}/aplicar-plantilla`)).status).toBe(400);
    expect((await dueno.request("POST", `/api/colmados/${otroNegocio.id}/aplicar-plantilla`)).status).toBe(403);
    const res = await ajeno.request("POST", `/api/colmados/${otroNegocio.id}/aplicar-plantilla`);
    expect(res.status).toBe(200);
    expect(res.json.productos.length).toBeGreaterThan(0);
    expect(res.json.message).toContain(String(res.json.productos.length));
  });
});

describe("jerga", () => {
  it("copia plantillas sin duplicar y protege el diccionario de cada negocio", async () => {
    await t.db.insert(plantillasJerga).values([
      { tipoNegocio: "cafeteria", jerga: "cafecito", productoIdentificado: "Café", precioSugerido: "50" },
      { tipoNegocio: "cafeteria", jerga: "Cafecito", productoIdentificado: "Café", precioSugerido: "50" },
      { tipoNegocio: "cafeteria", jerga: "inactiva", productoIdentificado: "X", activo: false },
      { tipoNegocio: "pizzeria", jerga: "una grande", productoIdentificado: "Pizza grande" },
    ]);
    expect((await ajeno.request("POST", `/api/colmados/${principal.id}/copiar-jerga-plantilla`)).status).toBe(403);
    expect((await dueno.request("POST", `/api/colmados/${principal.id}/copiar-jerga-plantilla`)).json.cantidad).toBe(1);
    expect((await dueno.request("POST", `/api/colmados/${principal.id}/copiar-jerga-plantilla`)).json.cantidad).toBe(0);

    const dic = await dueno.request("GET", `/api/colmados/${principal.id}/diccionario-jerga`);
    expect(dic.json).toHaveLength(1);
    expect(dic.json[0]).toMatchObject({ jerga: "cafecito", precioSugerido: "50.00", vecesUsado: 0 });
    expect((await ajeno.request("GET", `/api/colmados/${principal.id}/diccionario-jerga`)).status).toBe(403);

    const id = dic.json[0].id;
    expect((await ajeno.request("PATCH", `/api/diccionario-jerga/${id}`, { jerga: "x", productoIdentificado: "y" })).status).toBe(403);
    expect((await ajeno.request("DELETE", `/api/diccionario-jerga/${id}`)).status).toBe(403);
    const editado = await dueno.request("PATCH", `/api/diccionario-jerga/${id}`, { jerga: "  CAFÉ PRIETO ", productoIdentificado: "Café negro" });
    expect(editado.json).toMatchObject({ jerga: "café prieto", productoIdentificado: "Café negro", precioSugerido: "50.00" });
    expect((await dueno.request("DELETE", `/api/diccionario-jerga/${id}`)).status).toBe(200);
    expect(await t.db.select().from(diccionarioJerga)).toHaveLength(0);
  });

  it("administra plantillas de jerga y productos restringidos solo desde la plataforma", async () => {
    expect((await dueno.request("GET", "/api/admin/plantillas-jerga")).status).toBe(403);
    const creada = await admin.request("POST", "/api/admin/plantillas-jerga", { tipoNegocio: "colmado", jerga: " Una FRÍA ", productoIdentificado: "Cerveza", precioSugerido: 150, paisId: 1 });
    expect(creada.json).toMatchObject({ jerga: "una fría", precioSugerido: "150.00", paisId: 1 });
    expect((await admin.request("GET", "/api/admin/plantillas-jerga/colmado")).json).toHaveLength(1);
    expect((await admin.request("GET", "/api/admin/paises/1/jerga")).json).toHaveLength(1);
    expect((await admin.request("PATCH", `/api/admin/plantillas-jerga/${creada.json.id}`, { jerga: "" })).status).toBe(400);
    expect((await admin.request("PATCH", `/api/admin/plantillas-jerga/${creada.json.id}`, { activo: false })).json.activo).toBe(false);
    expect((await admin.request("DELETE", `/api/admin/plantillas-jerga/${creada.json.id}`)).status).toBe(200);

    expect((await dueno.request("POST", "/api/admin/productos-restringidos", { palabraClave: "ron", categoria: "alcohol" })).status).toBe(403);
    const pr = await admin.request("POST", "/api/admin/productos-restringidos", { palabraClave: " RON ", categoria: "alcohol" });
    expect(pr.json).toMatchObject({ palabraClave: "ron", activo: true });
    expect((await admin.request("PUT", `/api/admin/productos-restringidos/${pr.json.id}`, { activo: false })).json.activo).toBe(false);
    expect((await admin.request("GET", "/api/admin/productos-restringidos")).json).toHaveLength(1);
    expect((await admin.request("DELETE", `/api/admin/productos-restringidos/${pr.json.id}`)).status).toBe(200);
  });
});

describe("copiar menú hacia el principal", () => {
  it("copia el menú de una sucursal al negocio principal sin duplicar", async () => {
    const antes = (await t.client().request("GET", `/api/colmados/${principal.id}/menu`)).json;
    const res = await dueno.request("POST", `/api/colmados/${sucursal.id}/menu/copiar`, { targetSucursalId: principal.id });
    expect(res.status).toBe(200);
    const despues = (await t.client().request("GET", `/api/colmados/${principal.id}/menu`)).json;
    expect(despues.map((p: any) => p.nombre).sort()).toEqual(antes.map((p: any) => p.nombre).sort());
    // La sucursal sigue viendo el menú (ahora heredado de los productos nuevos del principal).
    expect((await t.client().request("GET", `/api/colmados/${sucursal.id}/menu`)).json).toHaveLength(despues.length);
  });
});
