import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { claveDebil } from "../lib/claves";
import { getSucursalesByOwner } from "../storage/colmados";
import {
  createUser, deleteUser, getAllUsers, getStaffForOwner, getUserByEmail, getUserById, getUserSucursalIds,
  isUniqueViolation, normalizeEmail, setUserSucursalIds, toPublicUser, updateUser, updateUserRole,
} from "../storage/users";

export const userRoutes = new Hono<AppEnv>();

// ---------- Usuarios del negocio (los gestiona el dueño) ----------

userRoutes.get("/api/negocio/usuarios-sucursales", requireAuth, async (c) => {
  const owner = c.var.user;
  if (owner.role !== "colmado_owner") return c.json({ error: "Solo el dueño puede gestionar permisos" }, 403);
  const db = getDb(c.env.DB);
  return c.json({
    usuarios: await getStaffForOwner(db, owner),
    sucursales: await getSucursalesByOwner(db, owner.id),
  });
});

userRoutes.post("/api/negocio/usuarios", requireAuth, async (c) => {
  const owner = c.var.user;
  if (owner.role !== "colmado_owner" || !owner.colmadoId) {
    return c.json({ error: "Solo el administrador del negocio puede crear usuarios" }, 403);
  }
  const body = (await c.req.json().catch(() => null)) || {};
  const { email, password, firstName, lastName, role, sucursalIds } = body;
  const rolesValidos = ["admin_pedidos", "operador_sucursal"];
  if (
    typeof email !== "string" || !email.trim() || typeof password !== "string" ||
    typeof firstName !== "string" || !firstName.trim() || !rolesValidos.includes(role)
  ) {
    return c.json({ error: "Nombre, correo, contraseña y rol válido son obligatorios" }, 400);
  }
  { const debil = await claveDebil(password); if (debil) return c.json({ error: debil }, 400); }
  const db = getDb(c.env.DB);
  const ownedIds = new Set((await getSucursalesByOwner(db, owner.id)).map((branch) => branch.id));
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
  if (owner.role !== "colmado_owner") {
    return c.json({ error: "Solo el administrador del negocio puede modificar usuarios" }, 403);
  }
  const db = getDb(c.env.DB);
  const target = await getUserById(db, c.req.param("userId"));
  const ownedIds = new Set((await getSucursalesByOwner(db, owner.id)).map((s) => s.id));
  const targetBranchIds = target ? await getUserSucursalIds(db, target.id) : [];
  const fueraDelNegocio = !target ||
    (target.role === "colmado_owner" && target.id !== owner.id) ||
    target.role === "platform_admin" ||
    // Un usuario sin sucursal asignada no pertenece a ningún negocio.
    !((target.colmadoId && ownedIds.has(target.colmadoId)) || targetBranchIds.some((id) => ownedIds.has(id)));
  if (fueraDelNegocio || !target) return c.json({ error: "Usuario no encontrado en tu negocio" }, 404);

  const body = (await c.req.json().catch(() => null)) || {};
  const { email, firstName, lastName, password, role, sucursalIds } = body;
  const rolesValidos = ["colmado_owner", "admin_pedidos", "operador_sucursal", "delivery"];
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
  const owner = c.var.user;
  if (owner.role !== "colmado_owner") return c.json({ error: "Solo el dueño puede gestionar permisos" }, 403);
  const db = getDb(c.env.DB);
  const target = await getUserById(db, c.req.param("userId"));
  const ownedIds = new Set((await getSucursalesByOwner(db, owner.id)).map((s) => s.id));
  const targetBranchIds = target ? await getUserSucursalIds(db, target.id) : [];
  if (
    !target || target.role === "colmado_owner" || target.role === "platform_admin" ||
    !((target.colmadoId && ownedIds.has(target.colmadoId)) || targetBranchIds.some((id) => ownedIds.has(id)))
  ) {
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
  const updated = await updateUser(db, targetUserId, { email, password, firstName, lastName });
  if (!updated) return c.json({ error: "Usuario no encontrado" }, 404);
  return c.json(toPublicUser(updated));
});

userRoutes.delete("/api/users/:userId", requireAuth, async (c) => {
  if (c.var.user.role !== "platform_admin") return c.json({ error: "Solo el administrador puede eliminar usuarios" }, 403);
  const targetUserId = c.req.param("userId");
  if (targetUserId === c.var.user.id) return c.json({ error: "No puedes eliminarte a ti mismo" }, 400);
  await deleteUser(getDb(c.env.DB), targetUserId);
  return c.json({ success: true, message: "Usuario eliminado" });
});
