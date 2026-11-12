import { borrarSiHuerfano } from "../lib/archivos";
import { Hono } from "hono";
import type { User } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAdmin, requireAuth, requireBusinessAccess } from "../lib/auth";
import { getColmado } from "../storage/colmados";
import { canUserAccessColmado } from "../storage/users";
import {
  copiarMenuASucursal, copiarPlantillasJergaAColmado, createMenuProducto, createPlantillaJerga, createProductoRestringido,
  deleteJerga, deleteMenuProducto, deletePlantillaJerga, deleteProductoRestringido, getAllPlantillas, getAllPlantillasJerga,
  getCategorias, getDiccionarioByColmado, getJerga, getMenuProducto, getMenuProductos, getPlantillasByTipoNegocio,
  getPlantillasJerga, getPlantillasJergaByPais, getProductosRestringidos, tieneMenuPermitido, updateJerga,
  updateMenuProducto, updatePlantillaJerga, updateProductoRestringido, upsertMenuProductoSucursal,
} from "../storage/menu";
import { aplicarPlantillaMenu } from "../storage/colmados";

/** Roles que pueden cambiar el menú y el diccionario. Un repartidor no edita precios. */
const EDITORES = ["platform_admin", "colmado_owner", "admin_pedidos", "operador_sucursal"];

async function puedeEditar(db: Db, user: User, colmadoId: number): Promise<boolean> {
  return EDITORES.includes(user.role ?? "") && (await canUserAccessColmado(db, user, colmadoId));
}

class Invalido extends Error {}

/** undefined = no se envió; null = borrar; si no, texto con 2 decimales. */
function parsePrecio(value: unknown, requerido = false): string | null | undefined {
  if (value === undefined) {
    if (requerido) throw new Invalido("Nombre y precio son requeridos");
    return undefined;
  }
  if (value === null || value === "") {
    if (requerido) throw new Invalido("Nombre y precio son requeridos");
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Invalido("El precio debe ser un número mayor o igual a 0");
  return n.toFixed(2);
}

/** undefined = no se envió; null o "" = sin control de inventario. */
function parseInventario(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Invalido("El inventario debe ser un número");
  return Math.max(0, Math.floor(n));
}

function texto(value: unknown, max = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Invalido("Valor de texto inválido");
  return value.slice(0, max);
}

export const menuRoutes = new Hono<AppEnv>();

menuRoutes.onError((err, c) => {
  if (err instanceof Invalido) return c.json({ error: err.message }, 400);
  throw err;
});

// ---------- Menú (lectura pública: lo usan el chat de pedidos y el menú gráfico) ----------

menuRoutes.get("/api/colmados/:id/menu", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  return c.json(await getMenuProductos(getDb(c.env.DB), id));
});

menuRoutes.get("/api/colmados/:id/menu/categorias", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  return c.json(await getCategorias(getDb(c.env.DB), id));
});

menuRoutes.post("/api/colmados/:id/menu", requireAuth, async (c) => {
  const colmadoId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  if (!(await puedeEditar(db, c.var.user, colmadoId))) return c.json({ error: "No tienes permiso para modificar este menú" }, 403);
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  if (!tieneMenuPermitido(colmado.tipoNegocio)) return c.json({ error: "Este tipo de negocio no tiene opción de menú" }, 400);

  const body = (await c.req.json().catch(() => null)) || {};
  const nombre = texto(body.nombre, 200)?.trim();
  if (!nombre) return c.json({ error: "Nombre y precio son requeridos" }, 400);
  const producto = await createMenuProducto(db, {
    colmadoId,
    nombre,
    descripcion: texto(body.descripcion, 1000) ?? null,
    precio: parsePrecio(body.precio, true)!,
    categoria: texto(body.categoria, 100)?.trim() || "General",
    imagen: texto(body.imagen, 1000) ?? null,
    disponible: body.disponible !== false,
    inventario: parseInventario(body.inventario) ?? null,
    orden: Number.isInteger(Number(body.orden)) ? Number(body.orden) : 0,
  });
  return c.json(producto, 201);
});

/**
 * Editar un producto. Si `sucursalId` es una sucursal que hereda el producto
 * del negocio principal, el cambio (precio, disponibilidad, inventario) aplica
 * solo a esa sucursal.
 */
menuRoutes.patch("/api/menu/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const producto = await getMenuProducto(db, Number(c.req.param("id")));
  if (!producto) return c.json({ error: "Producto no encontrado" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const destinoId = Number(body.sucursalId) || producto.colmadoId;

  const colmadoProducto = await getColmado(db, producto.colmadoId);
  if (!colmadoProducto || !tieneMenuPermitido(colmadoProducto.tipoNegocio)) return c.json({ error: "Este tipo de negocio no tiene opción de menú" }, 400);

  if (destinoId !== producto.colmadoId) {
    const sucursal = await getColmado(db, destinoId);
    // Solo se permite una variación local si la sucursal hereda este producto.
    if (!sucursal || sucursal.negocioPrincipalId !== producto.colmadoId) {
      return c.json({ error: "Ese producto no pertenece al menú de esta sucursal" }, 400);
    }
    if (!(await puedeEditar(db, c.var.user, destinoId))) return c.json({ error: "No tienes permiso para modificar este producto" }, 403);
    await upsertMenuProductoSucursal(db, producto.id, destinoId, {
      precio: parsePrecio(body.precio),
      disponible: body.disponible === undefined ? undefined : body.disponible === null ? null : Boolean(body.disponible),
      inventario: parseInventario(body.inventario),
    });
    const menu = await getMenuProductos(db, destinoId);
    return c.json(menu.find((item) => item.id === producto.id) ?? producto);
  }

  if (!(await puedeEditar(db, c.var.user, producto.colmadoId))) return c.json({ error: "No tienes permiso para modificar este producto" }, 403);
  const data: Record<string, unknown> = {};
  const nombre = texto(body.nombre, 200);
  if (nombre !== undefined) {
    if (!nombre.trim()) return c.json({ error: "El nombre no puede quedar vacío" }, 400);
    data.nombre = nombre.trim();
  }
  if (body.descripcion !== undefined) data.descripcion = texto(body.descripcion, 1000) ?? null;
  const precio = parsePrecio(body.precio);
  if (precio === null) return c.json({ error: "El precio no puede quedar vacío" }, 400);
  if (precio !== undefined) data.precio = precio;
  if (body.categoria !== undefined) data.categoria = texto(body.categoria, 100)?.trim() || "General";
  if (body.imagen !== undefined) data.imagen = texto(body.imagen, 1000) ?? null;
  if (body.disponible !== undefined) data.disponible = Boolean(body.disponible);
  const inventario = parseInventario(body.inventario);
  if (inventario !== undefined) data.inventario = inventario;
  if (body.orden !== undefined && Number.isInteger(Number(body.orden))) data.orden = Number(body.orden);
  if (Object.keys(data).length === 0) return c.json(producto);
  const actualizado = await updateMenuProducto(db, producto.id, data);
  // La foto vieja se borra si ya nadie la usa.
  if (data.imagen !== undefined && producto.imagen && producto.imagen !== data.imagen) {
    const tarea = borrarSiHuerfano(c.env, producto.imagen);
    try { c.executionCtx.waitUntil(tarea); } catch { await tarea; }
  }
  return c.json(actualizado);
});

/** Borrar un producto. En una sucursal que lo hereda, solo se oculta allí. */
menuRoutes.delete("/api/menu/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const producto = await getMenuProducto(db, Number(c.req.param("id")));
  if (!producto) return c.json({ error: "Producto no encontrado" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const destinoId = Number(body.sucursalId) || producto.colmadoId;

  if (destinoId !== producto.colmadoId) {
    const sucursal = await getColmado(db, destinoId);
    if (!sucursal || sucursal.negocioPrincipalId !== producto.colmadoId) {
      return c.json({ error: "Ese producto no pertenece al menú de esta sucursal" }, 400);
    }
    if (!(await puedeEditar(db, c.var.user, destinoId))) return c.json({ error: "No tienes permiso para eliminar este producto" }, 403);
    await upsertMenuProductoSucursal(db, producto.id, destinoId, { disponible: false });
    return c.json({ success: true });
  }
  if (!(await puedeEditar(db, c.var.user, producto.colmadoId))) return c.json({ error: "No tienes permiso para eliminar este producto" }, 403);
  await deleteMenuProducto(db, producto.id);
  const tarea = borrarSiHuerfano(c.env, producto.imagen);
  try { c.executionCtx.waitUntil(tarea); } catch { await tarea; }
  return c.json({ success: true });
});

/** Reemplaza el menú de una sucursal por una copia del de otra del mismo negocio. */
menuRoutes.post("/api/colmados/:id/menu/copiar", requireAuth, async (c) => {
  const sourceId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const targetId = Number(body.targetSucursalId);
  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) return c.json({ error: "Sucursal origen y destino son requeridas" }, 400);
  if (sourceId === targetId) return c.json({ error: "La sucursal origen y destino deben ser diferentes" }, 400);
  const db = getDb(c.env.DB);
  const user = c.var.user;
  const puede = (user.role === "colmado_owner" || user.role === "admin_pedidos") &&
    (await canUserAccessColmado(db, user, sourceId)) && (await canUserAccessColmado(db, user, targetId));
  if (!puede) return c.json({ error: "No tienes permiso para copiar menús entre estas sucursales" }, 403);

  const [source, target] = await Promise.all([getColmado(db, sourceId), getColmado(db, targetId)]);
  if (!source || !target) return c.json({ error: "Sucursal no encontrada" }, 404);
  if ((source.negocioPrincipalId || source.id) !== (target.negocioPrincipalId || target.id)) {
    return c.json({ error: "Las sucursales no pertenecen al mismo negocio" }, 400);
  }
  if (!tieneMenuPermitido(source.tipoNegocio) || !tieneMenuPermitido(target.tipoNegocio)) {
    return c.json({ error: "El menú no está disponible para una de estas sucursales" }, 400);
  }
  const result = await copiarMenuASucursal(db, sourceId, targetId);
  return c.json({ success: true, ...result, source: source.nombre, target: target.nombre, targetSucursalId: targetId });
});

// ---------- Plantillas de menú ----------

menuRoutes.get("/api/plantillas-menu/:tipoNegocio", async (c) => {
  return c.json(await getPlantillasByTipoNegocio(getDb(c.env.DB), c.req.param("tipoNegocio")));
});

menuRoutes.get("/api/plantillas-menu", async (c) => c.json(await getAllPlantillas(getDb(c.env.DB))));

menuRoutes.post("/api/colmados/:id/aplicar-plantilla", requireAuth, async (c) => {
  const colmadoId = Number(c.req.param("id"));
  if (!Number.isInteger(colmadoId)) return c.json({ error: "ID de negocio inválido" }, 400);
  const db = getDb(c.env.DB);
  const colmado = await getColmado(db, colmadoId);
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  if (!(await puedeEditar(db, c.var.user, colmadoId))) return c.json({ error: "No tienes permiso para modificar este negocio" }, 403);
  if ((await getMenuProductos(db, colmadoId)).length > 0) {
    return c.json({ error: "Este negocio ya tiene productos en su menú. Elimínalos primero si deseas aplicar la plantilla." }, 400);
  }
  await aplicarPlantillaMenu(db, colmadoId, colmado.tipoNegocio);
  const productos = await getMenuProductos(db, colmadoId);
  return c.json({ success: true, message: `Se agregaron ${productos.length} productos al menú`, productos });
});

// ---------- Diccionario de jerga del negocio ----------

menuRoutes.get("/api/colmados/:id/diccionario-jerga", requireAuth, requireBusinessAccess(), async (c) => {
  return c.json(await getDiccionarioByColmado(getDb(c.env.DB), Number(c.req.param("id"))));
});

menuRoutes.patch("/api/diccionario-jerga/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const entrada = await getJerga(db, Number(c.req.param("id")));
  if (!entrada || !(await puedeEditar(db, c.var.user, entrada.colmadoId))) {
    return c.json({ error: "No tienes permiso para modificar esta jerga" }, 403);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  const jerga = texto(body.jerga, 200)?.toLowerCase().trim();
  const productoIdentificado = texto(body.productoIdentificado, 200)?.trim();
  if (!jerga || !productoIdentificado) return c.json({ error: "jerga y productoIdentificado son requeridos" }, 400);
  const precioSugerido = parsePrecio(body.precioSugerido);
  return c.json(await updateJerga(db, entrada.id, {
    jerga, productoIdentificado, ...(precioSugerido !== undefined ? { precioSugerido } : {}),
  }));
});

menuRoutes.delete("/api/diccionario-jerga/:id", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const entrada = await getJerga(db, Number(c.req.param("id")));
  if (!entrada || !(await puedeEditar(db, c.var.user, entrada.colmadoId))) {
    return c.json({ error: "No tienes permiso para eliminar esta jerga" }, 403);
  }
  await deleteJerga(db, entrada.id);
  return c.json({ success: true });
});

menuRoutes.post("/api/colmados/:id/copiar-jerga-plantilla", requireAuth, async (c) => {
  const colmadoId = Number(c.req.param("id"));
  if (!Number.isInteger(colmadoId)) return c.json({ error: "ID inválido" }, 400);
  const db = getDb(c.env.DB);
  if (!(await puedeEditar(db, c.var.user, colmadoId))) return c.json({ error: "No tienes permiso para modificar este negocio" }, 403);
  if (!(await getColmado(db, colmadoId))) return c.json({ error: "Negocio no encontrado" }, 404);
  const cantidad = await copiarPlantillasJergaAColmado(db, colmadoId);
  return c.json({ success: true, message: `Se copiaron ${cantidad} expresiones de jerga al diccionario`, cantidad });
});

// ---------- Plantillas de jerga (plataforma) ----------

menuRoutes.get("/api/admin/plantillas-jerga", requireAuth, requireAdmin, async (c) => c.json(await getAllPlantillasJerga(getDb(c.env.DB))));

menuRoutes.get("/api/admin/plantillas-jerga/:tipoNegocio", requireAuth, requireAdmin, async (c) => {
  return c.json(await getPlantillasJerga(getDb(c.env.DB), c.req.param("tipoNegocio")));
});

menuRoutes.post("/api/admin/plantillas-jerga", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const tipoNegocio = texto(body.tipoNegocio, 50)?.trim();
  const jerga = texto(body.jerga, 200)?.toLowerCase().trim();
  const productoIdentificado = texto(body.productoIdentificado, 200)?.trim();
  if (!tipoNegocio || !jerga || !productoIdentificado) {
    return c.json({ error: "tipoNegocio, jerga y productoIdentificado son requeridos" }, 400);
  }
  return c.json(await createPlantillaJerga(getDb(c.env.DB), {
    tipoNegocio, jerga, productoIdentificado,
    precioSugerido: parsePrecio(body.precioSugerido) ?? null,
    descripcion: texto(body.descripcion, 500) ?? null,
    paisId: Number.isInteger(Number(body.paisId)) && Number(body.paisId) > 0 ? Number(body.paisId) : null,
    activo: true,
  }));
});

menuRoutes.patch("/api/admin/plantillas-jerga/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  const body = (await c.req.json().catch(() => null)) || {};
  const data: Record<string, unknown> = {};
  if (body.tipoNegocio !== undefined) data.tipoNegocio = texto(body.tipoNegocio, 50)?.trim();
  if (body.jerga !== undefined) data.jerga = texto(body.jerga, 200)?.toLowerCase().trim();
  if (body.productoIdentificado !== undefined) data.productoIdentificado = texto(body.productoIdentificado, 200)?.trim();
  if (body.precioSugerido !== undefined) data.precioSugerido = parsePrecio(body.precioSugerido);
  if (body.descripcion !== undefined) data.descripcion = texto(body.descripcion, 500) ?? null;
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  for (const key of ["tipoNegocio", "jerga", "productoIdentificado"]) {
    if (key in data && !data[key]) return c.json({ error: `El campo ${key} no puede quedar vacío` }, 400);
  }
  if (Object.keys(data).length === 0) return c.json({ error: "Se requiere al menos un campo" }, 400);
  const row = await updatePlantillaJerga(getDb(c.env.DB), id, data);
  return row ? c.json(row) : c.json({ error: "Plantilla no encontrada" }, 404);
});

menuRoutes.delete("/api/admin/plantillas-jerga/:id", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  await deletePlantillaJerga(getDb(c.env.DB), id);
  return c.json({ success: true });
});

menuRoutes.get("/api/admin/paises/:id/jerga", requireAuth, requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "ID inválido" }, 400);
  return c.json(await getPlantillasJergaByPais(getDb(c.env.DB), id));
});

// ---------- Productos restringidos (plataforma) ----------

menuRoutes.get("/api/admin/productos-restringidos", requireAuth, requireAdmin, async (c) => c.json(await getProductosRestringidos(getDb(c.env.DB))));

menuRoutes.post("/api/admin/productos-restringidos", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const palabraClave = texto(body.palabraClave, 100)?.toLowerCase().trim();
  const categoria = texto(body.categoria, 50)?.trim();
  if (!palabraClave || !categoria) return c.json({ error: "Palabra clave y categoría son requeridos" }, 400);
  return c.json(await createProductoRestringido(getDb(c.env.DB), {
    palabraClave, categoria, activo: body.activo !== undefined ? Boolean(body.activo) : true,
  }));
});

menuRoutes.put("/api/admin/productos-restringidos/:id", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const data: Record<string, unknown> = {};
  if (body.palabraClave !== undefined) data.palabraClave = texto(body.palabraClave, 100)?.toLowerCase().trim();
  if (body.categoria !== undefined) data.categoria = texto(body.categoria, 50)?.trim();
  if (body.activo !== undefined) data.activo = Boolean(body.activo);
  if ((("palabraClave" in data) && !data.palabraClave) || (("categoria" in data) && !data.categoria)) {
    return c.json({ error: "Palabra clave y categoría no pueden quedar vacías" }, 400);
  }
  if (Object.keys(data).length === 0) return c.json({ error: "Se requiere al menos un campo" }, 400);
  const row = await updateProductoRestringido(getDb(c.env.DB), Number(c.req.param("id")), data);
  return row ? c.json(row) : c.json({ error: "Producto restringido no encontrado" }, 404);
});

menuRoutes.delete("/api/admin/productos-restringidos/:id", requireAuth, requireAdmin, async (c) => {
  await deleteProductoRestringido(getDb(c.env.DB), Number(c.req.param("id")));
  return c.json({ success: true });
});
