import { Hono } from "hono";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { fiadoCuentas, pedidos, type FiadoCuenta } from "@shared/schema";
import { moverSaldo } from "./fiado";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { requierePlan, respuestaSinFuncion, planDe } from "../lib/plan";
import { OPERADORES, nombreUsuario } from "../lib/permisos";
import { descontarInventario, estadoInventario } from "../lib/inventario";
import { rangoDiaLocal } from "../lib/fechas";
import { avisarNegocio } from "../lib/tiempo-real";
import { getColmado, getColmadoTimezone } from "../storage/colmados";
import { getMenuProductos } from "../storage/menu";
import { createPedido, registrarEnVentas } from "../storage/pedidos";

// Venta de mostrador (mejora 8): lo que se vende en el colmado, no solo los pedidos del chat.
// Queda como pedido entregado con origen «mostrador»: así sale en Ventas, Reportes y Cuadrar caja,
// descuenta inventario, y no aparece en el tablero de pedidos por despachar.

export const mostradorRoutes = new Hono<AppEnv>();
const base = "/api/colmados/:id";
for (const r of ["/mostrador", "/mostrador/*", "/inventario/*"]) {
  mostradorRoutes.use(`${base}${r}`, requireAuth, requireBusinessAccess(), async (c, next) => {
    if (!OPERADORES.includes(c.var.user.role ?? "")) return c.json({ error: "No tienes permiso para vender en esta sucursal." }, 403);
    await next();
  });
}
for (const r of ["/mostrador", "/mostrador/*"]) mostradorRoutes.use(`${base}${r}`, requierePlan("mostrador"));

export const METODOS_MOSTRADOR = ["efectivo", "tarjeta", "transferencia", "fiado"] as const;
const redondeo = (n: number) => Math.round(n * 100) / 100;

mostradorRoutes.post(`${base}/mostrador`, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const metodo = String(body.metodoPago || "");
  if (!(METODOS_MOSTRADOR as readonly string[]).includes(metodo)) return c.json({ error: "Elige cómo pagó: efectivo, tarjeta, transferencia o fiado." }, 400);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) return c.json({ error: "Agrega al menos un producto." }, 400);

  // El precio de los productos del menú es el del servidor; los sueltos llevan el que puso el cajero.
  const menu = new Map((await getMenuProductos(db, colmadoId)).map((p) => [p.id, p]));
  const lineas: Array<{ nombre: string; cantidad: number; monto: number; menuProductoId?: number }> = [];
  for (const it of body.items) {
    const cantidad = redondeo(Number(it?.cantidad));
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) return c.json({ error: "Revisa las cantidades." }, 400);
    if (it?.menuProductoId != null) {
      const p = menu.get(Number(it.menuProductoId));
      if (!p) return c.json({ error: "Un producto ya no está en el menú. Recarga la página." }, 400);
      if (estadoInventario(p) === "agotado") return c.json({ error: `«${p.nombre}» está agotado. Quítalo o ponle existencias en Productos.` }, 409);
      if (p.inventario != null && Math.ceil(cantidad - 0.0001) > p.inventario) return c.json({ error: `Solo quedan ${p.inventario} de «${p.nombre}».` }, 409);
      lineas.push({ nombre: p.nombre, cantidad, monto: Number(p.precio) || 0, menuProductoId: p.id });
    } else {
      const nombre = typeof it?.nombre === "string" ? it.nombre.trim().slice(0, 80) : "";
      const precio = redondeo(Number(it?.precio));
      if (!nombre || !Number.isFinite(precio) || precio < 0 || precio > 1_000_000) return c.json({ error: "Al producto suelto le falta el nombre o el precio." }, 400);
      lineas.push({ nombre, cantidad, monto: precio });
    }
  }
  const total = redondeo(lineas.reduce((s, l) => s + l.monto * l.cantidad, 0));
  const recibido = metodo === "efectivo" && body.recibido != null && body.recibido !== "" ? redondeo(Number(body.recibido)) : null;
  if (recibido != null && (!Number.isFinite(recibido) || recibido < total)) return c.json({ error: "Lo recibido es menos que el total." }, 400);

  // Fiado: a la cuenta del cliente, sin pasar de su límite.
  let cuenta: FiadoCuenta | undefined;
  if (metodo === "fiado") {
    const vigente = await planDe(db, colmadoId);
    if (!vigente?.funciones.includes("fiado")) return respuestaSinFuncion(c, db, vigente, "fiado");
    [cuenta] = await db.select().from(fiadoCuentas).where(and(eq(fiadoCuentas.id, Number(body.clienteId)), eq(fiadoCuentas.colmadoId, colmadoId), eq(fiadoCuentas.activo, true)));
    if (!cuenta) return c.json({ error: "Elige el cliente al que se le fía." }, 400);
    if (cuenta.limite != null && (Number(cuenta.saldo) || 0) + total > Number(cuenta.limite) + 0.001) {
      return c.json({ error: `A ${cuenta.nombre} no se le puede fiar tanto: debe RD$${Number(cuenta.saldo).toLocaleString("es-DO")} y su límite es RD$${Number(cuenta.limite).toLocaleString("es-DO")}.` }, 409);
    }
  }
  const clienteNombre = cuenta?.nombre ?? (typeof body.clienteNombre === "string" && body.clienteNombre.trim() ? body.clienteNombre.trim().slice(0, 80) : "Cliente de mostrador");
  const pedido = await createPedido(db, {
    colmadoId, clienteNombre, clienteWhatsapp: cuenta?.telefono ?? (typeof body.clienteTelefono === "string" ? body.clienteTelefono.replace(/[^\d+]/g, "").slice(0, 16) : ""),
    clienteUbicacion: "Mostrador", productos: JSON.stringify(lineas), total: total.toFixed(2), totalConfirmado: total.toFixed(2),
    tipoEntrega: "pickup", metodoPago: metodo, montoPago: (recibido ?? total).toFixed(2), necesitaDevuelta: false,
    comprobanteConfirmado: metodo === "transferencia", estado: "entregado", fechaEntrega: new Date(), origen: "mostrador",
    notas: `Venta de mostrador · ${nombreUsuario(c.var.user)}`,
  } as any);
  if (cuenta && !(await moverSaldo(db, cuenta, "cargo", total, { pedidoId: pedido.id, nota: `Venta #${pedido.id}`, usuario: nombreUsuario(c.var.user) }))) {
    await db.delete(pedidos).where(eq(pedidos.id, pedido.id));
    return c.json({ error: `A ${cuenta.nombre} no se le puede fiar tanto: pasa su límite.` }, 409);
  }
  await registrarEnVentas(db, pedido, "entregado", await getColmadoTimezone(db, colmado));
  await descontarInventario(db, colmadoId, lineas.filter((l) => l.menuProductoId).map((l) => ({ productoId: l.menuProductoId!, cantidad: l.cantidad })));
  await avisarNegocio(c.env, colmadoId, ["pedidos"]);

  // Lo que quedó bajo después de la venta, para avisarle al cajero.
  const despues = await getMenuProductos(db, colmadoId);
  const vendidos = new Set(lineas.map((l) => l.menuProductoId).filter(Boolean));
  const avisos = despues.filter((p) => vendidos.has(p.id) && estadoInventario(p) !== "ok")
    .map((p) => (estadoInventario(p) === "agotado" ? `Se agotó «${p.nombre}».` : `Quedan ${p.inventario} de «${p.nombre}».`));
  return c.json({ pedidoId: pedido.id, fiado: cuenta ? { nombre: cuenta.nombre, saldo: redondeo((Number(cuenta.saldo) || 0) + total) } : null, total, recibido, devuelta: recibido != null ? redondeo(recibido - total) : 0, lineas, avisos, fecha: pedido.fechaCreacion }, 201);
});

/** Ventas de mostrador de hoy (día local del negocio). */
mostradorRoutes.get(`${base}/mostrador/hoy`, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const { desde, hasta } = rangoDiaLocal(await getColmadoTimezone(db, colmado));
  const filas = await db.select({ id: pedidos.id, total: pedidos.total, metodoPago: pedidos.metodoPago, productos: pedidos.productos, fecha: pedidos.fechaCreacion, estado: pedidos.estado })
    .from(pedidos).where(and(eq(pedidos.colmadoId, colmadoId), eq(pedidos.origen, "mostrador"), gte(pedidos.fechaCreacion, desde), lt(pedidos.fechaCreacion, hasta)))
    .orderBy(desc(pedidos.id)).limit(200);
  const validas = filas.filter((f) => f.estado === "entregado");
  const porMetodo: Record<string, number> = {};
  for (const f of validas) porMetodo[f.metodoPago || "efectivo"] = redondeo((porMetodo[f.metodoPago || "efectivo"] ?? 0) + Number(f.total));
  return c.json({ ventas: validas.length, total: redondeo(validas.reduce((s, f) => s + Number(f.total), 0)), porMetodo, ultimas: filas.slice(0, 10) });
});

/** Productos agotados o que se están acabando en esta sucursal. */
mostradorRoutes.get(`${base}/inventario/alertas`, async (c) => {
  const db = getDb(c.env.DB);
  const productos = await getMenuProductos(db, Number(c.req.param("id")));
  const ver = (estado: string) => productos.filter((p) => estadoInventario(p) === estado)
    .map((p) => ({ id: p.id, nombre: p.nombre, inventario: p.inventario, minimo: p.inventarioMinimo }));
  return c.json({ agotados: ver("agotado"), bajos: ver("bajo") });
});
