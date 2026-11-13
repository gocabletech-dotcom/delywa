import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { Delivery } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { sesionPortalVencida, turnoTerminadoHoy, ventanaDeGracia } from "../lib/turno-repartidor";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "../lib/rate-limit";
import { cambiarEstadoPedido, coordenadasDelPedido, enriquecerDirecciones } from "../lib/pedido-servicio";
import { extraerCoordenadas, optimizarRutaEntregaPorCarretera, type PuntoEntrega } from "../lib/routeOptimizer";
import { fechaLocal } from "../lib/fechas";
import { soloDigitos } from "../lib/telefono";
import { enrichColmadoWithMoneda, getColmado, getColmadoTimezone } from "../storage/colmados";
import { getPedidoById } from "../storage/pedidos";
import { getColmadoByCodigo } from "./menu-grafico";
import {
  createCuadre, DatosInvalidos, getCuadresByDelivery, getDeliveryById, getDeliveryByPortalLogin, getParadaConRuta,
  getParadasConPedido, getPedidosByDelivery, getPedidosSinCuadre, getRutaActivaDelivery, marcarParadaEstado,
  reemplazarRutaActiva, updateDeliveryEstado, updateDeliveryHeartbeat, updateDeliveryUbicacion,
} from "../storage/deliveries";

type PortalEnv = AppEnv & { Variables: AppEnv["Variables"] & { repartidor: Delivery } };

export const portalRepartidorRoutes = new Hono<PortalEnv>();

const CLAVES_PORTAL = ["portalDeliveryId", "portalColmadoId", "portalSessionCreatedAt"] as const;

async function cuerpo(c: Context<PortalEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

function datosPublicos(d: Delivery) {
  return { id: d.id, nombre: d.nombre, estado: d.estado, ultimaActivacion: d.ultimaActivacion, ultimaActivacionOrigen: d.ultimaActivacionOrigen };
}

/**
 * Sesión del portal: el repartidor debe existir, no estar deshabilitado y seguir
 * dentro de su turno (hasta una hora después del cierre del negocio).
 */
const requirePortal: MiddlewareHandler<PortalEnv> = async (c, next) => {
  const session = c.var.session;
  const id = session.data.portalDeliveryId;
  if (!id) return c.json({ error: "No autenticado en el portal" }, 401);
  const db = getDb(c.env.DB);
  const delivery = await getDeliveryById(db, id);
  if (!delivery) {
    session.unset(...CLAVES_PORTAL);
    return c.json({ error: "No autenticado en el portal" }, 401);
  }
  if (delivery.estado === "inactivo") {
    session.unset(...CLAVES_PORTAL);
    return c.json({ error: "Tu cuenta fue deshabilitada por el negocio.", reason: "account_disabled" }, 403);
  }
  try {
    const colmado = await getColmado(db, delivery.colmadoId);
    if (colmado && sesionPortalVencida(colmado, await getColmadoTimezone(db, colmado), session.data.portalSessionCreatedAt)) {
      session.unset(...CLAVES_PORTAL);
      return c.json({ error: "Turno finalizado", reason: "schedule_ended" }, 401);
    }
  } catch (err) {
    // Si la verificación del horario falla no se bloquea al repartidor.
    console.error("[portal] Error al verificar el turno:", err);
  }
  c.set("repartidor", delivery);
  await next();
};

/** Las rutas con :id en la URL solo sirven al propio repartidor de la sesión. */
const requireMismoRepartidor: MiddlewareHandler<PortalEnv> = async (c, next) => {
  const pedido = Number(c.req.param("id"));
  if (!Number.isInteger(pedido) || pedido <= 0) return c.json({ error: "ID de delivery inválido" }, 400);
  if (pedido !== c.var.repartidor.id) return c.json({ error: "No tienes permiso para ver esta ruta" }, 403);
  await next();
};

// ---------- Sesión ----------

portalRepartidorRoutes.post("/api/portal-repartidor/login", async (c) => {
  const db = getDb(c.env.DB);
  const { slug, whatsappNumero, codigoAcceso } = await cuerpo(c);
  if ([slug, whatsappNumero, codigoAcceso].some((v) => typeof v !== "string" || !v.trim())) {
    return c.json({ error: "Se requiere slug del negocio, número de WhatsApp y código de acceso" }, 400);
  }
  if (!soloDigitos(whatsappNumero)) return c.json({ error: "Escribe un número de WhatsApp válido." }, 400);

  // Mejora aprobada: límite de intentos por número y por IP, igual que el login del panel.
  const clave = `portal:${slug.trim().toLowerCase()}:${soloDigitos(whatsappNumero)}`;
  const ip = c.req.header("CF-Connecting-IP");
  const bloqueado = await loginBlockedFor(db, clave, ip);
  if (bloqueado > 0) {
    c.header("Retry-After", String(bloqueado));
    return c.json({ error: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(bloqueado / 60)} minuto(s).`, reason: "rate_limited" }, 429);
  }

  const colmado = await getColmadoByCodigo(db, slug.trim());
  const delivery = colmado ? await getDeliveryByPortalLogin(db, colmado.id, whatsappNumero, codigoAcceso) : undefined;
  if (!colmado || !delivery) {
    await recordLoginFailure(db, clave, ip);
    return c.json({ error: "No encontramos un repartidor con ese número y código. Revisa el prefijo, número y código de acceso." }, 401);
  }
  await clearLoginFailures(db, clave);
  if (delivery.estado === "inactivo") {
    return c.json({ error: "Tu cuenta fue deshabilitada por el negocio. Contacta al dueño.", reason: "account_disabled" }, 403);
  }
  if (turnoTerminadoHoy(colmado, await getColmadoTimezone(db, colmado))) {
    return c.json({ error: "El horario de delivery ha finalizado por hoy", reason: "schedule_ended" }, 401);
  }

  const session = c.var.session;
  // Nuevo identificador al entrar para evitar fijación de sesión.
  session.regenerate();
  session.set("portalDeliveryId", delivery.id);
  session.set("portalColmadoId", delivery.colmadoId);
  session.set("portalSessionCreatedAt", Date.now());
  return c.json({ success: true, delivery: datosPublicos(delivery) });
});

portalRepartidorRoutes.post("/api/portal-repartidor/logout", (c) => {
  c.var.session.unset(...CLAVES_PORTAL);
  return c.json({ success: true });
});

portalRepartidorRoutes.get("/api/portal-repartidor/me", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const delivery = c.var.repartidor;
  const colmado = await getColmado(db, delivery.colmadoId);
  const gracia = colmado ? ventanaDeGracia(colmado, await getColmadoTimezone(db, colmado)) : { enGracia: false, terminaEn: null };
  const conMoneda = colmado ? await enrichColmadoWithMoneda(db, colmado) : null;
  return c.json({
    delivery: datosPublicos(delivery),
    colmado: conMoneda ? {
      id: conMoneda.id, nombre: conMoneda.nombre, logo: conMoneda.logo, colorPrimario: conMoneda.colorPrimario,
      tiempoEstimado: conMoneda.tiempoEstimado, simboloMoneda: conMoneda.simboloMoneda || "RD$",
      direccion: conMoneda.direccion, latitud: conMoneda.latitud, longitud: conMoneda.longitud,
    } : null,
    fueraDeHorario: gracia.enGracia,
    horaFinTurno: gracia.terminaEn ? new Date(gracia.terminaEn).toISOString() : null,
  });
});

portalRepartidorRoutes.post("/api/portal-repartidor/activar", requirePortal, async (c) => {
  const d = await updateDeliveryEstado(getDb(c.env.DB), c.var.repartidor.id, "activo", "portal");
  return c.json({ success: true, delivery: d && { id: d.id, estado: d.estado, ultimaActivacion: d.ultimaActivacion, ultimaActivacionOrigen: d.ultimaActivacionOrigen } });
});

/**
 * El original ponía "inactivo", que es el estado de "deshabilitado por el dueño":
 * el repartidor quedaba fuera del portal y no podía volver a entrar. Ahora queda
 * "en_descanso", que no recibe pedidos pero puede volver a activarse.
 */
portalRepartidorRoutes.post("/api/portal-repartidor/desactivar", requirePortal, async (c) => {
  await updateDeliveryEstado(getDb(c.env.DB), c.var.repartidor.id, "en_descanso", "portal");
  return c.json({ success: true });
});

portalRepartidorRoutes.post("/api/portal-repartidor/heartbeat", requirePortal, async (c) => {
  await updateDeliveryHeartbeat(getDb(c.env.DB), c.var.repartidor.id);
  return c.json({ ok: true });
});

// ---------- Pedidos ----------

portalRepartidorRoutes.get("/api/portal-repartidor/pedidos", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await enriquecerDirecciones(db, await getPedidosByDelivery(db, c.var.repartidor.id, 50)));
});

const ESTADOS_PORTAL = ["en_camino", "llegando", "entregado", "cancelado", "retorno"];

portalRepartidorRoutes.patch("/api/portal-repartidor/pedidos/:pedidoId/estado", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const { estado, motivoRetorno } = await cuerpo(c);
  if (!ESTADOS_PORTAL.includes(estado)) return c.json({ error: "Estado inválido" }, 400);
  const pedido = await getPedidoById(db, Number(c.req.param("pedidoId")));
  if (!pedido) return c.json({ error: "Pedido no encontrado" }, 404);
  if (pedido.deliveryId !== c.var.repartidor.id) return c.json({ error: "No tienes permiso para actualizar este pedido" }, 403);
  // Un pedido ya cerrado o cuadrado no lo puede reabrir el repartidor.
  // Excepción: un retorno que todavía tiene el repartidor se puede entregar si el cliente aparece.
  const entregaTrasRetorno = pedido.estado === "retorno" && estado === "entregado";
  if (pedido.cuadreId || (["entregado", "cancelado", "retorno"].includes(pedido.estado) && pedido.estado !== estado && !entregaTrasRetorno)) {
    return c.json({ error: "Este pedido ya fue cerrado. Pide al negocio que lo corrija si hace falta.", reason: "pedido_cerrado" }, 409);
  }
  const error = await cambiarEstadoPedido(c.env, db, pedido, estado, {
    motivoRetorno: typeof motivoRetorno === "string" ? motivoRetorno.slice(0, 500) : undefined,
    origen: new URL(c.req.url).origin,
  });
  if (error) return c.json(error.body, error.status);
  return c.json({ success: true });
});

// ---------- Cuadres ----------

portalRepartidorRoutes.get("/api/portal-repartidor/pedidos-sin-cuadre", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await enriquecerDirecciones(db, await getPedidosSinCuadre(db, c.var.repartidor.id)));
});

portalRepartidorRoutes.post("/api/portal-repartidor/cuadre", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const { pedidoIds, notasRepartidor } = await cuerpo(c);
  if (!Array.isArray(pedidoIds) || pedidoIds.length === 0 || !pedidoIds.every((x) => Number.isInteger(x) && x > 0)) {
    return c.json({ error: "Se requiere al menos un pedido" }, 400);
  }
  const delivery = c.var.repartidor;
  const colmado = await getColmado(db, delivery.colmadoId);
  const tz = colmado ? await getColmadoTimezone(db, colmado) : "America/Santo_Domingo";
  try {
    const cuadre = await createCuadre(db, {
      deliveryId: delivery.id,
      colmadoId: delivery.colmadoId,
      // Fecha del día en la zona del negocio (el original usaba la fecha UTC).
      fechaCuadre: fechaLocal(tz),
      notasRepartidor: typeof notasRepartidor === "string" && notasRepartidor.trim() ? notasRepartidor.slice(0, 1000) : null,
    }, pedidoIds);
    return c.json(cuadre, 201);
  } catch (err) {
    if (err instanceof DatosInvalidos) return c.json({ error: err.message }, 400);
    throw err;
  }
});

portalRepartidorRoutes.get("/api/portal-repartidor/cuadres", requirePortal, async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") || "", 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") || "", 10) || 20));
  const todos = await getCuadresByDelivery(getDb(c.env.DB), c.var.repartidor.id);
  return c.json({ cuadres: todos.slice((page - 1) * limit, page * limit), total: todos.length, page, limit });
});

// ---------- GPS y rutas (solo el propio repartidor) ----------

/** El original aceptaba la ubicación de cualquier repartidor sin sesión. */
portalRepartidorRoutes.post("/api/deliveries/:id/ubicacion", requirePortal, requireMismoRepartidor, async (c) => {
  const { latitud, longitud } = await cuerpo(c);
  if (typeof latitud !== "number" || typeof longitud !== "number" || Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
    return c.json({ error: "latitud y longitud son requeridos" }, 400);
  }
  await updateDeliveryUbicacion(getDb(c.env.DB), c.var.repartidor.id, latitud, longitud);
  return c.json({ ok: true });
});

portalRepartidorRoutes.post("/api/deliveries/:id/rutas/optimizar", requirePortal, requireMismoRepartidor, async (c) => {
  const db = getDb(c.env.DB);
  const delivery = c.var.repartidor;
  const { pedidosIds } = await cuerpo(c);
  if (!Array.isArray(pedidosIds) || pedidosIds.length === 0) return c.json({ error: "pedidosIds es requerido" }, 400);
  const pedidos = new Set(pedidosIds.map(Number));
  const seleccion = await enriquecerDirecciones(db, (await getPedidosByDelivery(db, delivery.id)).filter((p) => pedidos.has(p.id)).slice(0, 25));

  const puntos: PuntoEntrega[] = [];
  const sinUbicacion: number[] = [];
  for (const p of seleccion) {
    // GPS guardado → coordenadas escritas en la dirección → geocodificación.
    let coords = p.clienteLatitud && p.clienteLongitud ? { lat: parseFloat(p.clienteLatitud), lon: parseFloat(p.clienteLongitud) } : null;
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) coords = extraerCoordenadas(p.clienteUbicacion || "");
    if (!coords) {
      const geo = await coordenadasDelPedido(db, p);
      coords = geo ? { lat: geo.latitud, lon: geo.longitud } : null;
    }
    if (coords) puntos.push({ pedidoId: p.id, lat: coords.lat, lon: coords.lon });
    else sinUbicacion.push(p.id);
  }
  if (!puntos.length) return c.json({ error: "Ningún pedido tiene coordenadas GPS", sinUbicacion }, 422);

  const colmado = await getColmado(db, delivery.colmadoId);
  const inicio = colmado?.latitud && colmado.longitud
    ? { lat: parseFloat(colmado.latitud), lon: parseFloat(colmado.longitud) }
    : { lat: puntos[0].lat, lon: puntos[0].lon };
  const tz = colmado ? await getColmadoTimezone(db, colmado) : "America/Santo_Domingo";
  // Hora de salida en la zona del negocio (el original usaba la hora del servidor).
  const horaSalida = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const resultado = await optimizarRutaEntregaPorCarretera(inicio, puntos, horaSalida);

  const ruta = await reemplazarRutaActiva(db, {
    deliveryId: delivery.id, inicioLatitud: String(inicio.lat), inicioLongitud: String(inicio.lon),
    distanciaTotal: String(resultado.distanciaTotalKm), tiempoEstimadoMinutos: resultado.tiempoEstimadoMinutos,
    fuenteDistancias: resultado.fuenteDistancias, trafico: resultado.trafico, estado: "en_progreso", fechaInicio: new Date(),
  }, resultado.paradas.map((p) => ({
    pedidoId: p.pedidoId, orden: p.orden, distanciaDesdeAnteriorKm: String(p.distanciaDesdeAnteriorKm),
    tiempoDesdeAnteriorMinutos: p.tiempoDesdeAnteriorMinutos, horaEstimadaLlegada: p.horaEstimadaLlegada, estado: "pendiente",
  })));
  const paradas = await getParadasConPedido(db, ruta.id);
  const conDireccion = await enriquecerDirecciones(db, paradas.map((p) => p.pedido));
  return c.json({ ruta, paradas: paradas.map((p, i) => ({ ...p, pedido: conDireccion[i] })), sinUbicacion });
});

portalRepartidorRoutes.get("/api/deliveries/:id/rutas/activa", requirePortal, requireMismoRepartidor, async (c) => {
  const db = getDb(c.env.DB);
  const ruta = await getRutaActivaDelivery(db, c.var.repartidor.id);
  if (!ruta) return c.json({ ruta: null, paradas: [] });
  const paradas = await getParadasConPedido(db, ruta.id);
  const conDireccion = await enriquecerDirecciones(db, paradas.map((p) => p.pedido));
  return c.json({ ruta, paradas: paradas.map((p, i) => ({ ...p, pedido: conDireccion[i] })) });
});

/** El original permitía marcar cualquier parada sin sesión. */
portalRepartidorRoutes.patch("/api/paradas-ruta/:id/estado", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const { estado, motivo } = await cuerpo(c);
  if (!["pendiente", "entregado", "no_entregado"].includes(estado)) {
    return c.json({ error: "Estado inválido. Valores: pendiente, entregado, no_entregado" }, 400);
  }
  const parada = await getParadaConRuta(db, Number(c.req.param("id")));
  if (!parada) return c.json({ error: "Parada no encontrada" }, 404);
  if (parada.deliveryId !== c.var.repartidor.id) return c.json({ error: "No tienes permiso para actualizar esta parada" }, 403);
  return c.json(await marcarParadaEstado(db, parada.parada.id, parada.rutaId, estado, typeof motivo === "string" ? motivo.slice(0, 500) : undefined));
});
