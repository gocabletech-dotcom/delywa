// @vitest-environment node
// Pruebas con D1 y R2 locales en memoria y datos inventados: nunca tocan la base ni el bucket reales.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, pedidos, subidasPendientes } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { tipoPorFirma } from "../lib/imagenes";
import { limpiarSubidasPendientes } from "../routes/uploads";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, operador: Client, ajeno: Client, anon: Client;
let negocio: any, otro: any;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 1, 0, 72, 0, 72]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}
const pedir = (c: Client, body: Record<string, unknown>, ip = "10.5.5.5") => c.request("POST", "/api/uploads/request-url", body, { "CF-Connecting-IP": ip });
const subir = (c: Client, url: string, bytes: Uint8Array, tipo: string) => c.raw("PUT", url, bytes, { "Content-Type": tipo });

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Negocio", slug: "negocio-up", whatsappNumero: "18097770001", direccion: "A", planId: 1 }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro", slug: "otro-up", whatsappNumero: "18097770002", direccion: "B", planId: 1 }).returning();
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

describe("fotos de productos", () => {
  it("valida tipo y tamaño al pedir el enlace", async () => {
    expect((await pedir(operador, { contentType: "image/png" })).status).toBe(400);
    expect((await pedir(operador, { name: "a.svg", contentType: "image/svg+xml" })).status).toBe(415);
    expect((await pedir(operador, { name: "a.pdf", contentType: "application/pdf" })).status).toBe(415);
    expect((await pedir(operador, { name: "a.png", contentType: "image/png", size: 6 * 1024 * 1024 })).status).toBe(413);
  });

  it("sube la foto una sola vez y la sirve con caché y cabeceras seguras", async () => {
    const enlace = await pedir(operador, { name: "pan.png", contentType: "image/png", size: PNG.length });
    expect(enlace.status).toBe(200);
    expect(enlace.json.objectPath).toMatch(new RegExp(`^/uploads/productos/${negocio.id}/[0-9a-f-]{36}\\.png$`));

    // El contenido debe ser de verdad una imagen del tipo declarado.
    expect((await subir(operador, enlace.json.uploadURL, HTML, "image/png")).status).toBe(415);
    expect((await subir(operador, enlace.json.uploadURL, JPG, "image/png")).status).toBe(415);
    expect((await subir(operador, enlace.json.uploadURL, new Uint8Array(), "image/png")).status).toBe(400);
    expect((await subir(operador, enlace.json.uploadURL, PNG, "image/png")).status).toBe(200);
    expect((await subir(operador, enlace.json.uploadURL, PNG, "image/png")).status).toBe(410);

    const res = await anon.raw("GET", enlace.json.objectPath);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    const sinCambios = await anon.raw("GET", enlace.json.objectPath, undefined, { "If-None-Match": res.headers.get("ETag")! });
    expect(sinCambios.status).toBe(304);
  });

  it("rechaza enlaces vencidos, archivos grandes y rutas raras", async () => {
    const enlace = await pedir(operador, { name: "x.jpg", contentType: "image/jpeg" });
    const token = enlace.json.uploadURL.split("/").pop();
    await t.db.update(subidasPendientes).set({ maxBytes: 10 }).where(eq(subidasPendientes.token, token));
    expect((await subir(operador, enlace.json.uploadURL, JPG, "image/jpeg")).status).toBe(413);
    await t.db.update(subidasPendientes).set({ maxBytes: 1000, expiraEn: new Date(Date.now() - 1000) }).where(eq(subidasPendientes.token, token));
    expect((await subir(operador, enlace.json.uploadURL, JPG, "image/jpeg")).status).toBe(410);
    expect((await anon.raw("PUT", "/api/uploads/archivo/no-existe", JPG)).status).toBe(410);
    expect((await anon.raw("GET", "/uploads/productos/1/no-existe.png")).status).toBe(404);
    expect((await anon.raw("GET", "/uploads/otra-carpeta/archivo.png")).status).toBe(404);
    expect((await anon.raw("GET", "/uploads/productos/%2e%2e/secreto.png")).status).toBe(404);
  });
});

describe("comprobantes de pago", () => {
  let ruta: string;

  it("un visitante sube su comprobante, con límite por IP", async () => {
    const enlace = await pedir(anon, { name: "comprobante.jpg", contentType: "image/jpeg", size: JPG.length });
    expect(enlace.json.objectPath).toMatch(/^\/uploads\/comprobantes\/[0-9a-f-]{36}\.jpg$/);
    ruta = enlace.json.objectPath;
    expect((await subir(anon, enlace.json.uploadURL, JPG, "image/jpeg")).status).toBe(200);
    // El personal que pide como cliente también sube a comprobantes.
    expect((await pedir(operador, { name: "c.jpg", contentType: "image/jpeg", uso: "comprobante" }, "10.6.6.6")).json.objectPath).toContain("/uploads/comprobantes/");

    for (let i = 0; i < 9; i++) expect((await pedir(anon, { name: "c.jpg", contentType: "image/jpeg" })).status).toBe(200);
    expect((await pedir(anon, { name: "c.jpg", contentType: "image/jpeg" })).status).toBe(429);
    expect((await pedir(anon, { name: "c.jpg", contentType: "image/jpeg" }, "10.7.7.7")).status).toBe(200);
  });

  it("solo lo ve el personal del negocio dueño del pedido", async () => {
    expect((await anon.raw("GET", ruta)).status).toBe(401);
    // Aún sin pedido asociado: nadie del negocio lo ve.
    expect((await operador.raw("GET", ruta)).status).toBe(403);
    await t.db.insert(pedidos).values({ colmadoId: negocio.id, clienteNombre: "C", clienteWhatsapp: "18095550000", clienteUbicacion: "Calle 1", productos: "[]", total: "10", montoPago: "10", metodoPago: "transferencia", comprobanteUrl: ruta });
    expect((await ajeno.raw("GET", ruta)).status).toBe(403);
    const res = await operador.raw("GET", ruta);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("logo del negocio", () => {
  const formulario = (bytes: Uint8Array, tipo = "image/png") => {
    const f = new FormData();
    f.append("logo", new Blob([bytes], { type: tipo }), "logo.png");
    return f;
  };

  it("lo cambia un administrador del negocio y borra el anterior", async () => {
    expect((await anon.raw("POST", `/api/colmados/${negocio.id}/logo`, formulario(PNG))).status).toBe(401);
    expect((await ajeno.raw("POST", `/api/colmados/${negocio.id}/logo`, formulario(PNG))).status).toBe(403);
    expect((await operador.raw("POST", `/api/colmados/${negocio.id}/logo`, formulario(PNG))).status).toBe(403);
    expect((await dueno.raw("POST", `/api/colmados/${negocio.id}/logo`, new FormData())).status).toBe(400);
    expect((await dueno.raw("POST", `/api/colmados/${negocio.id}/logo`, formulario(HTML))).status).toBe(415);

    const primero = await (await dueno.raw("POST", `/api/colmados/${negocio.id}/logo`, formulario(PNG))).json() as any;
    expect(primero.logo).toMatch(new RegExp(`^/uploads/logos/${negocio.id}/`));
    expect((await anon.raw("GET", primero.logo)).status).toBe(200);
    const segundo = await (await dueno.raw("POST", `/api/colmados/${negocio.id}/logo`, formulario(JPG, "image/jpeg"))).json() as any;
    expect(segundo.logo).toMatch(/\.jpg$/);
    expect((await anon.raw("GET", primero.logo)).status).toBe(404);
    const [fila] = await t.db.select().from(colmados).where(eq(colmados.id, negocio.id));
    expect(fila.logo).toBe(segundo.logo);
  });
});

describe("utilidades", () => {
  it("reconoce las imágenes por sus primeros bytes", () => {
    expect(tipoPorFirma(PNG)).toBe("image/png");
    expect(tipoPorFirma(JPG)).toBe("image/jpeg");
    expect(tipoPorFirma(new TextEncoder().encode("GIF89a......"))).toBe("image/gif");
    expect(tipoPorFirma(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(tipoPorFirma(HTML)).toBeNull();
  });

  it("la limpieza programada borra los enlaces viejos", async () => {
    await t.db.update(subidasPendientes).set({ fechaCreacion: new Date(Date.now() - 2 * 24 * 3_600_000) });
    await limpiarSubidasPendientes(t.env);
    expect(await t.db.select().from(subidasPendientes)).toHaveLength(0);
  });
});
