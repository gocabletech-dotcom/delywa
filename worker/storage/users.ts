import { and, desc, eq, inArray, not } from "drizzle-orm";
import { users, userSucursales, type User } from "@shared/schema";
import type { Db } from "../db";
import { hashPassword } from "../lib/password";
import { getAllColmadoIds, getSucursalesByOwner } from "./colmados";

export type PublicUser = Omit<User, "password">;

export function toPublicUser(user: User): PublicUser {
  const { password: _password, ...rest } = user;
  return rest;
}

function newUserId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserById(db: Db, id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByEmail(db: Db, email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  return user;
}

export async function getAllUsers(db: Db): Promise<User[]> {
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function countPlatformAdmins(db: Db): Promise<number> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "platform_admin"));
  return rows.length;
}

export async function getUserSucursalIds(db: Db, userId: string): Promise<number[]> {
  const rows = await db
    .select({ colmadoId: userSucursales.colmadoId })
    .from(userSucursales)
    .where(eq(userSucursales.userId, userId));
  return rows.map((row) => row.colmadoId);
}

export async function getAccessibleColmadoIds(db: Db, user: User): Promise<number[]> {
  if (user.role === "platform_admin") return getAllColmadoIds(db);
  if (user.role === "colmado_owner") return (await getSucursalesByOwner(db, user.id)).map((c) => c.id);
  const assigned = await getUserSucursalIds(db, user.id);
  return assigned.length ? assigned : user.colmadoId ? [user.colmadoId] : [];
}

export async function canUserAccessColmado(db: Db, user: User, colmadoId: number): Promise<boolean> {
  return (await getAccessibleColmadoIds(db, user)).includes(colmadoId);
}

export async function setUserSucursalIds(db: Db, userId: string, colmadoIds: number[]): Promise<void> {
  const uniqueIds = [...new Set(colmadoIds.filter((id) => Number.isInteger(id) && id > 0))];
  const remove = db.delete(userSucursales).where(eq(userSucursales.userId, userId));
  if (uniqueIds.length === 0) {
    await remove;
    return;
  }
  // D1 no tiene transacciones interactivas: batch ejecuta ambas sentencias de forma atómica.
  await db.batch([
    remove,
    db.insert(userSucursales).values(uniqueIds.map((colmadoId) => ({ userId, colmadoId }))),
  ]);
}

export async function getStaffForOwner(db: Db, owner: User): Promise<Array<PublicUser & { sucursalIds: number[] }>> {
  const branchIds = await getAccessibleColmadoIds(db, owner);
  if (!branchIds.length) return [];
  const staff = await db
    .select()
    .from(users)
    .where(and(inArray(users.colmadoId, branchIds), not(eq(users.role, "platform_admin"))));
  if (!staff.length) return [];
  const assignments = await db
    .select()
    .from(userSucursales)
    .where(inArray(userSucursales.userId, staff.map((user) => user.id)));
  return staff.map((user) => ({
    ...toPublicUser(user),
    sucursalIds: assignments.filter((a) => a.userId === user.id).map((a) => a.colmadoId),
  }));
}

export async function updateUserRole(
  db: Db,
  userId: string,
  role: string,
  colmadoId: number | null,
  deliveryId: number | null,
): Promise<void> {
  await db.update(users).set({ role, colmadoId, deliveryId, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function createUser(
  db: Db,
  data: {
    idPrefix: "admin" | "owner" | "staff";
    email: string;
    password: string;
    firstName: string;
    lastName?: string | null;
    role: string;
    colmadoId?: number | null;
  },
): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({
      id: newUserId(data.idPrefix),
      email: normalizeEmail(data.email),
      password: await hashPassword(data.password),
      firstName: data.firstName.trim(),
      lastName: data.lastName?.trim() || null,
      role: data.role,
      colmadoId: data.colmadoId ?? null,
    })
    .returning();
  return user;
}

export async function updateUser(
  db: Db,
  userId: string,
  data: { email?: string; password?: string; firstName?: string; lastName?: string },
): Promise<User | undefined> {
  const updateData: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (data.email !== undefined) {
    updateData.email = normalizeEmail(data.email);
    // Un correo distinto hay que confirmarlo de nuevo.
    const [antes] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    if (antes && antes.email !== updateData.email) updateData.emailVerificadoAt = null;
  }
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.password) updateData.password = await hashPassword(data.password);
  const [user] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
  return user;
}

export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export { isUniqueViolation } from "../lib/d1";
