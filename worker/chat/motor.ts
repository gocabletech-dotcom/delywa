// Funciones de apoyo del bot de WhatsApp (worker/chat/motor-whatsapp.ts):
// validar el código postal en la dirección, avisar si falta, ver si dos pedidos
// se pueden juntar y armar el mensaje de estado del pedido.
// El chat web con IA que vivía aquí se quitó en v2.33.0 (no se usaba).
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

