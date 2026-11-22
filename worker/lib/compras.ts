import { and, eq, inArray, sql } from "drizzle-orm";
import {
  compraLineas, compraPagos, compras, menuProductos, menuProductoSucursales, productoCostos, suplidorEquivalencias,
  type Colmado, type Compra, type MenuProducto,
} from "@shared/schema";
import type { Db } from "../db";
import { normalizar } from "./jerga";
import { getMenuProductos } from "../storage/menu";

// Compras (cargo de mercancía): registrar una factura de un suplidor, sumar al inventario de la
// sucursal, actualizar el costo (promedio ponderado, como FoodPOS) y llevar lo que se le debe.
// El costo de cada unidad incluye el ITBIS y el descuento de la factura, repartidos por monto.

export const FORMAS_PAGO = ["efectivo", "transferencia", "tarjeta", "cheque", "credito"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
export const claveDescripcion = (t: string) => normalizar(t).replace(/[^a-z0-9ñ/.\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export type LineaEntrada = {
  descripcion: string;
  cantidad: number;
  unidadesPorPaquete: number;
  costo: number;
  /** Producto existente de la lista… */
  menuProductoId?: number | null;
  /** …o uno nuevo que se crea al guardar. */
  nuevo?: { nombre: string; precio: number; categoria?: string | null } | null;
};

export class CompraInvalida extends Error {}

/** Revisa y arma las líneas; lanza CompraInvalida con un mensaje para el colmadero. */
export function validarLineas(crudas: unknown): LineaEntrada[] {
  if (!Array.isArray(crudas) || !crudas.length) throw new CompraInvalida("Agrega al menos un producto de la factura.");
  if (crudas.length > 150) throw new CompraInvalida("Máximo 150 líneas por compra.");
  return crudas.map((l: any, i) => {
    const n = i + 1;
    const descripcion = typeof l?.descripcion === "string" ? l.descripcion.trim().slice(0, 120) : "";
    const cantidad = Number(l?.cantidad);
    const unidades = Math.round(Number(l?.unidadesPorPaquete ?? 1));
    const costo = Number(l?.costo);
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000) throw new CompraInvalida(`Línea ${n}: revisa la cantidad.`);
    if (!Number.isInteger(unidades) || unidades < 1 || unidades > 1000) throw new CompraInvalida(`Línea ${n}: las unidades por paquete van de 1 a 1000.`);
    if (!Number.isFinite(costo) || costo < 0 || costo > 10_000_000) throw new CompraInvalida(`Línea ${n}: revisa el costo.`);
    let nuevo: LineaEntrada["nuevo"] = null;
    if (l?.nuevo) {
      const nombre = typeof l.nuevo.nombre === "string" ? l.nuevo.nombre.trim().slice(0, 120) : "";
      const precio = Number(l.nuevo.precio);
      if (!nombre) throw new CompraInvalida(`Línea ${n}: ponle nombre al producto nuevo.`);
      if (!Number.isFinite(precio) || precio < 0) throw new CompraInvalida(`Línea ${n}: ponle precio de venta al producto nuevo.`);
      nuevo = { nombre, precio, categoria: typeof l.nuevo.categoria === "string" ? l.nuevo.categoria.trim().slice(0, 60) || null : null };
    }
    const menuProductoId = l?.menuProductoId != null && l.menuProductoId !== "" ? Number(l.menuProductoId) : null;
    return { descripcion: descripcion || nuevo?.nombre || "", cantidad, unidadesPorPaquete: unidades, costo, menuProductoId: nuevo ? null : menuProductoId, nuevo };
  }).map((l, i) => { if (!l.descripcion) throw new CompraInvalida(`Línea ${i + 1}: escribe qué dice la factura.`); return l; });
}

/** Existencias que ve la sucursal y de dónde salen (su propio registro o el del producto). */
function existencias(p: MenuProducto) { return p.inventario ?? 0; }

/**
 * Suma unidades al inventario de la sucursal. Producto heredado del principal: la sucursal pasa a
 * llevar sus propias existencias. Sin control de existencias: empieza a contarlas.
 */
async function sumarInventario(db: Db, sucursalId: number, producto: MenuProducto, unidades: number) {
  if (producto.colmadoId !== sucursalId) {
    const [o] = await db.select().from(menuProductoSucursales).where(and(eq(menuProductoSucursales.menuProductoId, producto.id), eq(menuProductoSucursales.sucursalId, sucursalId)));
    if (o) await db.update(menuProductoSucursales).set({ inventario: sql`coalesce(${menuProductoSucursales.inventario}, 0) + ${unidades}`, fechaModificacion: new Date() }).where(eq(menuProductoSucursales.id, o.id));
    else await db.insert(menuProductoSucursales).values({ menuProductoId: producto.id, sucursalId, inventario: unidades });
    return;
  }
  await db.update(menuProductos).set({ inventario: sql`coalesce(${menuProductos.inventario}, 0) + ${unidades}` }).where(eq(menuProductos.id, producto.id));
}

/** Costo promedio ponderado: (existencias × costo anterior + compradas × costo nuevo) / total. */
async function actualizarCosto(db: Db, productoId: number, existenciasAntes: number, unidades: number, costoUnidad: number) {
  const [antes] = await db.select().from(productoCostos).where(eq(productoCostos.menuProductoId, productoId));
  const previo = antes ? Number(antes.costo) : null;
  const base = Math.max(0, existenciasAntes);
  const nuevo = previo == null || base === 0 ? costoUnidad : (base * previo + unidades * costoUnidad) / (base + unidades);
  await db.insert(productoCostos).values({ menuProductoId: productoId, costo: r4(nuevo).toFixed(4) })
    .onConflictDoUpdate({ target: productoCostos.menuProductoId, set: { costo: r4(nuevo).toFixed(4), actualizado: new Date() } });
  return { antes: previo, ahora: r4(nuevo) };
}

export type DatosCompra = {
  colmado: Pick<Colmado, "id" | "negocioPrincipalId">;
  suplidorId: number;
  factura?: string | null; ncf?: string | null; fecha: string;
  itbis: number; descuento: number;
  formaPago: FormaPago; vence?: string | null; abonoInicial?: number;
  notas?: string | null; fotoUrl?: string | null; usuario: string;
  lineas: LineaEntrada[];
};

export async function registrarCompra(db: Db, d: DatosCompra) {
  const sucursalId = d.colmado.id;
  const menu = new Map((await getMenuProductos(db, sucursalId)).map((p) => [p.id, p]));
  for (const l of d.lineas) if (l.menuProductoId != null && !menu.has(l.menuProductoId)) throw new CompraInvalida(`«${l.descripcion}»: ese producto no está en tu lista. Recarga la página.`);

  const subtotal = r2(d.lineas.reduce((s, l) => s + l.cantidad * l.costo, 0));
  const total = r2(subtotal + d.itbis - d.descuento);
  if (total < 0) throw new CompraInvalida("El descuento no puede ser mayor que la factura.");
  // ITBIS y descuento se reparten en el costo de cada unidad según lo que pesa cada línea.
  const factor = subtotal > 0 ? total / subtotal : 1;
  const credito = d.formaPago === "credito";
  const abono = credito ? Math.min(Math.max(0, d.abonoInicial ?? 0), total) : 0;
  const saldo = credito ? r2(total - abono) : 0;

  const [compra] = await db.insert(compras).values({
    colmadoId: sucursalId, suplidorId: d.suplidorId, factura: d.factura || null, ncf: d.ncf || null, fecha: d.fecha,
    subtotal: subtotal.toFixed(2), itbis: r2(d.itbis).toFixed(2), descuento: r2(d.descuento).toFixed(2), total: total.toFixed(2),
    formaPago: d.formaPago, vence: credito ? d.vence || null : null, saldo: saldo.toFixed(2), notas: d.notas || null, fotoUrl: d.fotoUrl || null, usuario: d.usuario,
  }).returning();
  if (abono > 0) await db.insert(compraPagos).values({ compraId: compra.id, monto: abono.toFixed(2), metodo: "efectivo", nota: "Abono al recibir la mercancía", usuario: d.usuario });

  const avisos: string[] = [];
  const nuevos: string[] = [];
  for (const l of d.lineas) {
    let producto = l.menuProductoId != null ? menu.get(l.menuProductoId)! : undefined;
    if (!producto && l.nuevo) {
      [producto] = await db.insert(menuProductos).values({ colmadoId: sucursalId, nombre: l.nuevo.nombre, precio: l.nuevo.precio.toFixed(2), categoria: l.nuevo.categoria || "General", disponible: true, inventario: 0 }).returning();
      menu.set(producto.id, producto);
      nuevos.push(producto.nombre);
    }
    const unidades = producto ? Math.round(l.cantidad * l.unidadesPorPaquete) : 0;
    const costoUnitario = r4((l.costo * factor) / l.unidadesPorPaquete);
    await db.insert(compraLineas).values({
      compraId: compra.id, descripcion: l.descripcion, menuProductoId: producto?.id ?? null, cantidad: l.cantidad, unidadesPorPaquete: l.unidadesPorPaquete,
      costo: r2(l.costo).toFixed(2), total: r2(l.cantidad * l.costo).toFixed(2), unidadesSumadas: unidades, costoUnitario: costoUnitario.toFixed(4),
    });
    if (!producto) continue;
    const antes = existencias(producto);
    if (unidades > 0) {
      await sumarInventario(db, sucursalId, producto, unidades);
      menu.set(producto.id, { ...producto, inventario: antes + unidades });
    }
    const costo = await actualizarCosto(db, producto.id, antes, unidades, costoUnitario);
    // Aviso de ganancia baja: el precio no se cambia solo.
    const precio = Number(producto.precio) || 0;
    if (precio > 0 && costo.ahora > 0) {
      const margen = (precio - costo.ahora) / precio;
      if (margen < 0.1) avisos.push(margen < 0
        ? `«${producto.nombre}»: cuesta RD$${costo.ahora.toFixed(2)} y lo vendes a RD$${precio.toFixed(2)}: estás perdiendo.`
        : `«${producto.nombre}»: te queda ${Math.round(margen * 100)} % de ganancia (cuesta RD$${costo.ahora.toFixed(2)}, lo vendes a RD$${precio.toFixed(2)}).`);
    }
    // Memoria de este suplidor: esta descripción es este producto (para la próxima factura).
    await db.insert(suplidorEquivalencias).values({ suplidorId: d.suplidorId, descripcion: claveDescripcion(l.descripcion), menuProductoId: producto.id, unidadesPorPaquete: l.unidadesPorPaquete })
      .onConflictDoUpdate({
        target: [suplidorEquivalencias.suplidorId, suplidorEquivalencias.descripcion],
        set: { menuProductoId: producto.id, unidadesPorPaquete: l.unidadesPorPaquete, veces: sql`${suplidorEquivalencias.veces} + 1` },
      });
  }
  return { compra, avisos, nuevos };
}

/** Anular: saca del inventario lo que entró (sin bajar de 0). No se puede si ya tiene pagos al suplidor. */
export async function anularCompra(db: Db, compra: Compra) {
  const pagos = await db.select({ id: compraPagos.id }).from(compraPagos).where(eq(compraPagos.compraId, compra.id)).limit(1);
  if (compra.formaPago === "credito" && pagos.length) throw new CompraInvalida("Esta compra ya tiene pagos al suplidor. No se puede anular.");
  const lineas = await db.select().from(compraLineas).where(eq(compraLineas.compraId, compra.id));
  const ids = lineas.map((l) => l.menuProductoId).filter((x): x is number => x != null);
  const productos = ids.length ? await db.select().from(menuProductos).where(inArray(menuProductos.id, ids)) : [];
  for (const l of lineas) {
    const p = productos.find((x) => x.id === l.menuProductoId);
    if (!p || !l.unidadesSumadas) continue;
    if (p.colmadoId !== compra.colmadoId) {
      await db.update(menuProductoSucursales).set({ inventario: sql`max(coalesce(${menuProductoSucursales.inventario}, 0) - ${l.unidadesSumadas}, 0)` })
        .where(and(eq(menuProductoSucursales.menuProductoId, p.id), eq(menuProductoSucursales.sucursalId, compra.colmadoId)));
    } else {
      await db.update(menuProductos).set({ inventario: sql`max(coalesce(${menuProductos.inventario}, 0) - ${l.unidadesSumadas}, 0)` }).where(eq(menuProductos.id, p.id));
    }
  }
  await db.update(compras).set({ estado: "anulada", saldo: "0" }).where(eq(compras.id, compra.id));
}

/** Pago a un suplidor de una compra a crédito; el saldo se revisa dentro del UPDATE. */
export async function pagarCompra(db: Db, compraId: number, monto: number, metodo: string, nota: string | null, usuario: string) {
  const ok = await db.update(compras).set({ saldo: sql`round(cast(${compras.saldo} as real) - ${monto}, 2)` })
    .where(and(eq(compras.id, compraId), eq(compras.estado, "registrada"), sql`cast(${compras.saldo} as real) - ${monto} >= -0.001`))
    .returning({ id: compras.id });
  if (!ok.length) return false;
  await db.insert(compraPagos).values({ compraId, monto: r2(monto).toFixed(2), metodo, nota, usuario });
  return true;
}
