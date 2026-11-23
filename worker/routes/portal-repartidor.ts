import { Hono, type Context, type MiddlewareHandler } from "hono";
import { ajustesDe, cobraEl, disponibleParaAdelanto, periodoQueContiene, resumenDe, saldoDeCuadres } from "../lib/ganancias-delivery";
import { avisarAlNegocio } from "../lib/push";
import { fechaLocal, rangoDiaLocal } from "../lib/fechas";
import { deliveryAdelantos, pagosDelivery, pedidos, type Delivery } from "@shared/schema";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { guardarSuscripcion, leerSuscripcion } from "./push";
import { avisarNegocio } from "../lib/tiempo-real";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { sesionPortalVencida, turnoTerminadoHoy, ventanaDeGracia } from "../lib/turno-repartidor";
import { borrarEventos, contarEventos, registrarEvento } from "../lib/rate-limit";

/** Espera extra por cada fallo contra un mismo número en la última hora (las pruebas la ponen en 0). */
export const PORTAL = { esperaPorFalloMs: 250 };
import { cambiarEstadoPedido, coordenadasDelPedido, enriquecerDirecciones } from "../lib/pedido-servicio";
import { extraerCoordenadas, optimizarRutaEntregaPorCarretera, type PuntoEntrega } from "../lib/routeOptimizer";
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
  // Se frena la conexión que falla, no el número: nadie puede dejar fuera a un repartidor a propósito.
  const ip = c.req.header("CF-Connecting-IP") ?? "sin-ip";
  const numero = `${slug.trim().toLowerCase()}:${soloDigitos(whatsappNumero)}`;
  const clave = `portalf:${ip}:${numero}`, claveIp = `portalf:ip:${ip}`, claveNumero = `portalfn:${numero}`;
  const VENTANA = 15 * 60 * 1000;
  if ((await contarEventos(db, clave, VENTANA)) >= 5 || (await contarEventos(db, claveIp, VENTANA)) >= 30) {
    c.header("Retry-After", String(VENTANA / 1000));
    return c.json({ error: "Demasiados intentos desde esta conexión. Intenta de nuevo en 15 minuto(s).", reason: "rate_limited" }, 429);
  }

  const colmado = await getColmadoByCodigo(db, slug.trim());
  const delivery = colmado ? await getDeliveryByPortalLogin(db, colmado.id, whatsappNumero, codigoAcceso) : undefined;
  if (!colmado || !delivery) {
    await registrarEvento(db, clave, claveIp, claveNumero);
    // Muchos fallos contra un mismo número (desde cualquier conexión): cada intento tarda más.
    const espera = Math.min((await contarEventos(db, claveNumero, 60 * 60 * 1000)) * PORTAL.esperaPorFalloMs, 4000);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    return c.json({ error: "No encontramos un repartidor con ese número y código. Revisa el prefijo, número y código de acceso." }, 401);
  }
  await borrarEventos(db, clave);
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
      telefono: conMoneda.telefonoAlternativo || conMoneda.whatsappNumero,
    } : null,
    fueraDeHorario: gracia.enGracia,
    horaFinTurno: gracia.terminaEn ? new Date(gracia.terminaEn).toISOString() : null,
  });
});

/**
 * «Ganancias»: lo que lleva ganado hoy y en el período, sus pagos y lo que debe de los cuadres.
 * Solo lo suyo y sin las ventas del colmado (si cobra por %, ve la comisión ya calculada).
 */
portalRepartidorRoutes.get("/api/portal-repartidor/ganancias", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const d = c.var.repartidor;
  const colmado = await getColmado(db, d.colmadoId);
  const tz = colmado ? await getColmadoTimezone(db, colmado) : "America/Santo_Domingo";
  const moneda = colmado ? (await enrichColmadoWithMoneda(db, colmado)).simboloMoneda || "RD$" : "RD$";
  const { desde, hasta } = rangoDiaLocal(tz);
  const periodo = periodoQueContiene(d.periodoPago, tz);
  const [hoy, enCurso, pagos, saldo] = await Promise.all([
    resumenDe(db, d, new Date(desde.getTime() - 1), new Date(hasta.getTime() - 1), false),
    resumenDe(db, d, periodo.inicio, periodo.fin),
    db.select().from(pagosDelivery).where(eq(pagosDelivery.deliveryId, d.id)).orderBy(desc(pagosDelivery.periodoInicio)).limit(30),
    saldoDeCuadres(db, d),
  ]);
  const sinVentas = ({ ventas: _v, ...resto }: { ventas: number } & Record<string, unknown>) => resto;
  const ajustes = await ajustesDe(db, pagos.map((p) => p.id));
  const adelantos = await db.select().from(deliveryAdelantos).where(eq(deliveryAdelantos.deliveryId, d.id)).orderBy(desc(deliveryAdelantos.id)).limit(10);
  const disponible = await disponibleParaAdelanto(db, d, enCurso.total);
  return c.json({
    moneda,
    forma: { modelo: d.modeloPago, periodo: d.periodoPago, salario: Number(d.salarioMonto) || 0, porEntrega: Number(d.comisionFija) || 0, porcentaje: Number(d.comisionPorcentaje) || 0, envio: d.envioEsDelDelivery },
    colmado: colmado?.nombre ?? "",
    hoy: sinVentas(hoy),
    periodo: { ...sinVentas(enCurso), desde: periodo.desde, hasta: periodo.hasta, tipo: periodo.tipo, cobraEl: cobraEl(periodo) },
    pagos: pagos.map((p) => ({
      id: p.id, desde: p.periodoInicio, hasta: p.periodoFin, entregas: p.totalPedidos, salario: Number(p.salarioCalculado), comision: Number(p.comisionCalculada),
      total: Number(p.montoTotal), estado: p.estado, fechaPago: p.fechaPago, pagadoPor: p.pagadoPor, notas: p.notas,
      envio: Number(p.envioCalculado), metodo: p.metodoPago, comprobante: p.comprobanteUrl, recibido: p.recibidoAt,
      ajustes: ajustes.filter((a) => a.pagoId === p.id).map((a) => ({ id: a.id, tipo: a.tipo, monto: Number(a.monto), motivo: a.motivo })),
    })),
    // Negativo: faltó dinero en sus cuadres (lo debe). Positivo: entregó de más (se le debe).
    saldoCuadres: saldo,
    adelantos: adelantos.map((a) => ({ id: a.id, monto: Number(a.monto), motivo: a.motivo, estado: a.estado, respuesta: a.respuesta, fecha: a.fecha, resueltoAt: a.resueltoAt })),
    adelantoDisponible: disponible,
  });
});

/** Pedir un adelanto: hasta el 50 % de lo ganado en el período; uno pendiente a la vez. */
portalRepartidorRoutes.post("/api/portal-repartidor/adelantos", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const d = c.var.repartidor;
  const { monto, motivo } = await cuerpo(c);
  const n = Math.round(Number(monto));
  if (!Number.isFinite(n) || n < 50) return c.json({ error: "El adelanto mínimo es de RD$50." }, 400);
  const [pend] = await db.select({ id: deliveryAdelantos.id }).from(deliveryAdelantos).where(and(eq(deliveryAdelantos.deliveryId, d.id), eq(deliveryAdelantos.estado, "pendiente"))).limit(1);
  if (pend) return c.json({ error: "Ya tienes un adelanto esperando respuesta del colmado." }, 409);
  const colmado = await getColmado(db, d.colmadoId);
  const tz = colmado ? await getColmadoTimezone(db, colmado) : "America/Santo_Domingo";
  const p = periodoQueContiene(d.periodoPago, tz);
  const disponible = await disponibleParaAdelanto(db, d, (await resumenDe(db, d, p.inicio, p.fin)).total);
  if (n > disponible) return c.json({ error: disponible > 0 ? `Ahora puedes pedir hasta RD$${disponible.toLocaleString("es-DO")} (la mitad de lo que llevas ganado).` : "Todavía no tienes ganado suficiente en este período para pedir un adelanto." }, 409);
  const [a] = await db.insert(deliveryAdelantos).values({ deliveryId: d.id, colmadoId: d.colmadoId, monto: n.toFixed(2), motivo: typeof motivo === "string" ? motivo.trim().slice(0, 200) || null : null }).returning();
  if (colmado) await avisarAlNegocio(c.env, db, colmado, { titulo: `💸 ${d.nombre.split(" ")[0]} pide un adelanto`, texto: `RD$${n.toLocaleString("es-DO")}${a.motivo ? ` · ${a.motivo}` : ""}. Apruébalo o recházalo en Repartidores.`, url: "/negocio/deliveries", etiqueta: `adelanto-${a.id}` }).catch(() => 0);
  await avisarNegocio(c.env, d.colmadoId, ["deliveries"]).catch(() => undefined);
  return c.json({ ok: true, id: a.id }, 201);
});

portalRepartidorRoutes.post("/api/portal-repartidor/adelantos/:id/cancelar", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const r = await db.delete(deliveryAdelantos).where(and(eq(deliveryAdelantos.id, Number(c.req.param("id"))), eq(deliveryAdelantos.deliveryId, c.var.repartidor.id), eq(deliveryAdelantos.estado, "pendiente"))).returning({ id: deliveryAdelantos.id });
  if (!r.length) return c.json({ error: "Ese adelanto ya fue respondido." }, 409);
  return c.json({ ok: true });
});

/** Mis números (últimos 30 días): entregas por día, fallidas y tiempo promedio desde «listo» hasta entregado. */
portalRepartidorRoutes.get("/api/portal-repartidor/estadisticas", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const d = c.var.repartidor;
  const colmado = await getColmado(db, d.colmadoId);
  const tz = colmado ? await getColmadoTimezone(db, colmado) : "America/Santo_Domingo";
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const filas = await db.select({ estado: pedidos.estado, fechaEntrega: pedidos.fechaEntrega, fechaCreacion: pedidos.fechaCreacion, listo: pedidos.cocinaListaAt, motivo: pedidos.motivoRetorno })
    .from(pedidos).where(and(eq(pedidos.deliveryId, d.id), gt(pedidos.fechaCreacion, desde)));
  const entregados = filas.filter((f) => f.estado === "entregado" && f.fechaEntrega);
  const fallidas = filas.filter((f) => f.estado === "retorno" || (f.estado === "entregado" && f.motivo)).length;
  const tiempos = entregados.map((f) => (f.listo ? (f.fechaEntrega!.getTime() - f.listo.getTime()) / 60000 : null)).filter((m): m is number => m != null && m > 0 && m < 240);
  const porDia = new Map<string, number>();
  for (let i = 13; i >= 0; i--) porDia.set(fechaLocal(tz, new Date(Date.now() - i * 86_400_000)), 0);
  for (const f of entregados) { const k = fechaLocal(tz, f.fechaEntrega!); if (porDia.has(k)) porDia.set(k, porDia.get(k)! + 1); }
  const total = entregados.length + fallidas;
  return c.json({
    dias30: { entregas: entregados.length, fallidas, exito: total ? Math.round((entregados.length / total) * 100) : null, minutosPromedio: tiempos.length ? Math.round(tiempos.reduce((s, x) => s + x, 0) / tiempos.length) : null },
    porDia: [...porDia.entries()].map(([dia, entregas]) => ({ dia, entregas })),
  });
});

/** «Recibí mi pago»: constancia para el repartidor y el colmado. */
portalRepartidorRoutes.post("/api/portal-repartidor/pagos/:id/recibido", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const [p] = await db.update(pagosDelivery).set({ recibidoAt: new Date() })
    .where(and(eq(pagosDelivery.id, Number(c.req.param("id"))), eq(pagosDelivery.deliveryId, c.var.repartidor.id), eq(pagosDelivery.estado, "pagado"), isNull(pagosDelivery.recibidoAt)))
    .returning();
  if (!p) return c.json({ error: "Ese pago todavía no está marcado como pagado o ya lo confirmaste." }, 409);
  await avisarNegocio(c.env, p.colmadoId, ["deliveries"]).catch(() => undefined);
  return c.json({ ok: true, recibido: p.recibidoAt });
});

/** Propina que le dio el cliente (después de entregar, hasta 24 horas). Es suya. */
portalRepartidorRoutes.post("/api/portal-repartidor/pedidos/:pedidoId/propina", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const { monto } = await cuerpo(c);
  const n = Math.round(Number(monto) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return c.json({ error: "Revisa el monto de la propina." }, 400);
  const [p] = await db.update(pedidos).set({ propina: n.toFixed(2) })
    .where(and(eq(pedidos.id, Number(c.req.param("pedidoId"))), eq(pedidos.deliveryId, c.var.repartidor.id), eq(pedidos.estado, "entregado"), gt(pedidos.fechaEntrega, new Date(Date.now() - 24 * 3600_000))))
    .returning({ id: pedidos.id });
  if (!p) return c.json({ error: "Solo puedes anotar la propina de una entrega tuya de las últimas 24 horas." }, 404);
  return c.json({ ok: true });
});

/** Avisos en el celular del repartidor: pedido asignado, pago listo, pago hecho. */
portalRepartidorRoutes.post("/api/portal-repartidor/push", requirePortal, async (c) => {
  const db = getDb(c.env.DB);
  const { suscripcion } = await cuerpo(c);
  const sus = leerSuscripcion(suscripcion);
  if (!sus) return c.json({ error: "Tu navegador no permitió los avisos." }, 400);
  await guardarSuscripcion(db, sus, { tipo: "delivery", colmadoId: c.var.repartidor.colmadoId, userId: `delivery:${c.var.repartidor.id}` });
  return c.json({ ok: true });
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
