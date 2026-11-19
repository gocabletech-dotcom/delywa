import { eq } from "drizzle-orm";
import { pedidos, subidasPendientes, whatsappMensajes } from "@shared/schema";
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

/**
 * Borra de R2 las fotos de comprobante que nunca se pegaron a un pedido y tienen más de 7 días
 * (el cliente subió la foto y no terminó, o un robot subió archivos). Autorizado por el dueño el 2026-11-16.
 * Nunca toca un comprobante que algún pedido referencia, ni fotos de productos o logos.
 */
export const COMPROBANTES_HUERFANOS = { dias: 7, porVuelta: 300 };
export async function borrarComprobantesHuerfanos(env: Env, ahora = Date.now()): Promise<number> {
  const db = getDb(env.DB);
  const limite = ahora - COMPROBANTES_HUERFANOS.dias * 24 * 60 * 60 * 1000;
  const lista = await env.UPLOADS.list({ prefix: "comprobantes/", limit: COMPROBANTES_HUERFANOS.porVuelta });
  const viejos = lista.objects.filter((o) => o.uploaded.getTime() < limite);
  let borrados = 0;
  for (const o of viejos) {
    const url = `/uploads/${o.key}`;
    const [enUso] = await db.select({ id: pedidos.id }).from(pedidos).where(eq(pedidos.comprobanteUrl, url)).limit(1);
    if (enUso) continue;
    const [pendiente] = await db.select({ clave: subidasPendientes.clave }).from(subidasPendientes).where(eq(subidasPendientes.clave, o.key)).limit(1);
    if (pendiente) continue;
    await env.UPLOADS.delete(o.key);
    borrados++;
  }
  if (borrados) console.log(`[cron] Comprobantes sin pedido borrados: ${borrados}`);
  return borrados;
}

/** Las notas de voz del chat se guardan 90 días; después se borran y el mensaje queda solo con el texto. */
export const AUDIOS = { dias: 90, porVuelta: 200 };
export async function borrarAudiosViejos(env: Env, ahora = Date.now()): Promise<number> {
  const db = getDb(env.DB);
  const limite = ahora - AUDIOS.dias * 24 * 60 * 60 * 1000;
  const lista = await env.UPLOADS.list({ prefix: "audios/", limit: AUDIOS.porVuelta });
  const viejos = lista.objects.filter((o) => o.uploaded.getTime() < limite);
  for (const o of viejos) {
    await env.UPLOADS.delete(o.key);
    await db.update(whatsappMensajes).set({ audioUrl: null }).where(eq(whatsappMensajes.audioUrl, `/uploads/${o.key}`));
  }
  if (viejos.length) console.log(`[cron] Notas de voz viejas borradas: ${viejos.length}`);
  return viejos.length;
}
