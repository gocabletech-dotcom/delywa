// Motor del bot de WhatsApp (mensajes entrantes por Meta y por Evolution).
//
// Igual que chat/motor.ts, este archivo es el código del servidor original
// (server/routes.ts) trasladado casi literal para conservar el comportamiento
// del bot. El puente con Cloudflare está en chat/adaptador.ts y los cambios
// puntuales están marcados con "DELYWA:".
/* eslint-disable */
import { Buffer } from "node:buffer";
import { toFile } from "openai";
import { checkZipFormat } from "../lib/zipValidation";
import { resolveDeliveryAddress, needsSavedAddress } from "../lib/deliveryAddress";
import { parseCoordinatePair } from "../lib/orderDistance";
import { geocodificarDireccion, extraerCoordenadas } from "../lib/routeOptimizer";
import { stripInternalAddressContext } from "@shared/visible-message";
import { META_POLICIES } from "../data/meta-policies";
import {
  storage, openai, openaiWhisper, sendWhatsAppMessageSmart, sendWhatsAppMessageWithToken, enrichColmadoWithMoneda,
  getColmadoTimezone, humanDelay, graphFetch, fetchExterno, tokenGlobalMeta, urlBasePublica, type AppLike,
} from "./adaptador";
import {
  validarZipEnDireccion, logZipMissingAlertAndNotify, evaluarElegibilidadMerge, getPalabraDevuelta, buildOrderStatusMessage,
} from "./motor";

// DELYWA: la firma de Meta se verifica en la entrada del webhook, antes de encolar el aviso (routes/webhooks.ts).
const verifyMetaWebhookSignature = (_rawBody: unknown, _firma: unknown) => true;

function emojiParaProductoWA(nombre: string): string {
  const EMOJI_MAP: Array<[RegExp, string]> = [
    [/pl[áa]tano|guineo|verde/i, "🍌"],
    [/huevo/i, "🥚"],
    [/aceite/i, "🫒"],
    [/arroz/i, "🍚"],
    [/salami|salchich|embutido/i, "🌭"],
    [/cerveza|presidente|corona|brahma|six/i, "🍺"],
    [/queso/i, "🧀"],
    [/az[úu]car/i, "🍬"],
    [/pan\b|pancito/i, "🍞"],
    [/leche/i, "🥛"],
    [/habichuela|frijol|guandul/i, "🫘"],
    [/pollo|pica pollo/i, "🍗"],
    [/carne|res|bistec|churrasco|bandera/i, "🥩"],
    [/cerdo|puerco|chuleta/i, "🥓"],
    [/hamburgues|chimi/i, "🍔"],
    [/yaroa|papa frita|papas fritas|fritura/i, "🍟"],
    [/empanada|pastelito|quipe/i, "🥟"],
    [/mang[úu]|mofongo|maduro/i, "🍳"],
    [/sandwich|s[áa]ndwich|club/i, "🥪"],
    [/pizza/i, "🍕"],
    [/taco/i, "🌮"],
    [/sopa|sancocho|asopao|caldo/i, "🍲"],
    [/espagueti|spaghetti|pasta|fideo/i, "🍝"],
    [/ensalada/i, "🥗"],
    [/agua/i, "💧"],
    [/refresco|soda|malta|coca|pepsi/i, "🥤"],
    [/jugo|morir so[ñn]ando|batida|licuado/i, "🧃"],
    [/caf[ée]/i, "☕"],
    [/t[ée]\b/i, "🍵"],
    [/cigarr|malboro|marlboro|nacional|tabaco/i, "🚬"],
    [/yuca|batata|[ñn]ame|v[íi]veres/i, "🥔"],
    [/tomate/i, "🍅"],
    [/cebolla|ajo|saz[óo]n|condimento/i, "🧅"],
    [/lim[óo]n|naranja|china/i, "🍋"],
    [/manzana/i, "🍎"],
    [/mantequilla|margarina/i, "🧈"],
    [/helado|mantecado/i, "🍨"],
    [/flan|dulce|postre|bizcocho|cake|pastel/i, "🍮"],
    [/jab[óo]n|detergente|cloro|limpieza|desinfect/i, "🧼"],
    [/papel|servilleta/i, "🧻"],
    [/dulce|caramelo|chocolate/i, "🍬"],
  ];
  const n = (nombre || "").trim();
  for (const [regex, emoji] of EMOJI_MAP) {
    if (regex.test(n)) return emoji;
  }
  return "🛒";
}

function buildMenuDisplayWA(
  productos: { nombre: string; precio: string; categoria: string | null; disponible: boolean }[],
  monedaSimbolo: string,
  colmadoSlug: string | null | undefined,
  colmadoId: number
): string {
  const disponibles = productos.filter(p => p.disponible);
  if (disponibles.length === 0) return "";

  const CATEGORY_EMOJIS: Record<string, string> = {
    bebidas: "🥤", bebida: "🥤",
    comidas: "🍽️", comida: "🍽️", almuerzo: "🍽️", cena: "🍽️",
    desayuno: "☕", merienda: "🥪",
    pollo: "🍗", carnes: "🥩", carne: "🥩", res: "🥩",
    mariscos: "🦐", pescado: "🐟",
    frutas: "🍓", verduras: "🥦", vegetales: "🥦",
    postres: "🍮", dulces: "🍬", helados: "🍦",
    pizzas: "🍕", pizza: "🍕",
    hamburguesas: "🍔", burger: "🍔",
    tacos: "🌮", burritos: "🌯",
    ensaladas: "🥗", ensalada: "🥗",
    sopas: "🍜", sopa: "🍜",
    snacks: "🍿", "entradas": "🥗",
    licores: "🍺", cervezas: "🍺",
    general: "📦", otros: "📦",
  };

  function emojiForCategory(cat: string): string {
    const key = cat.toLowerCase().trim();
    for (const [keyword, emoji] of Object.entries(CATEGORY_EMOJIS)) {
      if (key.includes(keyword)) return emoji;
    }
    return "🏷️";
  }

  const porCategoria: Record<string, typeof disponibles> = {};
  for (const p of disponibles) {
    const cat = p.categoria || "General";
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(p);
  }

  const LINE_WIDTH = 32; // approximate chars visible in WA monospace
  let text = "";
  for (const [categoria, prods] of Object.entries(porCategoria)) {
    const emoji = emojiForCategory(categoria);
    text += `${emoji} *${categoria}*\n`;
    text += `━━━━━━━━━━━━\n`;
    for (const p of prods) {
      const emoji = emojiParaProductoWA(p.nombre);
      const precio = `${monedaSimbolo}${parseFloat(p.precio).toFixed(0)}`;
      // emoji + space = 2 extra chars in the prefix "• 🛒 "
      const maxNombreLen = LINE_WIDTH - precio.length - 5; // "• " + emoji + " " + " "
      const nombre = p.nombre.length > maxNombreLen
        ? p.nombre.substring(0, maxNombreLen - 1) + "…"
        : p.nombre;
      const dotsLen = LINE_WIDTH - 4 - nombre.length - precio.length;
      const dots = dotsLen > 0 ? ".".repeat(dotsLen) : " ";
      text += `• ${emoji} ${nombre}${dots}${precio}\n`;
    }
    text += "\n";
  }

  const slug = colmadoSlug || `COLMADO${colmadoId}`;
  const baseUrl = urlBasePublica(); // DELYWA: antes dependía de una variable de Replit
  text += `🔗 *Ver menú completo con fotos:* ${baseUrl}/menu/${slug}`;
  return text.trim();
}

async function _enrichColmadoWithMoneda(colmado: any) {
  let simboloMoneda = "RD$";
  let monedaNombre = "Peso Dominicano";
  let codigoPais = "DO";
  if (colmado?.paisId) {
    const pais = await storage.getPais(colmado.paisId);
    if (pais?.simboloMoneda) simboloMoneda = pais.simboloMoneda;
    if (pais?.moneda) monedaNombre = pais.moneda;
    if (pais?.codigo) codigoPais = pais.codigo;
  }
  return { ...colmado, simboloMoneda, monedaNombre, codigoPais };
}
function _getPalabraDevuelta(codigoPais: string): string {
  return codigoPais === "AR" ? "vuelto" : "devuelta";
}
function _emojiParaProductoWA(nombre: string): string {
  const EMOJI_MAP: Array<[RegExp, string]> = [
    [/pl[áa]tano|guineo|verde/i, "🍌"], [/huevo/i, "🥚"], [/aceite/i, "🫒"],
    [/arroz/i, "🍚"], [/salami|salchich|embutido/i, "🌭"], [/cerveza|presidente|corona|brahma|six/i, "🍺"],
    [/queso/i, "🧀"], [/az[úu]car/i, "🍬"], [/pan\b|pancito/i, "🍞"], [/leche/i, "🥛"],
    [/habichuela|frijol|guandul/i, "🫘"], [/pollo|pica pollo/i, "🍗"], [/carne|res|bistec/i, "🥩"],
    [/cerdo|puerco|chuleta/i, "🥓"], [/hamburgues|chimi/i, "🍔"], [/yaroa|papa frita/i, "🍟"],
    [/empanada|pastelito|quipe/i, "🥟"], [/mang[úu]|mofongo|maduro/i, "🍳"],
    [/sandwich|s[áa]ndwich/i, "🥪"], [/pizza/i, "🍕"], [/taco/i, "🌮"],
    [/sopa|sancocho|asopao/i, "🍲"], [/espagueti|pasta|fideo/i, "🍝"], [/ensalada/i, "🥗"],
    [/agua/i, "💧"], [/refresco|soda|malta|coca|pepsi/i, "🥤"], [/jugo|batida/i, "🧃"],
    [/caf[ée]/i, "☕"], [/t[ée]\b/i, "🍵"], [/yuca|batata|v[íi]veres/i, "🥔"],
    [/tomate/i, "🍅"], [/cebolla|ajo|saz[óo]n/i, "🧅"], [/lim[óo]n|naranja/i, "🍋"],
    [/manzana/i, "🍎"], [/mantequilla|margarina/i, "🧈"], [/helado|mantecado/i, "🍨"],
    [/flan|dulce|postre|bizcocho/i, "🍮"], [/jab[óo]n|detergente|cloro/i, "🧼"],
    [/papel|servilleta/i, "🧻"],
  ];
  const n = (nombre || "").trim();
  for (const [regex, emoji] of EMOJI_MAP) { if (regex.test(n)) return emoji; }
  return "🛒";
}
function _buildMenuDisplayWA(
  productos: { nombre: string; precio: string; categoria: string | null; disponible: boolean }[],
  monedaSimbolo: string,
  colmadoSlug: string | null | undefined,
  colmadoId: number
): string {
  const disponibles = productos.filter(p => p.disponible);
  if (disponibles.length === 0) return "";
  const CATEGORY_EMOJIS: Record<string, string> = {
    bebidas: "🥤", comidas: "🍽️", almuerzo: "🍽️", desayuno: "☕", pollo: "🍗",
    carnes: "🥩", mariscos: "🦐", frutas: "🍓", verduras: "🥦", postres: "🍮",
    pizzas: "🍕", hamburguesas: "🍔", ensaladas: "🥗", sopas: "🍜", snacks: "🍿",
    licores: "🍺", cervezas: "🍺", general: "📦", otros: "📦",
  };
  function emojiForCat(cat: string): string {
    const k = cat.toLowerCase().trim();
    for (const [kw, em] of Object.entries(CATEGORY_EMOJIS)) { if (k.includes(kw)) return em; }
    return "🏷️";
  }
  const porCat: Record<string, typeof disponibles> = {};
  for (const p of disponibles) { const c = p.categoria || "General"; if (!porCat[c]) porCat[c] = []; porCat[c].push(p); }
  let text = "";
  const LW = 32;
  for (const [cat, prods] of Object.entries(porCat)) {
    text += `${emojiForCat(cat)} *${cat}*\n━━━━━━━━━━━━\n`;
    for (const p of prods) {
      const em = _emojiParaProductoWA(p.nombre);
      const precio = `${monedaSimbolo}${parseFloat(p.precio).toFixed(0)}`;
      const maxNom = LW - precio.length - 5;
      const nom = p.nombre.length > maxNom ? p.nombre.substring(0, maxNom - 1) + "…" : p.nombre;
      const dots = Math.max(1, LW - 4 - nom.length - precio.length);
      text += `• ${em} ${nom}${".".repeat(dots)}${precio}\n`;
    }
    text += "\n";
  }
  const slug = colmadoSlug || `COLMADO${colmadoId}`;
  const base = urlBasePublica(); // DELYWA: antes dependía de una variable de Replit
  return (text + `🔗 *Ver menú completo con fotos:* ${base}/menu/${slug}`).trim();
}

// ============ CORE MESSAGE PROCESSING FUNCTION ============
export async function processIncomingWhatsAppMessage(
  colmado: any,
  from: string,
  messageText: string,
  messageType: string,
  extras?: { latitude?: number; longitude?: number; audioId?: string }
) {
  try {
    // FIRST: Check if this is a delivery driver (before creating customer conversation)
    const deliveryDriver = await storage.getDeliveryByWhatsapp(from);
    if (deliveryDriver && deliveryDriver.colmadoId === colmado.id) {
      const text = messageText || "";
      const textLower = text.toLowerCase().trim();
      const esComandoActivo = textLower === "activo" || textLower === "estoy activo" || textLower === "disponible" || textLower === "listo";
      const esComandoDescanso = textLower === "descanso" || textLower === "pausa" || textLower === "en descanso" || textLower === "break";
      const esComandoInactivo = textLower === "inactivo" || textLower.includes("ya no") || textLower.includes("termine");
      const esComandoEntregado = textLower.includes("entregado") || textLower.includes("entregue") || textLower.includes("recogido") || textLower.includes("recogi");
      const esComandoCancelado = textLower.includes("cancelado") || textLower.includes("cancele");
      const esComandoRetorno = textLower.includes("retorno") || textLower.includes("devuelto") || textLower.includes("devolver");
      
      const msgRequiereActivacion = await storage.getMensajeSistema("delivery_requiere_activacion");
      const msgActivado = await storage.getMensajeSistema("delivery_activado");
      const msgInactivo = await storage.getMensajeSistema("delivery_inactivo");
      const msgContactoColmado = await storage.getMensajeSistema("delivery_contacto_colmado");
      const msgEntregadoOk = await storage.getMensajeSistema("delivery_entregado_ok");
      const msgEntregadoIdInvalido = await storage.getMensajeSistema("delivery_entregado_id_invalido");
      const msgCanceladoOk = await storage.getMensajeSistema("delivery_cancelado_ok");
      const msgCanceladoIdInvalido = await storage.getMensajeSistema("delivery_cancelado_id_invalido");
      
      let respuestaDelivery = "";
      
      if (esComandoActivo) {
        await storage.activarDelivery(deliveryDriver.id, "whatsapp");
        const deliveryPromptConfig = await storage.getConfiguracion("delivery_prompt");
        if (deliveryPromptConfig?.valor) {
          const promptPersonalizado = deliveryPromptConfig.valor
            .replace(/\{delivery_nombre\}/g, deliveryDriver.nombre)
            .replace(/\{negocio_nombre\}/g, colmado.nombre || "el negocio");
          respuestaDelivery = promptPersonalizado;
        } else {
          respuestaDelivery = msgActivado?.contenido || "✅ ¡Ya estás activo! Podrás recibir pedidos para entrega.";
        }
        console.log(`Delivery ${deliveryDriver.nombre} (${from}) activated`);
      } else if (esComandoDescanso) {
        await storage.updateDeliveryEstado(deliveryDriver.id, "en_descanso");
        respuestaDelivery = `☕ ¡Entendido ${deliveryDriver.nombre}! Estás en descanso. No recibirás pedidos nuevos por ahora.\n\nCuando regreses escribe "activo". ¡Descansa!`;
        console.log(`Delivery ${deliveryDriver.nombre} (${from}) set to en_descanso`);
      } else if (esComandoInactivo) {
        await storage.updateDeliveryEstado(deliveryDriver.id, "inactivo");
        respuestaDelivery = (msgInactivo?.contenido || "👋 ¡Entendido {delivery_nombre}! Ya no recibirás pedidos nuevos.\n\nCuando quieras volver, escribe \"activo\". ¡Descansa!")
          .replace("{delivery_nombre}", deliveryDriver.nombre);
        console.log(`Delivery ${deliveryDriver.nombre} (${from}) deactivated`);
      } else if (esComandoEntregado) {
        const idMatch = text.match(/(\d+)/);
        if (idMatch) {
          const pedidoId = parseInt(idMatch[1]);
          const pedido = await storage.getPedidoById(pedidoId);
          if (pedido && pedido.deliveryId === deliveryDriver.id) {
            await storage.updatePedidoEstado(pedidoId, "entregado");
            const hoy = new Date();
            const ventaActual = await storage.getVentasDiarias(pedido.colmadoId, hoy);
            const nuevoPedidosEntregados = (ventaActual?.pedidosEntregados || 0) + 1;
            const nuevoTotal = parseFloat(ventaActual?.totalVentas || "0") + parseFloat(pedido.total);
            await storage.updateVentas(pedido.colmadoId, hoy, {
              pedidosEntregados: nuevoPedidosEntregados,
              totalVentas: nuevoTotal.toString()
            });
            respuestaDelivery = (msgEntregadoOk?.contenido || "✅ Pedido #{pedido_id} marcado como entregado. ¡Buen trabajo!")
              .replace("{pedido_id}", pedidoId.toString());
            try {
              const convCliente = await storage.getConversacionByClienteWhatsapp(pedido.colmadoId, pedido.clienteWhatsapp);
              if (convCliente) {
                await storage.updateConversacionPedidoEstado(convCliente.id, "entregado");
              }
            } catch (e) { console.error("Error resetting conversation after entregado:", e); }
            // Fan-out to web chat client
            try {
              const chatWebSesionEntregado2 = await storage.getChatWebSessionByPedidoId(pedidoId);
              if (chatWebSesionEntregado2) {
                const msgClienteEntregado2 = `✅ ¡Pedido #${pedidoId} entregado!\n\n¡Gracias por tu compra! Esperamos que disfrutes tu pedido. 🛒\n\n¿Tienes alguna duda? Escríbenos.`;
                await storage.addChatWebMensaje(chatWebSesionEntregado2.sessionId, "assistant", msgClienteEntregado2);
              }
            } catch (chatWebErr2) {
              console.error("Error notifying web chat on WA delivery entregado (v2):", chatWebErr2);
            }
          } else {
            respuestaDelivery = msgEntregadoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"entregado #123\"";
          }
        } else {
          respuestaDelivery = msgEntregadoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"entregado #123\"";
        }
      } else if (esComandoCancelado) {
        const idMatch = text.match(/(\d+)/);
        if (idMatch) {
          const pedidoId = parseInt(idMatch[1]);
          const pedido = await storage.getPedidoById(pedidoId);
          if (pedido && pedido.deliveryId === deliveryDriver.id) {
            await storage.updatePedidoEstado(pedidoId, "cancelado");
            const hoy = new Date();
            const ventaActual = await storage.getVentasDiarias(pedido.colmadoId, hoy);
            const nuevoCancelados = (ventaActual?.pedidosCancelados || 0) + 1;
            await storage.updateVentas(pedido.colmadoId, hoy, {
              pedidosCancelados: nuevoCancelados
            });
            respuestaDelivery = (msgCanceladoOk?.contenido || "❌ Pedido #{pedido_id} marcado como cancelado.")
              .replace("{pedido_id}", pedidoId.toString());
            try {
              const convCliente = await storage.getConversacionByClienteWhatsapp(pedido.colmadoId, pedido.clienteWhatsapp);
              if (convCliente) {
                await storage.updateConversacionPedidoEstado(convCliente.id, "cancelado");
              }
            } catch (e) { console.error("Error resetting conversation after cancelado:", e); }
          } else {
            respuestaDelivery = msgCanceladoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"cancelado #123\"";
          }
        } else {
          respuestaDelivery = msgCanceladoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"cancelado #123\"";
        }
      } else if (esComandoRetorno) {
        const idMatch = text.match(/(\d+)/);
        if (idMatch) {
          const pedidoId = parseInt(idMatch[1]);
          const pedido = await storage.getPedidoById(pedidoId);
          if (pedido && pedido.deliveryId === deliveryDriver.id) {
            await storage.updatePedidoEstado(pedidoId, "retorno");
            respuestaDelivery = `🔄 Pedido #${pedidoId} marcado como retorno. El producto será devuelto al colmado.`;
            try {
              const convCliente = await storage.getConversacionByClienteWhatsapp(pedido.colmadoId, pedido.clienteWhatsapp);
              if (convCliente) {
                await storage.updateConversacionPedidoEstado(convCliente.id, "retorno");
              }
            } catch (e) { console.error("Error resetting conversation after retorno:", e); }
          } else {
            respuestaDelivery = "Por favor indica el número de pedido. Ej: \"retorno #123\"";
          }
        } else {
          respuestaDelivery = "Por favor indica el número de pedido. Ej: \"retorno #123\"";
        }
      } else if (deliveryDriver.estado === "activo") {
        const telefonoColmado = colmado.whatsappNumero || "el colmado";
        respuestaDelivery = (msgContactoColmado?.contenido || "No puedes comunicarte con el colmado por esta vía. Llámalo directamente al {telefono_colmado} 📞")
          .replace("{telefono_colmado}", telefonoColmado);
      } else {
        respuestaDelivery = msgRequiereActivacion?.contenido || "Para recibir pedidos, escribe 'activo' 📲";
      }
      
      const deliveryConversacion = await storage.getOrCreateDeliveryConversacion(colmado.id, from, deliveryDriver.nombre);
      await storage.addMensaje(deliveryConversacion.id, "user", text);
      
      await sendWhatsAppMessageSmart(colmado, from, respuestaDelivery);
      await storage.addMensaje(deliveryConversacion.id, "assistant", respuestaDelivery);
      
      console.log(`Delivery response sent to ${from}: ${respuestaDelivery.substring(0, 50)}...`);
      return;
    }

    // Not a delivery - proceed with customer flow
    const conversacion = await storage.getOrCreateConversacion(colmado.id, from);

    // Check if colmado is open (business hours check)
    const webChatTz = await getColmadoTimezone(colmado);
    const estadoAbierto = storage.isColmadoAbierto(colmado, webChatTz);
    if (!estadoAbierto.abierto) {
      const horaAperturaDisplay = (() => {
        const [hours, minutes] = (colmado.horaApertura || "08:00").split(":").map(Number);
        const period = hours >= 12 ? "PM" : "AM";
        const hours12 = hours % 12 || 12;
        return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
      })();
      
      let mensajeCerrado = estadoAbierto.mensaje;
      if (!mensajeCerrado.includes("Abrimos")) {
        mensajeCerrado = `🚫 ${mensajeCerrado}\n\n⏰ Horario: ${horaAperturaDisplay}`;
      } else {
        mensajeCerrado = `🚫 ${mensajeCerrado}`;
      }
      
      await storage.addMensaje(conversacion.id, "user", messageText || "[mensaje recibido]");
      await humanDelay();
      await sendWhatsAppMessageSmart(colmado, from, mensajeCerrado);
      await storage.addMensaje(conversacion.id, "assistant", mensajeCerrado);
      console.log(`Colmado ${colmado.nombre} is closed - sent closed message to ${from}`);
      return;
    }

    // Handle location messages
    if (messageType === "location" && extras?.latitude && extras?.longitude) {
      const lat = extras.latitude;
      const lon = extras.longitude;
      
      await storage.updateConversacionDireccion(conversacion.id, {
        latitud: lat.toString(),
        longitud: lon.toString()
      });
      
      const cliente = await storage.getOrCreateCliente(colmado.id, from, {
        nombre: conversacion.clienteNombre || undefined,
        latitud: lat.toString(),
        longitud: lon.toString()
      });
      
      await storage.addMensaje(conversacion.id, "user", `[Ubicación compartida 📍]`);
      
      const conv = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
      const tieneNombre = conv?.clienteNombre && conv.clienteNombre !== "Cliente";
      const tieneDireccion = conv?.direccionTexto;
      
      const msgUbicacion = await storage.getMensajeSistema("ubicacion_guardada");
      const msgDireccion = await storage.getMensajeSistema("pregunta_direccion");
      const msgNombre = await storage.getMensajeSistema("pregunta_nombre");
      
      let respuesta = "";
      if (!tieneDireccion) {
        const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
        const direccionMsg = msgDireccion?.contenido || "¿Cuál es tu dirección de entrega?";
        respuesta = `${ubicacionMsg} ${direccionMsg}`;
        await humanDelay();
        await sendWhatsAppMessageSmart(colmado, from, respuesta);
        await storage.addMensaje(conversacion.id, "assistant", respuesta);
      } else if (!tieneNombre) {
        const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
        const nombreMsg = msgNombre?.contenido || "¿A nombre de quién va el pedido?";
        respuesta = `${ubicacionMsg} ${nombreMsg}`;
        await humanDelay();
        await sendWhatsAppMessageSmart(colmado, from, respuesta);
        await storage.addMensaje(conversacion.id, "assistant", respuesta);
      } else {
        const historialMensajes = await storage.getMensajesByConversacion(conversacion.id, 15);
        const costoDelivery = parseFloat(colmado.costoDelivery ?? "0");
        const monedaSimbolo = (colmado as any).simboloMoneda || "RD$";
        
        const mensajesParaResumen: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          {
            role: "system",
            content: `Analiza el historial de la conversación y extrae los productos que el cliente pidió.
            El cliente se llama "${conv.clienteNombre}" y su dirección es "${conv.direccionTexto}".
            
            IMPORTANTE: 
            - NO inventes precios. Solo incluye "monto" si el cliente lo mencionó explícitamente.
            - "Dame 20 de salsa" = monto: 20 (son 20 de la moneda local de salsa)
            - "Dame 2 cervezas" = cantidad: 2, monto: null (no sabemos el precio)
            
            Responde en JSON:
            {
              "productos": [{ "nombre": string, "cantidad": number | null, "monto": number | null }]
            }`
          }
        ];
        
        const historialOrdenado = [...historialMensajes].reverse();
        for (const msg of historialOrdenado) {
          mensajesParaResumen.push({
            role: msg.rol === "user" ? "user" : "assistant",
            content: msg.contenido
          });
        }
        
        try {
          const resumenCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: mensajesParaResumen,
            response_format: { type: "json_object" },
            max_tokens: 500,
          });
          
          const resumenDatos = JSON.parse(resumenCompletion.choices[0]?.message?.content || "{}");
          
          let productosTexto = "";
          if (Array.isArray(resumenDatos.productos)) {
            productosTexto = resumenDatos.productos.map((p: any) => {
              if (p.monto) {
                return `• ${p.nombre} (${monedaSimbolo}${p.monto})`;
              } else if (p.cantidad) {
                return `• ${p.cantidad}x ${p.nombre}`;
              } else {
                return `• ${p.nombre}`;
              }
            }).join("\n");
          }
          
          const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
          respuesta = `${ubicacionMsg}\n\n📝 *Tu pedido:*\n${productosTexto || "Tus productos"}\n🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n\n⏳ El colmado revisará tu pedido y te confirmará el total.`;
          
        } catch (e) {
          console.error("Error getting order summary:", e);
          const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
          respuesta = `${ubicacionMsg} ¿Me confirmas tu pedido para enviártelo?`;
        }
        
        await humanDelay();
        await sendWhatsAppMessageSmart(colmado, from, respuesta);
        await storage.addMensaje(conversacion.id, "assistant", respuesta);
      }
      return;
    }

    // Handle audio messages - skip transcription if no audioId
    if (messageType === "audio") {
      if (extras?.audioId) {
        console.log(`Received voice note from ${from}, transcribing...`);
        const accessToken = colmado.whatsappAccessToken || tokenGlobalMeta();
        if (accessToken) {
          const transcribedText = await transcribeWhatsAppAudio(extras.audioId, accessToken);
          if (!transcribedText) {
            await humanDelay();
            await sendWhatsAppMessageSmart(colmado, from, 
              "🎤 No pude escuchar tu nota de voz. ¿Podrías escribirme tu pedido?");
            return;
          }
          messageText = transcribedText;
          messageType = "text";
          console.log(`Voice note transcribed to: "${transcribedText}"`);
        } else {
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from,
            "🎤 No pude escuchar tu nota de voz. ¿Podrías escribirme tu pedido?");
          return;
        }
      } else {
        messageType = "text";
      }
    }

    // Handle text messages
    if (messageType === "text" && messageText) {
      const text = messageText.trim();
      const textLower = text.toLowerCase();
      const enrichedColmadoPIM = await _enrichColmadoWithMoneda(colmado);
      const palabraDevuelta = _getPalabraDevuelta((enrichedColmadoPIM as any).codigoPais || "DO");
      const monedaSimbolo = (enrichedColmadoPIM as any).simboloMoneda || "RD$";
      const monedaNombrePIM = (enrichedColmadoPIM as any).monedaNombre || "Peso Dominicano";
      
      const WINDOW_LIMIT_MS = 23 * 60 * 60 * 1000 + 50 * 60 * 1000;
      const now = new Date();
      const lastMessageTime = conversacion.ultimoMensaje ? new Date(conversacion.ultimoMensaje) : null;
      
      if (lastMessageTime) {
        const timeSinceLastMessage = now.getTime() - lastMessageTime.getTime();
        if (timeSinceLastMessage > WINDOW_LIMIT_MS) {
          await storage.addMensaje(conversacion.id, "user", text);
          console.log(`24h window near expiry for ${from} - saved message but not responding. Last message was ${Math.round(timeSinceLastMessage / 60000)} minutes ago.`);
          return;
        }
      }

      // ============ AGE VERIFICATION FOR RESTRICTED PRODUCTS ============
      const deteccionRestringidoWA = await storage.detectarProductoRestringido(text);
      const tipoRestringidoWA = deteccionRestringidoWA.categoria === "alcohol" ? "bebidas alcohólicas" : deteccionRestringidoWA.categoria === "tabaco" ? "cigarrillos" : deteccionRestringidoWA.categoria;
      
      if (deteccionRestringidoWA.restringido) {
        const clienteWA = await storage.getClienteByWhatsapp(colmado.id, from);
        
        if (clienteWA?.edadVerificada) {
          console.log(`[POLICY] Age already verified for ${from} - proceeding with ${deteccionRestringidoWA.categoria} order`);
        } else {
          const historialReciente = await storage.getMensajesByConversacion(conversacion.id, 10);
          const mensajesOrdenados = [...historialReciente].reverse();
          
          let indicePreguntaEdad = -1;
          let edadRechazada = false;
          
          for (let i = 0; i < mensajesOrdenados.length; i++) {
            const m = mensajesOrdenados[i];
            if (m.rol === "assistant" && m.contenido.includes("mayor de 18 años")) {
              indicePreguntaEdad = i;
            }
            if (indicePreguntaEdad !== -1 && i > indicePreguntaEdad && m.rol === "user") {
              const respuesta = m.contenido.toLowerCase().trim();
              if (respuesta === "no") {
                edadRechazada = true;
                break;
              }
            }
          }
          
          const yaPreguntamosEdad = indicePreguntaEdad !== -1 && !edadRechazada;
          
          if (edadRechazada) {
            await storage.addMensaje(conversacion.id, "user", text);
            const respuestaNoEdad = `⚠️ Lo sentimos, no podemos procesar pedidos de ${tipoRestringidoWA} sin verificación de edad.\n\n¿Te puedo ayudar con algún otro producto?`;
            await humanDelay();
            await sendWhatsAppMessageSmart(colmado, from, respuestaNoEdad);
            await storage.addMensaje(conversacion.id, "assistant", respuestaNoEdad);
            console.log(`[POLICY] ${deteccionRestringidoWA.categoria} blocked - user previously rejected age verification from ${from}`);
            return;
          }
          
          if (!yaPreguntamosEdad) {
            await storage.addMensaje(conversacion.id, "user", text);
            const respuestaEdad = `🔞 Para continuar con pedidos de ${tipoRestringidoWA}, necesitamos confirmar tu edad.\n\n¿Confirmas que eres mayor de 18 años?\n\nResponde *SÍ* para continuar o *NO* si prefieres otros productos.`;
            await humanDelay();
            await sendWhatsAppMessageSmart(colmado, from, respuestaEdad);
            await storage.addMensaje(conversacion.id, "assistant", respuestaEdad);
            console.log(`[POLICY] Age verification requested for ${deteccionRestringidoWA.categoria} from ${from}`);
            return;
          }
          
          if (yaPreguntamosEdad) {
            const respuestaActual = textLower.trim();
            if (respuestaActual === "sí" || respuestaActual === "si" || respuestaActual === "confirmo" ||
                respuestaActual.includes("soy mayor") || respuestaActual.includes("tengo más de 18") ||
                respuestaActual.includes("tengo mas de 18")) {
              await storage.addMensaje(conversacion.id, "user", text);
              const clienteParaVerificar = await storage.getOrCreateCliente(colmado.id, from);
              await storage.verificarEdadCliente(clienteParaVerificar.id);
              console.log(`[POLICY] Age verified and persisted for ${from}`);
              const confirmacionEdad = `✅ ¡Gracias! Tu edad ha sido verificada. No te volveremos a preguntar.\n\n¿Qué te gustaría ordenar?`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, confirmacionEdad);
              await storage.addMensaje(conversacion.id, "assistant", confirmacionEdad);
              return;
            } else if (respuestaActual === "no") {
              await storage.addMensaje(conversacion.id, "user", text);
              const respuestaNoEdad = `⚠️ Lo sentimos, no podemos procesar pedidos de ${tipoRestringidoWA} sin verificación de edad.\n\n¿Te puedo ayudar con algún otro producto?`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaNoEdad);
              await storage.addMensaje(conversacion.id, "assistant", respuestaNoEdad);
              console.log(`[POLICY] ${deteccionRestringidoWA.categoria} blocked - user rejected age verification from ${from}`);
              return;
            } else {
              await storage.addMensaje(conversacion.id, "user", text);
              const respuestaEdad = `🔞 Antes de continuar, necesito que confirmes tu edad.\n\n¿Eres mayor de 18 años? Responde *SÍ* o *NO*.`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaEdad);
              await storage.addMensaje(conversacion.id, "assistant", respuestaEdad);
              console.log(`[POLICY] Re-requesting age verification from ${from}`);
              return;
            }
          }
        }
      }

      // Check if customer is sending address
      const addressKeywords = ["mi dirección", "mi direccion", "esta es mi", "envíenlo a", "envienlo a", "llévalo a", "llevalo a", "estoy en", "vivo en"];
      const isAddressMessage = addressKeywords.some(kw => textLower.includes(kw));
      
      if (isAddressMessage) {
        await storage.updateConversacionDireccion(conversacion.id, { texto: text });
        await storage.addMensaje(conversacion.id, "user", text);
        
        const respuesta = `📍 ¡Dirección guardada! Ahora envíanos tu pedido y te lo llevamos.`;
        await humanDelay();
        await sendWhatsAppMessageSmart(colmado, from, respuesta);
        await storage.addMensaje(conversacion.id, "assistant", respuesta);
        return;
      }
      
      // ========== DETECCIÓN DE INTENCIÓN DEL BOT ==========
      const intencionWA = await storage.detectarIntencion(text);
      
      const tiposSinMenuWA = ["colmado", "colmadon"];
      const tieneMenuActivo = !tiposSinMenuWA.includes(colmado.tipoNegocio);
      let menuDisplayWA = "";
      
      if (tieneMenuActivo) {
        const menuProductosWA = await storage.getMenuProductos(colmado.id);
        if (menuProductosWA.length > 0) {
          menuDisplayWA = _buildMenuDisplayWA(
            menuProductosWA,
            monedaSimbolo,
            colmado.slug,
            colmado.id
          );
        }
      }
      
      if (intencionWA && intencionWA.codigo !== "fallback") {
        await storage.addMensaje(conversacion.id, "user", text);
        
        const horarioDisplayWA = colmado.horaApertura && colmado.horaCierre 
          ? `${colmado.horaApertura} - ${colmado.horaCierre}` 
          : "Consultar con el negocio";
        const direccionDisplayWA = colmado.direccion || "Consultar con el negocio";
        
        let respuestaWA = intencionWA.respuesta
          .replace(/\{NEGOCIO\}/g, colmado.nombre)
          .replace(/\{MENU\}/g, menuDisplayWA.trim() || "Envíame tu lista de productos")
          .replace(/\{HORARIO\}/g, horarioDisplayWA)
          .replace(/\{DIRECCION\}/g, direccionDisplayWA);
        
        if (respuestaWA.length > 1500) {
          const partes = respuestaWA.match(/.{1,1400}(?:\n|$)/g) || [respuestaWA];
          for (const parte of partes) {
            await humanDelay();
            await sendWhatsAppMessageSmart(colmado, from, parte.trim());
          }
        } else {
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, respuestaWA);
        }
        await storage.addMensaje(conversacion.id, "assistant", respuestaWA);
        return;
      }
      
      // Save the incoming message (for fallback or unrecognized messages - handled by AI)
      await storage.addMensaje(conversacion.id, "user", text);
      
      const conversacionActualizada = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
      
      // CHECK FOR PENDING ORDERS IN DIFFERENT STATES
      const pedidosCliente = await storage.getPedidosByClienteWhatsapp(colmado.id, from);
      const pedidoEsperandoPago = pedidosCliente.find(p => p.estado === "esperando_pago");
      const pedidoEsperandoSustituciones = pedidosCliente.find(p => p.estado === "esperando_confirmacion_sustituciones");
      const pedidoPendienteConf = pedidosCliente.find(p => p.estado === "pendiente_confirmacion");

      // PRE-AI HANDLER: pendiente_confirmacion — cancel or status keywords handled without AI
      if (pedidoPendienteConf && !pedidoEsperandoPago && !pedidoEsperandoSustituciones) {
        const esCancelarWA = textLower.includes("cancel") || textLower.includes("ya no quiero") || textLower.includes("no lo quiero") || textLower === "no";
        const esEstadoWA = ["estatus", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "ya salio", "ya salió", "mi delivery", "mi pedido", "seguimiento", "tracking", "confirmaron", "confirmado", "donde", "cuando", "listo", "llegó", "llego"].some(k => textLower.includes(k));

        if (esCancelarWA) {
          await storage.updatePedidoEstado(pedidoPendienteConf.id, "cancelado");
          const msgCancelado = `❌ Tu pedido #${pedidoPendienteConf.id} ha sido cancelado.\n\n¿En qué más te puedo ayudar? 😊`;
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, msgCancelado);
          await storage.addMensaje(conversacion.id, "assistant", msgCancelado);
          return;
        }

        if (esEstadoWA) {
          const msgEstado = buildOrderStatusMessage(pedidoPendienteConf, colmado);
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, msgEstado);
          await storage.addMensaje(conversacion.id, "assistant", msgEstado);
          return;
        }
      }

      // HANDLE SUBSTITUTION CONFIRMATION FLOW
      if (pedidoEsperandoSustituciones) {
        const sustituciones = pedidoEsperandoSustituciones.sustituciones as Array<{ original: string; nuevo: string; monto?: number; estado: "pendiente" | "aceptada" | "rechazada" }> || [];
        const sustitucionPendiente = sustituciones.find(s => s.estado === "pendiente");
        
        if (sustitucionPendiente) {
          const respuestaPositiva = ["si", "sí", "yes", "ok", "okay", "dale", "va", "claro", "acepto", "bueno", "bien", "👍", "esta bien", "está bien"].some(word => textLower.includes(word));
          const respuestaNegativa = ["no", "nope", "nel", "nah", "no quiero", "mejor no", "👎", "quitalo", "quítalo", "remueve", "sin ese"].some(word => textLower.includes(word));
          
          if (respuestaPositiva || respuestaNegativa) {
            const nuevasSustituciones = sustituciones.map(s => {
              if (s.original === sustitucionPendiente.original) {
                return { ...s, estado: respuestaPositiva ? "aceptada" as const : "rechazada" as const };
              }
              return s;
            });
            
            let nuevoTotal = parseFloat(pedidoEsperandoSustituciones.totalConfirmado || pedidoEsperandoSustituciones.total);
            let productosActualizados = pedidoEsperandoSustituciones.productos;
            
            if (respuestaNegativa && sustitucionPendiente.monto) {
              nuevoTotal -= sustitucionPendiente.monto;
              try {
                const productos = typeof productosActualizados === 'string' 
                  ? JSON.parse(productosActualizados) 
                  : productosActualizados;
                if (Array.isArray(productos)) {
                  const productosFiltrados = productos.filter((p: any) => 
                    (p.nombre || p.name || "").toLowerCase() !== sustitucionPendiente.original.toLowerCase()
                  );
                  productosActualizados = JSON.stringify(productosFiltrados);
                }
              } catch (e) { }
            }
            
            if (respuestaNegativa) {
              await storage.updatePedidoProductosYTotal(
                pedidoEsperandoSustituciones.id, 
                productosActualizados, 
                nuevoTotal.toString(), 
                nuevasSustituciones
              );
            } else {
              await storage.updateSustituciones(pedidoEsperandoSustituciones.id, nuevasSustituciones);
            }
            
            const siguienteSustitucion = nuevasSustituciones.find(s => s.estado === "pendiente");
            
            if (siguienteSustitucion) {
              let mensaje = "";
              if (respuestaPositiva) {
                mensaje = `✅ Perfecto, aceptaste el cambio.\n\n`;
              } else {
                mensaje = `👍 Entendido, removimos *${sustitucionPendiente.original}* de tu pedido.\n\n`;
              }
              mensaje += `📋 *Siguiente cambio:*\n`;
              mensaje += `No tenemos *${siguienteSustitucion.original}* disponible.\n\n`;
              mensaje += `🔄 Te ofrecemos: *${siguienteSustitucion.nuevo}*\n\n`;
              mensaje += `¿Aceptas este cambio?\n`;
              mensaje += `👍 Responde *SÍ* para aceptar\n`;
              mensaje += `👎 Responde *NO* para remover este producto del pedido`;
              
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, mensaje);
              await storage.addMensaje(conversacion.id, "assistant", mensaje);
            } else {
              // All substitutions resolved — branch by known payment method
              const pedidoActualizado = await storage.getPedidoById(pedidoEsperandoSustituciones.id);
              // totalConfirmado/total already includes delivery (set by confirmarPedidoConSustituciones)
              const totalConDelivery = parseFloat(pedidoActualizado?.totalConfirmado || pedidoActualizado?.total || "0");
              const costoDeliveryVal = parseFloat(colmado.costoDelivery ?? "0");
              const subtotalProductos = Math.max(0, totalConDelivery - costoDeliveryVal);
              const metodoPagoActual = pedidoActualizado?.metodoPago || pedidoEsperandoSustituciones.metodoPago || null;

              let mensajeBase = respuestaPositiva
                ? `✅ Perfecto, aceptaste el cambio.\n\n`
                : `👍 Entendido, removimos *${sustitucionPendiente.original}* de tu pedido.\n\n`;
              mensajeBase += `✅ *¡Pedido #${pedidoEsperandoSustituciones.id} Listo!*\n\n`;
              mensajeBase += `💰 Subtotal: ${monedaSimbolo}${subtotalProductos}\n`;
              mensajeBase += `🛵 Delivery: ${monedaSimbolo}${costoDeliveryVal}\n`;
              mensajeBase += `━━━━━━━━━━━━━━━\n`;
              mensajeBase += `*💵 Total a pagar: ${monedaSimbolo}${totalConDelivery}*`;

              let mensajeFinal = "";
              if (metodoPagoActual === "efectivo") {
                // Cash already selected — skip payment selection, go to pendiente
                await storage.updatePedidoEstado(pedidoEsperandoSustituciones.id, "pendiente");
                mensajeFinal = mensajeBase + `\n\n💵 Pagarás en efectivo. ¿Con cuánto dinero vas a pagar para darte tu ${palabraDevuelta}?`;
              } else if (metodoPagoActual === "transferencia") {
                // Transfer selected — create order immediately so business can start preparing
                await storage.updatePedidoEstado(pedidoEsperandoSustituciones.id, "pendiente_confirmacion");
                const metodosPagoConfigSust2 = await storage.getMetodosPago(colmado.id);
                let infoBancosT = "";
                if (metodosPagoConfigSust2?.bancos?.length) {
                  for (const banco of metodosPagoConfigSust2.bancos) {
                    infoBancosT += `\n• *${banco.nombre}:* ${banco.numeroCuenta} (${banco.tipoCuenta})`;
                  }
                }
                mensajeFinal = mensajeBase +
                  `\n\n🏦 *Transferencia bancaria:*${infoBancosT || " El negocio te contactará con los datos."}` +
                  `\n\n📄 *Por favor envía una foto del comprobante*, para poder procesar tu orden.`;
              } else {
                // Payment method unknown — ask client to select
                await storage.updatePedidoEstado(pedidoEsperandoSustituciones.id, "esperando_pago");
                const metodosPagoConfigSust = await storage.getMetodosPago(colmado.id);
                const metodosHabilitadosSust: string[] = [];
                if (metodosPagoConfigSust?.efectivo !== false) metodosHabilitadosSust.push("💵 Efectivo");
                if (metodosPagoConfigSust?.transferencia) metodosHabilitadosSust.push("🏦 Transferencia");
                if (metodosPagoConfigSust?.tarjeta) metodosHabilitadosSust.push("💳 Tarjeta");
                let infoBancosSust = "";
                if (metodosPagoConfigSust?.transferencia && metodosPagoConfigSust.bancos?.length) {
                  const nombresBancosSust = metodosPagoConfigSust.bancos.map((b: any) => b.nombre).join(", ");
                  infoBancosSust = `\n\n🏦 *Transferencia disponible en:* ${nombresBancosSust}\n📞 El negocio te contactará para darte los datos de pago.`;
                }
                mensajeFinal = mensajeBase + infoBancosSust + `\n\n¿Cómo deseas pagar?\n${metodosHabilitadosSust.join("\n")}`;
              }

              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, mensajeFinal);
              await storage.addMensaje(conversacion.id, "assistant", mensajeFinal);
            }
            
            return;
          }
        }
      }
      
      // HANDLE PAYMENT METHOD DETECTION FOR ORDERS WAITING FOR PAYMENT
      if (pedidoEsperandoPago) {
        const costoDeliveryPago = parseFloat(colmado.costoDelivery ?? "0");
        const totalConDeliveryPago = parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total);
        const subtotalProductosPago = Math.max(0, totalConDeliveryPago - costoDeliveryPago);
        const tiempoEstimadoPago = colmado.tiempoEstimado || "20-30 min";
        
        const metodosPagoConfigDirect = await storage.getMetodosPago(colmado.id);
        
        const esEfectivo = ["efectivo", "cash", "en efectivo", "pago efectivo", "con efectivo"].some(k => textLower.includes(k));
        const esTransferencia = ["transferencia", "por transferencia", "transfiero", "te transfiero"].some(k => textLower.includes(k));
        const esTarjeta = ["tarjeta", "con tarjeta", "pos", "credito", "débito", "debito"].some(k => textLower.includes(k));
        const esPagoExacto = ["pago exacto", "exacto", "justo"].some(k => textLower.includes(k));
        
        const palabrasContextoPago = ["con", "pago", "pagar", "pagaré", "pagare", "te pago"];
        const tieneContextoPago = palabrasContextoPago.some(p => textLower.includes(p)) || esEfectivo;
        
        const montoMatch = textLower.match(/(?:con\s+|pago\s+|pagar\s+|pagaré\s+|te pago\s+)?(\d{3,}(?:\.\d+)?)\s*(?:pesos)?/);
        const esMil = (textLower === "mil" || textLower.match(/^(?:con\s+)?mil$/)) && !textLower.includes("millar");
        let montoPagoDetectado: number | null = null;
        
        if (tieneContextoPago && montoMatch) {
          const monto = parseFloat(montoMatch[1]);
          if (monto >= 100) {
            montoPagoDetectado = monto;
          }
        } else if (esMil) {
          montoPagoDetectado = 1000;
        }
        
        const preguntaPedido = ["estatus", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "ya salio", "ya salió", "mi delivery", "mi pedido", "seguimiento", "tracking"].some(k => textLower.includes(k));
        
        if (preguntaPedido) {
          const mensajeInfo = buildOrderStatusMessage(pedidoEsperandoPago, colmado, undefined, monedaSimbolo, metodosPagoConfigDirect);
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, mensajeInfo);
          await storage.addMensaje(conversacion.id, "assistant", mensajeInfo);
          return;
        }
        
        if ((esEfectivo && montoPagoDetectado) || esPagoExacto) {
          const montoFinal = esPagoExacto ? totalConDeliveryPago : montoPagoDetectado!;
          const devuelta = Math.max(0, montoFinal - totalConDeliveryPago);
          
          await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente");
          await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, "efectivo");
          await storage.updatePedidoPago(pedidoEsperandoPago.id, {
            montoPago: montoFinal.toString(),
            necesitaDevuelta: devuelta > 0,
            total: totalConDeliveryPago.toString()
          });
          if (devuelta > 0) await storage.updateVueltoEntregado(pedidoEsperandoPago.id, devuelta);
          
          let mensajeConfirmacion = `✅ *Pedido #${pedidoEsperandoPago.id} confirmado*\n`;
          mensajeConfirmacion += `💵 Efectivo: ${monedaSimbolo}${montoFinal}`;
          if (devuelta > 0) {
            mensajeConfirmacion += ` | Devuelta: ${monedaSimbolo}${devuelta}`;
          }
          mensajeConfirmacion += `\n⏱️ ${tiempoEstimadoPago}`;
          
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, mensajeConfirmacion);
          await storage.addMensaje(conversacion.id, "assistant", mensajeConfirmacion);
          
          await autoAssignAndNotifyDelivery(colmado, pedidoEsperandoPago.id, "efectivo", montoFinal, devuelta, totalConDeliveryPago, from);
          
          return;
        }
        
        if (esEfectivo && !montoPagoDetectado) {
          const mensajeMonto = `💵 *Perfecto, pagarás en efectivo.*\n\n¿Con cuánto vas a pagar para darte tu ${palabraDevuelta}?\n\n🛒 Productos: ${monedaSimbolo}${subtotalProductosPago}\n🛵 Delivery: ${monedaSimbolo}${costoDeliveryPago}\n💰 Total a pagar: ${monedaSimbolo}${totalConDeliveryPago}`;
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, mensajeMonto);
          await storage.addMensaje(conversacion.id, "assistant", mensajeMonto);
          return;
        }
        
        if (esTransferencia) {
          await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente_confirmacion");
          await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, "transferencia");
          await storage.updatePedidoPago(pedidoEsperandoPago.id, {
            montoPago: totalConDeliveryPago.toString(),
            necesitaDevuelta: false,
            total: totalConDeliveryPago.toString()
          });
          
          let infoBancosTransf = "";
          if (metodosPagoConfigDirect?.bancos?.length) {
            infoBancosTransf = "\n\n🏦 *Datos para transferencia:*\n";
            for (const banco of metodosPagoConfigDirect.bancos) {
              infoBancosTransf += `• ${banco.nombre}: ${banco.numeroCuenta} (${banco.tipoCuenta})\n`;
            }
          }
          
          let mensajeTransf = `🏦 *Pedido #${pedidoEsperandoPago.id} - Pago por transferencia*\n`;
          mensajeTransf += `💰 Total: ${monedaSimbolo}${totalConDeliveryPago}`;
          mensajeTransf += infoBancosTransf;
          mensajeTransf += `\n📸 Envía tu comprobante de pago y confirmaremos tu pedido.`;
          
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, mensajeTransf);
          await storage.addMensaje(conversacion.id, "assistant", mensajeTransf);
          
          return;
        }
        
        if (esTarjeta) {
          await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente");
          await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, "tarjeta");
          await storage.updatePedidoPago(pedidoEsperandoPago.id, {
            montoPago: totalConDeliveryPago.toString(),
            necesitaDevuelta: false,
            total: totalConDeliveryPago.toString()
          });
          
          let mensajeTarjeta = `✅ *Pedido #${pedidoEsperandoPago.id} confirmado*\n`;
          mensajeTarjeta += `💳 Tarjeta: ${monedaSimbolo}${totalConDeliveryPago}\n`;
          mensajeTarjeta += `⏱️ ${tiempoEstimadoPago}`;
          
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, mensajeTarjeta);
          await storage.addMensaje(conversacion.id, "assistant", mensajeTarjeta);
          
          await autoAssignAndNotifyDelivery(colmado, pedidoEsperandoPago.id, "tarjeta", totalConDeliveryPago, 0, totalConDeliveryPago, from);
          
          return;
        }
      }
      
      // CATCH-ALL STATUS HANDLER: fires for any order state not already handled above
      const esConsultaEstadoEvol = ["estatus", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "ya salio", "ya salió", "mi delivery", "mi pedido", "seguimiento", "tracking"].some(k => textLower.includes(k));
      if (esConsultaEstadoEvol) {
        if (pedidosCliente.length === 0) {
          const msgNoOrder = "No encontré ningún pedido reciente. ¿Deseas hacer un nuevo pedido?";
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, msgNoOrder);
          await storage.addMensaje(conversacion.id, "assistant", msgNoOrder);
          return;
        }
        const pedidoReciente = pedidosCliente[0];
        if (!["esperando_pago", "pendiente_confirmacion"].includes(pedidoReciente.estado)) {
          let deliveryObjEvol: any = undefined;
          if (pedidoReciente.estado === "en_camino" && pedidoReciente.deliveryId) {
            deliveryObjEvol = await storage.getDeliveryById(pedidoReciente.deliveryId);
          }
          const msgEstadoEvol = buildOrderStatusMessage(pedidoReciente, colmado, deliveryObjEvol);
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, msgEstadoEvol);
          await storage.addMensaje(conversacion.id, "assistant", msgEstadoEvol);
          return;
        }
      }

      // Search for known jerga in the dictionary
      const jergaEncontrada = await storage.buscarEnDiccionario(colmado.id, text);
      let diccionarioContext = "";
      if (jergaEncontrada.length > 0) {
        diccionarioContext = "\n\nPalabras conocidas del cliente:\n" + 
          jergaEncontrada.map(j => `- "${j.jerga}" = ${j.productoIdentificado}${j.precioSugerido ? ` (${monedaSimbolo}${j.precioSugerido})` : ""}`).join("\n");
        
        for (const j of jergaEncontrada) {
          await storage.incrementarUsoJerga(j.id);
        }
      }
      
      const historialMensajes = await storage.getMensajesByConversacion(conversacion.id, 10);
      
      const costoDelivery = parseFloat(colmado.costoDelivery ?? "0");
      const pedidoMinimo = colmado.pedidoMinimo ? parseFloat(colmado.pedidoMinimo) : 0;
      const tiempoEstimado = colmado.tiempoEstimado || "20-30 min";
      
      const tieneNombre = !!(conversacionActualizada?.clienteNombre && conversacionActualizada.clienteNombre !== "Cliente");
      const tieneDireccion = !!conversacionActualizada?.direccionTexto;
      const tieneUbicacion = !!(conversacionActualizada?.latitud && conversacionActualizada?.longitud);
      
      const ultimosMensajes = historialMensajes.slice(0, 5).map(m => m.contenido.toLowerCase());
      const yaSeOfrecioGPS = ultimosMensajes.some(m => 
        m.includes("ubicación") || m.includes("compartir tu ubicación") || m.includes("📍")
      );
      
      const msgPromptBase = await storage.getMensajeSistema("system_prompt_base");
      const msgFlowInstructions = await storage.getMensajeSistema("system_flow_instructions");
      const msgPreguntaNombre = await storage.getMensajeSistema("pregunta_nombre");
      const msgPreguntaDireccion = await storage.getMensajeSistema("pregunta_direccion");
      const msgOfrecerUbicacion = await storage.getMensajeSistema("ofrecer_ubicacion");
      const msgConfirmarPedido = await storage.getMensajeSistema("confirmar_pedido");
      const msgPreguntaPago = await storage.getMensajeSistema("pregunta_pago");

      // Build address format context from the colmado's country (Evolution API flow)
      let addressFormatContextEvol = "";
      if (colmado.paisId) {
        const paisDirEvol = await storage.getPais(colmado.paisId);
        if (paisDirEvol) {
          const etiquetaCPEvol = paisDirEvol.etiquetaCodigoPostal;
          const ejDirEvol = paisDirEvol.ejemploDireccion || "Calle Principal #123";
          const ejCiudadEvol = paisDirEvol.ejemploCiudad || "Santo Domingo";
          const ejEstEvol = paisDirEvol.ejemploEstado;
          const ejCPEvol = paisDirEvol.ejemploCodigoPostal;
          const partsEjEvol = [ejDirEvol, ejCiudadEvol, ejEstEvol, ejCPEvol].filter(Boolean).join(", ");
          const zipRequiredEvol = paisDirEvol.requiereCodigoPostal && etiquetaCPEvol;
          const patronCPEvol = (paisDirEvol as any).patronCodigoPostal;
          addressFormatContextEvol = `\n          FORMATO DE DIRECCIÓN (${paisDirEvol.nombre}):
          - Ejemplo completo: "${partsEjEvol}"${etiquetaCPEvol ? `\n          - Debe incluir ${etiquetaCPEvol} (código postal), ej: ${ejCPEvol || "10001"}` : ""}
          Cuando el cliente proporcione su dirección, captura todos los campos disponibles en direccionTexto con este formato.${zipRequiredEvol ? `\n          VALIDACIÓN ZIP OBLIGATORIA: Este negocio requiere ${etiquetaCPEvol} en toda dirección. Si el cliente ya proporcionó su dirección pero NO contiene un código postal (secuencia de dígitos como ${ejCPEvol || "10001"}), NO la guardes como válida — responde pidiendo que incluya el ${etiquetaCPEvol}. Ej: "Para completar tu pedido, necesito tu ${etiquetaCPEvol} (ej: ${ejCPEvol || "10001"}). ¿Me lo puedes indicar?"` : ""}${patronCPEvol ? `\n          FORMATO ZIP: El ${etiquetaCPEvol} debe coincidir con el patrón ${patronCPEvol} (ej: ${ejCPEvol || "10001"}). Si el cliente proporciona un código postal que NO coincide con este formato, recházalo y pide uno correcto.` : ""}`;
        }
      }
      
      const metodosPagoConfig = await storage.getMetodosPago(colmado.id);
      const metodosHabilitados: string[] = [];
      if (metodosPagoConfig?.efectivo !== false) metodosHabilitados.push("efectivo");
      if (metodosPagoConfig?.transferencia) metodosHabilitados.push("transferencia");
      if (metodosPagoConfig?.tarjeta) metodosHabilitados.push("tarjeta");
      
      let infoBancos = "";
      let nombresBancosLista: string[] = [];
      if (metodosPagoConfig?.transferencia && metodosPagoConfig.bancos?.length) {
        nombresBancosLista = metodosPagoConfig.bancos.map((b: any) => b.nombre);
        infoBancos = nombresBancosLista.join(", ");
      }
      
      const tiposSinMenuAI = ["colmado", "colmadon"];
      const tieneMenuAI = !tiposSinMenuAI.includes(colmado.tipoNegocio);
      let menuProductosAI: Array<{ id: number; nombre: string; precio: string; categoria: string }> = [];
      let menuContext = "";
      
      if (tieneMenuAI) {
        const menuItems = await storage.getMenuProductos(colmado.id);
        menuProductosAI = menuItems.filter(p => p.disponible).map(p => ({
          id: p.id,
          nombre: p.nombre.toLowerCase(),
          precio: p.precio,
          categoria: p.categoria
        }));
        
        if (menuProductosAI.length > 0) {
          const nombresMenu = menuProductosAI.map(p => p.nombre).join(", ");
          menuContext = `
          
          MENÚ DEL NEGOCIO (productos disponibles):
          ${nombresMenu}
          
          IMPORTANTE SOBRE PRECIOS:
          - NUNCA menciones precios en tus respuestas al cliente.
          - Si el cliente pregunta precios, dile "Puedes escribir 'menú' para ver todos los precios."
          - Solo captura el nombre del producto que el cliente pide.`;
        }
      }
      
      const globalPromptConfig = await storage.getConfiguracion("system_prompt_global");
      const globalSystemPrompt = globalPromptConfig?.valor || "";
      
      const conocimientoArchivosAI = await storage.getConocimientoByTipo(colmado.tipoNegocio || "colmado");
      let conocimientoContext = "";
      if (conocimientoArchivosAI.length > 0) {
        conocimientoContext = "\n\nDATOS DE CONOCIMIENTO DEL NEGOCIO:\n" +
          conocimientoArchivosAI.map(a => `--- ${a.nombre} ---\n${a.contenido}`).join("\n\n");
      }
      
      const usaMetaAPI = colmado.whatsappProvider !== "evolution";
      let metaPoliciesContext = "";
      if (usaMetaAPI) {
        try {
          // DELYWA: en un Worker no hay sistema de archivos; el texto va embebido.
          metaPoliciesContext = "\n\n" + META_POLICIES;
        } catch (e) { console.error("Error loading meta policies:", e); }
      }
      
      const promptBase = (colmado as any).botPromptCustom || globalSystemPrompt || msgPromptBase?.contenido || "Eres un asistente de pedidos amigable para un colmado en República Dominicana. Usas lenguaje dominicano casual y emojis.";
      
      const pendienteConfContext = pedidoPendienteConf
        ? `\nIMPORTANTE: El cliente ya tiene un pedido #${pedidoPendienteConf.id} en estado "pendiente_confirmacion" (esperando revisión del negocio). NO digas que no tiene pedidos activos.\n- Si el cliente pregunta por su pedido, infórmale que está en revisión.\n- Si el cliente quiere cancelar, usa accion: "cancelar_pedido" con respuesta amigable confirmando la cancelación.\n- No crees un nuevo pedido si el cliente ya tiene uno pendiente de confirmación.`
        : "";

      let systemPrompt = "";
      
      if (pedidoEsperandoPago) {
        // totalConfirmado/total already includes delivery — do NOT add again
        const totalConDeliveryPago = parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total);
        const subtotalProductosEv = Math.max(0, totalConDeliveryPago - costoDelivery);
        
        systemPrompt = `${promptBase}
          Colmado: "${colmado.nombre}"
          
          ESTADO: El cliente tiene un PEDIDO #${pedidoEsperandoPago.id} CONFIRMADO esperando su forma de pago.
          Productos: ${monedaSimbolo}${subtotalProductosEv}
          Delivery: ${monedaSimbolo}${costoDelivery}
          TOTAL A PAGAR: ${monedaSimbolo}${totalConDeliveryPago}
          
          MÉTODOS DE PAGO HABILITADOS: ${metodosHabilitados.join(", ")}
          ${infoBancos ? `BANCOS DISPONIBLES PARA TRANSFERENCIA: ${infoBancos} (NO envíes números de cuenta - el negocio contactará al cliente)` : ""}
          
          TU ÚNICA TAREA: Identificar el método de pago del mensaje del cliente.
          
          FLUJO:
          1. Si el cliente dice "efectivo", "cash", "pago en efectivo": preguntar "¿Con cuánto vas a pagar para darte tu ${palabraDevuelta}? 💵"
          2. Si el cliente da un monto (ej: "con 1000", "500"): confirmar pago y calcular ${palabraDevuelta}
          3. Si dice "transferencia", "por transferencia": confirmar y mostrar datos bancarios
          4. Si dice "tarjeta", "con tarjeta", "pos": confirmar que el delivery cobrará con terminal
          5. Si dice "pago exacto": usar el total como montoPago
          
          RESPONDE SIEMPRE EN JSON:
          {
            "accion": "preguntar_monto_efectivo" | "pago_confirmado" | "conversacion",
            "respuesta": "mensaje amigable para el cliente",
            "metodoPago": "efectivo" | "transferencia" | "tarjeta" | null,
            "montoPago": number | null,
            "devuelta": number | null,
            "pagoConfirmado": boolean
          }
          
          REGLAS:
          - pagoConfirmado = true cuando: (efectivo Y tiene monto) O transferencia O tarjeta
          - devuelta = montoPago - ${totalConDeliveryPago}. Si es 0 o negativo, devuelta = 0
          - El TOTAL incluye productos (${subtotalProductosEv}) + delivery (${costoDelivery}) = ${totalConDeliveryPago}
          - NUNCA uses frases que impliquen un mensaje posterior: "dame un momento", "espera", "ahora lo hago", "en seguida", "te confirmo", "espera un segundo", etc. Tu respuesta ES el mensaje final — confirma la acción directamente en el mismo mensaje.
          ${conocimientoContext}${metaPoliciesContext}`;
      } else {
        systemPrompt = `${promptBase}
          Colmado: "${colmado.nombre}"
          
          ESTADO DEL CLIENTE:
          - Nombre: ${tieneNombre ? conversacionActualizada?.clienteNombre : "NO REGISTRADO"}
          - Dirección: ${tieneDireccion ? conversacionActualizada?.direccionTexto : "NO REGISTRADA"}
          - Ubicación GPS: ${tieneUbicacion ? "SÍ GUARDADA" : "NO GUARDADA"}
          - Ya se ofreció GPS: ${yaSeOfrecioGPS ? "SÍ" : "NO"}
          
          CONFIGURACIÓN DEL COLMADO:
          - Moneda: ${monedaNombrePIM} (símbolo: ${monedaSimbolo})
          - Costo de delivery: ${monedaSimbolo}${costoDelivery}
          - Pedido mínimo: ${monedaSimbolo}${pedidoMinimo}
          - Tiempo estimado: ${tiempoEstimado}
          ${diccionarioContext}
          ${menuContext}
          ${conocimientoContext}${metaPoliciesContext}
          ${addressFormatContextEvol}
          
          ${pendienteConfContext}
          FLUJO DE PEDIDO:
          1. Si el cliente pide productos → capturar productos CON SUS MONTOS
          2. Si no tenemos nombre → preguntar "¿A nombre de quién va el pedido?"
          3. Si no tenemos dirección → preguntar "¿Cuál es tu dirección de entrega?" (incluyendo el formato indicado si aplica)
          4. Si no tenemos GPS y no se ha ofrecido → ofrecer "¿Me puedes compartir tu ubicación 📍?"
          5. Cuando tenemos productos + nombre + dirección → crear pedido y avisar que el colmado confirmará
          
          IMPORTANTE - CAPTURA DE PRODUCTOS:
          - Cuando el cliente dice "10 de salsa", el 10 es el MONTO en la moneda local (${monedaSimbolo}10), NO la cantidad.
          - Ejemplo: "dame 50 de arroz, 100 de aceite, 20 de sal" = 
            * arroz por ${monedaSimbolo}50
            * aceite por ${monedaSimbolo}100
            * sal por ${monedaSimbolo}20
          - NO calcules el total. Solo captura los productos con sus montos mencionados.
          - Si el cliente dice "2 cervezas" sin monto, es cantidad 2 sin precio definido.
          
          RESPONDE SIEMPRE EN JSON:
          {
            "accion": "capturar_productos" | "preguntar_nombre" | "preguntar_direccion" | "ofrecer_ubicacion" | "crear_pedido" | "conversacion",
            "respuesta": "mensaje amigable para el cliente",
            "clienteNombre": "nombre si lo mencionó" | null,
            "direccionTexto": "dirección si la mencionó" | null,
            "productos": [{ "nombre": string, "monto": number | null, "cantidad": number | null, "jergaOriginal": string }] | null,
            "crearPedido": boolean
          }
          
          REGLAS:
          - jergaOriginal: palabra exacta que usó el cliente (ej: "fría", "palo")
          - monto: el valor en pesos mencionado (ej: "10 de salsa" → monto: 10)
          - cantidad: solo si el cliente especifica unidades (ej: "2 cervezas" → cantidad: 2)
          - crearPedido = true cuando: tenemos productos + nombre + dirección
          - Si el cliente dice "no", "no gracias", "así namas", "así nomás", "eso es todo", "con eso", "nada más", "listo", "ya", "ya está", "estamos", "no quiero más", "está bien así" → terminó de agregar productos. Si ya hay productos + nombre + dirección → crearPedido: true. Si faltan nombre o dirección, proceder a pedirlos.
          - Si el cliente pregunta algo general o saluda, usa accion: "conversacion"
          - Si el cliente saluda en inglés (hello, hi, hey, etc.), responde con un saludo amigable en español, NUNCA digas que "solo atendemos en español" ni hagas ninguna mención a restricciones de idioma.
          - NUNCA pidas GPS más de una vez en la conversación
          - La ubicación GPS es OPCIONAL. Si el cliente dice "no" o continúa, avanza.
          - NUNCA uses frases que impliquen un mensaje posterior: "dame un momento", "espera", "ahora lo hago", "en seguida", "te confirmo", "espera un segundo", etc. Tu respuesta ES el mensaje final — confirma la acción directamente en el mismo mensaje.
          - CRÍTICO - NUNCA INVENTES PRODUCTOS: Solo captura en "productos" lo que el cliente mencionó EXPLÍCITAMENTE en su mensaje actual. NO extraigas productos del historial, del menú, ni de pedidos anteriores. Si el cliente dice "quiero añadir algo" o "quiero pedir" sin especificar qué, devuelve accion: "conversacion" con productos: null y pregunta qué desea.`;
      }
      
      const mensajesParaAI: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        {
          role: "system",
          content: systemPrompt
        }
      ];
      
      const historialOrdenado = [...historialMensajes].reverse();
      for (const msg of historialOrdenado) {
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
          max_tokens: 800,
        });

        let datos: any = {};
        try {
          datos = JSON.parse(completion.choices[0]?.message?.content || "{}");
        } catch (parseError) {
          console.error("Error parsing AI response:", parseError);
          datos = { accion: "conversacion", respuesta: "¡Hola! Envíanos tu pedido y te lo llevamos." };
        }

        let respuestaTexto = datos.respuesta || "";
        let conversacionGuardadaEvol = false; // tracks explicit addMensaje inside merge branches
        
        if (datos.clienteNombre && datos.clienteNombre !== "Cliente") {
          await storage.getOrCreateConversacion(colmado.id, from, datos.clienteNombre);
        }
        
        if (datos.direccionTexto) {
          const zipCheckEvol = await validarZipEnDireccion(colmado.paisId, datos.direccionTexto);
          if (zipCheckEvol.zipOk) {
            await storage.updateConversacionDireccion(conversacion.id, {
              texto: datos.direccionTexto
            });
          } else {
            console.warn(
              `[ZIP-ALERT] canal=evolution colmadoId=${colmado.id} from=${from} direccionRecibida="${datos.direccionTexto}"`
            );
            void logZipMissingAlertAndNotify(colmado, "evolution", from, datos.direccionTexto);
            const zipReAskEvol = `Para completar tu pedido necesito tu ${zipCheckEvol.etiquetaCP} (ej: ${zipCheckEvol.ejemploCP}). ¿Me lo puedes indicar junto con tu dirección completa?`;
            datos.respuesta = zipReAskEvol;
            respuestaTexto = zipReAskEvol; // respuestaTexto is the variable actually sent
            datos.crearPedido = false;
            datos.direccionTexto = null;
          }
        }
        
        if (Array.isArray(datos.productos)) {
          for (const producto of datos.productos) {
            if (producto.jergaOriginal && producto.nombre) {
              const jergaLower = producto.jergaOriginal.toLowerCase().trim();
              if (jergaLower !== producto.nombre.toLowerCase() && jergaLower.length > 2) {
                try {
                  await storage.guardarJerga(
                    colmado.id, 
                    jergaLower, 
                    producto.nombre,
                    producto.monto?.toString()
                  );
                  console.log(`Diccionario: guardado "${jergaLower}" = "${producto.nombre}"`);
                } catch (e) {
                  console.log(`Diccionario: error guardando jerga`, e);
                }
              }
            }
          }
          
          if (tieneMenuAI && menuProductosAI.length > 0) {
            for (const producto of datos.productos) {
              const nombreLower = producto.nombre?.toLowerCase().trim() || "";
              
              const menuMatch = menuProductosAI.find(m => 
                m.nombre === nombreLower ||
                m.nombre.includes(nombreLower) ||
                nombreLower.includes(m.nombre)
              );
              
              if (menuMatch) {
                const precioUnitario = parseFloat(menuMatch.precio);
                const cantidad = producto.cantidad || 1;
                producto.precioUnitario = precioUnitario;
                producto.monto = precioUnitario * cantidad;
                producto.menuProductoId = menuMatch.id;
                console.log(`Menu match: "${producto.nombre}" x${cantidad} → ${monedaSimbolo}${producto.monto}`);
              } else {
                producto.monto = null;
                console.log(`Not in menu: "${producto.nombre}" → sin precio`);
              }
            }
          }
        }
        
        if (pedidoEsperandoPago && datos.pagoConfirmado) {
          const metodoPagoFinal = datos.metodoPago || "efectivo";
          const totalPedido = parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total);
          const totalConDelivery = totalPedido; // already includes delivery
          const subtotalEv = Math.max(0, totalConDelivery - costoDelivery);
          const montoPago = Number(datos.montoPago) || totalConDelivery;
          const devuelta = metodoPagoFinal === "efectivo" ? Math.max(0, montoPago - totalConDelivery) : 0;
          
          await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente");
          await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, metodoPagoFinal);
          
          await storage.updatePedidoPago(pedidoEsperandoPago.id, {
            montoPago: montoPago.toString(),
            necesitaDevuelta: metodoPagoFinal === "efectivo" && devuelta > 0,
            total: totalConDelivery.toString()
          });
          if (metodoPagoFinal === "efectivo" && devuelta > 0) await storage.updateVueltoEntregado(pedidoEsperandoPago.id, devuelta);
          
          const metodoPagoLabel = metodoPagoFinal === "efectivo" ? "💵 Efectivo" : 
                                  metodoPagoFinal === "transferencia" ? "🏦 Transferencia" : "💳 Tarjeta";
          
          let productosResumen = "";
          try {
            const productos = typeof pedidoEsperandoPago.productos === 'string' 
              ? JSON.parse(pedidoEsperandoPago.productos) 
              : pedidoEsperandoPago.productos;
            if (Array.isArray(productos)) {
              productosResumen = productos.map((p: any) => {
                const nombre = p.nombre || p.name;
                if (p.monto) return `• ${nombre} (${monedaSimbolo}${p.monto})`;
                if (p.cantidad) return `• ${p.cantidad}x ${nombre}`;
                return `• ${nombre}`;
              }).join("\n");
            }
          } catch (e) {
            productosResumen = String(pedidoEsperandoPago.productos);
          }
          
          respuestaTexto = `✅ *¡Pedido #${pedidoEsperandoPago.id} Confirmado!*\n\n`;
          respuestaTexto += `📝 *Tu pedido:*\n${productosResumen}\n\n`;
          respuestaTexto += `💰 Subtotal: ${monedaSimbolo}${subtotalEv}\n`;
          respuestaTexto += `🛵 Delivery: ${monedaSimbolo}${costoDelivery}\n`;
          respuestaTexto += `━━━━━━━━━━━━━━━\n`;
          respuestaTexto += `*💵 Total: ${monedaSimbolo}${totalConDelivery}*\n\n`;
          respuestaTexto += `*Pago:* ${metodoPagoLabel}\n`;
          if (metodoPagoFinal === "efectivo" && devuelta > 0) {
            respuestaTexto += `💵 Pagas con: ${monedaSimbolo}${montoPago}\n`;
            respuestaTexto += `🔄 *${palabraDevuelta.charAt(0).toUpperCase()}${palabraDevuelta.slice(1)}: ${monedaSimbolo}${devuelta}*\n`;
          }
          respuestaTexto += `\n⏱️ *Tiempo estimado de entrega: ${tiempoEstimado}*\n`;
          respuestaTexto += `\n¡Gracias por tu compra! Tu pedido está en camino 🛵`;
          
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
          
          const pedidoActualizado = await storage.getPedidoById(pedidoEsperandoPago.id);
          
          const deliveriesActivos = await storage.getDeliveriesByColmado(colmado.id);
          const deliveriesActivosConVentana: typeof deliveriesActivos = [];
          for (const d of deliveriesActivos) {
            if (d.estado === "activo" && await storage.isDeliveryWindowActive(d)) {
              deliveriesActivosConVentana.push(d);
            }
          }
          
          const deliveryActivo = deliveriesActivosConVentana.length === 1 ? deliveriesActivosConVentana[0] : null;
          
          if (deliveryActivo && pedidoActualizado) {
            await storage.asignarPedidoADelivery(pedidoEsperandoPago.id, deliveryActivo.id);
            
            let productosTexto = "";
            try {
              const productos = typeof pedidoActualizado.productos === 'string' 
                ? JSON.parse(pedidoActualizado.productos) 
                : pedidoActualizado.productos;
              if (Array.isArray(productos)) {
                productosTexto = productos.map((p: any) => 
                  `• ${p.nombre} ${p.monto ? `(${monedaSimbolo}${p.monto})` : p.cantidad ? `x${p.cantidad}` : ""}`
                ).join("\n");
              }
            } catch (e) {
              productosTexto = String(pedidoActualizado.productos);
            }
            
            let ubicacionLink = "";
            let convDirTextoEvol = "";
            try {
              const convUbicacion = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
              if (convUbicacion && convUbicacion.latitud && convUbicacion.longitud) {
                ubicacionLink = `\n📌 https://maps.google.com/?q=${convUbicacion.latitud},${convUbicacion.longitud}`;
              } else {
                const clienteUbicacion = await storage.getClienteByWhatsapp(colmado.id, from);
                if (clienteUbicacion && clienteUbicacion.latitud && clienteUbicacion.longitud) {
                  ubicacionLink = `\n📌 https://maps.google.com/?q=${clienteUbicacion.latitud},${clienteUbicacion.longitud}`;
                }
              }
              // Use conversation address if more complete than the stored order address
              if (convUbicacion?.direccionTexto && (convUbicacion.direccionTexto.length > (pedidoActualizado.clienteUbicacion || "").length)) {
                convDirTextoEvol = convUbicacion.direccionTexto;
              }
            } catch (e) {
              console.error("Error getting client location for delivery:", e);
            }
            const direccionParaEvol = convDirTextoEvol || pedidoActualizado.clienteUbicacion || "Por confirmar";
            
            let deliveryMsg = `🛵 *NUEVO PEDIDO #${pedidoEsperandoPago.id}*\n\n`;
            deliveryMsg += `👤 *Cliente:* ${pedidoActualizado.clienteNombre}\n`;
            deliveryMsg += `📦 *Productos:*\n${productosTexto}\n\n`;
            deliveryMsg += `💰 *Total: ${monedaSimbolo}${totalConDelivery}*\n`;
            deliveryMsg += `\n*PAGO: ${metodoPagoLabel}*\n`;
            if (metodoPagoFinal === "efectivo") {
              deliveryMsg += `💵 *Cobrar: ${monedaSimbolo}${montoPago}*\n`;
              if (devuelta > 0) {
                deliveryMsg += `🔄 *Dar ${palabraDevuelta}: ${monedaSimbolo}${devuelta}*\n`;
              }
            } else if (metodoPagoFinal === "transferencia") {
              deliveryMsg += `✅ *Ya pagado por transferencia*\n`;
            } else if (metodoPagoFinal === "tarjeta") {
              deliveryMsg += `💳 *Cobrar ${monedaSimbolo}${totalConDelivery} con terminal*\n`;
            }
            deliveryMsg += `\n📍 *Dirección:*\n${direccionParaEvol}${ubicacionLink}\n`;
            deliveryMsg += `\n━━━━━━━━━━━━━━━\n`;
            deliveryMsg += `*Responde con:*\n`;
            deliveryMsg += `✅ *entregado #${pedidoEsperandoPago.id}* — Pedido entregado\n`;
            deliveryMsg += `❌ *cancelado #${pedidoEsperandoPago.id}* — No se pudo entregar\n`;
            deliveryMsg += `🔄 *retorno #${pedidoEsperandoPago.id}* — Devolver al colmado`;
            
            await sendWhatsAppMessageSmart(colmado, deliveryActivo.whatsappNumero, deliveryMsg);
          } else if (deliveriesActivosConVentana.length > 1) {
            console.log(`Pedido #${pedidoEsperandoPago.id} pago confirmado - hay ${deliveriesActivosConVentana.length} deliveries activos, admin debe asignar`);
          } else {
            console.log(`Pedido #${pedidoEsperandoPago.id} pago confirmado pero no hay delivery activo`);
          }
          
        } else if (datos.accion === "cancelar_pedido" && pedidoPendienteConf) {
          await storage.updatePedidoEstado(pedidoPendienteConf.id, "cancelado");
          respuestaTexto = datos.respuesta || `❌ Tu pedido #${pedidoPendienteConf.id} ha sido cancelado.\n\n¿En qué más te puedo ayudar? 😊`;
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
          await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
          return;

        } else if (datos.crearPedido && datos.productos && datos.productos.length > 0) {
          // CREATE OR MERGE ORDER
          const conversacionFinal = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
          const clienteExistente = await storage.getClienteByWhatsapp(colmado.id, from);
          // Prefer the freshest captured address (conversation > datos > stored client)
          // so that a new address with ZIP is not shadowed by a stale stored one
          const direccionFinal = conversacionFinal?.direccionTexto || 
                                datos.direccionTexto || 
                                clienteExistente?.direccionTexto || 
                                "Por confirmar";
          const clienteNombreFinal = clienteExistente?.nombre || 
                                    datos.clienteNombre || 
                                    conversacionFinal?.clienteNombre || 
                                    "Cliente";
          
          await storage.getOrCreateCliente(colmado.id, from, {
            nombre: clienteNombreFinal !== "Cliente" ? clienteNombreFinal : undefined,
            direccionTexto: direccionFinal !== "Por confirmar" ? direccionFinal : undefined,
            latitud: conversacionFinal?.latitud || undefined,
            longitud: conversacionFinal?.longitud || undefined,
          });

          // ZIP format guard: validate before any order is created or merged-into-new.
          let zipValidEvol = true;
          if (direccionFinal !== "Por confirmar") {
            const zipCheckEvolOrder = await validarZipEnDireccion(colmado.paisId, direccionFinal);
            if (!zipCheckEvolOrder.zipOk) {
              zipValidEvol = false;
              const etiqEvol = zipCheckEvolOrder.etiquetaCP || "código postal";
              const ejEvol = zipCheckEvolOrder.ejemploCP || "10001";
              respuestaTexto = `Para completar tu pedido necesito un ${etiqEvol} válido (ej: ${ejEvol}). ¿Me puedes indicar tu ${etiqEvol}?`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
              await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
              conversacionGuardadaEvol = true;
            }
          }

          const prodTexto = (prods: any[]) => prods.map((p: any) =>
            `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : p.cantidad ? ` x${p.cantidad}` : ""}`
          ).join("\n");

          // -- MERGE CHECK --
          if (zipValidEvol && pedidoPendienteConf) {
            const menuProductosEvol = await storage.getMenuProductos(colmado.id);
            const eval_ = evaluarElegibilidadMerge(pedidoPendienteConf, datos.productos, menuProductosEvol);

            if (eval_.accion === "merge_all") {
              const nuevoSubtotalEvol = eval_.valorOriginal + eval_.valorNuevo;
              const nuevoTotal = nuevoSubtotalEvol.toString();
              await storage.mergePedidoProductos(pedidoPendienteConf.id, datos.productos, nuevoTotal);
              // Fetch full merged order for complete display
              const pedidoMergedAllEvol = await storage.getPedidoById(pedidoPendienteConf.id);
              let prodsMergedAllEvol: any[] = [];
              try { prodsMergedAllEvol = typeof pedidoMergedAllEvol?.productos === "string" ? JSON.parse(pedidoMergedAllEvol.productos) : []; } catch {}
              const totalConDeliveryMergeAllEvol = nuevoSubtotalEvol + costoDelivery;
              respuestaTexto = `✅ Tu Pedido #${pedidoPendienteConf.id} fue actualizado.\n\n📝 *Pedido completo:*\n${prodTexto(prodsMergedAllEvol)}\n\n💰 Nuevo total estimado: ${monedaSimbolo}${totalConDeliveryMergeAllEvol}\n\n⏳ *${colmado.nombre}* revisará el pedido completo.`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
              // Dashboard conversation notification with full order details
              await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
              conversacionGuardadaEvol = true;
              // Re-notify business via WhatsApp
              if (colmado.whatsappNumero) {
                const msgNegocio = `🔔 *Pedido #${pedidoPendienteConf.id} actualizado* (se añadieron productos)\n👤 ${clienteNombreFinal}\n📝 Productos completos:\n${prodsMergedAllEvol.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
              }
              console.log(`Pedido #${pedidoPendienteConf.id} merged (merge_all) - Evolution WhatsApp`);

            } else if (eval_.accion === "merge_bebidas_only") {
              const bebidas = eval_.bebidasParaMerge || [];
              const noBebidas = eval_.noBebidasExcluidas || [];
              const valorBebidas = bebidas.reduce((s: number, p: any) => s + (p.monto || 0), 0);
              const nuevoTotal = (eval_.valorOriginal + valorBebidas).toString();
              await storage.mergePedidoProductos(pedidoPendienteConf.id, bebidas, nuevoTotal);
              // Fetch full merged order for complete display
              const pedidoMergedBebidasEvol = await storage.getPedidoById(pedidoPendienteConf.id);
              let prodsMergedBebidasEvol: any[] = [];
              try { prodsMergedBebidasEvol = typeof pedidoMergedBebidasEvol?.productos === "string" ? JSON.parse(pedidoMergedBebidasEvol.productos) : []; } catch {}
              // Show total including delivery in client-facing message; DB stores subtotal only
              const totalConDeliveryBebidasEvol = eval_.valorOriginal + valorBebidas + costoDelivery;
              respuestaTexto = `⏰ Ya pasaron los 5 minutos, solo podemos añadir bebidas.\n\n✅ Se añadió al Pedido #${pedidoPendienteConf.id}:\n${prodTexto(bebidas)}\n💰 Nuevo total estimado: ${monedaSimbolo}${totalConDeliveryBebidasEvol}`;
              if (noBebidas.length > 0) {
                respuestaTexto += `\n\n⚠️ No se pudieron añadir (no son bebidas):\n${prodTexto(noBebidas)}`;
              }
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
              // Dashboard conversation notification with full order details
              const msgDashBebidasEvol = `⏰ Bebidas añadidas al Pedido #${pedidoPendienteConf.id}\n📝 Pedido completo:\n${prodsMergedBebidasEvol.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
              await storage.addMensaje(conversacion.id, "assistant", msgDashBebidasEvol);
              conversacionGuardadaEvol = true;
              // Re-notify business via WhatsApp
              if (colmado.whatsappNumero) {
                const msgNegocio = `🔔 *Pedido #${pedidoPendienteConf.id} actualizado* (bebidas añadidas)\n👤 ${clienteNombreFinal}\n📝 Productos completos:\n${prodsMergedBebidasEvol.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimbolo}${nuevoTotal}`;
                await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
              }
              console.log(`Pedido #${pedidoPendienteConf.id} merged (bebidas_only) - Evolution WhatsApp`);

            } else if (eval_.accion === "crear_nuevo") {
              // 5 minutes passed and products aren't beverages — create a new separate order directly
              const pedidoNuevoEvol = await storage.createPedido({
                colmadoId: colmado.id,
                clienteNombre: clienteNombreFinal,
                clienteWhatsapp: from,
                clienteUbicacion: direccionFinal,
                productos: JSON.stringify(datos.productos),
                total: "0",
                montoPago: "0",
                necesitaDevuelta: false,
                estado: "pendiente_confirmacion",
              });
              respuestaTexto = `📋 *Pedido #${pedidoNuevoEvol.id} recibido*\n\n📝 *Productos:*\n${prodTexto(datos.productos)}\n\n⏳ *${colmado.nombre}* revisará tu pedido y te confirmará.`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
              await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
              conversacionGuardadaEvol = true;
              if (colmado.whatsappNumero) {
                const msgNegocio = `🛒 *Nuevo pedido #${pedidoNuevoEvol.id}*\n👤 ${clienteNombreFinal}\n📝 Productos:\n${datos.productos.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimbolo}${p.monto})` : ""}`).join("\n")}`;
                await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
              }
              console.log(`Pedido #${pedidoNuevoEvol.id} creado (crear_nuevo after 5min) - Evolution WhatsApp`);

            } else {
              // crear_nuevo_por_valor
              const pedido = await storage.createPedido({
                colmadoId: colmado.id,
                clienteNombre: clienteNombreFinal,
                clienteWhatsapp: from,
                clienteUbicacion: direccionFinal,
                productos: JSON.stringify(datos.productos),
                total: "0",
                montoPago: "0",
                necesitaDevuelta: false,
                estado: "pendiente_confirmacion",
              });
              respuestaTexto = `📋 *Pedido #${pedido.id} Recibido*\n\n📝 *Productos:*\n${prodTexto(datos.productos)}\n\n⏳ *${colmado.nombre}* revisará tu nuevo pedido.`;
              await humanDelay();
              await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
              await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
              conversacionGuardadaEvol = true;
              console.log(`Pedido #${pedido.id} creado (crear_nuevo_por_valor) - Evolution WhatsApp`);
            }

          } else if (zipValidEvol) {
            // No existing pending order — create fresh
            const pedido = await storage.createPedido({
              colmadoId: colmado.id,
              clienteNombre: clienteNombreFinal,
              clienteWhatsapp: from,
              clienteUbicacion: direccionFinal,
              productos: JSON.stringify(datos.productos),
              total: "0",
              montoPago: "0",
              necesitaDevuelta: false,
              estado: "pendiente_confirmacion",
            });
            respuestaTexto = `📋 *Pedido #${pedido.id} Recibido*\n\n📝 *Productos solicitados:*\n${prodTexto(datos.productos)}\n\n👤 *Cliente:* ${clienteNombreFinal}\n📍 *Dirección:* ${direccionFinal}\n\n⏳ *${colmado.nombre}* está revisando tu pedido y te confirmará el total en un momento.\n\n¡Gracias por tu preferencia! 🙏`;
            await humanDelay();
            await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
            console.log(`Pedido #${pedido.id} creado con estado pendiente_confirmacion - Evolution WhatsApp`);
          }
          
        } else {
          if (!respuestaTexto) {
            respuestaTexto = "¡Hola! Envíanos tu pedido y te lo llevamos. 🛵";
          }
          await humanDelay();
          await sendWhatsAppMessageSmart(colmado, from, respuestaTexto);
        }
        
        // Save AI response to conversation history (skip if already saved inside a merge branch)
        if (!conversacionGuardadaEvol) {
          await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
        }
        
      } catch (aiError) {
        console.error("Error processing message with AI:", aiError);
      }
    }
  } catch (error) {
    console.error("Error in processIncomingWhatsAppMessage:", error);
  }
}

async function autoAssignAndNotifyDelivery(
  colmado: any,
  pedidoId: number,
  metodoPago: string,
  montoPago: number,
  devuelta: number,
  totalConDelivery: number,
  clienteWhatsapp: string,
  ..._legacyMetaCredentials: [string?, string?]
) {
  try {
    const pedidoActualizado = await storage.getPedidoById(pedidoId);
    if (!pedidoActualizado) return;

    // Determine country-specific word for "change/vuelto" and currency
    let palabraDevuelta = "devuelta";
    let simboloDelivery = "RD$";
    if (colmado?.paisId) {
      const paisData = await storage.getPais(colmado.paisId);
      if (paisData?.codigo === "AR") palabraDevuelta = "vuelto";
      if (paisData?.simboloMoneda) simboloDelivery = paisData.simboloMoneda;
    } else if ((colmado as any).simboloMoneda) {
      simboloDelivery = (colmado as any).simboloMoneda;
    }
    
    // Get active deliveries
    const deliveriesActivos = await storage.getDeliveriesByColmado(colmado.id);
    const deliveriesActivosConVentana: typeof deliveriesActivos = [];
    for (const d of deliveriesActivos) {
      if (d.estado === "activo" && await storage.isDeliveryWindowActive(d)) {
        deliveriesActivosConVentana.push(d);
      }
    }
    
    const deliveryActivo = deliveriesActivosConVentana.length === 1 ? deliveriesActivosConVentana[0] : null;
    
    if (deliveryActivo) {
      await storage.asignarPedidoADelivery(pedidoId, deliveryActivo.id);
      if (metodoPago === "efectivo" && devuelta > 0) {
        await storage.updateVueltoEntregado(pedidoId, devuelta);
      }
      
      // Format products for delivery message
      let productosTexto = "";
      try {
        const productos = typeof pedidoActualizado.productos === 'string' 
          ? JSON.parse(pedidoActualizado.productos) 
          : pedidoActualizado.productos;
        if (Array.isArray(productos)) {
          productosTexto = productos.map((p: any) => 
            `• ${p.nombre} ${p.monto ? `(${simboloDelivery}${p.monto})` : p.cantidad ? `x${p.cantidad}` : ""}`
          ).join("\n");
        }
      } catch (e) {
        productosTexto = String(pedidoActualizado.productos);
      }
      
      // Get GPS coordinates for Google Maps link and freshest address text
      let ubicacionLink = "";
      let convDirTextoAuto = "";
      try {
        const convUbicacion = await storage.getConversacionByClienteWhatsapp(colmado.id, clienteWhatsapp);
        if (convUbicacion && convUbicacion.latitud && convUbicacion.longitud) {
          ubicacionLink = `\n📌 https://maps.google.com/?q=${convUbicacion.latitud},${convUbicacion.longitud}`;
        } else {
          const clienteUbicacion = await storage.getClienteByWhatsapp(colmado.id, clienteWhatsapp);
          if (clienteUbicacion && clienteUbicacion.latitud && clienteUbicacion.longitud) {
            ubicacionLink = `\n📌 https://maps.google.com/?q=${clienteUbicacion.latitud},${clienteUbicacion.longitud}`;
          }
        }
        // Use conversation address if more complete than the stored order address
        if (convUbicacion?.direccionTexto && (convUbicacion.direccionTexto.length > (pedidoActualizado.clienteUbicacion || "").length)) {
          convDirTextoAuto = convUbicacion.direccionTexto;
        }
      } catch (e) {
        console.error("Error getting client location for delivery:", e);
      }
      const direccionParaAuto = convDirTextoAuto || pedidoActualizado.clienteUbicacion || "Por confirmar";
      
      // Get payment method label
      const metodoPagoLabel = metodoPago === "efectivo" ? "💵 Efectivo" : 
                              metodoPago === "transferencia" ? "🏦 Transferencia" : "💳 Tarjeta";
      
      let deliveryMsg = `🛵 *NUEVO PEDIDO #${pedidoId}*\n\n`;
      deliveryMsg += `👤 *Cliente:* ${pedidoActualizado.clienteNombre}\n`;
      deliveryMsg += `📦 *Productos:*\n${productosTexto}\n\n`;
      deliveryMsg += `💰 *Total: ${simboloDelivery}${totalConDelivery}*\n`;
      deliveryMsg += `\n*PAGO: ${metodoPagoLabel}*\n`;
      if (metodoPago === "efectivo") {
        deliveryMsg += `💵 *Cobrar: ${simboloDelivery}${montoPago}*\n`;
        if (devuelta > 0) {
          deliveryMsg += `🔄 *Dar ${palabraDevuelta}: ${simboloDelivery}${devuelta}*\n`;
        }
      } else if (metodoPago === "transferencia") {
        deliveryMsg += `✅ *Ya pagado por transferencia*\n`;
      } else if (metodoPago === "tarjeta") {
        deliveryMsg += `💳 *Cobrar ${simboloDelivery}${totalConDelivery} con terminal*\n`;
      }
      deliveryMsg += `\n📍 *Dirección:*\n${direccionParaAuto}${ubicacionLink}\n`;
      deliveryMsg += `\n━━━━━━━━━━━━━━━\n`;
      deliveryMsg += `*Responde con:*\n`;
      deliveryMsg += `✅ *entregado #${pedidoId}* — Pedido entregado\n`;
      deliveryMsg += `❌ *cancelado #${pedidoId}* — No se pudo entregar\n`;
      deliveryMsg += `🔄 *retorno #${pedidoId}* — Devolver al colmado`;
      
      await sendWhatsAppMessageSmart(colmado, deliveryActivo.whatsappNumero, deliveryMsg);
      console.log(`Order #${pedidoId} auto-assigned to delivery ${deliveryActivo.nombre}`);
    } else if (deliveriesActivosConVentana.length > 1) {
      console.log(`Pedido #${pedidoId} pago confirmado - hay ${deliveriesActivosConVentana.length} deliveries activos, admin debe asignar`);
    } else {
      console.log(`Pedido #${pedidoId} pago confirmado pero no hay delivery activo`);
    }
  } catch (error) {
    console.error("Error auto-assigning delivery:", error);
  }
}

async function transcribeWhatsAppAudio(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    // Step 1: Get media URL from WhatsApp
    // DELYWA: versión vigente de la Graph API (el original usaba v18.0, ya retirada).
    const mediaResponse = await graphFetch(
      `${mediaId}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!mediaResponse.ok) {
      console.error("Error getting media URL: HTTP", mediaResponse.status);
      return null;
    }

    const mediaData = (await mediaResponse.json()) as any;
    const mediaUrl = mediaData.url;

    if (!mediaUrl) {
      console.error("No media URL returned");
      return null;
    }

    // Step 2: Download the audio file
    const audioResponse = await fetchExterno(mediaUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    if (!audioResponse.ok) {
      console.error("Error downloading audio: HTTP", audioResponse.status);
      return null;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Step 3: Create a File-like object for OpenAI API using toFile helper
    const audioFile = await toFile(
      Buffer.from(audioBuffer),
      "audio.ogg",
      { type: "audio/ogg" }
    );

    // Step 4: Transcribe with OpenAI Whisper API with Dominican Spanish hints
    // Using direct OpenAI client (not Replit proxy) as Whisper API is not supported by the proxy
    const transcription = await openaiWhisper.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "es",
      prompt: "Colmado República Dominicana. Cibaeño: caine, cuaito, poique, veldá. Sureño: calne, puelco, velde, azuca, guineo, batata, ñame. Capitalino: klk, que lo que, dime a ver, ta to, tato, wawawa, tiguere, vaina, pariguayo, tripeo. Productos: pica pollo, chimi, yaroa, morir soñando, mofongo, mangú, locrio, sancocho, asopao, la bandera, picadera, fritura, empanada, quipe, pastelito, chenchen, chacá, tostones, plátano, yuca, habichuela, arroz, pollo, carne, queso, pan, leche, huevo, agua, refresco, jugo",
    });

    console.log(`Transcribed audio: "${transcription.text}"`);
    return transcription.text;
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return null;
  }
}

export function registrarWebhooks(app: AppLike): void {
  app.post("/api/webhook/evolution/:instanceName", async (req, res) => {
    try {
      const { instanceName } = req.params;
      const body = req.body;
      
      const colmado = await storage.getColmadoByEvolutionInstance(instanceName);
      if (!colmado) {
        console.log(`No colmado found for Evolution instance: ${instanceName}`);
        return res.sendStatus(404);
      }

      const enrichedEvol = await enrichColmadoWithMoneda(colmado);
      const palabraDevuelta = getPalabraDevuelta((enrichedEvol as any).codigoPais || "DO");

      const event = body.event;
      
      if (event === "messages.upsert") {
        const data = body.data;
        if (!data || data.key?.fromMe) {
          return res.sendStatus(200);
        }
        
        const from = data.key?.remoteJid?.replace("@s.whatsapp.net", "") || "";
        if (!from) return res.sendStatus(200);
        
        let messageText = "";
        let messageType = "text";
        let extras: any = {};
        
        if (data.message?.conversation) {
          messageText = data.message.conversation;
        } else if (data.message?.extendedTextMessage?.text) {
          messageText = data.message.extendedTextMessage.text;
        } else if (data.message?.locationMessage) {
          messageType = "location";
          extras.latitude = data.message.locationMessage.degreesLatitude;
          extras.longitude = data.message.locationMessage.degreesLongitude;
        } else if (data.message?.audioMessage) {
          messageText = "[Audio message - transcription not available via Evolution API]";
          messageType = "text";
        } else if (data.message?.imageMessage) {
          return res.sendStatus(200);
        } else {
          return res.sendStatus(200);
        }
        
        await processIncomingWhatsAppMessage(colmado, from, messageText, messageType, extras);
      }
      
      res.sendStatus(200);
    } catch (error) {
      console.error("Error processing Evolution API webhook:", error);
      res.sendStatus(200);
    }
  });

  app.post("/api/webhook/whatsapp", async (req, res) => {
    try {
      if (!verifyMetaWebhookSignature(req.rawBody, req.headers["x-hub-signature-256"])) {
        return res.sendStatus(403);
      }
      const body = req.body;

      if (body?.object === "whatsapp_business_account" && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          if (!entry || !Array.isArray(entry.changes)) continue;
          for (const change of entry.changes) {
            if (change?.field === "messages" && change.value && typeof change.value === "object"
              && Array.isArray(change.value.messages)) {
              const value = change.value;
              const phoneNumberId = value.metadata?.phone_number_id;
              const messages = value.messages || [];

              for (const message of messages) {
                try {
                  if (!message || typeof message !== "object" || typeof message.id !== "string" || !message.id.trim()) continue;
                  const from = message.from;
                  if (!phoneNumberId || !from) continue;
                  if (!await storage.claimMetaWebhookEvent(`whatsapp:${message.id}`)) continue;

                  // Find the colmado by their WhatsApp number
                  const colmado = await storage.getColmadoByPhoneNumberId(phoneNumberId);
                  
                  if (!colmado) {
                    console.log(`No colmado found for phoneNumberId: ${phoneNumberId}`);
                    continue;
                  }

                  const enrichedMeta = await enrichColmadoWithMoneda(colmado);
                  const palabraDevueltaMeta = getPalabraDevuelta((enrichedMeta as any).codigoPais || "DO");
                  const monedaSimboloMeta = (enrichedMeta as any).simboloMoneda || "RD$";

                  const accessToken = colmado.whatsappAccessToken || tokenGlobalMeta();
                  if (!accessToken) continue;

                  // FIRST: Check if this is a delivery driver (before creating customer conversation)
                  const deliveryDriver = await storage.getDeliveryByWhatsapp(from);
                  if (deliveryDriver && deliveryDriver.colmadoId === colmado.id) {
                    // This is a delivery driver for this colmado - handle WITHOUT AI
                    const text = message?.text?.body || "";
                    const textLower = text.toLowerCase().trim();
                    const esComandoActivo = textLower === "activo" || textLower === "estoy activo" || textLower === "disponible" || textLower === "listo";
                    const esComandoDescanso = textLower === "descanso" || textLower === "pausa" || textLower === "en descanso" || textLower === "break";
                    const esComandoInactivo = textLower === "inactivo" || textLower.includes("ya no") || textLower.includes("termine");
                    const esComandoEntregado = textLower.includes("entregado") || textLower.includes("entregue") || textLower.includes("recogido") || textLower.includes("recogi");
                    const esComandoCancelado = textLower.includes("cancelado") || textLower.includes("cancele");
                    const esComandoRetorno = textLower.includes("retorno") || textLower.includes("devuelto") || textLower.includes("devolver");
                    
                    // Load ALL messages from database
                    const msgRequiereActivacion = await storage.getMensajeSistema("delivery_requiere_activacion");
                    const msgActivado = await storage.getMensajeSistema("delivery_activado");
                    const msgInactivo = await storage.getMensajeSistema("delivery_inactivo");
                    const msgContactoColmado = await storage.getMensajeSistema("delivery_contacto_colmado");
                    const msgEntregadoOk = await storage.getMensajeSistema("delivery_entregado_ok");
                    const msgEntregadoIdInvalido = await storage.getMensajeSistema("delivery_entregado_id_invalido");
                    const msgCanceladoOk = await storage.getMensajeSistema("delivery_cancelado_ok");
                    const msgCanceladoIdInvalido = await storage.getMensajeSistema("delivery_cancelado_id_invalido");
                    
                    let respuestaDelivery = "";
                    
                    if (esComandoActivo) {
                      await storage.activarDelivery(deliveryDriver.id, "whatsapp");
                      const deliveryPromptConfig = await storage.getConfiguracion("delivery_prompt");
                      if (deliveryPromptConfig?.valor) {
                        const promptPersonalizado = deliveryPromptConfig.valor
                          .replace(/\{delivery_nombre\}/g, deliveryDriver.nombre)
                          .replace(/\{negocio_nombre\}/g, colmado.nombre || "el negocio");
                        respuestaDelivery = promptPersonalizado;
                      } else {
                        respuestaDelivery = msgActivado?.contenido || "✅ ¡Ya estás activo! Podrás recibir pedidos para entrega.";
                      }
                      console.log(`Delivery ${deliveryDriver.nombre} (${from}) activated`);
                    } else if (esComandoDescanso) {
                      await storage.updateDeliveryEstado(deliveryDriver.id, "en_descanso");
                      respuestaDelivery = `☕ ¡Entendido ${deliveryDriver.nombre}! Estás en descanso. No recibirás pedidos nuevos por ahora.\n\nCuando regreses escribe "activo". ¡Descansa!`;
                      console.log(`Delivery ${deliveryDriver.nombre} (${from}) set to en_descanso`);
                    } else if (esComandoInactivo) {
                      // Deactivate the delivery
                      await storage.updateDeliveryEstado(deliveryDriver.id, "inactivo");
                      respuestaDelivery = (msgInactivo?.contenido || "👋 ¡Entendido {delivery_nombre}! Ya no recibirás pedidos nuevos.\n\nCuando quieras volver, escribe \"activo\". ¡Descansa!")
                        .replace("{delivery_nombre}", deliveryDriver.nombre);
                      console.log(`Delivery ${deliveryDriver.nombre} (${from}) deactivated`);
                    } else if (esComandoEntregado) {
                      // Mark order as delivered
                      const idMatch = text.match(/(\d+)/);
                      if (idMatch) {
                        const pedidoId = parseInt(idMatch[1]);
                        const pedido = await storage.getPedidoById(pedidoId);
                        if (pedido && pedido.deliveryId === deliveryDriver.id) {
                          await storage.updatePedidoEstado(pedidoId, "entregado");
                          const hoy = new Date();
                          const ventaActual = await storage.getVentasDiarias(pedido.colmadoId, hoy);
                          const nuevoPedidosEntregados = (ventaActual?.pedidosEntregados || 0) + 1;
                          const nuevoTotal = parseFloat(ventaActual?.totalVentas || "0") + parseFloat(pedido.total);
                          await storage.updateVentas(pedido.colmadoId, hoy, {
                            pedidosEntregados: nuevoPedidosEntregados,
                            totalVentas: nuevoTotal.toString()
                          });
                          respuestaDelivery = (msgEntregadoOk?.contenido || "✅ Pedido #{pedido_id} marcado como entregado. ¡Buen trabajo!")
                            .replace("{pedido_id}", pedidoId.toString());
                          // Fan-out to web chat client
                          try {
                            const chatWebSesionEntregado = await storage.getChatWebSessionByPedidoId(pedidoId);
                            if (chatWebSesionEntregado) {
                              const msgClienteEntregado = `✅ ¡Pedido #${pedidoId} entregado!\n\n¡Gracias por tu compra! Esperamos que disfrutes tu pedido. 🛒\n\n¿Tienes alguna duda? Escríbenos.`;
                              await storage.addChatWebMensaje(chatWebSesionEntregado.sessionId, "assistant", msgClienteEntregado);
                            }
                          } catch (chatWebErr) {
                            console.error("Error notifying web chat on WA delivery entregado:", chatWebErr);
                          }
                        } else {
                          respuestaDelivery = msgEntregadoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"entregado #123\"";
                        }
                      } else {
                        respuestaDelivery = msgEntregadoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"entregado #123\"";
                      }
                    } else if (esComandoCancelado) {
                      // Mark order as cancelled
                      const idMatch = text.match(/(\d+)/);
                      if (idMatch) {
                        const pedidoId = parseInt(idMatch[1]);
                        const pedido = await storage.getPedidoById(pedidoId);
                        if (pedido && pedido.deliveryId === deliveryDriver.id) {
                          await storage.updatePedidoEstado(pedidoId, "cancelado");
                          const hoy = new Date();
                          const ventaActual = await storage.getVentasDiarias(pedido.colmadoId, hoy);
                          const nuevoCancelados = (ventaActual?.pedidosCancelados || 0) + 1;
                          await storage.updateVentas(pedido.colmadoId, hoy, {
                            pedidosCancelados: nuevoCancelados
                          });
                          respuestaDelivery = (msgCanceladoOk?.contenido || "❌ Pedido #{pedido_id} marcado como cancelado.")
                            .replace("{pedido_id}", pedidoId.toString());
                        } else {
                          respuestaDelivery = msgCanceladoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"cancelado #123\"";
                        }
                      } else {
                        respuestaDelivery = msgCanceladoIdInvalido?.contenido || "Por favor indica el número de pedido. Ej: \"cancelado #123\"";
                      }
                    } else if (esComandoRetorno) {
                      // Mark order as returned
                      const idMatch = text.match(/(\d+)/);
                      if (idMatch) {
                        const pedidoId = parseInt(idMatch[1]);
                        const pedido = await storage.getPedidoById(pedidoId);
                        if (pedido && pedido.deliveryId === deliveryDriver.id) {
                          await storage.updatePedidoEstado(pedidoId, "retorno");
                          respuestaDelivery = `🔄 Pedido #${pedidoId} marcado como retorno. El producto será devuelto al colmado.`;
                        } else {
                          respuestaDelivery = "Por favor indica el número de pedido. Ej: \"retorno #123\"";
                        }
                      } else {
                        respuestaDelivery = "Por favor indica el número de pedido. Ej: \"retorno #123\"";
                      }
                    } else if (deliveryDriver.estado === "activo") {
                      // Already active, redirect to colmado phone
                      const telefonoColmado = colmado.whatsappNumero || "el colmado";
                      respuestaDelivery = (msgContactoColmado?.contenido || "No puedes comunicarte con el colmado por esta vía. Llámalo directamente al {telefono_colmado} 📞")
                        .replace("{telefono_colmado}", telefonoColmado);
                    } else {
                      // Not active and didn't write a valid command - require activation
                      respuestaDelivery = msgRequiereActivacion?.contenido || "Para recibir pedidos, escribe 'activo' 📲";
                    }
                    
                    // Save delivery conversation for visibility in the app
                    const deliveryConversacion = await storage.getOrCreateDeliveryConversacion(colmado.id, from, deliveryDriver.nombre);
                    await storage.addMensaje(deliveryConversacion.id, "user", text);
                    
                    await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaDelivery, accessToken);
                    await storage.addMensaje(deliveryConversacion.id, "assistant", respuestaDelivery);
                    
                    console.log(`Delivery response sent to ${from}: ${respuestaDelivery.substring(0, 50)}...`);
                    continue; // Skip customer flow
                  }

                  // Not a delivery - proceed with customer flow
                  // Get or create conversation for this customer
                  const conversacion = await storage.getOrCreateConversacion(colmado.id, from);

                  // Check if colmado is open (business hours check)
                  const colmadoTz = await getColmadoTimezone(colmado);
                  const estadoAbierto = storage.isColmadoAbierto(colmado, colmadoTz);
                  if (!estadoAbierto.abierto) {
                    // Colmado is closed - send closed message and skip processing
                    const horaAperturaDisplay = (() => {
                      const [hours, minutes] = (colmado.horaApertura || "08:00").split(":").map(Number);
                      const period = hours >= 12 ? "PM" : "AM";
                      const hours12 = hours % 12 || 12;
                      return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
                    })();
                    
                    let mensajeCerrado = estadoAbierto.mensaje;
                    if (!mensajeCerrado.includes("Abrimos")) {
                      mensajeCerrado = `🚫 ${mensajeCerrado}\n\n⏰ Horario: ${horaAperturaDisplay}`;
                    } else {
                      mensajeCerrado = `🚫 ${mensajeCerrado}`;
                    }
                    
                    await storage.addMensaje(conversacion.id, "user", message?.text?.body || "[mensaje recibido]");
                    await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeCerrado, accessToken);
                    await storage.addMensaje(conversacion.id, "assistant", mensajeCerrado);
                    console.log(`Colmado ${colmado.nombre} is closed - sent closed message to ${from}`);
                    continue;
                  }

                  // Handle location messages
                  if (message?.type === "location") {
                    const lat = message.location.latitude;
                    const lon = message.location.longitude;
                    
                    // Save to conversation
                    await storage.updateConversacionDireccion(conversacion.id, {
                      latitud: lat.toString(),
                      longitud: lon.toString()
                    });
                    
                    // Also save to permanent clientes table
                    const cliente = await storage.getOrCreateCliente(colmado.id, from, {
                      nombre: conversacion.clienteNombre || undefined,
                      latitud: lat.toString(),
                      longitud: lon.toString()
                    });
                    
                    await storage.addMensaje(conversacion.id, "user", `[Ubicación compartida 📍]`);
                    
                    // Check conversation context to give appropriate response
                    const conv = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
                    const tieneNombre = conv?.clienteNombre && conv.clienteNombre !== "Cliente";
                    const tieneDireccion = conv?.direccionTexto;
                    
                    // Get database messages for responses
                    const msgUbicacion = await storage.getMensajeSistema("ubicacion_guardada");
                    const msgDireccion = await storage.getMensajeSistema("pregunta_direccion");
                    const msgNombre = await storage.getMensajeSistema("pregunta_nombre");
                    const msgResumen = await storage.getMensajeSistema("resumen_pedido");
                    const msgPago = await storage.getMensajeSistema("pregunta_pago");
                    
                    let respuesta = "";
                    if (!tieneDireccion) {
                      const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
                      const direccionMsg = msgDireccion?.contenido || "¿Cuál es tu dirección de entrega?";
                      respuesta = `${ubicacionMsg} ${direccionMsg}`;
                      await sendWhatsAppMessageWithToken(phoneNumberId, from, respuesta, accessToken);
                      await storage.addMensaje(conversacion.id, "assistant", respuesta);
                    } else if (!tieneNombre) {
                      const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
                      const nombreMsg = msgNombre?.contenido || "¿A nombre de quién va el pedido?";
                      respuesta = `${ubicacionMsg} ${nombreMsg}`;
                      await sendWhatsAppMessageWithToken(phoneNumberId, from, respuesta, accessToken);
                      await storage.addMensaje(conversacion.id, "assistant", respuesta);
                    } else {
                      // Has name and address - get order summary from conversation history
                      const historialMensajes = await storage.getMensajesByConversacion(conversacion.id, 15);
                      const costoDelivery = parseFloat(colmado.costoDelivery ?? "0");
                      
                      // Use AI to extract order summary from conversation history
                      const mensajesParaResumen: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
                        {
                          role: "system",
                          content: `Analiza el historial de la conversación y extrae los productos que el cliente pidió.
                          El cliente se llama "${conv.clienteNombre}" y su dirección es "${conv.direccionTexto}".
                          
                          IMPORTANTE: 
                          - NO inventes precios. Solo incluye "monto" si el cliente lo mencionó explícitamente.
                          - "Dame 20 de salsa" = monto: 20 (son 20 de la moneda local de salsa)
                          - "Dame 2 cervezas" = cantidad: 2, monto: null (no sabemos el precio)
                          
                          Responde en JSON:
                          {
                            "productos": [{ "nombre": string, "cantidad": number | null, "monto": number | null }]
                          }`
                        }
                      ];
                      
                      const historialOrdenado = [...historialMensajes].reverse();
                      for (const msg of historialOrdenado) {
                        mensajesParaResumen.push({
                          role: msg.rol === "user" ? "user" : "assistant",
                          content: msg.contenido
                        });
                      }
                      
                      try {
                        const resumenCompletion = await openai.chat.completions.create({
                          model: "gpt-4o",
                          messages: mensajesParaResumen,
                          response_format: { type: "json_object" },
                          max_tokens: 500,
                        });
                        
                        const resumenDatos = JSON.parse(resumenCompletion.choices[0]?.message?.content || "{}");
                        
                        let productosTexto = "";
                        if (Array.isArray(resumenDatos.productos)) {
                          productosTexto = resumenDatos.productos.map((p: any) => {
                            if (p.monto) {
                              return `• ${p.nombre} (${monedaSimboloMeta}${p.monto})`;
                            } else if (p.cantidad) {
                              return `• ${p.cantidad}x ${p.nombre}`;
                            } else {
                              return `• ${p.nombre}`;
                            }
                          }).join("\n");
                        }
                        
                        // Use database templates with placeholder replacement
                        const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
                        
                        // Simplified message without prices - colmado will confirm total
                        respuesta = `${ubicacionMsg}\n\n📝 *Tu pedido:*\n${productosTexto || "Tus productos"}\n🛵 Delivery: ${monedaSimboloMeta}${costoDelivery}\n\n⏳ El colmado revisará tu pedido y te confirmará el total.`;
                        
                      } catch (e) {
                        console.error("Error getting order summary:", e);
                        const ubicacionMsg = msgUbicacion?.contenido || "📍 ¡Ubicación guardada!";
                        respuesta = `${ubicacionMsg} ¿Me confirmas tu pedido para enviártelo?`;
                      }
                      
                      await sendWhatsAppMessageWithToken(phoneNumberId, from, respuesta, accessToken);
                      await storage.addMensaje(conversacion.id, "assistant", respuesta);
                    }
                    continue;
                  }

                  // Handle audio/voice messages
                  if (message?.type === "audio" && message?.audio?.id) {
                    console.log(`Received voice note from ${from}, transcribing...`);
                    
                    const transcribedText = await transcribeWhatsAppAudio(message.audio.id, accessToken);
                    
                    if (!transcribedText) {
                      await sendWhatsAppMessageWithToken(phoneNumberId, from, 
                        "🎤 No pude escuchar tu nota de voz. ¿Podrías escribirme tu pedido?", accessToken);
                      continue;
                    }
                    
                    // Process the transcribed text as if it was a text message
                    // We'll set up variables and fall through to the text processing logic
                    message.type = "text";
                    message.text = { body: transcribedText };
                    console.log(`Voice note transcribed to: "${transcribedText}"`);
                  }

                  // Handle text messages
                  if (message?.type === "text" && message?.text?.body) {
                    const text = message.text.body.trim();
                    const textLower = text.toLowerCase();
                    
                    // Check 24h window - if last message was more than 23h 50min ago, don't auto-respond
                    // This forces a window reset when customer sends their next message
                    const WINDOW_LIMIT_MS = 23 * 60 * 60 * 1000 + 50 * 60 * 1000; // 23h 50min in milliseconds
                    const now = new Date();
                    const lastMessageTime = conversacion.ultimoMensaje ? new Date(conversacion.ultimoMensaje) : null;
                    
                    if (lastMessageTime) {
                      const timeSinceLastMessage = now.getTime() - lastMessageTime.getTime();
                      
                      if (timeSinceLastMessage > WINDOW_LIMIT_MS) {
                        // Near 24h window expiry - save message but don't respond
                        // Wait for customer to send another message to reset the window
                        // addMensaje already updates ultimoMensaje timestamp, resetting the window
                        await storage.addMensaje(conversacion.id, "user", text);
                        
                        console.log(`24h window near expiry for ${from} - saved message but not responding. Last message was ${Math.round(timeSinceLastMessage / 60000)} minutes ago.`);
                        continue;
                      }
                    }

                    // ============ AGE VERIFICATION FOR RESTRICTED PRODUCTS ============
                    
                    const deteccionRestringido = await storage.detectarProductoRestringido(text);
                    const tipoRestringido = deteccionRestringido.categoria === "alcohol" ? "bebidas alcohólicas" : deteccionRestringido.categoria === "tabaco" ? "cigarrillos" : deteccionRestringido.categoria;
                    
                    if (deteccionRestringido.restringido) {
                      const cliente = await storage.getClienteByWhatsapp(colmado.id, from);
                      
                      if (cliente?.edadVerificada) {
                        console.log(`[POLICY] Age already verified for ${from} - proceeding with ${deteccionRestringido.categoria} order`);
                      } else {
                        const historialReciente = await storage.getMensajesByConversacion(conversacion.id, 10);
                        const mensajesOrdenados = [...historialReciente].reverse();
                        
                        let indicePreguntaEdad = -1;
                        let edadRechazada = false;
                        
                        for (let i = 0; i < mensajesOrdenados.length; i++) {
                          const m = mensajesOrdenados[i];
                          if (m.rol === "assistant" && m.contenido.includes("mayor de 18 años")) {
                            indicePreguntaEdad = i;
                          }
                          if (indicePreguntaEdad !== -1 && i > indicePreguntaEdad && m.rol === "user") {
                            const respuesta = m.contenido.toLowerCase().trim();
                            if (respuesta === "no") {
                              edadRechazada = true;
                              break;
                            }
                          }
                        }
                        
                        const yaPreguntamosEdad = indicePreguntaEdad !== -1 && !edadRechazada;
                        
                        if (edadRechazada) {
                          await storage.addMensaje(conversacion.id, "user", text);
                          const respuestaNoEdad = `⚠️ Lo sentimos, no podemos procesar pedidos de ${tipoRestringido} sin verificación de edad.\n\n¿Te puedo ayudar con algún otro producto?`;
                          await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaNoEdad, accessToken);
                          await storage.addMensaje(conversacion.id, "assistant", respuestaNoEdad);
                          console.log(`[POLICY] ${deteccionRestringido.categoria} blocked - user previously rejected age verification from ${from}`);
                          continue;
                        }
                        
                        if (!yaPreguntamosEdad) {
                          await storage.addMensaje(conversacion.id, "user", text);
                          const respuestaEdad = `🔞 Para continuar con pedidos de ${tipoRestringido}, necesitamos confirmar tu edad.\n\n¿Confirmas que eres mayor de 18 años?\n\nResponde *SÍ* para continuar o *NO* si prefieres otros productos.`;
                          await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaEdad, accessToken);
                          await storage.addMensaje(conversacion.id, "assistant", respuestaEdad);
                          console.log(`[POLICY] Age verification requested for ${deteccionRestringido.categoria} from ${from}`);
                          continue;
                        }
                        
                        if (yaPreguntamosEdad) {
                          const respuestaActual = textLower.trim();
                          if (respuestaActual === "sí" || respuestaActual === "si" || respuestaActual === "confirmo" ||
                              respuestaActual.includes("soy mayor") || respuestaActual.includes("tengo más de 18") ||
                              respuestaActual.includes("tengo mas de 18")) {
                            await storage.addMensaje(conversacion.id, "user", text);
                            const clienteParaVerificar = await storage.getOrCreateCliente(colmado.id, from);
                            await storage.verificarEdadCliente(clienteParaVerificar.id);
                            console.log(`[POLICY] Age verified and persisted for ${from}`);
                            const confirmacionEdad = `✅ ¡Gracias! Tu edad ha sido verificada. No te volveremos a preguntar.\n\n¿Qué te gustaría ordenar?`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, confirmacionEdad, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", confirmacionEdad);
                            continue;
                          } else if (respuestaActual === "no") {
                            await storage.addMensaje(conversacion.id, "user", text);
                            const respuestaNoEdad = `⚠️ Lo sentimos, no podemos procesar pedidos de ${tipoRestringido} sin verificación de edad.\n\n¿Te puedo ayudar con algún otro producto?`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaNoEdad, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", respuestaNoEdad);
                            console.log(`[POLICY] ${deteccionRestringido.categoria} blocked - user rejected age verification from ${from}`);
                            continue;
                          } else {
                            await storage.addMensaje(conversacion.id, "user", text);
                            const respuestaEdad = `🔞 Antes de continuar, necesito que confirmes tu edad.\n\n¿Eres mayor de 18 años? Responde *SÍ* o *NO*.`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaEdad, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", respuestaEdad);
                            console.log(`[POLICY] Re-requesting age verification from ${from}`);
                            continue;
                          }
                        }
                      }
                    }

                    // Check if customer is sending address
                    const addressKeywords = ["mi dirección", "mi direccion", "esta es mi", "envíenlo a", "envienlo a", "llévalo a", "llevalo a", "estoy en", "vivo en"];
                    const isAddressMessage = addressKeywords.some(kw => textLower.includes(kw));
                    
                    if (isAddressMessage) {
                      await storage.updateConversacionDireccion(conversacion.id, { texto: text });
                      await storage.addMensaje(conversacion.id, "user", text);
                      
                      const respuesta = `📍 ¡Dirección guardada! Ahora envíanos tu pedido y te lo llevamos.`;
                      await sendWhatsAppMessageWithToken(phoneNumberId, from, respuesta, accessToken);
                      await storage.addMensaje(conversacion.id, "assistant", respuesta);
                      continue;
                    }
                    
                    // ========== DETECCIÓN DE INTENCIÓN DEL BOT ==========
                    const intencionWA = await storage.detectarIntencion(text);
                    
                    // Get menu for use in responses
                    const tiposSinMenuWA = ["colmado", "colmadon"];
                    const tieneMenuActivo = !tiposSinMenuWA.includes(colmado.tipoNegocio);
                    let menuDisplayWA = "";
                    
                    if (tieneMenuActivo) {
                      const menuProductosWA = await storage.getMenuProductos(colmado.id);
                      if (menuProductosWA.length > 0) {
                        menuDisplayWA = buildMenuDisplayWA(
                          menuProductosWA,
                          monedaSimboloMeta,
                          colmado.slug,
                          colmado.id
                        );
                      }
                    }
                    
                    // Handle intentions: hacer_pedido, ver_menu, precios, ubicacion, horario
                    if (intencionWA && intencionWA.codigo !== "fallback") {
                      await storage.addMensaje(conversacion.id, "user", text);
                      
                      const horarioDisplayWA = colmado.horaApertura && colmado.horaCierre 
                        ? `${colmado.horaApertura} - ${colmado.horaCierre}` 
                        : "Consultar con el negocio";
                      const direccionDisplayWA = colmado.direccion || "Consultar con el negocio";
                      
                      let respuestaWA = intencionWA.respuesta
                        .replace(/\{NEGOCIO\}/g, colmado.nombre)
                        .replace(/\{MENU\}/g, menuDisplayWA.trim() || "Envíame tu lista de productos")
                        .replace(/\{HORARIO\}/g, horarioDisplayWA)
                        .replace(/\{DIRECCION\}/g, direccionDisplayWA);
                      
                      // Split long messages for WhatsApp
                      if (respuestaWA.length > 1500) {
                        const partes = respuestaWA.match(/.{1,1400}(?:\n|$)/g) || [respuestaWA];
                        for (const parte of partes) {
                          await sendWhatsAppMessageWithToken(phoneNumberId, from, parte.trim(), accessToken);
                        }
                      } else {
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaWA, accessToken);
                      }
                      await storage.addMensaje(conversacion.id, "assistant", respuestaWA);
                      continue;
                    }
                    
                    // Save the incoming message (for fallback or unrecognized messages - handled by AI)
                    await storage.addMensaje(conversacion.id, "user", text);
                    
                    // Get updated conversation with address
                    const conversacionActualizada = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
                    
                    // CHECK FOR PENDING ORDERS IN DIFFERENT STATES
                    const pedidosCliente = await storage.getPedidosByClienteWhatsapp(colmado.id, from);
                    const pedidoEsperandoPago = pedidosCliente.find(p => p.estado === "esperando_pago");
                    const pedidoEsperandoSustituciones = pedidosCliente.find(p => p.estado === "esperando_confirmacion_sustituciones");
                    // Orders sent to the business but not yet confirmed
                    const pedidoPendienteConf = pedidosCliente.find(p => p.estado === "pendiente_confirmacion");
                    
                    // HANDLE SUBSTITUTION CONFIRMATION FLOW
                    if (pedidoEsperandoSustituciones) {
                      const sustituciones = pedidoEsperandoSustituciones.sustituciones as Array<{ original: string; nuevo: string; monto?: number; estado: "pendiente" | "aceptada" | "rechazada" }> || [];
                      const sustitucionPendiente = sustituciones.find(s => s.estado === "pendiente");
                      
                      if (sustitucionPendiente) {
                        // Check if customer accepted or rejected
                        const respuestaPositiva = ["si", "sí", "yes", "ok", "okay", "dale", "va", "claro", "acepto", "bueno", "bien", "👍", "esta bien", "está bien"].some(word => textLower.includes(word));
                        const respuestaNegativa = ["no", "nope", "nel", "nah", "no quiero", "mejor no", "👎", "quitalo", "quítalo", "remueve", "sin ese"].some(word => textLower.includes(word));
                        
                        if (respuestaPositiva || respuestaNegativa) {
                          // Update the substitution state
                          const nuevasSustituciones = sustituciones.map(s => {
                            if (s.original === sustitucionPendiente.original) {
                              return { ...s, estado: respuestaPositiva ? "aceptada" as const : "rechazada" as const };
                            }
                            return s;
                          });
                          
                          // If rejected, also update the product list and total
                          let nuevoTotal = parseFloat(pedidoEsperandoSustituciones.totalConfirmado || pedidoEsperandoSustituciones.total);
                          let productosActualizados = pedidoEsperandoSustituciones.productos;
                          
                          if (respuestaNegativa && sustitucionPendiente.monto) {
                            nuevoTotal -= sustitucionPendiente.monto;
                            // Remove the product from the list
                            try {
                              const productos = typeof productosActualizados === 'string' 
                                ? JSON.parse(productosActualizados) 
                                : productosActualizados;
                              if (Array.isArray(productos)) {
                                const productosFiltrados = productos.filter((p: any) => 
                                  (p.nombre || p.name || "").toLowerCase() !== sustitucionPendiente.original.toLowerCase()
                                );
                                productosActualizados = JSON.stringify(productosFiltrados);
                              }
                            } catch (e) { }
                          }
                          
                          // Update products, total and substitutions
                          if (respuestaNegativa) {
                            // Rejected: update products list, total and substitutions
                            await storage.updatePedidoProductosYTotal(
                              pedidoEsperandoSustituciones.id, 
                              productosActualizados, 
                              nuevoTotal.toString(), 
                              nuevasSustituciones
                            );
                          } else {
                            // Accepted: only update substitutions
                            await storage.updateSustituciones(pedidoEsperandoSustituciones.id, nuevasSustituciones);
                          }
                          
                          // Check if there are more pending substitutions
                          const siguienteSustitucion = nuevasSustituciones.find(s => s.estado === "pendiente");
                          
                          if (siguienteSustitucion) {
                            // Ask about the next substitution
                            let mensaje = "";
                            if (respuestaPositiva) {
                              mensaje = `✅ Perfecto, aceptaste el cambio.\n\n`;
                            } else {
                              mensaje = `👍 Entendido, removimos *${sustitucionPendiente.original}* de tu pedido.\n\n`;
                            }
                            mensaje += `📋 *Siguiente cambio:*\n`;
                            mensaje += `No tenemos *${siguienteSustitucion.original}* disponible.\n\n`;
                            mensaje += `🔄 Te ofrecemos: *${siguienteSustitucion.nuevo}*\n\n`;
                            mensaje += `¿Aceptas este cambio?\n`;
                            mensaje += `👍 Responde *SÍ* para aceptar\n`;
                            mensaje += `👎 Responde *NO* para remover este producto del pedido`;
                            
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, mensaje, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", mensaje);
                          } else {
                            // All substitutions resolved — branch by known payment method
                            const pedidoActualizado = await storage.getPedidoById(pedidoEsperandoSustituciones.id);
                            // totalConfirmado/total already includes delivery (set by confirmarPedidoConSustituciones)
                            const totalConDelivery = parseFloat(pedidoActualizado?.totalConfirmado || pedidoActualizado?.total || "0");
                            const costoDeliveryVal = parseFloat(colmado.costoDelivery ?? "0");
                            const subtotalProductos = Math.max(0, totalConDelivery - costoDeliveryVal);
                            const metodoPagoActual = pedidoActualizado?.metodoPago || pedidoEsperandoSustituciones.metodoPago || null;

                            let mensajeBase = respuestaPositiva
                              ? `✅ Perfecto, aceptaste el cambio.\n\n`
                              : `👍 Entendido, removimos *${sustitucionPendiente.original}* de tu pedido.\n\n`;
                            mensajeBase += `✅ *¡Pedido #${pedidoEsperandoSustituciones.id} Listo!*\n\n`;
                            mensajeBase += `💰 Subtotal: ${monedaSimboloMeta}${subtotalProductos}\n`;
                            mensajeBase += `🛵 Delivery: ${monedaSimboloMeta}${costoDeliveryVal}\n`;
                            mensajeBase += `━━━━━━━━━━━━━━━\n`;
                            mensajeBase += `*💵 Total a pagar: ${monedaSimboloMeta}${totalConDelivery}*`;

                            let mensajeFinal = "";
                            if (metodoPagoActual === "efectivo") {
                              // Cash already selected — skip payment selection, go to pendiente
                              await storage.updatePedidoEstado(pedidoEsperandoSustituciones.id, "pendiente");
                              mensajeFinal = mensajeBase + `\n\n💵 Pagarás en efectivo. ¿Con cuánto dinero vas a pagar para darte tu ${palabraDevueltaMeta}?`;
                            } else if (metodoPagoActual === "transferencia") {
                              // Transfer selected — create order immediately so business can start preparing
                              await storage.updatePedidoEstado(pedidoEsperandoSustituciones.id, "pendiente_confirmacion");
                              const metodosPagoConfigSust2 = await storage.getMetodosPago(colmado.id);
                              let infoBancosT = "";
                              if (metodosPagoConfigSust2?.bancos?.length) {
                                for (const banco of metodosPagoConfigSust2.bancos) {
                                  infoBancosT += `\n• *${banco.nombre}:* ${banco.numeroCuenta} (${banco.tipoCuenta})`;
                                }
                              }
                              mensajeFinal = mensajeBase +
                                `\n\n🏦 *Transferencia bancaria:*${infoBancosT || " El negocio te contactará con los datos."}` +
                                `\n\n📄 *Por favor envía una foto del comprobante*, para poder procesar tu orden.`;
                            } else {
                              // Payment method unknown — ask client to select
                              await storage.updatePedidoEstado(pedidoEsperandoSustituciones.id, "esperando_pago");
                              const metodosPagoConfigSust = await storage.getMetodosPago(colmado.id);
                              const metodosHabilitadosSust: string[] = [];
                              if (metodosPagoConfigSust?.efectivo !== false) metodosHabilitadosSust.push("💵 Efectivo");
                              if (metodosPagoConfigSust?.transferencia) metodosHabilitadosSust.push("🏦 Transferencia");
                              if (metodosPagoConfigSust?.tarjeta) metodosHabilitadosSust.push("💳 Tarjeta");
                              let infoBancosSust = "";
                              if (metodosPagoConfigSust?.transferencia && metodosPagoConfigSust.bancos?.length) {
                                const nombresBancosSust = metodosPagoConfigSust.bancos.map((b: any) => b.nombre).join(", ");
                                infoBancosSust = `\n\n🏦 *Transferencia disponible en:* ${nombresBancosSust}\n📞 El negocio te contactará para darte los datos de pago.`;
                              }
                              mensajeFinal = mensajeBase + infoBancosSust + `\n\n¿Cómo deseas pagar?\n${metodosHabilitadosSust.join("\n")}`;
                            }

                            await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeFinal, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", mensajeFinal);
                          }
                          
                          continue; // Skip AI processing
                        }
                      }
                    }
                    
                    // HANDLE PAYMENT METHOD DETECTION FOR ORDERS WAITING FOR PAYMENT
                    // This must happen BEFORE AI processing to avoid treating payment methods as products
                    if (pedidoEsperandoPago) {
                      const costoDeliveryPago = parseFloat(colmado.costoDelivery ?? "0");
                      const totalConDeliveryPago = parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total);
                      const subtotalProductosPago = Math.max(0, totalConDeliveryPago - costoDeliveryPago);
                      const tiempoEstimadoPago = colmado.tiempoEstimado || "20-30 min";
                      
                      // Load payment methods
                      const metodosPagoConfigDirect = await storage.getMetodosPago(colmado.id);
                      
                      // Detect payment method keywords directly
                      const esEfectivo = ["efectivo", "cash", "en efectivo", "pago efectivo", "con efectivo"].some(k => textLower.includes(k));
                      const esTransferencia = ["transferencia", "por transferencia", "transfiero", "te transfiero"].some(k => textLower.includes(k));
                      const esTarjeta = ["tarjeta", "con tarjeta", "pos", "credito", "débito", "debito"].some(k => textLower.includes(k));
                      const esPagoExacto = ["pago exacto", "exacto", "justo"].some(k => textLower.includes(k));
                      
                      // Detect payment amount - ONLY when there's clear payment intent
                      // Must have explicit payment context to avoid matching order numbers, quantities, etc.
                      const palabrasContextoPago = ["con", "pago", "pagar", "pagaré", "pagare", "te pago", "voy a pagar"];
                      const tieneContextoPago = palabrasContextoPago.some(p => textLower.includes(p)) || esEfectivo;
                      
                      // Only detect amount if there's payment context AND it's a reasonable payment amount (>=100 pesos)
                      const montoMatch = textLower.match(/(?:con\s+|pago\s+|pagar\s+|pagaré\s+|te pago\s+)?(\d{3,}(?:\.\d+)?)\s*(?:pesos)?/);
                      const esMil = (textLower === "mil" || textLower.match(/^(?:con\s+)?mil$/)) && !textLower.includes("millar");
                      let montoPagoDetectado: number | null = null;
                      
                      // Only set monto if there's clear payment context
                      if (tieneContextoPago && montoMatch) {
                        const monto = parseFloat(montoMatch[1]);
                        // Only accept amounts >= 100 (to avoid matching "combo 2", "pedido 123", etc.)
                        if (monto >= 100) {
                          montoPagoDetectado = monto;
                        }
                      } else if (esMil) {
                        montoPagoDetectado = 1000;
                      }
                      
                      // Check if customer is asking about order status
                      const preguntaPedido = ["estatus", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "ya salio", "ya salió", "mi delivery", "mi pedido", "seguimiento", "tracking"].some(k => textLower.includes(k));
                      
                      if (preguntaPedido) {
                        const mensajeInfo = buildOrderStatusMessage(pedidoEsperandoPago, colmado, undefined, monedaSimboloMeta, metodosPagoConfigDirect);
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeInfo, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", mensajeInfo);
                        continue; // Skip AI processing
                      }
                      
                      // Handle cash payment with amount
                      if ((esEfectivo && montoPagoDetectado) || esPagoExacto) {
                        const montoFinal = esPagoExacto ? totalConDeliveryPago : montoPagoDetectado!;
                        const devuelta = Math.max(0, montoFinal - totalConDeliveryPago);
                        
                        // Update order with payment info
                        await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente");
                        await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, "efectivo");
                        await storage.updatePedidoPago(pedidoEsperandoPago.id, {
                          montoPago: montoFinal.toString(),
                          necesitaDevuelta: devuelta > 0,
                          total: totalConDeliveryPago.toString()
                        });
                        if (devuelta > 0) await storage.updateVueltoEntregado(pedidoEsperandoPago.id, devuelta);
                        
                        // Concise confirmation message
                        let mensajeConfirmacion = `✅ *Pedido #${pedidoEsperandoPago.id} confirmado*\n`;
                        mensajeConfirmacion += `💵 Efectivo: ${monedaSimboloMeta}${montoFinal}`;
                        if (devuelta > 0) {
                          mensajeConfirmacion += ` | Devuelta: ${monedaSimboloMeta}${devuelta}`;
                        }
                        mensajeConfirmacion += `\n⏱️ ${tiempoEstimadoPago}`;
                        
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeConfirmacion, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", mensajeConfirmacion);
                        
                        // Auto-assign delivery if only one active
                        await autoAssignAndNotifyDelivery(colmado, pedidoEsperandoPago.id, "efectivo", montoFinal, devuelta, totalConDeliveryPago, from, phoneNumberId, accessToken);
                        
                        continue; // Skip AI processing
                      }
                      
                      // Handle cash payment without amount - ask for amount
                      if (esEfectivo && !montoPagoDetectado) {
                        const mensajeMonto = `💵 *Perfecto, pagarás en efectivo.*\n\n¿Con cuánto vas a pagar para darte tu ${palabraDevueltaMeta}?\n\n🛒 Productos: ${monedaSimboloMeta}${subtotalProductosPago}\n🛵 Delivery: ${monedaSimboloMeta}${costoDeliveryPago}\n💰 Total a pagar: ${monedaSimboloMeta}${totalConDeliveryPago}`;
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeMonto, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", mensajeMonto);
                        continue; // Skip AI processing
                      }
                      
                      // NOTE: We no longer assume cash just from a number. 
                      // The customer must first say "efectivo" to select cash payment,
                      // then we ask for amount. This prevents misclassifying random numbers.
                      
                      // Handle transfer payment - create order immediately so business can start preparing
                      if (esTransferencia) {
                        // Update order to pendiente_confirmacion so business sees it right away
                        await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente_confirmacion");
                        await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, "transferencia");
                        await storage.updatePedidoPago(pedidoEsperandoPago.id, {
                          montoPago: totalConDeliveryPago.toString(),
                          necesitaDevuelta: false,
                          total: totalConDeliveryPago.toString()
                        });
                        
                        // Get bank info - concise message
                        let infoBancosTransf = "";
                        if (metodosPagoConfigDirect?.bancos?.length) {
                          infoBancosTransf = "\n\n🏦 *Datos para transferencia:*\n";
                          for (const banco of metodosPagoConfigDirect.bancos) {
                            infoBancosTransf += `• ${banco.nombre}: ${banco.numeroCuenta} (${banco.tipoCuenta})\n`;
                          }
                        }
                        
                        // Concise confirmation - order not dispatched until receipt confirmed
                        let mensajeTransf = `🏦 *Pedido #${pedidoEsperandoPago.id} - Pago por transferencia*\n`;
                        mensajeTransf += `💰 Total: ${monedaSimboloMeta}${totalConDeliveryPago}`;
                        mensajeTransf += infoBancosTransf;
                        mensajeTransf += `\n📸 Envía tu comprobante de pago y confirmaremos tu pedido.`;
                        
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeTransf, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", mensajeTransf);
                        
                        // DO NOT auto-assign delivery - wait for receipt confirmation
                        continue; // Skip AI processing
                      }
                      
                      // Handle card payment
                      if (esTarjeta) {
                        // Update order with payment info
                        await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente");
                        await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, "tarjeta");
                        await storage.updatePedidoPago(pedidoEsperandoPago.id, {
                          montoPago: totalConDeliveryPago.toString(),
                          necesitaDevuelta: false,
                          total: totalConDeliveryPago.toString()
                        });
                        
                        // Concise confirmation message
                        let mensajeTarjeta = `✅ *Pedido #${pedidoEsperandoPago.id} confirmado*\n`;
                        mensajeTarjeta += `💳 Tarjeta: ${monedaSimboloMeta}${totalConDeliveryPago}\n`;
                        mensajeTarjeta += `⏱️ ${tiempoEstimadoPago}`;
                        
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, mensajeTarjeta, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", mensajeTarjeta);
                        
                        // Auto-assign delivery if only one active
                        await autoAssignAndNotifyDelivery(colmado, pedidoEsperandoPago.id, "tarjeta", totalConDeliveryPago, 0, totalConDeliveryPago, from, phoneNumberId, accessToken);
                        
                        continue; // Skip AI processing
                      }
                    }
                    
                    // HANDLE ORDERS AWAITING BUSINESS CONFIRMATION (pendiente_confirmacion)
                    // Must be checked before AI processing to avoid "no tienes pedido activo" responses
                    if (pedidoPendienteConf) {
                      const esCancelar = ["cancelar", "cancela", "cancelo", "cancelé", "no quiero", "no lo quiero", "borra", "quitar pedido", "eliminar pedido"].some(k => textLower.includes(k));
                      const esPreguntaEstado = ["estatus", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "ya salio", "ya salió", "mi delivery", "mi pedido", "seguimiento", "tracking", "confirmaron", "confirmado"].some(k => textLower.includes(k));

                      if (esCancelar) {
                        // Cancel the order directly — business hasn't confirmed yet so it's safe
                        await storage.updatePedidoEstado(pedidoPendienteConf.id, "cancelado");
                        await storage.updateConversacionPedidoEstado(conversacion.id, "cancelado");
                        const respuestaCancelado = `❌ Tu pedido *#${pedidoPendienteConf.id}* ha sido cancelado.\n\nSi deseas hacer otro pedido, escríbenos cuando quieras. 👋`;
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaCancelado, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", respuestaCancelado);
                        continue;
                      }

                      if (esPreguntaEstado) {
                        const respuestaEstado = buildOrderStatusMessage(pedidoPendienteConf, colmado);
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaEstado, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", respuestaEstado);
                        continue;
                      }
                      // Fall through to AI — but inject the order context so AI never says "no tienes pedido activo"
                    }

                    // CATCH-ALL STATUS HANDLER: fires for any order state not already handled above
                    const esConsultaEstadoMeta = ["estatus", "estado", "como va", "cómo va", "donde esta", "dónde está", "cuando llega", "cuándo llega", "ya salio", "ya salió", "mi delivery", "mi pedido", "seguimiento", "tracking"].some(k => textLower.includes(k));
                    if (esConsultaEstadoMeta) {
                      if (pedidosCliente.length === 0) {
                        // No orders — friendly fixed response
                        const msgNoOrder = "No encontré ningún pedido reciente. ¿Deseas hacer un nuevo pedido?";
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, msgNoOrder, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", msgNoOrder);
                        continue;
                      }
                      const pedidoReciente = pedidosCliente[0];
                      // Only handle states not already caught above (esperando_pago + pendiente_confirmacion already handled)
                      if (!["esperando_pago", "pendiente_confirmacion"].includes(pedidoReciente.estado)) {
                        let deliveryObj: any = undefined;
                        if (pedidoReciente.estado === "en_camino" && pedidoReciente.deliveryId) {
                          deliveryObj = await storage.getDeliveryById(pedidoReciente.deliveryId);
                        }
                        const msgEstadoCatchAll = buildOrderStatusMessage(pedidoReciente, colmado, deliveryObj);
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, msgEstadoCatchAll, accessToken);
                        await storage.addMensaje(conversacion.id, "assistant", msgEstadoCatchAll);
                        continue;
                      }
                    }

                    // Search for known jerga in the dictionary
                    const jergaEncontrada = await storage.buscarEnDiccionario(colmado.id, text);
                    let diccionarioContext = "";
                    if (jergaEncontrada.length > 0) {
                      diccionarioContext = "\n\nPalabras conocidas del cliente:\n" + 
                        jergaEncontrada.map(j => `- "${j.jerga}" = ${j.productoIdentificado}${j.precioSugerido ? ` (${monedaSimboloMeta}${j.precioSugerido})` : ""}`).join("\n");
                      
                      // Increment usage for found jerga
                      for (const j of jergaEncontrada) {
                        await storage.incrementarUsoJerga(j.id);
                      }
                    }
                    
                    // Get conversation history (last 10 messages for context)
                    const historialMensajes = await storage.getMensajesByConversacion(conversacion.id, 10);
                    
                    // Get colmado delivery settings
                    const costoDelivery = parseFloat(colmado.costoDelivery ?? "0");
                    const pedidoMinimo = colmado.pedidoMinimo ? parseFloat(colmado.pedidoMinimo) : 0;
                    const tiempoEstimado = colmado.tiempoEstimado || "20-30 min";
                    
                    // Determine conversation state based on what info we have
                    const tieneNombre = !!(conversacionActualizada?.clienteNombre && conversacionActualizada.clienteNombre !== "Cliente");
                    const tieneDireccion = !!conversacionActualizada?.direccionTexto;
                    const tieneUbicacion = !!(conversacionActualizada?.latitud && conversacionActualizada?.longitud);
                    
                    // Check if we already asked for GPS in recent messages (to avoid asking repeatedly)
                    const ultimosMensajes = historialMensajes.slice(0, 5).map(m => m.contenido.toLowerCase());
                    const yaSeOfrecioGPS = ultimosMensajes.some(m => 
                      m.includes("ubicación") || m.includes("compartir tu ubicación") || m.includes("📍")
                    );
                    
                    // Load system messages from database for dynamic prompts
                    const msgPromptBase = await storage.getMensajeSistema("system_prompt_base");
                    const msgFlowInstructions = await storage.getMensajeSistema("system_flow_instructions");
                    const msgPreguntaNombre = await storage.getMensajeSistema("pregunta_nombre");
                    const msgPreguntaDireccion = await storage.getMensajeSistema("pregunta_direccion");
                    const msgOfrecerUbicacion = await storage.getMensajeSistema("ofrecer_ubicacion");
                    const msgConfirmarPedido = await storage.getMensajeSistema("confirmar_pedido");
                    const msgPreguntaPago = await storage.getMensajeSistema("pregunta_pago");

                    // Build address format context from the colmado's country (Meta WhatsApp flow)
                    let addressFormatContextMeta = "";
                    if (colmado.paisId) {
                      const paisDirMeta = await storage.getPais(colmado.paisId);
                      if (paisDirMeta) {
                        const etiquetaCPMeta = paisDirMeta.etiquetaCodigoPostal;
                        const ejDirMeta = paisDirMeta.ejemploDireccion || "Calle Principal #123";
                        const ejCiudadMeta = paisDirMeta.ejemploCiudad || "Santo Domingo";
                        const ejEstMeta = paisDirMeta.ejemploEstado;
                        const ejCPMeta = paisDirMeta.ejemploCodigoPostal;
                        const partsEjMeta = [ejDirMeta, ejCiudadMeta, ejEstMeta, ejCPMeta].filter(Boolean).join(", ");
                        const zipRequiredMeta = paisDirMeta.requiereCodigoPostal && etiquetaCPMeta;
                        const patronCPMeta = (paisDirMeta as any).patronCodigoPostal;
                        addressFormatContextMeta = `\n                        FORMATO DE DIRECCIÓN (${paisDirMeta.nombre}):
                        - Ejemplo completo: "${partsEjMeta}"${etiquetaCPMeta ? `\n                        - Debe incluir ${etiquetaCPMeta} (código postal), ej: ${ejCPMeta || "10001"}` : ""}
                        Cuando el cliente proporcione su dirección, captura todos los campos disponibles en direccionTexto con este formato.${zipRequiredMeta ? `\n                        VALIDACIÓN ZIP OBLIGATORIA: Este negocio requiere ${etiquetaCPMeta} en toda dirección. Si el cliente ya proporcionó su dirección pero NO contiene un código postal (secuencia de dígitos como ${ejCPMeta || "10001"}), NO la guardes como válida — responde pidiendo que incluya el ${etiquetaCPMeta}. Ej: "Para completar tu pedido, necesito tu ${etiquetaCPMeta} (ej: ${ejCPMeta || "10001"}). ¿Me lo puedes indicar?"` : ""}${patronCPMeta ? `\n                        FORMATO ZIP: El ${etiquetaCPMeta} debe coincidir con el patrón ${patronCPMeta} (ej: ${ejCPMeta || "10001"}). Si el cliente proporciona un código postal que NO coincide con este formato, recházalo y pide uno correcto.` : ""}`;
                      }
                    }
                    
                    // Load payment methods configuration
                    const metodosPagoConfig = await storage.getMetodosPago(colmado.id);
                    const metodosHabilitados: string[] = [];
                    if (metodosPagoConfig?.efectivo !== false) metodosHabilitados.push("efectivo");
                    if (metodosPagoConfig?.transferencia) metodosHabilitados.push("transferencia");
                    if (metodosPagoConfig?.tarjeta) metodosHabilitados.push("tarjeta");
                    
                    // Build bank names list for transfer (no account numbers per WhatsApp policy)
                    let infoBancos = "";
                    let nombresBancosLista: string[] = [];
                    if (metodosPagoConfig?.transferencia && metodosPagoConfig.bancos?.length) {
                      nombresBancosLista = metodosPagoConfig.bancos.map((b: any) => b.nombre);
                      infoBancos = nombresBancosLista.join(", ");
                    }
                    
                    // Load menu products if business has menu
                    const tiposSinMenuAI = ["colmado", "colmadon"];
                    const tieneMenuAI = !tiposSinMenuAI.includes(colmado.tipoNegocio);
                    let menuProductosAI: Array<{ id: number; nombre: string; precio: string; categoria: string }> = [];
                    let menuContext = "";
                    
                    if (tieneMenuAI) {
                      const menuItems = await storage.getMenuProductos(colmado.id);
                      menuProductosAI = menuItems.filter(p => p.disponible).map(p => ({
                        id: p.id,
                        nombre: p.nombre.toLowerCase(),
                        precio: p.precio,
                        categoria: p.categoria
                      }));
                      
                      if (menuProductosAI.length > 0) {
                        // Build menu context for AI (names only, NO prices)
                        const nombresMenu = menuProductosAI.map(p => p.nombre).join(", ");
                        menuContext = `
                        
                        MENÚ DEL NEGOCIO (productos disponibles):
                        ${nombresMenu}
                        
                        IMPORTANTE SOBRE PRECIOS:
                        - NUNCA menciones precios en tus respuestas al cliente.
                        - Si el cliente pregunta precios, dile "Puedes escribir 'menú' para ver todos los precios."
                        - Solo captura el nombre del producto que el cliente pide.`;
                      }
                    }
                    
                    const globalPromptConfigCW = await storage.getConfiguracion("system_prompt_global");
                    const globalSystemPromptCW = globalPromptConfigCW?.valor || "";
                    
                    const conocimientoArchivosCW = await storage.getConocimientoByTipo(colmado.tipoNegocio || "colmado");
                    let conocimientoContextCW = "";
                    if (conocimientoArchivosCW.length > 0) {
                      conocimientoContextCW = "\n\nDATOS DE CONOCIMIENTO DEL NEGOCIO:\n" +
                        conocimientoArchivosCW.map(a => `--- ${a.nombre} ---\n${a.contenido}`).join("\n\n");
                    }
                    
                    const promptBase = (colmado as any).botPromptCustom || globalSystemPromptCW || msgPromptBase?.contenido || "Eres un asistente de pedidos amigable para un colmado en República Dominicana. Usas lenguaje dominicano casual y emojis.";
                    
                    let systemPrompt = "";
                    
                    if (pedidoEsperandoPago) {
                      // PAYMENT FLOW - Customer has a confirmed order waiting for payment method
                      // totalConfirmado/total already includes delivery — do NOT add again
                      const totalConDeliveryPago = parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total);
                      const subtotalProductosMeta = Math.max(0, totalConDeliveryPago - costoDelivery);
                      
                      systemPrompt = `${promptBase}
                        Colmado: "${colmado.nombre}"
                        
                        ESTADO: El cliente tiene un PEDIDO #${pedidoEsperandoPago.id} CONFIRMADO esperando su forma de pago.
                        Productos: ${monedaSimboloMeta}${subtotalProductosMeta}
                        Delivery: ${monedaSimboloMeta}${costoDelivery}
                        TOTAL A PAGAR: ${monedaSimboloMeta}${totalConDeliveryPago}
                        
                        MÉTODOS DE PAGO HABILITADOS: ${metodosHabilitados.join(", ")}
                        ${infoBancos ? `BANCOS DISPONIBLES PARA TRANSFERENCIA: ${infoBancos} (NO envíes números de cuenta - el negocio contactará al cliente)` : ""}
                        
                        TU ÚNICA TAREA: Identificar el método de pago del mensaje del cliente.
                        
                        FLUJO:
                        1. Si el cliente dice "efectivo", "cash", "pago en efectivo": preguntar "¿Con cuánto vas a pagar para darte tu ${palabraDevueltaMeta}? 💵"
                        2. Si el cliente da un monto (ej: "con 1000", "500"): confirmar pago y calcular ${palabraDevueltaMeta}
                        3. Si dice "transferencia", "por transferencia": confirmar y mostrar datos bancarios
                        4. Si dice "tarjeta", "con tarjeta", "pos": confirmar que el delivery cobrará con terminal
                        5. Si dice "pago exacto": usar el total como montoPago
                        
                        RESPONDE SIEMPRE EN JSON:
                        {
                          "accion": "preguntar_monto_efectivo" | "pago_confirmado" | "conversacion",
                          "respuesta": "mensaje amigable para el cliente",
                          "metodoPago": "efectivo" | "transferencia" | "tarjeta" | null,
                          "montoPago": number | null,
                          "devuelta": number | null,
                          "pagoConfirmado": boolean
                        }
                        
                        REGLAS:
                        - pagoConfirmado = true cuando: (efectivo Y tiene monto) O transferencia O tarjeta
                        - devuelta = montoPago - ${totalConDeliveryPago}. Si es 0 o negativo, devuelta = 0
                        - El TOTAL incluye productos (${subtotalProductosMeta}) + delivery (${costoDelivery}) = ${totalConDeliveryPago}
                        - NUNCA uses frases que impliquen un mensaje posterior: "dame un momento", "espera", "ahora lo hago", "en seguida", "te confirmo", "espera un segundo", etc. Tu respuesta ES el mensaje final — confirma la acción directamente en el mismo mensaje.`;
                    } else {
                      // NORMAL ORDER FLOW - Capture products with amounts
                      // If the customer already has an unconfirmed order, inject that context so the AI
                      // never says "no tienes pedido activo"
                      const pendienteConfContext = pedidoPendienteConf
                        ? `\n\n⚠️ PEDIDO ACTIVO DEL CLIENTE: El cliente ya tiene el Pedido #${pedidoPendienteConf.id} enviado al negocio y esperando confirmación.\nNUNCA digas que no tiene pedido activo.\nSi dice "cancelar" o similar, responde: "Tu pedido #${pedidoPendienteConf.id} está pendiente. Para cancelarlo escribe CANCELAR."`
                        : "";
                      systemPrompt = `${promptBase}
                        Colmado: "${colmado.nombre}"
                        
                        ESTADO DEL CLIENTE:
                        - Nombre: ${tieneNombre ? conversacionActualizada?.clienteNombre : "NO REGISTRADO"}
                        - Dirección: ${tieneDireccion ? conversacionActualizada?.direccionTexto : "NO REGISTRADA"}
                        - Ubicación GPS: ${tieneUbicacion ? "SÍ GUARDADA" : "NO GUARDADA"}
                        - Ya se ofreció GPS: ${yaSeOfrecioGPS ? "SÍ" : "NO"}
                        ${pendienteConfContext}
                        
                        CONFIGURACIÓN DEL COLMADO:
                        - Moneda: ${(enrichedMeta as any).monedaNombre || "Peso Dominicano"} (símbolo: ${monedaSimboloMeta})
                        - Costo de delivery: ${monedaSimboloMeta}${costoDelivery}
                        - Pedido mínimo: ${monedaSimboloMeta}${pedidoMinimo}
                        - Tiempo estimado: ${tiempoEstimado}
                        ${diccionarioContext}
                        ${menuContext}
                        ${conocimientoContextCW}
                        ${addressFormatContextMeta}
                        
                        FLUJO DE PEDIDO:
                        1. Si el cliente pide productos → capturar productos CON SUS MONTOS
                        2. Si no tenemos nombre → preguntar "¿A nombre de quién va el pedido?"
                        3. Si no tenemos dirección → preguntar "¿Cuál es tu dirección de entrega?" (incluyendo el formato indicado si aplica)
                        4. Si no tenemos GPS y no se ha ofrecido → ofrecer "¿Me puedes compartir tu ubicación 📍?"
                        5. Cuando tenemos productos + nombre + dirección → crear pedido y avisar que el colmado confirmará
                        
                        IMPORTANTE - CAPTURA DE PRODUCTOS:
                        - Cuando el cliente dice "10 de salsa", el 10 es el MONTO en la moneda local (${monedaSimboloMeta}10), NO la cantidad.
                        - Ejemplo: "dame 50 de arroz, 100 de aceite, 20 de sal" = 
                          * arroz por ${monedaSimboloMeta}50
                          * aceite por ${monedaSimboloMeta}100
                          * sal por ${monedaSimboloMeta}20
                        - NO calcules el total. Solo captura los productos con sus montos mencionados.
                        - Si el cliente dice "2 cervezas" sin monto, es cantidad 2 sin precio definido.
                        
                        RESPONDE SIEMPRE EN JSON:
                        {
                          "accion": "capturar_productos" | "preguntar_nombre" | "preguntar_direccion" | "ofrecer_ubicacion" | "crear_pedido" | "conversacion",
                          "respuesta": "mensaje amigable para el cliente",
                          "clienteNombre": "nombre si lo mencionó" | null,
                          "direccionTexto": "dirección si la mencionó" | null,
                          "productos": [{ "nombre": string, "monto": number | null, "cantidad": number | null, "jergaOriginal": string }] | null,
                          "crearPedido": boolean
                        }
                        
                        REGLAS:
                        - jergaOriginal: palabra exacta que usó el cliente (ej: "fría", "palo")
                        - monto: el valor en la moneda local mencionado (ej: "10 de salsa" → monto: 10)
                        - cantidad: solo si el cliente especifica unidades (ej: "2 cervezas" → cantidad: 2)
                        - crearPedido = true cuando: tenemos productos + nombre + dirección
                        - Si el cliente dice "no", "no gracias", "así namas", "así nomás", "eso es todo", "con eso", "nada más", "listo", "ya", "ya está", "estamos", "no quiero más", "está bien así" → terminó de agregar productos. Si ya hay productos + nombre + dirección → crearPedido: true. Si faltan nombre o dirección, proceder a pedirlos.
                        - Si el cliente pregunta algo general o saluda, usa accion: "conversacion"
                        - Si el cliente saluda en inglés (hello, hi, hey, etc.), responde con un saludo amigable en español, NUNCA digas que "solo atendemos en español" ni hagas ninguna mención a restricciones de idioma.
                        - NUNCA pidas GPS más de una vez en la conversación
                        - La ubicación GPS es OPCIONAL. Si el cliente dice "no" o continúa, avanza.
                        - NUNCA uses frases que impliquen un mensaje posterior: "dame un momento", "espera", "ahora lo hago", "en seguida", "te confirmo", "espera un segundo", etc. Tu respuesta ES el mensaje final — confirma la acción directamente en el mismo mensaje.
                        - CRÍTICO - NUNCA INVENTES PRODUCTOS: Solo captura en "productos" lo que el cliente mencionó EXPLÍCITAMENTE en su mensaje actual. NO extraigas productos del historial, del menú, ni de pedidos anteriores. Si el cliente dice "quiero añadir algo" o "quiero pedir" sin especificar qué, devuelve accion: "conversacion" con productos: null y pregunta qué desea.`;
                    }
                    
                    // Build messages array with history (reverse to get chronological order)
                    const mensajesParaAI: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
                      {
                        role: "system",
                        content: systemPrompt
                      }
                    ];
                    
                    // Add conversation history (oldest first)
                    const historialOrdenado = [...historialMensajes].reverse();
                    for (const msg of historialOrdenado) {
                      mensajesParaAI.push({
                        role: msg.rol === "user" ? "user" : "assistant",
                        content: msg.contenido
                      });
                    }
                    
                    try {
                      // Process the message with AI
                      const completion = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: mensajesParaAI,
                        response_format: { type: "json_object" },
                        max_tokens: 800,
                      });

                      let datos: any = {};
                      try {
                        datos = JSON.parse(completion.choices[0]?.message?.content || "{}");
                      } catch (parseError) {
                        console.error("Error parsing AI response:", parseError);
                        datos = { accion: "conversacion", respuesta: "¡Hola! Envíanos tu pedido y te lo llevamos." };
                      }

                      let respuestaTexto = datos.respuesta || "";
                      let conversacionGuardada = false; // tracks explicit addMensaje inside merge branches
                      
                      // Update customer name if provided
                      if (datos.clienteNombre && datos.clienteNombre !== "Cliente") {
                        await storage.getOrCreateConversacion(colmado.id, from, datos.clienteNombre);
                      }
                      
                      // Update address if provided — validate ZIP first when country requires it
                      if (datos.direccionTexto) {
                        const zipCheck = await validarZipEnDireccion(colmado.paisId, datos.direccionTexto);
                        if (zipCheck.zipOk) {
                          await storage.updateConversacionDireccion(conversacion.id, {
                            texto: datos.direccionTexto
                          });
                        } else {
                          // ZIP missing: override AI response to re-ask, do not save and do not create order
                          console.warn(
                            `[ZIP-ALERT] canal=meta colmadoId=${colmado.id} from=${from} direccionRecibida="${datos.direccionTexto}"`
                          );
                          void logZipMissingAlertAndNotify(colmado, "meta", from, datos.direccionTexto);
                          const zipReAsk = `Para completar tu pedido necesito tu ${zipCheck.etiquetaCP} (ej: ${zipCheck.ejemploCP}). ¿Me lo puedes indicar junto con tu dirección completa?`;
                          datos.respuesta = zipReAsk;
                          respuestaTexto = zipReAsk; // respuestaTexto is the variable actually sent
                          datos.crearPedido = false;
                          datos.direccionTexto = null;
                        }
                      }
                      
                      // Save new jerga to dictionary (self-learning)
                      if (Array.isArray(datos.productos)) {
                        for (const producto of datos.productos) {
                          if (producto.jergaOriginal && producto.nombre) {
                            const jergaLower = producto.jergaOriginal.toLowerCase().trim();
                            if (jergaLower !== producto.nombre.toLowerCase() && jergaLower.length > 2) {
                              try {
                                await storage.guardarJerga(
                                  colmado.id, 
                                  jergaLower, 
                                  producto.nombre,
                                  producto.monto?.toString()
                                );
                                console.log(`Diccionario: guardado "${jergaLower}" = "${producto.nombre}"`);
                              } catch (e) {
                                console.log(`Diccionario: error guardando jerga`, e);
                              }
                            }
                          }
                        }
                        
                        // Match products against menu to assign prices
                        // Products IN menu get menu price (x quantity), products NOT in menu get no price
                        if (tieneMenuAI && menuProductosAI.length > 0) {
                          for (const producto of datos.productos) {
                            const nombreLower = producto.nombre?.toLowerCase().trim() || "";
                            
                            // Try to find exact match or partial match in menu
                            const menuMatch = menuProductosAI.find(m => 
                              m.nombre === nombreLower ||
                              m.nombre.includes(nombreLower) ||
                              nombreLower.includes(m.nombre)
                            );
                            
                            if (menuMatch) {
                              // Product found in menu - use menu price multiplied by quantity
                              const precioUnitario = parseFloat(menuMatch.precio);
                              const cantidad = producto.cantidad || 1;
                              producto.precioUnitario = precioUnitario;
                              producto.monto = precioUnitario * cantidad;
                              producto.menuProductoId = menuMatch.id;
                              console.log(`Menu match: "${producto.nombre}" x${cantidad} → ${monedaSimboloMeta}${producto.monto}`);
                            } else {
                              // Product NOT in menu - no price (staff will set it)
                              producto.monto = null;
                              console.log(`Not in menu: "${producto.nombre}" → sin precio`);
                            }
                          }
                        }
                      }
                      
                      // Handle different flows based on order state
                      if (pedidoEsperandoPago && datos.pagoConfirmado) {
                        // PAYMENT CONFIRMED - Complete the order and assign delivery
                        const metodoPagoFinal = datos.metodoPago || "efectivo";
                        const totalPedido = parseFloat(pedidoEsperandoPago.totalConfirmado || pedidoEsperandoPago.total);
                        const totalConDelivery = totalPedido; // already includes delivery
                        const subtotalMeta = Math.max(0, totalConDelivery - costoDelivery);
                        const montoPago = Number(datos.montoPago) || totalConDelivery;
                        const devuelta = metodoPagoFinal === "efectivo" ? Math.max(0, montoPago - totalConDelivery) : 0;
                        
                        // Update order with payment info and set to pendiente
                        await storage.updatePedidoEstado(pedidoEsperandoPago.id, "pendiente");
                        await storage.updatePedidoMetodoPago(pedidoEsperandoPago.id, metodoPagoFinal);
                        
                        // Update order with payment details using storage method
                        await storage.updatePedidoPago(pedidoEsperandoPago.id, {
                          montoPago: montoPago.toString(),
                          necesitaDevuelta: metodoPagoFinal === "efectivo" && devuelta > 0,
                          total: totalConDelivery.toString()
                        });
                        if (metodoPagoFinal === "efectivo" && devuelta > 0) await storage.updateVueltoEntregado(pedidoEsperandoPago.id, devuelta);
                        
                        // Get payment method label
                        const metodoPagoLabel = metodoPagoFinal === "efectivo" ? "💵 Efectivo" : 
                                                metodoPagoFinal === "transferencia" ? "🏦 Transferencia" : "💳 Tarjeta";
                        
                        // Get products for summary
                        let productosResumen = "";
                        try {
                          const productos = typeof pedidoEsperandoPago.productos === 'string' 
                            ? JSON.parse(pedidoEsperandoPago.productos) 
                            : pedidoEsperandoPago.productos;
                          if (Array.isArray(productos)) {
                            productosResumen = productos.map((p: any) => {
                              const nombre = p.nombre || p.name;
                              if (p.monto) return `• ${nombre} (${monedaSimboloMeta}${p.monto})`;
                              if (p.cantidad) return `• ${p.cantidad}x ${nombre}`;
                              return `• ${nombre}`;
                            }).join("\n");
                          }
                        } catch (e) {
                          productosResumen = String(pedidoEsperandoPago.productos);
                        }
                        
                        respuestaTexto = `✅ *¡Pedido #${pedidoEsperandoPago.id} Confirmado!*\n\n`;
                        respuestaTexto += `📝 *Tu pedido:*\n${productosResumen}\n\n`;
                        respuestaTexto += `💰 Subtotal: ${monedaSimboloMeta}${subtotalMeta}\n`;
                        respuestaTexto += `🛵 Delivery: ${monedaSimboloMeta}${costoDelivery}\n`;
                        respuestaTexto += `━━━━━━━━━━━━━━━\n`;
                        respuestaTexto += `*💵 Total: ${monedaSimboloMeta}${totalConDelivery}*\n\n`;
                        respuestaTexto += `*Pago:* ${metodoPagoLabel}\n`;
                        if (metodoPagoFinal === "efectivo" && devuelta > 0) {
                          respuestaTexto += `💵 Pagas con: ${monedaSimboloMeta}${montoPago}\n`;
                          respuestaTexto += `🔄 *${palabraDevueltaMeta.charAt(0).toUpperCase()}${palabraDevueltaMeta.slice(1)}: ${monedaSimboloMeta}${devuelta}*\n`;
                        }
                        respuestaTexto += `\n⏱️ *Tiempo estimado de entrega: ${tiempoEstimado}*\n`;
                        respuestaTexto += `\n¡Gracias por tu compra! Tu pedido está en camino 🛵`;
                        
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                        
                        // Get updated order for delivery notification
                        const pedidoActualizado = await storage.getPedidoById(pedidoEsperandoPago.id);
                        
                        // Try to assign and notify a delivery
                        const deliveriesActivos = await storage.getDeliveriesByColmado(colmado.id);
                        const deliveriesActivosConVentana: typeof deliveriesActivos = [];
                        for (const d of deliveriesActivos) {
                          if (d.estado === "activo" && await storage.isDeliveryWindowActive(d)) {
                            deliveriesActivosConVentana.push(d);
                          }
                        }
                        
                        const deliveryActivo = deliveriesActivosConVentana.length === 1 ? deliveriesActivosConVentana[0] : null;
                        
                        if (deliveryActivo && pedidoActualizado) {
                          await storage.asignarPedidoADelivery(pedidoEsperandoPago.id, deliveryActivo.id);
                          
                          // Format products for delivery message
                          let productosTexto = "";
                          try {
                            const productos = typeof pedidoActualizado.productos === 'string' 
                              ? JSON.parse(pedidoActualizado.productos) 
                              : pedidoActualizado.productos;
                            if (Array.isArray(productos)) {
                              productosTexto = productos.map((p: any) => 
                                `• ${p.nombre} ${p.monto ? `(${monedaSimboloMeta}${p.monto})` : p.cantidad ? `x${p.cantidad}` : ""}`
                              ).join("\n");
                            }
                          } catch (e) {
                            productosTexto = String(pedidoActualizado.productos);
                          }
                          
                          // Get GPS coordinates for Google Maps link and freshest address text
                          let ubicacionLink = "";
                          let convDirTextoMeta = "";
                          try {
                            const convUbicacion = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
                            if (convUbicacion && convUbicacion.latitud && convUbicacion.longitud) {
                              ubicacionLink = `\n📌 https://maps.google.com/?q=${convUbicacion.latitud},${convUbicacion.longitud}`;
                            } else {
                              const clienteUbicacion = await storage.getClienteByWhatsapp(colmado.id, from);
                              if (clienteUbicacion && clienteUbicacion.latitud && clienteUbicacion.longitud) {
                                ubicacionLink = `\n📌 https://maps.google.com/?q=${clienteUbicacion.latitud},${clienteUbicacion.longitud}`;
                              }
                            }
                            // Use conversation address if more complete than the stored order address
                            if (convUbicacion?.direccionTexto && (convUbicacion.direccionTexto.length > (pedidoActualizado.clienteUbicacion || "").length)) {
                              convDirTextoMeta = convUbicacion.direccionTexto;
                            }
                          } catch (e) {
                            console.error("Error getting client location for delivery:", e);
                          }
                          const direccionParaMeta = convDirTextoMeta || pedidoActualizado.clienteUbicacion || "Por confirmar";
                          
                          let deliveryMsg = `🛵 *NUEVO PEDIDO #${pedidoEsperandoPago.id}*\n\n`;
                          deliveryMsg += `👤 *Cliente:* ${pedidoActualizado.clienteNombre}\n`;
                          deliveryMsg += `📦 *Productos:*\n${productosTexto}\n\n`;
                          deliveryMsg += `💰 *Total: ${monedaSimboloMeta}${totalConDelivery}*\n`;
                          deliveryMsg += `\n*PAGO: ${metodoPagoLabel}*\n`;
                          if (metodoPagoFinal === "efectivo") {
                            deliveryMsg += `💵 *Cobrar: ${monedaSimboloMeta}${montoPago}*\n`;
                            if (devuelta > 0) {
                              deliveryMsg += `🔄 *Dar ${palabraDevueltaMeta}: ${monedaSimboloMeta}${devuelta}*\n`;
                            }
                          } else if (metodoPagoFinal === "transferencia") {
                            deliveryMsg += `✅ *Ya pagado por transferencia*\n`;
                          } else if (metodoPagoFinal === "tarjeta") {
                            deliveryMsg += `💳 *Cobrar ${monedaSimboloMeta}${totalConDelivery} con terminal*\n`;
                          }
                          deliveryMsg += `\n📍 *Dirección:*\n${direccionParaMeta}${ubicacionLink}\n`;
                          deliveryMsg += `\n━━━━━━━━━━━━━━━\n`;
                          deliveryMsg += `*Responde con:*\n`;
                          deliveryMsg += `✅ *entregado #${pedidoEsperandoPago.id}* — Pedido entregado\n`;
                          deliveryMsg += `❌ *cancelado #${pedidoEsperandoPago.id}* — No se pudo entregar\n`;
                          deliveryMsg += `🔄 *retorno #${pedidoEsperandoPago.id}* — Devolver al colmado`;
                          
                          await sendWhatsAppMessageWithToken(phoneNumberId, deliveryActivo.whatsappNumero, deliveryMsg, accessToken);
                        } else if (deliveriesActivosConVentana.length > 1) {
                          console.log(`Pedido #${pedidoEsperandoPago.id} pago confirmado - hay ${deliveriesActivosConVentana.length} deliveries activos, admin debe asignar`);
                        } else {
                          console.log(`Pedido #${pedidoEsperandoPago.id} pago confirmado pero no hay delivery activo`);
                        }
                        
                      } else if (datos.crearPedido && datos.productos && datos.productos.length > 0) {
                        // CREATE OR MERGE ORDER
                        const conversacionFinal = await storage.getConversacionByClienteWhatsapp(colmado.id, from);
                        const clienteExistente = await storage.getClienteByWhatsapp(colmado.id, from);
                        // Prefer the freshest captured address (conversation > datos > stored client)
                        // so that a new address with ZIP is not shadowed by a stale stored one
                        const direccionFinal = conversacionFinal?.direccionTexto || 
                                              datos.direccionTexto || 
                                              clienteExistente?.direccionTexto || 
                                              "Por confirmar";
                        const clienteNombreFinal = clienteExistente?.nombre || 
                                                  datos.clienteNombre || 
                                                  conversacionFinal?.clienteNombre || 
                                                  "Cliente";
                        
                        await storage.getOrCreateCliente(colmado.id, from, {
                          nombre: clienteNombreFinal !== "Cliente" ? clienteNombreFinal : undefined,
                          direccionTexto: direccionFinal !== "Por confirmar" ? direccionFinal : undefined,
                          latitud: conversacionFinal?.latitud || undefined,
                          longitud: conversacionFinal?.longitud || undefined,
                        });

                        // ZIP format guard: validate before any order is created or merged-into-new.
                        // Fails open when no country is configured or address is still unknown.
                        let zipValidMeta = true;
                        if (direccionFinal !== "Por confirmar") {
                          const zipCheckMetaOrder = await validarZipEnDireccion(colmado.paisId, direccionFinal);
                          if (!zipCheckMetaOrder.zipOk) {
                            zipValidMeta = false;
                            const etiqMeta = zipCheckMetaOrder.etiquetaCP || "código postal";
                            const ejMeta = zipCheckMetaOrder.ejemploCP || "10001";
                            respuestaTexto = `Para completar tu pedido necesito un ${etiqMeta} válido (ej: ${ejMeta}). ¿Me puedes indicar tu ${etiqMeta}?`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
                            conversacionGuardada = true;
                          }
                        }

                        const productosTexto = (prods: any[]) => prods.map((p: any) =>
                          `• ${p.nombre}${p.monto ? ` (${monedaSimboloMeta}${p.monto})` : p.cantidad ? ` x${p.cantidad}` : ""}`
                        ).join("\n");

                        // -- MERGE CHECK --
                        if (zipValidMeta && pedidoPendienteConf) {
                          const menuProductosMeta = await storage.getMenuProductos(colmado.id);
                          const eval_ = evaluarElegibilidadMerge(pedidoPendienteConf, datos.productos, menuProductosMeta);

                          if (eval_.accion === "merge_all") {
                            const nuevoSubtotal = eval_.valorOriginal + eval_.valorNuevo;
                            const nuevoTotal = nuevoSubtotal.toString();
                            await storage.mergePedidoProductos(pedidoPendienteConf.id, datos.productos, nuevoTotal);
                            // Fetch full merged order for complete display
                            const pedidoMergedAll = await storage.getPedidoById(pedidoPendienteConf.id);
                            let prodsMergedAll: any[] = [];
                            try { prodsMergedAll = typeof pedidoMergedAll?.productos === "string" ? JSON.parse(pedidoMergedAll.productos) : []; } catch {}
                            const totalConDeliveryMergeAll = nuevoSubtotal + costoDelivery;
                            respuestaTexto = `✅ Tu Pedido #${pedidoPendienteConf.id} fue actualizado.\n\n📝 *Pedido completo:*\n${productosTexto(prodsMergedAll)}\n\n💰 Nuevo total estimado: ${monedaSimboloMeta}${totalConDeliveryMergeAll}\n\n⏳ *${colmado.nombre}* revisará el pedido completo.`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                            // Dashboard conversation notification with full order details
                            await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
                            conversacionGuardada = true;
                            // Re-notify business via WhatsApp
                            if (colmado.whatsappNumero) {
                              const msgNegocio = `🔔 *Pedido #${pedidoPendienteConf.id} actualizado* (se añadieron productos)\n👤 ${clienteNombreFinal}\n📝 Productos completos:\n${prodsMergedAll.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimboloMeta}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimboloMeta}${nuevoTotal}`;
                              await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
                            }
                            console.log(`Pedido #${pedidoPendienteConf.id} merged (merge_all) - Meta WhatsApp`);

                          } else if (eval_.accion === "merge_bebidas_only") {
                            const bebidas = eval_.bebidasParaMerge || [];
                            const noBebidas = eval_.noBebidasExcluidas || [];
                            const valorBebidas = bebidas.reduce((s: number, p: any) => s + (p.monto || 0), 0);
                            const nuevoTotal = (eval_.valorOriginal + valorBebidas).toString();
                            await storage.mergePedidoProductos(pedidoPendienteConf.id, bebidas, nuevoTotal);
                            // Fetch full merged order for complete display
                            const pedidoMergedBebidas = await storage.getPedidoById(pedidoPendienteConf.id);
                            let prodsMergedBebidas: any[] = [];
                            try { prodsMergedBebidas = typeof pedidoMergedBebidas?.productos === "string" ? JSON.parse(pedidoMergedBebidas.productos) : []; } catch {}
                            // Show total including delivery in client-facing message; DB stores subtotal only
                            const totalConDeliveryBebidas = eval_.valorOriginal + valorBebidas + costoDelivery;
                            respuestaTexto = `⏰ Ya pasaron los 5 minutos, solo podemos añadir bebidas.\n\n✅ Se añadió al Pedido #${pedidoPendienteConf.id}:\n${productosTexto(bebidas)}\n💰 Nuevo total estimado: ${monedaSimboloMeta}${totalConDeliveryBebidas}`;
                            if (noBebidas.length > 0) {
                              respuestaTexto += `\n\n⚠️ No se pudieron añadir (no son bebidas):\n${productosTexto(noBebidas)}`;
                            }
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                            // Dashboard conversation notification with full order details
                            const msgDashBebidas = `⏰ Bebidas añadidas al Pedido #${pedidoPendienteConf.id}\n📝 Pedido completo:\n${prodsMergedBebidas.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimboloMeta}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimboloMeta}${nuevoTotal}`;
                            await storage.addMensaje(conversacion.id, "assistant", msgDashBebidas);
                            conversacionGuardada = true;
                            // Re-notify business via WhatsApp
                            if (colmado.whatsappNumero) {
                              const msgNegocio = `🔔 *Pedido #${pedidoPendienteConf.id} actualizado* (bebidas añadidas)\n👤 ${clienteNombreFinal}\n📝 Productos completos:\n${prodsMergedBebidas.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimboloMeta}${p.monto})` : ""}`).join("\n")}\n💰 Nuevo total: ${monedaSimboloMeta}${nuevoTotal}`;
                              await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
                            }
                            console.log(`Pedido #${pedidoPendienteConf.id} merged (bebidas_only) - Meta WhatsApp`);

                          } else if (eval_.accion === "crear_nuevo") {
                            // 5 minutes passed and products aren't beverages — create a new separate order directly
                            const pedidoNuevo = await storage.createPedido({
                              colmadoId: colmado.id,
                              clienteNombre: clienteNombreFinal,
                              clienteWhatsapp: from,
                              clienteUbicacion: direccionFinal,
                              productos: JSON.stringify(datos.productos),
                              total: "0",
                              montoPago: "0",
                              necesitaDevuelta: false,
                              estado: "pendiente_confirmacion",
                            });
                            respuestaTexto = `📋 *Pedido #${pedidoNuevo.id} recibido*\n\n📝 *Productos:*\n${productosTexto(datos.productos)}\n\n⏳ *${colmado.nombre}* revisará tu pedido y te confirmará.`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
                            conversacionGuardada = true;
                            if (colmado.whatsappNumero) {
                              const msgNegocio = `🛒 *Nuevo pedido #${pedidoNuevo.id}*\n👤 ${clienteNombreFinal}\n📝 Productos:\n${datos.productos.map((p: any) => `• ${p.nombre}${p.monto ? ` (${monedaSimboloMeta}${p.monto})` : ""}`).join("\n")}`;
                              await sendWhatsAppMessageSmart(colmado, colmado.whatsappNumero, msgNegocio);
                            }
                            console.log(`Pedido #${pedidoNuevo.id} creado (crear_nuevo after 5min) - Meta WhatsApp`);

                          } else {
                            // crear_nuevo_por_valor — new value exceeds original, create separate order
                            const pedido = await storage.createPedido({
                              colmadoId: colmado.id,
                              clienteNombre: clienteNombreFinal,
                              clienteWhatsapp: from,
                              clienteUbicacion: direccionFinal,
                              productos: JSON.stringify(datos.productos),
                              total: "0",
                              montoPago: "0",
                              necesitaDevuelta: false,
                              estado: "pendiente_confirmacion",
                            });
                            respuestaTexto = `📋 *Pedido #${pedido.id} Recibido*\n\n📝 *Productos:*\n${productosTexto(datos.productos)}\n\n⏳ *${colmado.nombre}* revisará tu nuevo pedido.`;
                            await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                            await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
                            conversacionGuardada = true;
                            console.log(`Pedido #${pedido.id} creado (crear_nuevo_por_valor) - Meta WhatsApp`);
                          }

                        } else if (zipValidMeta) {
                          // No existing pending order — create fresh
                          const pedido = await storage.createPedido({
                            colmadoId: colmado.id,
                            clienteNombre: clienteNombreFinal,
                            clienteWhatsapp: from,
                            clienteUbicacion: direccionFinal,
                            productos: JSON.stringify(datos.productos),
                            total: "0",
                            montoPago: "0",
                            necesitaDevuelta: false,
                            estado: "pendiente_confirmacion",
                          });
                          respuestaTexto = `📋 *Pedido #${pedido.id} Recibido*\n\n📝 *Productos solicitados:*\n${productosTexto(datos.productos)}\n\n👤 *Cliente:* ${clienteNombreFinal}\n📍 *Dirección:* ${direccionFinal}\n\n⏳ *${colmado.nombre}* está revisando tu pedido y te confirmará el total en un momento.\n\n¡Gracias por tu preferencia! 🙏`;
                          await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                          console.log(`Pedido #${pedido.id} creado con estado pendiente_confirmacion - Meta WhatsApp`);
                        }
                        
                        
                      } else {
                        // Not yet confirmed - send the AI's conversational response
                        if (!respuestaTexto) {
                          respuestaTexto = "¡Hola! Envíanos tu pedido y te lo llevamos. 🛵";
                        }
                        await sendWhatsAppMessageWithToken(phoneNumberId, from, respuestaTexto, accessToken);
                      }
                      
                      // Save the AI response to conversation history (skip if already saved inside a merge branch)
                      if (!conversacionGuardada) {
                        await storage.addMensaje(conversacion.id, "assistant", respuestaTexto);
                      }
                      
                    } catch (aiError) {
                      console.error("Error processing message with AI:", aiError);
                    }
                  }
                } catch (messageError) {
                  console.error("Error processing individual message:", messageError);
                }
              }
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Error processing WhatsApp webhook:", error);
      res.sendStatus(200); // Always return 200 to avoid Meta retrying
    }
  });
}
