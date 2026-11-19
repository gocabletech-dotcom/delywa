import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { claveDebil } from "../lib/claves";
import { cerrarSesionesDe } from "../lib/cuenta";
import { getColmado, getSucursalesByOwner } from "../storage/colmados";
import type { Db } from "../db";
import type { Colmado, User } from "@shared/schema";
import {
  createUser, deleteUser, getAccessibleColmadoIds, getAllUsers, getStaffForOwner, getUserByEmail, getUserById, getUserSucursalIds,
  isUniqueViolation, normalizeEmail, setUserSucursalIds, toPublicUser, updateUser, updateUserRole,
} from "../storage/users";

export const userRoutes = new Hono<AppEnv>();

// ---------- Usuarios del negocio ----------
// El dueño gestiona colmaderos y despachadores de todo su negocio. El colmadero (decisión del
// 2026-11-18) solo crea y edita despachadores, y solo en las sucursales que él tiene asignadas.

type Gestor = { user: User; esDueno: boolean; sucursales: Colmado[]; ids: Set<number>; roles: string[] };

async function gestorDeUsuarios(db: Db, user: User): Promise<Gestor | null> {
  if (user.role === "colmado_owner" && user.colmadoId) {
    const sucursales = await getSucursalesByOwner(db, user.id);
    return { user, esDueno: true, sucursales, ids: new Set(sucursales.map((s) => s.id)), roles: ["admin_pedidos", "operador_sucursal"] };
  }
  if (user.role === "admin_pedidos" && user.colmadoId) {
    const ids = await getAccessibleColmadoIds(db, user);
    const sucursales = (await Promise.all(ids.map((id) => getColmado(db, id)))).filter((s): s is Colmado => Boolean(s));
    return { user, esDueno: false, sucursales, ids: new Set(sucursales.map((s) => s.id)), roles: ["operador_sucursal"] };
  }
  return null;
}

/** ¿Este gestor puede tocar a este usuario? El colmadero solo a despachadores de sus sucursales. */
async function puedeGestionar(db: Db, g: Gestor, target: User | undefined): Promise<boolean> {
  if (!target || target.role === "platform_admin") return false;
  if (target.role === "colmado_owner" && !(g.esDueno && target.id === g.user.id)) return false;
  if (!g.esDueno && target.role !== "operador_sucursal") return false;
  const ramas = await getUserSucursalIds(db, target.id);
  // Un usuario sin sucursal asignada no pertenece a ningún negocio.
  return Boolean((target.colmadoId && g.ids.has(target.colmadoId)) || ramas.some((id) => g.ids.has(id)));
}

userRoutes.get("/api/negocio/usuarios-sucursales", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestorDeUsuarios(db, c.var.user);
  if (!g) return c.json({ error: "Solo el dueño o el colmadero pueden gestionar usuarios" }, 403);
  const todos = await getStaffForOwner(db, c.var.user);
  return c.json({
    usuarios: g.esDueno ? todos : todos.filter((u) => u.role === "operador_sucursal"),
    sucursales: g.sucursales,
    rolesPermitidos: g.roles,
  });
});

userRoutes.post("/api/negocio/usuarios", requireAuth, async (c) => {
  const owner = c.var.user;
  const g = await gestorDeUsuarios(getDb(c.env.DB), owner);
  if (!g) return c.json({ error: "Solo el dueño o el colmadero pueden crear usuarios" }, 403);
  const body = (await c.req.json().catch(() => null)) || {};
  const { email, password, firstName, lastName, role, sucursalIds } = body;
  if (!g.roles.includes(role) && ["admin_pedidos", "operador_sucursal"].includes(role)) {
    return c.json({ error: "El colmadero solo puede crear despachadores" }, 403);
  }
  const rolesValidos = g.roles;
  if (
    typeof email !== "string" || !email.trim() || typeof password !== "string" ||
    typeof firstName !== "string" || !firstName.trim() || !rolesValidos.includes(role)
  ) {
    return c.json({ error: "Nombre, correo, contraseña y rol válido son obligatorios" }, 400);
  }
  { const debil = await claveDebil(password); if (debil) return c.json({ error: debil }, 400); }
  const db = getDb(c.env.DB);
  const ownedIds = g.ids;
  const selectedIds: number[] = Array.isArray(sucursalIds)
    ? [...new Set(sucursalIds.map(Number).filter((id: number) => ownedIds.has(id)))]
    : [];
  if (selectedIds.length === 0) return c.json({ error: "Debes asignar al menos una sucursal" }, 400);

  try {
    const user = await createUser(db, {
      idPrefix: "staff", email, password, firstName,
      lastName: typeof lastName === "string" ? lastName : null,
      role, colmadoId: selectedIds[0],
    });
    await setUserSucursalIds(db, user.id, selectedIds);
    return c.json({
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      role: user.role, sucursalIds: selectedIds,
    }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ese correo ya está registrado" }, 409);
    throw error;
  }
});

userRoutes.patch("/api/negocio/usuarios/:userId", requireAuth, async (c) => {
  const owner = c.var.user;
  const db = getDb(c.env.DB);
  const g = await gestorDeUsuarios(db, owner);
  if (!g) return c.json({ error: "Solo el dueño o el colmadero pueden modificar usuarios" }, 403);
  const target = await getUserById(db, c.req.param("userId"));
  const ownedIds = g.ids;
  if (!target || !(await puedeGestionar(db, g, target))) return c.json({ error: "Usuario no encontrado en tu negocio" }, 404);

  const body = (await c.req.json().catch(() => null)) || {};
  const { email, firstName, lastName, password, role, sucursalIds } = body;
  // El colmadero no puede ascender a un despachador.
  const rolesValidos = g.esDueno ? ["colmado_owner", "admin_pedidos", "operador_sucursal", "delivery"] : ["operador_sucursal"];
  if (typeof email !== "string" || !email.trim() || typeof firstName !== "string" || !firstName.trim() || !rolesValidos.includes(role)) {
    return c.json({ error: "Nombre, correo y rol válido son obligatorios" }, 400);
  }
  // Solo el propio dueño conserva el rol de dueño; no se puede ascender a otro usuario.
  if ((role === "colmado_owner") !== (target.id === owner.id)) {
    return c.json({ error: "No puedes cambiar ese rol" }, 400);
  }
  if (password !== undefined && password !== "") {
    const debil = await claveDebil(password);
    if (debil) return c.json({ error: debil }, 400);
  }
  if (!Array.isArray(sucursalIds) || sucursalIds.length === 0 || sucursalIds.some((id: unknown) => !ownedIds.has(Number(id)))) {
    return c.json({ error: "Debes asignar al menos una sucursal válida" }, 400);
  }
  const existing = await getUserByEmail(db, email);
  if (existing && existing.id !== target.id) return c.json({ error: "Ese correo ya está registrado" }, 409);

  try {
    await updateUser(db, target.id, {
      email: normalizeEmail(email),
      firstName: firstName.trim(),
      lastName: typeof lastName === "string" ? lastName.trim() : "",
      ...(password ? { password } : {}),
    });
    // Contraseña nueva puesta por el dueño: esa persona tiene que volver a entrar en todos sus equipos.
    if (password && target.id !== owner.id) await cerrarSesionesDe(db, target.id);
    await updateUserRole(db, target.id, role, Number(sucursalIds[0]), role === "delivery" ? target.deliveryId : null);
    await setUserSucursalIds(db, target.id, sucursalIds.map(Number));
    const updated = await getUserById(db, target.id);
    return c.json({
      id: updated?.id, email: updated?.email, firstName: updated?.firstName, lastName: updated?.lastName,
      role: updated?.role, sucursalIds: await getUserSucursalIds(db, target.id),
    });
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ese correo ya está registrado" }, 409);
    throw error;
  }
});

userRoutes.put("/api/negocio/usuarios-sucursales/:userId", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const g = await gestorDeUsuarios(db, c.var.user);
  if (!g) return c.json({ error: "Solo el dueño o el colmadero pueden gestionar permisos" }, 403);
  const target = await getUserById(db, c.req.param("userId"));
  const ownedIds = g.ids;
  if (!target || target.role === "colmado_owner" || !(await puedeGestionar(db, g, target))) {
    return c.json({ error: "Empleado o repartidor no encontrado" }, 404);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  const sucursalIds = body.sucursalIds;
  if (!Array.isArray(sucursalIds) || sucursalIds.some((id: unknown) => !ownedIds.has(Number(id)))) {
    return c.json({ error: "Las sucursales seleccionadas no pertenecen a tu negocio" }, 400);
  }
  await setUserSucursalIds(db, target.id, sucursalIds.map(Number));
  return c.json({ success: true, sucursalIds: await getUserSucursalIds(db, target.id) });
});

// ---------- Usuarios de la plataforma (solo platform_admin) ----------

userRoutes.get("/api/admin/users", requireAuth, requireAdmin, async (c) => {
  const all = await getAllUsers(getDb(c.env.DB));
  return c.json(all.map(toPublicUser));
});

userRoutes.patch("/api/admin/users/:id/role", requireAuth, requireAdmin, async (c) => {
  const body = (await c.req.json().catch(() => null)) || {};
  const { role, colmadoId, deliveryId } = body;
  const rolesValidos = ["pending", "colmado_owner", "delivery", "platform_admin"];
  if (!role || !rolesValidos.includes(role)) return c.json({ error: "Rol inválido" }, 400);
  const db = getDb(c.env.DB);
  const target = await getUserById(db, c.req.param("id"));
  if (!target) return c.json({ error: "Usuario no encontrado" }, 404);
  if (target.id === c.var.user.id && role !== "platform_admin") {
    return c.json({ error: "No puedes quitarte el rol de administrador" }, 400);
  }
  await updateUserRole(db, target.id, role, Number(colmadoId) || null, Number(deliveryId) || null);
  return c.json({ success: true });
});

userRoutes.patch("/api/users/:userId", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo el administrador puede editar usuarios" }, 403);
  const db = getDb(c.env.DB);
  const targetUserId = c.req.param("userId");
  const body = (await c.req.json().catch(() => null)) || {};
  const { email, password, firstName, lastName } = body;
  if (email) {
    const existing = await getUserByEmail(db, email);
    if (existing && existing.id !== targetUserId) return c.json({ error: "Ya existe un usuario con este email" }, 409);
  }
  if (password !== undefined && password !== "") {
    const debil = await claveDebil(password);
    if (debil) return c.json({ error: debil }, 400);
  }
  const updated = await updateUser(db, targetUserId, { email, password, firstName, lastName });
  if (!updated) return c.json({ error: "Usuario no encontrado" }, 404);
  if (password) await cerrarSesionesDe(db, targetUserId, targetUserId === c.var.user.id ? c.var.session.id : null);
  return c.json(toPublicUser(updated));
});

userRoutes.delete("/api/users/:userId", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo el administrador puede eliminar usuarios" }, 403);
  const targetUserId = c.req.param("userId");
  if (targetUserId === c.var.user.id) return c.json({ error: "No puedes eliminarte a ti mismo" }, 400);
  await deleteUser(getDb(c.env.DB), targetUserId);
  return c.json({ success: true, message: "Usuario eliminado" });
});
