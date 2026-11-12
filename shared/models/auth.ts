import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, numeric, unique, index, primaryKey } from "drizzle-orm/sqlite-core";

// Sesiones del servidor (cookie firmada -> fila en D1).
export const sessions = sqliteTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: text("sess", { mode: "json" }).notNull(),
    expire: integer("expire", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  whatsappNumero: text("whatsapp_numero"),
  password: text("password"),
  role: text("role").default("pending"),
  colmadoId: integer("colmado_id"),
  deliveryId: integer("delivery_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
});

/** Branches explicitly assigned to a staff member. An empty set keeps the
 * legacy colmadoId access until the owner configures branch permissions. */
export const userSucursales = sqliteTable("user_sucursales", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  colmadoId: integer("colmado_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.colmadoId] }),
  index("user_sucursales_colmado_idx").on(table.colmadoId),
]);

export type UserSucursal = typeof userSucursales.$inferSelect;

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

/** Intentos fallidos de inicio de sesión, para limitar ataques de fuerza bruta. */
export const loginIntentos = sqliteTable("login_intentos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clave: text("clave").notNull(), // "user:<correo>" o "ip:<dirección>"
  fecha: integer("fecha", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (table) => [index("login_intentos_clave_fecha_idx").on(table.clave, table.fecha)]);

/** Subidas autorizadas y aún no recibidas: cada enlace sirve una sola vez y vence a los 10 minutos. */
export const subidasPendientes = sqliteTable("subidas_pendientes", {
  token: text("token").primaryKey(),
  clave: text("clave").notNull(), // ruta del archivo dentro del bucket R2
  contentType: text("content_type").notNull(),
  maxBytes: integer("max_bytes").notNull(),
  ip: text("ip"),
  usada: integer("usada", { mode: "boolean" }).notNull().default(false),
  expiraEn: integer("expira_en", { mode: "timestamp_ms" }).notNull(),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (table) => [index("subidas_pendientes_ip_fecha_idx").on(table.ip, table.fechaCreacion)]);

/**
 * Constancia de que el dueño aceptó los términos, la privacidad y el DPA al registrar su negocio:
 * qué documento, qué versión, cuándo y desde qué IP. Se guarda aunque luego cambie el texto.
 */
export const aceptacionesLegales = sqliteTable("aceptaciones_legales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  colmadoId: integer("colmado_id"),
  documento: text("documento").notNull(), // terminos, privacidad, dpa
  version: text("version").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  fecha: integer("fecha", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (table) => [index("aceptaciones_legales_user_idx").on(table.userId), index("aceptaciones_legales_colmado_idx").on(table.colmadoId)]);
