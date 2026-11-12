import type { Colmado, Pedido } from "@shared/schema";
import type { Env } from "../env";
import { getDb, type Db } from "../db";
import {
  addChatWebMensaje, addMensaje, buscarChatWebDelPedido, cerrarSesionConversacion, getConversacionByCliente,
  getChatWebSessionByPedidoId, getUltimoMensajeCliente, updateChatWebSession,
} from "../storage/conversaciones";
import { canalDelNegocio, enviarTextoEvolution, enviarTextoMeta } from "./whatsapp";

const HORAS_24_MS = 24 * 3_600_000;

/** Meta solo permite texto libre dentro de las 24 horas siguientes al último mensaje del cliente. */
async function dentroDeVentana24h(db: Db, colmadoId: number, to: string): Promise<boolean> {
  const conversacion = await getConversacionByCliente(db, colmadoId, to);
  if (!conversacion) return false;
  const ultimo = conversacion.ultimoMensajeCliente ?? (await getUltimoMensajeCliente(db, conversacion.id))?.fechaEnvio;
  return !!ultimo && Date.now() - ultimo.getTime() <= HORAS_24_MS;
}

/**
 * Envía un texto por el canal de WhatsApp del negocio (Evolution API o Meta
 * Cloud API). Devuelve false si no hay canal, si Meta no lo permite por la
 * ventana de 24 horas o si el envío falla; quien llama ofrece entonces el
 * enlace wa.me para enviarlo a mano.
 */
export async function enviarWhatsApp(
  env: Env, colmado: Colmado, to: string, texto: string, opciones: { omitirVentana?: boolean } = {},
): Promise<boolean> {
  // Un negocio apagado (en revisión, rechazado o inactivo) no envía nada.
  if (colmado.estado && colmado.estado !== "activo") return false;
  const canal = canalDelNegocio(env, colmado);
  if (!canal || !to) return false;
  if (canal.tipo === "evolution") return enviarTextoEvolution(canal.evolution, to, texto);
  if (!opciones.omitirVentana && !(await dentroDeVentana24h(getDb(env.DB), colmado.id, to))) return false;
  return enviarTextoMeta(canal.meta, to, texto);
}

/** El negocio tiene un canal de WhatsApp integrado y listo para enviar. */
export function whatsappDisponible(env: Env, colmado: Colmado): boolean {
  return canalDelNegocio(env, colmado) !== null;
}

export function urlPublica(env: Env, origen?: string): string {
  return (env.PUBLIC_URL || origen || "https://delywa.com").replace(/\/+$/, "");
}

export type ResultadoEnvio = {
  whatsappEnviado: boolean;
  chatWeb: boolean;
};

/**
 * Avisa al cliente por los canales disponibles: el chat web donde hizo el
 * pedido y WhatsApp. Lo enviado por WhatsApp queda en la conversación.
 */
export async function notificarCliente(
  env: Env,
  db: Db,
  colmado: Colmado,
  pedido: Pick<Pedido, "id" | "colmadoId" | "clienteWhatsapp">,
  mensaje: string,
  opciones: { whatsapp?: boolean; chatWeb?: boolean; buscarChatPorTelefono?: boolean; estadoChat?: string } = {},
): Promise<ResultadoEnvio> {
  const { whatsapp = true, chatWeb = true, buscarChatPorTelefono = false, estadoChat } = opciones;
  let chat = false;
  if (chatWeb) {
    const sesion = buscarChatPorTelefono ? await buscarChatWebDelPedido(db, pedido) : await getChatWebSessionByPedidoId(db, pedido.id);
    if (sesion) {
      await addChatWebMensaje(db, sesion.sessionId, "assistant", mensaje);
      if (estadoChat) await updateChatWebSession(db, sesion.sessionId, { estadoConversacion: estadoChat });
      chat = true;
    }
  }
  let whatsappEnviado = false;
  if (whatsapp && pedido.clienteWhatsapp) {
    whatsappEnviado = await enviarWhatsApp(env, colmado, pedido.clienteWhatsapp, mensaje);
    if (whatsappEnviado) {
      const conversacion = await getConversacionByCliente(db, colmado.id, pedido.clienteWhatsapp);
      if (conversacion) await addMensaje(db, conversacion.id, "assistant", mensaje);
    }
  }
  return { whatsappEnviado, chatWeb: chat };
}

export async function cerrarConversacionDelPedido(db: Db, pedido: Pick<Pedido, "colmadoId" | "clienteWhatsapp">): Promise<void> {
  const conversacion = await getConversacionByCliente(db, pedido.colmadoId, pedido.clienteWhatsapp);
  if (conversacion) await cerrarSesionConversacion(db, conversacion.id);
}

export function enlaceWhatsApp(numero: string, mensaje: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
