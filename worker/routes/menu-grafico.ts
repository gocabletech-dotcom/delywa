import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { colmados, type Colmado } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { checkZipFormat } from "../lib/zipValidation";
import { soloDigitos } from "../lib/telefono";
import { enrichColmadoWithMoneda, generateSlug, getColmado, getPais } from "../storage/colmados";
import { getMenuProductos } from "../storage/menu";
import {
  addMensaje, getClienteByWhatsapp, getConversacionByCliente, getOrCreateCliente, getOrCreateConversacion, updateConversacion,
  updateConversacionPedidoEstado,
} from "../storage/conversaciones";
import { createPedido, getPedidosByClienteWhatsapp } from "../storage/pedidos";

export const menuGraficoRoutes = new Hono<AppEnv>();

/** El código del enlace puede ser el slug, "COLMADO{id}", el id o el nombre (enlaces viejos). */
export async function getColmadoByCodigo(db: Db, codigo: string): Promise<Colmado | undefined> {
  const [porSlug] = await db.select().from(colmados).where(eq(colmados.slug, codigo.toLowerCase()));
  if (porSlug) return porSlug;
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

const resumenPedido = (p: Awaited<ReturnType<typeof getPedidosByClienteWhatsapp>>[number]) => ({
  id: p.id, estado: p.estado, total: p.total, tipoEntrega: p.tipoEntrega, fecha: p.fechaCreacion, productos: p.productos,
});

/** Reconoce a un cliente que regresa por su número para precargar nombre y dirección. */
menuGraficoRoutes.post("/api/menu-grafico/buscar-cliente", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json().catch(() => null)) || {};
  const colmadoId = Number(body.colmadoId);
  const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
  if (!Number.isInteger(colmadoId) || soloDigitos(whatsapp).length < 7) return c.json({ error: "Datos incompletos" }, 400);
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
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
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
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
  await updateConversacionPedidoEstado(db, conversacion.id, "pendiente_confirmacion");

  const simbolo = (await enrichColmadoWithMoneda(db, colmado)).simboloMoneda;
  const subtotal = lineas.reduce((s, p) => s + p.monto, 0);
  const entrega = tipoEntrega === "pickup"
    ? `🏪 *Modalidad:* Recoger en el negocio (${colmado.direccion})`
    : `📍 *Dirección:* ${direccion}\n🛵 *Delivery:* ${simbolo}${costoDelivery.toFixed(0)}`;
  const texto = lineas.map((p) => `• ${p.cantidad}x ${p.nombre} - ${simbolo}${p.monto.toFixed(0)}`).join("\n");
  await addMensaje(db, conversacion.id, "user",
    `🛒 *Nuevo pedido desde Menú Gráfico #${pedido.id}*\n\n📝 *Productos solicitados:*\n${texto}\n\n👤 *Cliente:* ${nombre}\n${entrega}\n💰 *Total estimado:* ${simbolo}${(subtotal + costoDelivery).toFixed(0)}\n\n⏳ El negocio está revisando tu pedido y te confirmará el total.`);

  return c.json({ id: pedido.id, estado: pedido.estado, tipoEntrega: pedido.tipoEntrega, mensaje: "Pedido creado. El negocio te confirmará el total pronto." });
});
