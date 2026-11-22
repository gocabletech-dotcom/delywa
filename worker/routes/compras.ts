import { Hono } from "hono";
import { and, desc, eq, gt, inArray, like, or, sql } from "drizzle-orm";
import { compraLineas, compraPagos, compras, productoCostos, suplidores, suplidorEquivalencias } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES, nombreUsuario } from "../lib/permisos";
import { negocioPrincipalId } from "../lib/certificacion";
import { anularCompra, claveDescripcion, CompraInvalida, FORMAS_PAGO, pagarCompra, registrarCompra, validarLineas, type FormaPago } from "../lib/compras";
import { getColmado } from "../storage/colmados";
import { getMenuProductos } from "../storage/menu";

// Compras y suplidores (mejora «cargo de mercancía»). Solo dueño y colmadero: el despachador no ve costos.

export const comprasRoutes = new Hono<AppEnv>();
for (const r of ["/api/colmados/:id/compras", "/api/colmados/:id/compras/*", "/api/colmados/:id/suplidores", "/api/colmados/:id/suplidores/*"]) {
  comprasRoutes.use(r, requireAuth, requireBusinessAccess(), async (c, next) => {
    if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero registran compras." }, 403);
    await next();
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fechaValida = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const hoyRD = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const principal = async (c: any) => (await negocioPrincipalId(getDb(c.env.DB), Number(c.req.param("id"))))!;

// ---------- Suplidores ----------

async function listaSuplidores(db: Db, negocioId: number, sucursalId: number) {
  const filas = await db.select().from(suplidores).where(and(eq(suplidores.colmadoId, negocioId), eq(suplidores.activo, true))).orderBy(suplidores.nombre);
  const deudas = await db.select({ suplidorId: compras.suplidorId, saldo: sql<number>`sum(cast(${compras.saldo} as real))`, vencido: sql<number>`sum(case when ${compras.vence} < ${hoyRD()} then cast(${compras.saldo} as real) else 0 end)` })
    .from(compras).where(and(eq(compras.colmadoId, sucursalId), eq(compras.estado, "registrada"), gt(sql`cast(${compras.saldo} as real)`, 0))).groupBy(compras.suplidorId);
  const porId = new Map(deudas.map((d) => [d.suplidorId, d]));
  return filas.map((s) => ({ ...s, debo: r2(Number(porId.get(s.id)?.saldo ?? 0)), vencido: r2(Number(porId.get(s.id)?.vencido ?? 0)) }));
}

comprasRoutes.get("/api/colmados/:id/suplidores", async (c) => {
  const db = getDb(c.env.DB);
  return c.json({ suplidores: await listaSuplidores(db, await principal(c), Number(c.req.param("id"))) });
});

function datosSuplidor(body: any) {
  const dias = body.diasCredito === "" || body.diasCredito == null ? null : Math.round(Number(body.diasCredito));
  if (dias != null && (!Number.isFinite(dias) || dias < 0 || dias > 365)) throw new CompraInvalida("Los días de crédito van de 0 a 365.");
  const rnc = typeof body.rnc === "string" ? body.rnc.replace(/\D/g, "").slice(0, 11) || null : null;
  return { rnc, telefono: typeof body.telefono === "string" ? body.telefono.replace(/[^\d+]/g, "").slice(0, 16) || null : null, vendedor: texto(body.vendedor, 80), diasCredito: dias, notas: texto(body.notas, 300) };
}

comprasRoutes.post("/api/colmados/:id/suplidores", async (c) => {
  const db = getDb(c.env.DB);
  const negocioId = await principal(c);
  const body = (await c.req.json().catch(() => null)) || {};
  const nombre = texto(body.nombre, 100);
  if (!nombre) return c.json({ error: "Escribe el nombre del suplidor." }, 400);
  try {
    const datos = datosSuplidor(body);
    const [igual] = await db.select({ id: suplidores.id }).from(suplidores).where(and(eq(suplidores.colmadoId, negocioId), eq(suplidores.activo, true),
      datos.rnc ? or(eq(suplidores.rnc, datos.rnc), eq(sql`lower(${suplidores.nombre})`, nombre.toLowerCase())) : eq(sql`lower(${suplidores.nombre})`, nombre.toLowerCase())));
    if (igual) return c.json({ error: "Ya tienes ese suplidor.", suplidorId: igual.id }, 409);
    const [s] = await db.insert(suplidores).values({ colmadoId: negocioId, nombre, ...datos }).returning();
    return c.json(s, 201);
  } catch (e) {
    if (e instanceof CompraInvalida) return c.json({ error: e.message }, 400);
    throw e;
  }
});

comprasRoutes.patch("/api/colmados/:id/suplidores/:sid", async (c) => {
  const db = getDb(c.env.DB);
  const negocioId = await principal(c);
  const body = (await c.req.json().catch(() => null)) || {};
  const [s] = await db.select().from(suplidores).where(and(eq(suplidores.id, Number(c.req.param("sid"))), eq(suplidores.colmadoId, negocioId)));
  if (!s) return c.json({ error: "Suplidor no encontrado" }, 404);
  try {
    const set: Record<string, unknown> = { ...datosSuplidor({ ...s, ...body }) };
    if (body.nombre !== undefined) { const n = texto(body.nombre, 100); if (!n) return c.json({ error: "El nombre no puede quedar vacío." }, 400); set.nombre = n; }
    if (body.activo === false) set.activo = false;
    const [act] = await db.update(suplidores).set(set).where(eq(suplidores.id, s.id)).returning();
    return c.json(act);
  } catch (e) {
    if (e instanceof CompraInvalida) return c.json({ error: e.message }, 400);
    throw e;
  }
});

/** Lo que ya sabe de las facturas de este suplidor: descripción → producto y unidades por paquete. */
comprasRoutes.get("/api/colmados/:id/suplidores/:sid/equivalencias", async (c) => {
  const db = getDb(c.env.DB);
  const negocioId = await principal(c);
  const [s] = await db.select({ id: suplidores.id }).from(suplidores).where(and(eq(suplidores.id, Number(c.req.param("sid"))), eq(suplidores.colmadoId, negocioId)));
  if (!s) return c.json({ error: "Suplidor no encontrado" }, 404);
  const filas = await db.select().from(suplidorEquivalencias).where(eq(suplidorEquivalencias.suplidorId, s.id)).orderBy(desc(suplidorEquivalencias.veces)).limit(500);
  return c.json({ equivalencias: filas.map((f) => ({ descripcion: f.descripcion, menuProductoId: f.menuProductoId, unidadesPorPaquete: f.unidadesPorPaquete })) });
});

// ---------- Compras ----------

comprasRoutes.get("/api/colmados/:id/compras", async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const mes = /^\d{4}-\d{2}$/.test(c.req.query("mes") ?? "") ? c.req.query("mes")! : hoyRD().slice(0, 7);
  const suplidorId = Number(c.req.query("suplidor")) || null;
  const porPagar = c.req.query("porPagar") === "1";
  const filtro = porPagar
    ? and(eq(compras.colmadoId, colmadoId), eq(compras.estado, "registrada"), gt(sql`cast(${compras.saldo} as real)`, 0))
    : and(eq(compras.colmadoId, colmadoId), like(compras.fecha, `${mes}-%`));
  const filas = await db.select({ compra: compras, suplidor: suplidores.nombre }).from(compras).innerJoin(suplidores, eq(suplidores.id, compras.suplidorId))
    .where(suplidorId ? and(filtro, eq(compras.suplidorId, suplidorId)) : filtro).orderBy(desc(compras.fecha), desc(compras.id)).limit(300);
  const lista = filas.map((f) => ({ ...f.compra, suplidor: f.suplidor, total: Number(f.compra.total), saldo: Number(f.compra.saldo) }));
  const validas = lista.filter((x) => x.estado === "registrada");
  return c.json({ mes, compras: lista, totalMes: r2(validas.reduce((s, x) => s + x.total, 0)), debo: r2(validas.reduce((s, x) => s + x.saldo, 0)) });
});

comprasRoutes.post("/api/colmados/:id/compras", async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const negocioId = colmado.negocioPrincipalId || colmado.id;
  const body = (await c.req.json().catch(() => null)) || {};
  try {
    const [suplidor] = await db.select().from(suplidores).where(and(eq(suplidores.id, Number(body.suplidorId)), eq(suplidores.colmadoId, negocioId), eq(suplidores.activo, true)));
    if (!suplidor) throw new CompraInvalida("Elige el suplidor.");
    const formaPago = String(body.formaPago) as FormaPago;
    if (!FORMAS_PAGO.includes(formaPago)) throw new CompraInvalida("Elige cómo se pagó.");
    const fecha = fechaValida(body.fecha) ?? hoyRD();
    const num = (v: unknown, nombre: string) => { const n = v === "" || v == null ? 0 : Number(v); if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new CompraInvalida(`Revisa ${nombre}.`); return n; };
    let vence = fechaValida(body.vence);
    if (formaPago === "credito" && !vence) {
      const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + (suplidor.diasCredito ?? 30)); vence = d.toISOString().slice(0, 10);
    }
    const r = await registrarCompra(db, {
      colmado, suplidorId: suplidor.id, factura: texto(body.factura, 40), ncf: typeof body.ncf === "string" ? body.ncf.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 13) || null : null,
      fecha, itbis: num(body.itbis, "el ITBIS"), descuento: num(body.descuento, "el descuento"), formaPago, vence, abonoInicial: num(body.abonoInicial, "el abono"),
      notas: texto(body.notas, 300), usuario: nombreUsuario(c.var.user), lineas: validarLineas(body.lineas),
    });
    return c.json({ compra: { ...r.compra, total: Number(r.compra.total), saldo: Number(r.compra.saldo) }, avisos: r.avisos, nuevos: r.nuevos }, 201);
  } catch (e) {
    if (e instanceof CompraInvalida) return c.json({ error: e.message }, 400);
    throw e;
  }
});

async function compraDe(db: Db, colmadoId: number, id: number) {
  const [x] = await db.select().from(compras).where(and(eq(compras.id, id), eq(compras.colmadoId, colmadoId)));
  return x;
}

comprasRoutes.get("/api/colmados/:id/compras/:cid{[0-9]+}", async (c) => {
  const db = getDb(c.env.DB);
  const compra = await compraDe(db, Number(c.req.param("id")), Number(c.req.param("cid")));
  if (!compra) return c.json({ error: "Compra no encontrada" }, 404);
  const [suplidor] = await db.select().from(suplidores).where(eq(suplidores.id, compra.suplidorId));
  const lineas = await db.select().from(compraLineas).where(eq(compraLineas.compraId, compra.id)).orderBy(compraLineas.id);
  const pagos = await db.select().from(compraPagos).where(eq(compraPagos.compraId, compra.id)).orderBy(desc(compraPagos.id));
  const menu = new Map((await getMenuProductos(db, compra.colmadoId)).map((p) => [p.id, p.nombre]));
  return c.json({
    compra: { ...compra, total: Number(compra.total), saldo: Number(compra.saldo) }, suplidor,
    lineas: lineas.map((l) => ({ ...l, producto: l.menuProductoId ? menu.get(l.menuProductoId) ?? null : null, total: Number(l.total), costo: Number(l.costo) })),
    pagos: pagos.map((p) => ({ ...p, monto: Number(p.monto) })),
  });
});

comprasRoutes.post("/api/colmados/:id/compras/:cid{[0-9]+}/pagos", async (c) => {
  const db = getDb(c.env.DB);
  const compra = await compraDe(db, Number(c.req.param("id")), Number(c.req.param("cid")));
  if (!compra || compra.estado !== "registrada") return c.json({ error: "Compra no encontrada" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const monto = r2(Number(body.monto));
  if (!Number.isFinite(monto) || monto <= 0) return c.json({ error: "Escribe el monto." }, 400);
  const metodo = ["efectivo", "transferencia", "tarjeta", "cheque"].includes(body.metodo) ? body.metodo : "efectivo";
  if (!(await pagarCompra(db, compra.id, monto, metodo, texto(body.nota, 200), nombreUsuario(c.var.user)))) {
    return c.json({ error: `El pago es más de lo que se debe (RD$${Number(compra.saldo).toLocaleString("es-DO")}).` }, 409);
  }
  return c.json({ ok: true, saldo: r2(Number(compra.saldo) - monto) });
});

comprasRoutes.post("/api/colmados/:id/compras/:cid{[0-9]+}/anular", async (c) => {
  const db = getDb(c.env.DB);
  const compra = await compraDe(db, Number(c.req.param("id")), Number(c.req.param("cid")));
  if (!compra || compra.estado !== "registrada") return c.json({ error: "Compra no encontrada" }, 404);
  try { await anularCompra(db, compra); } catch (e) {
    if (e instanceof CompraInvalida) return c.json({ error: e.message }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

/** Costos de los productos (solo dueño y colmadero), para la pantalla de compras y de productos. */
comprasRoutes.get("/api/colmados/:id/compras/costos", async (c) => {
  const db = getDb(c.env.DB);
  const ids = (await getMenuProductos(db, Number(c.req.param("id")))).map((p) => p.id);
  const filas = ids.length ? await db.select().from(productoCostos).where(inArray(productoCostos.menuProductoId, ids)) : [];
  return c.json({ costos: Object.fromEntries(filas.map((f) => [f.menuProductoId, Number(f.costo)])) });
});

/** Para Inicio: lo que se le debe a los suplidores, lo vencido y lo que vence en 7 días. */
comprasRoutes.get("/api/colmados/:id/compras/resumen/por-pagar", async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const hoy = hoyRD();
  const en7 = new Date(Date.parse(`${hoy}T12:00:00Z`) + 7 * 86400_000).toISOString().slice(0, 10);
  const base = and(eq(compras.colmadoId, colmadoId), eq(compras.estado, "registrada"), gt(sql`cast(${compras.saldo} as real)`, 0));
  const [t] = await db.select({
    debo: sql<number>`coalesce(sum(cast(${compras.saldo} as real)), 0)`,
    vencido: sql<number>`coalesce(sum(case when ${compras.vence} < ${hoy} then cast(${compras.saldo} as real) else 0 end), 0)`,
    semana: sql<number>`coalesce(sum(case when ${compras.vence} >= ${hoy} and ${compras.vence} <= ${en7} then cast(${compras.saldo} as real) else 0 end), 0)`,
  }).from(compras).where(base);
  return c.json({ debo: r2(Number(t?.debo ?? 0)), vencido: r2(Number(t?.vencido ?? 0)), estaSemana: r2(Number(t?.semana ?? 0)) });
});

export { claveDescripcion };
