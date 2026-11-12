import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { configuracionSistema } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAuth } from "../lib/auth";
import { timingSafeEqual, verifyAgainstDummy, verifyPassword } from "../lib/password";
import { turnstileDelLogin, verificarTurnstile } from "../lib/turnstile";
import { clearLoginFailures, loginBlockedFor, recordLoginFailure } from "../lib/rate-limit";
import {
  countPlatformAdmins, createUser, getAccessibleColmadoIds, getUserByEmail, getUserById,
  isUniqueViolation, normalizeEmail, toPublicUser,
} from "../storage/users";

const SETUP_CODE_KEY = "setup_code";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const username = typeof body?.username === "string" ? normalizeEmail(body.username) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) return c.json({ error: "Usuario o contraseña incorrectos" }, 401);

  const db = getDb(c.env.DB);
  const ip = c.req.header("CF-Connecting-IP");
  const blockedFor = await loginBlockedFor(db, username, ip);
  if (blockedFor > 0) {
    c.header("Retry-After", String(blockedFor));
    const minutos = Math.ceil(blockedFor / 60);
    return c.json({ error: `Demasiados intentos. Intenta de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"}.` }, 429);
  }

  // Turnstile (si la plataforma lo activó): se comprueba antes de mirar la contraseña.
  const turnstile = turnstileDelLogin(c.env);
  if (turnstile && !(await verificarTurnstile(turnstile.secreto, body?.turnstileToken, ip))) {
    return c.json({ error: "Completa la verificación de seguridad e intenta de nuevo.", turnstile: true }, 400);
  }

  const user = await getUserByEmail(db, username);
  let valid = false;
  if (user?.password) valid = await verifyPassword(password, user.password);
  else await verifyAgainstDummy(password);

  if (!user || !valid) {
    await recordLoginFailure(db, username, ip);
    return c.json({ error: "Usuario o contraseña incorrectos" }, 401);
  }

  await clearLoginFailures(db, username);
  const session = c.var.session;
  session.regenerate();
  session.data = {
    userId: user.id,
    userRole: user.role,
    colmadoId: user.colmadoId,
    deliveryId: user.deliveryId,
    lastActivity: Date.now(),
  };
  session.touch();
  return c.json({
    success: true,
    role: user.role,
    colmadoId: user.colmadoId,
    message: `Bienvenido ${user.firstName || username}`,
  });
});

/** Público: la clave del sitio de Turnstile para dibujar la verificación en el login (solo si está activo). */
authRoutes.get("/api/auth/turnstile", (c) => {
  const t = turnstileDelLogin(c.env);
  return c.json(t ? { activo: true, siteKey: t.siteKey } : { activo: false });
});

authRoutes.get("/api/auth/session", async (c) => {
  const userId = c.var.session.data.userId;
  if (userId) {
    const user = await getUserById(getDb(c.env.DB), userId);
    if (user) {
      return c.json({
        isAuthenticated: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          email: user.email,
          role: user.role,
          colmadoId: user.colmadoId,
          deliveryId: user.deliveryId,
        },
      });
    }
  }
  return c.json({ isAuthenticated: false });
});

authRoutes.post("/api/auth/logout", (c) => {
  c.var.session.destroy();
  return c.json({ success: true });
});

authRoutes.get("/api/auth/user", requireAuth, (c) => c.json(toPublicUser(c.var.user)));

authRoutes.get("/api/user/role", async (c) => {
  const session = c.var.session;
  if (!session.data.userId) return c.json({ error: "No autenticado" }, 401);
  const db = getDb(c.env.DB);
  const user = await getUserById(db, session.data.userId);
  if (!user) return c.json({ error: "Usuario no encontrado" }, 404);
  const colmadoId = session.data.colmadoId || user.colmadoId;
  return c.json({
    role: user.role,
    colmadoId,
    deliveryId: user.deliveryId,
    sucursalId: colmadoId,
    sucursales: await getAccessibleColmadoIds(db, user),
  });
});

// ---------- Primer acceso: crear el administrador de la plataforma ----------
// Solo funciona mientras no exista ningún platform_admin y con el código de un
// solo uso guardado en configuracion_sistema (clave setup_code).

async function getSetupCode(db: ReturnType<typeof getDb>): Promise<string | null> {
  const [row] = await db.select().from(configuracionSistema).where(eq(configuracionSistema.clave, SETUP_CODE_KEY));
  return row?.valor?.trim() || null;
}

authRoutes.get("/api/auth/setup", async (c) => {
  const db = getDb(c.env.DB);
  const disponible = (await countPlatformAdmins(db)) === 0 && (await getSetupCode(db)) !== null;
  return c.json({ disponible });
});

authRoutes.post("/api/auth/setup", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const codigo = typeof body?.codigo === "string" ? body.codigo.trim() : "";

  const ip = c.req.header("CF-Connecting-IP");
  const blockedFor = await loginBlockedFor(db, "setup", ip);
  if (blockedFor > 0) return c.json({ error: "Demasiados intentos. Intenta más tarde." }, 429);

  const setupCode = await getSetupCode(db);
  if ((await countPlatformAdmins(db)) > 0 || !setupCode) {
    return c.json({ error: "El primer acceso ya no está disponible" }, 403);
  }
  const enc = new TextEncoder();
  if (!codigo || !timingSafeEqual(enc.encode(codigo), enc.encode(setupCode))) {
    await recordLoginFailure(db, "setup", ip);
    return c.json({ error: "Código de instalación incorrecto" }, 403);
  }
  if (!EMAIL_RE.test(email) || !firstName || password.length < 10) {
    return c.json({ error: "Nombre, correo válido y contraseña de mínimo 10 caracteres son obligatorios" }, 400);
  }

  try {
    const user = await createUser(db, { idPrefix: "admin", email, password, firstName, role: "platform_admin" });
    await db.delete(configuracionSistema).where(eq(configuracionSistema.clave, SETUP_CODE_KEY));
    const session = c.var.session;
    session.regenerate();
    session.data = { userId: user.id, userRole: user.role, colmadoId: null, deliveryId: null, lastActivity: Date.now() };
    session.touch();
    return c.json({ success: true, role: user.role }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json({ error: "Ese correo ya está registrado" }, 409);
    throw error;
  }
});
