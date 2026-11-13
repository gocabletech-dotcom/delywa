import type { Pedido, User } from "@shared/schema";
import type { Db } from "../db";
import { canUserAccessColmado } from "../storage/users";

// Roles del negocio (el nombre guardado no cambió para no tocar los usuarios que ya existen):
//  - colmado_owner      → Dueño: todo, incluidos usuarios, sucursales y el plan.
//  - admin_pedidos      → Colmadero (encargado): casi todo lo del dueño —pedidos, repartidores, cuadres, caja,
//                         empleados y nómina, reportes y configuración—, pero no crea usuarios ni sucursales.
//  - operador_sucursal  → Despachador: atiende pedidos, chats y clientes y asigna repartidores. Sin dinero
//                         (caja, cuadres, formas de pago), sin nómina, sin configuración y sin usuarios.

/** Roles del negocio que operan pedidos (confirmar, cocina, cambios de estado). */
export const OPERADORES = ["platform_admin", "colmado_owner", "admin_pedidos", "operador_sucursal"];
/** Roles que además pueden borrar pedidos o tocar dinero de forma retroactiva. */
export const ADMINISTRADORES = ["platform_admin", "colmado_owner", "admin_pedidos"];

export async function puedeOperar(db: Db, user: User, colmadoId: number, roles = OPERADORES): Promise<boolean> {
  return roles.includes(user.role ?? "") && (await canUserAccessColmado(db, user, colmadoId));
}

/** Un usuario con rol delivery solo actúa sobre pedidos asignados a él. */
export function esRepartidorDelPedido(user: User, pedido: Pick<Pedido, "deliveryId">): boolean {
  return user.role === "delivery" && !!user.deliveryId && user.deliveryId === pedido.deliveryId;
}

export function nombreUsuario(user: User): string {
  return user.firstName || user.email || "Usuario";
}
