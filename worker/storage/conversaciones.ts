import { and, desc, eq, sql } from "drizzle-orm";
import {
  clientes, whatsappConversaciones, whatsappMensajes, chatWebSesiones, chatWebMensajes, pedidos,
  type Cliente, type WhatsappConversacion, type ChatWebSesion,
} from "@shared/schema";
import type { Db } from "../db";
import { mismoTelefono } from "../lib/telefono";

// ---------- Clientes (datos permanentes, sobreviven al borrar conversaciones) ----------

export async function getClienteById(db: Db, id: number): Promise<Cliente | undefined> {
  const [row] = await db.select().from(clientes).where(eq(clientes.id, id));
  return row;
}

export async function getClienteByWhatsapp(db: Db, colmadoId: number, whatsapp: string): Promise<Cliente | undefined> {
  const [row] = await db.select().from(clientes)
    .where(and(eq(clientes.colmadoId, colmadoId), mismoTelefono(clientes.whatsappNumero, whatsapp)));
  return row;
}

export async function getClientesByColmado(db: Db, colmadoId: number): Promise<Cliente[]> {
  return db.select().from(clientes).where(eq(clientes.colmadoId, colmadoId)).orderBy(desc(clientes.ultimaActualizacion));
}

/** Crea el cliente o completa sus datos; la dirección guardada no se sobreescribe. */
export async function getOrCreateCliente(
  db: Db,
  colmadoId: number,
  whatsapp: string,
  data: { nombre?: string; direccionTexto?: string; latitud?: string; longitud?: string } = {},
): Promise<Cliente> {
  const existing = await getClienteByWhatsapp(db, colmadoId, whatsapp);
  if (existing) {
    const update: Partial<typeof clientes.$inferInsert> = {};
    if (data.nombre) update.nombre = data.nombre;
    if (data.direccionTexto && !existing.direccionTexto) update.direccionTexto = data.direccionTexto;
    if (data.latitud && !existing.latitud) update.latitud = data.latitud;
    if (data.longitud && !existing.longitud) update.longitud = data.longitud;
    if (!Object.keys(update).length) return existing;
    const [updated] = await db.update(clientes).set({ ...update, ultimaActualizacion: new Date() }).where(eq(clientes.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(clientes)
    .values({ colmadoId, whatsappNumero: whatsapp, nombre: data.nombre, direccionTexto: data.direccionTexto, latitud: data.latitud, longitud: data.longitud })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getClienteByWhatsapp(db, colmadoId, whatsapp))!;
}

export async function updateCliente(db: Db, id: number, data: { nombre?: string; direccionTexto?: string }): Promise<void> {
  const update: Partial<typeof clientes.$inferInsert> = { ultimaActualizacion: new Date() };
  if (data.nombre) update.nombre = data.nombre;
  if (data.direccionTexto) update.direccionTexto = data.direccionTexto;
  await db.update(clientes).set(update).where(eq(clientes.id, id));
}

// ---------- Conversaciones de WhatsApp ----------

export async function getConversacionByCliente(db: Db, colmadoId: number, whatsapp: string): Promise<WhatsappConversacion | undefined> {
  const [row] = await db.select().from(whatsappConversaciones)
    .where(and(eq(whatsappConversaciones.colmadoId, colmadoId), mismoTelefono(whatsappConversaciones.clienteWhatsapp, whatsapp)));
  return row;
}

export async function getOrCreateConversacion(db: Db, colmadoId: number, whatsapp: string, clienteNombre?: string): Promise<WhatsappConversacion> {
  const existing = await getConversacionByCliente(db, colmadoId, whatsapp);
  if (existing) {
    if (clienteNombre && clienteNombre !== existing.clienteNombre) {
      const [updated] = await db.update(whatsappConversaciones).set({ clienteNombre }).where(eq(whatsappConversaciones.id, existing.id)).returning();
      return updated;
    }
    return existing;
  }
  // Cliente que regresa: recuperar su nombre y dirección del último pedido.
  let nombre = clienteNombre;
  let direccion: string | undefined;
  if (!clienteNombre?.trim() || clienteNombre === "Cliente") {
    const [ultimo] = await db.select().from(pedidos)
      .where(and(eq(pedidos.colmadoId, colmadoId), mismoTelefono(pedidos.clienteWhatsapp, whatsapp)))
      .orderBy(desc(pedidos.fechaCreacion)).limit(1);
    if (ultimo?.clienteNombre && ultimo.clienteNombre !== "Cliente") {
      nombre = ultimo.clienteNombre;
      direccion = ultimo.clienteUbicacion || undefined;
    }
  }
  const [created] = await db.insert(whatsappConversaciones)
    .values({ colmadoId, clienteWhatsapp: whatsapp, clienteNombre: nombre, direccionTexto: direccion })
    .returning();
  return created;
}

export async function updateConversacion(
  db: Db,
  id: number,
  data: { clienteNombre?: string; direccionTexto?: string; latitud?: string; longitud?: string; ultimoPedidoEstado?: string; sesionActiva?: boolean },
): Promise<void> {
  const update = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ""));
  if (Object.keys(update).length) await db.update(whatsappConversaciones).set(update).where(eq(whatsappConversaciones.id, id));
}

const ESTADOS_TERMINALES = ["entregado", "cancelado", "retorno", "fusionado"];

export async function updateConversacionPedidoEstado(db: Db, id: number, estado: string): Promise<void> {
  await db.update(whatsappConversaciones)
    .set({ ultimoPedidoEstado: estado, ...(ESTADOS_TERMINALES.includes(estado) ? { sesionActiva: false } : {}) })
    .where(eq(whatsappConversaciones.id, id));
}

export async function cerrarSesionConversacion(db: Db, id: number): Promise<void> {
  await db.update(whatsappConversaciones).set({ sesionActiva: false }).where(eq(whatsappConversaciones.id, id));
}

/** Guarda un mensaje. Los del cliente reabren la sesión y cuentan como no leídos. */
export async function addMensaje(db: Db, conversacionId: number, rol: string, contenido: string): Promise<void> {
  const now = new Date();
  const esCliente = rol === "user" || rol === "cliente";
  await db.batch([
    db.insert(whatsappMensajes).values({ conversacionId, rol, contenido }),
    db.update(whatsappConversaciones)
      .set(esCliente
        ? { ultimoMensaje: now, ultimoMensajeCliente: now, sesionActiva: true, noLeidosColmado: sql`${whatsappConversaciones.noLeidosColmado} + 1` }
        : { ultimoMensaje: now })
      .where(eq(whatsappConversaciones.id, conversacionId)),
  ]);
}

// ---------- Chat web ----------

export async function getChatWebSession(db: Db, sessionId: string): Promise<ChatWebSesion | undefined> {
  const [row] = await db.select().from(chatWebSesiones).where(eq(chatWebSesiones.sessionId, sessionId));
  return row;
}

async function ultimaSesion(db: Db, where: ReturnType<typeof eq>): Promise<ChatWebSesion | undefined> {
  const [row] = await db.select().from(chatWebSesiones).where(where).orderBy(desc(chatWebSesiones.fechaUltimaActividad)).limit(1);
  return row;
}

export const getChatWebSessionByPedidoId = (db: Db, pedidoId: number) => ultimaSesion(db, eq(chatWebSesiones.pedidoId, pedidoId));
export const getChatWebSessionByConversacionId = (db: Db, conversacionId: number) =>
  ultimaSesion(db, eq(chatWebSesiones.conversacionId, conversacionId));
export async function getChatWebSessionByWhatsapp(db: Db, colmadoId: number, whatsapp: string): Promise<ChatWebSesion | undefined> {
  const [row] = await db.select().from(chatWebSesiones)
    .where(and(eq(chatWebSesiones.colmadoId, colmadoId), mismoTelefono(chatWebSesiones.clienteWhatsapp, whatsapp)))
    .orderBy(desc(chatWebSesiones.fechaUltimaActividad)).limit(1);
  return row;
}

/** Busca la sesión de chat web de un pedido por pedido, conversación o teléfono. */
export async function buscarChatWebDelPedido(db: Db, pedido: { id: number; colmadoId: number; clienteWhatsapp: string }) {
  const porPedido = await getChatWebSessionByPedidoId(db, pedido.id);
  if (porPedido) return porPedido;
  const conversacion = await getConversacionByCliente(db, pedido.colmadoId, pedido.clienteWhatsapp);
  if (conversacion) {
    const porConversacion = await getChatWebSessionByConversacionId(db, conversacion.id);
    if (porConversacion) return porConversacion;
  }
  return getChatWebSessionByWhatsapp(db, pedido.colmadoId, pedido.clienteWhatsapp);
}

export async function updateChatWebSession(db: Db, sessionId: string, data: Partial<typeof chatWebSesiones.$inferInsert>): Promise<void> {
  await db.update(chatWebSesiones).set({ ...data, fechaUltimaActividad: new Date() }).where(eq(chatWebSesiones.sessionId, sessionId));
}

/** Mensaje en el chat web; si la sesión tiene conversación, también se guarda allí. */
export async function addChatWebMensaje(db: Db, sessionId: string, rol: string, contenido: string): Promise<void> {
  await db.batch([
    db.insert(chatWebMensajes).values({ sessionId, rol, contenido }),
    db.update(chatWebSesiones).set({ fechaUltimaActividad: new Date() }).where(eq(chatWebSesiones.sessionId, sessionId)),
  ]);
  const session = await getChatWebSession(db, sessionId);
  if (session?.conversacionId) await addMensaje(db, session.conversacionId, rol === "user" ? "cliente" : "negocio", contenido);
}

// ---------- Panel de conversaciones ----------

export async function getConversacionById(db: Db, id: number): Promise<WhatsappConversacion | undefined> {
  if (!Number.isInteger(id)) return undefined;
  const [row] = await db.select().from(whatsappConversaciones).where(eq(whatsappConversaciones.id, id));
  return row;
}

export async function getConversaciones(db: Db, colmadoId: number, estado?: string): Promise<WhatsappConversacion[]> {
  return db.select().from(whatsappConversaciones)
    .where(estado
      ? and(eq(whatsappConversaciones.colmadoId, colmadoId), eq(whatsappConversaciones.ultimoPedidoEstado, estado))
      : eq(whatsappConversaciones.colmadoId, colmadoId))
    .orderBy(desc(whatsappConversaciones.ultimoMensaje), desc(whatsappConversaciones.id));
}

export async function contarNoLeidas(db: Db, colmadoId: number): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(whatsappConversaciones)
    .where(and(eq(whatsappConversaciones.colmadoId, colmadoId), sql`${whatsappConversaciones.noLeidosColmado} > 0`));
  return Number(row?.total || 0);
}

export async function getMensajes(db: Db, conversacionId: number, limite: number) {
  return db.select().from(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, conversacionId))
    .orderBy(desc(whatsappMensajes.fechaEnvio), desc(whatsappMensajes.id)).limit(limite);
}

export async function getUltimoMensajeCliente(db: Db, conversacionId: number) {
  const [row] = await db.select().from(whatsappMensajes)
    .where(and(eq(whatsappMensajes.conversacionId, conversacionId), sql`${whatsappMensajes.rol} in ('user', 'cliente')`))
    .orderBy(desc(whatsappMensajes.fechaEnvio), desc(whatsappMensajes.id)).limit(1);
  return row;
}

export async function marcarConversacionLeida(db: Db, id: number): Promise<void> {
  await db.update(whatsappConversaciones).set({ noLeidosColmado: 0 }).where(eq(whatsappConversaciones.id, id));
}

/**
 * Borra la conversación con sus mensajes y sus sesiones de chat web en un solo
 * batch. Antes se asegura de que el cliente quede en la tabla permanente.
 */
export async function deleteConversacion(db: Db, conversacion: WhatsappConversacion): Promise<void> {
  await getOrCreateCliente(db, conversacion.colmadoId, conversacion.clienteWhatsapp, {
    nombre: conversacion.clienteNombre ?? undefined, direccionTexto: conversacion.direccionTexto ?? undefined,
    latitud: conversacion.latitud ?? undefined, longitud: conversacion.longitud ?? undefined,
  });
  const id = conversacion.id;
  await db.batch([
    db.delete(chatWebMensajes).where(sql`${chatWebMensajes.sessionId} in (select session_id from chat_web_sesiones where conversacion_id = ${id})`),
    db.delete(chatWebSesiones).where(eq(chatWebSesiones.conversacionId, id)),
    db.delete(whatsappMensajes).where(eq(whatsappMensajes.conversacionId, id)),
    db.delete(whatsappConversaciones).where(eq(whatsappConversaciones.id, id)),
  ]);
}

/** Mensajes enviados y recibidos del negocio, con consultas agregadas (el original recorría cada conversación). */
export async function getAnalyticsMensajes(db: Db, colmadoId: number, desde?: Date, hasta?: Date) {
  const rango = and(
    eq(whatsappConversaciones.colmadoId, colmadoId),
    ...(desde ? [sql`${whatsappMensajes.fechaEnvio} >= ${desde.getTime()}`] : []),
    ...(hasta ? [sql`${whatsappMensajes.fechaEnvio} <= ${hasta.getTime()}`] : []),
  );
  const hace24h = Date.now() - 24 * 60 * 60 * 1000;
  const [porRol, [activas], [total]] = await Promise.all([
    db.select({ rol: whatsappMensajes.rol, n: sql<number>`count(*)` }).from(whatsappMensajes)
      .innerJoin(whatsappConversaciones, eq(whatsappConversaciones.id, whatsappMensajes.conversacionId))
      .where(rango).groupBy(whatsappMensajes.rol),
    db.select({ n: sql<number>`count(distinct ${whatsappMensajes.conversacionId})` }).from(whatsappMensajes)
      .innerJoin(whatsappConversaciones, eq(whatsappConversaciones.id, whatsappMensajes.conversacionId))
      .where(and(eq(whatsappConversaciones.colmadoId, colmadoId), sql`${whatsappMensajes.rol} in ('user', 'cliente')`, sql`${whatsappMensajes.fechaEnvio} >= ${hace24h}`)),
    db.select({ n: sql<number>`count(*)` }).from(whatsappConversaciones).where(eq(whatsappConversaciones.colmadoId, colmadoId)),
  ]);
  const cuenta = (...roles: string[]) => porRol.filter((r) => roles.includes(r.rol)).reduce((s, r) => s + Number(r.n), 0);
  return {
    mensajesEnviados: cuenta("assistant", "negocio"), mensajesRecibidos: cuenta("user", "cliente"),
    conversacionesActivas: Number(activas?.n || 0), conversacionesTotal: Number(total?.n || 0),
  };
}
