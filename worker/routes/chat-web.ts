import { Hono, type Context } from "hono";
import type { MenuProducto } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { permitirEvento } from "../lib/rate-limit";
import { soloDigitos } from "../lib/telefono";
import { enrichColmadoWithMoneda, getPais } from "../storage/colmados";
import { getCategorias, getMenuProductos, tieneMenuPermitido } from "../storage/menu";
import { getPedidosByClienteWhatsapp, getPedidosByColmado } from "../storage/pedidos";
import { getColmadoByCodigo } from "./menu-grafico";
import { ejecutar, type AppLike } from "../chat/adaptador";
import { registrarChatWeb } from "../chat/motor";

// Chat web público: la página donde el cliente pide conversando con el bot.
// La conversación con IA (sesión, mensajes, voz, ubicación, comprobante) corre
// en worker/chat/motor.ts, que es el código del servidor original.
export const chatWebRoutes = new Hono<AppEnv>();

// ---------- Datos del negocio para la página ----------

chatWebRoutes.get("/api/chat-web/colmado/:codigo", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "Negocio no encontrado" }, 404);
  const pais = colmado.paisId ? await getPais(db, colmado.paisId) : undefined;
  return c.json({
    id: colmado.id, nombre: colmado.nombre, logo: colmado.logo, colorPrimario: colmado.colorPrimario,
    whatsappNumero: colmado.whatsappNumero, direccion: colmado.direccion, tipoNegocio: colmado.tipoNegocio,
    etiquetaEstado: pais?.etiquetaEstado ?? "Provincia",
    etiquetaCodigoPostal: pais?.etiquetaCodigoPostal ?? null,
    requiereCodigoPostal: pais?.requiereCodigoPostal ?? false,
    ejemploDireccion: pais?.ejemploDireccion ?? "Calle Principal #123",
    ejemploCiudad: pais?.ejemploCiudad ?? "Santo Domingo",
    ejemploEstado: pais?.ejemploEstado ?? "Distrito Nacional",
    ejemploCodigoPostal: pais?.ejemploCodigoPostal ?? null,
    patronCodigoPostal: pais?.patronCodigoPostal ?? null,
    codigoPais: pais?.codigo ?? "DO",
  });
});

chatWebRoutes.get("/api/chat-web/menu/:codigo", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado || colmado.estado !== "activo") return c.json({ error: "Negocio no encontrado" }, 404);
  const usaMenu = (colmado.tecnologiasHabilitadas as { link_pedido?: boolean } | null)?.link_pedido === true || tieneMenuPermitido(colmado.tipoNegocio);
  const productosPorCategoria: Record<string, MenuProducto[]> = {};
  let categorias: string[] = [];
  if (usaMenu) {
    const [todos, cats] = await Promise.all([getMenuProductos(db, colmado.id), getCategorias(db, colmado.id)]);
    categorias = cats;
    const disponibles = todos.filter((p) => p.disponible && (p.inventario === null || p.inventario === undefined || p.inventario > 0));
    for (const cat of categorias) productosPorCategoria[cat] = disponibles.filter((p) => p.categoria === cat);
  }
  const { simboloMoneda } = await enrichColmadoWithMoneda(db, colmado);
  return c.json({ usaMenu, tieneMenu: usaMenu, simboloMoneda: simboloMoneda || "RD$", categorias, productosPorCategoria });
});

/** ¿Este número tiene un pedido en curso (o entregado hace menos de 4 horas)? */
chatWebRoutes.get("/api/chat-web/check-pedido", async (c) => {
  const colmadoId = Number(c.req.query("colmadoId"));
  const digitos = soloDigitos(c.req.query("whatsapp") ?? "");
  if (!Number.isInteger(colmadoId) || digitos.length < 7) return c.json({ error: "colmadoId y whatsapp son requeridos" }, 400);
  const db = getDb(c.env.DB);
  let lista = await getPedidosByClienteWhatsapp(db, colmadoId, digitos);
  if (!lista.length) {
    // El número puede estar guardado con o sin el código de país.
    const sufijo = digitos.length > 10 ? digitos.slice(-10) : digitos;
    lista = (await getPedidosByColmado(db, colmadoId)).filter((p) => soloDigitos(p.clienteWhatsapp || "").endsWith(sufijo));
  }
  const ACTIVOS = ["pendiente", "en_preparacion", "listo", "pendiente_confirmacion", "esperando_pago", "en_camino", "llegando"];
  const corte = Date.now() - 4 * 3_600_000;
  const activo = lista.find((p) => ACTIVOS.includes(p.estado) || (p.estado === "entregado" && p.fechaCreacion.getTime() >= corte));
  if (!activo) return c.json({ pedido: null });
  return c.json({
    pedido: {
      id: activo.id, estado: activo.estado, productos: activo.productos, total: activo.total, metodoPago: activo.metodoPago,
      fechaCreacion: activo.fechaCreacion, necesitaDevuelta: activo.necesitaDevuelta, motivoRetorno: activo.motivoRetorno,
    },
  });
});

// ---------- Conversación con el bot (motor original) ----------

const manejadores = new Map<string, (req: any, res: any) => any>();
const registro: AppLike = {
  get: (ruta: string, ...h: unknown[]) => void manejadores.set(`GET ${ruta}`, h.at(-1) as any),
  post: (ruta: string, ...h: unknown[]) => void manejadores.set(`POST ${ruta}`, h.at(-1) as any),
};
registrarChatWeb(registro);

const MINUTO = 60_000;

async function conMotor(c: Context<AppEnv>, clave: string, body?: unknown) {
  const base = { env: c.env, db: getDb(c.env.DB), origen: new URL(c.req.url).origin };
  const r = await ejecutar(base, manejadores, clave, { body, params: c.req.param(), query: c.req.query() });
  return c.json(r.body as any, r.status as any);
}

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

/**
 * Estas rutas son públicas y cada mensaje llama a la IA, que cuesta dinero.
 * El original no tenía ningún tope; aquí se limita por IP y por sesión.
 */
async function dentroDelLimite(c: Context<AppEnv>, clave: string, maximo: number, ventanaMs: number): Promise<boolean> {
  return permitirEvento(getDb(c.env.DB), clave, maximo, ventanaMs);
}
const demasiados = (c: Context<AppEnv>) => c.json({ error: "Demasiados mensajes seguidos. Espera un momento e intenta de nuevo.", reason: "rate_limited" }, 429);
const ipDe = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") ?? "sin-ip";

chatWebRoutes.post("/api/chat-web/session", async (c) => {
  const body = await cuerpo(c);
  body.colmadoId = Number(body.colmadoId) || undefined;
  if (body.clienteNombre !== undefined) body.clienteNombre = String(body.clienteNombre).slice(0, 120);
  if (body.clienteWhatsapp !== undefined) body.clienteWhatsapp = String(body.clienteWhatsapp).slice(0, 30);
  if (!(await dentroDelLimite(c, `chat-sesion:${ipDe(c)}`, 30, 60 * MINUTO))) return demasiados(c);
  return conMotor(c, "POST /api/chat-web/session", body);
});

chatWebRoutes.post("/api/chat-web/message", async (c) => {
  const body = await cuerpo(c);
  if (typeof body.sessionId !== "string" || typeof body.mensaje !== "string" || !body.mensaje.trim()) {
    return c.json({ error: "sessionId y mensaje requeridos" }, 400);
  }
  if (body.mensaje.length > 1500) return c.json({ error: "El mensaje es demasiado largo. Escríbelo en partes más cortas." }, 400);
  if (!(await dentroDelLimite(c, `chat-msg:${body.sessionId.slice(0, 80)}`, 40, 10 * MINUTO))
    || !(await dentroDelLimite(c, `chat-ip:${ipDe(c)}`, 200, 10 * MINUTO))) return demasiados(c);
  return conMotor(c, "POST /api/chat-web/message", { sessionId: body.sessionId, mensaje: body.mensaje });
});

chatWebRoutes.post("/api/chat-web/voice-message", async (c) => {
  const body = await cuerpo(c);
  if (typeof body.sessionId !== "string" || typeof body.audioData !== "string") return c.json({ error: "Datos requeridos" }, 400);
  // Unos 3 MB de audio (cerca de 3 minutos): más que eso no es una nota de voz para pedir.
  if (body.audioData.length > 4_200_000) return c.json({ error: "La nota de voz es demasiado larga. Graba una más corta." }, 413);
  if (!(await dentroDelLimite(c, `chat-voz:${body.sessionId.slice(0, 80)}`, 10, 10 * MINUTO))
    || !(await dentroDelLimite(c, `chat-ip:${ipDe(c)}`, 200, 10 * MINUTO))) return demasiados(c);
  return conMotor(c, "POST /api/chat-web/voice-message", { sessionId: body.sessionId, audioData: body.audioData });
});

chatWebRoutes.post("/api/chat-web/location", async (c) => {
  const body = await cuerpo(c);
  const lat = Number(body.latitude);
  const lon = Number(body.longitude);
  if (typeof body.sessionId !== "string" || body.latitude === undefined || body.longitude === undefined) {
    return c.json({ error: "sessionId, latitude y longitude requeridos" }, 400);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return c.json({ error: "Ubicación inválida" }, 400);
  return conMotor(c, "POST /api/chat-web/location", { ...body, latitude: lat, longitude: lon });
});

chatWebRoutes.post("/api/chat-web/comprobante", async (c) => {
  const body = await cuerpo(c);
  // Solo se acepta un archivo subido a este mismo servidor (el original guardaba cualquier dirección).
  if (typeof body.comprobanteUrl !== "string" || !/^\/uploads\/comprobantes\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(body.comprobanteUrl)) {
    return c.json({ error: "Comprobante inválido. Sube la imagen de nuevo." }, 400);
  }
  return conMotor(c, "POST /api/chat-web/comprobante", { sessionId: body.sessionId, comprobanteUrl: body.comprobanteUrl });
});

chatWebRoutes.get("/api/chat-web/session/:sessionId", (c) => conMotor(c, "GET /api/chat-web/session/:sessionId"));
