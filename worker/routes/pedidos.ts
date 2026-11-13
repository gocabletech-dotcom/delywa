import { Hono } from "hono";
import { z } from "zod";
import { emojiDe } from "../bot/productos";
import { instruccionesTransferencia } from "../lib/transferencia";
import type { Colmado, Pedido } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES, esRepartidorDelPedido, nombreUsuario, puedeOperar } from "../lib/permisos";
import { cerrarConversacionDelPedido, escapeHtml, notificarCliente, urlPublica, whatsappDisponible } from "../lib/mensajeria";
import { needsSavedAddress } from "../lib/deliveryAddress";
import { cambiarEstadoPedido, conDireccionUtil, coordenadasDelPedido } from "../lib/pedido-servicio";
import { calcularMetricasDistanciaPedido, parseCoordinatePair, type CoordinatePair } from "../lib/orderDistance";
import { calcularEtaSencilla, extraerCoordenadas, geocodificarDireccion } from "../lib/routeOptimizer";
import { soloDigitos } from "../lib/telefono";
import { inicioDiaLocal } from "../lib/fechas";
import { enrichColmadoWithMoneda, getColmado, getColmadoTimezone } from "../storage/colmados";
import { getAccessibleColmadoIds } from "../storage/users";
import { getPlan } from "../storage/catalogos";
import { getClientesByColmado, getConversacionByCliente, getOrCreateConversacion, addMensaje } from "../storage/conversaciones";
import {
  contarConfirmadosHoy, claimTransicionEstado, confirmarPagoTransferencia, confirmarPedido, convertirAPickup, deletePedido,
  entregarVueltoAlDelivery, fusionarPedidos, getDeliveryById, getPedidoById, getPedidosByColmado, getPedidosEntre, getPedidosRecientes, getVueltosLog, leerProductos,
  marcarRetornoRecibido, registrarEnVentas, reenviarRetorno, updateMetodoPago, updatePedidoCoordenadas, updatePedidoEstado, updatePedidoProductos,
  updateProductosYTotalConfirmado, updateVuelto, ESTADOS_TERMINALES, type Sustitucion,
} from "../storage/pedidos";
import { pedidos, whatsappConversaciones } from "@shared/schema";
import { avisarNegocio } from "../lib/tiempo-real";
import { eq } from "drizzle-orm";

export const pedidoRoutes = new Hono<AppEnv>();

const ESTADOS_VALIDOS = ["pendiente_confirmacion", "esperando_pago", "pendiente", "en_preparacion", "listo", "en_camino", "llegando", "entregado", "cancelado", "retorno"];
const ESTADOS_REPARTIDOR = ["en_camino", "llegando", "entregado", "retorno"];
const METODOS_PAGO = ["efectivo", "transferencia", "tarjeta"];
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function moneda(db: Db, colmado: Colmado): Promise<string> {
  return (await enrichColmadoWithMoneda(db, colmado)).simboloMoneda || "RD$";
}

async function cargarPedidoOperable(db: Db, user: AppEnv["Variables"]["user"], id: number, roles?: string[]) {
  const pedido = await getPedidoById(db, id);
  if (!pedido) return { error: { status: 404 as const, body: { error: "Pedido no encontrado" } } };
  if (!(await puedeOperar(db, user, pedido.colmadoId, roles))) {
    return { error: { status: 403 as const, body: { error: "No tienes permiso para operar esta sucursal" } } };
  }
  return { pedido };
}

// ---------- Dirección y distancia de cada pedido ----------

pedidoRoutes.get("/api/colmados/:id/pedidos", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  // ?recientes=1 → ayer, hoy y todo lo que sigue abierto. ?mes=AAAA-MM → ese mes (hora del negocio). Sin nada → todos.
  const mes = c.req.query("mes");
  const recientes = c.req.query("recientes") === "1";
  if (mes !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return c.json({ error: "Mes inválido" }, 400);
  const colmadoPrevio = mes || recientes ? await getColmado(db, colmadoId) : undefined;
  const zona = colmadoPrevio ? await getColmadoTimezone(db, colmadoPrevio) : "UTC";
  const pedir = () => {
    if (mes) {
      const [anio, numero] = mes.split("-").map(Number);
      // El mediodía UTC del día 1 cae en el día 1 en cualquier zona horaria de América.
      const desde = inicioDiaLocal(zona, new Date(Date.UTC(anio, numero - 1, 1, 12)));
      const hasta = inicioDiaLocal(zona, new Date(Date.UTC(anio, numero, 1, 12)));
      return getPedidosEntre(db, colmadoId, desde, hasta);
    }
    if (recientes) return getPedidosRecientes(db, colmadoId, new Date(inicioDiaLocal(zona).getTime() - 24 * 3600_000));
    return getPedidosByColmado(db, colmadoId);
  };
  const [lista, colmado, clientes, conversaciones] = await Promise.all([
    pedir(),
    colmadoPrevio ? Promise.resolve(colmadoPrevio) : getColmado(db, colmadoId),
    getClientesByColmado(db, colmadoId),
    db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.colmadoId, colmadoId)),
  ]);
  const raiz = colmado ? colmado.negocioPrincipalId || colmado.id : colmadoId;
  const accesibles = await Promise.all((await getAccessibleColmadoIds(db, c.var.user)).map((id) => getColmado(db, id)));
  const sucursales = accesibles.filter((s): s is Colmado => !!s && (s.negocioPrincipalId || s.id) === raiz);
  const clientePorTel = new Map(clientes.map((x) => [soloDigitos(x.whatsappNumero), x]));
  const convPorTel = new Map(conversaciones.map((x) => [soloDigitos(x.clienteWhatsapp), x]));

  // Como mucho se geocodifica una dirección por carga para no frenar el panel.
  let geocodeIntentado = false;
  const resultado = [];
  for (const pedido of lista) {
    const tel = soloDigitos(pedido.clienteWhatsapp);
    const enriquecido = conDireccionUtil(pedido, { cliente: clientePorTel.get(tel), conversacion: convPorTel.get(tel) });
    const intentar = !geocodeIntentado && enriquecido.tipoEntrega !== "pickup" && !parseCoordinatePair(enriquecido.clienteLatitud, enriquecido.clienteLongitud);
    const geocodificable = intentar && !!enriquecido.clienteUbicacion?.trim() && !needsSavedAddress(enriquecido.clienteUbicacion);
    // La búsqueda de la dirección en el mapa (hasta 5 s) corre después de responder: la lista no espera por ella
    // y las coordenadas aparecen en la siguiente carga.
    let destino = parseCoordinatePair(enriquecido.clienteLatitud, enriquecido.clienteLongitud);
    if (intentar) {
      geocodeIntentado = true;
      const busqueda = coordenadasDelPedido(db, enriquecido).catch(() => null);
      let enSegundoPlano = false;
      try { c.executionCtx.waitUntil(busqueda); enSegundoPlano = true; } catch { /* pruebas: sin executionCtx */ }
      if (!enSegundoPlano) destino = await busqueda;
    }
    const metricasDistancia = calcularMetricasDistanciaPedido({ tipoEntrega: enriquecido.tipoEntrega, sucursalOrigenId: enriquecido.colmadoId, destino, sucursales });
    if (geocodificable && !destino) metricasDistancia.estado = "no_se_pudo_calcular";
    resultado.push({ ...enriquecido, metricasDistancia });
  }
  return c.json(resultado);
});

pedidoRoutes.get("/api/colmados/:id/cocina/pedidos", requireAuth, requireBusinessAccess(), async (c) => {
  const lista = await getPedidosByColmado(getDb(c.env.DB), Number(c.req.param("id")));
  return c.json(lista.filter((p) => ["pendiente", "en_preparacion", "listo"].includes(p.estado)));
});

// ---------- Cambio de estado ----------

pedidoRoutes.patch("/api/pedidos/:id/estado", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const { estado, motivoRetorno } = body;
  if (!estado || !ESTADOS_VALIDOS.includes(estado)) {
    return c.json({ error: `Estado inválido. Valores permitidos: ${ESTADOS_VALIDOS.join(", ")}` }, 400);
  }
  const antes = await getPedidoById(db, id);
  if (!antes) return c.json({ error: "Pedido no encontrado" }, 404);
  const user = c.var.user;
  const autorizado = (await puedeOperar(db, user, antes.colmadoId)) ||
    (ESTADOS_REPARTIDOR.includes(estado) && esRepartidorDelPedido(user, antes));
  if (!autorizado) return c.json({ error: "No tienes permiso para operar esta sucursal" }, 403);

  const error = await cambiarEstadoPedido(c.env, db, antes, estado, {
    motivoRetorno, actorId: user.id, origen: new URL(c.req.url).origin,
  });
  if (error) return c.json(error.body, error.status);
  return c.json({ success: true });
});

// ---------- Retorno: el pedido no se entregó y vuelve al negocio ----------

pedidoRoutes.post("/api/pedidos/:id/recibir-retorno", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if ("error" in r) return c.json(r.error!.body, r.error!.status);
  if (r.pedido.estado !== "retorno") return c.json({ error: "Este pedido no está volviendo al negocio." }, 409);
  if (r.pedido.retornoRecibidoAt) return c.json({ error: "Este retorno ya se recibió." }, 409);
  if (!(await marcarRetornoRecibido(db, r.pedido.id, nombreUsuario(c.var.user)))) {
    return c.json({ error: "Este retorno ya se recibió." }, 409);
  }
  await avisarNegocio(c.env, r.pedido.colmadoId, ["pedidos"]);
  return c.json({ success: true });
});

pedidoRoutes.post("/api/pedidos/:id/reenviar", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if ("error" in r) return c.json(r.error!.body, r.error!.status);
  const original = r.pedido;
  if (original.estado !== "retorno") return c.json({ error: "Solo se puede volver a enviar un pedido que no se entregó." }, 409);
  if (!original.retornoRecibidoAt) return c.json({ error: "Primero confirma que recibiste los productos de vuelta." }, 409);
  if (original.reenviadoComoPedidoId) return c.json({ error: `Este pedido ya se volvió a enviar como #${original.reenviadoComoPedidoId}.` }, 409);
  const colmado = await getColmado(db, original.colmadoId);
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "El negocio no está activo." }, 409);
  const nuevo = await reenviarRetorno(db, original);
  if (!nuevo) return c.json({ error: "Este pedido ya se volvió a enviar." }, 409);
  try {
    await notificarCliente(c.env, db, colmado, nuevo,
      `🔁 Vamos a enviarte tu pedido otra vez. Ahora es el pedido #${nuevo.id} (antes #${original.id}). Te avisamos cuando salga. 🛵`,
      { buscarChatPorTelefono: true });
  } catch (err) {
    console.error(`[pedidos] No se pudo avisar el reenvío del pedido #${original.id}:`, err);
  }
  await avisarNegocio(c.env, original.colmadoId, ["pedidos", "conversaciones"]);
  return c.json({ success: true, pedidoId: nuevo.id });
});

// ---------- Borrar y fusionar ----------

pedidoRoutes.delete("/api/pedidos/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")), ADMINISTRADORES);
  if (r.error) return c.json(r.error.body, r.error.status);
  await deletePedido(db, r.pedido.id);
  return c.json({ success: true });
});

pedidoRoutes.post("/api/pedidos/:id/fusionar/:otroId", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const destinoId = Number(c.req.param("id"));
  const origenId = Number(c.req.param("otroId"));
  if (destinoId === origenId) return c.json({ error: "Elige dos pedidos distintos" }, 400);
  const [a, b] = await Promise.all([getPedidoById(db, destinoId), getPedidoById(db, origenId)]);
  if (!a || !b) return c.json({ error: "Pedido no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, a.colmadoId))) return c.json({ error: "Sin permiso" }, 403);
  if (a.colmadoId !== b.colmadoId) return c.json({ error: "Los pedidos pertenecen a distintos negocios" }, 400);

  const [clientes, conversaciones] = await Promise.all([
    getClientesByColmado(db, a.colmadoId),
    db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.colmadoId, a.colmadoId)),
  ]);
  const fuentes = (p: Pedido) => ({
    cliente: clientes.find((x) => soloDigitos(x.whatsappNumero) === soloDigitos(p.clienteWhatsapp)),
    conversacion: conversaciones.find((x) => soloDigitos(x.clienteWhatsapp) === soloDigitos(p.clienteWhatsapp)),
  });
  const pa = conDireccionUtil(a, fuentes(a));
  const pb = conDireccionUtil(b, fuentes(b));
  const dir = (d?: string | null) => String(d || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (soloDigitos(pa.clienteWhatsapp) !== soloDigitos(pb.clienteWhatsapp)) return c.json({ error: "Solo se pueden fusionar pedidos del mismo cliente" }, 400);
  if (dir(pa.clienteUbicacion) !== dir(pb.clienteUbicacion)) return c.json({ error: "Solo se pueden fusionar pedidos para la misma dirección" }, 400);
  if (pa.tipoEntrega === "pickup" || pb.tipoEntrega === "pickup") return c.json({ error: "Solo se pueden fusionar pedidos delivery." }, 400);
  if (pa.estado !== "pendiente" || pb.estado !== "pendiente") return c.json({ error: "Ambos pedidos deben estar en estado pendiente" }, 400);
  if (pa.deliveryId || pb.deliveryId) return c.json({ error: "No se puede fusionar pedidos ya asignados a delivery" }, 400);

  const colmado = await getColmado(db, a.colmadoId);
  const costo = a.costoDeliveryAplicadoFijado ? Math.max(0, num(a.costoDeliveryAplicado)) : Math.max(0, num(colmado?.costoDelivery));
  const pedido = await fusionarPedidos(db, destinoId, origenId, costo);
  if (!pedido) return c.json({ error: "Uno de los pedidos cambió mientras se fusionaba. Intenta de nuevo." }, 409);
  return c.json({ success: true, pedido });
});

// ---------- Vuelto (cambio en efectivo) ----------

pedidoRoutes.patch("/api/colmados/:id/pedidos/:pedidoId/vuelto", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const monto = Number(body.monto);
  if (body.monto === undefined || body.monto === null || body.monto === "" || !Number.isFinite(monto) || monto < 0) {
    return c.json({ error: "Monto de vuelto debe ser un número no negativo" }, 400);
  }
  if (!(await puedeOperar(db, c.var.user, colmadoId))) return c.json({ error: "No tienes permiso para modificar este pedido" }, 403);
  const pedido = await getPedidoById(db, Number(c.req.param("pedidoId")));
  if (!pedido || pedido.colmadoId !== colmadoId) return c.json({ error: "Pedido no encontrado" }, 404);
  if (pedido.metodoPago !== "efectivo") return c.json({ error: "Solo se puede registrar vuelto en pedidos de efectivo" }, 400);
  if (!["pendiente_confirmacion", "esperando_pago", "pendiente", "en_camino"].includes(pedido.estado)) {
    return c.json({ error: "No se puede editar el vuelto de un pedido entregado, cancelado o en retorno" }, 400);
  }
  if (pedido.cuadreId !== null) return c.json({ error: "No se puede editar el vuelto de un pedido ya incluido en un cuadre" }, 400);
  await updateVuelto(db, pedido.id, monto, pedido.vueltoEntregadoAlDelivery ? nombreUsuario(c.var.user) : undefined);
  return c.json({ success: true });
});

pedidoRoutes.post("/api/colmados/:id/pedidos/:pedidoId/entregar-vuelto-delivery", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  if (!(await puedeOperar(db, c.var.user, colmadoId))) return c.json({ error: "No tienes permiso para modificar este pedido" }, 403);
  const pedido = await getPedidoById(db, Number(c.req.param("pedidoId")));
  if (!pedido || pedido.colmadoId !== colmadoId) return c.json({ error: "Pedido no encontrado" }, 404);
  if (pedido.metodoPago !== "efectivo") return c.json({ error: "Solo aplica a pedidos de efectivo" }, 400);
  if (pedido.cuadreId !== null) return c.json({ error: "El pedido ya está incluido en un cuadre" }, 400);
  const activos = ["pendiente_confirmacion", "esperando_pago", "esperando_confirmacion_sustituciones", "esperando_comprobante", "esperando_confirmacion_pago", "pendiente", "en_camino"];
  if (!activos.includes(pedido.estado)) return c.json({ error: "No se puede registrar vuelto en este estado del pedido" }, 400);

  const body = (await c.req.json().catch(() => null)) || {};
  let monto: number;
  if (body.monto !== undefined && body.monto !== null && body.monto !== "") {
    monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto < 0) return c.json({ error: "Monto inválido" }, 400);
  } else {
    monto = Math.max(0, num(pedido.montoPago) - num(pedido.totalConfirmado ?? pedido.total));
  }
  await entregarVueltoAlDelivery(db, pedido.id, monto, nombreUsuario(c.var.user));
  return c.json({ success: true, monto });
});

pedidoRoutes.get("/api/colmados/:id/vueltos-log", requireAuth, requireBusinessAccess(), async (c) => {
  const log = await getVueltosLog(getDb(c.env.DB), Number(c.req.param("id")));
  return c.json(log.map((p) => ({
    pedidoId: p.id, clienteNombre: p.clienteNombre, deliveryNombre: p.deliveryNombre,
    monto: p.vueltoEntregado ?? "0", entregadoPor: p.vueltoEntregadoPor ?? "", entregadoAt: p.vueltoEntregadoAt ?? null,
  })));
});

// ---------- Confirmación del negocio ----------

function lineasProductos(productos: any[], simbolo: string): string {
  return productos.map((p) => {
    const nombre = p.nombre || p.name;
    const cantidad = parseInt(p.cantidad) || 1;
    const monto = num(p.monto);
    return `${emojiDe(String(nombre ?? ""))} ${cantidad > 1 ? `${cantidad}x ` : ""}${nombre}${monto > 0 ? ` (${simbolo}${monto})` : ""}`;
  }).join("\n");
}

function recomendacionPlan(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes("trial") || n.includes("prueba")) return "Te recomendamos el plan Básico para continuar operando sin límites.";
  if (n.includes("básico") || n.includes("basico")) return "Te recomendamos el plan Profesional para más pedidos diarios.";
  return "Contacta a soporte para aumentar tu límite de pedidos.";
}

/**
 * El negocio confirma el total y, si hace falta, propone sustituciones.
 * Con sustituciones, se le pregunta al cliente por la primera; sin ellas, el
 * pedido queda listo para asignar repartidor.
 */
pedidoRoutes.post("/api/pedidos/:id/confirmar", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => null)) || {};
  const { totalConfirmado, sustituciones, productosAdicionales, productosActualizados } = body;
  const total = Number(totalConfirmado);
  if (totalConfirmado === undefined || totalConfirmado === null || totalConfirmado === "" || !Number.isFinite(total) || total < 0) {
    return c.json({ error: "Total confirmado es requerido" }, 400);
  }
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  const pedido = r.pedido;
  if (pedido.estado !== "pendiente_confirmacion") return c.json({ error: "Este pedido ya fue confirmado" }, 400);
  const colmado = await getColmado(db, pedido.colmadoId);
  if (!colmado) return c.json({ error: "Colmado no encontrado" }, 404);
  const simbolo = await moneda(db, colmado);

  const plan = await getPlan(db, colmado.planId);
  if (plan?.limitePedidosDiarios) {
    const confirmadosHoy = await contarConfirmadosHoy(db, colmado.id, await getColmadoTimezone(db, colmado), pedido.id);
    if (confirmadosHoy >= plan.limitePedidosDiarios) {
      return c.json({
        error: `Has alcanzado el límite de ${plan.limitePedidosDiarios} pedidos diarios de tu plan "${plan.nombre}". ${recomendacionPlan(plan.nombre)}`,
        limitExceeded: true, planNombre: plan.nombre, limite: plan.limitePedidosDiarios, actual: confirmadosHoy,
      }, 403);
    }
  }

  const productos = Array.isArray(productosActualizados) && productosActualizados.length ? productosActualizados : leerProductos(pedido.productos);
  const sustitucionesConEstado: Sustitucion[] = (Array.isArray(sustituciones) ? sustituciones : [])
    .filter((s: any) => s && typeof s.original === "string" && typeof s.nuevo === "string")
    .map((s: any) => {
      const original = productos.find((p: any) => String(p.nombre || p.name || "").toLowerCase() === s.original.toLowerCase());
      return { original: s.original, nuevo: s.nuevo, monto: num(original?.monto ?? original?.precio), estado: "pendiente" as const };
    });
  const adicionales = Array.isArray(productosAdicionales)
    ? productosAdicionales.filter((p: any) => p?.nombre).map((p: any) => ({ nombre: p.nombre, monto: num(p.monto), cantidad: 1, textoOriginal: p.nombre, encontradoEnMenu: false }))
    : [];
  const productosFinales = [...productos, ...adicionales];

  // El total que envía el panel ya incluye el delivery; no se suma otra vez.
  const costoDelivery = pedido.tipoEntrega === "pickup"
    ? 0
    : pedido.costoDeliveryAplicadoFijado ? Math.max(0, num(pedido.costoDeliveryAplicado)) : Math.max(0, num(colmado.costoDelivery));
  const subtotal = Math.max(0, total - costoDelivery);
  const haySustituciones = sustitucionesConEstado.length > 0;
  const nuevoEstado = haySustituciones ? "esperando_confirmacion_sustituciones" : "pendiente";

  if (!(await confirmarPedido(db, pedido.id, total.toFixed(2), sustitucionesConEstado, nuevoEstado, costoDelivery.toFixed(2)))) {
    return c.json({ error: "Este pedido ya fue confirmado" }, 409);
  }
  if ((Array.isArray(productosActualizados) && productosActualizados.length) || adicionales.length) {
    await updatePedidoProductos(db, pedido.id, productosFinales);
  }

  let mensaje: string;
  if (haySustituciones) {
    const s = sustitucionesConEstado[0];
    mensaje = `📋 *Pedido #${pedido.id} - Confirmación de cambio*\n\nNo tenemos *${s.original}* disponible.\n\n🔄 Te ofrecemos: *${s.nuevo}*\n\n¿Aceptas este cambio?\n👍 Responde *SÍ* para aceptar\n👎 Responde *NO* para remover este producto del pedido`;
  } else {
    const metodo = pedido.metodoPago || "";
    const montoPago = num(pedido.montoPago);
    const devuelta = metodo === "efectivo" ? Math.max(0, montoPago - total) : 0;
    mensaje = `✅ *¡Pedido #${pedido.id} Confirmado!*\n\n📝 *Tu pedido:*\n${lineasProductos(productosFinales, simbolo)}\n\n💰 Subtotal: ${simbolo}${subtotal}\n`;
    mensaje += pedido.tipoEntrega === "pickup" ? `🏪 Modalidad: Recoger en el negocio\n` : `🛵 Delivery: ${simbolo}${costoDelivery}\n`;
    mensaje += `━━━━━━━━━━━━━━━\n*💵 Total: ${simbolo}${total}*\n\n`;
    if (metodo) {
      mensaje += `*Pago:* ${metodo === "efectivo" ? "💵 Efectivo" : metodo === "transferencia" ? "🏦 Transferencia" : "💳 Tarjeta"}\n`;
      if (metodo === "efectivo" && devuelta > 0) mensaje += `💵 Pagas con: ${simbolo}${montoPago}\n🔄 *Devuelta: ${simbolo}${devuelta}*\n`;
      if (metodo === "transferencia" && !pedido.comprobanteConfirmado) mensaje += `\n${await instruccionesTransferencia(db, colmado.id)}\n`;
    }
    mensaje += `\n⏱️ *Tiempo estimado: ${colmado.tiempoEstimado || "20-30 min"}*\n`;
    mensaje += pedido.tipoEntrega === "pickup"
      ? `\n🏪 Te avisaremos cuando tu pedido esté listo para recoger en ${colmado.nombre}.`
      : `\n¡Gracias por tu compra! Tu pedido está siendo asignado a delivery 🛵`;
  }

  const tieneWhatsApp = whatsappDisponible(c.env, colmado);
  const envio = await notificarCliente(c.env, db, colmado, pedido, mensaje, {
    whatsapp: tieneWhatsApp,
    buscarChatPorTelefono: true,
    estadoChat: haySustituciones ? "esperando_confirmacion_sustitucion" : "finalizado",
  });

  // Sin chat web y sin WhatsApp enviado: el panel abre wa.me con este mensaje.
  if (!envio.chatWeb && !envio.whatsappEnviado) {
    return c.json({
      success: true,
      estado: nuevoEstado,
      total: total.toFixed(2),
      message: haySustituciones
        ? "Pedido confirmado con sustituciones. Envía la pregunta al cliente por WhatsApp."
        : "Pedido confirmado. Envía la confirmación al cliente por WhatsApp.",
      necesitaEnvioManual: true,
      motivoEnvioManual: tieneWhatsApp ? "El canal integrado no pudo enviar el mensaje." : "No hay un canal integrado disponible.",
      whatsappNumero: pedido.clienteWhatsapp,
      mensajeParaEnviar: mensaje,
    });
  }
  return c.json({
    success: true,
    estado: nuevoEstado,
    total: total.toFixed(2),
    message: haySustituciones ? "Pregunta de sustitución enviada al cliente" : "Confirmación enviada al cliente",
    necesitaEnvioManual: false,
    envioWhatsApp: envio.whatsappEnviado,
    canalEnvio: envio.whatsappEnviado ? "integrado" : "chat_web",
  });
});

// ---------- Pickup, pagos y método de pago ----------

pedidoRoutes.patch("/api/pedidos/:id/cambiar-a-pickup", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json({ error: "Sin permiso" }, r.error.status);
  const pedido = r.pedido;
  if (pedido.tipoEntrega === "pickup") return c.json({ error: "Este pedido ya está marcado para recoger.", reason: "ya_pickup" }, 409);
  if (pedido.cuadreId || ESTADOS_TERMINALES.includes(pedido.estado)) {
    return c.json({ error: "Este pedido ya no se puede cambiar a pickup.", reason: "estado_no_convertible" }, 409);
  }
  const actualizado = await convertirAPickup(db, pedido.id);
  if (!actualizado) return c.json({ error: "El pedido cambió mientras se actualizaba. Intenta de nuevo.", reason: "pedido_no_disponible" }, 409);
  const colmado = await getColmado(db, actualizado.colmadoId);
  if (colmado) {
    const simbolo = await moneda(db, colmado);
    const mensaje = `🏪 Tu pedido #${actualizado.id} ahora será *para recoger en el negocio*.\n\nEl cargo de delivery fue eliminado. Nuevo total: *${simbolo}${num(actualizado.totalConfirmado ?? actualizado.total).toLocaleString("es-DO")}*.\n\nTe avisaremos cuando esté listo.`;
    await notificarCliente(c.env, db, colmado, actualizado, mensaje, { chatWeb: true });
  }
  return c.json(actualizado);
});

pedidoRoutes.patch("/api/pedidos/:id/confirmar-pago", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  const pedido = r.pedido;
  const colmado = await getColmado(db, pedido.colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  if (!(await confirmarPagoTransferencia(db, pedido.id))) return c.json({ error: "Este pedido ya no está pendiente de pago" }, 409);
  const simbolo = await moneda(db, colmado);
  const productos = leerProductos(pedido.productos);
  const lista = productos.length
    ? productos.map((p: any) => (p.monto ? `• ${p.nombre || p.name} (${simbolo}${p.monto})` : p.cantidad ? `• ${p.cantidad}x ${p.nombre || p.name}` : `• ${p.nombre || p.name}`)).join("\n")
    : String(pedido.productos);
  const mensaje = `✅ *¡Recibimos tu pago!*\n\n📝 *Tu pedido #${pedido.id}:*\n${lista}\n\n💰 *Total: ${simbolo}${num(pedido.totalConfirmado || pedido.total)}*\n🏦 Pago: Transferencia aprobada ✅\n\n¡Gracias! Te avisamos cuando vaya en camino 🛵`;
  await notificarCliente(c.env, db, colmado, pedido, mensaje, { estadoChat: "finalizado" });
  await avisarNegocio(c.env, pedido.colmadoId, ["pedidos"]);
  return c.json({ success: true, message: "Pago aprobado: el pedido ya se puede entregar" });
});

const revisarProductosSchema = z.object({
  productos: z.array(z.object({
    nombre: z.string().min(1),
    cantidad: z.coerce.number().int().min(1).default(1),
    monto: z.coerce.number().nonnegative().optional(),
    precio: z.coerce.number().nonnegative().optional(),
  })).min(1),
  totalConfirmado: z.union([z.string(), z.number()]).optional(),
});

pedidoRoutes.patch("/api/pedidos/:id/revisar-productos", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const parsed = revisarProductosSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Datos inválidos", details: parsed.error.flatten() }, 400);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  // Se puede corregir mientras el pedido no haya salido: revisando el pago, o ya confirmado y todavía en el negocio.
  const EDITABLES = ["esperando_confirmacion_pago", "esperando_pago", "pendiente", "en_preparacion", "listo"];
  if (!EDITABLES.includes(r.pedido.estado)) {
    return c.json({ error: "Este pedido ya no se puede editar porque salió del negocio o está cerrado." }, 400);
  }
  const { productos, totalConfirmado } = parsed.data;
  const calculado = productos.reduce((s, p) => s + num(p.monto ?? p.precio) * p.cantidad, 0);
  const nuevoTotal = totalConfirmado !== undefined && totalConfirmado !== "" ? Number(totalConfirmado) : calculado;
  if (!Number.isFinite(nuevoTotal) || nuevoTotal < 0) return c.json({ error: "El total no puede ser negativo" }, 400);
  await updateProductosYTotalConfirmado(db, r.pedido.id, productos, nuevoTotal.toFixed(2));
  // Un pedido ya confirmado muestra y cobra `total`: se corrige también.
  if (r.pedido.estado !== "esperando_confirmacion_pago") {
    await db.update(pedidos).set({ total: nuevoTotal.toFixed(2) }).where(eq(pedidos.id, r.pedido.id));
    await avisarNegocio(c.env, r.pedido.colmadoId, ["pedidos"]);
  }
  return c.json({ success: true, totalConfirmado: nuevoTotal.toFixed(2) });
});

pedidoRoutes.post("/api/pedidos/:id/avisar-comprobante", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  const pedido = r.pedido;
  const colmado = await getColmado(db, pedido.colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const simbolo = await moneda(db, colmado);
  const nombre = pedido.clienteNombre || "cliente";
  const existente = pedido.clienteWhatsapp ? await getConversacionByCliente(db, pedido.colmadoId, pedido.clienteWhatsapp) : undefined;

  const cuentas = await instruccionesTransferencia(db, colmado.id);
  let mensaje: string;
  if (existente) {
    mensaje = `👋 Hola ${nombre}! Para tu pedido *#${pedido.id}* (${simbolo}${num(pedido.totalConfirmado || pedido.total).toLocaleString("es-DO")}) debes enviarnos la *foto del comprobante* de la transferencia 🙏\n\n${cuentas}`;
  } else {
    const totalPedido = num(pedido.totalConfirmado || pedido.total);
    const costoDelivery = pedido.tipoEntrega === "pickup" ? 0 : num(pedido.costoDeliveryAplicado);
    const lineas = leerProductos(pedido.productos).map((p: any) => `• ${p.nombre || p.producto}: ${simbolo}${p.monto || p.precio || 0}`).join("\n");
    mensaje = `👋 Hola ${nombre}! Te escribe *${colmado.nombre}*.\n\n⏳ Tu pedido *#${pedido.id}* está pendiente del comprobante de pago para ser procesado.\n\n📝 *Detalle de tu pedido:*\n${lineas}\n\n`;
    mensaje += `💰 Subtotal: ${simbolo}${(totalPedido - costoDelivery).toLocaleString("es-DO")}\n🛵 Delivery: ${simbolo}${costoDelivery.toLocaleString("es-DO")}\n━━━━━━━━━━━━━━━\n*💵 Total: ${simbolo}${totalPedido.toLocaleString("es-DO")}*\n\n`;
    mensaje += `${cuentas}\n\n⚠️ Sin el comprobante aprobado el pedido no se puede entregar.`;
  }
  const envio = await notificarCliente(c.env, db, colmado, pedido, mensaje);
  // El aviso queda en la conversación aunque WhatsApp aún no esté conectado.
  let conversacionNueva = false;
  if (pedido.clienteWhatsapp && !envio.whatsappEnviado) {
    const conversacion = existente ?? (await getOrCreateConversacion(db, pedido.colmadoId, pedido.clienteWhatsapp, pedido.clienteNombre || undefined));
    conversacionNueva = !existente;
    await addMensaje(db, conversacion.id, "assistant", mensaje);
  }
  return c.json({
    success: true,
    enviado: envio.chatWeb || envio.whatsappEnviado,
    conversacionNueva,
    ...(!envio.chatWeb && !envio.whatsappEnviado ? { necesitaEnvioManual: true, whatsappNumero: pedido.clienteWhatsapp, mensajeParaEnviar: mensaje } : {}),
  });
});

pedidoRoutes.patch("/api/pedidos/:id/metodo-pago", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => null)) || {};
  if (!METODOS_PAGO.includes(body.metodoPago)) return c.json({ error: "Método de pago inválido" }, 400);
  const r = await cargarPedidoOperable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  await updateMetodoPago(db, r.pedido.id, body.metodoPago);
  return c.json({ success: true });
});

// ---------- Consultas públicas del cliente ----------

pedidoRoutes.get("/api/pedidos/:id/estado", async (c) => {
  c.header("Cache-Control", "no-store");
  const pedido = await getPedidoById(getDb(c.env.DB), Number(c.req.param("id")));
  if (!pedido) return c.json({ error: "Pedido no encontrado" }, 404);
  return c.json({
    id: pedido.id, estado: pedido.estado, tipoEntrega: pedido.tipoEntrega,
    costoDeliveryAplicado: pedido.costoDeliveryAplicado, costoDeliveryAplicadoFijado: pedido.costoDeliveryAplicadoFijado,
  });
});

pedidoRoutes.get("/api/seguimiento/:pedidoId", async (c) => {
  c.header("Cache-Control", "no-store");
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("pedidoId"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  const pedido = await getPedidoById(db, id);
  if (!pedido) return c.json({ error: "Pedido no encontrado" }, 404);
  if (pedido.estado === "fusionado") {
    return c.json({ error: `Este pedido está incluido en el Pedido #${pedido.fusionadoEnPedidoId}.`, pedidoPrincipalId: pedido.fusionadoEnPedidoId }, 410);
  }
  const colorPrimario = (await getColmado(db, pedido.colmadoId))?.colorPrimario || "#25D366";
  const base = { pedidoId: id, clienteNombre: pedido.clienteNombre, estado: pedido.estado, tipoEntrega: pedido.tipoEntrega, colorPrimario };
  if (!pedido.deliveryId) {
    return c.json({ ...base, delivery: null, destino: { lat: null, lon: null, direccion: pedido.clienteUbicacion }, eta: null });
  }
  const delivery = await getDeliveryById(db, pedido.deliveryId);
  if (!delivery) return c.json({ error: "Repartidor no encontrado" }, 404);

  let destLat: number | null = null;
  let destLon: number | null = null;
  if (pedido.clienteLatitud && pedido.clienteLongitud) {
    destLat = Number(pedido.clienteLatitud);
    destLon = Number(pedido.clienteLongitud);
  } else {
    const coords = extraerCoordenadas(pedido.clienteUbicacion || "");
    if (coords) { destLat = coords.lat; destLon = coords.lon; }
  }
  const dLat = delivery.ultimaLatitud ? Number(delivery.ultimaLatitud) : null;
  const dLon = delivery.ultimaLongitud ? Number(delivery.ultimaLongitud) : null;
  const eta = dLat && dLon && destLat && destLon ? calcularEtaSencilla(dLat, dLon, destLat, destLon) : null;
  return c.json({
    ...base,
    delivery: { nombre: delivery.nombre, lat: dLat, lon: dLon, ultimaUbicacionAt: delivery.ultimaUbicacionAt },
    destino: { lat: destLat, lon: destLon, direccion: pedido.clienteUbicacion },
    eta,
  });
});

/** Página con vista previa (logo, título) para compartir el enlace de seguimiento. */
pedidoRoutes.get("/compartir/seguimiento/:pedidoId", async (c) => {
  const id = Number(c.req.param("pedidoId"));
  const destino = `/seguimiento/${id}`;
  if (!Number.isInteger(id) || id <= 0) return c.redirect("/", 302);
  try {
    const db = getDb(c.env.DB);
    const pedido = await getPedidoById(db, id);
    if (!pedido || pedido.estado === "fusionado") return c.redirect(destino, 302);
    const colmado = await getColmado(db, pedido.colmadoId);
    const origen = new URL(c.req.url).origin;
    const negocio = colmado?.nombre || "Tu negocio";
    const logo = colmado?.logo || "/delywa-logo.png";
    const imagen = /^https?:\/\//i.test(logo) ? logo : `${origen}${logo.startsWith("/") ? "" : "/"}${logo}`;
    const titulo = colmado?.tituloCompartirPedido?.trim() || `Seguimiento de pedido · ${negocio}`;
    const descripcion = colmado?.descripcionCompartirPedido?.trim() || `Sigue el estado del pedido #${id} de ${negocio}.`;
    const e = escapeHtml;
    return c.html(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${e(titulo)}</title>
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${e(titulo)}" />
    <meta property="og:description" content="${e(descripcion)}" />
    <meta property="og:url" content="${e(c.req.url)}" />
    <meta property="og:image" content="${e(imagen)}" />
    <meta property="og:image:alt" content="Logo de ${e(negocio)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${e(titulo)}" />
    <meta name="twitter:description" content="${e(descripcion)}" />
    <meta name="twitter:image" content="${e(imagen)}" />
    <meta http-equiv="refresh" content="0;url=${destino}" />
    <script>window.location.replace(${JSON.stringify(destino)});</script>
  </head>
  <body><a href="${destino}">Ver seguimiento del pedido</a></body>
</html>`);
  } catch (err) {
    console.error("[compartir] Error generando la vista previa:", err);
    return c.redirect(destino, 302);
  }
});
