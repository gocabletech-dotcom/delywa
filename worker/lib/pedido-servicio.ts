import { enlaceSeguimiento } from "./seguimiento";
import { eq } from "drizzle-orm";
import { whatsappConversaciones, type Colmado, type Pedido } from "@shared/schema";
import { transferenciaSinAprobar } from "./transferencia";
import { cerrarParadasDelPedido } from "../storage/deliveries";
import type { Env } from "../env";
import type { Db } from "../db";
import { needsSavedAddress, resolveDeliveryAddress } from "./deliveryAddress";
import { parseCoordinatePair, type CoordinatePair } from "./orderDistance";
import { geocodificarDireccion } from "./routeOptimizer";
import { soloDigitos } from "./telefono";
import { cerrarConversacionDelPedido, notificarCliente, urlPublica } from "./mensajeria";
import { enrichColmadoWithMoneda, getColmado, getColmadoTimezone } from "../storage/colmados";
import { getClientesByColmado } from "../storage/conversaciones";
import {
  claimTransicionEstado, getDeliveryById, getPedidoById, registrarEnVentas, updatePedidoCoordenadas, updatePedidoEstado,
} from "../storage/pedidos";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function simboloMoneda(db: Db, colmado: Colmado): Promise<string> {
  return (await enrichColmadoWithMoneda(db, colmado)).simboloMoneda || "RD$";
}

// ---------- Dirección útil del pedido ----------

type Fuente = { direccionTexto?: string | null; latitud?: string | null; longitud?: string | null };

/** Los pedidos viejos pueden traer solo un código postal; la dirección completa vive en el perfil del cliente. */
export function conDireccionUtil<T extends Pedido>(pedido: T, fuentes: { cliente?: Fuente; conversacion?: Fuente }): T {
  if (!needsSavedAddress(pedido.clienteUbicacion) && parseCoordinatePair(pedido.clienteLatitud, pedido.clienteLongitud)) return pedido;
  const d = resolveDeliveryAddress({
    pedidoUbicacion: pedido.clienteUbicacion, pedidoLatitud: pedido.clienteLatitud, pedidoLongitud: pedido.clienteLongitud,
    conversacion: fuentes.conversacion ?? null, cliente: fuentes.cliente ?? null,
  });
  return { ...pedido, clienteUbicacion: d.direccion, clienteLatitud: d.latitud, clienteLongitud: d.longitud };
}

/** Completa la dirección de varios pedidos con dos consultas por negocio, no dos por pedido. */
export async function enriquecerDirecciones<T extends Pedido>(db: Db, lista: T[]): Promise<T[]> {
  const porNegocio = new Map<number, { clientes: Map<string, Fuente>; conversaciones: Map<string, Fuente> }>();
  for (const colmadoId of new Set(lista.map((p) => p.colmadoId))) {
    const [clientes, conversaciones] = await Promise.all([
      getClientesByColmado(db, colmadoId),
      db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.colmadoId, colmadoId)),
    ]);
    porNegocio.set(colmadoId, {
      clientes: new Map(clientes.map((x) => [soloDigitos(x.whatsappNumero), x])),
      conversaciones: new Map(conversaciones.map((x) => [soloDigitos(x.clienteWhatsapp), x])),
    });
  }
  return lista.map((p) => {
    const tel = soloDigitos(p.clienteWhatsapp);
    const fuentes = porNegocio.get(p.colmadoId)!;
    return conDireccionUtil(p, { cliente: fuentes.clientes.get(tel), conversacion: fuentes.conversaciones.get(tel) });
  });
}

const geocodeFallidoHasta = new Map<number, number>();

/** Coordenadas guardadas, o geocodifica la dirección (y la guarda). Un fallo se recuerda 15 minutos. */
export async function coordenadasDelPedido(
  db: Db,
  pedido: Pick<Pedido, "id" | "clienteUbicacion" | "clienteLatitud" | "clienteLongitud">,
): Promise<CoordinatePair | null> {
  const coords = parseCoordinatePair(pedido.clienteLatitud, pedido.clienteLongitud);
  if (coords) return coords;
  const direccion = pedido.clienteUbicacion?.trim() || "";
  if (!direccion || needsSavedAddress(direccion)) return null;
  if ((geocodeFallidoHasta.get(pedido.id) ?? 0) > Date.now()) return null;
  const geo = await geocodificarDireccion(direccion);
  if (!geo) {
    geocodeFallidoHasta.set(pedido.id, Date.now() + 15 * 60 * 1000);
    return null;
  }
  await updatePedidoCoordenadas(db, pedido.id, geo.lat, geo.lon);
  return { latitud: geo.lat, longitud: geo.lon };
}

// ---------- Cambio de estado ----------

export function mensajeDeEstado(pedido: Pedido, estado: string, simbolo: string, trackingUrl: string, repartidor: string): string {
  const total = `${simbolo}${num(pedido.total).toLocaleString("es-DO")}`;
  switch (estado) {
    case "en_camino":
      return `🚴 ¡Tu pedido #${pedido.id} está en camino!${repartidor ? `\n🧑 Repartidor: *${repartidor}*` : ""}\n\nTotal: ${total}\n\n📍 Sigue tu pedido en tiempo real:\n${trackingUrl}\n\n¡Gracias por tu preferencia! 🙌`;
    case "llegando":
      return `🏠 ¡El delivery está llegando a tu puerta! Tu pedido #${pedido.id} ya casi está ahí. 🛵`;
    case "entregado":
      return pedido.tipoEntrega === "pickup"
        ? `✅ ¡Pedido #${pedido.id} entregado en el negocio!\n\n¡Gracias por pasar a recoger tu compra! Esperamos que la disfrutes. 🛒`
        : `✅ ¡Pedido #${pedido.id} entregado!\n\n¡Gracias por tu compra! Esperamos que disfrutes tu pedido. 🛒\n\n¿Tienes alguna duda? Escríbenos.`;
    case "retorno":
      return `😔 No pudimos entregar tu pedido #${pedido.id}.${pedido.motivoRetorno ? `\nMotivo: ${pedido.motivoRetorno}` : ""}\n\nEscríbenos por aquí y coordinamos otra entrega. 🙏`;
    case "cancelado":
      return `❌ Tu pedido #${pedido.id} ha sido cancelado. Pedimos disculpas por los inconvenientes. Si tienes alguna pregunta, no dudes en escribirnos. 🙏`;
    default:
      return "";
  }
}

export type ErrorEstado = { status: 400 | 409; body: { error: string; reason?: string } };

/**
 * Aplica un cambio de estado con las mismas reglas desde el panel y desde el
 * portal del repartidor: validaciones de cocina y delivery, reclamo atómico de
 * los estados que ve el cliente, ventas del día, aviso al cliente y cierre de
 * la conversación. Devuelve un error o null si se aplicó.
 */
export async function cambiarEstadoPedido(
  env: Env,
  db: Db,
  antes: Pedido,
  estado: string,
  opciones: { motivoRetorno?: string; actorId?: string; origen?: string } = {},
): Promise<ErrorEstado | null> {
  const id = antes.id;
  if (antes.estado === "fusionado") {
    return { status: 409, body: { error: `El Pedido #${id} está incluido en el Pedido #${antes.fusionadoEnPedidoId} y no se puede actualizar por separado.`, reason: "pedido_fusionado" } };
  }
  if (antes.tipoEntrega === "pickup" && ["en_camino", "llegando"].includes(estado)) {
    return { status: 400, body: { error: "Los pedidos pickup se entregan en el negocio y no pasan por delivery.", reason: "pedido_pickup" } };
  }
  if (estado === "en_preparacion" && antes.estado !== "pendiente") {
    return { status: 409, body: { error: "El pedido debe estar confirmado antes de enviarlo a cocina.", reason: "pedido_no_confirmado" } };
  }
  if (estado === "listo" && antes.estado !== "en_preparacion") {
    return { status: 409, body: { error: "Cocina debe iniciar la preparación antes de marcar el pedido como listo.", reason: "preparacion_no_iniciada" } };
  }
  if (estado === "en_camino" && antes.estado !== "listo" && antes.estado !== "en_camino") {
    return { status: 409, body: { error: "Cocina debe marcar el pedido como listo antes de iniciar la entrega.", reason: "pedido_no_listo" } };
  }
  // Un retorno es un pedido que salió con el repartidor y vuelve al negocio sin entregarse.
  if (estado === "retorno" && (!["en_camino", "llegando"].includes(antes.estado) || !antes.deliveryId)) {
    return { status: 409, body: { error: "Solo un pedido que salió con el repartidor puede marcarse como no entregado.", reason: "retorno_no_valido" } };
  }
  // Si el cliente aparece (o pide que se lo lleven) mientras el repartidor todavía tiene el
  // pedido, se puede entregar. Si ya volvió al negocio o se reenvió, se usa "Volver a enviar".
  if (antes.estado === "retorno" && estado === "entregado") {
    if (antes.reenviadoComoPedidoId != null) {
      return { status: 409, body: { error: `Este pedido ya se volvió a enviar como #${antes.reenviadoComoPedidoId}. Marca ese como entregado.`, reason: "retorno_reenviado" } };
    }
    if (antes.retornoRecibidoAt) {
      return { status: 409, body: { error: "Este pedido ya volvió al negocio. Usa «Volver a enviar» para mandarlo otra vez.", reason: "retorno_recibido" } };
    }
  }
  // Transferencia: no se entrega hasta que el colmado apruebe el comprobante.
  if (estado === "entregado" && transferenciaSinAprobar(antes)) {
    return { status: 409, body: { error: "El pago por transferencia todavía no está aprobado. El colmado debe revisar el comprobante y pulsar «Aprobar pago»; después se puede marcar entregado.", reason: "transferencia_sin_aprobar" } };
  }
  if (["en_camino", "llegando"].includes(estado) && !antes.deliveryId) {
    return { status: 400, body: { error: "Debes asignar un repartidor antes de marcar el pedido como en camino.", reason: "sin_delivery" } };
  }

  // Los estados que ve el cliente se reclaman de forma atómica: solo la primera
  // petición notifica, aunque el panel y el portal del repartidor lleguen a la vez.
  let notificar = true;
  if (["en_camino", "llegando", "entregado"].includes(estado)) {
    notificar = await claimTransicionEstado(db, id, estado);
  } else {
    const motivo = estado === "retorno" ? opciones.motivoRetorno || undefined : undefined;
    const actor = ["en_preparacion", "listo"].includes(estado) ? opciones.actorId : undefined;
    if (!(await updatePedidoEstado(db, id, estado, motivo, actor))) {
      return { status: 409, body: { error: "El pedido ya no está disponible para actualizar.", reason: "pedido_no_disponible" } };
    }
  }

  const pedido = (await getPedidoById(db, id))!;
  const colmado = await getColmado(db, pedido.colmadoId);
  if (colmado && notificar && antes.estado !== estado) {
    await registrarEnVentas(db, pedido, estado, await getColmadoTimezone(db, colmado));
  }
  if (colmado && notificar) {
    try {
      const repartidor = estado === "en_camino" && pedido.deliveryId ? (await getDeliveryById(db, pedido.deliveryId))?.nombre ?? "" : "";
      const tracking = enlaceSeguimiento(urlPublica(env, opciones.origen), pedido);
      const mensaje = mensajeDeEstado(pedido, estado, await simboloMoneda(db, colmado), tracking, repartidor);
      // "llegando" solo va al chat web.
      if (mensaje) await notificarCliente(env, db, colmado, pedido, mensaje, { whatsapp: estado !== "llegando" });
    } catch (err) {
      console.error(`[pedidos] No se pudo notificar el estado del pedido #${id}:`, err);
    }
  }
  if (["entregado", "cancelado", "retorno"].includes(estado)) await cerrarConversacionDelPedido(db, pedido);
  // La ruta del repartidor no debe seguir mostrando un pedido ya cerrado.
  if (["entregado", "cancelado", "retorno"].includes(estado)) {
    await cerrarParadasDelPedido(db, id, estado === "entregado" ? "entregado" : "no_entregado", estado === "retorno" ? opciones.motivoRetorno : null).catch(() => undefined);
  }
  return null;
}
