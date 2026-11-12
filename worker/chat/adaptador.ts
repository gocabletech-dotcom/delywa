import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  botIntenciones, chatWebMensajes, chatWebSesiones, clientes, colmados, conocimientoArchivos, deliveries, diccionarioJerga,
  mensajesSistema, menuPlantillaItems, menuPlantillas, metaWebhookEventos, pedidos, plantillasJerga, whatsappConversaciones, zipAlertaEventos, type ChatWebSesion,
} from "@shared/schema";
import { isColmadoAbierto } from "../lib/horario";
import { soloDigitos } from "../lib/telefono";
import { getDeliveriesByColmado, updateDeliveryEstado } from "../storage/deliveries";
import type { Env } from "../env";
import type { Db } from "../db";
import { enviarWhatsApp, urlPublica } from "../lib/mensajeria";
import { credencialesMeta, enviarPlantillaMeta, enviarTextoMeta, graphUrl, http } from "../lib/whatsapp";
import { enrichColmadoWithMoneda as conMoneda, getColmado, getColmadoTimezone as zonaHoraria, getPais } from "../storage/colmados";
import { getConfiguracion, getMetodosPago, getTiposNegocio, upsertConfiguracion } from "../storage/catalogos";
import { createPlantillaJerga, getDiccionarioByColmado, getMenuProductos, getPlantillasByTipoNegocio, getProductosRestringidos } from "../storage/menu";
import { getUserById } from "../storage/users";
import { chunkRows } from "../lib/d1";
import {
  addChatWebMensaje, addMensaje, getChatWebSession, getChatWebSessionByPedidoId, getClienteByWhatsapp, getConversacionByCliente,
  getMensajes, getOrCreateCliente, getOrCreateConversacion, updateChatWebSession, updateConversacionPedidoEstado,
} from "../storage/conversaciones";
import {
  actualizarVentaDelDia, createPedido, getDeliveryById, getPedidoById, getPedidosByClienteWhatsapp, getVentaDelDia, leerProductos,
  updateMetodoPago, updatePedidoEstado, updateVuelto,
} from "../storage/pedidos";
import { getPlantillaZip } from "../routes/plataforma";

// Puente entre el motor del chat (código del servidor original) y Cloudflare:
// la base de datos D1, el cliente de IA, el envío por WhatsApp y el modo de
// atender peticiones. Cada petición lleva su propio contexto, porque en un
// Worker varias peticiones se intercalan dentro del mismo proceso.

type Contexto = { env: Env; db: Db; origen: string; manejadores: Map<string, Manejador>; pendientes: Promise<unknown>[]; demoraMs?: [number, number] };
type Manejador = (req: any, res: any) => any;
const contexto = new AsyncLocalStorage<Contexto>();

function ctx(): Contexto {
  const actual = contexto.getStore();
  if (!actual) throw new Error("El motor del chat se usó fuera de una petición");
  return actual;
}

// ---------- Peticiones: de Hono al estilo que espera el motor ----------

type Registrar = {
  (ruta: string, h: Manejador): void;
  (ruta: string, previo: unknown, h: Manejador): void;
  (ruta: string, previo1: unknown, previo2: unknown, h: Manejador): void;
};
export type AppLike = { get: Registrar; post: Registrar };

/** Ejecuta una función del motor (no un manejador de ruta) con el contexto de la petición. */
export async function conContexto<T>(base: Pick<Contexto, "env" | "db" | "origen" | "demoraMs">, fn: () => Promise<T>): Promise<T> {
  const pendientes: Promise<unknown>[] = [];
  const r = await contexto.run({ ...base, manejadores: new Map(), pendientes }, fn);
  await Promise.allSettled(pendientes);
  return r;
}

class Respuesta {
  codigo = 200;
  cuerpo: unknown = undefined;
  enviada = false;
  status(codigo: number) { this.codigo = codigo; return this; }
  json(cuerpo: unknown) {
    if (!this.enviada) { this.cuerpo = cuerpo; this.enviada = true; }
    return this;
  }
  send(cuerpo: unknown) { return this.json(cuerpo); }
  sendStatus(codigo: number) { this.codigo = codigo; return this.json(null); }
}

export type Resultado = { status: number; body: unknown };

/** Ejecuta un manejador del motor con el contexto de la petición y devuelve su respuesta. */
export async function ejecutar(
  base: Pick<Contexto, "env" | "db" | "origen" | "demoraMs"> & { pendientes?: Promise<unknown>[] }, manejadores: Map<string, Manejador>, ruta: string, req: { body?: any; params?: any; query?: any; session?: any },
): Promise<Resultado> {
  const manejador = manejadores.get(ruta);
  if (!manejador) return { status: 404, body: { error: "Ruta no encontrada" } };
  const res = new Respuesta();
  const pendientes = base.pendientes ?? [];
  await contexto.run({ ...base, manejadores, pendientes }, () => manejador({ body: req.body ?? {}, params: req.params ?? {}, query: req.query ?? {}, headers: {}, session: req.session ?? {} }, res));
  // Trabajo en segundo plano de la petición principal (avisos al negocio): se termina antes de responder.
  if (!base.pendientes) await Promise.allSettled(pendientes);
  return res.enviada ? { status: res.codigo, body: res.cuerpo } : { status: 500, body: { error: "Sin respuesta" } };
}

/** Un manejador llama a otro (la nota de voz reutiliza el flujo de mensajes). El original se llamaba a sí mismo por HTTP. */
export async function llamarInterno(ruta: string, body: unknown): Promise<any> {
  const actual = ctx();
  const r = await ejecutar(actual, actual.manejadores, `POST ${ruta}`, { body });
  if (r.status >= 400) throw new Error(`El manejador interno respondió ${r.status}`);
  return r.body;
}

/** Registra trabajo que el motor no espera, para que el Worker no lo corte al responder. */
export function enSegundoPlano(tarea: Promise<unknown>): void {
  ctx().pendientes.push(tarea.catch((err) => console.error("[chat] Tarea en segundo plano falló:", err instanceof Error ? err.message : err)));
}

// ---------- IA ----------

/** Las pruebas reemplazan esta fábrica por una IA simulada; así no se gasta saldo ni se llama a OpenAI. */
export const ia = {
  crear(env: Env): OpenAI {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no está configurada");
    // AI_GATEWAY_URL (opcional) hace pasar las llamadas por Cloudflare AI Gateway: caché, límites y registro de costos.
    return new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.AI_GATEWAY_URL || undefined, timeout: 30_000, maxRetries: 1 });
  },
};

const clienteIA = { chat: { completions: { create: (args: any) => ia.crear(ctx().env).chat.completions.create(args) } }, audio: { transcriptions: { create: (args: any) => ia.crear(ctx().env).audio.transcriptions.create(args) } } };
export const openai: any = clienteIA;
export const openaiWhisper: any = clienteIA;

// ---------- WhatsApp y utilidades ----------

export function sendWhatsAppMessageSmart(colmado: any, to: string, text: string, skipWindowCheck = false): Promise<boolean> {
  return enviarWhatsApp(ctx().env, colmado, to, text, { omitirVentana: skipWindowCheck });
}

export async function sendZipAlertMetaTemplate(colmado: any, to: string, count: number): Promise<boolean> {
  if (colmado?.tecnologiasHabilitadas?.meta !== true) return false;
  const credenciales = credencialesMeta(ctx().env, colmado);
  if (!credenciales) return false;
  const plantilla = await getPlantillaZip(ctx().db);
  return enviarPlantillaMeta(credenciales, to, plantilla.name, plantilla.language, [String(count)]);
}

export function sendWhatsAppMessageWithToken(phoneNumberId: string, to: string, text: string, accessToken: string): Promise<boolean> {
  return enviarTextoMeta({ phoneNumberId, accessToken }, to, text);
}

/**
 * Pausa "humana" antes de responder por WhatsApp (8 a 12 segundos en el original).
 * El tiempo lo fija quien ejecuta el motor: completo en la cola, corto si se procesa sin cola.
 */
export const demora = { porDefecto: [8000, 12000] as [number, number] };
export function humanDelay(): Promise<void> {
  const [min, max] = ctx().demoraMs ?? demora.porDefecto;
  const ms = Math.floor(min + Math.random() * Math.max(0, max - min));
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Llamada a la Graph API de Meta con la versión vigente. */
export const graphFetch = (ruta: string, init?: RequestInit) => http.fetch(graphUrl(ruta), { ...init, signal: AbortSignal.timeout(20_000) });
/** Descarga de un archivo externo (audio de WhatsApp), con tiempo máximo. */
export const fetchExterno = (url: string, init?: RequestInit) => http.fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
export const tokenGlobalMeta = () => ctx().env.WHATSAPP_ACCESS_TOKEN;
export const urlBasePublica = () => urlPublica(ctx().env, ctx().origen);

export const enrichColmadoWithMoneda = (colmado: any) => conMoneda(ctx().db, colmado);
export const getColmadoTimezone = (colmado: any) => zonaHoraria(ctx().db, colmado);
export const getPublicRequestOrigin = (_req: unknown) => urlPublica(ctx().env, ctx().origen);

// ---------- Base de datos: los mismos nombres que usaba el servidor original ----------

const dinero = (v: unknown) => String(v);

const crearPlantillaJerga = (data: any) => createPlantillaJerga(ctx().db, {
    ...data, jerga: String(data.jerga ?? "").slice(0, 120), productoIdentificado: String(data.productoIdentificado ?? "").slice(0, 200),
    precioSugerido: data.precioSugerido === null || data.precioSugerido === undefined || data.precioSugerido === "" ? null : String(data.precioSugerido),
  });

export const storage = {
  getColmado: (id: number) => getColmado(ctx().db, Number(id)),
  getPais: (id: number) => getPais(ctx().db, id),
  getMenuProductos: (colmadoId: number) => getMenuProductos(ctx().db, colmadoId),
  getMetodosPago: (colmadoId: number) => getMetodosPago(ctx().db, colmadoId),
  getDiccionarioByColmado: (colmadoId: number) => getDiccionarioByColmado(ctx().db, colmadoId),
  getConfiguracion: (clave: string) => getConfiguracion(ctx().db, clave),
  upsertConfiguracion: (clave: string, valor: string, descripcion?: string, tipo?: string) => upsertConfiguracion(ctx().db, clave, valor, descripcion, tipo),
  getDeliveryById: (id: number) => getDeliveryById(ctx().db, id),

  async getMensajeSistema(clave: string) {
    const [m] = await ctx().db.select().from(mensajesSistema).where(and(eq(mensajesSistema.clave, clave), eq(mensajesSistema.activo, true)));
    return m;
  },
  getConocimientoByTipo: (tipoNegocio: string) =>
    ctx().db.select().from(conocimientoArchivos).where(eq(conocimientoArchivos.tipoNegocio, tipoNegocio)).orderBy(conocimientoArchivos.fechaCreacion),

  // Pedidos
  getPedidoById: (id: number) => getPedidoById(ctx().db, Number(id)),
  getPedidosByClienteWhatsapp: (colmadoId: number, whatsapp: string) => getPedidosByClienteWhatsapp(ctx().db, colmadoId, whatsapp),
  createPedido: (data: any) => createPedido(ctx().db, data),
  updatePedidoEstado: (id: number, estado: string, motivo?: string) => updatePedidoEstado(ctx().db, id, estado, motivo),
  updatePedidoMetodoPago: (id: number, metodoPago: string) => updateMetodoPago(ctx().db, id, metodoPago),
  updateVueltoEntregado: (id: number, monto: number, usuario?: string) => updateVuelto(ctx().db, id, monto, usuario),
  async updatePedidoPago(id: number, data: { montoPago: string; necesitaDevuelta: boolean; total: string }) {
    await ctx().db.update(pedidos).set({ montoPago: dinero(data.montoPago), necesitaDevuelta: data.necesitaDevuelta, total: dinero(data.total) }).where(eq(pedidos.id, id));
  },
  async updatePedidoComprobante(id: number, comprobanteUrl: string) {
    await ctx().db.update(pedidos).set({ comprobanteUrl }).where(eq(pedidos.id, id));
  },
  async updatePedidoProductosYTotal(id: number, productos: any, totalConfirmado: string, sustituciones?: any[]) {
    await ctx().db.update(pedidos).set({
      productos: typeof productos === "string" ? productos : JSON.stringify(productos),
      totalConfirmado: dinero(totalConfirmado), total: dinero(totalConfirmado), ...(sustituciones ? { sustituciones } : {}),
    }).where(eq(pedidos.id, id));
  },
  /** Agrega productos a un pedido existente y deja constancia en las notas. */
  async mergePedidoProductos(id: number, nuevos: any[], nuevoTotal: string) {
    const pedido = await getPedidoById(ctx().db, id);
    if (!pedido) return;
    const nombres = nuevos.map((p) => p.nombre).join(", ");
    await ctx().db.update(pedidos).set({
      productos: JSON.stringify([...leerProductos(pedido.productos), ...nuevos]), total: dinero(nuevoTotal),
      notas: pedido.notas ? `${pedido.notas} | Añadido: ${nombres}` : `Añadido: ${nombres}`,
    }).where(eq(pedidos.id, id));
  },

  // Chat web
  getChatWebSession: (sessionId: string) => getChatWebSession(ctx().db, String(sessionId)),
  async updateChatWebSession(sessionId: string, data: any) {
    await updateChatWebSession(ctx().db, sessionId, data);
    return getChatWebSession(ctx().db, sessionId);
  },
  addChatWebMensaje: (sessionId: string, rol: string, contenido: string) => addChatWebMensaje(ctx().db, sessionId, rol, contenido),
  getChatWebMensajes: (sessionId: string) =>
    ctx().db.select().from(chatWebMensajes).where(eq(chatWebMensajes.sessionId, sessionId)).orderBy(chatWebMensajes.fechaCreacion, chatWebMensajes.id),
  getChatWebSessionsByWhatsapp: (colmadoId: number, whatsapp: string) =>
    ctx().db.select().from(chatWebSesiones)
      .where(and(eq(chatWebSesiones.colmadoId, colmadoId), eq(chatWebSesiones.clienteWhatsapp, whatsapp)))
      .orderBy(desc(chatWebSesiones.fechaUltimaActividad)),

  /** DELYWA: el identificador de sesión es la única llave del chat; ahora es aleatorio criptográfico (antes Math.random). */
  async createChatWebSession(colmadoId: number, clienteNombre?: string, clienteWhatsapp?: string): Promise<ChatWebSesion> {
    const db = ctx().db;
    let conversacionId: number | null = null;
    if (clienteWhatsapp) {
      const conversacion = await getOrCreateConversacion(db, colmadoId, clienteWhatsapp, clienteNombre);
      conversacionId = conversacion.id;
      await db.update(whatsappConversaciones).set({ ultimoPedidoEstado: "pendiente" }).where(eq(whatsappConversaciones.id, conversacion.id));
    }
    const [sesion] = await db.insert(chatWebSesiones).values({
      sessionId: `chat_${crypto.randomUUID().replaceAll("-", "")}`, colmadoId,
      clienteNombre: clienteNombre || null, clienteWhatsapp: clienteWhatsapp || null, conversacionId, estado: "activa",
    }).returning();
    return sesion;
  },

  /**
   * Pasa el carrito pendiente de una sesión anterior a la nueva. Las dos
   * sentencias van en un batch: si dos pestañas lo piden a la vez, solo una lo recibe.
   */
  async claimChatWebCart(origenId: string, destinoId: string): Promise<ChatWebSesion | undefined> {
    const db = ctx().db;
    const libre = sql`pedido_id is null and estado not in ('pedido_creado', 'finalizada')`;
    const ahora = Date.now();
    const [, reclamadas] = await db.batch([
      db.update(chatWebSesiones).set({
        productosCapturados: sql`(select productos_capturados from chat_web_sesiones where session_id = ${origenId} and ${libre})`,
        clienteDireccion: sql`(select cliente_direccion from chat_web_sesiones where session_id = ${origenId} and ${libre})`,
        metodoPagoSeleccionado: sql`(select metodo_pago_seleccionado from chat_web_sesiones where session_id = ${origenId} and ${libre})`,
        estadoConversacion: "retomando_carrito", fechaUltimaActividad: new Date(ahora),
      }).where(and(eq(chatWebSesiones.sessionId, destinoId), sql`exists (select 1 from chat_web_sesiones where session_id = ${origenId} and ${libre})`)),
      db.update(chatWebSesiones).set({ estado: "finalizada", fechaUltimaActividad: new Date(ahora) })
        .where(and(eq(chatWebSesiones.sessionId, origenId), isNull(chatWebSesiones.pedidoId), sql`${chatWebSesiones.estado} not in ('pedido_creado', 'finalizada')`))
        .returning(),
    ]);
    return reclamadas[0];
  },

  // Alertas de código postal
  async logZipMissingAlert(colmadoId: number, canal: string, clienteIdentificador: string | null, direccionRecibida: string | null) {
    try {
      await ctx().db.insert(zipAlertaEventos).values({ colmadoId, canal, clienteIdentificador, direccionRecibida });
    } catch (err) {
      console.error("[zip] No se pudo registrar la alerta:", err instanceof Error ? err.message : err);
    }
  },
  async contarZipMissingAlertasEnHoras(colmadoId: number, horas: number): Promise<number> {
    const [fila] = await ctx().db.select({ n: sql<number>`count(*)` }).from(zipAlertaEventos)
      .where(and(eq(zipAlertaEventos.colmadoId, colmadoId), sql`${zipAlertaEventos.fechaCreacion} > ${Date.now() - horas * 3_600_000}`));
    return Number(fila?.n || 0);
  },
  // ---------- Bot de WhatsApp ----------
  addMensaje: (conversacionId: number, rol: string, contenido: string) => addMensaje(ctx().db, conversacionId, rol, contenido),
  getOrCreateConversacion: (colmadoId: number, whatsapp: string, nombre?: string) => getOrCreateConversacion(ctx().db, colmadoId, whatsapp, nombre),
  getConversacionByClienteWhatsapp: (colmadoId: number, whatsapp: string) => getConversacionByCliente(ctx().db, colmadoId, whatsapp),
  updateConversacionPedidoEstado: (id: number, estado: string) => updateConversacionPedidoEstado(ctx().db, id, estado),
  async updateConversacionDireccion(id: number, direccion: { texto?: string; latitud?: string; longitud?: string }) {
    await ctx().db.update(whatsappConversaciones).set({
      ultimoMensaje: new Date(),
      ...(direccion.texto ? { direccionTexto: direccion.texto } : {}),
      ...(direccion.latitud ? { latitud: String(direccion.latitud) } : {}),
      ...(direccion.longitud ? { longitud: String(direccion.longitud) } : {}),
    }).where(eq(whatsappConversaciones.id, id));
  },
  getMensajesByConversacion: (conversacionId: number, limite = 20) => getMensajes(ctx().db, conversacionId, limite),
  async getOrCreateDeliveryConversacion(colmadoId: number, whatsapp: string, nombre: string) {
    const db = ctx().db;
    const lista = await db.select().from(whatsappConversaciones)
      .where(and(eq(whatsappConversaciones.colmadoId, colmadoId), eq(whatsappConversaciones.esDelivery, true)));
    const existente = lista.find((c) => soloDigitos(c.clienteWhatsapp) === soloDigitos(whatsapp));
    if (existente) {
      if (nombre && nombre !== existente.clienteNombre) {
        await db.update(whatsappConversaciones).set({ clienteNombre: nombre }).where(eq(whatsappConversaciones.id, existente.id));
        return { ...existente, clienteNombre: nombre };
      }
      return existente;
    }
    const [nueva] = await db.insert(whatsappConversaciones).values({ colmadoId, clienteWhatsapp: whatsapp, clienteNombre: nombre, esDelivery: true }).returning();
    return nueva;
  },

  getClienteByWhatsapp: (colmadoId: number, whatsapp: string) => getClienteByWhatsapp(ctx().db, colmadoId, whatsapp),
  getOrCreateCliente: (colmadoId: number, whatsapp: string, data?: any) => getOrCreateCliente(ctx().db, colmadoId, whatsapp, data),
  async verificarEdadCliente(clienteId: number) {
    await ctx().db.update(clientes).set({ edadVerificada: true, ultimaActualizacion: new Date() }).where(eq(clientes.id, clienteId));
  },

  async getColmadoByPhoneNumberId(phoneNumberId: string) {
    const [c] = await ctx().db.select().from(colmados).where(eq(colmados.whatsappPhoneNumberId, String(phoneNumberId)));
    return c;
  },
  async getColmadoByEvolutionInstance(instancia: string) {
    const [c] = await ctx().db.select().from(colmados).where(eq(colmados.evolutionInstanceName, String(instancia)));
    return c;
  },
  /** Cada aviso de Meta se procesa una sola vez, aunque Meta lo reenvíe. */
  async claimMetaWebhookEvent(eventId: string): Promise<boolean> {
    const filas = await ctx().db.insert(metaWebhookEventos).values({ eventId }).onConflictDoNothing().returning({ eventId: metaWebhookEventos.eventId });
    return filas.length > 0;
  },
  isColmadoAbierto: (colmado: any, timezone?: string) => isColmadoAbierto(colmado, timezone),

  // Repartidores
  getDeliveriesByColmado: (colmadoId: number) => getDeliveriesByColmado(ctx().db, colmadoId),
  async getDeliveryByWhatsapp(numero: string) {
    const digitos = soloDigitos(numero);
    if (!digitos) return undefined;
    return (await ctx().db.select().from(deliveries)).find((d) => soloDigitos(d.whatsappNumero) === digitos);
  },
  async updateDeliveryEstado(id: number, estado: string, origen?: string) { await updateDeliveryEstado(ctx().db, id, estado, origen); },
  activarDelivery: (id: number, origen?: string) => updateDeliveryEstado(ctx().db, id, "activo", origen),
  async isDeliveryWindowActive(delivery: { ultimaActivacion?: Date | null }) {
    return !!delivery.ultimaActivacion && Date.now() - new Date(delivery.ultimaActivacion).getTime() < 24 * 3_600_000;
  },
  /** Asignación del bot: como en el original, no exige que cocina haya marcado el pedido como listo. */
  async asignarPedidoADelivery(pedidoId: number, deliveryId: number): Promise<boolean> {
    const filas = await ctx().db.update(pedidos).set({ deliveryId })
      .where(and(eq(pedidos.id, pedidoId), ne(pedidos.estado, "fusionado"), ne(pedidos.tipoEntrega, "pickup"))).returning({ id: pedidos.id });
    return filas.length > 0;
  },
  async updateSustituciones(pedidoId: number, sustituciones: any[]) {
    await ctx().db.update(pedidos).set({ sustituciones }).where(eq(pedidos.id, pedidoId));
  },
  getChatWebSessionByPedidoId: (pedidoId: number) => getChatWebSessionByPedidoId(ctx().db, pedidoId),

  // Ventas del día, en la zona horaria del negocio
  async getVentasDiarias(colmadoId: number, fecha: Date) {
    const db = ctx().db;
    const colmado = await getColmado(db, colmadoId);
    return getVentaDelDia(db, colmadoId, colmado ? await zonaHoraria(db, colmado) : "America/Santo_Domingo", fecha);
  },
  async updateVentas(colmadoId: number, fecha: Date, datos: { totalVentas?: string | number; pedidosEntregados?: number; pedidosCancelados?: number }) {
    const db = ctx().db;
    const colmado = await getColmado(db, colmadoId);
    await actualizarVentaDelDia(db, colmadoId, colmado ? await zonaHoraria(db, colmado) : "America/Santo_Domingo", {
      ...(datos.totalVentas !== undefined ? { totalVentas: Number(datos.totalVentas) || 0 } : {}),
      ...(datos.pedidosEntregados !== undefined ? { pedidosEntregados: datos.pedidosEntregados } : {}),
      ...(datos.pedidosCancelados !== undefined ? { pedidosCancelados: datos.pedidosCancelados } : {}),
    }, fecha);
  },

  // Intenciones, productos restringidos y jerga
  async detectarIntencion(mensaje: string) {
    const activas = await ctx().db.select().from(botIntenciones).where(eq(botIntenciones.activo, true)).orderBy(botIntenciones.orden, botIntenciones.id);
    const texto = mensaje.toLowerCase().trim();
    return activas.find((i) => i.codigo !== "fallback" && (i.palabrasClave || []).some((p) => texto.includes(p.toLowerCase())))
      ?? activas.find((i) => i.codigo === "fallback");
  },
  async detectarProductoRestringido(texto: string): Promise<{ restringido: boolean; categoria: string }> {
    const t = texto.toLowerCase();
    const hallado = (await getProductosRestringidos(ctx().db)).find((p) => p.activo && t.includes(p.palabraClave.toLowerCase()));
    return hallado ? { restringido: true, categoria: hallado.categoria } : { restringido: false, categoria: "" };
  },
  async buscarEnDiccionario(colmadoId: number, texto: string) {
    const t = texto.toLowerCase();
    return (await getDiccionarioByColmado(ctx().db, colmadoId)).filter((e) => t.includes(e.jerga.toLowerCase()));
  },
  async incrementarUsoJerga(id: number) {
    await ctx().db.update(diccionarioJerga).set({ vecesUsado: sql`coalesce(${diccionarioJerga.vecesUsado}, 1) + 1`, ultimoUso: new Date() }).where(eq(diccionarioJerga.id, id));
  },
  async guardarJerga(colmadoId: number, jerga: string, productoIdentificado: string, precioSugerido?: string) {
    const db = ctx().db;
    const clave = jerga.toLowerCase().trim();
    const [existente] = await db.select().from(diccionarioJerga).where(and(eq(diccionarioJerga.colmadoId, colmadoId), eq(diccionarioJerga.jerga, clave)));
    if (existente) {
      await db.update(diccionarioJerga).set({
        productoIdentificado, precioSugerido: precioSugerido || existente.precioSugerido,
        vecesUsado: (existente.vecesUsado || 1) + 1, ultimoUso: new Date(),
      }).where(eq(diccionarioJerga.id, existente.id));
      return { ...existente, productoIdentificado, vecesUsado: (existente.vecesUsado || 1) + 1 };
    }
    const [nueva] = await db.insert(diccionarioJerga).values({ colmadoId, jerga: clave, productoIdentificado, precioSugerido, vecesUsado: 1 }).returning();
    return nueva;
  },
  // ---------- Generación con IA (panel de plataforma) ----------
  getUserById: (id: string) => getUserById(ctx().db, id),
  getTiposNegocio: () => getTiposNegocio(ctx().db),
  getPlantillasByTipoNegocio: (tipoNegocio: string) => getPlantillasByTipoNegocio(ctx().db, tipoNegocio),
  /** Rechaza una expresión que ya existe para ese tipo (y país); el motor la salta como duplicada, igual que el original. */
  async createPlantillaJerga(data: any) {
    const jerga = String(data.jerga ?? "").slice(0, 120);
    const repetida = await ctx().db.select({ id: plantillasJerga.id }).from(plantillasJerga).where(and(
      eq(plantillasJerga.tipoNegocio, String(data.tipoNegocio)), eq(plantillasJerga.jerga, jerga),
      data.paisId ? eq(plantillasJerga.paisId, Number(data.paisId)) : isNull(plantillasJerga.paisId),
    )).limit(1);
    if (repetida.length) throw new Error("Jerga repetida");
    return crearPlantillaJerga(data);
  },
  /** Guarda la plantilla generada: categorías y productos van en un solo batch (todo o nada). */
  async crearPlantillasDesdeIA(tipoNegocio: string, categorias: Array<{ nombre: string; orden: number; productos: Array<{ nombre: string; precioSugerido: unknown; orden: number }> }>) {
    const db = ctx().db;
    const [{ siguiente }] = await db.select({ siguiente: sql<number>`coalesce(max(${menuPlantillas.id}), 0) + 1` }).from(menuPlantillas);
    const precio = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? String(Number(v)) : "0");
    const filas = categorias.slice(0, 12).map((c, i) => ({
      plantilla: { id: siguiente + i, tipoNegocio, categoria: String(c.nombre).slice(0, 80), orden: Number.isInteger(c.orden) ? c.orden : i + 1, activo: true },
      items: (c.productos || []).filter((p) => p && p.nombre).slice(0, 20).map((p, j) => ({
        plantillaId: siguiente + i, nombre: String(p.nombre).slice(0, 120), precioSugerido: precio(p.precioSugerido), orden: Number.isInteger(p.orden) ? p.orden : j + 1, activo: true,
      })),
    }));
    const items = filas.flatMap((f) => f.items);
    await db.batch([
      db.insert(menuPlantillas).values(filas.map((f) => f.plantilla)),
      ...chunkRows(items, 6).map((lote) => db.insert(menuPlantillaItems).values(lote)),
    ] as any);
    return getPlantillasByTipoNegocio(db, tipoNegocio);
  },
};
