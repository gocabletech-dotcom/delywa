import { and, eq, isNotNull, sql } from "drizzle-orm";
import { menuProductos, menuProductoSucursales, type MenuProducto } from "@shared/schema";
import type { Db } from "../db";
import { normalizar } from "./jerga";
import { singular } from "../bot/productos";

// Inventario sencillo (mejora 9): cada producto puede llevar existencias y un mínimo para avisar.
//  - Agotado: marcado como no disponible, o con existencias en 0.
//  - Se está acabando: existencias en el mínimo o por debajo.
// Las ventas de mostrador descuentan existencias; los pedidos del chat no (sus nombres son libres).

export type EstadoInventario = "agotado" | "bajo" | "ok";

export function estadoInventario(p: Pick<MenuProducto, "disponible" | "inventario" | "inventarioMinimo">): EstadoInventario {
  if (!p.disponible || (p.inventario != null && p.inventario <= 0)) return "agotado";
  if (p.inventario != null && p.inventarioMinimo != null && p.inventario <= p.inventarioMinimo) return "bajo";
  return "ok";
}

const clave = (t: string) => normalizar(t).replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter(Boolean).map(singular).join(" ");

/**
 * ¿Lo que pidió el cliente es un producto agotado del menú? Solo si el nombre es el mismo (con o sin
 * plural) o lo contiene entero: «3 presidente grande» con «Presidente grande» agotado. «Pan» no cuenta
 * como «Pan de agua»: mejor que el colmado lo confirme a decirle que no hay.
 */
export function productoAgotado(nombre: string, agotados: Array<Pick<MenuProducto, "nombre">>): string | null {
  const k = ` ${clave(nombre)} `;
  for (const a of agotados) {
    const ka = clave(a.nombre);
    if (ka && (k.trim() === ka || k.includes(` ${ka} `))) return a.nombre;
  }
  return null;
}

/** Descuenta existencias de lo vendido (nunca por debajo de 0). Solo productos con existencias. */
export async function descontarInventario(db: Db, sucursalId: number, vendidos: Array<{ productoId: number; cantidad: number }>) {
  for (const v of vendidos) {
    const n = Math.max(1, Math.ceil(v.cantidad - 0.0001));
    // Primero la existencia propia de la sucursal; si no la tiene, la del producto.
    const enSucursal = await db.update(menuProductoSucursales)
      .set({ inventario: sql`max(${menuProductoSucursales.inventario} - ${n}, 0)`, fechaModificacion: new Date() })
      .where(and(eq(menuProductoSucursales.menuProductoId, v.productoId), eq(menuProductoSucursales.sucursalId, sucursalId), isNotNull(menuProductoSucursales.inventario)))
      .returning({ id: menuProductoSucursales.id });
    if (enSucursal.length) continue;
    await db.update(menuProductos)
      .set({ inventario: sql`max(${menuProductos.inventario} - ${n}, 0)` })
      .where(and(eq(menuProductos.id, v.productoId), isNotNull(menuProductos.inventario)));
  }
}

/**
 * Compras, fase C: precio del catálogo para lo que pidió el cliente (al confirmar el pedido en el panel).
 * El bot nunca dice precios; aquí el colmadero ve el sugerido en amarillo y lo verifica.
 * Coincide si el nombre es el del producto (con o sin plural, sin «(libras)» ni «(RD$10)»), o si la
 * jerga del colmado lleva a ese producto.
 */
export function precioSugerido(nombre: string, menu: Array<Pick<MenuProducto, "id" | "nombre" | "precio">>, jerga: Map<string, string>): { menuProductoId: number; nombre: string; precio: number } | null {
  const base = nombre.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  const k = clave(base);
  if (!k) return null;
  const porClave = new Map(menu.map((p) => [clave(p.nombre.replace(/\s*\([^)]*\)\s*$/g, "")), p]));
  const directo = porClave.get(k) ?? menu.find((p) => clave(p.nombre) === k);
  const delaJerga = !directo ? jerga.get(normalizar(base)) : undefined;
  const p = directo ?? (delaJerga ? porClave.get(clave(delaJerga)) ?? menu.find((x) => clave(x.nombre) === clave(delaJerga)) : undefined);
  const precio = p ? Number(p.precio) : 0;
  return p && precio > 0 ? { menuProductoId: p.id, nombre: p.nombre, precio } : null;
}
