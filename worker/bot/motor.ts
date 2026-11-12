import { eq, sql } from "drizzle-orm";
import { botNoEntendidos, botRegistro, chatWebSesiones, clientes, diccionarioJerga, pedidos, type ChatWebSesion, type Colmado } from "@shared/schema";
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

type Anotado = { nombre: string; cantidad: number; unidad: string | null; monto: null };

type Contexto = {
  env: Env;
  db: Db;
  colmado: Colmado;
  sesion: ChatWebSesion;
  /** Cuántas veces ha respondido ya el bot en esta sesión (la primera lleva el saludo). */
  respuestasPrevias: number;
};

const PAGOS: Opcion[] = [{ texto: "💵 Efectivo" }, { texto: "💳 Tarjeta" }, { texto: "🏦 Transferencia" }];
const BOTON_UBICACION: Opcion = { texto: "📍 Enviar mi ubicación", accion: "ubicacion" };
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
function sumar(anteriores: Anotado[], nuevos: Array<Pick<Item, "nombre" | "cantidad" | "unidad">>): Anotado[] {
  const r = anteriores.map((p) => ({ ...p }));
  for (const n of nuevos) {
    const igual = r.find((p) => normalizar(p.nombre) === normalizar(n.nombre) && (p.unidad ?? null) === (n.unidad ?? null));
    if (igual) igual.cantidad += n.cantidad;
    else r.push({ nombre: n.nombre, cantidad: n.cantidad, unidad: n.unidad ?? null, monto: null });
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

async function pedirUbicacion(c: Contexto, cliente: Awaited<ReturnType<typeof getClienteByWhatsapp>>): Promise<Respuesta> {
  // No se muestra la dirección guardada: el número no está verificado y sería un dato de otra persona.
  if (cliente && (cliente.direccionTexto || cliente.latitud)) {
    await guardarSesion(c, { estadoConversacion: "confirmando_direccion" });
    return { texto: "¿Te lo llevamos a la misma dirección de tu último pedido?", opciones: [{ texto: "Sí, a la misma" }, BOTON_UBICACION] };
  }
  await guardarSesion(c, { estadoConversacion: "esperando_ubicacion" });
  return { texto: "¿A dónde te lo llevamos? 📍 Toca «Enviar mi ubicación» o escríbeme la dirección con alguna referencia.", opciones: [BOTON_UBICACION] };
}

function pedirPago(): Respuesta {
  return { texto: "¿Cómo vas a pagar?", opciones: PAGOS };
}

async function crearElPedido(c: Contexto, metodo: I.Pago, montoPago: number | null): Promise<Respuesta[]> {
  const productos = productosDe(c.sesion);
  const direccion = c.sesion.clienteDireccion?.trim()
    || (c.sesion.clienteLatitud ? `Ubicación compartida: https://maps.google.com/?q=${c.sesion.clienteLatitud},${c.sesion.clienteLongitud}` : "Sin dirección");
  const pedido = await createPedido(c.db, {
    colmadoId: c.colmado.id,
    clienteNombre: c.sesion.clienteNombre || "Cliente",
    clienteWhatsapp: c.sesion.clienteWhatsapp || "",
    clienteUbicacion: direccion,
    clienteLatitud: c.sesion.clienteLatitud ?? null,
    clienteLongitud: c.sesion.clienteLongitud ?? null,
    productos: JSON.stringify(productos.map((p) => ({ nombre: p.unidad ? `${p.nombre} (${p.unidad})` : p.nombre, cantidad: p.cantidad, monto: null }))),
    total: "0",
    metodoPago: metodo,
    montoPago: montoPago ? String(montoPago) : "0",
    necesitaDevuelta: metodo === "efectivo" && Boolean(montoPago),
    estado: "pendiente_confirmacion",
    notas: "Pedido hecho en el chat de la página",
  } as any);
  await guardarSesion(c, { pedidoId: pedido.id, estado: "pedido_creado", estadoConversacion: "pedido_creado", metodoPagoSeleccionado: metodo, montoPagoCliente: montoPago ? String(montoPago) : null });
  // La dirección queda guardada para el próximo pedido.
  if (c.sesion.clienteWhatsapp) {
    const cliente = await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp);
    if (cliente) {
      await c.db.update(clientes).set({
        direccionTexto: c.sesion.clienteDireccion || cliente.direccionTexto, latitud: c.sesion.clienteLatitud || cliente.latitud,
        longitud: c.sesion.clienteLongitud || cliente.longitud, ultimaActualizacion: new Date(),
      }).where(eq(clientes.id, cliente.id));
    }
  }
  if (c.sesion.conversacionId) await updateConversacionPedidoEstado(c.db, c.sesion.conversacionId, "pendiente_confirmacion");
  await avisarNegocio(c.env, c.colmado.id, ["pedidos", "conversaciones"]);

  const pago = metodo === "efectivo"
    ? (montoPago ? `💵 Efectivo — pagas con ${dinero(montoPago)} (te llevamos la devuelta)` : "💵 Efectivo — pagas el monto exacto")
    : metodo === "tarjeta" ? "💳 Tarjeta" : "🏦 Transferencia — cuando el colmado te confirme el total, envía la foto del comprobante con el botón 📷";
  const nombre = primerNombre(c.sesion);
  return [{
    texto: `✅ ¡Listo${nombre ? `, ${nombre}` : ""}! Este es tu pedido #${pedido.id}:\n${lista(productos)}\n\n📍 ${direccion.startsWith("Ubicación compartida") ? "Tu ubicación compartida" : direccion}\n${pago}\n\n⏳ *${c.colmado.nombre}* está verificando tu pedido y te confirma el total por aquí.`,
  }];
}

/** Anota productos y responde "¿Algo más?". */
async function anotar(c: Contexto, nuevos: Array<Pick<Item, "nombre" | "cantidad" | "unidad">>, prefijo = ""): Promise<Respuesta> {
  const todos = sumar(productosDe(c.sesion), nuevos);
  await guardarSesion(c, { productosCapturados: todos as any, estadoConversacion: "tomando_pedido" });
  return { texto: `${prefijo}Anotado ✍️\n${lista(nuevos.map((n) => ({ ...n, unidad: n.unidad ?? null, monto: null })))}\n\n¿Algo más?`, opciones: [{ texto: "Eso es todo" }] };
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
    case "confirmando_direccion": return { texto: "¿Te lo llevamos a la misma dirección de tu último pedido?", opciones: [{ texto: "Sí, a la misma" }, BOTON_UBICACION] };
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

async function responder(c: Contexto, entrada: Entrada, texto: string): Promise<Respuesta[]> {
  const timezone = await getColmadoTimezone(c.db, c.colmado);
  const nombre = primerNombre(c.sesion);
  const saludo = `${I.saludoPorHora(timezone)}${nombre ? `, ${nombre}` : ""} 👋`;
  const primera = c.respuestasPrevias === 0;
  const estado = c.sesion.estadoConversacion || "inicial";

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
      await guardarSesion(c, { productosCapturados: [] as any, estadoConversacion: "tomando_pedido", pedidoId: null, estado: "activa", metodoPagoSeleccionado: null, montoPagoCliente: null });
      return responder(c, entrada, texto);
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
    await guardarSesion(c, { productosCapturados: [] as any, estadoConversacion: "tomando_pedido", clienteDireccion: null, clienteLatitud: null, clienteLongitud: null });
    return [{ texto: "Listo, borré lo que llevábamos. Cuando quieras, escríbeme lo que necesitas. 👍" }];
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
        return [{ texto: primera ? `${saludo}\n¿En qué te puedo ayudar?` : hayAnotado ? "¿Algo más para tu pedido?" : "¿Qué te gustaría pedir?" }];
      }
      if (hayAnotado && I.esFinDelPedido(texto) && /todo|solo eso/.test(normalizar(texto))) {
        await guardarSesion(c, { estadoConversacion: "confirmando" });
        return [await pedirUbicacion(c, await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp || ""))];
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
      if (entrada.tipo === "ubicacion") {
        await guardarSesion(c, { clienteLatitud: String(entrada.latitud), clienteLongitud: String(entrada.longitud), clienteDireccion: null, estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 ¡Recibí tu ubicación!" }, pedirPago()];
      }
      if (I.esAfirmativo(texto) || I.esFinDelPedido(texto) || /^si/.test(normalizar(texto))) {
        return [await pedirUbicacion(c, await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp || ""))];
      }
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

    case "confirmando_direccion": {
      if (entrada.tipo === "ubicacion") {
        await guardarSesion(c, { clienteLatitud: String(entrada.latitud), clienteLongitud: String(entrada.longitud), clienteDireccion: null, estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 ¡Recibí tu ubicación!" }, pedirPago()];
      }
      if (I.esAfirmativo(texto) || /^si/.test(normalizar(texto)) || /misma/.test(normalizar(texto))) {
        const cliente = await getClienteByWhatsapp(c.db, c.colmado.id, c.sesion.clienteWhatsapp || "");
        await guardarSesion(c, {
          clienteDireccion: cliente?.direccionTexto ?? null, clienteLatitud: cliente?.latitud ?? null, clienteLongitud: cliente?.longitud ?? null,
          estadoConversacion: "esperando_pago",
        });
        return [pedirPago()];
      }
      if (texto.length >= 8 && !I.esNegativo(texto)) {
        await guardarSesion(c, { clienteDireccion: texto.slice(0, 300), clienteLatitud: null, clienteLongitud: null, estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 Anotada la dirección." }, pedirPago()];
      }
      await guardarSesion(c, { estadoConversacion: "esperando_ubicacion" });
      return [{ texto: "¿A dónde te lo llevamos? 📍 Toca «Enviar mi ubicación» o escríbeme la dirección con alguna referencia.", opciones: [BOTON_UBICACION] }];
    }

    case "esperando_ubicacion": {
      if (entrada.tipo === "ubicacion") {
        await guardarSesion(c, { clienteLatitud: String(entrada.latitud), clienteLongitud: String(entrada.longitud), estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 ¡Recibí tu ubicación!" }, pedirPago()];
      }
      if (texto.length >= 8) {
        await guardarSesion(c, { clienteDireccion: texto.slice(0, 300), estadoConversacion: "esperando_pago" });
        return [{ texto: "📍 Anotada la dirección." }, pedirPago()];
      }
      return [{ texto: "Necesito saber a dónde llevarlo 🙏 Toca «Enviar mi ubicación» o escríbeme la dirección con una referencia (calle, número, sector).", opciones: [BOTON_UBICACION] }];
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
