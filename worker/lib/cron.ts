import type { Env } from "../env";
import { getDb } from "../db";
import { getColmado } from "../storage/colmados";
import { getPedidosPendientesRecordatorio, marcarRecordatorioEnviado } from "../storage/pedidos";
import { notificarCliente } from "./mensajeria";

const RECORDATORIO = "⏰ Recuerda enviarnos el comprobante de tu transferencia para poder procesar y enviar tu pedido 📎";

/** Cada 5 minutos: recuerda a los clientes que pagan por transferencia enviar el comprobante. */
export async function enviarRecordatoriosComprobante(env: Env): Promise<void> {
  const db = getDb(env.DB);
  for (const pedido of await getPedidosPendientesRecordatorio(db)) {
    try {
      const colmado = await getColmado(db, pedido.colmadoId);
      if (!colmado) continue;
      await notificarCliente(env, db, colmado, pedido, RECORDATORIO);
      await marcarRecordatorioEnviado(db, pedido.id);
    } catch (err) {
      console.error(`[cron] Recordatorio del pedido #${pedido.id} falló:`, err);
    }
  }
}
