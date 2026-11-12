import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  chatWebMensajes, chatWebSesiones, conocimientoArchivos, mensajesSistema, pedidos, whatsappConversaciones, zipAlertaEventos,
  type ChatWebSesion,
} from "@shared/schema";
import type { Env } from "../env";
import type { Db } from "../db";
import { enviarWhatsApp, urlPublica } from "../lib/mensajeria";
import { credencialesMeta, enviarPlantillaMeta } from "../lib/whatsapp";
import { enrichColmadoWithMoneda as conMoneda, getColmado, getColmadoTimezone as zonaHoraria, getPais } from "../storage/colmados";
import { getConfiguracion, getMetodosPago, upsertConfiguracion } from "../storage/catalogos";
import { getDiccionarioByColmado, getMenuProductos } from "../storage/menu";
import {
  addChatWebMensaje, getChatWebSession, getOrCreateConversacion, updateChatWebSession,
} from "../storage/conversaciones";
import {
  createPedido, getDeliveryById, getPedidoById, getPedidosByClienteWhatsapp, leerProductos, updateMetodoPago, updatePedidoEstado, updateVuelto,
} from "../storage/pedidos";
import { getPlantillaZip } from "../routes/plataforma";

// Puente entre el motor del chat (código del servidor original) y Cloudflare:
// la base de datos D1, el cliente de IA, el envío por WhatsApp y el modo de
// atender peticiones. Cada petición lleva su propio contexto, porque en un
// Worker varias peticiones se intercalan dentro del mismo proceso.

type Contexto = { env: Env; db: Db; origen: string; manejadores: Map<string, Manejador>; pendientes: Promise<unknown>[] };
type Manejador = (req: any, res: any) => any;
const contexto = new AsyncLocalStorage<Contexto>();

function ctx(): Contexto {
  const actual = contexto.getStore();
  if (!actual) throw new Error("El motor del chat se usó fuera de una petición");
  return actual;
}

// ---------- Peticiones: de Hono al estilo que espera el motor ----------

export type AppLike = { get: (ruta: string, h: Manejador) => void; post: (ruta: string, h: Manejador) => void };

class Respuesta {
  codigo = 200;
  cuerpo: unknown = undefined;
  enviada = false;
  status(codigo: number) { this.codigo = codigo; return this; }
  json(cuerpo: unknown) {
    if (!this.enviada) { this.cuerpo = cuerpo; this.enviada = true; }
    return this;
  }
}

export type Resultado = { status: number; body: unknown };

/** Ejecuta un manejador del motor con el contexto de la petición y devuelve su respuesta. */
export async function ejecutar(
  base: Pick<Contexto, "env" | "db" | "origen"> & { pendientes?: Promise<unknown>[] }, manejadores: Map<string, Manejador>, ruta: string, req: { body?: any; params?: any; query?: any },
): Promise<Resultado> {
  const manejador = manejadores.get(ruta);
  if (!manejador) return { status: 404, body: { error: "Ruta no encontrada" } };
  const res = new Respuesta();
  const pendientes = base.pendientes ?? [];
  await contexto.run({ ...base, manejadores, pendientes }, () => manejador({ body: req.body ?? {}, params: req.params ?? {}, query: req.query ?? {} }, res));
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

export const enrichColmadoWithMoneda = (colmado: any) => conMoneda(ctx().db, colmado);
export const getColmadoTimezone = (colmado: any) => zonaHoraria(ctx().db, colmado);
export const getPublicRequestOrigin = (_req: unknown) => urlPublica(ctx().env, ctx().origen);

// ---------- Base de datos: los mismos nombres que usaba el servidor original ----------

const dinero = (v: unknown) => String(v);

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
};
