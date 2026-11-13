import type { Db } from "../db";
import { getMetodosPago } from "../storage/catalogos";

// Pago por transferencia: el cliente recibe las cuentas del colmado, envía la foto del comprobante,
// el colmado la revisa y la aprueba. Mientras no esté aprobada, el pedido no se puede marcar entregado.

export const PIDE_FOTO = "📸 Cuando transfieras, envíanos la *foto del comprobante* aquí mismo con el botón ➕ o 📷. El colmado la revisa y te confirma.";

/** Las cuentas del colmado para transferir, listas para el chat. Vacío si no tiene ninguna configurada. */
export async function textoCuentas(db: Db, colmadoId: number): Promise<string> {
  const metodos = await getMetodosPago(db, colmadoId);
  const bancos = (Array.isArray(metodos?.bancos) ? metodos!.bancos : []).filter((b) => b?.nombre && b?.numeroCuenta);
  if (!bancos.length) return "";
  return `🏦 *Cuentas para transferir:*\n${bancos.map((b) => `• ${b.nombre}${b.tipoCuenta ? ` (${b.tipoCuenta})` : ""}: *${b.numeroCuenta}*${b.titular ? ` — a nombre de ${b.titular}` : ""}`).join("\n")}`;
}

/** Bloque completo para el cliente: cuentas (si hay) y la petición de la foto. */
export async function instruccionesTransferencia(db: Db, colmadoId: number): Promise<string> {
  const cuentas = await textoCuentas(db, colmadoId);
  return cuentas ? `${cuentas}\n\n${PIDE_FOTO}` : `🏦 Pídele al colmado el número de cuenta por aquí.\n\n${PIDE_FOTO}`;
}

/** Pedido por transferencia cuyo pago todavía no aprobó el colmado. */
export function transferenciaSinAprobar(p: { metodoPago: string | null; comprobanteConfirmado: boolean | null }): boolean {
  return p.metodoPago === "transferencia" && !p.comprobanteConfirmado;
}
