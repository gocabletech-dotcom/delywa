import type { Pedido, User } from "@shared/schema";
import type { Db } from "../db";
import { canUserAccessColmado } from "../storage/users";

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
