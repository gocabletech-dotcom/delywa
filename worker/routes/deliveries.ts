import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Colmado, Delivery, User } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAdmin, requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES, nombreUsuario, puedeOperar } from "../lib/permisos";
import { enlaceWhatsApp, enviarWhatsApp, notificarCliente } from "../lib/mensajeria";
import { mensajeParaRepartidor } from "../lib/mensaje-repartidor";
import { coordenadasDelPedido, enriquecerDirecciones, simboloMoneda } from "../lib/pedido-servicio";
import { calcularMetricasDistanciaPedidoConRutas, parseCoordinatePair } from "../lib/orderDistance";
import { soloDigitos } from "../lib/telefono";
import { getColmado, getColmadoTimezone } from "../storage/colmados";
import { getAccessibleColmadoIds, updateUserRole } from "../storage/users";
import { getConfiguracion, getPlan, upsertConfiguracion } from "../storage/catalogos";
import { getPedidoById, getPedidosByColmado } from "../storage/pedidos";
import {
  asignarPedidoADelivery, calcularPagoDelivery, confirmarCuadre, createDelivery, createDeliveryConUsuario, deleteDelivery,
  getCuadreById, getCuadresByColmado, getDeliveriesByColmado, getDeliveriesConUbicacion, getDeliveriesParaVincular,
  getDeliveryById, getHistorialPagosColmado, getHistorialPagosDelivery, getPagoDeliveryById, getPedidosByDelivery,
  getReporteVentasDelivery, getSaldoById, getSaldosByColmado, marcarPagoDeliveryComoPagado, marcarSaldoSaldado,
  pendientesDelRepartidor, tieneCuadrePendiente, updateDeliveryCodigoAcceso, updateDeliveryConfigPago, updateDeliveryEstado,
} from "../storage/deliveries";

export const deliveryRoutes = new Hono<AppEnv>();

const ESTADOS_REPARTIDOR = ["activo", "inactivo", "en_descanso"];
const MODELOS_PAGO = ["salario", "comision", "mixto"];
const PERIODOS_PAGO = ["semanal", "quincenal", "mensual", "personalizado"];

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

/** El código de acceso es la contraseña del portal: solo lo ven los administradores del negocio. */
function sinCodigo<T extends Delivery>(d: T, verCodigo: boolean) {
  if (verCodigo) return d;
  const { codigoAcceso: _c, ...resto } = d;
  return resto;
}

/** Carga al repartidor y exige que el usuario administre su sucursal. */
async function repartidorAdministrable(db: Db, user: User, id: number) {
  const delivery = Number.isInteger(id) ? await getDeliveryById(db, id) : undefined;
  if (!delivery) return { error: { status: 404 as const, body: { error: "Repartidor no encontrado" } } };
  if (!(await puedeOperar(db, user, delivery.colmadoId, ADMINISTRADORES))) {
    return { error: { status: 403 as const, body: { error: "No tienes permiso para administrar este repartidor" } } };
  }
  return { delivery };
}

async function limiteDePlan(db: Db, colmado: Colmado) {
  const plan = colmado.planId ? await getPlan(db, colmado.planId) : undefined;
  return plan?.limiteDeliveries ? { nombre: plan.nombre, limite: plan.limiteDeliveries } : null;
}

// ---------- Alta, lista y baja ----------

deliveryRoutes.get("/api/colmados/:id/deliveries", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const verCodigo = await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES);
  return c.json((await getDeliveriesByColmado(db, colmadoId)).map((d) => sinCodigo(d, verCodigo)));
});

async function crearRepartidor(c: Context<AppEnv>, colmadoId: number, nombre: unknown, whatsappNumero: unknown, conUsuario: boolean) {
  const db = getDb(c.env.DB);
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) {
    return c.json({ error: "No tienes permiso para crear deliveries en este negocio" }, 403);
  }
  if (typeof nombre !== "string" || !nombre.trim() || typeof whatsappNumero !== "string" || !soloDigitos(whatsappNumero)) {
    return c.json({ error: "Se requiere nombre y número de WhatsApp" }, 400);
  }
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Colmado no encontrado" }, 404);

  const existentes = await getDeliveriesByColmado(db, colmadoId);
  const plan = await limiteDePlan(db, colmado);
  if (plan && existentes.length >= plan.limite) {
    return c.json({
      error: `Tu plan "${plan.nombre}" solo permite ${plan.limite} delivery(s). Actualiza tu plan para agregar más.`,
      code: "PLAN_LIMIT_EXCEEDED", limite: plan.limite, actual: existentes.length,
    }, 403);
  }
  if (existentes.some((d) => soloDigitos(d.whatsappNumero) === soloDigitos(whatsappNumero))) {
    return c.json({ error: "Ya existe un delivery con ese número de WhatsApp en este negocio" }, 409);
  }
  const datos = { colmadoId, nombre: nombre.trim(), whatsappNumero: whatsappNumero.trim() };
  if (conUsuario) {
    const { delivery, userId } = await createDeliveryConUsuario(db, datos);
    return c.json({ delivery, user: { id: userId, firstName: delivery.nombre, role: "delivery", colmadoId, deliveryId: delivery.id } }, 201);
  }
  return c.json(await createDelivery(db, { ...datos, estado: "activo" }), 201);
}

deliveryRoutes.post("/api/colmados/:id/deliveries/user", requireAuth, async (c) => {
  const body = await cuerpo(c);
  return crearRepartidor(c, Number(c.req.param("id")), body.nombre, body.whatsappNumero, true);
});

deliveryRoutes.post("/api/deliveries", requireAuth, async (c) => {
  const body = await cuerpo(c);
  const colmadoId = Number(body.colmadoId);
  if (!Number.isInteger(colmadoId)) return c.json({ error: "colmadoId es requerido" }, 400);
  return crearRepartidor(c, colmadoId, body.nombre, body.whatsappNumero, false);
});

deliveryRoutes.delete("/api/deliveries/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await repartidorAdministrable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  // Borrarlo elimina sus cuadres y saldos: si hay dinero por cuadrar se pide deshabilitarlo.
  const pendientes = await pendientesDelRepartidor(db, r.delivery.id);
  if (pendientes.cuadres || pendientes.saldos) {
    return c.json({
      error: "Este repartidor tiene cuadres o saldos pendientes. Confírmalos o sáldalos antes de eliminarlo, o deshabilítalo.",
      reason: "pendientes_de_cuadre", ...pendientes,
    }, 409);
  }
  await deleteDelivery(db, r.delivery.id);
  return c.json({ success: true });
});

deliveryRoutes.patch("/api/deliveries/:id/estado", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const { estado } = await cuerpo(c);
  if (!ESTADOS_REPARTIDOR.includes(estado)) {
    return c.json({ error: "Estado inválido. Valores permitidos: activo, inactivo, en_descanso" }, 400);
  }
  const r = await repartidorAdministrable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  if (estado === "activo") {
    const colmado = await getColmado(db, r.delivery.colmadoId);
    const plan = colmado ? await limiteDePlan(db, colmado) : null;
    if (plan) {
      const activos = (await getDeliveriesByColmado(db, r.delivery.colmadoId)).filter((d) => d.estado === "activo" && d.id !== r.delivery.id);
      if (activos.length >= plan.limite) {
        return c.json({
          error: `Tu plan "${plan.nombre}" solo permite ${plan.limite} delivery(s) activo(s). Desactiva otro delivery o actualiza tu plan.`,
          code: "PLAN_LIMIT_EXCEEDED", limite: plan.limite, activos: activos.length,
        }, 403);
      }
    }
  }
  await updateDeliveryEstado(db, r.delivery.id, estado, "dashboard");
  return c.json({ success: true });
});

deliveryRoutes.post("/api/deliveries/:id/generar-codigo", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await repartidorAdministrable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  return c.json({ codigoAcceso: await updateDeliveryCodigoAcceso(db, r.delivery.id) });
});

/**
 * Un usuario sin rol vincula su cuenta a un repartidor ya creado por el negocio.
 * El original solo pedía el número y cualquier usuario (incluso un dueño) podía
 * tomar el rol; ahora se exige cuenta sin rol y el código de acceso.
 */
deliveryRoutes.post("/api/user/register-delivery", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const user = c.var.user;
  if (user.role !== "pending") return c.json({ error: "Tu cuenta ya tiene un rol asignado" }, 403);
  const { whatsappNumero, codigoAcceso } = await cuerpo(c);
  if (typeof whatsappNumero !== "string" || !soloDigitos(whatsappNumero) || typeof codigoAcceso !== "string" || !codigoAcceso.trim()) {
    return c.json({ error: "Escribe tu número de WhatsApp y el código de acceso que te dio el negocio" }, 400);
  }
  const candidatos = await getDeliveriesParaVincular(db, whatsappNumero, codigoAcceso);
  if (candidatos.length !== 1) {
    return c.json({ error: "No se encontró un delivery con ese número y código. El negocio debe registrarte primero." }, 404);
  }
  const delivery = candidatos[0];
  await updateUserRole(db, user.id, "delivery", delivery.colmadoId, delivery.id);
  const session = c.var.session;
  session.set("userRole", "delivery");
  session.set("colmadoId", delivery.colmadoId);
  session.set("deliveryId", delivery.id);
  return c.json(sinCodigo(delivery, false));
});

// ---------- Configuración de pago, reportes y nómina ----------

const configPagoSchema = z.object({
  modeloPago: z.enum(MODELOS_PAGO as [string, ...string[]]).optional(),
  salarioMonto: z.coerce.number().min(0).optional(),
  comisionFija: z.coerce.number().min(0).optional(),
  comisionPorcentaje: z.coerce.number().min(0).max(100).optional(),
  periodoPago: z.enum(PERIODOS_PAGO as [string, ...string[]]).optional(),
});

deliveryRoutes.patch("/api/deliveries/:id/config-pago", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await repartidorAdministrable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  const parsed = configPagoSchema.safeParse(await cuerpo(c));
  if (!parsed.success) return c.json({ error: "Configuración de pago inválida" }, 400);
  const d = parsed.data;
  const config = {
    ...(d.modeloPago !== undefined ? { modeloPago: d.modeloPago } : {}),
    ...(d.salarioMonto !== undefined ? { salarioMonto: d.salarioMonto.toFixed(2) } : {}),
    ...(d.comisionFija !== undefined ? { comisionFija: d.comisionFija.toFixed(2) } : {}),
    ...(d.comisionPorcentaje !== undefined ? { comisionPorcentaje: d.comisionPorcentaje.toFixed(2) } : {}),
    ...(d.periodoPago !== undefined ? { periodoPago: d.periodoPago } : {}),
  };
  if (!Object.keys(config).length) return c.json(r.delivery);
  return c.json(await updateDeliveryConfigPago(db, r.delivery.id, config));
});

function fecha(valor: unknown): Date | null {
  if (valor === undefined || valor === null || valor === "") return null;
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
}

deliveryRoutes.get("/api/colmados/:id/deliveries/reporte-ventas", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const agrupacion = c.req.query("agrupacion") || "dia";
  if (!["dia", "semana", "mes"].includes(agrupacion)) return c.json({ error: "agrupacion inválida (usa dia, semana o mes)" }, 400);
  const hasta = fecha(c.req.query("hasta")) ?? new Date();
  const desde = fecha(c.req.query("desde")) ?? new Date(hasta.getTime() - 365 * 24 * 60 * 60 * 1000);
  const colmado = await getColmado(db, colmadoId);
  const tz = colmado ? await getColmadoTimezone(db, colmado) : undefined;
  return c.json(await getReporteVentasDelivery(db, colmadoId, agrupacion as "dia" | "semana" | "mes", desde, hasta, tz || "America/Santo_Domingo"));
});

deliveryRoutes.post("/api/deliveries/:id/pagos/calcular", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await repartidorAdministrable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  const body = await cuerpo(c);
  const inicio = fecha(body.periodoInicio);
  const fin = fecha(body.periodoFin);
  if (!inicio || !fin) return c.json({ error: "Se requiere periodoInicio y periodoFin" }, 400);
  if (inicio > fin) return c.json({ error: "El inicio del período debe ser anterior al fin" }, 400);
  return c.json(await calcularPagoDelivery(db, r.delivery, inicio, fin));
});

// El original no verificaba a quién pertenecía el repartidor en estas dos rutas.
deliveryRoutes.get("/api/deliveries/:id/pagos", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const r = await repartidorAdministrable(db, c.var.user, Number(c.req.param("id")));
  if (r.error) return c.json(r.error.body, r.error.status);
  return c.json(await getHistorialPagosDelivery(db, r.delivery.id));
});

deliveryRoutes.patch("/api/pagos-delivery/:id/marcar-pagado", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const pago = await getPagoDeliveryById(db, Number(c.req.param("id")));
  if (!pago) return c.json({ error: "Pago no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, pago.colmadoId, ADMINISTRADORES))) return c.json({ error: "Sin permiso" }, 403);
  const { pagadoPor } = await cuerpo(c);
  const nombre = typeof pagadoPor === "string" && pagadoPor.trim() ? pagadoPor.trim().slice(0, 120) : nombreUsuario(c.var.user);
  return c.json(await marcarPagoDeliveryComoPagado(db, pago.id, nombre));
});

deliveryRoutes.get("/api/colmados/:id/deliveries/pagos", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "No tienes permiso para ver esto" }, 403);
  return c.json(await getHistorialPagosColmado(db, colmadoId));
});

// ---------- Pedidos del repartidor y ubicaciones ----------

deliveryRoutes.get("/api/deliveries/:id/pedidos", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const delivery = await getDeliveryById(db, Number(c.req.param("id")));
  if (!delivery) return c.json({ error: "Delivery no encontrado" }, 404);
  const user = c.var.user;
  const propio = user.role === "delivery" && user.deliveryId === delivery.id;
  if (!propio && !(await puedeOperar(db, user, delivery.colmadoId))) return c.json({ error: "Sin permiso" }, 403);
  return c.json(await getPedidosByDelivery(db, delivery.id));
});

deliveryRoutes.get("/api/colmados/:id/deliveries/ubicaciones", requireAuth, requireBusinessAccess(), async (c) => {
  return c.json(await getDeliveriesConUbicacion(getDb(c.env.DB), Number(c.req.param("id"))));
});

/** Distancia por carretera de los pedidos elegidos. Aparte de la lista para que un proveedor lento no la frene. */
deliveryRoutes.post("/api/colmados/:id/pedidos/distancias-ruta", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const ids = z.array(z.number().int().positive()).max(50).safeParse((await cuerpo(c)).pedidoIds);
  if (!ids.success) return c.json({ error: "pedidoIds debe ser una lista de hasta 50 pedidos" }, 400);
  const proveedor = process.env.ROUTING_PROVIDER_NAME?.trim() || "Proveedor de rutas";
  const trafico = process.env.ROUTING_PROVIDER_TRAFFIC === "true";
  if (!process.env.ROUTING_PROVIDER_URL?.trim()) {
    return c.json({ configured: false, routingStatus: "unconfigured", limited: false, providerName: null, trafficEnabled: false, results: [] });
  }
  try {
    const pedidos = await getPedidosByColmado(db, colmadoId);
    const pedidos2 = new Set(ids.data);
    const seleccion = await enriquecerDirecciones(db, pedidos.filter((p) => pedidos2.has(p.id)).slice(0, 25));
    const colmado = await getColmado(db, colmadoId);
    const raiz = colmado ? colmado.negocioPrincipalId || colmado.id : colmadoId;
    const accesibles = await Promise.all((await getAccessibleColmadoIds(db, c.var.user)).map((id) => getColmado(db, id)));
    const sucursales = accesibles.filter((s): s is Colmado => !!s && (s.negocioPrincipalId || s.id) === raiz);
    const results = await Promise.all(seleccion.map(async (p) => ({
      pedidoId: p.id,
      metricasDistancia: await calcularMetricasDistanciaPedidoConRutas({
        tipoEntrega: p.tipoEntrega, sucursalOrigenId: p.colmadoId, sucursales, maxConsultas: 3,
        destino: parseCoordinatePair(p.clienteLatitud, p.clienteLongitud) ?? (await coordenadasDelPedido(db, p)),
      }),
    })));
    return c.json({
      configured: true, routingStatus: "available", limited: ids.data.length > seleccion.length,
      providerName: proveedor, trafficEnabled: trafico, results,
    });
  } catch (err) {
    console.error("[deliveries] No se pudieron consultar las rutas:", err);
    return c.json({ error: "No se pudieron consultar las rutas", routingStatus: "unavailable", configured: true, providerName: proveedor, trafficEnabled: trafico, results: [] }, 502);
  }
});

// ---------- Asignación ----------

deliveryRoutes.patch("/api/pedidos/:id/asignar", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const pedidoId = Number(c.req.param("id"));
  const deliveryId = Number((await cuerpo(c)).deliveryId);
  const pedido = await getPedidoById(db, pedidoId);
  if (!pedido) return c.json({ error: "Pedido no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, pedido.colmadoId))) return c.json({ error: "No tienes permiso para operar esta sucursal" }, 403);
  if (pedido.estado === "fusionado") {
    return c.json({
      error: `El Pedido #${pedidoId} está incluido en el Pedido #${pedido.fusionadoEnPedidoId} y no puede asignarse por separado.`,
      reason: "pedido_fusionado",
    }, 409);
  }
  if (pedido.tipoEntrega === "pickup") return c.json({ error: "Este pedido es pickup y debe entregarlo el negocio.", reason: "pedido_pickup" }, 400);
  if (pedido.estado !== "listo") {
    return c.json({ error: "El pedido debe estar listo en cocina antes de asignarlo a un delivery.", reason: "pedido_no_listo" }, 409);
  }
  // El original no verificaba que el repartidor fuera del mismo negocio.
  const delivery = Number.isInteger(deliveryId) ? await getDeliveryById(db, deliveryId) : undefined;
  if (!delivery || delivery.colmadoId !== pedido.colmadoId) return c.json({ error: "Repartidor no encontrado en esta sucursal" }, 404);
  if (delivery.estado === "inactivo") {
    return c.json({ error: "Este repartidor está deshabilitado. Habilítalo antes de asignarle pedidos.", reason: "delivery_deshabilitado" }, 409);
  }
  if (await tieneCuadrePendiente(db, delivery.id)) {
    return c.json({
      error: "Este repartidor tiene un cuadre pendiente de confirmación. Confírmalo en la sección de Cuadres antes de asignarle nuevos pedidos.",
      reason: "cuadre_pendiente",
    }, 409);
  }
  if (!(await asignarPedidoADelivery(db, pedidoId, delivery.id))) {
    return c.json({ error: `El Pedido #${pedidoId} ya no está disponible para asignación.`, reason: "pedido_no_disponible" }, 409);
  }

  let mensajeParaEnviar: string | null = null;
  let whatsappEnviado = false;
  try {
    const colmado = await getColmado(db, pedido.colmadoId);
    if (colmado) {
      const actualizado = (await getPedidoById(db, pedidoId))!;
      const simbolo = await simboloMoneda(db, colmado);
      mensajeParaEnviar = await mensajeParaRepartidor(db, colmado, actualizado, simbolo);
      whatsappEnviado = await enviarWhatsApp(c.env, colmado, delivery.whatsappNumero, mensajeParaEnviar);
      const total = Number(actualizado.totalConfirmado ?? actualizado.total) || 0;
      await notificarCliente(c.env, db, colmado, actualizado,
        `🛵 ¡Tu pedido #${pedidoId} ha sido asignado a un delivery!\n\n💰 Total: ${simbolo}${total.toLocaleString("es-DO")}\n\nPronto saldrá hacia tu ubicación. Te avisaremos cuando esté en camino. 🙌`,
        { whatsapp: false });
    }
  } catch (err) {
    // La asignación ya quedó hecha: un fallo al avisar no la deshace.
    console.error(`[deliveries] No se pudo avisar la asignación del pedido #${pedidoId}:`, err);
  }
  return c.json({
    success: true,
    whatsappEnviado,
    necesitaEnvioManual: !whatsappEnviado && !!mensajeParaEnviar,
    whatsappNumero: delivery.whatsappNumero,
    mensajeParaEnviar,
  });
});

deliveryRoutes.post("/api/pedidos/:id/reenviar-delivery", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const pedido = await getPedidoById(db, Number(c.req.param("id")));
  if (!pedido) return c.json({ error: "Pedido no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, pedido.colmadoId))) return c.json({ error: "No tienes permiso para operar esta sucursal" }, 403);
  if (!pedido.deliveryId) return c.json({ error: "Este pedido no tiene delivery asignado" }, 400);
  const delivery = await getDeliveryById(db, pedido.deliveryId);
  if (!delivery?.whatsappNumero) return c.json({ error: "Delivery no encontrado o sin número de WhatsApp" }, 400);
  const colmado = await getColmado(db, pedido.colmadoId);
  if (!colmado) return c.json({ error: "Colmado no encontrado" }, 404);
  const mensaje = await mensajeParaRepartidor(db, colmado, pedido, await simboloMoneda(db, colmado));
  const enviado = await enviarWhatsApp(c.env, colmado, delivery.whatsappNumero, mensaje);
  // Sin canal de WhatsApp integrado, el panel abre WhatsApp con el mensaje listo.
  return c.json({
    success: true,
    message: enviado ? "Pedido reenviado al delivery" : "Abre WhatsApp para enviar el pedido al delivery",
    whatsappEnviado: enviado,
    necesitaEnvioManual: !enviado,
    whatsappNumero: delivery.whatsappNumero,
    mensajeParaEnviar: mensaje,
    enlaceWhatsApp: enviado ? null : enlaceWhatsApp(delivery.whatsappNumero, mensaje),
  });
});

// ---------- Cuadres y saldos ----------

deliveryRoutes.get("/api/colmados/:id/cuadres", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "Sin permiso" }, 403);
  return c.json(await getCuadresByColmado(db, colmadoId, c.req.query("estado") || undefined));
});

deliveryRoutes.patch("/api/colmados/:id/cuadres/:cuadreId/confirmar", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "Sin permiso" }, 403);
  const cuadre = await getCuadreById(db, Number(c.req.param("cuadreId")));
  if (!cuadre) return c.json({ error: "Cuadre no encontrado" }, 404);
  if (cuadre.colmadoId !== colmadoId) return c.json({ error: "El cuadre no pertenece a este negocio" }, 403);
  if (cuadre.estado === "confirmado") return c.json({ error: "El cuadre ya está confirmado" }, 400);
  const { notasNegocio, montoRecibido } = await cuerpo(c);
  let monto: number | undefined;
  if (montoRecibido !== undefined && montoRecibido !== null && montoRecibido !== "") {
    monto = Number(montoRecibido);
    if (!Number.isFinite(monto) || monto < 0) return c.json({ error: "montoRecibido inválido" }, 400);
  }
  const notas = typeof notasNegocio === "string" ? notasNegocio.slice(0, 1000) : undefined;
  const actualizado = await confirmarCuadre(db, cuadre, notas, monto);
  if (!actualizado) return c.json({ error: "El cuadre ya está confirmado" }, 400);
  return c.json(actualizado);
});

deliveryRoutes.get("/api/colmados/:id/saldos-delivery", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "Sin permiso" }, 403);
  return c.json(await getSaldosByColmado(db, colmadoId));
});

deliveryRoutes.patch("/api/saldos-delivery/:id/saldar", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const saldo = await getSaldoById(db, Number(c.req.param("id")));
  if (!saldo) return c.json({ error: "Saldo no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, saldo.colmadoId, ADMINISTRADORES))) return c.json({ error: "Sin permiso para saldar este registro" }, 403);
  const actualizado = await marcarSaldoSaldado(db, saldo.id);
  return c.json(actualizado ?? saldo);
});

// ---------- Mensaje para el repartidor (plataforma) ----------

deliveryRoutes.get("/api/admin/delivery-prompt", requireAuth, requireAdmin, async (c) => {
  const config = await getConfiguracion(getDb(c.env.DB), "delivery_prompt");
  return c.json({ prompt: config?.valor || "" });
});

deliveryRoutes.put("/api/admin/delivery-prompt", requireAuth, requireAdmin, async (c) => {
  const { prompt } = await cuerpo(c);
  if (typeof prompt !== "string") return c.json({ error: "prompt es requerido" }, 400);
  const config = await upsertConfiguracion(getDb(c.env.DB), "delivery_prompt", prompt, "Prompt que se envía al delivery cuando se activa");
  return c.json({ prompt: config.valor });
});
