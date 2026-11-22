import { Hono, type Context } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { subdominioDeSlug } from "@shared/subdominio";
import { clienteAparatos, colmados, type Colmado } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { checkZipFormat } from "../lib/zipValidation";
import { soloDigitos } from "../lib/telefono";
import { contarEventos, permitirEvento, registrarEvento } from "../lib/rate-limit";
import { turnstileDelLogin, verificarTurnstile } from "../lib/turnstile";
import { enrichColmadoWithMoneda, generateSlug, getColmado, getPais } from "../storage/colmados";
import { getMenuProductos } from "../storage/menu";
import {
  addMensaje, getClienteByWhatsapp, getConversacionByCliente, getOrCreateCliente, getOrCreateConversacion, updateConversacion,
  updateConversacionPedidoEstado,
} from "../storage/conversaciones";
import { createPedido, getPedidosByClienteWhatsapp } from "../storage/pedidos";
import { avisarPedidoNuevo } from "../lib/push";

export const menuGraficoRoutes = new Hono<AppEnv>();

/** El código del enlace puede ser el slug, "COLMADO{id}", el id o el nombre (enlaces viejos). */
export async function getColmadoByCodigo(db: Db, codigo: string): Promise<Colmado | undefined> {
  const [porSlug] = await db.select().from(colmados).where(eq(colmados.slug, codigo.toLowerCase()));
  if (porSlug) return porSlug;
  // Subdominio: colmadolasombrita.delywa.com → slug sin guiones.
  const compacto = subdominioDeSlug(codigo);
  if (compacto && compacto === codigo.toLowerCase()) {
    const [porSub] = await db.select().from(colmados).where(eq(sql`replace(${colmados.slug}, '-', '')`, compacto)).orderBy(asc(colmados.id)).limit(1);
    if (porSub) return porSub;
  }
  const legado = codigo.match(/^COLMADO(\d+)$/i);
  if (legado) {
    const c = await getColmado(db, Number(legado[1]));
    if (c) return c;
  }
  if (/^\d+$/.test(codigo)) {
    const c = await getColmado(db, Number(codigo));
    if (c) return c;
  }
  const buscado = generateSlug(codigo);
  if (!buscado) return undefined;
  const todos = await db.select().from(colmados);
  return todos.find((c) => generateSlug(c.nombre) === buscado);
}

async function validarZip(db: Db, paisId: number | null | undefined, direccion: string) {
  if (!paisId) return { zipOk: true } as ReturnType<typeof checkZipFormat>;
  return checkZipFormat(await getPais(db, paisId), direccion);
}

menuGraficoRoutes.get("/api/menu-grafico/colmado/:codigo", async (c) => {
  const db = getDb(c.env.DB);
  const colmado = await getColmadoByCodigo(db, c.req.param("codigo"));
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  const pais = colmado.paisId ? await getPais(db, colmado.paisId) : undefined;
  const formato = {
    etiquetaEstado: pais?.etiquetaEstado ?? "Provincia",
    etiquetaCodigoPostal: pais?.etiquetaCodigoPostal ?? null,
    requiereCodigoPostal: pais?.requiereCodigoPostal ?? false,
    ejemploDireccion: pais?.ejemploDireccion ?? "Calle Principal #123",
    ejemploCiudad: pais?.ejemploCiudad ?? "Santo Domingo",
    ejemploEstado: pais?.ejemploEstado ?? "Distrito Nacional",
    ejemploCodigoPostal: pais?.ejemploCodigoPostal ?? null,
    patronCodigoPostal: pais?.patronCodigoPostal ?? null,
    codigoPais: pais?.codigo ?? "DO",
  };
  return c.json({
    id: colmado.id,
    nombre: colmado.nombre,
    logo: colmado.logo,
    colorPrimario: colmado.colorPrimario,
    whatsappNumero: colmado.whatsappNumero,
    tipoNegocio: colmado.tipoNegocio,
    costoDelivery: colmado.costoDelivery,
    tiempoEstimado: colmado.tiempoEstimado,
    simboloMoneda: pais?.simboloMoneda || "RD$",
    ...formato,
  });
});

// ---------- Aparato conocido ----------
// El teléfono no está verificado: cualquiera puede escribir el número de otra persona. Por eso la
// dirección y los pedidos de un cliente solo se devuelven al navegador (aparato) desde el que ese
// número ya pidió en este negocio. La página manda su identificador al azar en X-Delywa-Aparato.

const aparatoDe = (c: Context<AppEnv>) => {
  const a = c.req.header("X-Delywa-Aparato") ?? "";
  return /^[0-9a-f]{32}$/.test(a) ? a : null;
};

async function aparatoConocido(db: Db, colmadoId: number, whatsapp: string, aparato: string | null): Promise<boolean> {
  if (!aparato) return false;
  const [fila] = await db.select({ id: clienteAparatos.id }).from(clienteAparatos)
    .where(and(eq(clienteAparatos.colmadoId, colmadoId), eq(clienteAparatos.telefono, soloDigitos(whatsapp)), eq(clienteAparatos.aparato, aparato))).limit(1);
  return Boolean(fila);
}

/** Topes de pedidos del menú gráfico (las pruebas los cambian). */
export const TOPES_PEDIDO = { porTelefono: 5, porConexion: 10, turnstileDesde: 3, ventanaMs: 60 * 60 * 1000 };

const resumenPedido = (p: Awaited<ReturnType<typeof getPedidosByClienteWhatsapp>>[number]) => ({
  id: p.id, codigoSeguimiento: p.codigoSeguimiento, estado: p.estado, total: p.total, tipoEntrega: p.tipoEntrega, fecha: p.fechaCreacion, productos: p.productos,
});

/** Reconoce a un cliente que regresa por su número para precargar nombre y dirección. */
menuGraficoRoutes.post("/api/menu-grafico/buscar-cliente", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => null)) || {};
  const colmadoId = Number(body.colmadoId);
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
  if (!Number.isInteger(colmadoId) || soloDigitos(whatsapp).length < 7) return c.json({ error: "Datos incompletos" }, 400);
  // Frena a quien pruebe números uno tras otro para sacar nombres y direcciones.
  if (!(await permitirEvento(db, `buscarcliente:${c.req.header("CF-Connecting-IP") ?? "sin-ip"}`, 20, 10 * 60 * 1000))) {
    return c.json({ error: "Demasiadas búsquedas. Espera unos minutos." }, 429);
  }
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
  // Desde un aparato que nunca pidió con ese número no se devuelve nada del cliente.
  if (!(await aparatoConocido(db, colmadoId, whatsapp, aparatoDe(c)))) {
    return c.json({ encontrado: false, cliente: null, pedidosRecientes: [] });
  }
  const [conversacion, cliente, suyos] = await Promise.all([
    getConversacionByCliente(db, colmadoId, whatsapp),
    getClienteByWhatsapp(db, colmadoId, whatsapp),
    getPedidosByClienteWhatsapp(db, colmadoId, whatsapp),
  ]);
  const direcciones = [cliente?.direccionTexto, conversacion?.direccionTexto, ...suyos.filter((p) => p.tipoEntrega !== "pickup").map((p) => p.clienteUbicacion)]
    .map((d) => String(d || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const pedidosRecientes = suyos.slice(0, 5).map(resumenPedido);
  return c.json({
    encontrado: !!conversacion || pedidosRecientes.length > 0,
    cliente: conversacion || cliente || suyos.length
      ? { nombre: cliente?.nombre || conversacion?.clienteNombre || null, direccion: direcciones[0] || null }
      : null,
    pedidosRecientes,
  });
});

menuGraficoRoutes.get("/api/menu-grafico/pedidos-cliente", async (c) => {
  c.header("Cache-Control", "no-store");
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.query("colmadoId"));
  const whatsapp = String(c.req.query("whatsapp") || "").trim();
  if (!Number.isInteger(colmadoId) || !whatsapp) return c.json({ error: "Datos incompletos" }, 400);
  if (!(await permitirEvento(db, `pedidoscliente:${c.req.header("CF-Connecting-IP") ?? "sin-ip"}`, 60, 10 * 60 * 1000))) {
    return c.json({ error: "Demasiadas consultas. Espera unos minutos." }, 429);
  }
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
  if (!(await aparatoConocido(db, colmadoId, whatsapp, aparatoDe(c)))) return c.json({ pedidos: [] });
  const suyos = await getPedidosByClienteWhatsapp(db, colmadoId, whatsapp);
  return c.json({ pedidos: suyos.filter((p) => p.estado !== "fusionado").slice(0, 2).map(resumenPedido) });
});

/**
 * Pedido desde el menú gráfico. Valida contra el menú vigente (disponibilidad,
 * inventario y precio) y queda en pendiente_confirmacion para que el negocio
 * confirme el total.
 */
menuGraficoRoutes.post("/api/menu-grafico/pedido", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => null)) || {};
  const { clienteNombre, clienteWhatsapp, direccionTexto, latitud, longitud, productos } = body;
  const colmadoId = Number(body.colmadoId);
  const tipoEntrega = body.tipoEntrega || "delivery";

  if (!Number.isInteger(colmadoId) || typeof clienteNombre !== "string" || !clienteNombre.trim() ||
      typeof clienteWhatsapp !== "string" || soloDigitos(clienteWhatsapp).length < 7 || !Array.isArray(productos) || !productos.length) {
    return c.json({ error: "Datos incompletos" }, 400);
  }
  if (productos.length > 100) return c.json({ error: "El pedido tiene demasiados productos." }, 400);
  if (!["delivery", "pickup"].includes(tipoEntrega)) return c.json({ error: "Selecciona delivery o pickup." }, 400);
  if (tipoEntrega === "delivery" && (typeof direccionTexto !== "string" || !direccionTexto.trim())) {
    return c.json({ error: "La dirección es requerida para delivery." }, 400);
  }
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  if (colmado.estado !== "activo" || colmado.estadoSuscripcion === "suspendida") {
    return c.json({ error: "Este negocio no está recibiendo pedidos en este momento." }, 409);
  }

  // Topes contra pedidos falsos: por teléfono y por conexión cada hora; pasado un número, verificación de robot.
  const ip = c.req.header("CF-Connecting-IP") ?? "sin-ip";
  const claveTel = `pedidomg:t:${colmadoId}:${soloDigitos(clienteWhatsapp)}`, claveIp = `pedidomg:ip:${ip}`;
  const [delTelefono, deLaConexion] = await Promise.all([contarEventos(db, claveTel, TOPES_PEDIDO.ventanaMs), contarEventos(db, claveIp, TOPES_PEDIDO.ventanaMs)]);
  if (delTelefono >= TOPES_PEDIDO.porTelefono || deLaConexion >= TOPES_PEDIDO.porConexion) {
    return c.json({ error: "Se hicieron demasiados pedidos seguidos. Espera un rato o llama al negocio." }, 429);
  }
  const turnstile = turnstileDelLogin(c.env);
  if (turnstile && deLaConexion >= TOPES_PEDIDO.turnstileDesde && !(await verificarTurnstile(turnstile.secreto, body.turnstileToken, ip))) {
    return c.json({ error: "Confirma que no eres un robot y vuelve a enviar el pedido.", turnstile: true, siteKey: turnstile.siteKey }, 403);
  }

  const menu = await getMenuProductos(db, colmadoId);
  for (const item of productos as Array<{ nombre?: string; cantidad?: number; precio?: number }>) {
    const cantidad = Number(item?.cantidad);
    if (!item?.nombre || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999 || !Number.isFinite(Number(item.precio))) {
      return c.json({ error: "Los productos del pedido no son válidos." }, 400);
    }
    const vigente = menu.find((p) => p.nombre === item.nombre);
    if (!vigente || !vigente.disponible || (vigente.inventario !== null && vigente.inventario !== undefined && (vigente.inventario <= 0 || cantidad > vigente.inventario))) {
      return c.json({ error: `${item.nombre} ya no está disponible en esta sucursal.` }, 409);
    }
    if (Math.abs(Number(vigente.precio) - Number(item.precio)) > 0.01) {
      return c.json({ error: `El precio de ${item.nombre} cambió. Recarga el menú.` }, 409);
    }
  }

  if (tipoEntrega === "delivery") {
    const zip = await validarZip(db, colmado.paisId, direccionTexto);
    if (!zip.zipOk) {
      return c.json({
        error: `La dirección debe incluir ${zip.etiquetaCP} (ej: ${zip.ejemploCP})`,
        missingZip: true, etiquetaCodigoPostal: zip.etiquetaCP, ejemploCodigoPostal: zip.ejemploCP,
      }, 400);
    }
  }

  const nombre = clienteNombre.trim().slice(0, 100);
  const direccion = tipoEntrega === "delivery" ? String(direccionTexto).trim().slice(0, 500) : undefined;
  const lat = latitud != null && latitud !== "" ? String(latitud) : undefined;
  const lon = longitud != null && longitud !== "" ? String(longitud) : undefined;
  const costoDelivery = tipoEntrega === "delivery" ? Math.max(0, Number(colmado.costoDelivery) || 0) : 0;

  await getOrCreateCliente(db, colmadoId, clienteWhatsapp, { nombre, ...(direccion ? { direccionTexto: direccion, latitud: lat, longitud: lon } : {}) });
  const conversacion = await getOrCreateConversacion(db, colmadoId, clienteWhatsapp, nombre);
  await updateConversacion(db, conversacion.id, { clienteNombre: nombre, ...(direccion ? { direccionTexto: direccion, latitud: lat, longitud: lon } : {}) });

  // El precio guardado es el del menú, no el que envía el navegador.
  const lineas = (productos as Array<{ nombre: string; cantidad: number }>).map((p) => {
    const precio = Number(menu.find((m) => m.nombre === p.nombre)!.precio);
    return { nombre: p.nombre, monto: precio * Number(p.cantidad), cantidad: Number(p.cantidad), precioUnitario: precio };
  });
  const pedido = await createPedido(db, {
    colmadoId,
    clienteNombre: nombre,
    clienteWhatsapp,
    clienteUbicacion: direccion ?? `Recoger en ${colmado.direccion}`,
    clienteLatitud: direccion ? lat ?? null : null,
    clienteLongitud: direccion ? lon ?? null : null,
    productos: JSON.stringify(lineas),
    total: "0", // el negocio confirma el total
    montoPago: "0",
    necesitaDevuelta: false,
    estado: "pendiente_confirmacion",
    tipoEntrega,
    costoDeliveryAplicado: costoDelivery.toFixed(2),
  });
  await avisarPedidoNuevo(c.env, db, pedido);
  await updateConversacionPedidoEstado(db, conversacion.id, "pendiente_confirmacion");
  await registrarEvento(db, claveTel, claveIp);
  // Este aparato ya pidió con este número: podrá ver sus pedidos y su dirección la próxima vez.
  const aparato = aparatoDe(c);
  if (aparato) await db.insert(clienteAparatos).values({ colmadoId, telefono: soloDigitos(clienteWhatsapp), aparato }).onConflictDoNothing();

  const simbolo = (await enrichColmadoWithMoneda(db, colmado)).simboloMoneda;
  const subtotal = lineas.reduce((s, p) => s + p.monto, 0);
  const entrega = tipoEntrega === "pickup"
    ? `🏪 *Modalidad:* Recoger en el negocio (${colmado.direccion})`
    : `📍 *Dirección:* ${direccion}\n🛵 *Delivery:* ${simbolo}${costoDelivery.toFixed(0)}`;
  const texto = lineas.map((p) => `• ${p.cantidad}x ${p.nombre} - ${simbolo}${p.monto.toFixed(0)}`).join("\n");
  await addMensaje(db, conversacion.id, "user",
    `🛒 *Nuevo pedido desde Menú Gráfico #${pedido.id}*\n\n📝 *Productos solicitados:*\n${texto}\n\n👤 *Cliente:* ${nombre}\n${entrega}\n💰 *Total estimado:* ${simbolo}${(subtotal + costoDelivery).toFixed(0)}\n\n⏳ El negocio está revisando tu pedido y te confirmará el total.`);

  return c.json({ id: pedido.id, codigoSeguimiento: pedido.codigoSeguimiento, estado: pedido.estado, tipoEntrega: pedido.tipoEntrega, mensaje: "Pedido creado. El negocio te confirmará el total pronto." });
});
