import { and, eq, sql } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { codigosCorreo, dispositivos, recuperaciones, sessions, users, type User } from "@shared/schema";
import type { AppEnv, Env } from "../env";
import type { Db } from "../db";
import { boton, correoListo, destacado, enviarCorreo, escHtml, plantillaCorreo } from "./correo";

// Cuenta: olvidé mi contraseña, código de registro por correo y aviso de equipo nuevo (traído de FoodPOS).

export async function sha256(texto: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const aleatorio = (bytes = 24) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const base = (env: Env, c?: Context<AppEnv>) => (env.PUBLIC_URL || (c ? new URL(c.req.url).origin : "https://delywa.com")).replace(/\/+$/, "");

// ---------- Olvidé mi contraseña ----------

const VIGENCIA_ENLACE_MS = 30 * 60 * 1000;

/** Manda el enlace (si la cuenta existe). La respuesta al navegador es siempre la misma. */
export async function mandarEnlaceRecuperacion(c: Context<AppEnv>, db: Db, user: User | undefined): Promise<void> {
  if (!user?.email || !user.password) return;
  const token = aleatorio(24);
  await db.insert(recuperaciones).values({ tokenHash: await sha256(token), userId: user.id, expira: new Date(Date.now() + VIGENCIA_ENLACE_MS) });
  const enlace = `${base(c.env, c)}/recuperar?t=${token}`;
  const html = plantillaCorreo("Cambia tu contraseña de DelyWa",
    `<p>Hola${user.firstName ? ` ${escHtml(user.firstName)}` : ""}: alguien (ojalá tú) pidió cambiar la contraseña de tu cuenta.</p>${boton("Poner una contraseña nueva", enlace)}<p>El enlace sirve una sola vez y vence en 30 minutos. Si no fuiste tú, ignora este correo: tu contraseña sigue igual.</p>`, { resumen: "Enlace para poner una contraseña nueva (vence en 30 minutos)." });
  try {
    await enviarCorreo(c.env, { para: user.email, asunto: "Cambia tu contraseña de DelyWa", html });
  } catch (err) {
    console.error("[cuenta] Enlace de recuperación no enviado:", err instanceof Error ? err.message : err);
  }
}

/** Usa el enlace: devuelve el usuario si es válido y lo marca como usado. */
export async function usarEnlaceRecuperacion(db: Db, token: string): Promise<string | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const [fila] = await db.update(recuperaciones).set({ usado: true })
    .where(and(eq(recuperaciones.tokenHash, tokenHash), eq(recuperaciones.usado, false), sql`${recuperaciones.expira} > ${Date.now()}`))
    .returning();
  return fila?.userId ?? null;
}

/** Después de cambiar la contraseña se cierran todas las sesiones abiertas de esa persona. */
export async function cerrarSesionesDe(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(sql`json_extract(${sessions.sess}, '$.userId') = ${userId}`);
}

// ---------- Código de registro ----------

const VIGENCIA_CODIGO_MS = 20 * 60 * 1000;

export async function mandarCodigoRegistro(env: Env, db: Db, email: string, nombre: string, negocio: string): Promise<void> {
  const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const fila = { email, codigoHash: await sha256(`${email}:${codigo}`), expira: new Date(Date.now() + VIGENCIA_CODIGO_MS), intentos: 0 };
  await db.insert(codigosCorreo).values(fila).onConflictDoUpdate({ target: codigosCorreo.email, set: fila });
  await enviarCorreo(env, {
    para: email, asunto: `${codigo} es tu código de DelyWa`,
    html: plantillaCorreo("Confirma tu correo", `<p>Hola ${escHtml(nombre)}: para crear <b>${escHtml(negocio)}</b> en DelyWa, escribe este código:</p>${destacado(codigo)}<p>Vence en 20 minutos. Si no fuiste tú, ignora este correo.</p>`, { resumen: `Tu código es ${codigo}. Vence en 20 minutos.` }),
  });
}

export type ResultadoCodigo = "ok" | "vencido" | "muchos" | "equivocado";
export async function revisarCodigoRegistro(db: Db, email: string, codigo: string): Promise<ResultadoCodigo> {
  const [fila] = await db.select().from(codigosCorreo).where(eq(codigosCorreo.email, email));
  if (!fila || fila.expira.getTime() < Date.now()) return "vencido";
  if (fila.intentos >= 5) return "muchos";
  if (fila.codigoHash !== (await sha256(`${email}:${codigo.replace(/\D/g, "").slice(0, 6)}`))) {
    await db.update(codigosCorreo).set({ intentos: fila.intentos + 1 }).where(eq(codigosCorreo.email, email));
    return "equivocado";
  }
  await db.delete(codigosCorreo).where(eq(codigosCorreo.email, email));
  return "ok";
}

// ---------- Equipo nuevo ----------

const COOKIE_EQUIPO = "delywa_disp";
const DIAS_EQUIPO = 400;

/**
 * Al entrar: si este navegador no es uno conocido de la persona, se anota y, si ya tenía
 * otros equipos, se le avisa por correo («¿fuiste tú?»). El primer equipo no genera aviso.
 */
export async function revisarEquipo(c: Context<AppEnv>, db: Db, user: User): Promise<void> {
  const actual = getCookie(c, COOKIE_EQUIPO);
  const nombre = (c.req.header("User-Agent") ?? "Navegador desconocido").slice(0, 160);
  if (actual && /^[0-9a-f]{48}$/.test(actual)) {
    const huella = await sha256(actual);
    const [conocido] = await db.select().from(dispositivos).where(and(eq(dispositivos.tokenHash, huella), eq(dispositivos.userId, user.id)));
    if (conocido) {
      await db.update(dispositivos).set({ visto: new Date() }).where(eq(dispositivos.tokenHash, huella));
      return;
    }
  }
  const token = aleatorio(24);
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(dispositivos).where(eq(dispositivos.userId, user.id));
  await db.insert(dispositivos).values({ tokenHash: await sha256(token), userId: user.id, nombre });
  setCookie(c, COOKIE_EQUIPO, token, { path: "/api/auth", httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Strict", maxAge: DIAS_EQUIPO * 86400 });
  if (Number(total) === 0 || !user.email || !correoListo(c.env)) return;
  const cf = (c.req.raw as unknown as { cf?: { city?: string; country?: string } }).cf;
  const lugar = [cf?.city, cf?.country].filter(Boolean).join(", ");
  const cuando = new Date().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "long", timeStyle: "short" });
  const html = plantillaCorreo("Nuevo inicio de sesión en tu cuenta",
    `<p>Hola${user.firstName ? ` ${escHtml(user.firstName)}` : ""}: alguien entró a tu cuenta de DelyWa desde un equipo nuevo.</p><ul><li><b>Cuándo:</b> ${escHtml(cuando)} (hora de RD)</li><li><b>Equipo:</b> ${escHtml(nombre)}</li>${lugar ? `<li><b>Lugar aproximado:</b> ${escHtml(lugar)}</li>` : ""}</ul><p>Si fuiste tú, no tienes que hacer nada. <b>Si no fuiste tú</b>, cambia tu contraseña ahora mismo desde «¿Olvidaste tu contraseña?» en ${escHtml(base(c.env, c))}/login: al cambiarla se cierran todas las sesiones.</p>`);
  const tarea = enviarCorreo(c.env, { para: user.email, asunto: "Nuevo inicio de sesión en DelyWa", html })
    .catch((err) => console.error("[cuenta] Aviso de equipo nuevo no enviado:", err instanceof Error ? err.message : err));
  try { c.executionCtx.waitUntil(tarea); } catch { await tarea; }
}

/** Equipos sin usar en más de 400 días se olvidan. */
export async function olvidarEquiposViejos(db: Db): Promise<void> {
  await db.delete(dispositivos).where(sql`${dispositivos.visto} < ${Date.now() - DIAS_EQUIPO * 86400 * 1000}`);
  await db.delete(recuperaciones).where(sql`${recuperaciones.expira} < ${Date.now() - 86400 * 1000}`);
  await db.delete(codigosCorreo).where(sql`${codigosCorreo.expira} < ${Date.now() - 86400 * 1000}`);
}

export const usuarioDeId = async (db: Db, id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
