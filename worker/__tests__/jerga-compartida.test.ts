// @vitest-environment node
// Pruebas con D1 local en memoria y datos inventados: nunca se toca la base real.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { colmados, diccionarioJerga, paises, plantillasJerga } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { aprenderJerga, buscarJerga, contieneExpresion, normalizar, olvidarCacheJerga } from "../lib/jerga";

let t: Awaited<ReturnType<typeof createTestApp>>;
let rd: number, ar: number;
const negocios: Array<{ id: number; tipoNegocio: string; paisId: number | null }> = [];

async function nuevoColmado(nombre: string, telefono: string, paisId: number | null) {
  const [n] = await t.db.insert(colmados).values({ nombre, slug: nombre.toLowerCase().replace(/\s/g, "-"), whatsappNumero: telefono, direccion: "A", planId: 1, paisId }).returning();
  return n;
}

beforeAll(async () => {
  t = await createTestApp();
  rd = (await t.db.select().from(paises).where(eq(paises.codigo, "DO")))[0].id;
  ar = (await t.db.select().from(paises).where(eq(paises.codigo, "AR")))[0].id;
  negocios.push(await nuevoColmado("Colmado Uno", "18090000001", rd), await nuevoColmado("Colmado Dos", "18090000002", rd),
    await nuevoColmado("Colmado Sin Pais", "18090000003", null), await nuevoColmado("Almacen BA", "541100000004", ar));
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "admin1234", firstName: "Ada", role: "platform_admin" });
}, 60_000);
afterAll(async () => { await t?.dispose(); });
beforeEach(() => olvidarCacheJerga());

describe("cómo se reconoce una expresión", () => {
  it("sin tildes ni mayúsculas, y solo palabras completas", () => {
    expect(normalizar("Dame una FRÍA  bien fría")).toBe("dame una fria bien fria");
    expect(contieneExpresion(normalizar("mándame una fría"), "fria")).toBe(true);
    expect(contieneExpresion(normalizar("quiero un pantalón"), "pan")).toBe(false);
    expect(contieneExpresion(normalizar("dame pan, por favor"), "pan")).toBe(true);
  });
});

describe("diccionario compartido por país", () => {
  it("todos los colmados del país usan la jerga de la plataforma", async () => {
    await t.db.insert(plantillasJerga).values([
      { tipoNegocio: "colmado", jerga: "una fria", productoIdentificado: "Cerveza Presidente", paisId: rd, precioSugerido: "150" },
      { tipoNegocio: "colmado", jerga: "un chin de aceite", productoIdentificado: "Aceite pequeño", paisId: null },
    ]);
    const [uno] = negocios;
    const r = await buscarJerga(t.db, uno, "Hola, mándame una fría y un chin de aceite");
    expect(r.map((x) => [x.jerga, x.productoIdentificado, x.origen])).toEqual([
      ["un chin de aceite", "Aceite pequeño", "pais"],
      ["una fria", "Cerveza Presidente", "pais"],
    ]);
    // Un colmado sin país usa el de República Dominicana; el de Argentina no ve la de RD.
    expect((await buscarJerga(t.db, negocios[2], "una fria")).length).toBe(1);
    expect((await buscarJerga(t.db, negocios[3], "una fria")).length).toBe(0);
  });

  it("lo que aprende un colmado entra al país cuando lo usa un segundo colmado", async () => {
    const [uno, dos] = negocios;
    await aprenderJerga(t.db, uno, "Un Pote", "Ron Brugal 700 ml", "650");
    // Su colmado ya la usa (con su precio); los demás todavía no.
    expect((await buscarJerga(t.db, uno, "dame un pote"))[0]).toMatchObject({ origen: "negocio", precioSugerido: "650.00" });
    expect(await buscarJerga(t.db, dos, "dame un pote")).toEqual([]);
    const enPais = () => t.db.select().from(plantillasJerga).where(and(eq(plantillasJerga.paisId, rd), eq(plantillasJerga.jerga, "un pote")));
    expect(await enPais()).toHaveLength(0);

    await aprenderJerga(t.db, dos, "un pote", "Ron Brugal 700 ml", "700");
    const [fila] = await enPais();
    expect(fila).toMatchObject({ origen: "aprendida", activo: true, colmadosAprendida: 2, productoIdentificado: "Ron Brugal 700 ml" });
    expect(fila.precioSugerido).toBeNull();
    olvidarCacheJerga();
    // Un tercer colmado del país ya la entiende, sin precio ajeno.
    const r = await buscarJerga(t.db, negocios[2], "manda un pote");
    expect(r[0]).toMatchObject({ origen: "pais", productoIdentificado: "Ron Brugal 700 ml", precioSugerido: null });
  });

  it("el mismo colmado repitiendo una palabra no la enseña al país", async () => {
    const [uno] = negocios;
    for (let i = 0; i < 3; i++) await aprenderJerga(t.db, uno, "la verde", "Cerveza Heineken");
    expect(await t.db.select().from(plantillasJerga).where(eq(plantillasJerga.jerga, "la verde"))).toHaveLength(0);
    const [propia] = await t.db.select().from(diccionarioJerga).where(and(eq(diccionarioJerga.colmadoId, uno.id), eq(diccionarioJerga.jerga, "la verde")));
    expect(propia.vecesUsado).toBe(3);
  });
});

describe("panel de plataforma", () => {
  let admin: ReturnType<typeof t.client>;
  beforeAll(async () => {
    admin = t.client();
    await admin.request("POST", "/api/auth/login", { username: "admin@delywa.test", password: "admin1234" });
  });

  it("muestra lo aprendido con su estado y solo para la plataforma", async () => {
    expect((await t.client().request("GET", "/api/admin/jerga-aprendida")).status).toBe(401);
    const r = await admin.request("GET", `/api/admin/jerga-aprendida?paisId=${rd}`);
    expect(r.json.umbral).toBe(2);
    const pote = r.json.palabras.find((p: any) => p.jerga === "un pote");
    const verde = r.json.palabras.find((p: any) => p.jerga === "la verde");
    expect(pote).toMatchObject({ colmados: 2, estado: "en_pais" });
    expect(verde).toMatchObject({ colmados: 1, estado: "pendiente", veces: 3 });
  });

  it("la plataforma agrega palabras rápido: varias a la vez, y corrige las que ya existen", async () => {
    expect((await t.client().request("POST", "/api/admin/jerga-rapida", { palabras: "x", producto: "y" })).status).toBe(401);
    expect((await admin.request("POST", "/api/admin/jerga-rapida", { palabras: "", producto: "Ajo" })).status).toBe(400);
    const r = await admin.request("POST", "/api/admin/jerga-rapida", { palabras: "Un Ajito, cabecita de ajo", producto: "Ajo", paisId: rd });
    expect(r.json).toMatchObject({ nuevas: 2, corregidas: 0 });
    const r2 = await admin.request("POST", "/api/admin/jerga-rapida", { palabras: "un ajito", producto: "Ajo en cabeza", paisId: rd });
    expect(r2.json).toMatchObject({ nuevas: 0, corregidas: 1 });
    const todas = (await admin.request("GET", "/api/admin/plantillas-jerga")).json.filter((j: any) => j.jerga.includes("ajito"));
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ productoIdentificado: "Ajo en cabeza", paisId: rd, tipoNegocio: "colmado", activo: true });
  });

  it("aprobar la mete al país; descartar la saca y no vuelve sola", async () => {
    const verde = { paisId: rd, tipoNegocio: "colmado", jerga: "la verde", productoIdentificado: "Cerveza Heineken" };
    expect((await admin.request("POST", "/api/admin/jerga-aprendida/aprobar", verde)).status).toBe(200);
    expect((await buscarJerga(t.db, negocios[1], "una la verde"))[0]).toMatchObject({ origen: "pais", productoIdentificado: "Cerveza Heineken" });

    expect((await admin.request("POST", "/api/admin/jerga-aprendida/descartar", verde)).status).toBe(200);
    olvidarCacheJerga();
    expect(await buscarJerga(t.db, negocios[1], "una la verde")).toEqual([]);
    await aprenderJerga(t.db, negocios[1], "la verde", "Cerveza Heineken");
    olvidarCacheJerga();
    expect(await buscarJerga(t.db, negocios[2], "una la verde")).toEqual([]);
  });

  it("el número de colmados se puede cambiar (1 = entra al primer uso)", async () => {
    expect((await admin.request("PUT", "/api/admin/jerga-aprendida/umbral", { umbral: 0 })).status).toBe(400);
    expect((await admin.request("PUT", "/api/admin/jerga-aprendida/umbral", { umbral: 1 })).json.umbral).toBe(1);
    await aprenderJerga(t.db, negocios[0], "un salami de los buenos", "Salami Induveca");
    olvidarCacheJerga();
    expect((await buscarJerga(t.db, negocios[1], "dame un salami de los buenos"))[0]).toMatchObject({ productoIdentificado: "Salami Induveca" });
  });
});
