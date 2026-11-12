import type { Colmado, Pedido } from "@shared/schema";
import type { Env } from "../env";
import type { Db } from "../db";
import {
  addChatWebMensaje, addMensaje, buscarChatWebDelPedido, cerrarSesionConversacion, getConversacionByCliente,
  getChatWebSessionByPedidoId, updateChatWebSession,
} from "../storage/conversaciones";

/**
 * Envío por WhatsApp (Meta Cloud API o Evolution API). Se conecta en la capa 4.
 * Mientras tanto devuelve false y el panel ofrece enviar el mensaje a mano
 * con un enlace wa.me, igual que el original cuando no había canal integrado.
 */
export async function enviarWhatsApp(_env: Env, _colmado: Colmado, _to: string, _texto: string): Promise<boolean> {
  return false;
}

/** El negocio tiene un canal de WhatsApp integrado y listo para enviar. */
export function whatsappDisponible(_env: Env, _colmado: Colmado): boolean {
  return false;
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
