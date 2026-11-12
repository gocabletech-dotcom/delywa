// Motor del chat web con IA.
//
// Este archivo es el código del servidor original (server/routes.ts, bloque
// "CHAT WEB PÚBLICO") trasladado casi literal para conservar exactamente el
// comportamiento del bot: mismas reglas, mismos textos, mismo prompt. Lo que
// cambia está en chat/adaptador.ts: la base de datos (D1), el envío por
// WhatsApp, el cliente de IA y la forma de recibir y responder peticiones.
// Las correcciones puntuales están marcadas con "DELYWA:".
/* eslint-disable */
import { checkZipFormat, type ZipCheckResult } from "../lib/zipValidation";
import { resolveDeliveryAddress, needsSavedAddress } from "../lib/deliveryAddress";
import { parseCoordinatePair } from "../lib/orderDistance";
import { geocodificarDireccion, extraerCoordenadas } from "../lib/routeOptimizer";
import { stripInternalAddressContext } from "@shared/visible-message";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { toFile } from "openai";
import {
  storage, openai, openaiWhisper, sendWhatsAppMessageSmart, sendZipAlertMetaTemplate, enrichColmadoWithMoneda,
  getColmadoTimezone, getPublicRequestOrigin, llamarInterno, enSegundoPlano, type AppLike,
} from "./adaptador";

const BANK_ACCOUNT_PATTERNS = [
  /cuenta[:\s]*[\d\-]{8,}/i,
  /cta[:\s]*[\d\-]{8,}/i,
  /n[uú]mero de cuenta[:\s]*[\d\-]+/i,
  /transferir a[:\s]*[\d\-]{10,}/i,
  /banco[:\s]*[\w\s]+[:\s]*[\d\-]{10,}/i
];

function detectBankAccount(text: string): boolean {
  return BANK_ACCOUNT_PATTERNS.some(pattern => pattern.test(text));
}

function detectBankAccountOutbound(text: string): boolean {
  if (BANK_ACCOUNT_PATTERNS.some(pattern => pattern.test(text))) {
    return true;
  }
  const longNumeric = /\b\d{10,20}\b/;
  if (longNumeric.test(text)) {
    const phonePatterns = /\b(\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/;
    if (phonePatterns.test(text)) {
      return false;
    }
    return true;
  }
  return false;
}

function filterBankAccountFromMessage(text: string): string {
  let filtered = text;
  BANK_ACCOUNT_PATTERNS.forEach(pattern => {
    filtered = filtered.replace(pattern, "[cuenta oculta por seguridad]");
  });
  return filtered;
}

// ---- ZIP validation helper ----
// Async wrapper that fetches the pais record from the DB and delegates to the
// pure `checkZipFormat` function from server/zipValidation.ts.
// Fails open on DB errors so transient failures never silently block orders.

export async function validarZipEnDireccion(
  paisId: number | null | undefined,
  direccionTexto: string
): Promise<ZipCheckResult> {
  if (!paisId) return { zipOk: true };
  let pais: any;
  try {
    pais = await storage.getPais(paisId);
  } catch {
    // Cannot determine if ZIP is required — fail open to avoid blocking on DB errors.
    return { zipOk: true };
  }
  return checkZipFormat(pais, direccionTexto);
}
// ---- End ZIP validation helper ----


const ZIP_ALERT_THRESHOLD_CONFIG_KEY = "zip_alert_threshold_per_hour";
const ZIP_ALERT_META_TEMPLATE_NAME_CONFIG_KEY = "zip_alert_meta_template_name";
const ZIP_ALERT_META_TEMPLATE_LANGUAGE_CONFIG_KEY = "zip_alert_meta_template_language";
const ZIP_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const DEFAULT_ZIP_ALERT_THRESHOLD = 5;
// These defaults must match approved templates in the Meta Business account.
// They can be overridden through the system configuration table or env vars.
const DEFAULT_ZIP_ALERT_META_TEMPLATE_NAME = "zip_alert_operativo";
const DEFAULT_ZIP_ALERT_META_TEMPLATE_LANGUAGE = "es_ES";


function parseZipAlertThreshold(value: string | null | undefined): number {
  const threshold = Number.parseInt(value || "", 10);
  return Number.isInteger(threshold) && threshold > 0
    ? threshold
    : DEFAULT_ZIP_ALERT_THRESHOLD;
}

function zipAlertCooldownConfigKey(colmadoId: number): string {
  return `zip_alert_last_notified_${colmadoId}`;
}


const zipAlertNotificationLocks = new Map<number, Promise<void>>();

async function notifyOwnerIfZipAlertThresholdReached(
  colmado: any,
  count: number
): Promise<void> {
  if (!colmado?.whatsappNumero) return;

  const thresholdConfig = await storage.getConfiguracion(ZIP_ALERT_THRESHOLD_CONFIG_KEY);
  const threshold = parseZipAlertThreshold(thresholdConfig?.valor);
  if (count < threshold) return;

  const colmadoId = Number(colmado.id);
  const previous = zipAlertNotificationLocks.get(colmadoId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(async () => {
      const cooldownConfig = await storage.getConfiguracion(zipAlertCooldownConfigKey(colmadoId));
      const lastNotifiedAt = Number(cooldownConfig?.valor);
      if (Number.isFinite(lastNotifiedAt) && Date.now() - lastNotifiedAt < ZIP_ALERT_COOLDOWN_MS) {
        return;
      }

      const mensaje = [
        "⚠️ *Alerta de código postal*",
        "",
        `El guardián de ZIP detectó ${count} direcciones sin un código postal válido en la última hora.`,
        "Esto podría indicar una regresión en el prompt del bot. Revisa el flujo de direcciones y la configuración del país.",
      ].join("\n");

      // Evolution supports free-form text. Meta requires an approved template
      // for proactive owner alerts because the owner may be outside the
      // customer-service window.
      const enviado = colmado.whatsappProvider === "evolution"
        ? await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, mensaje)
        : await sendZipAlertMetaTemplate(colmado, colmado.whatsappNumero, count);

      // Record the attempt even when the provider rejects it, so a failure
      // cannot cause an outbound retry for every subsequent ZIP event.
      await storage.upsertConfiguracion(
        zipAlertCooldownConfigKey(colmadoId),
        String(Date.now()),
        "Último intento de aviso por exceso de alertas ZIP",
        "numero"
      );
      if (enviado) {
        console.warn(`[ZIP-ALERT] Aviso al negocio enviado para colmadoId=${colmadoId} count=${count}`);
      } else {
        console.warn(`[ZIP-ALERT] Aviso al negocio no enviado para colmadoId=${colmadoId}; cooldown activado`);
      }
    });

  zipAlertNotificationLocks.set(colmadoId, current);
  try {
    await current;
  } finally {
    if (zipAlertNotificationLocks.get(colmadoId) === current) {
      zipAlertNotificationLocks.delete(colmadoId);
    }
  }
}

export async function logZipMissingAlertAndNotify(
  colmado: any,
  canal: string,
  clienteIdentificador: string | null,
  direccionRecibida: string | null
): Promise<void> {
  try {
    await storage.logZipMissingAlert(colmado.id, canal, clienteIdentificador, direccionRecibida);
    const count = await storage.contarZipMissingAlertasEnHoras(colmado.id, 1);
    if (!Number.isFinite(count)) {
      return;
    }
    await notifyOwnerIfZipAlertThresholdReached(colmado, count);
  } catch (err) {
    // ZIP telemetry and its owner notification must never block the customer flow.
    console.error("[ZIP-ALERT] Error checking notification threshold:", err);
  }
}


const CATEGORIAS_BEBIDAS = new Set([
  "bebida", "bebidas", "refresco", "refrescos", "jugo", "jugos",
  "agua", "cerveza", "cervezas", "alcohol", "drink", "drinks",
  "licor", "vino",
]);

function esBebida(producto: any, menuProductos: any[]): boolean {
  if (producto.encontradoEnMenu === false) return false;
  const nombre = (producto.nombre || "").toLowerCase();
  const menuMatch = menuProductos.find((m: any) => {
    const mNombre = (m.nombre || "").toLowerCase();
    return mNombre === nombre || mNombre.includes(nombre) || nombre.includes(mNombre);
  });
  if (!menuMatch) return false;
  return CATEGORIAS_BEBIDAS.has((menuMatch.categoria || "").toLowerCase().trim());
}

type MergeAccion = "merge_all" | "crear_nuevo_por_valor" | "merge_bebidas_only" | "crear_nuevo";
interface MergeEvaluacion {
  accion: MergeAccion;
  valorOriginal: number;
  valorNuevo: number;
  bebidasParaMerge?: any[];
  noBebidasExcluidas?: any[];
}

export function evaluarElegibilidadMerge(
  pedido: any,
  nuevosProductos: any[],
  menuProductos: any[]
): MergeEvaluacion {
  let productosOriginales: any[] = [];
  try {
    productosOriginales = typeof pedido.productos === "string"
      ? JSON.parse(pedido.productos)
      : (pedido.productos || []);
  } catch {}
  const valorOriginal = productosOriginales.reduce((s: number, p: any) => s + (p.monto || 0), 0);
  const valorNuevo = nuevosProductos.reduce((s: number, p: any) => s + (p.monto || 0), 0);

  // Rule #4: only merge orders that are still in pending_confirmation state
  if (pedido.estado !== "pendiente_confirmacion") {
    return { accion: "crear_nuevo", valorOriginal, valorNuevo };
  }

  const WINDOW_MS = 5 * 60 * 1000;
  const ahora = new Date();
  const fechaPedido = pedido.fechaCreacion ? new Date(pedido.fechaCreacion) : ahora;
  const dentroDeVentana = (ahora.getTime() - fechaPedido.getTime()) <= WINDOW_MS;

  if (dentroDeVentana) {
    return valorNuevo <= valorOriginal
      ? { accion: "merge_all", valorOriginal, valorNuevo }
      : { accion: "crear_nuevo_por_valor", valorOriginal, valorNuevo };
  }

  const bebidas = nuevosProductos.filter(p => esBebida(p, menuProductos));
  const noBebidas = nuevosProductos.filter(p => !esBebida(p, menuProductos));

  // Mixed or no-beverages → restriction only (no partial merge)
  if (noBebidas.length > 0 || bebidas.length === 0) {
    return { accion: "crear_nuevo", valorOriginal, valorNuevo, noBebidasExcluidas: noBebidas };
  }

  return { accion: "merge_bebidas_only", valorOriginal, valorNuevo, bebidasParaMerge: bebidas, noBebidasExcluidas: [] };
}

// ---- End merge helpers ----


export function getPalabraDevuelta(codigoPais: string): string {
  return codigoPais === "AR" ? "vuelto" : "devuelta";
}

export function buildOrderStatusMessage(pedido: any, colmado: any, delivery?: any, simbolo: string = "RD$", metodosPago?: any): string {
  const total = parseFloat(pedido.totalConfirmado || pedido.total);
  const negocio = colmado.nombre || "el negocio";
  const tiempoEst = colmado.tiempoEstimado || "20-30 min";
  switch (pedido.estado) {
    case "pendiente_confirmacion":
      return `⏳ *Pedido #${pedido.id}*\n\nTu pedido está siendo revisado por *${negocio}*. Te avisamos cuando lo confirmen.`;
    case "esperando_pago": {
      const metodosDisp: string[] = [];
      if (!metodosPago || metodosPago?.efectivo !== false) metodosDisp.push("💵 Efectivo");
      if (metodosPago?.transferencia) metodosDisp.push("🏦 Transferencia");
      if (metodosPago?.tarjeta) metodosDisp.push("💳 Tarjeta");
      const lista = metodosDisp.length > 0 ? metodosDisp.join("\n") : "💵 Efectivo\n🏦 Transferencia\n💳 Tarjeta";
      return `💰 *Pedido #${pedido.id}*\n\n💰 Total: ${simbolo}${total}\n\nEstamos esperando tu método de pago.\n${lista}`;
    }
    case "esperando_comprobante":
      return `📄 *Pedido #${pedido.id}*\n\n💰 Total: ${simbolo}${total}\n\nEstamos esperando el comprobante de tu transferencia. Envíanos la foto para continuar.`;
    case "esperando_confirmacion_sustituciones":
      return `🔄 *Pedido #${pedido.id}*\n\n*${negocio}* propuso cambios en tu pedido. Por favor revisa y confirma los cambios para continuar.`;
    case "pendiente":
      return `✅ *Pedido #${pedido.id}*\n\nTu pedido está confirmado y lo estamos preparando.\n⏱️ Tiempo estimado: *${tiempoEst}*\n💰 Total: ${simbolo}${total}`;
    case "en_camino": {
      let msg = `🚴 *Pedido #${pedido.id}*\n\n¡Tu pedido va en camino!\n⏱️ Tiempo estimado: *${tiempoEst}*\n💰 Total: ${simbolo}${total}`;
      if (delivery) {
        msg += `\n\n🚴 Delivery: *${delivery.nombre}*`;
        if (delivery.whatsappNumero) msg += ` | ${delivery.whatsappNumero}`;
      }
      return msg;
    }
    case "entregado":
      return `✅ *Pedido #${pedido.id} entregado*\n\n¡Gracias por tu compra! Esperamos que hayas disfrutado tu pedido. 🙏`;
    case "cancelado":
      return `❌ *Pedido #${pedido.id} cancelado*\n\nTu pedido fue cancelado. Si tienes preguntas, no dudes en escribirnos.`;
    default:
      return `📦 *Pedido #${pedido.id}*\n\nEstado: ${pedido.estado}\n💰 Total: ${simbolo}${total}`;
  }
}

export function registrarChatWeb(app: AppLike): void {
  app.post("/api/chat-web/session", async (req, res) => {
    try {
      const { colmadoId, clienteNombre, clienteWhatsapp } = req.body;
      
      if (!colmadoId) {
        return res.status(400).json({ error: "colmadoId requerido" });
      }
      
      const colmado = await storage.getColmado(colmadoId);
      if (!colmado) {
        return res.status(404).json({ error: "Negocio no encontrado" });
      }
      
      // Check if client has previous session data (by WhatsApp)
      let previousClientData: { nombre?: string; direccion?: string; latitud?: string; longitud?: string } = {};
      let isReturningClient = false;
      
      // Helper: given a phone string, return the "alternate" format for backward compat.
      // e.g. "18093502237" → "8093502237" (strip 1-digit country code)
      //      "8093502237"  → "18093502237" (prepend 1)
      const altPhone = (phone: string) => {
        const d = phone.replace(/\D/g, "");
        if (d.length > 10) return d.slice(-10);            // strip country code (last 10 digits)
        if (d.length === 10) return `1${d}`;               // prepend +1 (covers RD / US)
        return d;
      };

      if (clienteWhatsapp) {
        // Try exact match first, then alternate format for backward compat.
        const [exactSesiones, altSesiones] = await Promise.all([
          storage.getChatWebSessionsByWhatsapp(colmadoId, clienteWhatsapp),
          storage.getChatWebSessionsByWhatsapp(colmadoId, altPhone(clienteWhatsapp)),
        ]);
        const todasSesionesExistentes = [...exactSesiones, ...altSesiones]
          .filter((s, i, arr) => arr.findIndex(x => x.sessionId === s.sessionId) === i)
          .sort(
            (a, b) =>
              new Date(b.fechaUltimaActividad).getTime() -
              new Date(a.fechaUltimaActividad).getTime()
          );
        if (todasSesionesExistentes.length > 0) {
          isReturningClient = true;
          const sesionReciente = todasSesionesExistentes[0];
          const sesionConDireccion = todasSesionesExistentes.find(
            s => typeof s.clienteDireccion === "string" && s.clienteDireccion.trim()
          );
          const sesionConUbicacion = todasSesionesExistentes.find(
            s => s.clienteLatitud && s.clienteLongitud
          );
          previousClientData = {
            nombre: sesionReciente.clienteNombre || undefined,
            direccion:
              sesionConDireccion?.clienteDireccion ||
              sesionConUbicacion?.clienteDireccion ||
              sesionReciente.clienteDireccion ||
              undefined,
            latitud: sesionConUbicacion?.clienteLatitud || undefined,
            longitud: sesionConUbicacion?.clienteLongitud || undefined,
          };
        }
      }
      
      // Always create new session (fresh conversation)
      const session = await storage.createChatWebSession(colmadoId, clienteNombre || previousClientData.nombre, clienteWhatsapp);
      
      // If we have previous data, copy it to the new session
      if (previousClientData.direccion || previousClientData.latitud) {
        await storage.updateChatWebSession(session.sessionId, {
          clienteDireccion: previousClientData.direccion,
          clienteLatitud: previousClientData.latitud,
          clienteLongitud: previousClientData.longitud,
        });
      }
      
      // Get conversation history from ALL previous sessions — try both phone formats
      let historialMensajes: any[] = [];
      let carritoGuardado = false;
      let mensajeBienvenida: string | null = null;

      if (clienteWhatsapp) {
        const [todasSesiones, altSesiones] = await Promise.all([
          storage.getChatWebSessionsByWhatsapp(colmadoId, clienteWhatsapp),
          storage.getChatWebSessionsByWhatsapp(colmadoId, altPhone(clienteWhatsapp)),
        ]);
        const todasCombinadas = [...todasSesiones, ...altSesiones].filter(
          (s, i, arr) => arr.findIndex(x => x.sessionId === s.sessionId) === i
        );

        // ── Detect incomplete cart from a recent session (< 24 h) ──────────────
        const VEINTICUATRO_H = 24 * 60 * 60 * 1000;
        const ahora = Date.now();
        const sesionIncompleta = todasCombinadas.find(s => {
          if (s.sessionId === session.sessionId) return false;
          const prods = (s as any).productosCapturados;
          const tieneProds = Array.isArray(prods) && prods.length > 0;
          const sinPedido = !s.pedidoId;
          const reciente = (ahora - new Date(s.fechaCreacion).getTime()) < VEINTICUATRO_H;
          const noTerminada = !["pedido_creado", "finalizada"].includes((s as any).estado || "");
          return tieneProds && sinPedido && reciente && noTerminada;
        });

        if (sesionIncompleta) {
          // Claim and copy atomically. Another tab may have selected the same
          // source from its snapshot; only the request that successfully claims
          // it may offer the saved cart.
          const sesionReclamada = await storage.claimChatWebCart(
            sesionIncompleta.sessionId,
            session.sessionId
          );

          if (sesionReclamada) {
            const prods: Array<{ nombre: string; monto: number | null; cantidad: number | null }> =
              (sesionReclamada as any).productosCapturados || [];
            const monedaSim = (colmado as any).simboloMoneda || "RD$";

            // Build welcome message
            const listaProds = prods
              .map((p: any) => `• ${p.cantidad && p.cantidad > 1 ? `${p.cantidad}x ` : ""}${p.nombre}${p.monto ? ` (${monedaSim}${p.monto})` : ""}`)
              .join("\n");
            mensajeBienvenida = `👋 ¡Hola de nuevo!\n\nTenías esto pendiente en tu pedido:\n${listaProds}\n\n¿Deseas *continuar* con este pedido o prefieres *empezar de nuevo*?`;
            carritoGuardado = true;
            // Save bot message to the new session so the AI has context
            await storage.addChatWebMensaje(session.sessionId, "assistant", mensajeBienvenida);
          }
        }

        // ── Conversation history from all OTHER sessions ──────────────────────
        for (const sesion of todasCombinadas) {
          if (sesion.sessionId !== session.sessionId) {
            const mensajes = await storage.getChatWebMensajes(sesion.sessionId);
            historialMensajes = historialMensajes.concat(mensajes);
          }
        }
        // Sort by date and add prefix to IDs to make them unique (history_ prefix)
        historialMensajes.sort((a, b) => new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime());
        historialMensajes = historialMensajes.map(m => ({
          ...m,
          id: `history_${m.id}`,
          isHistory: true,
        }));
      }
      
      res.json({ 
        sessionId: session.sessionId,
        isReturningClient,
        // The new session may inherit a previous address. Return it explicitly so
        // the structured address helper can prefill every field, including ZIP.
        direccionGuardada: session.clienteDireccion || null,
        historialMensajes,
        carritoGuardado,
        mensajeBienvenida,
      });
    } catch (error) {
      console.error("Error creating chat session:", error);
      res.status(500).json({ error: "Error al crear la sesión" });
    }
  });

  app.post("/api/chat-web/message", async (req, res) => {
    try {
      const { sessionId, mensaje } = req.body;
      
      if (!sessionId || !mensaje) {
        return res.status(400).json({ error: "sessionId y mensaje requeridos" });
      }
      
      let session = await storage.getChatWebSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Sesión no encontrada" });
      }
      
      const colmadoRaw = await storage.getColmado(session.colmadoId);
      if (!colmadoRaw) {
        return res.status(404).json({ error: "Negocio no encontrado" });
      }
      const colmado = await enrichColmadoWithMoneda(colmadoRaw);
      const palabraDevuelta = getPalabraDevuelta((colmado as any).codigoPais || "DO");

      await storage.addChatWebMensaje(sessionId, "user", mensaje);
      
      // Check if this is the first message in the session (for welcome greeting)
      const mensajesPrevios = await storage.getChatWebMensajes(sessionId);
      const esPrimerMensaje = mensajesPrevios.length === 1; // Only the message we just added

      // Last 6 messages BEFORE the current one — used as conversation history for the AI
      const historialParaIA = mensajesPrevios.slice(0, -1).slice(-6);
      
      // Get greeting based on time of day in Dominican Republic
      const getSaludoHora = (): string => {
        const hora = parseInt(new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          hour12: false,
          timeZone: 'America/Santo_Domingo'
        }).format(new Date()));
        
        if (hora >= 6 && hora < 12) {
          return "¡Buenos días!";
        } else if (hora >= 12 && hora < 18) {
          return "¡Buenas tardes!";
        } else {
          return "¡Buenas noches!";
        }
      };
      
      // Get current session state
      const estadoActual = (session as any).estadoConversacion || "inicial";
      let productosGuardados: any[] = (session as any).productosCapturados || [];
      const tieneNombre = !!(session.clienteNombre && session.clienteNombre !== "Cliente");
      const tieneDireccion = !!session.clienteDireccion;
      const tieneWhatsapp = !!session.clienteWhatsapp;
      const tieneProductos = productosGuardados.length > 0;
      
      // Get colmado delivery settings
      const costoDelivery = parseFloat(colmado.costoDelivery ?? "0");
      const monedaSimbolo = (colmado as any).simboloMoneda || "RD$"; // set by enrichColmadoWithMoneda above
      
      // Load system messages from database (NO AI needed for these)
      const msgPreguntaNombre = await storage.getMensajeSistema("pregunta_nombre");
      const msgPreguntaDireccion = await storage.getMensajeSistema("pregunta_direccion");
      const msgOfrecerUbicacion = await storage.getMensajeSistema("ofrecer_ubicacion");
      const msgPreguntaPago = await storage.getMensajeSistema("pregunta_pago");
      
      // Load payment methods with full bank details (no Meta restrictions in web chat)
      const metodosPagoConfig = await storage.getMetodosPago(colmado.id);
      const metodosHabilitados: string[] = [];
      if (metodosPagoConfig?.efectivo !== false) metodosHabilitados.push("💵 Efectivo");
      if (metodosPagoConfig?.transferencia) metodosHabilitados.push("🏦 Transferencia");
      if (metodosPagoConfig?.tarjeta) metodosHabilitados.push("💳 Tarjeta (POS)");
      
      // Build complete bank details for web chat (no restrictions like WhatsApp)
      let datosBancarios = "";
      if (metodosPagoConfig?.transferencia && metodosPagoConfig.bancos?.length) {
        datosBancarios = "\n\n📋 *Cuentas para transferencia:*";
        metodosPagoConfig.bancos.forEach((banco: any) => {
          datosBancarios += `\n• ${banco.nombre}: ${banco.numeroCuenta}`;
          if (banco.tipoCuenta) datosBancarios += ` (${banco.tipoCuenta})`;
          if (banco.titular) datosBancarios += `\n  Titular: ${banco.titular}`;
        });
      }
      
      // Check for pending orders
      // ALWAYS check for existing orders waiting for payment, especially when customer mentions payment method
      let pedidoEsperandoPago: any = null;
      
      // Detect if the message contains payment keywords - if so, we should check for pending orders
      const mensajeTemporal = mensaje.toLowerCase().trim();
      const contieneMetodoPago = ["efectivo", "cash", "transferencia", "tarjeta", "pos"].some(p => mensajeTemporal.includes(p));
      
      // Look for existing orders if:
      // 1. Customer mentions a payment method (priority)
      // 2. Customer is not actively creating a new order with products
      const tieneProductosNuevos = productosGuardados.length > 0 && !contieneMetodoPago;
      
      // First, check if the session has a linked order
      let pedidoPendienteConfWeb: any = null;
      if (session.pedidoId) {
        const pedidoVinculado = await storage.getPedidoById(session.pedidoId);
        if (pedidoVinculado && pedidoVinculado.estado === "esperando_pago") {
          pedidoEsperandoPago = pedidoVinculado;
        }
        if (pedidoVinculado && pedidoVinculado.estado === "pendiente_confirmacion") {
          pedidoPendienteConfWeb = pedidoVinculado;
        }
      }

      // Check by WhatsApp number — always fetch to support multi-order cancel flow
      let pedidosActivosCliente: any[] = [];
      let pedidosCancelablesBot: any[] = [];
      if (tieneWhatsapp) {
        const pedidosCliente = await storage.getPedidosByClienteWhatsapp(colmado.id, session.clienteWhatsapp!);
        if (!pedidoEsperandoPago) {
          pedidoEsperandoPago = pedidosCliente.find(p => p.estado === "esperando_pago") || null;
        }
        if (!pedidoPendienteConfWeb) {
          pedidoPendienteConfWeb = pedidosCliente.find(p => p.estado === "pendiente_confirmacion") || null;
        }
        pedidosActivosCliente = pedidosCliente.filter(p => !["entregado", "cancelado", "retorno", "fusionado"].includes(p.estado));
        pedidosCancelablesBot = pedidosActivosCliente.filter(p => p.estado === "pendiente_confirmacion");
      } else if (pedidoPendienteConfWeb) {
        pedidosActivosCliente = [pedidoPendienteConfWeb];
        pedidosCancelablesBot = [pedidoPendienteConfWeb];
      }
      
      const mensajeNormalizado = mensaje.toLowerCase().trim();
      let respuesta = "";
      let nuevoEstado = estadoActual;
      
      // Load menu products for use in all states
      const menuProductos = await storage.getMenuProductos(colmado.id);

      // ========== HELPER: formatear detalle de un pedido para confirmación de cancelación ==========
      const formatearDetallePedido = (p: any): string => {
        let prods: any[] = [];
        try { prods = typeof p.productos === "string" ? JSON.parse(p.productos) : p.productos || []; } catch {}
        const lineas = prods.map((pr: any) => `• ${pr.nombre}${pr.monto ? ` - ${monedaSimbolo}${pr.monto}` : ""}`).join("\n");
        const total = parseFloat(p.totalConfirmado || p.total || "0");
        const estadoLabel: Record<string, string> = {
          "pendiente_confirmacion": "Pendiente de confirmación",
          "pendiente": "Confirmado — en preparación",
          "en_camino": "En camino",
          "esperando_pago": "Esperando pago",
        };
        return `📋 *Pedido #${p.id}*\nEstado: ${estadoLabel[p.estado] || p.estado}${lineas ? "\n" + lineas : ""}\n💰 Total: ${monedaSimbolo}${total}`;
      };

      // ========== HELPER: detección de productos (reutilizable en todos los estados) ==========
      // Devuelve { productosEncontrados, productosNoEncontrados }
      const detectarProductosEnMensaje = (mensajeParaProcesar: string): { productosEncontrados: any[], productosNoEncontrados: any[] } => {
        const productosCapturados: any[] = [];
        const partes = mensajeParaProcesar.split(/[,\n]|(?:\s+y\s+)/i).map((p: string) => p.trim()).filter((p: string) => p.length > 2);
        
        for (const parte of partes) {
          const matchCantidad = parte.match(/^(\d+)\s*[x]?\s*(.+)/i);
          let cantidad = 1;
          let nombreProducto = parte;
          if (matchCantidad) {
            cantidad = parseInt(matchCantidad[1]);
            nombreProducto = matchCantidad[2].trim();
          }
          const palabrasClave = nombreProducto.toLowerCase().split(/\s+/);
          let menuItem: typeof menuProductos[0] | null | undefined = null;
          
          menuItem = menuProductos.find(m => m.nombre.toLowerCase() === nombreProducto.toLowerCase());
          
          if (!menuItem) {
            const matchNumero = nombreProducto.match(/(\w+)\s*(\d+)/i);
            if (matchNumero) {
              const palabra = matchNumero[1].toLowerCase();
              const numero = matchNumero[2];
              menuItem = menuProductos.find(m => {
                const n = m.nombre.toLowerCase();
                return n.includes(palabra) && n.includes(numero);
              });
            }
          }
          
          if (!menuItem) {
            const candidatos: { producto: typeof menuProductos[0], score: number }[] = [];
            for (const producto of menuProductos) {
              const nombreMenu = producto.nombre.toLowerCase();
              const todasMatch = palabrasClave.every((p: string) => {
                if (p.length < 3 && !/^\d+$/.test(p)) return true;
                return nombreMenu.includes(p);
              });
              if (todasMatch && palabrasClave.some((p: string) => p.length >= 3 && nombreMenu.includes(p))) {
                let score = 0;
                if (nombreMenu.startsWith(nombreProducto.toLowerCase())) score += 100;
                score += Math.max(0, 50 - nombreMenu.length);
                const pp = palabrasClave.find((p: string) => p.length >= 3);
                if (pp && nombreMenu.startsWith(pp)) score += 25;
                candidatos.push({ producto, score });
              }
            }
            if (candidatos.length > 0) {
              candidatos.sort((a, b) => b.score - a.score);
              menuItem = candidatos[0].producto;
            }
          }
          
          if (menuItem) {
            const precio = menuItem.precio ? parseFloat(menuItem.precio) : null;
            productosCapturados.push({
              nombre: menuItem.nombre,
              textoOriginal: nombreProducto,
              monto: precio ? precio * cantidad : null,
              cantidad,
              encontradoEnMenu: true
            });
          } else {
            productosCapturados.push({
              nombre: nombreProducto,
              textoOriginal: nombreProducto,
              monto: null,
              cantidad,
              encontradoEnMenu: false
            });
          }
        }
        return {
          productosEncontrados: productosCapturados.filter(p => p.encontradoEnMenu),
          productosNoEncontrados: productosCapturados.filter(p => !p.encontradoEnMenu)
        };
      };

      // ========== HELPER: AI fallback para intenciones fuera del flujo ==========
      // Called when a message doesn't match the expected input in the current state.
      // Supports compound intents: [DAR_NOMBRE + AGREGAR_PRODUCTO] etc.
      type IAAccion = {
        tipo: string;
        productos?: Array<{ nombre: string; precio: number | null; cantidad: number }>;
        productoRemover?: string;
        metodoPago?: string;
        monto?: number;
        nombre?: string;
        // CONTINUAR_FLUJO: no special fields — server keeps current state
        // NUEVA_ORDEN: no special fields — reset session to inicial for a fresh order
      };
      const interpretarIntencionConIA = async (extraContexto?: string, historial?: Array<{rol: string; contenido: string}>): Promise<{
        acciones: IAAccion[];
        respuesta: string;
      }> => {
        const menuDisponibles = menuProductos.filter((p: any) => p.disponible !== false);
        const menuResumen = menuDisponibles.slice(0, 30).map((p: any) => {
          const precio = p.precio ? parseFloat(p.precio) : null;
          return `• ${p.nombre}${precio ? ` - ${monedaSimbolo}${precio}` : ""}`;
        }).join("\n");

        const subtotal = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
        const totalActual = (pedidoEsperandoPago
          ? parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total)
          : subtotal) + costoDelivery;

        const carritoTexto = productosGuardados.length > 0
          ? productosGuardados.map((p: any) =>
              `• ${p.cantidad > 1 ? p.cantidad + "x " : ""}${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
            ).join("\n")
          : "vacío";

        let pedidoTexto = "";
        if (pedidoEsperandoPago) {
          let prods: any[] = [];
          try {
            prods = typeof pedidoEsperandoPago.productos === "string"
              ? JSON.parse(pedidoEsperandoPago.productos) : (pedidoEsperandoPago.productos || []);
          } catch {}
          const prodsLineas = prods.map((p: any) =>
            `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
          ).join("\n");
          pedidoTexto = `\nPedido #${pedidoEsperandoPago.id} (confirmado por el negocio):\n${prodsLineas}\nTotal: ${monedaSimbolo}${totalActual}`;
        }

        const estadoDesc: Record<string, string> = {
          "esperando_nombre": "esperando que el cliente proporcione su nombre",
          "esperando_monto": "esperando el monto en efectivo con que pagará (pedido ya confirmado por el negocio)",
          "esperando_pago": "esperando que el cliente elija método de pago (pedido ya confirmado por el negocio)",
          "esperando_metodo_pago": "esperando que el cliente elija método de pago antes de crear el pedido",
          "esperando_monto_previo": "esperando el monto en efectivo antes de crear el pedido",
          "esperando_ubicacion": "esperando que el cliente comparta su ubicación GPS",
          "esperando_comprobante": "esperando foto del comprobante de transferencia bancaria",
          "pedido_creado": "pedido ya enviado al negocio, pendiente de confirmación o acciones post-pedido",
          "finalizado": "pedido finalizado — pago confirmado y procesado",
        };

        const datosBancariosTexto = datosBancarios
          ? datosBancarios.replace(/\n\n/g, " ").replace(/\n/g, " | ")
          : "";

        const systemPrompt = `Eres un asistente amigable de pedidos de "${colmado.nombre}". Paso actual: ${estadoDesc[estadoActual] || estadoActual}.

El cliente envió algo inesperado. Entiende todas sus intenciones (pueden ser varias), responde naturalmente y retoma el flujo.

CONTEXTO:
Carrito: ${carritoTexto}${pedidoTexto}
Total con delivery (${monedaSimbolo}${costoDelivery}): ${monedaSimbolo}${totalActual}
Métodos de pago disponibles: ${metodosHabilitados.join(", ") || "efectivo"}
${datosBancariosTexto ? `Datos bancarios: ${datosBancariosTexto}` : ""}
${menuResumen ? `Menú:\n${menuResumen}` : "(negocio sin menú fijo — el cliente pide lo que quiera)"}
${extraContexto ? `\nINFO ADICIONAL DEL ESTADO ACTUAL:\n${extraContexto}` : ""}
${historial && historial.length > 0 ? `\nHISTORIAL RECIENTE (mensajes anteriores al actual):\n${historial.map(m => `[${m.rol === "user" ? "cliente" : "bot"}]: ${m.contenido}`).join("\n")}` : ""}

RESPONDE SOLO EN JSON (sin texto extra):
{
  "acciones": [
    { "tipo": "TIPO", ...campos_específicos }
  ],
  "respuesta": "Respuesta natural (español, emojis, máx. 4 líneas). Confirma todo lo que hiciste y retoma el paso actual."
}

TIPOS DE ACCIÓN (pueden combinarse en el array):
{ "tipo": "DAR_NOMBRE", "nombre": "string" }
{ "tipo": "AGREGAR_PRODUCTO", "productos": [{ "nombre": "...", "precio": monto_o_null, "cantidad": 1 }] }
{ "tipo": "NUEVO_PEDIDO", "productos": [{ "nombre": "...", "precio": monto_o_null, "cantidad": 1 }] }
{ "tipo": "QUITAR_PRODUCTO", "productoRemover": "nombre del producto" }
{ "tipo": "CAMBIAR_METODO_PAGO", "metodoPago": "efectivo" | "transferencia" | "tarjeta" }
{ "tipo": "DAR_MONTO_EFECTIVO", "monto": número }
{ "tipo": "PREGUNTAR_TOTAL" }
{ "tipo": "PREGUNTAR_MENU" }
{ "tipo": "PEDIR_DATOS_BANCO" }
{ "tipo": "CANCELAR" }
{ "tipo": "CONTINUAR_FLUJO" }
{ "tipo": "NUEVA_ORDEN" }
{ "tipo": "OTRA_PREGUNTA" }

EJEMPLOS DE MÚLTIPLES ACCIONES:
- "me llamo Juan y quiero una pizza" → [{tipo:DAR_NOMBRE,nombre:"Juan"},{tipo:AGREGAR_PRODUCTO,productos:[...]}]
- "también un agua y mejor pago con transferencia" → [{tipo:AGREGAR_PRODUCTO,productos:[...]},{tipo:CAMBIAR_METODO_PAGO,metodoPago:"transferencia"}]
- "son 500 pesos" en esperando_monto → [{tipo:DAR_MONTO_EFECTIVO,monto:500}]
- "quiero agregar una coca cola" en pedido_creado → [{tipo:NUEVO_PEDIDO,productos:[{nombre:"Coca Cola",precio:null,cantidad:1}]}]
- "quiero hacer otro pedido" en finalizado → [{tipo:NUEVA_ORDEN}]

REGLAS:
- Productos específicos → incluirlos en el array. Vago ("quiero agregar algo") → AGREGAR_PRODUCTO con productos=[].
- Si el cliente da su nombre, extrae solo el nombre propio (sin el "me llamo").
- La respuesta debe confirmar todas las acciones tomadas y retomar el paso actual al final.
- En estados post-pedido (pedido_creado, finalizado): usa la INFO ADICIONAL para dar respuestas precisas.
- NUEVO_PEDIDO: en estados post-pedido, cuando el cliente quiere agregar productos extra (se creará un segundo pedido).
- NUEVA_ORDEN: solo cuando el cliente quiere empezar un pedido COMPLETAMENTE NUEVO desde cero (sesión limpia).
- NUNCA uses frases que impliquen un mensaje posterior: "dame un momento", "espera", "ahora lo hago", "en seguida", "te confirmo", "espera un segundo", etc. Tu respuesta ES el mensaje final — confirma la acción directamente en el mismo mensaje.`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: mensaje }
          ],
          response_format: { type: "json_object" },
          max_tokens: 450,
          temperature: 0.3,
        });

        try {
          const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
          if (!Array.isArray(parsed.acciones) || parsed.acciones.length === 0) {
            parsed.acciones = [{ tipo: "OTRA_PREGUNTA" }];
          }
          if (!parsed.respuesta) parsed.respuesta = "¿En qué más te puedo ayudar? 🤔";
          return parsed;
        } catch {
          return { acciones: [{ tipo: "OTRA_PREGUNTA" }], respuesta: "¿En qué más te puedo ayudar? 🤔" };
        }
      };

      // ========== HELPER: extrae datos útiles del array de acciones ==========
      const procesarAccionesIA = (acciones: IAAccion[]) => {
        const result = {
          nombresGuardados: [] as string[],
          productosAAgregar: [] as Array<{ nombre: string; precio: number | null; cantidad: number }>,
          productoARemover: null as string | null,
          metodoPago: null as string | null,
          monto: null as number | null,
          cancelar: false,
          continuarFlujo: false,
          preguntaTotal: false,
          preguntaMenu: false,
          preguntaDatosBanco: false,
          nuevaOrden: false,
          // NUEVO_PEDIDO: products for a second order in post-order states
          nuevoPedidoProductos: [] as Array<{ nombre: string; precio: number | null; cantidad: number }>,
          tipos: new Set<string>(),
        };
        for (const accion of acciones) {
          result.tipos.add(accion.tipo);
          if (accion.tipo === "DAR_NOMBRE" && accion.nombre) result.nombresGuardados.push(accion.nombre);
          if (accion.tipo === "AGREGAR_PRODUCTO" && accion.productos?.length) result.productosAAgregar.push(...accion.productos);
          if (accion.tipo === "NUEVO_PEDIDO" && accion.productos?.length) result.nuevoPedidoProductos.push(...accion.productos);
          if (accion.tipo === "QUITAR_PRODUCTO" && accion.productoRemover) result.productoARemover = accion.productoRemover;
          if (accion.tipo === "CAMBIAR_METODO_PAGO" && accion.metodoPago) result.metodoPago = accion.metodoPago;
          if (accion.tipo === "DAR_MONTO_EFECTIVO" && accion.monto) result.monto = accion.monto;
          if (accion.tipo === "CANCELAR") result.cancelar = true;
          if (accion.tipo === "CONTINUAR_FLUJO") result.continuarFlujo = true;
          if (accion.tipo === "PREGUNTAR_TOTAL") result.preguntaTotal = true;
          if (accion.tipo === "PREGUNTAR_MENU") result.preguntaMenu = true;
          if (accion.tipo === "PEDIR_DATOS_BANCO") result.preguntaDatosBanco = true;
          if (accion.tipo === "NUEVA_ORDEN") result.nuevaOrden = true;
        }
        return result;
      };
      // Server-side composition helpers for explicit query intents
      const respuestaTotal = () => {
        const subtotal = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
        const total = (pedidoEsperandoPago
          ? parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total)
          : subtotal) + costoDelivery;
        const lista = productosGuardados.length > 0
          ? productosGuardados.map((p: any) => `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`).join("\n")
          : "(carrito vacío)";
        return `💰 *Total estimado: ${monedaSimbolo}${total}*\n${lista}\n🚴 Delivery: ${monedaSimbolo}${costoDelivery}`;
      };
      const respuestaMenu = () => {
        const disponibles = menuProductos.filter((p: any) => p.disponible !== false).slice(0, 30);
        if (!disponibles.length) return "(Este negocio no tiene menú fijo — puedes pedir cualquier cosa)";
        return `📋 *Menú disponible:*\n${disponibles.map((p: any) => {
          const precio = p.precio ? parseFloat(p.precio) : null;
          return `• ${p.nombre}${precio ? ` - ${monedaSimbolo}${precio}` : ""}`;
        }).join("\n")}`;
      };
      const enriquecerRespuestaConDatos = (respIA: string, r: ReturnType<typeof procesarAccionesIA>) => {
        let resp = respIA;
        if (r.preguntaTotal && !respIA.includes(monedaSimbolo)) resp = respuestaTotal() + "\n\n" + resp;
        if (r.preguntaMenu && !respIA.toLowerCase().includes("menú") && !respIA.toLowerCase().includes("menu")) resp = respuestaMenu() + "\n\n" + resp;
        if (r.preguntaDatosBanco && datosBancarios && !respIA.toLowerCase().includes("cuenta") && !respIA.toLowerCase().includes("banco")) resp = resp + datosBancarios;
        return resp;
      };

      // ============ ESTADOS DE CANCELACIÓN CON CONFIRMACIÓN ============

      // Estado: confirmando_cancelacion:ID — esperando que el cliente confirme la cancelación
      if (!respuesta && estadoActual.startsWith("confirmando_cancelacion:")) {
        const pedidoIdACancelar = parseInt(estadoActual.split(":")[1]);
        // Evaluate rejection FIRST to avoid "no cancelar" matching confirm keywords
        const esRechazar =
          mensajeNormalizado === "no" ||
          mensajeNormalizado.startsWith("no ") ||
          mensajeNormalizado === "nope" ||
          ["mejor no", "déjalo", "dejalo", "no canceles", "no cancelar", "no quiero cancelar", "no quiero"].some(phrase => mensajeNormalizado.includes(phrase));
        // Confirm only if no rejection keywords present; excludes "cancela/cancelar" (ambiguous in this state)
        const esConfirmar = !esRechazar && ["si", "sí", "yes", "dale", "confirmo", "confirmar", "ok", "bueno", "adelante"].some(k =>
          mensajeNormalizado === k || mensajeNormalizado.startsWith(k + " ")
        );

        if (esConfirmar) {
          const pedidoACancelar = await storage.getPedidoById(pedidoIdACancelar);
          if (pedidoACancelar && pedidoACancelar.estado === "pendiente_confirmacion") {
            await storage.updatePedidoEstado(pedidoACancelar.id, "cancelado");
            await storage.updateChatWebSession(sessionId, {
              estadoConversacion: "inicial",
              pedidoId: null,
              productosCapturados: [],
            } as any);
            respuesta = `❌ Tu pedido *#${pedidoACancelar.id}* ha sido cancelado. Si deseas hacer otro pedido, escríbenos cuando quieras. 👋`;
            nuevoEstado = "inicial";
          } else {
            await storage.updateChatWebSession(sessionId, { estadoConversacion: "pedido_creado" } as any);
            nuevoEstado = "pedido_creado";
            respuesta = `Para cancelar tu Pedido *#${pedidoIdACancelar}*, comunícate directamente con *${colmado.nombre}*. 📞 El pedido ya fue confirmado y no puedo cancelarlo desde aquí.`;
          }
        } else if (esRechazar) {
          const estadoAnterior = session.pedidoId ? "pedido_creado" : "inicial";
          await storage.updateChatWebSession(sessionId, { estadoConversacion: estadoAnterior } as any);
          nuevoEstado = estadoAnterior;
          respuesta = `👍 Tu pedido sigue activo. ¿En qué más te puedo ayudar?`;
        } else {
          const pedidoRepetir = await storage.getPedidoById(pedidoIdACancelar);
          respuesta = pedidoRepetir
            ? `Por favor confirma: ¿Deseas cancelar el *Pedido #${pedidoRepetir.id}*?\n\nResponde *sí* para cancelar o *no* para dejarlo activo.`
            : `¿Confirmas la cancelación? Responde *sí* o *no*.`;
        }
      }

      // Estado: eligiendo_pedido_cancelar:ID1,ID2 — cliente tiene varios pedidos activos, eligiendo cuál cancelar
      if (!respuesta && estadoActual.startsWith("eligiendo_pedido_cancelar:")) {
        const [id1, id2] = estadoActual.split(":")[1].split(",").map(Number);
        const esUno = mensajeNormalizado === "1" || mensajeNormalizado.includes("primero") || mensajeNormalizado.includes("primer pedido") || mensajeNormalizado.includes("el 1");
        const esDos = mensajeNormalizado === "2" || mensajeNormalizado.includes("segundo") || mensajeNormalizado.includes("segundo pedido") || mensajeNormalizado.includes("el 2");

        if (esUno || esDos) {
          const idElegido = esUno ? id1 : id2;
          const pedidoElegido = await storage.getPedidoById(idElegido);
          if (pedidoElegido) {
            await storage.updateChatWebSession(sessionId, { estadoConversacion: `confirmando_cancelacion:${idElegido}` } as any);
            nuevoEstado = `confirmando_cancelacion:${idElegido}`;
            respuesta = `${formatearDetallePedido(pedidoElegido)}\n\n¿Confirmas que deseas cancelar este pedido?\n\nResponde *sí* para cancelar o *no* para dejarlo activo.`;
          } else {
            // Pedido no encontrado (puede haber expirado/cancelado) — re-mostrar opciones o resetear
            const p1 = await storage.getPedidoById(id1);
            const p2 = await storage.getPedidoById(id2);
            const aun_validos = [p1, p2].filter(p => p && p.estado === "pendiente_confirmacion");
            if (aun_validos.length === 1) {
              const pv = aun_validos[0]!;
              await storage.updateChatWebSession(sessionId, { estadoConversacion: `confirmando_cancelacion:${pv.id}` } as any);
              nuevoEstado = `confirmando_cancelacion:${pv.id}`;
              respuesta = `Solo queda un pedido que puedes cancelar:\n\n${formatearDetallePedido(pv)}\n\n¿Confirmas que deseas cancelarlo?\n\nResponde *sí* o *no*.`;
            } else if (aun_validos.length === 0) {
              await storage.updateChatWebSession(sessionId, { estadoConversacion: "inicial" } as any);
              nuevoEstado = "inicial";
              respuesta = `Ya no tienes pedidos activos para cancelar. ¿En qué más te puedo ayudar?`;
            } else {
              respuesta = `Por favor elige cuál pedido quieres cancelar:\n\n*Opción 1:*\n${p1 ? formatearDetallePedido(p1) : `Pedido #${id1}`}\n\n*Opción 2:*\n${p2 ? formatearDetallePedido(p2) : `Pedido #${id2}`}\n\nResponde *1* o *2*.`;
            }
          }
        } else {
          const p1 = await storage.getPedidoById(id1);
          const p2 = await storage.getPedidoById(id2);
          respuesta = `Por favor elige cuál pedido quieres cancelar:\n\n*Opción 1:*\n${p1 ? formatearDetallePedido(p1) : `Pedido #${id1}`}\n\n*Opción 2:*\n${p2 ? formatearDetallePedido(p2) : `Pedido #${id2}`}\n\nResponde *1* o *2*.`;
        }
      }

      // ============ FLUJO BASADO EN ESTADO EXPLÍCITO (SIN AI) ============

      // Estado: inicial con pedido pendiente_confirmacion — handle before any other state
      // Prevents "no tienes pedido activo" when customer has an unconfirmed order
      if (!respuesta && pedidoPendienteConfWeb && (estadoActual === "inicial" || estadoActual === "pedido_creado")) {
        const esCancelarWeb = ["cancelar", "cancela", "cancelo", "cancelé", "no quiero", "no lo quiero", "borra el pedido", "quitar pedido"].some(k => mensajeNormalizado.includes(k));
        const esPreguntaEstadoWeb = ["mi pedido", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "confirmaron", "confirmado"].some(k => mensajeNormalizado.includes(k));

        if (esCancelarWeb) {
          // 2-step cancel flow: show order details and ask confirmation
          if (pedidosCancelablesBot.length === 0) {
            // No cancellable orders by bot (already confirmed/in-progress)
            const hayActivos = pedidosActivosCliente.length > 0;
            if (hayActivos) {
              const pedidoActivo = pedidosActivosCliente[0];
              respuesta = `Para cancelar tu Pedido *#${pedidoActivo.id}*, comunícate directamente con *${colmado.nombre}*. 📞 El pedido ya fue confirmado.`;
            } else {
              respuesta = `No tienes pedidos activos para cancelar. ¿En qué te puedo ayudar?`;
            }
          } else if (pedidosCancelablesBot.length === 1) {
            const p = pedidosCancelablesBot[0];
            await storage.updateChatWebSession(sessionId, { estadoConversacion: `confirmando_cancelacion:${p.id}` } as any);
            nuevoEstado = `confirmando_cancelacion:${p.id}`;
            respuesta = `${formatearDetallePedido(p)}\n\n¿Confirmas que deseas cancelar este pedido?\n\nResponde *sí* para cancelar o *no* para dejarlo activo.`;
          } else {
            const [p1, p2] = pedidosCancelablesBot;
            await storage.updateChatWebSession(sessionId, { estadoConversacion: `eligiendo_pedido_cancelar:${p1.id},${p2.id}` } as any);
            nuevoEstado = `eligiendo_pedido_cancelar:${p1.id},${p2.id}`;
            respuesta = `Tienes varios pedidos activos. ¿Cuál deseas cancelar?\n\n*Opción 1:*\n${formatearDetallePedido(p1)}\n\n*Opción 2:*\n${formatearDetallePedido(p2)}\n\nResponde *1* o *2*.`;
          }
        } else if (esPreguntaEstadoWeb) {
          respuesta = `⏳ Tu pedido *#${pedidoPendienteConfWeb.id}* está siendo revisado por *${colmado.nombre}*. Te avisamos por aquí cuando lo confirmen. ¿Hay algo más en que te pueda ayudar?`;
        }
        // If neither, fall through to the pedido_creado AI handler which already has full context
        if (!respuesta && estadoActual === "inicial") {
          // Re-link session to this pending order so the pedido_creado handler fires next time
          await storage.updateChatWebSession(sessionId, {
            estadoConversacion: "pedido_creado",
            pedidoId: pedidoPendienteConfWeb.id,
          } as any);
          nuevoEstado = "pedido_creado";
          respuesta = `⏳ Tu pedido *#${pedidoPendienteConfWeb.id}* está siendo revisado por *${colmado.nombre}*. ¿En qué más te puedo ayudar?`;
        }
      }

      // Estado: retomando_carrito — resume incomplete order from a previous session
      if (!respuesta && estadoActual === "retomando_carrito") {
        const palabrasNegativas = ["no", "empezar", "nueva", "nuevo", "borrar", "cancelar", "limpiar", "otra vez", "de nuevo", "reset"];
        const esNegativo = palabrasNegativas.some(p =>
          mensajeNormalizado === p ||
          mensajeNormalizado.startsWith(p + " ") ||
          mensajeNormalizado.endsWith(" " + p) ||
          mensajeNormalizado.includes(" " + p + " ")
        );

        if (esNegativo) {
          await storage.updateChatWebSession(sessionId, {
            productosCapturados: [],
            metodoPagoSeleccionado: null,
            estadoConversacion: "inicial",
          } as any);
          productosGuardados = [];
          nuevoEstado = "inicial";
          respuesta = `¡Listo! Empezamos de nuevo. 🙂\n\n¿Qué deseas pedir hoy en *${colmado.nombre}*?`;
        } else {
          // Affirmative (or any other input) — resume from wherever they left off
          const _nombre = session.clienteNombre;
          const _dir = session.clienteDireccion;
          const _pago = (session as any).metodoPagoSeleccionado;
          const _sub = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
          const _tot = _sub + costoDelivery;

          if (!_nombre || _nombre === "Cliente") {
            const _msgNom = await storage.getMensajeSistema("pregunta_nombre");
            respuesta = `¡Perfecto, retomamos! 🛒\n\n${_msgNom?.contenido || "¿A nombre de quién va el pedido?"}`;
            nuevoEstado = "esperando_nombre";
          } else if (!_dir) {
            respuesta = `¡Perfecto, retomamos! 🛒\n\n¿Cuál es tu dirección de entrega?\n\nPuedes compartir tu ubicación con el botón 📍 o escribirla aquí.`;
            nuevoEstado = "esperando_ubicacion";
          } else if (!_pago) {
            respuesta = `¡Perfecto, retomamos! 🛒\n\n${msgPreguntaPago?.contenido || "¿Cómo deseas pagar?"}\n\n💰 *Total: ${monedaSimbolo}${_tot}*\n\n${metodosHabilitados.join(" · ")}`;
            nuevoEstado = "esperando_metodo_pago";
          } else {
            // Everything present — go straight to payment confirmation
            respuesta = `¡Perfecto, retomamos! 🛒\n\n${msgPreguntaPago?.contenido || "¿Cómo deseas pagar?"}\n\n💰 *Total: ${monedaSimbolo}${_tot}*\n\n${metodosHabilitados.join(" · ")}`;
            nuevoEstado = "esperando_metodo_pago";
          }
        }
      }

      // Estado: esperando_nombre
      if (estadoActual === "esperando_nombre") {
        const msgTrimmed = mensaje.trim();
        const tienePrefijoNombre = /^(me llamo|soy|mi nombre es|mi nombre:|nombre:)\s+/i.test(msgTrimmed);
        const nombreCapturado = msgTrimmed.replace(/^(me llamo|soy|mi nombre es|mi nombre:|nombre:)\s*/i, "").trim();
        // Heuristic: looks like a real name if it has a prefix, or is short with no ordering words
        const palabrasNombre = nombreCapturado.split(/\s+/);
        const pareceNombre = tienePrefijoNombre ||
          (palabrasNombre.length <= 3 &&
           nombreCapturado.length > 1 &&
           !/[?¿!¡]/.test(nombreCapturado) &&
           !/\b(quiero|quisiera|dame|tengo|necesito|pedir|agregar|añadir|también|pon|coloca|cuánto|cómo|cuando|dónde|donde|hola|precio|menú|menu)\b/i.test(nombreCapturado));

        if (pareceNombre && nombreCapturado.length > 1 && nombreCapturado.length < 50) {
          // Extract clean name (handle "me llamo Juan, quiero una pizza")
          const nombreFinal = nombreCapturado.split(/[,;]|\s+y\s+(quiero|quisiera|también|tengo)/i)[0].trim();
          await storage.updateChatWebSession(sessionId, { clienteNombre: nombreFinal });
          // Check for products embedded in the same message
          const { productosEncontrados } = detectarProductosEnMensaje(mensaje);
          if (productosEncontrados.length > 0) {
            const nuevosProductos = [...productosGuardados, ...productosEncontrados];
            await storage.updateChatWebSession(sessionId, { productosCapturados: nuevosProductos } as any);
            const listaTexto = productosEncontrados.map((p: any) => {
              let linea = p.cantidad > 1 ? `• ${p.cantidad}x ${p.nombre}` : `• ${p.nombre}`;
              if (p.monto) linea += ` - ${monedaSimbolo}${p.monto}`;
              return linea;
            }).join("\n");
            respuesta = `¡Gracias ${nombreFinal}! ✅ *Anotado:*\n${listaTexto}\n\n📍 Comparte tu ubicación usando el botón 📍 para que podamos entregarte.`;
          } else {
            respuesta = `¡Gracias ${nombreFinal}! 📍 Por favor, comparte tu ubicación usando el botón de ubicación para que podamos entregarte tu pedido.`;
          }
          nuevoEstado = "esperando_ubicacion";
        } else {
          // Doesn't look like a name — use AI to interpret (handles compound intents)
          try {
            const ia = await interpretarIntencionConIA(undefined, historialParaIA);
            const r = procesarAccionesIA(ia.acciones);
            if (r.cancelar) {
              await storage.updateChatWebSession(sessionId, { productosCapturados: [], metodoPagoSeleccionado: null, clienteNombre: null } as any);
              respuesta = ia.respuesta || `❌ Pedido cancelado. ¡Hasta luego! 👋`;
              nuevoEstado = "inicial";
            } else {
              if (r.nombresGuardados.length) {
                await storage.updateChatWebSession(sessionId, { clienteNombre: r.nombresGuardados[0] });
                nuevoEstado = "esperando_ubicacion";
              }
              if (r.productosAAgregar.length) {
                const nuevosProds = r.productosAAgregar.map((p: any) => ({
                  nombre: p.nombre, monto: p.precio, cantidad: p.cantidad,
                  textoOriginal: p.nombre, encontradoEnMenu: p.precio !== null
                }));
                await storage.updateChatWebSession(sessionId, { productosCapturados: [...productosGuardados, ...nuevosProds] } as any);
              }
              respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
              if (!r.nombresGuardados.length) nuevoEstado = estadoActual;
            }
          } catch {
            respuesta = "Por favor, dime tu nombre para continuar con el pedido.";
          }
        }
      }
      // Estado: esperando_direccion — accept text as written address and continue flow
      else if (estadoActual === "esperando_direccion") {
        await storage.updateChatWebSession(sessionId, { clienteDireccion: mensaje } as any);
        const _tieneNomDir = !!(session.clienteNombre && session.clienteNombre !== "Cliente");
        const _tieneProdsDir = productosGuardados.length > 0;
        if (!_tieneNomDir) {
          const _msgNomDir = await storage.getMensajeSistema("pregunta_nombre");
          respuesta = `📍 *¡Dirección anotada!*\n\n${_msgNomDir?.contenido || "¿A nombre de quién va el pedido?"}`;
          nuevoEstado = "esperando_nombre";
        } else if (!_tieneProdsDir) {
          respuesta = `📍 *¡Dirección anotada!*\n\n¿Qué deseas pedir hoy? 🍽️`;
          nuevoEstado = "inicial";
        } else {
          const _subDir = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
          const _totDir = _subDir + costoDelivery;
          respuesta = `📍 *¡Dirección anotada!*\n\n${msgPreguntaPago?.contenido || "¿Cómo deseas pagar?"}\n\n💰 *Total: ${monedaSimbolo}${_totDir}*\n\n${metodosHabilitados.join(" · ")}`;
          nuevoEstado = "esperando_metodo_pago";
        }
      }
      // Estado: esperando_ubicacion
      else if (estadoActual === "esperando_ubicacion") {
        // User sent text instead of GPS — try to detect products first
        const { productosEncontrados } = detectarProductosEnMensaje(mensaje);
        if (productosEncontrados.length > 0) {
          const nuevosProductos = [...productosGuardados, ...productosEncontrados];
          await storage.updateChatWebSession(sessionId, { productosCapturados: nuevosProductos } as any);
          const listaTexto = productosEncontrados.map((p: any) => {
            let linea = p.cantidad > 1 ? `• ${p.cantidad}x ${p.nombre}` : `• ${p.nombre}`;
            if (p.monto) linea += ` - ${monedaSimbolo}${p.monto}`;
            return linea;
          }).join("\n");
          respuesta = `✅ *Anotado:*\n${listaTexto}\n\n📍 Solo me falta tu ubicación — usa el botón 📍 para compartirla o escríbela aquí.`;
        } else {
          // Not a product — check for cancel intent; otherwise treat as text address
          try {
            const ia = await interpretarIntencionConIA(undefined, historialParaIA);
            const r = procesarAccionesIA(ia.acciones);
            if (r.cancelar) {
              await storage.updateChatWebSession(sessionId, { productosCapturados: [], metodoPagoSeleccionado: null, clienteNombre: null } as any);
              respuesta = ia.respuesta || `❌ Pedido cancelado. ¡Hasta luego! 👋`;
              nuevoEstado = "inicial";
            } else if (r.productosAAgregar.length > 0) {
              // User added products alongside a message — handle products
              const nuevosProds = r.productosAAgregar.map((p: any) => ({
                nombre: p.nombre, monto: p.precio, cantidad: p.cantidad,
                textoOriginal: p.nombre, encontradoEnMenu: p.precio !== null
              }));
              await storage.updateChatWebSession(sessionId, { productosCapturados: [...productosGuardados, ...nuevosProds] } as any);
              respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
              if (!respuesta.includes("📍")) respuesta += `\n\n📍 Para continuar, comparte tu ubicación usando el botón 📍 o escríbela aquí.`;
              nuevoEstado = "esperando_ubicacion";
            } else {
              // Treat the message as a text address — save it and continue the flow
              await storage.updateChatWebSession(sessionId, { clienteDireccion: mensaje } as any);
              const _metodoYa = (session as any).metodoPagoSeleccionado || null;
              const _tieneNomUb = !!(session.clienteNombre && session.clienteNombre !== "Cliente");
              const _tieneProdsUb = productosGuardados.length > 0;

              if (!_tieneNomUb) {
                const _msgNomUb = await storage.getMensajeSistema("pregunta_nombre");
                respuesta = `📍 *¡Dirección anotada!*\n\n${_msgNomUb?.contenido || "¿A nombre de quién va el pedido?"}`;
                nuevoEstado = "esperando_nombre";
              } else if (!_tieneProdsUb) {
                respuesta = `📍 *¡Dirección anotada!*\n\n¿Qué deseas pedir hoy? 🍽️`;
                nuevoEstado = "inicial";
              } else if (_metodoYa) {
                // Payment already selected → create order with text address
                const _subUb = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                const _totUb = _subUb + costoDelivery;
                const _zipUb = await validarZipEnDireccion(colmado.paisId, mensaje);
                if (!_zipUb.zipOk) {
                  respuesta = `Para completar tu pedido necesito un ${_zipUb.etiquetaCP || "código postal"} válido (ej: ${_zipUb.ejemploCP || "10001"}). ¿Puedes escribir tu dirección completa con el código postal?`;
                  nuevoEstado = "esperando_ubicacion";
                } else {
                  const _montoPagoUb = (session as any).montoPagoCliente || "0";
                  const _devueltaUb = (session as any).devueltaCalculada || "0";
                  const _pedidoUb = await storage.createPedido({
                    colmadoId: colmado.id,
                    clienteNombre: session.clienteNombre || "Cliente",
                    clienteWhatsapp: session.clienteWhatsapp || "",
                    clienteUbicacion: mensaje,
                    productos: JSON.stringify(productosGuardados),
                    total: _totUb.toString(),
                    estado: "pendiente_confirmacion",
                    montoPago: _montoPagoUb,
                    metodoPago: _metodoYa,
                  });
                  await storage.updateChatWebSession(sessionId, {
                    productosCapturados: [],
                    estadoConversacion: _metodoYa === "transferencia" ? "esperando_comprobante" : "pedido_creado",
                    pedidoId: _pedidoUb.id,
                    metodoPagoSeleccionado: null,
                    montoPagoCliente: null,
                    devueltaCalculada: null,
                  } as any);
                  const _subMostUb = Math.max(0, _totUb - costoDelivery);
                  const _listaUb = productosGuardados.map((p: any) => p.monto ? `• ${p.nombre || "Producto"} (${monedaSimbolo}${p.monto})` : `• ${p.nombre || "Producto"}`).join("\n");
                  const _desgloseUb = `${_listaUb ? `📝 *Productos:*\n${_listaUb}\n\n` : ""}💰 Subtotal: ${monedaSimbolo}${_subMostUb}\n🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n━━━━━━━━━━━━━━━\n*💵 Total: ${monedaSimbolo}${_totUb}*`;
                  if (_metodoYa === "efectivo") {
                    respuesta = `📦 *Pedido #${_pedidoUb.id} recibido*\n\n${_desgloseUb}\n\n💵 *Pago:* Efectivo · Pagas ${monedaSimbolo}${_montoPagoUb} → ${palabraDevuelta.charAt(0).toUpperCase()}${palabraDevuelta.slice(1)}: ${monedaSimbolo}${_devueltaUb}\n\n⏳ El negocio revisará y te confirmará.`;
                  } else if (_metodoYa === "transferencia") {
                    respuesta = `📦 *Pedido #${_pedidoUb.id} recibido*\n\n${_desgloseUb}\n\n🏦 *Pago:* Transferencia\n\n📄 *Envía una foto del comprobante* usando el botón 📎 para procesar tu orden.`;
                  } else {
                    respuesta = `📦 *Pedido #${_pedidoUb.id} recibido*\n\n${_desgloseUb}\n\n⏳ El negocio revisará y te confirmará.`;
                  }
                  nuevoEstado = "pedido_creado";
                  if (colmado.whatsappNumero) {
                    const _listaNegUb = productosGuardados.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n");
                    await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${_pedidoUb.id}*\n👤 ${session.clienteNombre || "Cliente"}${session.clienteWhatsapp ? ` | ${session.clienteWhatsapp}` : ""}\n📝 Productos:\n${_listaNegUb}\n💰 Total: ${monedaSimbolo}${_totUb}\n📍 ${mensaje}`);
                  }
                }
              } else {
                // No payment selected yet → ask for payment method
                const _subPagoUb = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                const _totPagoUb = _subPagoUb + costoDelivery;
                respuesta = `📍 *¡Dirección anotada!*\n\n${msgPreguntaPago?.contenido || "¿Cómo deseas pagar?"}\n\n💰 *Total: ${monedaSimbolo}${_totPagoUb}*\n\n${metodosHabilitados.join(" · ")}`;
                nuevoEstado = "esperando_metodo_pago";
              }
            }
          } catch {
            // On error, save as address and ask for payment
            await storage.updateChatWebSession(sessionId, { clienteDireccion: mensaje } as any);
            const _subErrUb = productosGuardados.reduce((s: number, p: any) => s + (p.monto || 0), 0);
            const _totErrUb = _subErrUb + costoDelivery;
            respuesta = `📍 *¡Dirección anotada!*\n\n¿Cómo deseas pagar?\n💰 Total: ${monedaSimbolo}${_totErrUb}\n\n${metodosHabilitados.join(" · ")}`;
            nuevoEstado = "esperando_metodo_pago";
          }
        }
      }
      // Estado: esperando_variante - ya no se usa IA, procesar como inicial
      // Este else-if está vacío intencionalmente - el flujo continuará al bloque de captura de productos
      
      // ============ CONSULTAS DE ESTADO DE PEDIDO ============
      // Detectar palabras clave para consultar pedido
      else if (
        mensajeNormalizado.includes("estatus") ||
        mensajeNormalizado.includes("estado") ||
        mensajeNormalizado.includes("como va") ||
        mensajeNormalizado.includes("cómo va") ||
        mensajeNormalizado.includes("donde esta") ||
        mensajeNormalizado.includes("dónde está") ||
        mensajeNormalizado.includes("cuando llega") ||
        mensajeNormalizado.includes("cuándo llega") ||
        mensajeNormalizado.includes("ya salio") ||
        mensajeNormalizado.includes("ya salió") ||
        mensajeNormalizado.includes("mi delivery") ||
        mensajeNormalizado.includes("mi pedido") ||
        mensajeNormalizado.includes("mi orden") ||
        mensajeNormalizado.includes("ver mi pedido") ||
        mensajeNormalizado.includes("ver mi orden") ||
        mensajeNormalizado.includes("estado de mi") ||
        mensajeNormalizado.includes("en que esta") ||
        mensajeNormalizado.includes("en qué está") ||
        mensajeNormalizado.includes("seguimiento") ||
        mensajeNormalizado.includes("tracking") ||
        mensajeNormalizado.includes("ultimo pedido") ||
        mensajeNormalizado.includes("último pedido")
      ) {
        // Find the most recent order for this customer
        let ultimoPedido: any = null;
        
        // First check if session has linked order
        if (session.pedidoId) {
          ultimoPedido = await storage.getPedidoById(session.pedidoId);
        }
        
        // If no linked order, search by session WhatsApp or all recent colmado orders
        if (!ultimoPedido && tieneWhatsapp) {
          const pedidosCliente = await storage.getPedidosByClienteWhatsapp(colmado.id, session.clienteWhatsapp!);
          if (pedidosCliente.length > 0) {
            ultimoPedido = pedidosCliente[0]; // Most recent
          }
        }
        
        if (ultimoPedido) {
          let deliveryWeb: any = undefined;
          if (ultimoPedido.estado === "en_camino" && ultimoPedido.deliveryId) {
            deliveryWeb = await storage.getDeliveryById(ultimoPedido.deliveryId);
          }
          let metodosPagoWeb: any = undefined;
          if (ultimoPedido.estado === "esperando_pago") {
            metodosPagoWeb = await storage.getMetodosPago(colmado.id);
          }
          respuesta = buildOrderStatusMessage(ultimoPedido, colmado, deliveryWeb, monedaSimbolo, metodosPagoWeb);
        } else {
          respuesta = "No encontré ningún pedido reciente. ¿Deseas hacer un nuevo pedido?";
        }
      }
      
      // Estado: esperando_monto (cash payment, waiting for amount) - MUST be before esperando_pago check
      else if (estadoActual === "esperando_monto") {
        const pedidoActual = session.pedidoId ? await storage.getPedidoById(session.pedidoId) : pedidoEsperandoPago;
        if (pedidoActual) {
          const montoMatch = mensajeNormalizado.match(/(\d+)/);
          if (montoMatch) {
            const totalPedido = parseFloat(pedidoActual.totalConfirmado || pedidoActual.total);
            const totalConDelivery = totalPedido; // already includes delivery
            const subtotalWC = Math.max(0, totalConDelivery - costoDelivery);
            const montoPago = parseInt(montoMatch[1]);
            const devuelta = Math.max(0, montoPago - totalConDelivery);
            
            await storage.updatePedidoEstado(pedidoActual.id, "pendiente");
            await storage.updatePedidoMetodoPago(pedidoActual.id, "efectivo");
            await storage.updatePedidoPago(pedidoActual.id, {
              montoPago: montoPago.toString(),
              necesitaDevuelta: devuelta > 0,
              total: totalConDelivery.toString()
            });
            if (devuelta > 0) await storage.updateVueltoEntregado(pedidoActual.id, devuelta);

            let productosConfWC = "";
            try {
              const prods = typeof pedidoActual.productos === "string" ? JSON.parse(pedidoActual.productos) : pedidoActual.productos;
              if (Array.isArray(prods)) productosConfWC = prods.map((p: any) => { const n = p.nombre || p.name; return p.monto ? `• ${n} (${monedaSimbolo}${p.monto})` : `• ${n}`; }).join("\n");
            } catch {}
            
            respuesta = `✅ *¡Pedido #${pedidoActual.id} Confirmado!*\n\n`;
            if (productosConfWC) respuesta += `📝 *Tu pedido:*\n${productosConfWC}\n\n`;
            respuesta += `💰 Subtotal: ${monedaSimbolo}${subtotalWC}\n`;
            respuesta += `🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n`;
            respuesta += `━━━━━━━━━━━━━━━\n`;
            respuesta += `*💵 Total: ${monedaSimbolo}${totalConDelivery}*\n\n`;
            respuesta += `💵 *Pago:* Efectivo · Pagas ${monedaSimbolo}${montoPago} → ${palabraDevuelta.charAt(0).toUpperCase()}${palabraDevuelta.slice(1)}: ${monedaSimbolo}${devuelta}\n\n¡Gracias por tu compra! 🙏`;
            nuevoEstado = "finalizado";
          } else {
            let totalPedido = parseFloat(pedidoActual.totalConfirmado || pedidoActual.total);
            let totalConDelivery = totalPedido; // already includes delivery
            // Try to detect if the user mentioned a product while waiting for payment amount
            const { productosEncontrados } = detectarProductosEnMensaje(mensaje);
            if (productosEncontrados.length > 0) {
              // Persist added products in the actual order record too
              let prodActualesHeur: any[] = [];
              try { prodActualesHeur = typeof pedidoActual.productos === "string" ? JSON.parse(pedidoActual.productos) : []; } catch {}
              const nuevosProductos = [...prodActualesHeur, ...productosEncontrados];
              const nuevoTotalHeur = nuevosProductos.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
              await storage.updatePedidoProductosYTotal(pedidoActual.id, nuevosProductos, nuevoTotalHeur.toString());
              await storage.updateChatWebSession(sessionId, { productosCapturados: nuevosProductos } as any);
              totalConDelivery = nuevoTotalHeur;
              const listaTexto = productosEncontrados.map((p: any) => {
                let linea = p.cantidad > 1 ? `• ${p.cantidad}x ${p.nombre}` : `• ${p.nombre}`;
                if (p.monto) linea += ` - ${monedaSimbolo}${p.monto}`;
                return linea;
              }).join("\n");
              respuesta = `✅ *Anotado:*\n${listaTexto}\n\n💵 Para continuar, dime con cuánto dinero vas a pagar.\nPor ejemplo: *500*, *1000*, *2000*\n\n(Total: ${monedaSimbolo}${totalConDelivery})`;
              nuevoEstado = "esperando_monto";
            } else {
              // No number found — AI fallback (handles compound intents sequentially)
              try {
                const ia = await interpretarIntencionConIA(undefined, historialParaIA);
                const r = procesarAccionesIA(ia.acciones);
                if (r.cancelar) {
                  await storage.updatePedidoEstado(pedidoActual.id, "cancelado");
                  respuesta = ia.respuesta || `❌ Pedido cancelado. Si deseas hacer otro pedido, escríbenos cuando quieras. 👋`;
                  nuevoEstado = "finalizado";
                } else {
                  // Step 1: apply product changes (may exist alongside payment intent)
                  if (r.productosAAgregar.length || r.productoARemover) {
                    let prodActualesIA: any[] = [];
                    try { prodActualesIA = typeof pedidoActual.productos === "string" ? JSON.parse(pedidoActual.productos) : []; } catch {}
                    if (r.productoARemover) {
                      prodActualesIA = prodActualesIA.filter((p: any) => !String(p.nombre).toLowerCase().includes(r.productoARemover!.toLowerCase()));
                    }
                    if (r.productosAAgregar.length) {
                      const nuevosProdsIA = r.productosAAgregar.map((p: any) => ({
                        nombre: p.nombre, monto: p.precio, cantidad: p.cantidad, textoOriginal: p.nombre, encontradoEnMenu: p.precio !== null
                      }));
                      prodActualesIA = [...prodActualesIA, ...nuevosProdsIA];
                    }
                    totalConDelivery = prodActualesIA.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                    await storage.updatePedidoProductosYTotal(pedidoActual.id, prodActualesIA, totalConDelivery.toString());
                  }
                  // Step 2: apply payment decision
                  if (r.monto) {
                    const devuelta = Math.max(0, r.monto - totalConDelivery);
                    await storage.updatePedidoEstado(pedidoActual.id, "pendiente");
                    await storage.updatePedidoMetodoPago(pedidoActual.id, "efectivo");
                    await storage.updatePedidoPago(pedidoActual.id, {
                      montoPago: r.monto.toString(), necesitaDevuelta: devuelta > 0, total: totalConDelivery.toString()
                    });
                    if (devuelta > 0) await storage.updateVueltoEntregado(pedidoActual.id, devuelta);
                    respuesta = ia.respuesta;
                    nuevoEstado = "finalizado";
                  } else if (r.metodoPago && r.metodoPago !== "efectivo") {
                    if (r.metodoPago === "transferencia") {
                      await storage.updatePedidoEstado(pedidoActual.id, "pendiente");
                      await storage.updatePedidoMetodoPago(pedidoActual.id, "transferencia");
                      let respTransfer = ia.respuesta;
                      if (datosBancarios && !respTransfer.toLowerCase().includes("cuenta") && !respTransfer.toLowerCase().includes("banco")) respTransfer += datosBancarios;
                      respuesta = respTransfer;
                      nuevoEstado = "finalizado";
                    } else if (r.metodoPago === "tarjeta") {
                      await storage.updatePedidoEstado(pedidoActual.id, "pendiente");
                      await storage.updatePedidoMetodoPago(pedidoActual.id, "tarjeta");
                      respuesta = ia.respuesta;
                      nuevoEstado = "finalizado";
                    }
                  } else {
                    // No payment decision yet — answer question/product added, stay in same state
                    respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
                    if (!ia.respuesta.toLowerCase().includes("pagar") && !ia.respuesta.toLowerCase().includes("efectivo") && !ia.respuesta.toLowerCase().includes("cuánto")) {
                      respuesta += `\n\n💵 Para confirmar, dime con cuánto dinero vas a pagar en efectivo.\n(Total: ${monedaSimbolo}${totalConDelivery})`;
                    }
                    nuevoEstado = "esperando_monto";
                  }
                }
              } catch {
                respuesta = `💵 Para confirmar tu pedido, dime con cuánto dinero vas a pagar.\nPor ejemplo: *500*, *1000*, *2000*, etc.\n\n(Total a pagar: ${monedaSimbolo}${totalConDelivery})`;
                nuevoEstado = "esperando_monto";
              }
            }
          }
        } else {
          respuesta = `¿Qué te gustaría pedir? 🍽️`;
          nuevoEstado = "inicial";
        }
      }
      // Estado: esperando_pago (order confirmed, waiting for payment method)
      else if ((estadoActual === "esperando_pago" || pedidoEsperandoPago) && estadoActual !== "esperando_monto") {
        const pedido = pedidoEsperandoPago;
        if (!pedido) {
          // Check if there's a linked pedido in the session that's not in esperando_pago anymore
          if (session.pedidoId) {
            const pedidoVinculado = await storage.getPedidoById(session.pedidoId);
            if (pedidoVinculado) {
              if (pedidoVinculado.estado === "pendiente" || pedidoVinculado.estado === "en_camino") {
                respuesta = `✅ Tu pedido #${session.pedidoId} ya está confirmado y en proceso de entrega. ¡Gracias!`;
                nuevoEstado = "finalizado";
              } else if (pedidoVinculado.estado === "pendiente_confirmacion") {
                respuesta = `⏳ Tu pedido #${session.pedidoId} está siendo revisado por el negocio. Te avisaremos cuando esté confirmado.`;
              } else {
                respuesta = `¿Te gustaría hacer un nuevo pedido? 🍽️`;
                nuevoEstado = "inicial";
              }
            } else {
              respuesta = `¿Qué te gustaría pedir? 🍽️`;
              nuevoEstado = "inicial";
            }
          } else {
            respuesta = `¿Qué te gustaría pedir? 🍽️`;
            nuevoEstado = "inicial";
          }
        } else {
          const totalPedido = parseFloat(pedido.totalConfirmado || pedido.total);
          const totalConDelivery = totalPedido; // already includes delivery

          // Shortcut: if payment method is already known, skip the selection step
          if (pedido.metodoPago === "efectivo") {
            respuesta = msgPreguntaPago?.contenido || `💵 Pagarás en efectivo. ¿Con cuánto dinero vas a pagar para darte tu ${palabraDevuelta}?\n\n💰 Total: ${monedaSimbolo}${totalConDelivery}`;
            nuevoEstado = "esperando_monto";
          }
          else if (mensajeNormalizado.includes("efectivo") || mensajeNormalizado.includes("cash")) {
            respuesta = msgPreguntaPago?.contenido || `¿Con cuánto vas a pagar para darte tu ${palabraDevuelta}? 💵`;
            nuevoEstado = "esperando_monto";
          }
          else if (mensajeNormalizado.includes("transferencia")) {
            await storage.updatePedidoMetodoPago(pedido.id, "transferencia");
            await storage.updateChatWebSession(sessionId, { pedidoId: pedido.id } as any);
            let respTransfer = `🏦 *Pago por transferencia.*\n\n💰 *Total a transferir: ${monedaSimbolo}${totalConDelivery}*`;
            respTransfer += datosBancarios || "\n\nEl negocio te contactará con los datos de transferencia.";
            respTransfer += "\n\n📸 *Envía una foto del comprobante* usando el botón 📎 para confirmar tu pedido.";
            respuesta = respTransfer;
            nuevoEstado = "esperando_comprobante";
          }
          else if (mensajeNormalizado.includes("tarjeta") || mensajeNormalizado.includes("pos")) {
            await storage.updatePedidoEstado(pedido.id, "pendiente");
            await storage.updatePedidoMetodoPago(pedido.id, "tarjeta");
            respuesta = `✅ ¡Pedido confirmado!\n\n💰 Total: ${monedaSimbolo}${totalConDelivery}\n💳 El delivery cobrará con terminal POS.`;
            nuevoEstado = "finalizado";
          }
          else {
            // Unexpected message — AI fallback (sequential compound intent execution)
            try {
              const ia = await interpretarIntencionConIA(undefined, historialParaIA);
              const r = procesarAccionesIA(ia.acciones);
              if (r.cancelar) {
                await storage.updatePedidoEstado(pedido.id, "cancelado");
                respuesta = ia.respuesta || `❌ Pedido cancelado. Si deseas hacer otro pedido, escríbenos cuando quieras. 👋`;
                nuevoEstado = "finalizado";
              } else {
                let prodActualesPago: any[] = [];
                try { prodActualesPago = typeof pedido.productos === "string" ? JSON.parse(pedido.productos) : []; } catch {}
                let totalActPago = totalConDelivery;
                // Step 1: apply product changes first (independent of payment step)
                if (r.productoARemover) {
                  prodActualesPago = prodActualesPago.filter((p: any) => !String(p.nombre).toLowerCase().includes(r.productoARemover!.toLowerCase()));
                  totalActPago = prodActualesPago.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                  await storage.updatePedidoProductosYTotal(pedido.id, prodActualesPago, totalActPago.toString());
                }
                if (r.productosAAgregar.length) {
                  const nuevosProdsP = r.productosAAgregar.map((p: any) => ({
                    nombre: p.nombre, monto: p.precio, cantidad: p.cantidad,
                    textoOriginal: p.nombre, encontradoEnMenu: p.precio !== null
                  }));
                  prodActualesPago = [...prodActualesPago, ...nuevosProdsP];
                  totalActPago = prodActualesPago.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                  await storage.updatePedidoProductosYTotal(pedido.id, prodActualesPago, totalActPago.toString());
                }
                // Step 2: apply payment decision if present
                // (check for method keywords in CAMBIAR_METODO_PAGO action; let existing method-specific blocks handle actual processing)
                if (!r.metodoPago) {
                  // No payment decision yet — remind about payment options (enrich with actual data)
                  respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
                  if (!ia.respuesta.toLowerCase().includes("pagar") && !ia.respuesta.toLowerCase().includes("efectivo") && !ia.respuesta.toLowerCase().includes("transferencia") && !ia.respuesta.toLowerCase().includes("tarjeta")) {
                    const sufijoActual = `\n\n💰 Total: ${monedaSimbolo}${totalActPago}\n\n¿Cómo deseas pagar?`;
                    respuesta += sufijoActual;
                  }
                  nuevoEstado = "esperando_pago";
                }
                // If metodoPago present, the next pass of this same state will handle it via the main method blocks
                // so we re-set the message for the customer with the selection pre-answered
                if (r.metodoPago) {
                  respuesta = ia.respuesta;
                  nuevoEstado = "esperando_pago";
                  // Trigger method-specific handling by simulating updated message
                  // (AI already answers with the right information; no extra logic needed — 
                  //  but if it's a definitive method choice, commit it)
                  if (r.metodoPago === "transferencia" || r.metodoPago === "tarjeta") {
                    if (r.metodoPago === "transferencia") {
                      await storage.updatePedidoEstado(pedido.id, "pendiente");
                      await storage.updatePedidoMetodoPago(pedido.id, "transferencia");
                      if (datosBancarios && !respuesta.toLowerCase().includes("cuenta")) respuesta += datosBancarios;
                    } else {
                      await storage.updatePedidoEstado(pedido.id, "pendiente");
                      await storage.updatePedidoMetodoPago(pedido.id, "tarjeta");
                    }
                    nuevoEstado = "finalizado";
                  } else if (r.metodoPago === "efectivo") {
                    // Stay in state, prompt for exact amount
                    respuesta += `\n\n💵 ¿Con cuánto dinero vas a pagar? (Total: ${monedaSimbolo}${totalActPago})`;
                    nuevoEstado = "esperando_monto";
                  }
                }
              }
            } catch {
              let msgPago = `✅ *¡Tu pedido #${pedido.id} ha sido confirmado!*\n\n`;
              msgPago += `💰 *Total: ${monedaSimbolo}${totalConDelivery}*\n\n`;
              msgPago += `¿Cómo deseas pagar?`;
              respuesta = msgPago;
              nuevoEstado = "esperando_pago";
            }
          }
        }
      }
      
      // Estado: esperando_metodo_pago - Customer choosing payment method BEFORE location
      else if (estadoActual === "esperando_metodo_pago") {
        const subtotalProductos = productosGuardados.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
        const totalConDelivery = subtotalProductos + costoDelivery;
        
        if (mensajeNormalizado.includes("efectivo") || mensajeNormalizado.includes("cash")) {
          // Save payment method in session, ask for amount
          await storage.updateChatWebSession(sessionId, { 
            metodoPagoSeleccionado: "efectivo",
            totalEstimado: totalConDelivery.toString()
          } as any);
          respuesta = `💵 Vas a pagar en efectivo.\n\n¿Con cuánto vas a pagar para calcular tu ${palabraDevuelta}?\n\n(Total: ${monedaSimbolo}${totalConDelivery})`;
          nuevoEstado = "esperando_monto_previo";
        }
        else if (mensajeNormalizado.includes("transferencia")) {
          await storage.updateChatWebSession(sessionId, { 
            metodoPagoSeleccionado: "transferencia",
            totalEstimado: totalConDelivery.toString()
          } as any);
          const _dirTextoTrans = (session as any).clienteDireccion;
          if (_dirTextoTrans) {
            // Text address already saved → create order without GPS
            const _zipTrans = await validarZipEnDireccion(colmado.paisId, _dirTextoTrans);
            if (!_zipTrans.zipOk) {
              respuesta = `Para completar tu pedido necesito un ${_zipTrans.etiquetaCP || "código postal"} válido en tu dirección (ej: ${_zipTrans.ejemploCP || "10001"}). ¿Puedes escribir tu dirección completa con el código postal?`;
              nuevoEstado = "esperando_ubicacion";
            } else {
              const _ubicTrans = session.clienteLatitud && session.clienteLongitud
                ? `${_dirTextoTrans}\nhttps://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`
                : _dirTextoTrans;
              const _pedidoTrans = await storage.createPedido({
                colmadoId: colmado.id,
                clienteNombre: session.clienteNombre || "Cliente",
                clienteWhatsapp: session.clienteWhatsapp || "",
                clienteUbicacion: _ubicTrans,
                productos: JSON.stringify(productosGuardados),
                total: totalConDelivery.toString(),
                estado: "pendiente_confirmacion",
                montoPago: "0",
                metodoPago: "transferencia",
              });
              await storage.updateChatWebSession(sessionId, {
                productosCapturados: [], estadoConversacion: "esperando_comprobante",
                pedidoId: _pedidoTrans.id, metodoPagoSeleccionado: null,
              } as any);
              const _subMostTrans = Math.max(0, totalConDelivery - costoDelivery);
              const _listaTrans = productosGuardados.map((p: any) => p.monto ? `• ${p.nombre || "Producto"} (${monedaSimbolo}${p.monto})` : `• ${p.nombre || "Producto"}`).join("\n");
              let _rTrans = `📦 *Pedido #${_pedidoTrans.id} recibido*\n\n${_listaTrans ? `📝 *Productos:*\n${_listaTrans}\n\n` : ""}💰 Subtotal: ${monedaSimbolo}${_subMostTrans}\n🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n━━━━━━━━━━━━━━━\n*💵 Total: ${monedaSimbolo}${totalConDelivery}*\n\n🏦 *Pago:* Transferencia`;
              _rTrans += datosBancarios || "";
              _rTrans += `\n\n📄 *Envía una foto del comprobante* usando el botón 📎 para procesar tu orden.`;
              respuesta = _rTrans;
              nuevoEstado = "esperando_comprobante";
              if (colmado.whatsappNumero) {
                const _listaNTrans = productosGuardados.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n");
                await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${_pedidoTrans.id}*\n👤 ${session.clienteNombre || "Cliente"}${session.clienteWhatsapp ? ` | ${session.clienteWhatsapp}` : ""}\n📝 Productos:\n${_listaNTrans}\n💰 Total: ${monedaSimbolo}${totalConDelivery}\n📍 ${_ubicTrans}`);
              }
            }
          } else {
            let respTransfer = `🏦 *Pago por transferencia.*\n\n💰 *Total a transferir: ${monedaSimbolo}${totalConDelivery}*`;
            respTransfer += datosBancarios || "\n\nEl negocio te contactará con los datos.";
            respTransfer += `\n\n📍 Comparte tu ubicación usando el botón 📍 para completar tu pedido.`;
            respuesta = respTransfer;
            nuevoEstado = "esperando_ubicacion";
          }
        }
        else if (mensajeNormalizado.includes("tarjeta") || mensajeNormalizado.includes("pos")) {
          await storage.updateChatWebSession(sessionId, { 
            metodoPagoSeleccionado: "tarjeta",
            totalEstimado: totalConDelivery.toString()
          } as any);
          const _dirTextoTar = (session as any).clienteDireccion;
          if (_dirTextoTar) {
            // Text address already saved → create order without GPS
            const _ubicTar = session.clienteLatitud && session.clienteLongitud
              ? `${_dirTextoTar}\nhttps://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`
              : _dirTextoTar;
            const _pedidoTar = await storage.createPedido({
              colmadoId: colmado.id,
              clienteNombre: session.clienteNombre || "Cliente",
              clienteWhatsapp: session.clienteWhatsapp || "",
              clienteUbicacion: _ubicTar,
              productos: JSON.stringify(productosGuardados),
              total: totalConDelivery.toString(),
              estado: "pendiente_confirmacion",
              montoPago: "0",
              metodoPago: "tarjeta",
            });
            await storage.updateChatWebSession(sessionId, {
              productosCapturados: [], estadoConversacion: "pedido_creado",
              pedidoId: _pedidoTar.id, metodoPagoSeleccionado: null,
            } as any);
            const _subMostTar = Math.max(0, totalConDelivery - costoDelivery);
            const _listaTar = productosGuardados.map((p: any) => p.monto ? `• ${p.nombre || "Producto"} (${monedaSimbolo}${p.monto})` : `• ${p.nombre || "Producto"}`).join("\n");
            respuesta = `📦 *Pedido #${_pedidoTar.id} recibido*\n\n${_listaTar ? `📝 *Productos:*\n${_listaTar}\n\n` : ""}💰 Subtotal: ${monedaSimbolo}${_subMostTar}\n🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n━━━━━━━━━━━━━━━\n*💵 Total: ${monedaSimbolo}${totalConDelivery}*\n\n💳 *Pago:* Tarjeta (POS)\n\n⏳ El negocio revisará y te confirmará.`;
            nuevoEstado = "pedido_creado";
            if (colmado.whatsappNumero) {
              const _listaNTar = productosGuardados.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n");
              await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${_pedidoTar.id}*\n👤 ${session.clienteNombre || "Cliente"}${session.clienteWhatsapp ? ` | ${session.clienteWhatsapp}` : ""}\n📝 Productos:\n${_listaNTar}\n💰 Total: ${monedaSimbolo}${totalConDelivery}\n📍 ${_ubicTar}`);
            }
          } else {
            respuesta = `💳 El delivery cobrará con terminal POS.\n\n📍 Ahora comparte tu ubicación usando el botón 📍 para poder entregarte.`;
            nuevoEstado = "esperando_ubicacion";
          }
        }
        else {
          // Try to detect a product — user may be adding something instead of choosing payment
          const { productosEncontrados } = detectarProductosEnMensaje(mensaje);
          if (productosEncontrados.length > 0) {
            const nuevosProductos = [...productosGuardados, ...productosEncontrados];
            await storage.updateChatWebSession(sessionId, { productosCapturados: nuevosProductos } as any);
            const listaTexto = productosEncontrados.map((p: any) => {
              let linea = p.cantidad > 1 ? `• ${p.cantidad}x ${p.nombre}` : `• ${p.nombre}`;
              if (p.monto) linea += ` - ${monedaSimbolo}${p.monto}`;
              return linea;
            }).join("\n");
            const nuevoSubtotal = nuevosProductos.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
            const nuevoTotal = nuevoSubtotal + costoDelivery;
            respuesta = `✅ *Anotado:*\n${listaTexto}\n\n💰 *Total actualizado: ${monedaSimbolo}${nuevoTotal}*\n\nPara continuar, elige tu forma de pago:`;
          } else {
            // No payment method and no product — AI fallback (sequential compound execution)
            try {
              const ia = await interpretarIntencionConIA(undefined, historialParaIA);
              const r = procesarAccionesIA(ia.acciones);
              if (r.cancelar) {
                respuesta = ia.respuesta || `❌ Pedido cancelado. ¡Hasta luego! 👋`;
                nuevoEstado = "inicial";
                await storage.updateChatWebSession(sessionId, { productosCapturados: [], metodoPagoSeleccionado: null } as any);
              } else {
                let productosActMetodo = [...productosGuardados];
                let totalActMetodo = productosActMetodo.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                // Step 1: apply product changes
                if (r.productoARemover) {
                  productosActMetodo = productosActMetodo.filter((p: any) => !String(p.nombre).toLowerCase().includes(r.productoARemover!.toLowerCase()));
                  totalActMetodo = productosActMetodo.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                  await storage.updateChatWebSession(sessionId, { productosCapturados: productosActMetodo } as any);
                }
                if (r.productosAAgregar.length) {
                  const nuevosProdsM = r.productosAAgregar.map((p: any) => ({
                    nombre: p.nombre, monto: p.precio, cantidad: p.cantidad, textoOriginal: p.nombre, encontradoEnMenu: p.precio !== null
                  }));
                  productosActMetodo = [...productosActMetodo, ...nuevosProdsM];
                  totalActMetodo = productosActMetodo.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                  await storage.updateChatWebSession(sessionId, { productosCapturados: productosActMetodo } as any);
                }
                // Step 2: apply payment decision — route through same logic as keyword branches
                if (r.metodoPago === "efectivo") {
                  await storage.updateChatWebSession(sessionId, { metodoPagoSeleccionado: "efectivo", totalEstimado: totalActMetodo.toString() } as any);
                  respuesta = ia.respuesta;
                  if (!respuesta.toLowerCase().includes("cuánto") && !respuesta.toLowerCase().includes("pagar")) {
                    respuesta += `\n\n(Total: ${monedaSimbolo}${totalActMetodo})`;
                  }
                  nuevoEstado = "esperando_monto_previo";
                } else if (r.metodoPago === "transferencia") {
                  await storage.updateChatWebSession(sessionId, { metodoPagoSeleccionado: "transferencia", totalEstimado: totalActMetodo.toString() } as any);
                  const _zipAITrans = (session as any).clienteDireccion ? await validarZipEnDireccion(colmado.paisId, (session as any).clienteDireccion) : { zipOk: true, etiquetaCP: undefined, ejemploCP: undefined };
                  if (!_zipAITrans.zipOk) {
                    const _etAIT = _zipAITrans.etiquetaCP || "código postal", _ejAIT = _zipAITrans.ejemploCP || "10001";
                    respuesta = `Para completar tu pedido necesito un ${_etAIT} válido (ej: ${_ejAIT}). ¿Puedes darme tu dirección completa incluyendo el ${_etAIT}?`;
                    nuevoEstado = "esperando_ubicacion";
                  } else if (session.clienteLatitud && session.clienteLongitud) {
                    const mapsLinkM = `https://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`;
                    // -- MERGE CHECK (AI fallback, transferencia) --
                    const existentePendienteAITransfer = pedidoPendienteConfWeb && pedidoPendienteConfWeb.estado === "pendiente_confirmacion" && pedidoPendienteConfWeb.id !== (session as any).pedidoId ? pedidoPendienteConfWeb : null;
                    if (existentePendienteAITransfer) {
                      const menuAIT = await storage.getMenuProductos(colmado.id);
                      const evalAIT = evaluarElegibilidadMerge(existentePendienteAITransfer, productosActMetodo, menuAIT);
                      if (evalAIT.accion === "merge_all" || evalAIT.accion === "merge_bebidas_only") {
                        const prods = evalAIT.accion === "merge_all" ? productosActMetodo : (evalAIT.bebidasParaMerge || []);
                        const valorProds = prods.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                        const nuevoTotal = (evalAIT.valorOriginal + valorProds + costoDelivery).toString();
                        await storage.mergePedidoProductos(existentePendienteAITransfer.id, prods, nuevoTotal);
                        await storage.updatePedidoEstado(existentePendienteAITransfer.id, "pendiente_confirmacion");
                        await storage.updatePedidoMetodoPago(existentePendienteAITransfer.id, "transferencia");
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "esperando_comprobante", pedidoId: existentePendienteAITransfer.id, metodoPagoSeleccionado: null } as any);
                        respuesta = `✅ Tu Pedido #${existentePendienteAITransfer.id} fue actualizado.\n\n🏦 *Pago:* Transferencia\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}${datosBancarios || ""}\n\n📄 *Por favor envía una foto del comprobante* usando el botón 📎, para poder procesar tu orden.`;
                        nuevoEstado = "esperando_comprobante";
                        if (colmado.whatsappNumero) {
                          const pdA = await storage.getPedidoById(existentePendienteAITransfer.id);
                          let tProds: any[] = [];
                          try { tProds = typeof pdA?.productos === "string" ? JSON.parse(pdA.productos) : []; } catch {}
                          await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🔔 *Pedido #${existentePendienteAITransfer.id} actualizado*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${tProds.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`);
                        }
                      } else if (evalAIT.accion === "crear_nuevo") {
                        const pedidoAITrans = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkM, productos: JSON.stringify(productosActMetodo), total: totalActMetodo.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "transferencia" });
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "esperando_comprobante", pedidoId: pedidoAITrans.id, metodoPagoSeleccionado: null } as any);
                        let rAITrans = `📋 *Pedido #${pedidoAITrans.id} recibido*\n\n📝 *Productos:*\n${productosActMetodo.map((p: any) => `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`).join("\n")}\n\n💰 Total: ${monedaSimbolo}${totalActMetodo}`;
                        if (datosBancarios) rAITrans += datosBancarios;
                        rAITrans += `\n\n📄 *Envía el comprobante* usando el botón 📎 para procesar tu orden.`;
                        respuesta = rAITrans;
                        nuevoEstado = "esperando_comprobante";
                        if (colmado.whatsappNumero) await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${pedidoAITrans.id}*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${productosActMetodo.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Total: ${monedaSimbolo}${totalActMetodo}`);
                      } else {
                        const pedidoM = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkM, productos: JSON.stringify(productosActMetodo), total: totalActMetodo.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "transferencia" });
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "esperando_comprobante", pedidoId: pedidoM.id, metodoPagoSeleccionado: null } as any);
                        let respT = ia.respuesta;
                        if (datosBancarios && !respT.toLowerCase().includes("cuenta")) respT += datosBancarios;
                        respuesta = respT;
                        nuevoEstado = "esperando_comprobante";
                      }
                    } else {
                      const pedidoM = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkM, productos: JSON.stringify(productosActMetodo), total: totalActMetodo.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "transferencia" });
                      await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "esperando_comprobante", pedidoId: pedidoM.id, metodoPagoSeleccionado: null } as any);
                      let respT = ia.respuesta;
                      if (datosBancarios && !respT.toLowerCase().includes("cuenta")) respT += datosBancarios;
                      respuesta = respT;
                      nuevoEstado = "esperando_comprobante";
                    }
                  } else {
                    let respT = ia.respuesta;
                    if (datosBancarios && !respT.toLowerCase().includes("cuenta")) respT += datosBancarios;
                    respT += `\n\n📍 Ahora comparte tu ubicación usando el botón 📍 para poder entregarte.`;
                    respuesta = respT;
                    nuevoEstado = "esperando_ubicacion";
                  }
                } else if (r.metodoPago === "tarjeta") {
                  await storage.updateChatWebSession(sessionId, { metodoPagoSeleccionado: "tarjeta", totalEstimado: totalActMetodo.toString() } as any);
                  const _zipAITar = (session as any).clienteDireccion ? await validarZipEnDireccion(colmado.paisId, (session as any).clienteDireccion) : { zipOk: true, etiquetaCP: undefined, ejemploCP: undefined };
                  if (!_zipAITar.zipOk) {
                    const _etAITar = _zipAITar.etiquetaCP || "código postal", _ejAITar = _zipAITar.ejemploCP || "10001";
                    respuesta = `Para completar tu pedido necesito un ${_etAITar} válido (ej: ${_ejAITar}). ¿Puedes darme tu dirección completa incluyendo el ${_etAITar}?`;
                    nuevoEstado = "esperando_ubicacion";
                  } else if (session.clienteLatitud && session.clienteLongitud) {
                    const mapsLinkM = `https://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`;
                    // -- MERGE CHECK (AI fallback, tarjeta) --
                    const existentePendienteAITarjeta = pedidoPendienteConfWeb && pedidoPendienteConfWeb.estado === "pendiente_confirmacion" && pedidoPendienteConfWeb.id !== (session as any).pedidoId ? pedidoPendienteConfWeb : null;
                    if (existentePendienteAITarjeta) {
                      const menuAITar = await storage.getMenuProductos(colmado.id);
                      const evalAITar = evaluarElegibilidadMerge(existentePendienteAITarjeta, productosActMetodo, menuAITar);
                      if (evalAITar.accion === "merge_all" || evalAITar.accion === "merge_bebidas_only") {
                        const prods = evalAITar.accion === "merge_all" ? productosActMetodo : (evalAITar.bebidasParaMerge || []);
                        const valorProds = prods.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                        const nuevoTotal = (evalAITar.valorOriginal + valorProds + costoDelivery).toString();
                        await storage.mergePedidoProductos(existentePendienteAITarjeta.id, prods, nuevoTotal);
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "pedido_creado", pedidoId: existentePendienteAITarjeta.id, metodoPagoSeleccionado: null } as any);
                        respuesta = `✅ Tu Pedido #${existentePendienteAITarjeta.id} fue actualizado.\n\n💳 *Pago:* Tarjeta (POS)\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                        nuevoEstado = "pedido_creado";
                        if (colmado.whatsappNumero) {
                          const pdA = await storage.getPedidoById(existentePendienteAITarjeta.id);
                          let tProds: any[] = [];
                          try { tProds = typeof pdA?.productos === "string" ? JSON.parse(pdA.productos) : []; } catch {}
                          await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🔔 *Pedido #${existentePendienteAITarjeta.id} actualizado*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${tProds.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`);
                        }
                      } else if (evalAITar.accion === "crear_nuevo") {
                        const pedidoAITar = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkM, productos: JSON.stringify(productosActMetodo), total: totalActMetodo.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "tarjeta" });
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "pedido_creado", pedidoId: pedidoAITar.id, metodoPagoSeleccionado: null } as any);
                        respuesta = `📋 *Pedido #${pedidoAITar.id} recibido*\n\n📝 *Productos:*\n${productosActMetodo.map((p: any) => `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`).join("\n")}\n\n💰 Total: ${monedaSimbolo}${totalActMetodo}\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
                        nuevoEstado = "pedido_creado";
                        if (colmado.whatsappNumero) await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${pedidoAITar.id}*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${productosActMetodo.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Total: ${monedaSimbolo}${totalActMetodo}`);
                      } else {
                        const pedidoM = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkM, productos: JSON.stringify(productosActMetodo), total: totalActMetodo.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "tarjeta" });
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "pedido_creado", pedidoId: pedidoM.id, metodoPagoSeleccionado: null } as any);
                        respuesta = ia.respuesta;
                        nuevoEstado = "pedido_creado";
                      }
                    } else {
                      const pedidoM = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkM, productos: JSON.stringify(productosActMetodo), total: totalActMetodo.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "tarjeta" });
                      await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "pedido_creado", pedidoId: pedidoM.id, metodoPagoSeleccionado: null } as any);
                      respuesta = ia.respuesta;
                      nuevoEstado = "pedido_creado";
                    }
                  } else {
                    respuesta = ia.respuesta + `\n\n📍 Ahora comparte tu ubicación usando el botón 📍 para poder entregarte.`;
                    nuevoEstado = "esperando_ubicacion";
                  }
                } else if (r.tipos.has("AGREGAR_PRODUCTO") && !r.productosAAgregar.length) {
                  // Vague add intent ("➕ Agregar" chip or "quiero agregar algo") —
                  // ask what they want. State goes to inicial so the input is free
                  // and no Agregar/Confirmar chips block typing on this response.
                  // Chips will return naturally once the user adds products.
                  respuesta = ia.respuesta;
                  nuevoEstado = "inicial";
                } else {
                  respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
                  const needsPaymentPrompt = !ia.respuesta.toLowerCase().includes("pagar") && !ia.respuesta.toLowerCase().includes("efectivo") && !ia.respuesta.toLowerCase().includes("transferencia");
                  if (needsPaymentPrompt) {
                    respuesta += `\n\n💰 *Total: ${monedaSimbolo}${totalActMetodo}*\n\nElige tu forma de pago:`;
                  }
                  nuevoEstado = "esperando_metodo_pago";
                }
              }
            } catch {
              respuesta = `Para continuar con tu pedido, elige cómo deseas pagar:`;
            }
          }
        }
      }
      
      // Estado: esperando_monto_previo - Cash payment, waiting for amount BEFORE location
      else if (estadoActual === "esperando_monto_previo") {
        const montoMatch = mensajeNormalizado.match(/(\d+)/);
        if (!montoMatch) {
          // No number found — try to detect products first
          const { productosEncontrados } = detectarProductosEnMensaje(mensaje);
          const subtotalActual = productosGuardados.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
          const totalActual = subtotalActual + costoDelivery;
          if (productosEncontrados.length > 0) {
            const nuevosProductos = [...productosGuardados, ...productosEncontrados];
            await storage.updateChatWebSession(sessionId, { productosCapturados: nuevosProductos } as any);
            const listaTexto = productosEncontrados.map((p: any) => {
              let linea = p.cantidad > 1 ? `• ${p.cantidad}x ${p.nombre}` : `• ${p.nombre}`;
              if (p.monto) linea += ` - ${monedaSimbolo}${p.monto}`;
              return linea;
            }).join("\n");
            const nuevoSubtotal = nuevosProductos.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
            const nuevoTotal = nuevoSubtotal + costoDelivery;
            await storage.updateChatWebSession(sessionId, { totalEstimado: nuevoTotal.toString() } as any);
            respuesta = `✅ *Anotado:*\n${listaTexto}\n\n💰 *Nuevo total: ${monedaSimbolo}${nuevoTotal}*\n\n💵 ¿Con cuánto vas a pagar en efectivo?`;
          } else {
            // No number and no products — AI fallback (sequential compound execution)
            try {
              const ia = await interpretarIntencionConIA(undefined, historialParaIA);
              const r = procesarAccionesIA(ia.acciones);
              if (r.cancelar) {
                respuesta = ia.respuesta || `❌ Pedido cancelado. ¡Hasta luego! 👋`;
                nuevoEstado = "inicial";
                await storage.updateChatWebSession(sessionId, { productosCapturados: [], metodoPagoSeleccionado: null } as any);
              } else {
                // Step 1: apply product changes (may exist alongside payment intent)
                let productosActPrevio = [...productosGuardados];
                if (r.productoARemover) {
                  productosActPrevio = productosActPrevio.filter((p: any) => !String(p.nombre).toLowerCase().includes(r.productoARemover!.toLowerCase()));
                  await storage.updateChatWebSession(sessionId, { productosCapturados: productosActPrevio } as any);
                }
                if (r.productosAAgregar.length) {
                  const nuevosProdsPrevia = r.productosAAgregar.map((p: any) => ({
                    nombre: p.nombre, monto: p.precio, cantidad: p.cantidad, textoOriginal: p.nombre, encontradoEnMenu: p.precio !== null
                  }));
                  productosActPrevio = [...productosActPrevio, ...nuevosProdsPrevia];
                  const nuevoTotalPrevio = productosActPrevio.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                  await storage.updateChatWebSession(sessionId, { productosCapturados: productosActPrevio, totalEstimado: nuevoTotalPrevio.toString() } as any);
                }
                const totalPrevioActualizado = productosActPrevio.reduce((s: number, p: any) => s + (p.monto || 0), 0) + costoDelivery;
                // Step 2: apply payment decision if present
                if (r.monto) {
                  // DAR_MONTO_EFECTIVO
                  const devueltaMonto = Math.max(0, r.monto - totalPrevioActualizado);
                  await storage.updateChatWebSession(sessionId, { montoPagoCliente: r.monto.toString(), devueltaCalculada: devueltaMonto.toString() } as any);
                  respuesta = ia.respuesta;
                  nuevoEstado = "esperando_ubicacion";
                } else if (r.metodoPago && r.metodoPago !== "efectivo") {
                  await storage.updateChatWebSession(sessionId, { metodoPagoSeleccionado: r.metodoPago } as any);
                  if (r.metodoPago === "transferencia") {
                    const _zipAIMPT = (session as any).clienteDireccion ? await validarZipEnDireccion(colmado.paisId, (session as any).clienteDireccion) : { zipOk: true, etiquetaCP: undefined, ejemploCP: undefined };
                    if (!_zipAIMPT.zipOk) {
                      const _etMPT = _zipAIMPT.etiquetaCP || "código postal", _ejMPT = _zipAIMPT.ejemploCP || "10001";
                      respuesta = `Para completar tu pedido necesito un ${_etMPT} válido (ej: ${_ejMPT}). ¿Puedes darme tu dirección completa incluyendo el ${_etMPT}?`;
                      nuevoEstado = "esperando_ubicacion";
                    } else if (session.clienteLatitud && session.clienteLongitud) {
                      const mapsLinkPrevio = `https://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`;
                      // -- MERGE CHECK (AI fallback, monto_previo → transferencia) --
                      const existentePMT = pedidoPendienteConfWeb && pedidoPendienteConfWeb.estado === "pendiente_confirmacion" && pedidoPendienteConfWeb.id !== (session as any).pedidoId ? pedidoPendienteConfWeb : null;
                      if (existentePMT) {
                        const menuMT = await storage.getMenuProductos(colmado.id);
                        const evalMT = evaluarElegibilidadMerge(existentePMT, productosActPrevio, menuMT);
                        if (evalMT.accion === "merge_all" || evalMT.accion === "merge_bebidas_only") {
                          const prods = evalMT.accion === "merge_all" ? productosActPrevio : (evalMT.bebidasParaMerge || []);
                          const valorProds = prods.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                          const nuevoTotal = (evalMT.valorOriginal + valorProds + costoDelivery).toString();
                          await storage.mergePedidoProductos(existentePMT.id, prods, nuevoTotal);
                          await storage.updatePedidoEstado(existentePMT.id, "pendiente_confirmacion");
                          await storage.updatePedidoMetodoPago(existentePMT.id, "transferencia");
                          await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "esperando_comprobante", pedidoId: existentePMT.id, metodoPagoSeleccionado: null } as any);
                          let rMergeT = `✅ Tu Pedido #${existentePMT.id} fue actualizado.\n\n🏦 *Pago:* Transferencia\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                          if (datosBancarios) rMergeT += datosBancarios;
                          rMergeT += `\n\n📄 *Por favor envía una foto del comprobante* usando el botón 📎, para poder procesar tu orden.`;
                          respuesta = rMergeT;
                          nuevoEstado = "esperando_comprobante";
                          if (colmado.whatsappNumero) {
                            const pdA = await storage.getPedidoById(existentePMT.id);
                            let tProds: any[] = [];
                            try { tProds = typeof pdA?.productos === "string" ? JSON.parse(pdA.productos) : []; } catch {}
                            await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🔔 *Pedido #${existentePMT.id} actualizado*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${tProds.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`);
                          }
                        } else if (evalMT.accion === "crear_nuevo") {
                          const pedidoMT = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkPrevio, productos: JSON.stringify(productosActPrevio), total: totalPrevioActualizado.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "transferencia" });
                          await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "esperando_comprobante", pedidoId: pedidoMT.id, metodoPagoSeleccionado: null } as any);
                          let rMT = `📋 *Pedido #${pedidoMT.id} recibido*\n\n📝 *Productos:*\n${productosActPrevio.map((p: any) => `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`).join("\n")}\n\n💰 Total: ${monedaSimbolo}${totalPrevioActualizado}`;
                          if (datosBancarios) rMT += datosBancarios;
                          rMT += `\n\n📄 *Envía el comprobante* usando el botón 📎 para procesar tu orden.`;
                          respuesta = rMT;
                          nuevoEstado = "esperando_comprobante";
                          if (colmado.whatsappNumero) await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${pedidoMT.id}*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${productosActPrevio.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Total: ${monedaSimbolo}${totalPrevioActualizado}`);
                        } else {
                          const pedidoCambio = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkPrevio, productos: JSON.stringify(productosActPrevio), total: totalPrevioActualizado.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "transferencia" });
                          await storage.updateChatWebSession(sessionId, { productosCapturados: [], pedidoId: pedidoCambio.id, metodoPagoSeleccionado: null } as any);
                          let rTransfer = ia.respuesta;
                          if (datosBancarios && !rTransfer.toLowerCase().includes("cuenta")) rTransfer += datosBancarios;
                          respuesta = rTransfer;
                          nuevoEstado = "esperando_comprobante";
                        }
                      } else {
                        const pedidoCambio = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkPrevio, productos: JSON.stringify(productosActPrevio), total: totalPrevioActualizado.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "transferencia" });
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], pedidoId: pedidoCambio.id, metodoPagoSeleccionado: null } as any);
                        let rTransfer = ia.respuesta;
                        if (datosBancarios && !rTransfer.toLowerCase().includes("cuenta")) rTransfer += datosBancarios;
                        respuesta = rTransfer;
                        nuevoEstado = "esperando_comprobante";
                      }
                    } else {
                      let rTransfer = ia.respuesta;
                      if (datosBancarios && !rTransfer.toLowerCase().includes("cuenta")) rTransfer += datosBancarios;
                      rTransfer += `\n\n📍 Comparte tu ubicación con el botón 📍 para continuar.`;
                      respuesta = rTransfer;
                      nuevoEstado = "esperando_ubicacion";
                    }
                  } else if (r.metodoPago === "tarjeta") {
                    const _zipAIMPTar = (session as any).clienteDireccion ? await validarZipEnDireccion(colmado.paisId, (session as any).clienteDireccion) : { zipOk: true, etiquetaCP: undefined, ejemploCP: undefined };
                    if (!_zipAIMPTar.zipOk) {
                      const _etMPTar = _zipAIMPTar.etiquetaCP || "código postal", _ejMPTar = _zipAIMPTar.ejemploCP || "10001";
                      respuesta = `Para completar tu pedido necesito un ${_etMPTar} válido (ej: ${_ejMPTar}). ¿Puedes darme tu dirección completa incluyendo el ${_etMPTar}?`;
                      nuevoEstado = "esperando_ubicacion";
                    } else if (session.clienteLatitud && session.clienteLongitud) {
                      const mapsLinkTarjeta = `https://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`;
                      // -- MERGE CHECK (AI fallback, monto_previo → tarjeta) --
                      const existentePMTar = pedidoPendienteConfWeb && pedidoPendienteConfWeb.estado === "pendiente_confirmacion" && pedidoPendienteConfWeb.id !== (session as any).pedidoId ? pedidoPendienteConfWeb : null;
                      if (existentePMTar) {
                        const menuMTar = await storage.getMenuProductos(colmado.id);
                        const evalMTar = evaluarElegibilidadMerge(existentePMTar, productosActPrevio, menuMTar);
                        if (evalMTar.accion === "merge_all" || evalMTar.accion === "merge_bebidas_only") {
                          const prods = evalMTar.accion === "merge_all" ? productosActPrevio : (evalMTar.bebidasParaMerge || []);
                          const valorProds = prods.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                          const nuevoTotal = (evalMTar.valorOriginal + valorProds + costoDelivery).toString();
                          await storage.mergePedidoProductos(existentePMTar.id, prods, nuevoTotal);
                          await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "pedido_creado", pedidoId: existentePMTar.id, metodoPagoSeleccionado: null } as any);
                          respuesta = `✅ Tu Pedido #${existentePMTar.id} fue actualizado.\n\n💳 *Pago:* Tarjeta (POS)\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                          nuevoEstado = "pedido_creado";
                          if (colmado.whatsappNumero) {
                            const pdA = await storage.getPedidoById(existentePMTar.id);
                            let tProds: any[] = [];
                            try { tProds = typeof pdA?.productos === "string" ? JSON.parse(pdA.productos) : []; } catch {}
                            await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🔔 *Pedido #${existentePMTar.id} actualizado*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${tProds.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`);
                          }
                        } else if (evalMTar.accion === "crear_nuevo") {
                          const pedidoMTar = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkTarjeta, productos: JSON.stringify(productosActPrevio), total: totalPrevioActualizado.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "tarjeta" });
                          await storage.updateChatWebSession(sessionId, { productosCapturados: [], estadoConversacion: "pedido_creado", pedidoId: pedidoMTar.id, metodoPagoSeleccionado: null } as any);
                          respuesta = `📋 *Pedido #${pedidoMTar.id} recibido*\n\n📝 *Productos:*\n${productosActPrevio.map((p: any) => `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`).join("\n")}\n\n💰 Total: ${monedaSimbolo}${totalPrevioActualizado}\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
                          nuevoEstado = "pedido_creado";
                          if (colmado.whatsappNumero) await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${pedidoMTar.id}*\n👤 ${session.clienteNombre || "Cliente"}\n📝 Productos:\n${productosActPrevio.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Total: ${monedaSimbolo}${totalPrevioActualizado}`);
                        } else {
                          const pedidoTarjeta = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkTarjeta, productos: JSON.stringify(productosActPrevio), total: totalPrevioActualizado.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "tarjeta" });
                          await storage.updateChatWebSession(sessionId, { productosCapturados: [], pedidoId: pedidoTarjeta.id, metodoPagoSeleccionado: null } as any);
                          respuesta = ia.respuesta;
                          nuevoEstado = "pedido_creado";
                        }
                      } else {
                        const pedidoTarjeta = await storage.createPedido({ colmadoId: colmado.id, clienteNombre: session.clienteNombre || "Cliente", clienteWhatsapp: session.clienteWhatsapp || "", clienteUbicacion: mapsLinkTarjeta, productos: JSON.stringify(productosActPrevio), total: totalPrevioActualizado.toString(), estado: "pendiente_confirmacion", montoPago: "0", metodoPago: "tarjeta" });
                        await storage.updateChatWebSession(sessionId, { productosCapturados: [], pedidoId: pedidoTarjeta.id, metodoPagoSeleccionado: null } as any);
                        respuesta = ia.respuesta;
                        nuevoEstado = "pedido_creado";
                      }
                    } else {
                      respuesta = ia.respuesta + `\n\n📍 Comparte tu ubicación con el botón 📍 para continuar.`;
                      nuevoEstado = "esperando_ubicacion";
                    }
                  }
                } else {
                  // No payment decision yet — answer question/product added, stay in same state
                  respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
                  if (!ia.respuesta.toLowerCase().includes("efectivo") && !ia.respuesta.toLowerCase().includes("cuánto") && !ia.respuesta.toLowerCase().includes("pagar")) {
                    respuesta += `\n\n💵 Para continuar, dime con cuánto dinero vas a pagar en efectivo.\n(Total: ${monedaSimbolo}${totalPrevioActualizado})`;
                  }
                  nuevoEstado = "esperando_monto_previo";
                }
              }
            } catch {
              respuesta = `💵 Dime con cuánto dinero vas a pagar para calcular tu ${palabraDevuelta}.\nEjemplo: *500*, *1000*, *2000*\n\n(Total: ${monedaSimbolo}${totalActual})`;
              nuevoEstado = "esperando_monto_previo";
            }
          }
        } else {
          const subtotalProductos = productosGuardados.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
          const totalConDelivery = subtotalProductos + costoDelivery;
          const montoPago = parseInt(montoMatch[1]);
          const devuelta = Math.max(0, montoPago - totalConDelivery);
          
          // Save the payment amount in session
          await storage.updateChatWebSession(sessionId, { 
            montoPagoCliente: montoPago.toString(),
            devueltaCalculada: devuelta.toString()
          } as any);
          
          // Always ask for location — even if one is saved, always confirm current delivery address
          respuesta = `💵 Pagas con: ${monedaSimbolo}${montoPago}\n🔄 ${palabraDevuelta.charAt(0).toUpperCase()}${palabraDevuelta.slice(1)}: ${monedaSimbolo}${devuelta}\n\n📍 Ahora comparte tu ubicación usando el botón 📍 para poder entregarte.`;
          nuevoEstado = "esperando_ubicacion";
        }
      }
      
      // ============ POST-ORDER AI HANDLERS ============

      // Estado: pedido_creado — pedido enviado al negocio, pendiente de confirmación o acciones post-pedido
      if (!respuesta && estadoActual === "pedido_creado") {
        const pedidoActual = session.pedidoId ? await storage.getPedidoById(session.pedidoId) : null;

        let prodsActuales: any[] = [];
        if (pedidoActual) {
          try {
            prodsActuales = typeof pedidoActual.productos === "string"
              ? JSON.parse(pedidoActual.productos)
              : (pedidoActual.productos || []);
          } catch {}
        }

        const estadoRealTexto: Record<string, string> = {
          "pendiente_confirmacion": "pendiente de confirmación por el negocio (aún NO confirmado)",
          "en_camino": "en camino a tu ubicación",
          "entregado": "entregado",
          "cancelado": "cancelado por el negocio",
          "pendiente": "confirmado — en preparación",
        };

        const prodsLineas = prodsActuales.map((p: any) =>
          `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
        ).join("\n");
        const totalActualPedido = pedidoActual
          ? (parseFloat(pedidoActual.totalConfirmado || pedidoActual.total || "0") || 0)
          : 0;
        const estadoRealPedido = pedidoActual?.estado || "pendiente_confirmacion";

        const extraContexto = pedidoActual
          ? `PEDIDO ACTUAL: Pedido #${pedidoActual.id} | Estado REAL en sistema: ${estadoRealTexto[estadoRealPedido] || estadoRealPedido} | Método de pago: ${pedidoActual.metodoPago || "efectivo"} | Total: ${monedaSimbolo}${totalActualPedido}\nProductos pedidos:\n${prodsLineas}\n\nINSTRUCCIÓN OBLIGATORIA: Siempre menciona el estado del Pedido #${pedidoActual.id} en tu respuesta. Nunca respondas con un saludo genérico como "¡Hola! ¿En qué puedo ayudarte?" si hay un pedido activo — el cliente ya hizo su pedido y necesita contexto sobre él. Si el mensaje del cliente es confuso o ambiguo, responde algo como "Tu Pedido #${pedidoActual.id} está ${estadoRealTexto[estadoRealPedido] || estadoRealPedido}. ¿En qué más te puedo ayudar?"\nSi el cliente quiere agregar productos nuevos: usa NUEVO_PEDIDO con la lista de productos (se creará automáticamente un segundo pedido con los mismos datos de entrega).\nAlternativamente, AGREGAR_PRODUCTO también crea un segundo pedido en este estado.\nSi quiere hacer un pedido COMPLETAMENTE nuevo desde cero: usa NUEVA_ORDEN.\nNUNCA digas que el pedido está "confirmado" si el estado real es "pendiente_confirmacion" — solo está ESPERANDO que el negocio lo confirme.\nSi el cliente quiere cancelar su pedido, usa acción CANCELAR — el sistema iniciará el flujo de confirmación automáticamente.`
          : undefined;

        try {
          const ia = await interpretarIntencionConIA(extraContexto, historialParaIA);
          const r = procesarAccionesIA(ia.acciones);

          // Handle AGREGAR_PRODUCTO or NUEVO_PEDIDO — apply merge or create new order
          const productosParaSegundoPedido = r.nuevoPedidoProductos.length > 0
            ? r.nuevoPedidoProductos
            : r.productosAAgregar;

          if (productosParaSegundoPedido.length > 0) {
            const nuevosProd = productosParaSegundoPedido.map((p: any) => ({
              nombre: p.nombre,
              monto: p.precio,
              cantidad: p.cantidad || 1,
              encontradoEnMenu: p.precio != null,
            }));

            const mapsLink = session.clienteLatitud && session.clienteLongitud
              ? `https://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`
              : (pedidoActual?.clienteUbicacion || "Sin ubicación");

            const listaTexto = (prods: any[]) => prods.map((p: any) =>
              `• ${p.cantidad > 1 ? p.cantidad + "x " : ""}${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
            ).join("\n");

            if (pedidoActual && pedidoActual.estado === "pendiente_confirmacion") {
              // Apply merge rules for pending-confirmation orders
              const menuProductosWeb = await storage.getMenuProductos(colmado.id);
              const eval_ = evaluarElegibilidadMerge(pedidoActual, nuevosProd, menuProductosWeb);

              if (eval_.accion === "merge_all") {
                // Use pedidoActual.total as base (already includes delivery), then add new products only
                const baseTotal = parseFloat(pedidoActual.total || "0");
                const nuevoTotal = (baseTotal + eval_.valorNuevo).toString();
                await storage.mergePedidoProductos(pedidoActual.id, nuevosProd, nuevoTotal);
                respuesta = `✅ Tu Pedido #${pedidoActual.id} fue actualizado.\n\n📝 *Añadido:*\n${listaTexto(nuevosProd)}\n\n💰 Nuevo total estimado: ${monedaSimbolo}${nuevoTotal}\n\n⏳ El negocio revisará el pedido completo.`;
                if (colmado.whatsappNumero) {
                  const pedidoActualizado = await storage.getPedidoById(pedidoActual.id);
                  let todosProds: any[] = [];
                  try { todosProds = typeof pedidoActualizado?.productos === "string" ? JSON.parse(pedidoActualizado.productos) : []; } catch {}
                  const msgNegocio = `🔔 *Pedido #${pedidoActual.id} actualizado* (se añadieron productos)\n👤 ${session.clienteNombre || pedidoActual.clienteNombre}\n📝 Productos completos:\n${todosProds.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                  await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
                }

              } else if (eval_.accion === "merge_bebidas_only") {
                const bebidas = eval_.bebidasParaMerge || [];
                const noBebidas = eval_.noBebidasExcluidas || [];
                if (bebidas.length > 0) {
                  const baseTotal = parseFloat(pedidoActual.total || "0");
                  const valorBebidas = bebidas.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                  const nuevoTotal = (baseTotal + valorBebidas).toString();
                  await storage.mergePedidoProductos(pedidoActual.id, bebidas, nuevoTotal);
                  respuesta = `⏰ Ya pasaron los 5 minutos, solo podemos añadir bebidas.\n\n✅ Se añadió al Pedido #${pedidoActual.id}:\n${listaTexto(bebidas)}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                  if (noBebidas.length > 0) {
                    respuesta += `\n\n⚠️ No se pudieron añadir (no son bebidas):\n${listaTexto(noBebidas)}`;
                  }
                  if (colmado.whatsappNumero) {
                    const pedidoActualizado = await storage.getPedidoById(pedidoActual.id);
                    let todosProds: any[] = [];
                    try { todosProds = typeof pedidoActualizado?.productos === "string" ? JSON.parse(pedidoActualizado.productos) : []; } catch {}
                    const msgNegocio = `🔔 *Pedido #${pedidoActual.id} actualizado* (bebidas añadidas)\n👤 ${session.clienteNombre || pedidoActual.clienteNombre}\n📝 Productos completos:\n${todosProds.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                    await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
                  }
                } else {
                  // No beverages in request — create new order directly
                  const segundoPedidoBebidas = await storage.createPedido({
                    colmadoId: colmado.id,
                    clienteNombre: session.clienteNombre || pedidoActual.clienteNombre || "Cliente",
                    clienteWhatsapp: session.clienteWhatsapp || pedidoActual.clienteWhatsapp || "",
                    clienteUbicacion: mapsLink,
                    productos: JSON.stringify(nuevosProd),
                    total: "0",
                    estado: "pendiente_confirmacion",
                    montoPago: "0",
                    metodoPago: pedidoActual.metodoPago || "efectivo",
                  });
                  await storage.updateChatWebSession(sessionId, { pedidoId: segundoPedidoBebidas.id } as any);
                  respuesta = `📋 *Pedido #${segundoPedidoBebidas.id} recibido*\n\n📝 *Productos:*\n${listaTexto(nuevosProd)}\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
                  if (colmado.whatsappNumero) {
                    await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${segundoPedidoBebidas.id}*\n👤 ${session.clienteNombre || pedidoActual.clienteNombre}\n📝 Productos:\n${nuevosProd.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}`);
                  }
                }

              } else if (eval_.accion === "crear_nuevo") {
                // Create new order directly instead of asking
                const segundoPedidoNuevo = await storage.createPedido({
                  colmadoId: colmado.id,
                  clienteNombre: session.clienteNombre || pedidoActual.clienteNombre || "Cliente",
                  clienteWhatsapp: session.clienteWhatsapp || pedidoActual.clienteWhatsapp || "",
                  clienteUbicacion: mapsLink,
                  productos: JSON.stringify(nuevosProd),
                  total: "0",
                  estado: "pendiente_confirmacion",
                  montoPago: "0",
                  metodoPago: pedidoActual.metodoPago || "efectivo",
                });
                await storage.updateChatWebSession(sessionId, { pedidoId: segundoPedidoNuevo.id } as any);
                respuesta = `📋 *Pedido #${segundoPedidoNuevo.id} recibido*\n\n📝 *Productos:*\n${listaTexto(nuevosProd)}\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
                if (colmado.whatsappNumero) {
                  await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, `🛒 *Nuevo pedido #${segundoPedidoNuevo.id}*\n👤 ${session.clienteNombre || pedidoActual.clienteNombre}\n📝 Productos:\n${nuevosProd.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}`);
                }

              } else {
                // crear_nuevo_por_valor — new value > original, create separate order
                const segundoPedido = await storage.createPedido({
                  colmadoId: colmado.id,
                  clienteNombre: session.clienteNombre || pedidoActual.clienteNombre || "Cliente",
                  clienteWhatsapp: session.clienteWhatsapp || pedidoActual.clienteWhatsapp || "",
                  clienteUbicacion: mapsLink,
                  productos: JSON.stringify(nuevosProd),
                  total: eval_.valorNuevo.toString(),
                  estado: "pendiente_confirmacion",
                  montoPago: "0",
                  metodoPago: pedidoActual.metodoPago || "efectivo",
                });
                respuesta = `📋 *Pedido #${segundoPedido.id} creado* (el importe supera el pedido original).\n\n${listaTexto(nuevosProd)}\n\n⏳ El negocio revisará ambos pedidos.`;
              }

            } else {
              // Order already confirmed / in-progress — create second order as before
              const segundoPedido = await storage.createPedido({
                colmadoId: colmado.id,
                clienteNombre: session.clienteNombre || pedidoActual?.clienteNombre || "Cliente",
                clienteWhatsapp: session.clienteWhatsapp || pedidoActual?.clienteWhatsapp || "",
                clienteUbicacion: mapsLink,
                productos: JSON.stringify(nuevosProd),
                total: nuevosProd.reduce((s: number, p: any) => s + (p.monto || 0), 0).toString(),
                estado: "pendiente_confirmacion",
                montoPago: "0",
                metodoPago: pedidoActual?.metodoPago || "efectivo",
                notas: pedidoActual ? `⚠️ Enviar junto con Pedido #${pedidoActual.id} — Delivery incluido en pedido original` : undefined,
              });
              respuesta = `✅ *Pedido #${segundoPedido.id} creado* 🎉\n\n${listaTexto(nuevosProd)}\n\n📦 El negocio lo enviará junto con tu Pedido #${pedidoActual?.id}.\n🛵 Costo de delivery ya incluido en el pedido original.`;
            }
          } else if (r.cancelar) {
            // 2-step cancel flow — show details and ask confirmation
            if (pedidosCancelablesBot.length === 0) {
              const hayActivos = pedidosActivosCliente.length > 0;
              if (hayActivos) {
                const pedidoActivo = pedidosActivosCliente[0];
                respuesta = `Para cancelar tu Pedido *#${pedidoActivo.id}*, comunícate directamente con *${colmado.nombre}*. 📞 El pedido ya fue confirmado y no puede cancelarse desde aquí.`;
              } else if (pedidoActual) {
                respuesta = `Para cancelar tu Pedido *#${pedidoActual.id}*, comunícate directamente con *${colmado.nombre}*. 📞 El pedido ya fue confirmado.`;
              } else {
                respuesta = `No tienes pedidos activos para cancelar. ¿En qué te puedo ayudar?`;
              }
            } else if (pedidosCancelablesBot.length === 1) {
              const p = pedidosCancelablesBot[0];
              await storage.updateChatWebSession(sessionId, { estadoConversacion: `confirmando_cancelacion:${p.id}` } as any);
              nuevoEstado = `confirmando_cancelacion:${p.id}`;
              respuesta = `${formatearDetallePedido(p)}\n\n¿Confirmas que deseas cancelar este pedido?\n\nResponde *sí* para cancelar o *no* para dejarlo activo.`;
            } else {
              const [p1, p2] = pedidosCancelablesBot;
              await storage.updateChatWebSession(sessionId, { estadoConversacion: `eligiendo_pedido_cancelar:${p1.id},${p2.id}` } as any);
              nuevoEstado = `eligiendo_pedido_cancelar:${p1.id},${p2.id}`;
              respuesta = `Tienes varios pedidos activos. ¿Cuál deseas cancelar?\n\n*Opción 1:*\n${formatearDetallePedido(p1)}\n\n*Opción 2:*\n${formatearDetallePedido(p2)}\n\nResponde *1* o *2*.`;
            }
          } else if (r.nuevaOrden) {
            await storage.updateChatWebSession(sessionId, {
              productosCapturados: [],
              estadoConversacion: "inicial",
              pedidoId: null,
            } as any);
            nuevoEstado = "inicial";
            respuesta = ia.respuesta || `¡Claro! Empecemos un nuevo pedido. 🛒 ¿Qué te gustaría ordenar hoy?`;
          } else {
            // AI didn't extract products into an action — but if the customer
            // has session-captured products AND is pressing "Confirmar" / "sí",
            // create the second order from those products directly instead of
            // showing a misleading AI summary that looks like a placed order.
            const esConfirmacionNuevoPedido =
              mensajeNormalizado.includes("confirmar") ||
              mensaje.includes("✅") ||
              mensajeNormalizado === "si" || mensajeNormalizado === "sí" ||
              mensajeNormalizado.includes("confirmo") ||
              mensajeNormalizado.includes("listo") ||
              mensajeNormalizado.includes("dale");
            if (esConfirmacionNuevoPedido && productosGuardados.length > 0) {
              const nuevosProdConf = productosGuardados.map((p: any) => ({
                nombre: p.nombre, monto: p.monto, cantidad: p.cantidad || 1,
                textoOriginal: p.textoOriginal || p.nombre, encontradoEnMenu: p.encontradoEnMenu || false
              }));
              const mapsLinkConf = session.clienteLatitud && session.clienteLongitud
                ? `https://maps.google.com/?q=${session.clienteLatitud},${session.clienteLongitud}`
                : (pedidoActual?.clienteUbicacion || "Sin ubicación");
              const segundoPedidoConf = await storage.createPedido({
                colmadoId: colmado.id,
                clienteNombre: session.clienteNombre || pedidoActual?.clienteNombre || "Cliente",
                clienteWhatsapp: session.clienteWhatsapp || pedidoActual?.clienteWhatsapp || "",
                clienteUbicacion: mapsLinkConf,
                productos: JSON.stringify(nuevosProdConf),
                total: nuevosProdConf.reduce((s: number, p: any) => s + (p.monto || 0), 0).toString(),
                estado: "pendiente_confirmacion",
                montoPago: "0",
                metodoPago: pedidoActual?.metodoPago || "efectivo",
                notas: pedidoActual
                  ? `⚠️ Enviar junto con Pedido #${pedidoActual.id} — Delivery incluido en pedido original`
                  : undefined,
              });
              await storage.updateChatWebSession(sessionId, {
                productosCapturados: [],
                pedidoId: segundoPedidoConf.id
              } as any);
              const listaConfTexto = nuevosProdConf.map((p: any) =>
                `• ${p.cantidad > 1 ? p.cantidad + "x " : ""}${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
              ).join("\n");
              respuesta = `✅ *Pedido #${segundoPedidoConf.id} creado* 🎉\n\n${listaConfTexto}\n\n📦 El negocio lo enviará junto con tu Pedido #${pedidoActual?.id}.\n🛵 Costo de delivery ya incluido en el pedido original.`;
              nuevoEstado = "pedido_creado";
              if (colmado.whatsappNumero) {
                await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero,
                  `🛒 *Nuevo pedido #${segundoPedidoConf.id}*\n👤 ${session.clienteNombre || pedidoActual?.clienteNombre}\n📝 Productos:\n${nuevosProdConf.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}`
                );
              }
            } else {
              respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
            }
          }
        } catch {
          const estTexto = estadoRealTexto[pedidoActual?.estado || "pendiente_confirmacion"] || "en proceso";
          respuesta = `Tu Pedido #${pedidoActual?.id || ""} está ${estTexto}. ¿En qué más te puedo ayudar? 😊`;
        }
      }

      // Estado: esperando_comprobante — esperando foto del comprobante de transferencia
      if (!respuesta && estadoActual === "esperando_comprobante") {
        const pedidoActual = session.pedidoId ? await storage.getPedidoById(session.pedidoId) : null;

        let prodsActuales: any[] = [];
        if (pedidoActual) {
          try {
            prodsActuales = typeof pedidoActual.productos === "string"
              ? JSON.parse(pedidoActual.productos)
              : (pedidoActual.productos || []);
          } catch {}
        }

        const totalActualPedido = pedidoActual
          ? (parseFloat(pedidoActual.totalConfirmado || pedidoActual.total || "0") || 0)
          : 0;
        const prodsLineas = prodsActuales.map((p: any) =>
          `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
        ).join("\n");

        const extraContexto = pedidoActual
          ? `PEDIDO ACTUAL: Pedido #${pedidoActual.id} | Estado: esperando foto del comprobante de transferencia bancaria | Total a transferir: ${monedaSimbolo}${totalActualPedido}\nProductos:\n${prodsLineas}\n\nEl cliente DEBE enviar una foto del comprobante para confirmar el pago. Responde sus preguntas, pero al final siempre recuérdale enviar la foto del comprobante.`
          : `El cliente está esperando enviar un comprobante de transferencia. Responde sus preguntas y siempre recuérdale enviar la foto del comprobante.`;

        try {
          const ia = await interpretarIntencionConIA(extraContexto, historialParaIA);
          const r = procesarAccionesIA(ia.acciones);
          let baseResp = enriquecerRespuestaConDatos(ia.respuesta, r);
          if (!baseResp.toLowerCase().includes("comprobante") && !baseResp.toLowerCase().includes("foto") && !baseResp.toLowerCase().includes("📸")) {
            baseResp += `\n\n📸 Recuerda enviar la foto del comprobante de transferencia para confirmar tu pedido.`;
          }
          respuesta = baseResp;
        } catch {
          respuesta = `📸 Para confirmar tu pedido, envía la foto del comprobante de transferencia usando el botón 📎, para poder procesar tu orden.`;
        }
      }

      // Estado: finalizado — pedido finalizado, pago confirmado
      if (!respuesta && estadoActual === "finalizado") {
        const pedidoActual = session.pedidoId ? await storage.getPedidoById(session.pedidoId) : null;

        let prodsActuales: any[] = [];
        if (pedidoActual) {
          try {
            prodsActuales = typeof pedidoActual.productos === "string"
              ? JSON.parse(pedidoActual.productos)
              : (pedidoActual.productos || []);
          } catch {}
        }

        const totalActualPedido = pedidoActual
          ? (parseFloat(pedidoActual.totalConfirmado || pedidoActual.total || "0") || 0)
          : 0;
        const prodsLineas = prodsActuales.map((p: any) =>
          `• ${p.nombre}${p.monto ? ` - ${monedaSimbolo}${p.monto}` : ""}`
        ).join("\n");

        const estadoFinalizadoTexto: Record<string, string> = {
          "entregado": "entregado ✅",
          "en_camino": "en camino 🚴",
          "cancelado": "cancelado ❌",
          "pendiente": "confirmado — en preparación 🍳",
          "pendiente_confirmacion": "pendiente de confirmación por el negocio ⏳",
        };
        const estadoFinalizadoDesc = pedidoActual
          ? (estadoFinalizadoTexto[pedidoActual.estado] || pedidoActual.estado)
          : "completado";

        const extraContexto = pedidoActual
          ? `PEDIDO ANTERIOR: Pedido #${pedidoActual.id} | Estado real: ${estadoFinalizadoDesc} | Total pagado: ${monedaSimbolo}${totalActualPedido}\nProductos:\n${prodsLineas}\n\nSi el cliente quiere hacer un pedido nuevo: usa NUEVA_ORDEN.`
          : `El pedido fue completado y el pago confirmado. Si el cliente quiere hacer un pedido nuevo, usa NUEVA_ORDEN.`;

        try {
          const ia = await interpretarIntencionConIA(extraContexto, historialParaIA);
          const r = procesarAccionesIA(ia.acciones);

          if (r.nuevaOrden) {
            await storage.updateChatWebSession(sessionId, {
              productosCapturados: [],
              estadoConversacion: "inicial",
              pedidoId: null,
            } as any);
            nuevoEstado = "inicial";
            respuesta = ia.respuesta || `¡Claro! Empecemos un nuevo pedido. 🛒 ¿Qué te gustaría ordenar hoy?`;
          } else {
            respuesta = enriquecerRespuestaConDatos(ia.respuesta, r);
          }
        } catch {
          respuesta = `¡Gracias por tu compra! 😊 ¿Te gustaría hacer otro pedido?`;
        }
      }

      // === AI-powered handler: handles inicial, preguntando_algo_mas, and all free-text states ===
      // Protect ALL structured/terminal states from AI fallback
      const estadosDePago = ["esperando_metodo_pago", "esperando_monto_previo", "esperando_pago", "esperando_monto",
        "esperando_nombre", "esperando_direccion"];
      const palabrasMetodoPago = ["efectivo", "cash", "transferencia", "tarjeta", "pos", "credito", "débito", "debito", "pago exacto"];
      const esPalabraMetodoPago = palabrasMetodoPago.some(p => mensajeNormalizado === p || mensajeNormalizado.includes(p));
      
      // ── Interceptar saludos en inglés (sin AI) ────────────────────────────────
      // Treat English greetings as normal greetings — respond in Spanish, no language warnings
      if (!respuesta && !estadosDePago.includes(estadoActual)) {
        const msgSinPuntuacion = mensajeNormalizado.replace(/[^a-záéíóúüñ0-9\s]/gi, "").trim();
        const saludosIngles = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "good night", "whats up", "what's up", "howdy", "greetings"];
        const esSaludoIngles = saludosIngles.some(s => msgSinPuntuacion === s || msgSinPuntuacion.startsWith(s + " ") || msgSinPuntuacion.endsWith(" " + s));
        if (esSaludoIngles) {
          // On first message the welcome prefix is prepended automatically — skip the extra greeting
          respuesta = esPrimerMensaje ? "¿En qué te puedo ayudar? 😊" : "¡Hola! 👋 ¿En qué te puedo ayudar?";
        }
      }

      // ── Detección directa de "ver menú" (sin AI) ─────────────────────────────
      // Triggered only when the message is purely a menu request, not a product order
      if (!respuesta && !esPalabraMetodoPago && !estadosDePago.includes(estadoActual)) {
        const palabrasMenu = ["menú", "menu", "carta", "qué tienen", "que tienen", "qué hay", "que hay",
          "qué ofrecen", "que ofrecen", "qué venden", "que venden", "ver menú", "ver menu",
          "muéstrame el menú", "muéstrame el menu", "muestrame el menú", "muestrame el menu",
          "cuál es el menú", "cual es el menú", "cuál es el menu", "cual es el menu",
          "qué tienen disponible", "que tienen disponible", "qué tienen de", "que tienen de",
          "productos disponibles", "qué productos", "que productos", "sus productos",
          "sus precios", "qué precio", "que precio", "los precios", "ver precios",
          "opciones", "lista de productos", "lista de precios"];

        // Only intercept if: message matches a menu keyword AND doesn't look like an order
        const matchesMenuKeyword = palabrasMenu.some(k => mensajeNormalizado === k || mensajeNormalizado.startsWith(k + " ") || mensajeNormalizado.endsWith(" " + k) || mensajeNormalizado.includes(k));
        const palabrasOrden = ["quiero", "quisiera", "dame", "ponme", "tráeme", "traeme", "me das", "me pones", "necesito", "pedir", "ordenar", "agregar", "añadir", "agrégame", "ponme", "una", "un ", "dos", "tres", "cuatro", "cinco"];
        const pareceOrden = palabrasOrden.some(p => mensajeNormalizado.includes(p));

        if (matchesMenuKeyword && !pareceOrden) {
          const menuDisp = menuProductos.filter((p: any) => p.disponible !== false);
          if (menuDisp.length > 0) {
            respuesta = respuestaMenu();
          }
        }
      }

      // ── Detección de extras/adicionales del menú ────────────────────────────
      // Adds matched extras to the cart BEFORE AI processing so both the extra
      // and any main product in the same message are captured correctly.
      // We mutate the cart here but do NOT set `respuesta` — the AI handler
      // (or whatever fires next) still runs and handles the full message.
      // A prefix confirmation note is stored separately and prepended to the
      // final response after all handlers have produced one.
      let extrasPrefix = "";
      if (!estadosDePago.includes(estadoActual) && !["pedido_creado", "esperando_comprobante", "finalizado", "esperando_ubicacion"].includes(estadoActual)) {
        const categoriasExtras = ["extras", "extra", "adicionales", "adicional", "toppings", "topping", "complementos", "complemento", "agregados", "agregado"];
        const productosExtras = menuProductos.filter((p: any) => 
          p.disponible !== false && categoriasExtras.some(c => (p.categoria || "").toLowerCase().trim() === c)
        );
        if (productosExtras.length > 0) {
          const normalizar = (s: string) => s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9 ]/g, " ").trim();
          const msgNorm = normalizar(mensaje);
          const extrasDetectados: Array<{ nombre: string; monto: number | null; cantidad: number; textoOriginal: string; encontradoEnMenu: boolean }> = [];
          for (const prod of productosExtras) {
            const nombreNorm = normalizar(prod.nombre);
            if (nombreNorm.length >= 3 && msgNorm.includes(nombreNorm)) {
              const precio = prod.precio ? parseFloat(prod.precio) : null;
              extrasDetectados.push({ nombre: prod.nombre, monto: precio, cantidad: 1, textoOriginal: prod.nombre, encontradoEnMenu: precio !== null });
            }
          }
          if (extrasDetectados.length > 0) {
            // Update in-memory cart so downstream AI handler sees the full cart
            productosGuardados = [...productosGuardados, ...extrasDetectados];
            await storage.updateChatWebSession(sessionId, { productosCapturados: productosGuardados } as any);
            const listaExtras = extrasDetectados.map((e: any) => `• ${e.nombre}${e.monto ? ` (+${monedaSimbolo}${e.monto})` : ""}`).join("\n");
            extrasPrefix = `✅ *Agregado al pedido:*\n${listaExtras}`;
          }
        }
      }

      if (!respuesta && !esPalabraMetodoPago && !estadosDePago.includes(estadoActual)) {
        const msgPromptBase = await storage.getMensajeSistema("system_prompt_base");
        const globalPromptConfig = await storage.getConfiguracion("system_prompt_global");
        const globalSystemPrompt = globalPromptConfig?.valor || "";
        
        // DELYWA: solo las expresiones que aparecen en el mensaje (del colmado y del país), no el diccionario entero.
        const jergaColmado = await storage.buscarEnDiccionario(colmado.id, mensaje);
        let jergaContext = "";
        if (jergaColmado.length > 0) {
          jergaContext = "\n\nDICCIONARIO DE JERGA LOCAL:\n" +
            jergaColmado.map((j: any) => `- "${j.jerga}" = ${j.productoIdentificado}${j.precioSugerido ? ` (precio: ${j.precioSugerido})` : ""}`).join("\n");
        }
        
        let menuAIContext = "";
        const menuDisponibles = menuProductos.filter((p: any) => p.disponible);
        if (menuDisponibles.length > 0) {
          const menuCategorias = new Map<string, typeof menuProductos>();
          menuDisponibles.forEach((p: any) => {
            const cat = p.categoria || "General";
            if (!menuCategorias.has(cat)) menuCategorias.set(cat, []);
            menuCategorias.get(cat)!.push(p);
          });
          menuAIContext = "\n\nMENÚ DEL NEGOCIO:\n";
          menuCategorias.forEach((items: any, cat: string) => {
            menuAIContext += `\n${cat}:\n`;
            items.forEach((item: any) => {
              const precio = item.precio ? parseFloat(item.precio) : null;
              menuAIContext += `- ${item.nombre}${precio ? ` - ${monedaSimbolo}${precio}` : ""}\n`;
            });
          });
        }
        
        const conocimientoArchivos = await storage.getConocimientoByTipo(colmado.tipoNegocio || "colmado");
        let conocimientoContext = "";
        if (conocimientoArchivos.length > 0) {
          conocimientoContext = "\n\nDATOS DE CONOCIMIENTO DEL NEGOCIO:\n" +
            conocimientoArchivos.map((a: any) => `--- ${a.nombre} ---\n${a.contenido}`).join("\n\n");
        }
        
        const cartDisplay = productosGuardados.length > 0
          ? productosGuardados.map((p: any) => {
              let line = p.cantidad > 1 ? `• ${p.cantidad}x ${p.nombre}` : `• ${p.nombre}`;
              if (p.monto) line += ` (${monedaSimbolo}${p.monto})`;
              return line;
            }).join("\n")
          : "vacío";
        
        const tiempoEstimado = colmado.tiempoEstimado || "20-30 min";
        const clienteDireccion = (session as any).clienteDireccion || (session as any).clienteUbicacion || "";
        const promptBase = (colmadoRaw as any).botPromptCustom || globalSystemPrompt || msgPromptBase?.contenido ||
          `Eres un asistente amigable de pedidos. Usas lenguaje local y emojis.`;

        // Build address format context from the colmado's country
        let addressFormatContext = "";
        if (colmadoRaw.paisId) {
          const paisDir = await storage.getPais(colmadoRaw.paisId);
          if (paisDir) {
            const etiquetaDir = "Dirección";
            const etiquetaEst = paisDir.etiquetaEstado || "Provincia";
            const etiquetaCP = paisDir.etiquetaCodigoPostal;
            const ejDir = paisDir.ejemploDireccion || "Calle Principal #123";
            const ejCiudad = paisDir.ejemploCiudad || "Santo Domingo";
            const ejEst = paisDir.ejemploEstado || "Distrito Nacional";
            const ejCP = paisDir.ejemploCodigoPostal;
            const partsEjemplo = [ejDir, ejCiudad, ejEst, ejCP].filter(Boolean).join(", ");
            const zipRequiredWeb = paisDir.requiereCodigoPostal && etiquetaCP;
            const patronCPWeb = (paisDir as any).patronCodigoPostal;
            addressFormatContext = `\nFORMATO DE DIRECCIÓN PARA ESTE PAÍS (${paisDir.nombre}):
- Campo principal: ${etiquetaDir} (ej: ${ejDir})
- ${etiquetaEst} (ej: ${ejEst})
- Ciudad (ej: ${ejCiudad})${etiquetaCP ? `\n- ${etiquetaCP}${ejCP ? ` (ej: ${ejCP})` : ""}` : ""}
- Ejemplo completo: "${partsEjemplo}"
Cuando el cliente escriba su dirección en texto, captura todos los campos aplicables en direccionTexto con este formato.${zipRequiredWeb ? `\nVALIDACIÓN ZIP OBLIGATORIA: Este negocio requiere ${etiquetaCP} en toda dirección. Si el cliente ya proporcionó su dirección pero NO contiene un código postal (secuencia de dígitos como ${ejCP || "10001"}), NO la guardes — responde pidiendo que incluya el ${etiquetaCP}. Ej: "Para completar tu pedido, necesito tu ${etiquetaCP} (ej: ${ejCP || "10001"}). ¿Me lo puedes indicar?"` : ""}${patronCPWeb ? `\nFORMATO ZIP: El ${etiquetaCP} debe coincidir con el patrón ${patronCPWeb} (ej: ${ejCP || "10001"}). Si el cliente proporciona un código postal que NO coincide con este formato, recházalo y pide uno correcto.` : ""}`;
          }
        }
        
        const systemPromptAI = `${promptBase}
Negocio: "${colmado.nombre}"
Tipo: ${colmado.tipoNegocio || "negocio"}
Costo delivery: ${monedaSimbolo}${costoDelivery}
Tiempo estimado: ${tiempoEstimado}

ESTADO ACTUAL DE LA CONVERSACIÓN: ${estadoActual}
CLIENTE:
- Nombre: ${session.clienteNombre || "Cliente"}
- Dirección/Ubicación: ${clienteDireccion || "no proporcionada aún"}
- Pedido actual: ${cartDisplay}
${jergaContext}
${menuAIContext}
${conocimientoContext}
${addressFormatContext}

FLUJO WEB CHAT (importante):
1. El cliente ya proporcionó nombre y teléfono en el onboarding (formulario inicial).
2. Si el cliente menciona su nombre → devolver clienteNombre con el nuevo nombre.
3. Si pide productos → capturarlos con precio del menú × cantidad si está disponible.
   - Para colmados sin precios fijos: el número al inicio es el monto (ej: "50 de arroz" → precio: 50).
   - Si el producto no está en el menú: capturarlo con precio null.
   - Interpreta variaciones y errores tipográficos.
4. Si el cliente dice que terminó ("no", "no gracias", "así namas", "así nomás", "eso es todo", "con eso", "nada más", "listo", "ya", "ya está", "estamos", "no quiero más", "está bien así", etc.) Y hay productos → terminoPedido: true. Continúa al siguiente paso (pedir nombre/dirección si falta, o crear el pedido).
5. Si pide ver el menú → mostrarlo en la respuesta usando EXACTAMENTE este formato (bullets •, NUNCA números): "📋 *Menú disponible:*\n• Producto - ${monedaSimbolo}Precio\n• Producto2 - ${monedaSimbolo}Precio2".
6. Para saludos y preguntas generales → responder amigablemente. Si el cliente saluda en inglés (hello, hi, hey, etc.), responde con un saludo normal en español sin mencionar que "solo atendemos en español" ni restricciones de idioma.
7. La ubicación y el pago se manejan con botones del chat web. No pidas ubicación ni método de pago en texto.

RESPONDE SIEMPRE EN JSON:
{
  "accion": "capturar_productos" | "remover_producto" | "terminado" | "conversacion",
  "respuesta": "mensaje natural y amigable para el cliente",
  "productos": [{ "nombre": string, "precio": number | null, "cantidad": number }] | null,
  "productoRemover": "nombre del producto a eliminar del carrito" | null,
  "terminoPedido": boolean,
  "crearPedido": boolean,
  "clienteNombre": "nuevo nombre si el cliente lo mencionó" | null,
  "direccionTexto": "dirección si el cliente la mencionó en texto" | null
}

REGLAS:
- productos[].precio: monto TOTAL para ese ítem (precio_unitario × cantidad). Null si desconocido.
- terminoPedido / crearPedido: true solo cuando el cliente dice que terminó Y hay productos en el carrito.
- Si el cliente agrega más productos → accion: "capturar_productos", terminoPedido: false.
- Si el cliente quiere eliminar un producto (borra, quita, elimina, saca) → accion: "remover_producto", productoRemover: "nombre del producto".
- clienteNombre: solo si el cliente mencionó querer usar otro nombre, de lo contrario null.
- direccionTexto: solo si el cliente escribió su dirección en texto, de lo contrario null.
- Responde NATURALMENTE. Si no reconoces un producto, pregunta amigablemente.
- NO digas "Opciones similares". Si no entiendes algo, pregunta directamente.
- La ubicación GPS y el método de pago se manejan con botones. No pidas estas cosas por texto.
- NUNCA uses frases que impliquen un mensaje posterior: "dame un momento", "espera", "ahora lo hago", "en seguida", "te confirmo", "espera un segundo", etc. Tu respuesta ES el mensaje final — confirma la acción directamente en el mismo mensaje.
- CRÍTICO - NUNCA INVENTES PRODUCTOS: Solo captura en el campo "productos" lo que el cliente mencionó EXPLÍCITAMENTE en su mensaje actual. NO extraigas productos del historial de conversación, del menú, ni de pedidos anteriores. Si el cliente dice "quiero añadir algo", "quiero un producto", "quiero pedir" sin especificar qué, devuelve accion: "conversacion" con productos: null y pregunta amablemente qué desea.`;

        const mensajesParaAI: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPromptAI }
        ];
        
        const historialReciente = mensajesPrevios.slice(-15);
        for (const msg of historialReciente) {
          mensajesParaAI.push({
            role: msg.rol === "user" ? "user" : "assistant",
            content: msg.contenido
          });
        }
        
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: mensajesParaAI,
            response_format: { type: "json_object" },
            max_tokens: 600,
          });
          
          let datos: any = {};
          try {
            datos = JSON.parse(completion.choices[0]?.message?.content || "{}");
          } catch {
            datos = { accion: "conversacion", respuesta: "¿Qué te gustaría pedir? 🍽️", terminoPedido: false };
          }

          // Guard: if AI claims to capture/create products but the list is empty, treat as conversation
          if (
            (datos.accion === "capturar_productos" || datos.terminoPedido || datos.crearPedido) &&
            (!datos.productos || !Array.isArray(datos.productos) || datos.productos.length === 0)
          ) {
            datos.accion = "conversacion";
            datos.terminoPedido = false;
            datos.crearPedido = false;
            if (!datos.respuesta || datos.respuesta.trim().length < 5) {
              datos.respuesta = "¿Qué producto deseas añadir? 😊";
            }
          }
          
          respuesta = datos.respuesta || "¿Qué te gustaría pedir? 🍽️";
          
          // Update client name if AI captured a name mention
          if (datos.clienteNombre && typeof datos.clienteNombre === "string" && datos.clienteNombre.trim()) {
            await storage.updateChatWebSession(sessionId, { clienteNombre: datos.clienteNombre.trim() } as any);
          }
          // Save text address if AI captured one (used as fallback when GPS not provided)
          if (datos.direccionTexto && typeof datos.direccionTexto === "string" && datos.direccionTexto.trim()) {
            const zipCheckWeb = await validarZipEnDireccion((colmadoRaw as any).paisId, datos.direccionTexto.trim());
            if (zipCheckWeb.zipOk) {
              await storage.updateChatWebSession(sessionId, { clienteDireccion: datos.direccionTexto.trim() } as any);
            } else {
              // ZIP missing: override response to re-ask, prevent order creation
console.warn(`[ZIP-ALERT] canal=web colmadoId=${(colmadoRaw as any).id}: dirección sin código postal`);
              // DELYWA: en un Worker lo que queda sin esperar se cancela al responder; se registra para terminarlo antes.
              enSegundoPlano(logZipMissingAlertAndNotify(
                colmadoRaw,
                "web",
                sessionId,
                datos.direccionTexto?.trim() ?? null
              ));
              respuesta = `Para completar tu pedido necesito tu ${zipCheckWeb.etiquetaCP} (ej: ${zipCheckWeb.ejemploCP}). ¿Me lo puedes indicar junto con tu dirección completa?`;
              datos.terminoPedido = false;
              datos.crearPedido = false;
              datos.direccionTexto = null;
            }
          }
          // crearPedido (from WhatsApp schema) maps to terminoPedido in web chat context.
          // In WhatsApp, crearPedido signals the AI wants to persist an order immediately.
          // In web chat, order creation happens after the client chooses payment method,
          // so we treat both flags as the same "customer finished ordering" signal.
          if (datos.crearPedido && !datos.terminoPedido) {
            datos.terminoPedido = true;
          }
          
          if (datos.accion === "remover_producto" && datos.productoRemover) {
            // Handle cart removal requested by the customer
            const nombreBuscar = String(datos.productoRemover).toLowerCase().trim();
            const indice = productosGuardados.findIndex((p: any) =>
              String(p.nombre).toLowerCase().includes(nombreBuscar) ||
              (p.textoOriginal && String(p.textoOriginal).toLowerCase().includes(nombreBuscar))
            );
            if (indice >= 0) {
              const eliminado = productosGuardados[indice];
              const nuevosProductos = productosGuardados.filter((_: any, i: number) => i !== indice);
              await storage.updateChatWebSession(sessionId, { productosCapturados: nuevosProductos } as any);
              nuevoEstado = nuevosProductos.length > 0 ? "preguntando_algo_mas" : "inicial";
            } else {
              nuevoEstado = productosGuardados.length > 0 ? "preguntando_algo_mas" : "inicial";
            }
          } else if (datos.accion === "capturar_productos" && Array.isArray(datos.productos) && datos.productos.length > 0) {
            const productosNuevos = datos.productos.map((p: any) => {
              // Normalize AI output: coerce string numerics to actual numbers
              const precioRaw = p.precio !== null && p.precio !== undefined ? parseFloat(String(p.precio)) : null;
              const precio = precioRaw !== null && !isNaN(precioRaw) ? precioRaw : null;
              const cantidad = Math.max(1, parseInt(String(p.cantidad || 1), 10) || 1);
              return {
                nombre: String(p.nombre || ""),
                textoOriginal: String(p.nombre || ""),
                monto: precio,
                cantidad,
                encontradoEnMenu: precio !== null
              };
            });
            // Dedupe: skip AI-returned products already pre-added (e.g. extras detected before AI)
            const normalizeNombre = (s: string) => s.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9 ]/g, " ").trim();
            const nombresPreExistentes = new Set(productosGuardados.map((p: any) => normalizeNombre(p.nombre || "")));
            const productosNuevosFiltrados = productosNuevos.filter((p: any) => !nombresPreExistentes.has(normalizeNombre(p.nombre || "")));
            const cartActualizado = [...productosGuardados, ...productosNuevosFiltrados];
            await storage.updateChatWebSession(sessionId, { productosCapturados: cartActualizado } as any);
            nuevoEstado = "preguntando_algo_mas";
            
            if (datos.terminoPedido) {
              const subtotal = cartActualizado.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
              let msgPago = `📝 *Tu pedido:*\n`;
              msgPago += cartActualizado.map((p: any) => {
                if (p.monto) return `• ${p.nombre} - ${monedaSimbolo}${p.monto}`;
                return `• ${p.nombre}`;
              }).join("\n");
              msgPago += `\n\n💰 *Subtotal: ${monedaSimbolo}${subtotal}*`;
              msgPago += `\n🛵 *Delivery: ${monedaSimbolo}${costoDelivery}*`;
              msgPago += `\n━━━━━━━━━━━━━━━`;
              msgPago += `\n*Total estimado: ${monedaSimbolo}${subtotal + costoDelivery}*`;
              msgPago += `\n\n¿Cómo deseas pagar?`;
              respuesta = msgPago;
              nuevoEstado = "esperando_metodo_pago";
            } else {
              // ── Override AI free text ──────────────────────────────────────────
              // The AI often generates a "pedido actualizado / aquí está tu pedido"
              // summary that looks like a confirmed order, but at this point the
              // order ONLY exists in the session cart — nothing was created in DB.
              // Use a controlled server-side confirmation instead so the customer
              // cannot mistake this for a placed order.
              if (productosNuevosFiltrados.length > 0) {
                const listaAgregados = productosNuevosFiltrados.map((p: any) => {
                  const prefix = p.cantidad > 1 ? `${p.cantidad}x ` : "";
                  return p.monto
                    ? `• ${prefix}${p.nombre} - ${monedaSimbolo}${p.monto}`
                    : `• ${prefix}${p.nombre}`;
                }).join("\n");
                respuesta = `✅ *Anotado:*\n${listaAgregados}\n\n¿Algo más? 😊`;
              }
              // productosNuevosFiltrados.length === 0 means dedupe removed everything
              // (product already in cart) — keep datos.respuesta which should explain this
            }
          } else if (datos.terminoPedido && productosGuardados.length > 0) {
            const subtotal = productosGuardados.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
            let msgPago = `📝 *Tu pedido:*\n`;
            msgPago += productosGuardados.map((p: any) => {
              if (p.monto) return `• ${p.nombre} - ${monedaSimbolo}${p.monto}`;
              return `• ${p.nombre}`;
            }).join("\n");
            msgPago += `\n\n💰 *Subtotal: ${monedaSimbolo}${subtotal}*`;
            msgPago += `\n🛵 *Delivery: ${monedaSimbolo}${costoDelivery}*`;
            msgPago += `\n━━━━━━━━━━━━━━━`;
            msgPago += `\n*Total estimado: ${monedaSimbolo}${subtotal + costoDelivery}*`;
            msgPago += `\n\n¿Cómo deseas pagar?`;
            respuesta = msgPago;
            nuevoEstado = "esperando_metodo_pago";
          } else if (datos.accion === "conversacion" || !datos.accion) {
            nuevoEstado = productosGuardados.length > 0 ? "preguntando_algo_mas" : "inicial";
          }
          
        } catch (aiError) {
          console.error("Error calling AI for web chat:", aiError);
          respuesta = "Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo 🙏";
          // Preserve existing state on transient AI errors to avoid losing cart/context
          // nuevoEstado remains unchanged (keeps estadoActual)
        }
      }
      // Handle payment method words when NOT in payment state - PROCESS DIRECTLY if has products or pending order
      else if (!respuesta && esPalabraMetodoPago && !estadosDePago.includes(estadoActual)) {
        // FIRST: Check if there's an existing order waiting for payment
        if (pedidoEsperandoPago) {
          const pedido = pedidoEsperandoPago;
          const totalPedido = parseFloat(pedido.totalConfirmado || pedido.total);
          const totalConDelivery = totalPedido; // already includes delivery
          
          if (mensajeNormalizado.includes("efectivo") || mensajeNormalizado.includes("cash")) {
            respuesta = `💵 Pedido #${pedido.id} - Vas a pagar en efectivo.\n\n¿Con cuánto vas a pagar para calcular tu ${palabraDevuelta}?\n\n(Total: ${monedaSimbolo}${totalConDelivery})`;
            nuevoEstado = "esperando_monto";
            // Link the order to this session
            await storage.updateChatWebSession(sessionId, { pedidoId: pedido.id } as any);
          } else if (mensajeNormalizado.includes("transferencia")) {
            await storage.updatePedidoMetodoPago(pedido.id, "transferencia");
            await storage.updatePedidoEstado(pedido.id, "pendiente_confirmacion");
            let respTransfer = `✅ Pedido #${pedido.id} - Pago por transferencia.\n\nTotal: ${monedaSimbolo}${totalConDelivery}`;
            if (datosBancarios) {
              respTransfer += `\n\n🏦 *Datos bancarios:*${datosBancarios}`;
            }
            respTransfer += `\n\n📸 Por favor envía una foto del comprobante de transferencia, para poder procesar tu orden.`;
            respuesta = respTransfer;
            nuevoEstado = "esperando_comprobante";
            await storage.updateChatWebSession(sessionId, { pedidoId: pedido.id } as any);
          } else if (mensajeNormalizado.includes("tarjeta") || mensajeNormalizado.includes("pos")) {
            await storage.updatePedidoMetodoPago(pedido.id, "tarjeta");
            await storage.updatePedidoEstado(pedido.id, "pendiente");
            respuesta = `✅ Pedido #${pedido.id} confirmado.\n\n💳 Pagarás con tarjeta al recibir tu pedido.`;
            nuevoEstado = "finalizado";
            await storage.updateChatWebSession(sessionId, { pedidoId: pedido.id } as any);
          }
        } else if (productosGuardados.length === 0) {
          // No products AND no pending order - ask what they want to order
          respuesta = "👋 Primero dime qué te gustaría pedir y luego elegimos la forma de pago.\n\n¿Qué te gustaría ordenar? 🍽️";
          nuevoEstado = "inicial";
        } else {
          // Has products - PROCESS THE PAYMENT METHOD DIRECTLY (same logic as esperando_metodo_pago)
          const subtotalProductos = productosGuardados.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
          const totalConDelivery = subtotalProductos + costoDelivery;
          
          if (mensajeNormalizado.includes("efectivo") || mensajeNormalizado.includes("cash")) {
            // Save payment method in session, ask for amount
            await storage.updateChatWebSession(sessionId, { 
              metodoPagoSeleccionado: "efectivo",
              totalEstimado: totalConDelivery.toString()
            } as any);
            respuesta = `💵 Vas a pagar en efectivo.\n\n¿Con cuánto vas a pagar para calcular tu ${palabraDevuelta}?\n\n(Total: ${monedaSimbolo}${totalConDelivery})`;
            nuevoEstado = "esperando_monto_previo";
          }
          else if (mensajeNormalizado.includes("transferencia")) {
            // Save payment method
            await storage.updateChatWebSession(sessionId, { 
              metodoPagoSeleccionado: "transferencia",
              totalEstimado: totalConDelivery.toString()
            } as any);
            
            // Always ask for location — even if one is saved, always confirm current delivery address
            let respTransfer = `🏦 Pago por transferencia.`;
            respTransfer += datosBancarios || "\n\nEl negocio te contactará con los datos.";
            respTransfer += `\n\n📍 Ahora comparte tu ubicación usando el botón 📍 para poder entregarte.`;
            respuesta = respTransfer;
            nuevoEstado = "esperando_ubicacion";
          }
          else if (mensajeNormalizado.includes("tarjeta") || mensajeNormalizado.includes("pos")) {
            // Save payment method
            await storage.updateChatWebSession(sessionId, { 
              metodoPagoSeleccionado: "tarjeta",
              totalEstimado: totalConDelivery.toString()
            } as any);
            
            // Always ask for location — even if one is saved, always confirm current delivery address
            respuesta = `💳 Pago con tarjeta. El delivery cobrará al llegar.\n\n📍 Ahora comparte tu ubicación usando el botón 📍 para poder entregarte.`;
            nuevoEstado = "esperando_ubicacion";
          }
          else {
            // Didn't recognize specific method - show options
            let msgPago = `📝 *Tu pedido:*\n`;
            msgPago += productosGuardados.map((p: any) => {
              if (p.monto) return `• ${p.nombre} - ${monedaSimbolo}${p.monto}`;
              return `• ${p.nombre}`;
            }).join("\n");
            msgPago += `\n\n💰 *Total: ${monedaSimbolo}${totalConDelivery}*`;
            msgPago += `\n\n¿Cómo deseas pagar?\n${metodosHabilitados.join("\n")}`;
            
            respuesta = msgPago;
            nuevoEstado = "esperando_metodo_pago";
          }
        }
      }
      
      // Fallback: ensure we always have a response for any unhandled state
      if (!respuesta) {
        respuesta = `No entendí eso. ¿En qué te puedo ayudar? 🤔`;
      }
      
      // Update conversation state
      if (nuevoEstado !== estadoActual) {
        await storage.updateChatWebSession(sessionId, { estadoConversacion: nuevoEstado } as any);
      }
      
      // Prepend welcome greeting for first message (if not already a pure greeting response)
      if (esPrimerMensaje && !respuesta.startsWith("¡Buenos") && !respuesta.startsWith("¡Buenas")) {
        const saludoBienvenida = `${getSaludoHora()} 👋 Bienvenido a *${colmado.nombre}*.\n\n`;
        respuesta = saludoBienvenida + respuesta;
      }

      // Prepend extras confirmation (if any extras were auto-added to cart this turn)
      if (extrasPrefix) {
        respuesta = extrasPrefix + "\n\n" + respuesta;
      }
      
      await storage.addChatWebMensaje(sessionId, "assistant", respuesta);

      // ── Quick-reply options for the web chat UI ──────────────────────────────
      // Injected only for the two highest-friction moments in the order flow.
      let opcionesRespuesta: string[] | undefined;
      const respLower = respuesta.toLowerCase();
      // 1) Add-or-confirm chips: shown whenever the session reaches
      //    "preguntando_algo_mas" — the state the machine sets every time
      //    products are added and control returns to the customer.
      //    This is state-driven, not keyword-driven, so it fires regardless
      //    of how the bot phrases its "anything else?" reply.
      if (nuevoEstado === "preguntando_algo_mas") {
        opcionesRespuesta = ["➕ Agregar", "✅ Confirmar pedido"];
      }
      // 2) Payment method prompt: bot asks how the customer wants to pay
      else if (
        nuevoEstado === "esperando_pago" ||
        nuevoEstado === "esperando_metodo_pago" ||
        respLower.includes("cómo deseas pagar") ||
        respLower.includes("cómo quieres pagar") ||
        respLower.includes("elige tu forma de pago") ||
        respLower.includes("elige cómo") ||
        (respLower.includes("forma de pago") && metodosHabilitados.length > 0)
      ) {
        if (metodosHabilitados.length > 0) {
          opcionesRespuesta = metodosHabilitados;
        }
      }

      res.json({ respuesta, ...(opcionesRespuesta ? { opciones: opcionesRespuesta } : {}) });
    } catch (error) {
      console.error("Error processing chat message:", error);
      res.status(500).json({ error: "Error al procesar el mensaje" });
    }
  });
  
  // Voice message endpoint — transcribes with Whisper then routes through the normal chat-web flow
  app.post("/api/chat-web/voice-message", async (req, res) => {
    try {
      const { sessionId, audioData } = req.body;
      
      if (!sessionId || !audioData) {
        return res.status(400).json({ error: "Datos requeridos" });
      }
      
      const session = await storage.getChatWebSession(sessionId);
      if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
      
      const colmado = await storage.getColmado(session.colmadoId);
      if (!colmado) return res.status(404).json({ error: "Negocio no encontrado" });

      // Decode base64 Data URL (e.g. "data:audio/webm;base64,XXXX") to Buffer
      const base64Match = (audioData as string).match(/^data:(audio\/[^;]+);base64,(.+)$/);
      if (!base64Match) {
        return res.status(400).json({ error: "Formato de audio inválido" });
      }
      const mimeType = base64Match[1];
      const audioBuffer = Buffer.from(base64Match[2], "base64");

      // Transcribe with Whisper — same model/language/prompt as the Meta bot
      let transcribedText: string | null = null;
      try {
        const audioFile = await toFile(audioBuffer, "audio.webm", { type: mimeType });
        const transcription = await openaiWhisper.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "es",
          prompt: "Colmado República Dominicana. Cibaeño: caine, cuaito, poique, veldá. Sureño: calne, puelco, velde, azuca, guineo, batata, ñame. Capitalino: klk, que lo que, dime a ver, ta to, tato, wawawa, tiguere, vaina, pariguayo, tripeo. Productos: pica pollo, chimi, yaroa, morir soñando, mofongo, mangú, locrio, sancocho, asopao, la bandera, picadera, fritura, empanada, quipe, pastelito, chenchen, chacá, tostones, plátano, yuca, habichuela, arroz, pollo, carne, queso, pan, leche, huevo, agua, refresco, jugo",
        });
        transcribedText = transcription.text?.trim() || null;
        // DELYWA: no se registra el texto del cliente en el log.
      } catch (whisperErr) {
        console.error("[chat-web] Whisper transcription error:", whisperErr);
      }

      if (!transcribedText) {
        // Transcription failed — save placeholder and return friendly error
        await storage.addChatWebMensaje(sessionId, "user", "🎙️ [Nota de voz]");
        const errMsg = "🎤 No pude entender la nota de voz. ¿Podrías escribirme tu pedido?";
        await storage.addChatWebMensaje(sessionId, "assistant", errMsg);
        return res.json({ respuesta: errMsg, transcribedText: null });
      }

      // Route the transcribed text through the normal chat-web message handler
      // so the full bot flow runs (product detection, state machine, etc.) without duplication
      // DELYWA: el original se llamaba a sí mismo por HTTP (localhost); aquí se invoca el manejador directamente.
      const data = await llamarInterno("/api/chat-web/message", { sessionId, mensaje: transcribedText });
      // Return bot reply + transcribed text so the client can display what was understood
      res.json({ respuesta: data.respuesta, transcribedText });
    } catch (error) {
      console.error("Error processing voice message:", error);
      res.status(500).json({ error: "Error al procesar nota de voz" });
    }
  });
  
  // Location sharing endpoint
  app.post("/api/chat-web/location", async (req, res) => {
    try {
      const { sessionId, latitude, longitude } = req.body;
      
      if (!sessionId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "Datos requeridos" });
      }
      
      const session = await storage.getChatWebSession(sessionId);
      if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
      
      const colmado = await storage.getColmado(session.colmadoId);
      if (!colmado) return res.status(404).json({ error: "Negocio no encontrado" });

      const monedaSimbolo = (colmado as any).simboloMoneda || "RD$";
      const palabraDevuelta = getPalabraDevuelta((colmado as any).codigoPais || "DO");

      // Save location to session
      await storage.updateChatWebSession(sessionId, {
        clienteLatitud: latitude.toString(),
        clienteLongitud: longitude.toString(),
      });
      
      // Create Google Maps link
      const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
      
      // Save location message
      await storage.addChatWebMensaje(sessionId, "user", `📍 Ubicación compartida: ${mapsLink}`);
      
      // Check if we can create order now (products + name + location/address)
      const productosGuardados = (session as any).productosCapturados || [];
      const tieneProductos = productosGuardados.length > 0;
      const tieneNombre = !!(session.clienteNombre && session.clienteNombre.trim());
      const tieneWhatsapp = !!session.clienteWhatsapp;
      
      // Get payment method already selected (NEW FLOW: payment before location)
      const metodoPagoSeleccionado = (session as any).metodoPagoSeleccionado || null;
      const montoPagoCliente = (session as any).montoPagoCliente || "0";
      const devueltaCalculada = (session as any).devueltaCalculada || "0";
      const costoDelivery = parseFloat(colmado.costoDelivery ?? "0");
      
      let respuesta = "✅ Ubicación recibida y guardada.";
      
      // Guard against duplicate order creation: if the session is already in a terminal
      // state (order was already created), skip creating another order.
      const estadoActualSession = (session as any).estadoConversacion || "inicial";
      const estadosTerminales = ["pedido_creado", "esperando_comprobante", "finalizado"];
      if (estadosTerminales.includes(estadoActualSession)) {
        await storage.addChatWebMensaje(sessionId, "assistant", respuesta);
        return res.json({ respuesta });
      }

      // If we have all info to create order (including payment method from new flow)
      if (tieneProductos && tieneNombre && tieneWhatsapp) {
        const totalProductos = productosGuardados.reduce((sum: number, p: any) => sum + (p.monto || 0), 0);
        const totalConDelivery = totalProductos + costoDelivery;
        
        // All payment methods create order in "pendiente_confirmacion" so business can start immediately
        const estadoInicial = "pendiente_confirmacion";
        
        // Build ubicacion string: combine text address (if any) with GPS link
        const textoDireccionSession = (session as any).clienteDireccion || "";
        const ubicacionFinal = textoDireccionSession
          ? `${textoDireccionSession}\n${mapsLink}`
          : mapsLink;

        // Validate ZIP format before creating the order (GPS provides location but
        // the text address may have a malformed postal code that slipped through).
        if (textoDireccionSession) {
          const zipCheckLocation = await validarZipEnDireccion(colmado.paisId, textoDireccionSession);
          if (!zipCheckLocation.zipOk) {
            const etiquetaMsg = zipCheckLocation.etiquetaCP || "código postal";
            const ejemploMsg = zipCheckLocation.ejemploCP || "10001";
            const errorMsg = `Para completar tu pedido, necesito un ${etiquetaMsg} válido (ej: ${ejemploMsg}). Por favor actualiza tu dirección con el formato correcto.`;
            await storage.addChatWebMensaje(sessionId, "assistant", errorMsg);
            return res.json({ respuesta: errorMsg });
          }
        }

        // Create order with payment info already captured
        const pedido = await storage.createPedido({
          colmadoId: colmado.id,
          clienteNombre: session.clienteNombre || "Cliente",
          clienteWhatsapp: session.clienteWhatsapp || "",
          clienteUbicacion: ubicacionFinal,
          productos: JSON.stringify(productosGuardados),
          total: totalConDelivery.toString(),
          estado: estadoInicial,
          montoPago: montoPagoCliente,
          metodoPago: metodoPagoSeleccionado,
        });
        
        // Clear session and link order - use estadoConversacionFinal based on payment method
        await storage.updateChatWebSession(sessionId, { 
          productosCapturados: [],
          estadoConversacion: metodoPagoSeleccionado === "transferencia" ? "esperando_comprobante" : "pedido_creado",
          pedidoId: pedido.id,
          metodoPagoSeleccionado: null,
          montoPagoCliente: null,
          devueltaCalculada: null,
        } as any);
        
        // Build message - order is RECEIVED, NOT confirmed (business must confirm)
        let estadoConversacionFinal = "pedido_creado";
        
        const subtotalProductosRecibido = Math.max(0, totalConDelivery - costoDelivery);
        const listaProductosCliente = productosGuardados.map((p: any) => {
          const n = p.nombre || p.name || "Producto";
          return p.monto ? `• ${n} (${monedaSimbolo}${p.monto})` : `• ${n}`;
        }).join("\n");
        const desgloseBase = `${listaProductosCliente ? `📝 *Productos:*\n${listaProductosCliente}\n\n` : ""}💰 Subtotal: ${monedaSimbolo}${subtotalProductosRecibido}\n🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n━━━━━━━━━━━━━━━\n*💵 Total estimado: ${monedaSimbolo}${totalConDelivery}*`;

        if (metodoPagoSeleccionado === "efectivo") {
          respuesta = `📦 *Pedido #${pedido.id} recibido*\n\n${desgloseBase}\n\n💵 *Pago:* Efectivo · Pagas ${monedaSimbolo}${montoPagoCliente} → ${palabraDevuelta.charAt(0).toUpperCase()}${palabraDevuelta.slice(1)}: ${monedaSimbolo}${devueltaCalculada}\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
        } else if (metodoPagoSeleccionado === "transferencia") {
          respuesta = `📦 *Pedido #${pedido.id} recibido*\n\n${desgloseBase}\n\n🏦 *Pago:* Transferencia\n\n📄 *Por favor envía una foto del comprobante* usando el botón 📎, para poder procesar tu orden.`;
          estadoConversacionFinal = "esperando_comprobante";
        } else if (metodoPagoSeleccionado === "tarjeta") {
          respuesta = `📦 *Pedido #${pedido.id} recibido*\n\n${desgloseBase}\n\n💳 *Pago:* Tarjeta (POS)\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
        } else {
          respuesta = `📦 *Pedido #${pedido.id} recibido*\n\n${desgloseBase}\n\n⏳ El negocio revisará tu pedido y te confirmará.`;
        }

        // Notify business via WhatsApp
        if (colmado.whatsappNumero) {
          const listaProductos = productosGuardados.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n");
          const metodoPagoTexto = metodoPagoSeleccionado === "efectivo" ? `Efectivo (paga con ${monedaSimbolo}${montoPagoCliente}, ${palabraDevuelta}: ${monedaSimbolo}${devueltaCalculada})` : metodoPagoSeleccionado === "transferencia" ? "Transferencia" : metodoPagoSeleccionado === "tarjeta" ? "Tarjeta (POS)" : "Por definir";
          const msgNegocio = `🛒 *Nuevo pedido #${pedido.id}*\n👤 ${session.clienteNombre || "Cliente"}${session.clienteWhatsapp ? ` | ${session.clienteWhatsapp}` : ""}\n📝 Productos:\n${listaProductos}\n💰 Total: ${monedaSimbolo}${totalConDelivery}\n💳 Pago: ${metodoPagoTexto}\n📍 ${mapsLink}`;
          await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
        }
      } else if (!tieneProductos) {
        respuesta += "\n\n¿Qué te gustaría pedir? 🍽️";
        await storage.updateChatWebSession(sessionId, { estadoConversacion: "inicial" } as any);
      } else if (!tieneNombre) {
        respuesta += "\n\n¿Cómo te llamas?";
        await storage.updateChatWebSession(sessionId, { estadoConversacion: "esperando_nombre" } as any);
      }
      
      await storage.addChatWebMensaje(sessionId, "assistant", respuesta);
      
      res.json({ respuesta });
    } catch (error) {
      console.error("Error processing location:", error);
      res.status(500).json({ error: "Error al procesar ubicación" });
    }
  });
  
  // Endpoint to upload transfer receipt/comprobante
  app.post("/api/chat-web/comprobante", async (req, res) => {
    try {
      const { sessionId, comprobanteUrl } = req.body;
      
      if (!sessionId || !comprobanteUrl) {
        return res.status(400).json({ error: "sessionId y comprobanteUrl requeridos" });
      }
      
      const session = await storage.getChatWebSession(sessionId);
      if (!session) return res.status(404).json({ error: "Sesión no encontrada" });
      
      const colmado = await storage.getColmado(session.colmadoId);
      if (!colmado) return res.status(404).json({ error: "Negocio no encontrado" });
      
      // Find the order waiting for comprobante
      const pedidoId = (session as any).pedidoId;
      if (!pedidoId) {
        return res.status(400).json({ error: "No hay pedido asociado a esta sesión" });
      }
      
      const pedido = await storage.getPedidoById(pedidoId);
      if (!pedido) {
        return res.status(404).json({ error: "Pedido no encontrado" });
      }
      
      // Update order with comprobante URL
      await storage.updatePedidoComprobante(pedidoId, comprobanteUrl);
      
      // Update pedido estado to esperando_confirmacion_pago
      await storage.updatePedidoEstado(pedidoId, "esperando_confirmacion_pago");
      
      // Add message to chat
      await storage.addChatWebMensaje(sessionId, "user", "📄 [Comprobante de transferencia enviado]");
      
      const respuesta = `✅ *Comprobante recibido*\n\nHemos recibido tu comprobante de transferencia.\n\n⏳ El negocio verificará el pago y te confirmará pronto.\n\n¡Gracias por tu compra! 🙏`;
      await storage.addChatWebMensaje(sessionId, "assistant", respuesta);
      
      // Update session state
      await storage.updateChatWebSession(sessionId, { estadoConversacion: "esperando_confirmacion_pago" } as any);
      
      res.json({ respuesta, success: true });
    } catch (error) {
      console.error("Error processing comprobante:", error);
      res.status(500).json({ error: "Error al procesar comprobante" });
    }
  });
  
  // Endpoint for business to confirm transfer payment
  app.get("/api/chat-web/session/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await storage.getChatWebSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Sesión no encontrada" });
      }
      
      const mensajes = await storage.getChatWebMensajes(sessionId);
      const colmado = await storage.getColmado(session.colmadoId);

      // Include current pedido estado so the customer's tracking screen can poll it
      let pedidoEstado: string | null = null;
      if (session.pedidoId) {
        const pedido = await storage.getPedidoById(session.pedidoId);
        if (pedido) pedidoEstado = pedido.estado;
      }
      
      // Build the enabled payment methods so the client can restore quick-reply chips
      // when an existing session is loaded (opciones are not persisted to DB).
      const metodosPagoConfig = colmado ? await storage.getMetodosPago(colmado.id) : null;
      const metodosHabilitados: string[] = [];
      if (metodosPagoConfig?.efectivo !== false) metodosHabilitados.push("💵 Efectivo");
      if (metodosPagoConfig?.transferencia) metodosHabilitados.push("🏦 Transferencia");
      if (metodosPagoConfig?.tarjeta) metodosHabilitados.push("💳 Tarjeta (POS)");

      res.json({
        session,
        mensajes,
        pedidoEstado,
        estadoConversacion: (session as any).estadoConversacion ?? null,
        metodosHabilitados,
        colmado: colmado ? {
          id: colmado.id,
          nombre: colmado.nombre,
          logo: colmado.logo,
          tipoNegocio: colmado.tipoNegocio,
          tiempoEstimado: colmado.tiempoEstimado,
        } : null,
      });
    } catch (error) {
      console.error("Error getting chat session:", error);
      res.status(500).json({ error: "Error al obtener la sesión" });
    }
  });

  // ============ ADMIN PLATFORM ENDPOINTS ============

  // Check if user is platform admin
}
