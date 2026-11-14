import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { configuracionSistema } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAuth } from "../lib/auth";
import { claveDebil } from "../lib/claves";
import { correoListo, SOPORTE } from "../lib/correo";
import { mandarCodigoCuenta, marcarCorreoConfirmado, revisarCodigoRegistro, cerrarSesionesDe, mandarEnlaceRecuperacion, revisarEquipo, usarEnlaceRecuperacion, usuarioDeId } from "../lib/cuenta";
import { anotar } from "../lib/seguridad";
import { timingSafeEqual, verifyAgainstDummy, verifyPassword } from "../lib/password";
import { turnstileDelLogin, verificarTurnstile } from "../lib/turnstile";
import { LOGIN, borrarEventos, contarEventos, loginBlockedFor, permitirEvento, recordLoginFailure, registrarEvento } from "../lib/rate-limit";
import {
  countPlatformAdmins, createUser, updateUser, getAccessibleColmadoIds, getUserByEmail, getUserById,
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
  const ip = c.req.header("CF-Connecting-IP") ?? "sin-ip";
  const claveIp = `login:ip:${ip}`, claveFallos = `loginf:${ip}:${username}`, claveCorreo = `loginfe:${username}`;

  // 1. Freno por conexión (todos los intentos) y por conexión + correo (solo fallos). La cuenta nunca se bloquea.
  const intentosIp = await contarEventos(db, claveIp, LOGIN.ventanaIpMs);
  if (intentosIp >= LOGIN.maxPorIp) return c.json({ error: "Demasiados intentos desde esta conexión. Espera unos minutos y vuelve a intentar." }, 429);
  const fallos = await contarEventos(db, claveFallos, LOGIN.ventanaFallosMs);
  if (fallos >= LOGIN.maxFallosIpCorreo) {
    c.header("Retry-After", String(LOGIN.ventanaFallosMs / 1000));
    return c.json({ error: "Demasiados intentos fallidos con ese correo desde esta conexión. Espera 15 minutos." }, 429);
  }
  await registrarEvento(db, claveIp);

  // 2. Turnstile solo cuando hace falta: después de 3 fallos o muchos intentos desde la conexión.
  const turnstile = turnstileDelLogin(c.env);
  if (turnstile && (fallos >= LOGIN.fallosParaTurnstile || intentosIp >= LOGIN.intentosIpParaTurnstile)
    && !(await verificarTurnstile(turnstile.secreto, body?.turnstileToken, ip))) {
    return c.json({ error: "Confirma que no eres un robot y vuelve a tocar Iniciar Sesión.", turnstile: true, siteKey: turnstile.siteKey }, 403);
  }

  const user = await getUserByEmail(db, username);
  let valid = false;
  if (user?.password) valid = await verifyPassword(password, user.password);
  else await verifyAgainstDummy(password);

  if (!user || !valid) {
    await registrarEvento(db, claveFallos, claveCorreo);
    // Muchos fallos contra un mismo correo (desde cualquier conexión): cada intento tarda más.
    const fallosCorreo = await contarEventos(db, claveCorreo, 60 * 60 * 1000);
    const espera = Math.min(LOGIN.esperaBaseMs + fallosCorreo * LOGIN.esperaPorFalloMs, 4000);
    if (espera > 0 && LOGIN.esperaPorFalloMs > 0) await new Promise((r) => setTimeout(r, espera));
    return c.json({ error: "Usuario o contraseña incorrectos" }, 401);
  }

  await borrarEventos(db, claveFallos);
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
  await revisarEquipo(c, db, user);
  await anotar(db, { userId: user.id, usuario: user.email, rol: user.role, colmadoId: user.colmadoId, accion: "Inicio de sesión", ip });
  return c.json({
    success: true,
    role: user.role,
    colmadoId: user.colmadoId,
    message: `Bienvenido ${user.firstName || username}`,
  });
});

// ---------- ¿Olvidaste tu contraseña? ----------

const RESPUESTA_RECUPERAR = "Si existe una cuenta con ese correo, te mandamos un enlace para poner una contraseña nueva. Revisa tu bandeja y la carpeta de spam.";

/** Público: ¿se puede recuperar la contraseña por correo? (el login muestra o esconde el enlace). */
authRoutes.get("/api/auth/recuperar", (c) => c.json({ disponible: correoListo(c.env) }));

authRoutes.post("/api/auth/recuperar", async (c) => {
  if (!correoListo(c.env)) return c.json({ error: `La recuperación por correo todavía no está activada. Escríbenos a ${SOPORTE}.` }, 503);
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!EMAIL_RE.test(email)) return c.json({ error: "Escribe tu correo." }, 400);
  const db = getDb(c.env.DB);
  const ip = c.req.header("CF-Connecting-IP") ?? "sin-ip";
  if (!(await permitirEvento(db, `recuperar:${ip}`, 5, 60 * 60 * 1000))) return c.json({ error: "Demasiados intentos desde esta conexión. Espera una hora." }, 429);
  // Por correo, 3 por hora; de más, se responde igual sin mandar nada (no se revela si la cuenta existe).
  if (await permitirEvento(db, `recuperar:${email}`, 3, 60 * 60 * 1000)) await mandarEnlaceRecuperacion(c, db, await getUserByEmail(db, email));
  return c.json({ ok: true, mensaje: RESPUESTA_RECUPERAR });
});

authRoutes.post("/api/auth/recuperar/cambiar", async (c) => {
  const body = await c.req.json().catch(() => null);
  const db = getDb(c.env.DB);
  const ip = c.req.header("CF-Connecting-IP") ?? "sin-ip";
  if (!(await permitirEvento(db, `recuperarc:${ip}`, 20, 60 * 60 * 1000))) return c.json({ error: "Demasiados intentos. Espera una hora." }, 429);
  const debil = await claveDebil(body?.password);
  if (debil) return c.json({ error: debil }, 400);
  const userId = await usarEnlaceRecuperacion(db, typeof body?.token === "string" ? body.token : "");
  if (!userId) return c.json({ error: "El enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." }, 400);
  await updateUser(db, userId, { password: body.password });
  // Abrió el enlace que llegó a su correo: el correo es suyo.
  await marcarCorreoConfirmado(db, userId);
  await cerrarSesionesDe(db, userId);
  const user = await usuarioDeId(db, userId);
  await anotar(db, { userId, usuario: user?.email, rol: user?.role, colmadoId: user?.colmadoId, accion: "Cambió su contraseña con el enlace del correo", ip });
  return c.json({ ok: true, mensaje: "Listo. Ya puedes entrar con tu contraseña nueva." });
});

// ---------- Confirmar el correo de una cuenta que ya existe ----------

authRoutes.post("/api/auth/correo/codigo", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const user = c.var.user;
  if (!correoListo(c.env)) return c.json({ error: "La plataforma todavía no tiene activado el envío de correos." }, 503);
  if (!user.email) return c.json({ error: "Tu cuenta no tiene correo." }, 400);
  if (user.emailVerificadoAt) return c.json({ ok: true, yaConfirmado: true });
  if (!(await permitirEvento(db, `correocodigo:${user.id}`, 4, 60 * 60 * 1000))) {
    return c.json({ error: `Ya se mandaron varios códigos. Espera una hora o escríbenos a ${SOPORTE}.` }, 429);
  }
  try {
    await mandarCodigoCuenta(c.env, db, user.email, user.firstName || "");
  } catch (err) {
    console.error("[correo] Código no enviado:", err instanceof Error ? err.message : err);
    return c.json({ error: "No se pudo mandar el código. Intenta en unos minutos." }, 502);
  }
  return c.json({ ok: true, correo: user.email });
});

authRoutes.post("/api/auth/correo/confirmar", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const codigo = typeof body?.codigo === "string" ? body.codigo : "";
  if (!user.email || !codigo) return c.json({ error: "Escribe el código de 6 números." }, 400);
  const r = await revisarCodigoRegistro(db, user.email, codigo);
  if (r === "vencido") return c.json({ error: "El código venció o no existe. Pide otro.", codigoVencido: true }, 400);
  if (r === "muchos") return c.json({ error: "Demasiados códigos equivocados. Pide otro.", codigoVencido: true }, 429);
  if (r === "equivocado") return c.json({ error: `Código equivocado. Revisa el correo que te mandamos a ${user.email}.` }, 400);
  await marcarCorreoConfirmado(db, user.id);
  await anotar(db, { userId: user.id, usuario: user.email, rol: user.role, colmadoId: user.colmadoId, accion: "Confirmó su correo", ip: c.req.header("CF-Connecting-IP") ?? null });
  return c.json({ ok: true });
});

/** Público: la clave del sitio de Turnstile (el login la muestra solo cuando el servidor la pide). */
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
          emailVerificado: Boolean(user.emailVerificadoAt),
        },
        // Solo se pide confirmar cuando la plataforma puede mandar correos.
        correoActivo: correoListo(c.env),
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
  { const debil = await claveDebil(password); if (debil) return c.json({ error: debil }, 400); }

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
