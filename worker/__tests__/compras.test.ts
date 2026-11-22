// @vitest-environment node
// Compras (cargo de mercancía): suplidores, factura a mano, inventario, costo y crédito. D1 local en memoria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, menuProductos, menuProductoSucursales, productoCostos, suplidorEquivalencias } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { workersAI } from "../bot/ia";
import { productoParecido, unidadesDe } from "../lib/leer-factura";
import { upsertConfiguracion } from "../storage/catalogos";
import { CLAVE_CUPO_FACTURAS } from "../lib/cupo-ia";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, despachador: Client;
let negocio: typeof colmados.$inferSelect, sucursal: typeof colmados.$inferSelect;
let arroz: typeof menuProductos.$inferSelect;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Compras", slug: "colmado-compras", whatsappNumero: "18094440010", direccion: "Calle 10", planId: 1 }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Compras Norte", slug: "compras-norte", whatsappNumero: "18094440011", direccion: "Calle 11", planId: 1, negocioPrincipalId: negocio.id }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "compras@delywa.test", password: "compras-clave-1", firstName: "Coco", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  await createUser(t.db, { idPrefix: "staff", email: "desp@delywa.test", password: "desp-clave-123", firstName: "Dani", role: "operador_sucursal", colmadoId: negocio.id });
  dueno = await login("compras@delywa.test", "compras-clave-1");
  despachador = await login("desp@delywa.test", "desp-clave-123");
  [arroz] = await t.db.insert(menuProductos).values({ colmadoId: negocio.id, nombre: "Arroz (libra)", precio: "45", inventario: 10 }).returning();
  await t.db.insert(productoCostos).values({ menuProductoId: arroz.id, costo: "30.0000" });
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("compras", () => {
  let suplidorId = 0;
  let compraCredito = 0;

  it("el despachador no entra; el dueño crea el suplidor sin repetirlo", async () => {
    expect((await despachador.request("GET", `/api/colmados/${negocio.id}/compras`)).status).toBe(403);
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/suplidores`, { nombre: "Distribuidora Caribe", rnc: "1-01-23456-7", telefono: "809 555 2000", diasCredito: 15 });
    expect(r.status).toBe(201);
    suplidorId = r.json.id;
    expect(r.json.rnc).toBe("101234567");
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/suplidores`, { nombre: "distribuidora caribe" })).status).toBe(409);
  });

  it("registra la factura: suma al inventario, costo promedio con ITBIS, crea el producto nuevo y avisa la ganancia baja", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/compras`, {
      suplidorId, factura: "A-1001", ncf: "b0100000123", fecha: "2026-11-20", itbis: 180, descuento: 0, formaPago: "efectivo",
      lineas: [
        // 1 saco de 20 libras a RD$800: + ITBIS repartido → costo por libra 800×1.18/20 = 47.2
        { descripcion: "ARROZ SELECTO SACO 20LB", cantidad: 1, unidadesPorPaquete: 20, costo: 800, menuProductoId: arroz.id },
        { descripcion: "PRES GDE 24/650", cantidad: 1, unidadesPorPaquete: 24, costo: 200, nuevo: { nombre: "Presidente grande", precio: 200, categoria: "Bebidas" } },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.json.compra).toMatchObject({ total: 1180, saldo: 0, ncf: "B0100000123" });
    expect(r.json.nuevos).toEqual(["Presidente grande"]);
    const [a] = await t.db.select().from(menuProductos).where(eq(menuProductos.id, arroz.id));
    expect(a.inventario).toBe(30);
    // (10 × 30 + 20 × 47.2) / 30 = 41.47 → al precio de 45 le queda 7 %: aviso.
    const [costo] = await t.db.select().from(productoCostos).where(eq(productoCostos.menuProductoId, arroz.id));
    expect(Number(costo.costo)).toBeCloseTo(41.47, 2);
    expect(r.json.avisos.join(" ")).toContain("«Arroz (libra)»: te queda 8 %");
    const [pres] = await t.db.select().from(menuProductos).where(eq(menuProductos.nombre, "Presidente grande"));
    expect(pres).toMatchObject({ inventario: 24, precio: "200.00" });
    const eqs = await t.db.select().from(suplidorEquivalencias).where(eq(suplidorEquivalencias.suplidorId, suplidorId));
    expect(eqs.map((e) => `${e.descripcion}=${e.unidadesPorPaquete}`).sort()).toEqual(["arroz selecto saco 20lb=20", "pres gde 24/650=24"]);
    const memo = await dueno.request("GET", `/api/colmados/${negocio.id}/suplidores/${suplidorId}/equivalencias`);
    expect(memo.json.equivalencias).toHaveLength(2);
  });

  it("a crédito: vence según los días del suplidor, abono inicial, pagos y no se paga de más", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/compras`, {
      suplidorId, fecha: "2026-11-21", formaPago: "credito", abonoInicial: 100,
      lineas: [{ descripcion: "ARROZ SELECTO SACO 20LB", cantidad: 2, unidadesPorPaquete: 20, costo: 800, menuProductoId: arroz.id }],
    });
    expect(r.status).toBe(201);
    compraCredito = r.json.compra.id;
    expect(r.json.compra).toMatchObject({ total: 1600, saldo: 1500, vence: "2026-12-06" });
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/compras/${compraCredito}/pagos`, { monto: 2000 })).status).toBe(409);
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/compras/${compraCredito}/pagos`, { monto: 500, metodo: "transferencia" })).json.saldo).toBe(1000);
    const sup = await dueno.request("GET", `/api/colmados/${negocio.id}/suplidores`);
    expect(sup.json.suplidores[0]).toMatchObject({ nombre: "Distribuidora Caribe", debo: 1000 });
    const res = await dueno.request("GET", `/api/colmados/${negocio.id}/compras/resumen/por-pagar`);
    expect(res.json.debo).toBe(1000);
    const det = await dueno.request("GET", `/api/colmados/${negocio.id}/compras/${compraCredito}`);
    expect(det.json.pagos.map((p: any) => p.monto)).toEqual([500, 100]);
    expect(det.json.lineas[0].producto).toBe("Arroz (libra)");
    // Con pagos al suplidor ya no se anula.
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/compras/${compraCredito}/anular`)).status).toBe(409);
    const mes = await dueno.request("GET", `/api/colmados/${negocio.id}/compras?mes=2026-11`);
    expect(mes.json).toMatchObject({ totalMes: 2780, debo: 1000 });
  });

  it("anular saca del inventario lo que entró", async () => {
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/compras`, {
      suplidorId, fecha: "2026-11-22", formaPago: "efectivo", lineas: [{ descripcion: "ARROZ", cantidad: 5, unidadesPorPaquete: 1, costo: 40, menuProductoId: arroz.id }],
    });
    const antes = (await t.db.select().from(menuProductos).where(eq(menuProductos.id, arroz.id)))[0].inventario!;
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/compras/${r.json.compra.id}/anular`)).status).toBe(200);
    const despues = (await t.db.select().from(menuProductos).where(eq(menuProductos.id, arroz.id)))[0].inventario!;
    expect(antes - despues).toBe(5);
  });

  it("en una sucursal suma a sus propias existencias, sin tocar las del principal", async () => {
    const r = await dueno.request("POST", `/api/colmados/${sucursal.id}/compras`, {
      suplidorId, fecha: "2026-11-22", formaPago: "tarjeta", lineas: [{ descripcion: "ARROZ", cantidad: 4, unidadesPorPaquete: 1, costo: 40, menuProductoId: arroz.id }],
    });
    expect(r.status).toBe(201);
    const [o] = await t.db.select().from(menuProductoSucursales).where(eq(menuProductoSucursales.sucursalId, sucursal.id));
    expect(o.inventario).toBe(4);
    const costos = await dueno.request("GET", `/api/colmados/${negocio.id}/compras/costos`);
    expect(costos.json.costos[arroz.id]).toBeGreaterThan(0);
    // El costo nunca sale en el menú público.
    const menu = await t.client().request("GET", `/api/colmados/${negocio.id}/menu`);
    expect(JSON.stringify(menu.json)).not.toContain("costo");
  });

  it("valida la factura", async () => {
    const mal = await dueno.request("POST", `/api/colmados/${negocio.id}/compras`, { suplidorId, formaPago: "efectivo", lineas: [{ descripcion: "X", cantidad: 0, costo: 5 }] });
    expect(mal.status).toBe(400);
    expect(mal.json.error).toContain("Línea 1");
    expect((await dueno.request("POST", `/api/colmados/${negocio.id}/compras`, { suplidorId: 999, formaPago: "efectivo", lineas: [{ descripcion: "X", cantidad: 1, costo: 5 }] })).json.error).toBe("Elige el suplidor.");
  });
});

describe("foto de la factura (IA simulada)", () => {
  const runOriginal = workersAI.run;
  let respuesta: any = null;
  let entrada: any = null;
  const foto = `data:image/jpeg;base64,${btoa("foto-de-prueba")}`;
  beforeAll(() => {
    workersAI.simulada = true;
    workersAI.run = async (_env, modelo, e: any) => { entrada = { modelo, e }; return { response: respuesta, usage: { prompt_tokens: 2500, completion_tokens: 900 } }; };
  });
  afterAll(() => { workersAI.run = runOriginal; workersAI.simulada = false; });

  it("adivina unidades por paquete y productos parecidos", () => {
    expect(unidadesDe("PRES GDE 24/650")).toBe(24);
    expect(unidadesDe("ACEITE CRISOL CJ 12")).toBe(12);
    expect(unidadesDe("ARROZ SACO 20LB")).toBe(20);
    expect(unidadesDe("QUESO DE FREIR")).toBeNull();
    expect(productoParecido("ARROZ SELECTO 1LB", [{ id: 1, nombre: "Arroz (libra)" }, { id: 2, nombre: "Aceite Crisol" }])).toBe(1);
    expect(productoParecido("ACEIT CRISOL 32OZ", [{ id: 1, nombre: "Arroz (libra)" }, { id: 2, nombre: "Aceite Crisol" }])).toBe(2);
    expect(productoParecido("SALAMI INDUVECA", [{ id: 1, nombre: "Arroz (libra)" }])).toBeNull();
  });

  it("lee la factura: reconoce el suplidor por RNC y lo aprendido; lo demás queda para revisar", async () => {
    respuesta = {
      esFactura: true, suplidor: { nombre: "DISTRIBUIDORA CARIBE SRL", rnc: "101-23456-7", telefono: null }, factura: "A-2002", ncf: "B0100000999", fecha: "2026-11-22",
      lineas: [
        { descripcion: "ARROZ SELECTO SACO 20LB", cantidad: 2, unidadesPorPaquete: null, costo: 800, total: 1600 },
        { descripcion: "LECHE RICA 1LT CJ 12", cantidad: 1, unidadesPorPaquete: null, costo: 900, total: 900 },
      ],
      subtotal: 2500, itbis: 0, descuento: 0, total: 2500, formaPago: "credito",
    };
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/compras/leer-factura`, { fotos: [foto] });
    expect(r.status).toBe(200);
    expect(entrada.modelo).toContain("llama-4-scout");
    expect(entrada.e.messages[1].content[1]).toMatchObject({ type: "image_url" });
    const b = r.json.borrador;
    expect(b.suplidor.id).toBeGreaterThan(0);
    expect(b).toMatchObject({ factura: "A-2002", ncf: "B0100000999", formaPago: "credito", revisar: false });
    expect(b.lineas[0]).toMatchObject({ menuProductoId: arroz.id, unidadesPorPaquete: 20, como: "aprendido" });
    expect(b.lineas[1]).toMatchObject({ menuProductoId: null, unidadesPorPaquete: 12, como: null });
    expect(r.json.fotos[0]).toMatch(new RegExp(`^/uploads/facturas/${negocio.id}/[0-9a-f-]{36}\\.jpg$`));
    // La foto queda en la compra al guardar.
    const g = await dueno.request("POST", `/api/colmados/${negocio.id}/compras`, { suplidorId: b.suplidor.id, formaPago: "efectivo", fotos: [...r.json.fotos, "/uploads/facturas/999/x.jpg"],
      lineas: [{ descripcion: b.lineas[0].descripcion, cantidad: 2, unidadesPorPaquete: 20, costo: 800, menuProductoId: arroz.id }] });
    expect(g.json.compra.fotoUrl).toBe(r.json.fotos[0]);
    // Solo el dueño o el colmadero ven la foto.
    expect((await despachador.request("GET", r.json.fotos[0])).status).toBe(403);
  });

  it("no es una factura, o se acabó el cupo de facturas: lo dice y no inventa", async () => {
    respuesta = { esFactura: false, lineas: [] };
    const r = await dueno.request("POST", `/api/colmados/${negocio.id}/compras/leer-factura`, { fotos: [foto] });
    expect(r.status).toBe(422);
    await upsertConfiguracion(t.db, CLAVE_CUPO_FACTURAS, "0");
    const sin = await dueno.request("POST", `/api/colmados/${negocio.id}/compras/leer-factura`, { fotos: [foto] });
    expect(sin.status).toBe(429);
    expect(sin.json.sinCupo).toBe(true);
    expect((await despachador.request("POST", `/api/colmados/${negocio.id}/compras/leer-factura`, { fotos: [foto] })).status).toBe(403);
  });
});
