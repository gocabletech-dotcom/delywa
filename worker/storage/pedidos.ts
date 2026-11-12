import { and, desc, eq, gte, inArray, isNull, lt, not, or, sql } from "drizzle-orm";
import { pedidos, ventas, deliveries, colmados, paradasRuta, chatWebSesiones, type Pedido, type Venta, type Delivery } from "@shared/schema";
import type { Db } from "../db";
import { mismoTelefono } from "../lib/telefono";
import { fechaLocal, inicioDiaLocal, rangoDiaLocal } from "../lib/fechas";

export type InsertPedido = typeof pedidos.$inferInsert;
export type Sustitucion = { original: string; nuevo: string; monto?: number; estado: "pendiente" | "aceptada" | "rechazada" };

export const ESTADOS_TERMINALES = ["entregado", "cancelado", "retorno", "fusionado"];
const DIA_MS = 24 * 60 * 60 * 1000;

/** Los productos se guardan como texto JSON; los pedidos viejos pueden traer texto libre. */
export function leerProductos(productos: unknown): any[] {
  if (Array.isArray(productos)) return productos;
  if (typeof productos !== "string") return [];
  try {
    const parsed = JSON.parse(productos);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- Lectura ----------

export async function getPedidoById(db: Db, id: number): Promise<Pedido | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const [row] = await db.select().from(pedidos).where(eq(pedidos.id, id));
  return row;
}

export async function getPedidosByColmado(db: Db, colmadoId: number): Promise<Pedido[]> {
  return db.select().from(pedidos).where(eq(pedidos.colmadoId, colmadoId)).orderBy(desc(pedidos.fechaCreacion), desc(pedidos.id));
}

export async function getPedidosByClienteWhatsapp(db: Db, colmadoId: number, whatsapp: string): Promise<Pedido[]> {
  return db.select().from(pedidos)
    .where(and(eq(pedidos.colmadoId, colmadoId), mismoTelefono(pedidos.clienteWhatsapp, whatsapp)))
    .orderBy(desc(pedidos.fechaCreacion), desc(pedidos.id));
}

export async function getDeliveryById(db: Db, id: number): Promise<Delivery | undefined> {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id));
  return row;
}

// ---------- Alta ----------

/** Guarda el costo de delivery vigente en el pedido para que cambios futuros no alteren su historia. */
export async function createPedido(db: Db, data: InsertPedido): Promise<Pedido> {
  const tipoEntrega = data.tipoEntrega ?? "delivery";
  let costoDeliveryAplicado = data.costoDeliveryAplicado;
  if (tipoEntrega === "pickup") costoDeliveryAplicado = "0";
  else if (costoDeliveryAplicado === undefined || costoDeliveryAplicado === null) {
    const [colmado] = await db.select({ costoDelivery: colmados.costoDelivery }).from(colmados).where(eq(colmados.id, data.colmadoId));
    costoDeliveryAplicado = num(colmado?.costoDelivery).toFixed(2);
  }
  const [row] = await db.insert(pedidos)
    .values({ ...data, tipoEntrega, costoDeliveryAplicado, costoDeliveryAplicadoFijado: true })
    .returning();
  return row;
}

// ---------- Cambios de estado ----------

/** Cambio de estado normal. Nunca toca un pedido fusionado. */
export async function updatePedidoEstado(db: Db, id: number, estado: string, motivoRetorno?: string, actorId?: string): Promise<boolean> {
  const updates: Partial<InsertPedido> = { estado };
  if (estado === "entregado") updates.fechaEntrega = new Date();
  if (estado === "en_preparacion") Object.assign(updates, { cocinaIniciadaAt: new Date(), cocinaIniciadaPor: actorId ?? null });
  if (estado === "listo") Object.assign(updates, { cocinaListaAt: new Date(), cocinaListaPor: actorId ?? null });
  if (estado === "retorno" && motivoRetorno) updates.motivoRetorno = motivoRetorno;
  const rows = await db.update(pedidos).set(updates)
    .where(and(eq(pedidos.id, id), not(eq(pedidos.estado, "fusionado"))))
    .returning({ id: pedidos.id });
  return rows.length > 0;
}

/**
 * Reclama una transición visible para el cliente (en_camino, llegando, entregado)
 * en una sola sentencia: si dos peticiones llegan a la vez, solo una obtiene true
 * y es la única que notifica al cliente.
 */
export async function claimTransicionEstado(db: Db, id: number, estado: string): Promise<boolean> {
  const rows = await db.update(pedidos)
    .set({ estado, ...(estado === "entregado" ? { fechaEntrega: new Date() } : {}) })
    .where(and(eq(pedidos.id, id), not(eq(pedidos.estado, estado)), not(eq(pedidos.estado, "fusionado"))))
    .returning({ id: pedidos.id });
  return rows.length > 0;
}

/** Confirma el pedido solo si sigue en pendiente_confirmacion (evita confirmaciones dobles). */
export async function confirmarPedido(
  db: Db,
  id: number,
  totalConfirmado: string,
  sustituciones: Sustitucion[],
  nuevoEstado: string,
  costoDeliveryAplicado: string,
): Promise<boolean> {
  const rows = await db.update(pedidos)
    .set({ totalConfirmado, total: totalConfirmado, sustituciones, estado: nuevoEstado, costoDeliveryAplicado, costoDeliveryAplicadoFijado: true })
    .where(and(eq(pedidos.id, id), eq(pedidos.estado, "pendiente_confirmacion")))
    .returning({ id: pedidos.id });
  return rows.length > 0;
}

export async function updatePedidoProductos(db: Db, id: number, productos: unknown[]): Promise<void> {
  await db.update(pedidos).set({ productos: JSON.stringify(productos) }).where(eq(pedidos.id, id));
}

export async function updateProductosYTotalConfirmado(db: Db, id: number, productos: unknown[], totalConfirmado: string): Promise<void> {
  await db.update(pedidos).set({ productos: JSON.stringify(productos), totalConfirmado }).where(eq(pedidos.id, id));
}

export async function updateMetodoPago(db: Db, id: number, metodoPago: string): Promise<void> {
  await db.update(pedidos).set({ metodoPago }).where(eq(pedidos.id, id));
}

export async function updatePedidoCoordenadas(db: Db, id: number, lat: number, lon: number): Promise<void> {
  await db.update(pedidos).set({ clienteLatitud: String(lat), clienteLongitud: String(lon) }).where(eq(pedidos.id, id));
}

/** Marca el comprobante como confirmado y libera el pedido para entrega. */
export async function confirmarPagoTransferencia(db: Db, id: number): Promise<boolean> {
  const rows = await db.update(pedidos)
    .set({ comprobanteConfirmado: true, estado: "pendiente" })
    .where(and(eq(pedidos.id, id), not(inArray(pedidos.estado, ESTADOS_TERMINALES))))
    .returning({ id: pedidos.id });
  return rows.length > 0;
}

/** Borra el pedido; las sesiones de chat que lo apuntan quedan sin pedido. */
export async function deletePedido(db: Db, id: number): Promise<void> {
  await db.batch([
    db.update(chatWebSesiones).set({ pedidoId: null }).where(eq(chatWebSesiones.pedidoId, id)),
    db.delete(pedidos).where(eq(pedidos.id, id)),
  ]);
}

// ---------- Fusionar y pickup ----------

/**
 * Une el pedido origen al destino: el destino recibe todos los productos y un
 * solo cargo de delivery; el origen queda como "fusionado". Ambas escrituras
 * van en un batch atómico y cada una vuelve a verificar el estado de los dos
 * pedidos, así que una carrera no puede dejar la fusión a medias.
 */
export async function fusionarPedidos(db: Db, destinoId: number, origenId: number, costoDelivery: number): Promise<Pedido | undefined> {
  const [destino, origen] = await Promise.all([getPedidoById(db, destinoId), getPedidoById(db, origenId)]);
  const fusionable = (p?: Pedido) => p && p.estado === "pendiente" && !p.deliveryId && p.tipoEntrega !== "pickup";
  if (!fusionable(destino) || !fusionable(origen) || !destino || !origen) return undefined;

  const combinados = [...leerProductos(destino.productos), ...leerProductos(origen.productos)];
  // Los productos con monto ya traen el total de la línea; los viejos solo traen precio unitario.
  const subtotal = combinados.reduce((s, p) => {
    const monto = num(p.monto ?? p.precio);
    const cantidad = Math.max(1, num(p.cantidad) || 1);
    return s + (p.monto != null ? monto : monto * cantidad);
  }, 0);
  const deliveryFinal = destino.costoDeliveryAplicadoFijado ? Math.max(0, num(destino.costoDeliveryAplicado)) : Math.max(0, num(costoDelivery));
  const totalFinal = (subtotal + deliveryFinal).toFixed(2);
  const montoPago = Math.max(0, num(destino.montoPago));
  const necesitaDevuelta = montoPago > Number(totalFinal);

  const elegible = (id: number) =>
    sql`exists (select 1 from pedidos p2 where p2.id = ${id} and p2.estado = 'pendiente' and p2.delivery_id is null and p2.tipo_entrega = 'delivery')`;
  const results = await db.batch([
    db.update(pedidos)
      .set({
        estado: "fusionado",
        fusionadoEnPedidoId: destinoId,
        notas: [origen.notas, `Incluido en Pedido #${destinoId}`].filter(Boolean).join(" | "),
      })
      .where(and(eq(pedidos.id, origenId), eq(pedidos.estado, "pendiente"), isNull(pedidos.deliveryId), elegible(destinoId)))
      .returning({ id: pedidos.id }),
    db.update(pedidos)
      .set({
        productos: JSON.stringify(combinados),
        total: totalFinal,
        totalConfirmado: destino.totalConfirmado !== null || origen.totalConfirmado !== null ? totalFinal : null,
        costoDeliveryAplicado: deliveryFinal.toFixed(2),
        costoDeliveryAplicadoFijado: true,
        necesitaDevuelta,
        vueltoEntregado: necesitaDevuelta ? (montoPago - Number(totalFinal)).toFixed(2) : null,
        notas: [destino.notas, `Fusionado con Pedido #${origenId}`].filter(Boolean).join(" | "),
      })
      .where(and(
        eq(pedidos.id, destinoId), eq(pedidos.estado, "pendiente"), isNull(pedidos.deliveryId),
        sql`exists (select 1 from pedidos p3 where p3.id = ${origenId} and p3.estado = 'fusionado' and p3.fusionado_en_pedido_id = ${destinoId})`,
      ))
      .returning(),
  ]);
  return (results[1] as Pedido[])[0];
}

/** Convierte un pedido delivery en pickup: quita el cargo de delivery, el repartidor y su parada de ruta. */
export async function convertirAPickup(db: Db, id: number): Promise<Pedido | undefined> {
  const pedido = await getPedidoById(db, id);
  if (!pedido || pedido.tipoEntrega === "pickup" || ESTADOS_TERMINALES.includes(pedido.estado) || pedido.cuadreId) return undefined;
  const [colmado] = await db.select({ costoDelivery: colmados.costoDelivery, direccion: colmados.direccion }).from(colmados).where(eq(colmados.id, pedido.colmadoId));
  const costoDelivery = pedido.costoDeliveryAplicadoFijado ? Math.max(0, num(pedido.costoDeliveryAplicado)) : Math.max(0, num(colmado?.costoDelivery));
  const totalNuevo = Math.max(0, num(pedido.total) - costoDelivery).toFixed(2);
  const totalConfirmadoNuevo = pedido.totalConfirmado === null ? null : Math.max(0, num(pedido.totalConfirmado) - costoDelivery).toFixed(2);
  const totalParaDevuelta = Number(totalConfirmadoNuevo ?? totalNuevo);
  const montoPago = num(pedido.montoPago);
  const necesitaDevuelta = montoPago > totalParaDevuelta;

  const convertible = sql`exists (select 1 from pedidos p2 where p2.id = ${id} and p2.tipo_entrega = 'delivery' and p2.cuadre_id is null and p2.estado not in ('entregado', 'cancelado', 'retorno', 'fusionado'))`;
  const results = await db.batch([
    db.delete(paradasRuta).where(and(eq(paradasRuta.pedidoId, id), convertible)),
    db.update(pedidos)
      .set({
        tipoEntrega: "pickup",
        costoDeliveryAplicado: "0",
        costoDeliveryAplicadoFijado: true,
        clienteUbicacion: `Recoger en ${colmado?.direccion || "el negocio"}`,
        deliveryId: null,
        estado: ["en_camino", "llegando"].includes(pedido.estado) ? "pendiente" : pedido.estado,
        total: totalNuevo,
        totalConfirmado: totalConfirmadoNuevo,
        necesitaDevuelta,
        vueltoEntregado: necesitaDevuelta ? (montoPago - totalParaDevuelta).toFixed(2) : null,
        vueltoEntregadoAlDelivery: false,
        vueltoEntregadoAt: null,
        vueltoEntregadoPor: null,
      })
      .where(and(eq(pedidos.id, id), eq(pedidos.tipoEntrega, "delivery"), isNull(pedidos.cuadreId), not(inArray(pedidos.estado, ESTADOS_TERMINALES))))
      .returning(),
  ]);
  return (results[1] as Pedido[])[0];
}

// ---------- Vueltos (cambio en efectivo) ----------

export async function updateVuelto(db: Db, id: number, monto: number, usuario?: string): Promise<void> {
  await db.update(pedidos)
    .set({ vueltoEntregado: monto.toFixed(2), ...(usuario !== undefined ? { vueltoEntregadoPor: usuario, vueltoEntregadoAt: new Date() } : {}) })
    .where(eq(pedidos.id, id));
}

export async function entregarVueltoAlDelivery(db: Db, id: number, monto: number, usuario: string): Promise<void> {
  await db.update(pedidos)
    .set({ vueltoEntregado: monto.toFixed(2), vueltoEntregadoAlDelivery: true, vueltoEntregadoAt: new Date(), vueltoEntregadoPor: usuario })
    .where(eq(pedidos.id, id));
}

export async function getVueltosLog(db: Db, colmadoId: number) {
  const rows = await db.select({ pedido: pedidos, deliveryNombre: deliveries.nombre })
    .from(pedidos)
    .leftJoin(deliveries, eq(pedidos.deliveryId, deliveries.id))
    .where(and(eq(pedidos.colmadoId, colmadoId), eq(pedidos.vueltoEntregadoAlDelivery, true)))
    .orderBy(desc(pedidos.vueltoEntregadoAt));
  return rows.map((r) => ({ ...r.pedido, deliveryNombre: r.deliveryNombre ?? "Desconocido" }));
}

// ---------- Ventas ----------

export type ResumenVentas = { totalVentas: string; pedidosEntregados: number; pedidosCancelados: number };

function resumir(lista: Pick<Pedido, "estado" | "total">[]): ResumenVentas & { pedidosPendientes: number } {
  let total = 0, entregados = 0, cancelados = 0, pendientes = 0;
  for (const p of lista) {
    if (p.estado === "entregado") { entregados++; total += num(p.total); }
    else if (p.estado === "cancelado") cancelados++;
    else if (p.estado !== "fusionado") pendientes++;
  }
  return { totalVentas: total.toFixed(2), pedidosEntregados: entregados, pedidosCancelados: cancelados, pedidosPendientes: pendientes };
}

async function pedidosEnRango(db: Db, colmadoId: number, desde: Date, hasta: Date) {
  return db.select({ estado: pedidos.estado, total: pedidos.total, fechaCreacion: pedidos.fechaCreacion })
    .from(pedidos)
    .where(and(eq(pedidos.colmadoId, colmadoId), gte(pedidos.fechaCreacion, desde), lt(pedidos.fechaCreacion, hasta)));
}

/** Ventas del día local del negocio, calculadas desde los pedidos. */
export async function calcularVentasHoy(db: Db, colmadoId: number, timezone: string) {
  const { desde, hasta } = rangoDiaLocal(timezone);
  return resumir(await pedidosEnRango(db, colmadoId, desde, hasta));
}

export async function calcularVentasPorRango(db: Db, colmadoId: number, desde: Date, hasta: Date): Promise<ResumenVentas> {
  const { pedidosPendientes: _p, ...resumen } = resumir(await pedidosEnRango(db, colmadoId, desde, hasta));
  return resumen;
}

/** Historial por día local de los últimos `dias` días, del más reciente al más viejo. */
export async function calcularHistorialVentas(db: Db, colmadoId: number, timezone: string, dias = 30) {
  const desde = inicioDiaLocal(timezone, new Date(Date.now() - dias * DIA_MS));
  const lista = await pedidosEnRango(db, colmadoId, desde, new Date(Date.now() + DIA_MS));
  const porFecha = new Map<string, typeof lista>();
  for (const p of lista) {
    const fecha = fechaLocal(timezone, p.fechaCreacion);
    porFecha.set(fecha, [...(porFecha.get(fecha) ?? []), p]);
  }
  return [...porFecha.keys()].sort((a, b) => b.localeCompare(a)).map((fecha) => {
    const { totalVentas, pedidosEntregados, pedidosCancelados } = resumir(porFecha.get(fecha)!);
    return { fecha, totalVentas, pedidosEntregados, pedidosCancelados };
  });
}

/** Registro diario en la tabla ventas (se usa para el "cuadrado" del día). */
export async function getVentaDelDia(db: Db, colmadoId: number, timezone: string, fecha = new Date()): Promise<Venta | undefined> {
  const { desde, hasta } = rangoDiaLocal(timezone, fecha);
  const [row] = await db.select().from(ventas)
    .where(and(eq(ventas.colmadoId, colmadoId), gte(ventas.fecha, desde), lt(ventas.fecha, hasta)))
    .orderBy(ventas.id).limit(1);
  return row;
}

export async function actualizarVentaDelDia(
  db: Db,
  colmadoId: number,
  timezone: string,
  cambios: { totalVentas?: number; pedidosEntregados?: number; pedidosCancelados?: number; cuadrado?: boolean },
  fecha = new Date(),
): Promise<void> {
  const actual = await getVentaDelDia(db, colmadoId, timezone, fecha);
  const data = {
    ...(cambios.totalVentas !== undefined ? { totalVentas: cambios.totalVentas.toFixed(2) } : {}),
    ...(cambios.pedidosEntregados !== undefined ? { pedidosEntregados: cambios.pedidosEntregados } : {}),
    ...(cambios.pedidosCancelados !== undefined ? { pedidosCancelados: cambios.pedidosCancelados } : {}),
    ...(cambios.cuadrado !== undefined ? { cuadrado: cambios.cuadrado } : {}),
  };
  if (actual) await db.update(ventas).set(data).where(eq(ventas.id, actual.id));
  else await db.insert(ventas).values({ colmadoId, fecha: inicioDiaLocal(timezone, fecha), ...data });
}

/** Suma un pedido entregado o cancelado al registro del día. */
export async function registrarEnVentas(db: Db, pedido: Pick<Pedido, "colmadoId" | "total">, estado: string, timezone: string): Promise<void> {
  if (estado !== "entregado" && estado !== "cancelado") return;
  const actual = await getVentaDelDia(db, pedido.colmadoId, timezone);
  await actualizarVentaDelDia(db, pedido.colmadoId, timezone, estado === "entregado"
    ? { pedidosEntregados: (actual?.pedidosEntregados ?? 0) + 1, totalVentas: num(actual?.totalVentas) + num(pedido.total) }
    : { pedidosCancelados: (actual?.pedidosCancelados ?? 0) + 1 });
}

// ---------- Recordatorio de comprobantes ----------

export async function getPedidosPendientesRecordatorio(db: Db): Promise<Pedido[]> {
  const hace5min = new Date(Date.now() - 5 * 60 * 1000);
  return db.select().from(pedidos).where(and(
    eq(pedidos.metodoPago, "transferencia"),
    eq(pedidos.estado, "esperando_comprobante"),
    or(isNull(pedidos.ultimoRecordatorioCobro), lt(pedidos.ultimoRecordatorioCobro, hace5min)),
  ));
}

export async function marcarRecordatorioEnviado(db: Db, id: number): Promise<void> {
  await db.update(pedidos).set({ ultimoRecordatorioCobro: new Date() }).where(eq(pedidos.id, id));
}

/** Pedidos del día local ya confirmados por el negocio (para el límite diario del plan). */
export async function contarConfirmadosHoy(db: Db, colmadoId: number, timezone: string, excluirId?: number): Promise<number> {
  const { desde, hasta } = rangoDiaLocal(timezone);
  const rows = await db.select({ id: pedidos.id }).from(pedidos).where(and(
    eq(pedidos.colmadoId, colmadoId),
    gte(pedidos.fechaCreacion, desde),
    lt(pedidos.fechaCreacion, hasta),
    not(inArray(pedidos.estado, ["pendiente_confirmacion", "fusionado"])),
    ...(excluirId ? [not(eq(pedidos.id, excluirId))] : []),
  ));
  return rows.length;
}
