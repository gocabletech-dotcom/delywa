import { Hono } from "hono";
import { and, desc, eq, gt, gte, inArray, like, lt, or, sql } from "drizzle-orm";
import { compraLineas, compraPagos, compras, pedidos, productoCostos, suplidores, suplidorEquivalencias } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES, nombreUsuario } from "../lib/permisos";
import { negocioPrincipalId } from "../lib/certificacion";
import { anularCompra, claveDescripcion, CompraInvalida, FORMAS_PAGO, pagarCompra, registrarCompra, validarLineas, type FormaPago } from "../lib/compras";
import { getColmado } from "../storage/colmados";
import { getMenuProductos } from "../storage/menu";
import { permitirEvento } from "../lib/rate-limit";
import { CupoAgotado } from "../bot/ia";
import { FacturaIlegible, leerFactura, productoParecido, suplidorParecido, type Borrador } from "../lib/leer-factura";

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
      // Solo fotos de facturas de esta sucursal que subió la lectura con IA.
      fotoUrl: (Array.isArray(body.fotos) ? body.fotos : []).filter((u: unknown) => typeof u === "string" && new RegExp(`^/uploads/facturas/${colmadoId}/[0-9a-f-]{36}\\.jpg$`).test(u)).slice(0, 3).join(",") || null,
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

// ---------- Foto de la factura (fase B) ----------

/** Lee la foto (hasta 3) con la IA y devuelve el borrador para revisar. No guarda la compra. */
comprasRoutes.post("/api/colmados/:id/compras/leer-factura", async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const negocioId = await principal(c);
  const body = (await c.req.json().catch(() => null)) || {};
  const fotos = (Array.isArray(body.fotos) ? body.fotos : []).slice(0, 3).map((f: unknown) => (typeof f === "string" ? f.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/)?.[1] : null));
  if (!fotos.length || fotos.some((f: string | null) => !f)) return c.json({ error: "Manda la foto de la factura (JPEG)." }, 400);
  if (fotos.some((f: string) => f.length > 3_000_000)) return c.json({ error: "La foto es muy grande. Toma otra." }, 413);
  // 15 lecturas al día por negocio: el cupo gratis de IA es de toda la plataforma.
  if (!(await permitirEvento(db, `factura-ia:${negocioId}`, 15, 24 * 3600_000))) return c.json({ error: "Ya leíste 15 facturas hoy con la IA. Escríbela a mano o espera a mañana." }, 429);
  let leido;
  try { leido = await leerFactura(c.env, db, fotos as string[]); } catch (e) {
    if (e instanceof CupoAgotado) return c.json({ error: "Se acabó la lectura gratis de facturas de hoy. Escríbela a mano (abajo) o vuelve a intentar mañana.", sinCupo: true }, 429);
    if (e instanceof FacturaIlegible) return c.json({ error: e.message }, 422);
    throw e;
  }
  // Las fotos quedan para verlas en la compra (privadas: solo dueño y colmadero).
  const urls: string[] = [];
  if (c.env.UPLOADS) {
    for (const f of fotos as string[]) {
      const clave = `facturas/${colmadoId}/${crypto.randomUUID()}.jpg`;
      await c.env.UPLOADS.put(clave, Uint8Array.from(atob(f), (ch) => ch.charCodeAt(0)), { httpMetadata: { contentType: "image/jpeg", cacheControl: "private, no-store" } }).catch(() => undefined);
      urls.push(`/uploads/${clave}`);
    }
  }
  const lista = await db.select().from(suplidores).where(and(eq(suplidores.colmadoId, negocioId), eq(suplidores.activo, true)));
  const suplidorId = suplidorParecido(leido.suplidor, lista);
  const memoria = suplidorId ? await db.select().from(suplidorEquivalencias).where(eq(suplidorEquivalencias.suplidorId, suplidorId)) : [];
  const porClave = new Map(memoria.map((m) => [m.descripcion, m]));
  const menu = await getMenuProductos(db, colmadoId);
  const enMenu = new Set(menu.map((p) => p.id));
  const borrador: Borrador = {
    ...leido, suplidor: { ...leido.suplidor, id: suplidorId },
    lineas: leido.lineas.map((l) => {
      const m = porClave.get(claveDescripcion(l.descripcion));
      if (m && enMenu.has(m.menuProductoId)) return { ...l, menuProductoId: m.menuProductoId, unidadesPorPaquete: m.unidadesPorPaquete, como: "aprendido" as const };
      const p = productoParecido(l.descripcion, menu);
      return { ...l, menuProductoId: p, como: p ? "parecido" as const : null };
    }),
  };
  return c.json({ borrador, fotos: urls });
});

/**
 * Reporte del mes: cuánto se compró, a quién, qué productos, cuánto falta por pagar, y la ganancia
 * aproximada de lo vendido en mostrador (precio de venta − costo de cada producto).
 */
comprasRoutes.get("/api/colmados/:id/compras/reporte", async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const mes = /^\d{4}-\d{2}$/.test(c.req.query("mes") ?? "") ? c.req.query("mes")! : hoyRD().slice(0, 7);
  const delMes = await db.select({ compra: compras, suplidor: suplidores.nombre }).from(compras).innerJoin(suplidores, eq(suplidores.id, compras.suplidorId))
    .where(and(eq(compras.colmadoId, colmadoId), eq(compras.estado, "registrada"), like(compras.fecha, `${mes}-%`)));
  const porSuplidor = new Map<string, { suplidor: string; compras: number; total: number; debo: number }>();
  for (const { compra, suplidor } of delMes) {
    const x = porSuplidor.get(suplidor) ?? { suplidor, compras: 0, total: 0, debo: 0 };
    x.compras++; x.total = r2(x.total + Number(compra.total)); x.debo = r2(x.debo + Number(compra.saldo));
    porSuplidor.set(suplidor, x);
  }
  const ids = delMes.map((d) => d.compra.id);
  const lineas = ids.length ? await db.select().from(compraLineas).where(inArray(compraLineas.compraId, ids.slice(0, 500))) : [];
  const menu = await getMenuProductos(db, colmadoId);
  const nombre = new Map(menu.map((p) => [p.id, p.nombre]));
  const porProducto = new Map<string, { producto: string; unidades: number; costo: number }>();
  for (const l of lineas) {
    const k = l.menuProductoId ? nombre.get(l.menuProductoId) ?? l.descripcion : l.descripcion;
    const x = porProducto.get(k) ?? { producto: k, unidades: 0, costo: 0 };
    x.unidades += l.unidadesSumadas || l.cantidad; x.costo = r2(x.costo + Number(l.total));
    porProducto.set(k, x);
  }
  // Ganancia aproximada del mostrador en el mes (solo productos con costo).
  const costos = new Map((menu.length ? await db.select().from(productoCostos).where(inArray(productoCostos.menuProductoId, menu.map((p) => p.id))) : []).map((x) => [x.menuProductoId, Number(x.costo)]));
  const [desdeA, desdeM] = mes.split("-").map(Number);
  const desde = new Date(Date.UTC(desdeA, desdeM - 1, 1, 4)), hasta = new Date(Date.UTC(desdeA, desdeM, 1, 4));
  const ventas = await db.select({ productos: pedidos.productos }).from(pedidos)
    .where(and(eq(pedidos.colmadoId, colmadoId), eq(pedidos.origen, "mostrador"), eq(pedidos.estado, "entregado"), gte(pedidos.fechaCreacion, desde), lt(pedidos.fechaCreacion, hasta)));
  let vendido = 0, costoVendido = 0, sinCosto = 0;
  for (const v of ventas) {
    let lista: any[] = [];
    try { lista = JSON.parse(v.productos); } catch { /* */ }
    for (const l of Array.isArray(lista) ? lista : []) {
      const venta = Number(l.monto) * Number(l.cantidad);
      if (!Number.isFinite(venta)) continue;
      const costo = l.menuProductoId ? costos.get(Number(l.menuProductoId)) : undefined;
      if (costo == null) { sinCosto += venta; continue; }
      vendido += venta; costoVendido += costo * Number(l.cantidad);
    }
  }
  const total = r2(delMes.reduce((s, d) => s + Number(d.compra.total), 0));
  return c.json({
    mes, total, compras: delMes.length, itbis: r2(delMes.reduce((s, d) => s + Number(d.compra.itbis), 0)),
    aCredito: r2(delMes.filter((d) => d.compra.formaPago === "credito").reduce((s, d) => s + Number(d.compra.total), 0)),
    porPagar: r2(delMes.reduce((s, d) => s + Number(d.compra.saldo), 0)),
    porSuplidor: [...porSuplidor.values()].sort((a, b) => b.total - a.total),
    productos: [...porProducto.values()].sort((a, b) => b.costo - a.costo).slice(0, 15),
    mostrador: { vendido: r2(vendido), costo: r2(costoVendido), ganancia: r2(vendido - costoVendido), margen: vendido > 0 ? Math.round(((vendido - costoVendido) / vendido) * 100) : null, sinCosto: r2(sinCosto) },
  });
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
