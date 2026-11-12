import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { puedeOperar } from "../lib/permisos";
import { soloDigitos } from "../lib/telefono";
import { getColmado, getColmadoTimezone } from "../storage/colmados";
import { getAccessibleColmadoIds } from "../storage/users";
import { getClienteById, getClientesByColmado, updateCliente } from "../storage/conversaciones";
import {
  actualizarVentaDelDia, calcularHistorialVentas, calcularVentasHoy, calcularVentasPorRango, getPedidosByClienteWhatsapp,
  getPedidosByColmado, getVentaDelDia,
} from "../storage/pedidos";

export const clienteRoutes = new Hono<AppEnv>();

async function timezoneDe(db: ReturnType<typeof getDb>, colmadoId: number) {
  const colmado = await getColmado(db, colmadoId);
  return colmado ? getColmadoTimezone(db, colmado) : "America/Santo_Domingo";
}

// ---------- Clientes ----------

clienteRoutes.get("/api/colmados/:id/clientes", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const [clientes, pedidos] = await Promise.all([getClientesByColmado(db, colmadoId), getPedidosByColmado(db, colmadoId)]);
  const porTel = new Map<string, typeof pedidos>();
  for (const p of pedidos) {
    const tel = soloDigitos(p.clienteWhatsapp);
    porTel.set(tel, [...(porTel.get(tel) ?? []), p]);
  }
  return c.json(clientes.map((cliente) => {
    const suyos = (porTel.get(soloDigitos(cliente.whatsappNumero)) ?? []).filter((p) => p.estado !== "fusionado");
    return {
      id: cliente.id,
      colmadoId: cliente.colmadoId,
      clienteWhatsapp: cliente.whatsappNumero,
      clienteNombre: cliente.nombre,
      direccionTexto: cliente.direccionTexto,
      cantidadPedidos: suyos.length,
      // Solo cuenta lo entregado: un pedido cancelado no es dinero gastado.
      totalGastado: suyos.filter((p) => p.estado === "entregado").reduce((s, p) => s + (Number(p.total) || 0), 0),
      ultimoPedido: suyos[0]?.fechaCreacion ?? null,
    };
  }));
});

clienteRoutes.get("/api/colmados/:id/clientes/:whatsapp/pedidos", requireAuth, requireBusinessAccess(), async (c) => {
  return c.json(await getPedidosByClienteWhatsapp(getDb(c.env.DB), Number(c.req.param("id")), c.req.param("whatsapp")));
});

clienteRoutes.patch("/api/clientes/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  const cliente = await getClienteById(db, id);
  if (!cliente) return c.json({ error: "Cliente no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, cliente.colmadoId))) return c.json({ error: "Sin acceso" }, 403);
  const body = (await c.req.json().catch(() => null)) || {};
  await updateCliente(db, id, {
    nombre: typeof body.nombre === "string" ? body.nombre.trim().slice(0, 200) : undefined,
    direccionTexto: typeof body.direccionTexto === "string" ? body.direccionTexto.trim().slice(0, 500) : undefined,
  });
  return c.json({ success: true });
});

// ---------- Ventas ----------

clienteRoutes.get("/api/colmados/:id/ventas", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const dias = Math.min(366, Math.max(1, parseInt(c.req.query("limit") || "") || 30));
  return c.json(await calcularHistorialVentas(db, colmadoId, await timezoneDe(db, colmadoId), dias));
});

clienteRoutes.get("/api/colmados/:id/ventas/hoy", requireAuth, requireBusinessAccess(), async (c) => {
  c.header("Cache-Control", "no-store");
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const tz = await timezoneDe(db, colmadoId);
  const [stats, registro] = await Promise.all([calcularVentasHoy(db, colmadoId, tz), getVentaDelDia(db, colmadoId, tz)]);
  return c.json({ ...stats, cuadrado: registro?.cuadrado || false });
});

clienteRoutes.patch("/api/colmados/:id/ventas/cuadrar", requireAuth, requireBusinessAccess(), async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const fecha = body.fecha ? new Date(body.fecha) : new Date();
  if (Number.isNaN(fecha.getTime())) return c.json({ error: "Fecha inválida" }, 400);
  await actualizarVentaDelDia(db, colmadoId, await timezoneDe(db, colmadoId), { cuadrado: true }, fecha);
  return c.json({ success: true });
});

/** Reporte consolidado de solo lectura sobre las sucursales a las que el usuario tiene acceso. */
clienteRoutes.get("/api/negocio/reportes", requireAuth, async (c) => {
  const user = c.var.user;
  if (!["colmado_owner", "admin_pedidos"].includes(user.role ?? "")) {
    return c.json({ error: "No tienes permiso para ver reportes consolidados" }, 403);
  }
  const db = getDb(c.env.DB);
  const ids = await getAccessibleColmadoIds(db, user);
  const hasta = c.req.query("hasta") ? new Date(String(c.req.query("hasta"))) : new Date();
  const desde = c.req.query("desde") ? new Date(String(c.req.query("desde"))) : new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), 1));
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return c.json({ error: "Rango de fechas inválido" }, 400);
  const reportes = await Promise.all(ids.map(async (id) => {
    const [colmado, stats] = await Promise.all([getColmado(db, id), calcularVentasPorRango(db, id, desde, hasta)]);
    return { sucursalId: id, sucursal: colmado?.nombre || `Sucursal ${id}`, ...stats };
  }));
  return c.json({ desde: desde.toISOString(), hasta: hasta.toISOString(), reportes });
});
