import { and, desc, eq, ne, sql } from "drizzle-orm";
import { botNoEntendidos, botRegistro, chatWebSesiones, clienteDirecciones, clientes, diccionarioJerga, pedidos, type ChatWebSesion, type Colmado } from "@shared/schema";
import type { Env } from "../env";
import type { Db } from "../db";
import { isColmadoAbierto } from "../lib/horario";
import { aprenderJerga, diccionarioDelPais, normalizar, paisDelColmado } from "../lib/jerga";
import { avisarNegocio } from "../lib/tiempo-real";
import { getColmadoTimezone } from "../storage/colmados";
import { addMensaje, getClienteByWhatsapp, updateConversacionPedidoEstado } from "../storage/conversaciones";
import { createPedido, ESTADOS_TERMINALES } from "../storage/pedidos";
import { interpretar } from "./ia";
import * as I from "./intenciones";
import { leerPedido, textoItem, type Item } from "./productos";

// Bot del chat de la página (delywa.com/pedir/<colmado>). Funciona por pasos y SIN inteligencia artificial:
//   saludo según la hora → anota el pedido ("¿Algo más?") → "¿Eso es todo?" → ubicación →
//   forma de pago → (efectivo) ¿con cuánto pagas? → resumen y "el colmado lo verifica".
// Solo cuando no entiende un mensaje le pregunta a la IA de Cloudflare (Workers AI), y lo que la IA
// resuelve se le enseña al diccionario de jerga del país: la próxima vez ya no hace falta la IA.
// No usa las reglas de Meta: es el canal propio de DelyWa.

export type Opcion = { texto: string; accion?: "ubicacion" | "comprobante" };
export type Respuesta = { texto: string; opciones?: Opcion[] };
export type Entrada = { tipo: "texto"; texto: string } | { tipo: "ubicacion"; latitud: number; longitud: number };

type Anotado = { nombre: string; cantidad: number; unidad: string | null; monto: number | null };
type Nuevo = Pick<Item, "nombre" | "cantidad" | "unidad" | "monto">;

type Contexto = {
  env: Env;
  db: Db;
  colmado: Colmado;
  sesion: ChatWebSesion;
  /** Cuántas veces ha respondido ya el bot en esta sesión (la primera lleva el saludo). */
  respuestasPrevias: number;
  /** El cliente ya usó este mismo teléfono (aparato) con este número: se le puede recordar su último pedido. */
  aparatoConocido?: boolean;
};

const PAGOS: Opcion[] = [{ texto: "💵 Efectivo" }, { texto: "💳 Tarjeta" }, { texto: "🏦 Transferencia" }];
const BOTON_UBICACION: Opcion = { texto: "📍 Enviar mi ubicación", accion: "ubicacion" };
const BOTON_CASA: Opcion = { texto: "🏠 A mi casa" };
const BOTON_REPETIR: Opcion = { texto: "🔁 Repetir mi último pedido" };
const ELEGIR_DESTINO: Opcion[] = [{ texto: "📍 Aquí donde estoy" }, BOTON_CASA];
/** Si la ubicación que manda está más lejos que esto de su casa guardada, se le pregunta a dónde lo quiere. */
const METROS_LEJOS_DE_CASA = 300;
const ESTADOS_LEGIBLES: Record<string, string> = {
  pendiente_confirmacion: "el colmado lo está verificando", esperando_pago: "esperando tu pago", esperando_confirmacion_pago: "revisando tu pago",
  pendiente: "recibido y en cola", en_preparacion: "lo están preparando", listo: "listo para salir", en_camino: "va en camino 🛵",
  llegando: "está llegando 📍", entregado: "entregado ✅", cancelado: "cancelado", retorno: "devuelto",
};

const lista = (items: Anotado[]) => items.map((p) => `• ${textoItem(p)}`).join("\n");
const primerNombre = (s: ChatWebSesion) => (s.clienteNombre || "").trim().split(/\s+/)[0] || "";
const dinero = (n: number) => `RD$${n.toLocaleString("es-DO")}`;

async function jergaParaLeer(c: Contexto): Promise<Map<string, string>> {
  const paisId = await paisDelColmado(c.db, c.colmado);
  const [propias, delPais] = await Promise.all([
    c.db.select({ jerga: diccionarioJerga.jerga, producto: diccionarioJerga.productoIdentificado }).from(diccionarioJerga).where(eq(diccionarioJerga.colmadoId, c.colmado.id)),
    diccionarioDelPais(c.db, c.colmado.tipoNegocio || "colmado", paisId),
  ]);
  const mapa = new Map<string, string>();
  for (const j of delPais) mapa.set(normalizar(j.jerga), j.productoIdentificado);
  for (const j of propias) mapa.set(normalizar(j.jerga), j.producto); // la del colmado gana
  // Las frases más largas primero ("una fria grande" antes que "fria").
  return new Map([...mapa].sort((a, b) => b[0].length - a[0].length));
}

async function guardarSesion(c: Contexto, cambios: Partial<typeof chatWebSesiones.$inferInsert>) {
  Object.assign(c.sesion, cambios);
  await c.db.update(chatWebSesiones).set({ ...cambios, fechaUltimaActividad: new Date() }).where(eq(chatWebSesiones.sessionId, c.sesion.sessionId));
}

async function anotarMetrica(c: Contexto, campo: "mensajes" | "conIa" | "sinEntender" | "notasDeVoz") {
  const dia = new Date().toISOString().slice(0, 10);
  const col = { mensajes: botRegistro.mensajes, conIa: botRegistro.conIa, sinEntender: botRegistro.sinEntender, notasDeVoz: botRegistro.notasDeVoz }[campo];
  await c.db.insert(botRegistro).values({ dia, colmadoId: c.colmado.id, [campo]: 1 })
    .onConflictDoUpdate({ target: [botRegistro.dia, botRegistro.colmadoId], set: { [campo]: sql`${col} + 1` } })
    .catch(() => undefined);
}

export async function anotarNotaDeVoz(db: Db, colmadoId: number) {
  const dia = new Date().toISOString().slice(0, 10);
  await db.insert(botRegistro).values({ dia, colmadoId, notasDeVoz: 1 })
    .onConflictDoUpdate({ target: [botRegistro.dia, botRegistro.colmadoId], set: { notasDeVoz: sql`${botRegistro.notasDeVoz} + 1` } })
    .catch(() => undefined);
}

function productosDe(s: ChatWebSesion): Anotado[] {
  return Array.isArray(s.productosCapturados) ? (s.productosCapturados as unknown as Anotado[]) : [];
}

/** Junta lo nuevo con lo ya anotado (si repite el mismo producto y unidad, suma la cantidad). */
function sumar(anteriores: Anotado[], nuevos: Nuevo[]): Anotado[] {
  const r = anteriores.map((p) => ({ ...p }));
  for (const n of nuevos) {
    // Lo pedido por dinero ("10 pesos de ajo") se suma en pesos; lo pedido por cantidad, en cantidad.
    const igual = r.find((p) => normalizar(p.nombre) === normalizar(n.nombre) && (p.unidad ?? null) === (n.unidad ?? null) && Boolean(p.monto) === Boolean(n.monto));
    if (igual && n.monto) igual.monto = (igual.monto ?? 0) + n.monto;
    else if (igual) igual.cantidad += n.cantidad;
    else r.push({ nombre: n.nombre, cantidad: n.cantidad, unidad: n.unidad ?? null, monto: n.monto ?? null });
  }
  return r.slice(0, 60);
}

function infoColmado(colmado: Colmado) {
  return {
    nombre: colmado.nombre,
    direccion: colmado.direccion,
    horario: `${colmado.horaApertura || "08:00"} a ${colmado.horaCierre || "22:00"}`,
    costoDelivery: String(Number(colmado.costoDelivery ?? 0)),
    pagos: "efectivo, tarjeta o transferencia",
  };
}

// ---------- Pasos ----------

type Casa = typeof clienteDirecciones.$inferSelect;

/** La dirección guardada como "Casa" de este cliente, si tiene. */
async function casaDe(c: Contexto): Promise<Casa | null> {
  const cliente = c.sesion.clienteWhatsapp ? await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp) : undefined;
  if (!cliente) return null;
  const [casa] = await c.db.select().from(clienteDirecciones).where(and(eq(clienteDirecciones.clienteId, cliente.id), eq(clienteDirecciones.etiqueta, "Casa")));
  return casa ?? null;
}

function metros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

/** Productos del último pedido del cliente (para "repetir mi último pedido"). */
async function ultimoPedido(c: Contexto): Promise<Nuevo[]> {
  if (!c.sesion.clienteWhatsapp) return [];
  const [p] = await c.db.select({ productos: pedidos.productos }).from(pedidos)
    .where(and(eq(pedidos.colmadoId, c.colmado.id), eq(pedidos.clienteWhatsapp, c.sesion.clienteWhatsapp), ne(pedidos.estado, "cancelado")))
    .orderBy(desc(pedidos.id)).limit(1);
  if (!p) return [];
  let lista: unknown = p.productos;
  if (typeof lista === "string") { try { lista = JSON.parse(lista); } catch { lista = []; } }
  if (!Array.isArray(lista)) return [];
  return lista.filter((x) => x && typeof x.nombre === "string").slice(0, 60).map((x) => {
    const m = String(x.nombre).match(/^(.*) \(([^()]+)\)$/);
    // El monto de un pedido anterior es el precio que puso el colmado, no lo que pidió el cliente: no se copia.
    return { nombre: m ? m[1] : String(x.nombre), cantidad: Number(x.cantidad) > 0 ? Number(x.cantidad) : 1, unidad: m ? m[2] : null, monto: null };
  });
}

/** Siempre se pregunta a dónde va el pedido: el cliente puede estar hoy en otro lugar. */
async function pedirUbicacion(c: Contexto): Promise<Respuesta[]> {
  const casa = await casaDe(c);
  // Ya dijo "llévamelo a mi casa" mientras pedía.
  if (casa && c.sesion.destinoGuardado === "Casa") {
    await guardarSesion(c, { estadoConversacion: "esperando_pago" });
    return [{ texto: "🏠 Te lo llevamos a tu casa." }, pedirPago()];
  }
  await guardarSesion(c, { estadoConversacion: "esperando_ubicacion", destinoGuardado: null });
  // No se muestra la dirección guardada: el número no está verificado y sería un dato de otra persona.
  if (casa) return [{ texto: "¿A dónde te lo llevamos? 📍 Envíame tu ubicación actual o toca «A mi casa».", opciones: [BOTON_UBICACION, BOTON_CASA] }];
  return [{ texto: "¿A dónde te lo llevamos? 📍 Toca «Enviar mi ubicación» o escríbeme la dirección con alguna referencia.", opciones: [BOTON_UBICACION] }];
}

/** Recibe la ubicación del cliente; si está lejos de su casa guardada, pregunta a cuál de las dos va. */
async function recibirUbicacion(c: Contexto, latitud: number, longitud: number): Promise<Respuesta[]> {
  const casa = await casaDe(c);
  const lejos = casa?.latitud && casa.longitud && metros(latitud, longitud, Number(casa.latitud), Number(casa.longitud)) > METROS_LEJOS_DE_CASA;
  if (lejos) {
    await guardarSesion(c, { clienteLatitud: String(latitud), clienteLongitud: String(longitud), clienteDireccion: null, destinoGuardado: null, estadoConversacion: "eligiendo_destino" });
    return [{ texto: "📍 Veo que ahora estás en otro lugar. ¿Te lo llevamos ahí donde estás o a tu casa?", opciones: ELEGIR_DESTINO }];
  }
  await guardarSesion(c, { clienteLatitud: String(latitud), clienteLongitud: String(longitud), clienteDireccion: null, destinoGuardado: null, estadoConversacion: "esperando_pago" });
  return [{ texto: "📍 ¡Recibí tu ubicación!" }, pedirPago()];
}

async function irACasa(c: Contexto): Promise<Respuesta[]> {
  await guardarSesion(c, { destinoGuardado: "Casa", estadoConversacion: "esperando_pago" });
  return [{ texto: "🏠 Perfecto, te lo llevamos a tu casa." }, pedirPago()];
}

function pedirPago(): Respuesta {
  return { texto: "¿Cómo vas a pagar?", opciones: PAGOS };
}

async function crearElPedido(c: Contexto, metodo: I.Pago, montoPago: number | null): Promise<Respuesta[]> {
  const productos = productosDe(c.sesion);
  const casa = c.sesion.destinoGuardado === "Casa" ? await casaDe(c) : null;
  const latitud = casa ? casa.latitud : c.sesion.clienteLatitud ?? null;
  const longitud = casa ? casa.longitud : c.sesion.clienteLongitud ?? null;
  const texto = (casa ? casa.direccionTexto : c.sesion.clienteDireccion)?.trim();
  const base = texto || (latitud ? `Ubicación compartida: https://maps.google.com/?q=${latitud},${longitud}` : "Sin dirección");
  // El colmado ve la dirección completa; al cliente solo se le dice "tu casa".
  const direccion = casa ? `🏠 Casa (guardada): ${base}` : base;
  const pedido = await createPedido(c.db, {
    colmadoId: c.colmado.id,
    clienteNombre: c.sesion.clienteNombre || "Cliente",
    clienteWhatsapp: c.sesion.clienteWhatsapp || "",
    clienteUbicacion: direccion,
    clienteLatitud: latitud,
    clienteLongitud: longitud,
    // "10 pesos de ajo": el colmado lo ve en el nombre y con ese precio ya puesto.
    productos: JSON.stringify(productos.map((p) => p.monto
      ? { nombre: `${p.nombre} (RD$${p.monto})`, cantidad: 1, monto: p.monto }
      : { nombre: p.unidad ? `${p.nombre} (${p.unidad})` : p.nombre, cantidad: p.cantidad, monto: null })),
    total: "0",
    metodoPago: metodo,
    montoPago: montoPago ? String(montoPago) : "0",
    necesitaDevuelta: metodo === "efectivo" && Boolean(montoPago),
    estado: "pendiente_confirmacion",
    notas: "Pedido hecho en el chat de la página",
  } as any);
  await guardarSesion(c, { pedidoId: pedido.id, estado: "pedido_creado", estadoConversacion: "pedido_creado", metodoPagoSeleccionado: metodo, montoPagoCliente: montoPago ? String(montoPago) : null });
  // La última dirección usada queda en la ficha del cliente (el colmado la ve en su panel).
  let ofrecerCasa = false;
  if (c.sesion.clienteWhatsapp) {
    const cliente = await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp);
    if (cliente) {
      await c.db.update(clientes).set({
        direccionTexto: texto || cliente.direccionTexto, latitud: latitud || cliente.latitud,
        longitud: longitud || cliente.longitud, ultimaActualizacion: new Date(),
      }).where(eq(clientes.id, cliente.id));
      // Primera vez con dirección: se le ofrece guardarla como su casa.
      ofrecerCasa = !casa && Boolean(texto || latitud) && !(await casaDe(c));
    }
  }
  if (ofrecerCasa) await guardarSesion(c, { estadoConversacion: "ofreciendo_casa" });
  if (c.sesion.conversacionId) await updateConversacionPedidoEstado(c.db, c.sesion.conversacionId, "pendiente_confirmacion");
  await avisarNegocio(c.env, c.colmado.id, ["pedidos", "conversaciones"]);

  const pago = metodo === "efectivo"
    ? (montoPago ? `💵 Efectivo — pagas con ${dinero(montoPago)} (te llevamos la devuelta)` : "💵 Efectivo — pagas el monto exacto")
    : metodo === "tarjeta" ? "💳 Tarjeta" : "🏦 Transferencia — cuando el colmado te confirme el total, envía la foto del comprobante con el botón 📷";
  const nombre = primerNombre(c.sesion);
  return [{
    texto: `✅ ¡Listo${nombre ? `, ${nombre}` : ""}! Este es tu pedido #${pedido.id}:\n${lista(productos)}\n\n${casa ? "🏠 Tu casa (dirección guardada)" : `📍 ${direccion.startsWith("Ubicación compartida") ? "Tu ubicación compartida" : direccion}`}\n${pago}\n\n⏳ *${c.colmado.nombre}* está verificando tu pedido y te confirma el total por aquí.`,
  }, ...(ofrecerCasa ? [{ texto: "¿Guardo esta dirección como tu casa? 🏠 Así la próxima vez solo me dices «a mi casa».", opciones: [{ texto: "Sí, es mi casa" }, { texto: "No, gracias" }] }] : [])];
}

const SI_NO: Opcion[] = [{ texto: "Sí, acepto" }, { texto: "No, quítalo" }];

/** Respuesta del cliente al cambio de producto que propuso el colmado. null = el mensaje no era un sí ni un no. */
async function responderSustitucion(c: Contexto, pedido: typeof pedidos.$inferSelect, texto: string): Promise<Respuesta[] | null> {
  const todas = Array.isArray(pedido.sustituciones) ? pedido.sustituciones : [];
  const actual = todas.find((s) => s.estado === "pendiente");
  if (!actual) return null;
  const t = normalizar(texto).replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
  const no = I.esNegativo(texto) || /^(no|nop|nah|mejor no|quitalo|quitala|quita|remueve|sin eso|sin ese)\b/.test(t);
  const si = !no && (I.esAfirmativo(texto) || /^(si|sii+|sip|ok|okay|dale|claro|acepto|aceptado|esta bien|ta bien|bueno|va)\b/.test(t));
  const pregunta = (s: { original: string; nuevo: string }) => `No tenemos *${s.original}* disponible.\n\n🔄 Te ofrecemos: *${s.nuevo}*\n\n¿Aceptas este cambio?`;
  if (!si && !no) return [{ texto: `Para seguir con tu pedido necesito tu respuesta 🙏\n\n${pregunta(actual)}`, opciones: SI_NO }];

  const nuevas = todas.map((s) => (s === actual ? { ...s, estado: si ? "aceptada" as const : "rechazada" as const } : s));
  let productos: any[] = [];
  try { const leidos = typeof pedido.productos === "string" ? JSON.parse(pedido.productos) : pedido.productos; if (Array.isArray(leidos)) productos = leidos; } catch { /* se deja vacío */ }
  const esElProducto = (p: any) => normalizar(String(p?.nombre || p?.name || "")) === normalizar(actual.original);
  let total = Number(pedido.totalConfirmado || pedido.total) || 0;
  if (si) productos = productos.map((p) => (esElProducto(p) ? { ...p, nombre: actual.nuevo } : p));
  else {
    const quitado = productos.find(esElProducto);
    const resta = Number(actual.monto) || (quitado ? (Number(quitado.monto ?? quitado.precio) || 0) * (Number(quitado.cantidad) || 1) : 0);
    productos = productos.filter((p) => !esElProducto(p));
    total = Math.max(0, total - resta);
  }
  const siguiente = nuevas.find((s) => s.estado === "pendiente");
  await c.db.update(pedidos).set({
    sustituciones: nuevas, productos: JSON.stringify(productos), total: total.toFixed(2), totalConfirmado: total.toFixed(2),
    ...(siguiente ? {} : { estado: "pendiente" }),
  }).where(and(eq(pedidos.id, pedido.id), eq(pedidos.estado, "esperando_confirmacion_sustituciones")));
  const inicio = si ? "✅ Perfecto, aceptaste el cambio." : `👍 Entendido, quitamos *${actual.original}* de tu pedido.`;
  if (siguiente) return [{ texto: `${inicio}\n\n📋 *Siguiente cambio:*\n${pregunta(siguiente)}`, opciones: SI_NO }];

  if (c.sesion.conversacionId) await updateConversacionPedidoEstado(c.db, c.sesion.conversacionId, "pendiente");
  await avisarNegocio(c.env, c.colmado.id, ["pedidos", "conversaciones"]);
  const pagaCon = Number(pedido.montoPago) || 0;
  const pago = pedido.metodoPago === "efectivo"
    ? (pagaCon > total ? `💵 Pagas con ${dinero(pagaCon)} — tu devuelta: ${dinero(pagaCon - total)}` : "💵 Pago en efectivo")
    : pedido.metodoPago === "transferencia" ? "🏦 Transferencia — envía la foto del comprobante con el botón 📷" : pedido.metodoPago === "tarjeta" ? "💳 Tarjeta" : "";
  return [{ texto: `${inicio}\n\n✅ *¡Pedido #${pedido.id} listo!*\n*💵 Total a pagar: ${dinero(total)}*${pago ? `\n${pago}` : ""}\n\n${c.colmado.nombre} ya lo está preparando. 🛵` }];
}

/** Anota productos y responde "¿Algo más?". */
async function anotar(c: Contexto, nuevos: Nuevo[], prefijo = ""): Promise<Respuesta> {
  const todos = sumar(productosDe(c.sesion), nuevos);
  await guardarSesion(c, { productosCapturados: todos as any, estadoConversacion: "tomando_pedido" });
  return { texto: `${prefijo}Anotado ✍️\n${lista(nuevos.map((n) => ({ ...n, unidad: n.unidad ?? null, monto: n.monto ?? null })))}\n\n¿Algo más?`, opciones: [{ texto: "Eso es todo" }] };
}

async function noEntendido(c: Contexto, texto: string): Promise<Respuesta> {
  await anotarMetrica(c, "sinEntender");
  await c.db.insert(botNoEntendidos).values({ colmadoId: c.colmado.id, texto: texto.slice(0, 300) }).catch(() => undefined);
  const algo = productosDe(c.sesion).length > 0;
  return { texto: algo
    ? "Perdona, no te entendí bien 🙏 ¿Quieres agregar algo más o eso es todo?"
    : "Perdona, no te entendí bien 🙏 Escríbeme lo que necesitas, por ejemplo: «2 libras de arroz y un aceite».",
    opciones: algo ? [{ texto: "Eso es todo" }] : undefined };
}

/** Cuando las reglas no alcanzan: IA de Cloudflare, y lo que entienda se le enseña al diccionario. */
async function conIa(c: Contexto, texto: string, paso: string): Promise<Respuesta | null> {
  const r = await interpretar(c.env, { mensaje: texto, colmado: infoColmado(c.colmado), paso });
  if (!r) return null;
  await anotarMetrica(c, "conIa");
  await c.db.insert(botNoEntendidos).values({ colmadoId: c.colmado.id, texto: texto.slice(0, 300), resueltoConIa: true }).catch(() => undefined);
  if (r.tipo === "productos" && r.productos.length) {
    for (const p of r.productos) {
      if (p.jergaOriginal && normalizar(p.jergaOriginal) !== normalizar(p.nombre)) {
        await aprenderJerga(c.db, c.colmado, p.jergaOriginal, p.nombre).catch(() => undefined);
      }
    }
    return anotar(c, r.productos.map((p) => ({ nombre: p.nombre, cantidad: p.cantidad ?? 1, unidad: p.unidad })));
  }
  if (r.respuesta) {
    const algo = productosDe(c.sesion).length > 0;
    return { texto: `${r.respuesta}\n\n${algo ? "¿Algo más para tu pedido?" : "¿Qué te gustaría pedir?"}`, opciones: algo ? [{ texto: "Eso es todo" }] : undefined };
  }
  return null;
}

/** Preguntas frecuentes que se contestan sin IA en cualquier paso. */
function preguntaFrecuente(c: Contexto, texto: string, timezone: string): string | null {
  if (I.esPreguntaHorario(texto)) {
    const { abierto } = isColmadoAbierto(c.colmado, timezone);
    return `🕒 Abrimos de ${c.colmado.horaApertura || "08:00"} a ${c.colmado.horaCierre || "22:00"}.${abierto ? " Ahora mismo estamos abiertos." : " Ahora mismo estamos cerrados."}`;
  }
  if (I.esPreguntaDelivery(texto)) {
    const costo = Number(c.colmado.costoDelivery ?? 0);
    return `🛵 Sí, llevamos a domicilio${costo > 0 ? `. El delivery cuesta ${dinero(costo)}` : ""}${c.colmado.tiempoEstimado ? ` y tarda unos ${c.colmado.tiempoEstimado}` : ""}.`;
  }
  if (I.esPreguntaUbicacionColmado(texto)) return `📍 Estamos en ${c.colmado.direccion}.`;
  return null;
}

/** Lo que se le vuelve a preguntar después de contestar una pregunta frecuente. */
function recordatorio(c: Contexto): Respuesta | null {
  switch (c.sesion.estadoConversacion) {
    case "confirmando": return { texto: "¿Eso es todo?", opciones: [{ texto: "Sí, eso es todo" }, { texto: "Agregar más" }] };
    case "esperando_ubicacion": return { texto: "¿A dónde te lo llevamos?", opciones: [BOTON_UBICACION] };
    case "eligiendo_destino": return { texto: "¿Te lo llevamos ahí donde estás o a tu casa?", opciones: ELEGIR_DESTINO };
    case "ofreciendo_casa": return null;
    case "esperando_pago": return pedirPago();
    case "esperando_monto": return { texto: "¿Con cuánto vas a pagar?", opciones: [{ texto: "Exacto" }, { texto: "500" }, { texto: "1000" }, { texto: "2000" }] };
    case "pedido_creado": return null;
    default: return { texto: productosDe(c.sesion).length ? "¿Algo más para tu pedido?" : "¿Qué te gustaría pedir?" };
  }
}

// ---------- Entrada principal ----------

export async function atenderChat(c: Contexto, entrada: Entrada): Promise<Respuesta[]> {
  await anotarMetrica(c, "mensajes");
  const texto = entrada.tipo === "texto" ? entrada.texto.trim() : "";
  if (c.sesion.conversacionId && texto) await addMensaje(c.db, c.sesion.conversacionId, "user", texto);
  if (c.sesion.conversacionId && entrada.tipo === "ubicacion") await addMensaje(c.db, c.sesion.conversacionId, "user", "[Ubicación compartida 📍]");

  const respuestas = await responder(c, entrada, texto);
  if (c.sesion.conversacionId) for (const r of respuestas) await addMensaje(c.db, c.sesion.conversacionId, "assistant", r.texto);
  return respuestas;
}

async function responder(c: Contexto, entradaOriginal: Entrada, textoOriginal: string): Promise<Respuesta[]> {
  let entrada = entradaOriginal;
  let texto = textoOriginal;
  const timezone = await getColmadoTimezone(c.db, c.colmado);
  const nombre = primerNombre(c.sesion);
  const saludo = `${I.saludoPorHora(timezone)}${nombre ? `, ${nombre}` : ""} 👋`;
  const primera = c.respuestasPrevias === 0;
  // "finalizado" y "esperando_confirmacion_sustitucion" los pone el panel al confirmar el pedido: el pedido sigue vivo.
  const guardado = c.sesion.estadoConversacion || "inicial";
  const estado = c.sesion.pedidoId && ["finalizado", "esperando_confirmacion_sustitucion"].includes(guardado) ? "pedido_creado" : guardado;

  // Después del pedido se le ofreció guardar la dirección como su casa.
  if (estado === "ofreciendo_casa") {
    await guardarSesion(c, { estadoConversacion: "pedido_creado" });
    if (entrada.tipo === "texto" && I.esNegativo(texto)) return [{ texto: "Dale 👍 Te aviso por aquí cuando el colmado confirme tu pedido." }];
    if (entrada.tipo === "texto" && (I.esAfirmativo(texto) || /\bcasa\b/.test(normalizar(texto)))) {
      const cliente = c.sesion.clienteWhatsapp ? await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp) : undefined;
      if (cliente && (c.sesion.clienteDireccion || c.sesion.clienteLatitud)) {
        const datos = { direccionTexto: c.sesion.clienteDireccion ?? null, latitud: c.sesion.clienteLatitud ?? null, longitud: c.sesion.clienteLongitud ?? null, ultimaActualizacion: new Date() };
        await c.db.insert(clienteDirecciones).values({ clienteId: cliente.id, etiqueta: "Casa", ...datos })
          .onConflictDoUpdate({ target: [clienteDirecciones.clienteId, clienteDirecciones.etiqueta], set: datos });
        return [{ texto: "🏠 ¡Guardada! La próxima vez dime «a mi casa» y te lo llevamos ahí." }];
      }
    }
    return responder(c, entrada, texto);
  }

  // Colmado cerrado: se avisa (no se toma el pedido).
  if (estado !== "pedido_creado") {
    const { abierto, mensaje } = isColmadoAbierto(c.colmado, timezone);
    if (!abierto) return [{ texto: `${saludo}\n\n${mensaje}` }];
  }

  // Después del pedido.
  if (estado === "pedido_creado") {
    const [pedido] = c.sesion.pedidoId ? await c.db.select().from(pedidos).where(eq(pedidos.id, c.sesion.pedidoId)) : [];
    const cerrado = !pedido || ESTADOS_TERMINALES.includes(pedido.estado);
    if (cerrado && entrada.tipo === "texto" && !I.esGracias(texto) && !I.esEstado(texto)) {
      // Pedido terminado: empieza uno nuevo.
      await guardarSesion(c, { productosCapturados: [] as any, estadoConversacion: "tomando_pedido", pedidoId: null, estado: "activa", metodoPagoSeleccionado: null, montoPagoCliente: null,
        clienteDireccion: null, clienteLatitud: null, clienteLongitud: null, destinoGuardado: null });
      return responder(c, entrada, texto);
    }
    // El colmado ofreció cambiar un producto que no tiene: el cliente responde sí o no.
    if (pedido?.estado === "esperando_confirmacion_sustituciones" && entrada.tipo === "texto") {
      const r = await responderSustitucion(c, pedido, texto);
      if (r) return r;
    }
    if (I.esEstado(texto) && pedido) return [{ texto: `Tu pedido #${pedido.id}: ${ESTADOS_LEGIBLES[pedido.estado] ?? pedido.estado}.` }];
    if (I.esGracias(texto)) return [{ texto: `¡A la orden${nombre ? `, ${nombre}` : ""}! 🙌` }];
    const faq = preguntaFrecuente(c, texto, timezone);
    if (faq) return [{ texto: faq }];
    if (I.esCancelar(texto) && pedido) return [{ texto: `Le aviso a ${c.colmado.nombre} que quieres cancelar el pedido #${pedido.id}. Te confirman por aquí. 👍` }];
    return [{ texto: `Le pasé tu mensaje a ${c.colmado.nombre} 👍 Te responden por aquí.` }];
  }

  // Cancelar antes de terminar: se borra lo anotado.
  if (I.esCancelar(texto)) {
    await guardarSesion(c, { productosCapturados: [] as any, estadoConversacion: "tomando_pedido", clienteDireccion: null, clienteLatitud: null, clienteLongitud: null, destinoGuardado: null });
    return [{ texto: "Listo, borré lo que llevábamos. Cuando quieras, escríbeme lo que necesitas. 👍" }];
  }

  // "Llévamelo a mi casa" mientras pide: se recuerda y esa frase no se lee como producto.
  if (entrada.tipo === "texto" && ["inicial", "tomando_pedido", "confirmando"].includes(estado)) {
    const q = I.quitarCasa(texto);
    if (q.casa) {
      const casa = await casaDe(c);
      if (casa) await guardarSesion(c, { destinoGuardado: "Casa" });
      if (!q.texto) {
        const sigue = recordatorio(c);
        const aviso = casa ? "🏠 Perfecto, te lo llevamos a tu casa." : "Todavía no tengo guardada tu casa 🙏 Cuando termines de pedir me envías la ubicación.";
        return [{ texto: primera ? `${saludo}\n\n${aviso}` : aviso }, ...(sigue ? [sigue] : [])];
      }
      texto = q.texto;
      entrada = { tipo: "texto", texto };
    }
  }

  // Preguntas frecuentes en cualquier paso (sin IA).
  if (entrada.tipo === "texto") {
    const faq = preguntaFrecuente(c, texto, timezone);
    if (faq && !leerPedido(texto, new Map()).some((i) => i.conocido)) {
      const siguiente = recordatorio(c);
      const r: Respuesta[] = [{ texto: primera ? `${saludo}\n\n${faq}` : faq }];
      if (siguiente) r.push(siguiente);
      return r;
    }
  }

  switch (estado) {
    case "inicial":
    case "tomando_pedido": {
      if (entrada.tipo === "ubicacion") {
        await guardarSesion(c, { clienteLatitud: String(entrada.latitud), clienteLongitud: String(entrada.longitud) });
        return [{ texto: "📍 ¡Recibí tu ubicación! Ahora dime qué necesitas." }];
      }
      const hayAnotado = productosDe(c.sesion).length > 0;
      if (I.esSaludo(texto)) {
        await guardarSesion(c, { estadoConversacion: "tomando_pedido" });
        const repetir = primera && !hayAnotado && c.aparatoConocido && (await ultimoPedido(c)).length > 0;
        return [{ texto: primera ? `${saludo}\n¿En qué te puedo ayudar?` : hayAnotado ? "¿Algo más para tu pedido?" : "¿Qué te gustaría pedir?", opciones: repetir ? [BOTON_REPETIR] : undefined }];
      }
      if (I.esRepetir(texto)) {
        const antes = primera ? `${saludo}\n\n` : "";
        // Solo desde el mismo aparato: el número no está verificado y el pedido anterior es de esa persona.
        if (!c.aparatoConocido) return [{ texto: `${antes}Por seguridad solo puedo repetir tu pedido anterior desde el mismo teléfono donde lo hiciste 🙏 Dime qué necesitas y te lo anoto.` }];
        const anteriores = await ultimoPedido(c);
        if (!anteriores.length) return [{ texto: `${antes}No encuentro un pedido anterior tuyo 🙏 Dime qué necesitas y te lo anoto.` }];
        const r = await anotar(c, anteriores, antes);
        return [{ ...r, texto: r.texto.replace("Anotado ✍️", "Tu último pedido 🔁") }];
      }
      if (hayAnotado && I.esFinDelPedido(texto) && /todo|solo eso/.test(normalizar(texto))) {
        await guardarSesion(c, { estadoConversacion: "confirmando" });
        return pedirUbicacion(c);
      }
      if (hayAnotado && (I.esNegativo(texto) || I.esFinDelPedido(texto))) {
        await guardarSesion(c, { estadoConversacion: "confirmando" });
        return [{ texto: `Perfecto. Esto es lo que tengo anotado:\n${lista(productosDe(c.sesion))}\n\n¿Eso es todo?`, opciones: [{ texto: "Sí, eso es todo" }, { texto: "Agregar más" }] }];
      }
      if (hayAnotado && I.esAfirmativo(texto)) return [{ texto: "Dale, ¿qué más te anoto?" }];
      if (I.esGracias(texto)) return [{ texto: `¡A la orden! ${hayAnotado ? "¿Algo más para tu pedido?" : "¿Qué te gustaría pedir?"}` }];

      const pre = primera ? `${saludo}\n\n` : "";
      const porPregunta = I.preguntaPorProducto(texto);
      const jerga = await jergaParaLeer(c);
      if (porPregunta) {
        const items = leerPedido(porPregunta, jerga);
        if (items.length) {
          const r = await anotar(c, items, pre);
          return [{ ...r, texto: r.texto.replace("Anotado ✍️", "Te lo anoto ✍️ (el colmado te confirma si hay)") }];
        }
      }
      const items = I.pareceConversacion(texto) ? leerPedido(texto, jerga).filter((i) => i.conocido) : leerPedido(texto, jerga);
      const entendidos = items.filter((i) => i.conocido).length;
      // Muchas palabras sin reconocer en un mensaje largo: mejor que lo lea la IA.
      const dudoso = items.length > 0 && entendidos === 0 && texto.split(/\s+/).length >= 8;
      if (items.length && !dudoso) return [await anotar(c, items, pre)];

      const ia = await conIa(c, texto, hayAnotado ? "anotando el pedido" : "inicio de la conversación");
      if (ia) return [{ ...ia, texto: `${pre}${ia.texto}` }];
      if (items.length) return [await anotar(c, items, pre)];
      const no = await noEntendido(c, texto);
      return [{ ...no, texto: `${pre}${no.texto}` }];
    }

    case "confirmando": {
      if (entrada.tipo === "ubicacion") return recibirUbicacion(c, entrada.latitud, entrada.longitud);
      if (I.esAfirmativo(texto) || I.esFinDelPedido(texto) || /^si/.test(normalizar(texto))) return pedirUbicacion(c);
      if (I.esNegativo(texto) || I.esAgregarMas(texto)) {
        await guardarSesion(c, { estadoConversacion: "tomando_pedido" });
        return [{ texto: "Dale, ¿qué más te anoto?" }];
      }
      const items = leerPedido(texto, await jergaParaLeer(c));
      if (items.length) {
        const todos = sumar(productosDe(c.sesion), items);
        await guardarSesion(c, { productosCapturados: todos as any });
        return [{ texto: `Anotado ✍️ Ahora tengo:\n${lista(todos)}\n\n¿Eso es todo?`, opciones: [{ texto: "Sí, eso es todo" }, { texto: "Agregar más" }] }];
      }
      return [{ texto: "¿Eso es todo?", opciones: [{ texto: "Sí, eso es todo" }, { texto: "Agregar más" }] }];
    }

    case "confirmando_direccion": // pasos de versiones anteriores
    case "esperando_ubicacion": {
      if (entrada.tipo === "ubicacion") return recibirUbicacion(c, entrada.latitud, entrada.longitud);
      if (I.esCasa(texto)) {
        if (await casaDe(c)) return irACasa(c);
        return [{ texto: "Todavía no tengo guardada tu casa 🙏 Toca «Enviar mi ubicación» o escríbeme la dirección con una referencia.", opciones: [BOTON_UBICACION] }];
      }
      if (texto.length >= 8 && !I.esNegativo(texto)) {
        await guardarSesion(c, { clienteDireccion: texto.slice(0, 300), clienteLatitud: null, clienteLongitud: null, destinoGuardado: null, estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 Anotada la dirección." }, pedirPago()];
      }
      if (estado !== "esperando_ubicacion") await guardarSesion(c, { estadoConversacion: "esperando_ubicacion" });
      return [{ texto: "Necesito saber a dónde llevarlo 🙏 Toca «Enviar mi ubicación» o escríbeme la dirección con una referencia (calle, número, sector).", opciones: [BOTON_UBICACION] }];
    }

    case "eligiendo_destino": {
      if (entrada.tipo === "ubicacion") {
        await guardarSesion(c, { clienteLatitud: String(entrada.latitud), clienteLongitud: String(entrada.longitud), clienteDireccion: null, destinoGuardado: null, estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 ¡Recibí tu ubicación!" }, pedirPago()];
      }
      if (I.esCasa(texto) || /\bcasa\b/.test(normalizar(texto))) return irACasa(c);
      if (I.esAqui(texto) || I.esAfirmativo(texto)) {
        await guardarSesion(c, { destinoGuardado: null, estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 Listo, te lo llevamos ahí donde estás." }, pedirPago()];
      }
      return [{ texto: "¿Te lo llevamos ahí donde estás o a tu casa? Toca una opción:", opciones: ELEGIR_DESTINO }];
    }

    case "esperando_pago": {
      const pago = I.leerPago(texto);
      if (!pago) return [{ texto: "¿Cómo vas a pagar? Toca una opción:", opciones: PAGOS }];
      if (pago === "efectivo") {
        await guardarSesion(c, { metodoPagoSeleccionado: "efectivo", estadoConversacion: "esperando_monto" });
        return [{ texto: "¿Con cuánto vas a pagar? Así te llevamos la devuelta. 💵", opciones: [{ texto: "Exacto" }, { texto: "500" }, { texto: "1000" }, { texto: "2000" }] }];
      }
      return crearElPedido(c, pago, null);
    }

    case "esperando_monto": {
      const monto = I.leerMonto(texto);
      if (monto === null) return [{ texto: "¿Con cuánto vas a pagar? Escríbeme el monto, por ejemplo 500 o 1000, o «exacto».", opciones: [{ texto: "Exacto" }, { texto: "500" }, { texto: "1000" }, { texto: "2000" }] }];
      return crearElPedido(c, "efectivo", monto || null);
    }

    default:
      await guardarSesion(c, { estadoConversacion: "tomando_pedido" });
      return responder(c, entrada, texto);
  }
}
