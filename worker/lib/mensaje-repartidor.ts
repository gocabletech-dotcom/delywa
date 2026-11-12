import { eq } from "drizzle-orm";
import { mensajesSistema, type Colmado, type Pedido } from "@shared/schema";
import type { Db } from "../db";
import { leerProductos } from "../storage/pedidos";
import { getClienteByWhatsapp, getConversacionByCliente } from "../storage/conversaciones";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const PLANTILLA_POR_DEFECTO = `🛵 *¡Tienes un nuevo pedido #{pedido_id}!*

👤 Cliente: {cliente_nombre}
📍 Dirección: {direccion}
📦 Productos:
{productos}

💵 Total: {moneda}{total}
💰 Pago con: {moneda}{pago}
🔄 Devuelta: {moneda}{devuelta}
🏷️ *Método de pago: {metodo_pago}*`;

const ETIQUETA_PAGO: Record<string, string> = {
  efectivo: "💵 Efectivo",
  transferencia: "🏦 Transferencia",
  tarjeta: "💳 Tarjeta",
};

/**
 * Mensaje de WhatsApp que recibe el repartidor al asignarle un pedido.
 * Usa la plantilla "pedido_asignado_delivery" de los mensajes del sistema.
 */
export async function mensajeParaRepartidor(db: Db, colmado: Colmado, pedido: Pedido, simbolo: string): Promise<string> {
  const [plantilla] = await db.select().from(mensajesSistema).where(eq(mensajesSistema.clave, "pedido_asignado_delivery"));

  const lista = leerProductos(pedido.productos);
  const productos = lista.length
    ? lista.map((p: any) => {
      const nombre = p.nombre || p.name;
      if (p.monto) return `• ${nombre} (${simbolo}${p.monto})`;
      if (p.cantidad) return `• ${p.cantidad}x ${nombre}`;
      return `• ${nombre}`;
    }).join("\n")
    : typeof pedido.productos === "string" && pedido.productos.trim() ? pedido.productos : "Sin detalles";

  const total = num(pedido.totalConfirmado ?? pedido.total);
  const pago = num(pedido.montoPago) || total;
  const devuelta = pedido.vueltoEntregado !== null && pedido.vueltoEntregado !== undefined
    ? Math.max(0, num(pedido.vueltoEntregado))
    : Math.max(0, pago - total);

  // Ubicación: GPS de la conversación o del perfil del cliente; la dirección más completa.
  let mapa = "";
  let direccion = pedido.clienteUbicacion || "";
  const conversacion = await getConversacionByCliente(db, colmado.id, pedido.clienteWhatsapp);
  if (conversacion?.latitud && conversacion.longitud) {
    mapa = `\n📌 https://maps.google.com/?q=${conversacion.latitud},${conversacion.longitud}`;
  } else {
    const cliente = await getClienteByWhatsapp(db, colmado.id, pedido.clienteWhatsapp);
    if (cliente?.latitud && cliente.longitud) mapa = `\n📌 https://maps.google.com/?q=${cliente.latitud},${cliente.longitud}`;
  }
  if (conversacion?.direccionTexto && conversacion.direccionTexto.length > direccion.length) direccion = conversacion.direccionTexto;

  const valores: Record<string, string> = {
    pedido_id: String(pedido.id),
    cliente_nombre: pedido.clienteNombre || "Cliente",
    direccion: (direccion || "Por confirmar") + mapa,
    productos,
    total: String(total),
    pago: String(pago),
    devuelta: String(devuelta),
    moneda: simbolo,
    metodo_pago: ETIQUETA_PAGO[pedido.metodoPago || ""] || "⚠️ Por definir",
  };
  // El original reemplazaba solo la primera aparición de cada marcador.
  let mensaje = (plantilla?.activo !== false && plantilla?.contenido) || PLANTILLA_POR_DEFECTO;
  for (const [clave, valor] of Object.entries(valores)) mensaje = mensaje.replaceAll(`{${clave}}`, valor);

  return `${mensaje}

━━━━━━━━━━━━━━━
*Responde con:*
✅ *entregado #${pedido.id}* — Pedido entregado
❌ *cancelado #${pedido.id}* — No se pudo entregar
🔄 *retorno #${pedido.id}* — Devolver al colmado`;
}
