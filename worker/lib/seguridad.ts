import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { avisosEnviados, bitacora, botNoEntendidos, errores, users } from "@shared/schema";
import type { AppEnv, Env } from "../env";
import { getDb, type Db } from "../db";
import { correoListo, enviarCorreo, escHtml, plantillaCorreo } from "./correo";

// ---------- Encabezados de seguridad (respuestas del Worker; las páginas usan client/public/_headers) ----------

export const cabecerasSeguridad: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  if (c.res.status === 101) return; // WebSocket del tiempo real
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Strict-Transport-Security", "max-age=31536000");
  if (new URL(c.req.url).pathname.startsWith("/uploads/")) {
    // Una imagen subida nunca se ejecuta como página.
    c.header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  }
};

// ---------- Bitácora ----------

/** Rutas que cambian cosas pero no hace falta anotar (ruido o ya se anotan aparte). */
const SIN_BITACORA = [
  /^\/api\/auth\//, /^\/api\/chat-web\//, /^\/api\/chat-colmado\//, /^\/api\/webhook/, /^\/api\/uploads\/archivo\//,
  /^\/api\/portal-repartidor\/heartbeat/, /^\/api\/deliveries\/\d+\/ubicacion/, /^\/api\/conversaciones\/\d+\/read/,
  /^\/api\/menu-grafico\//, /^\/api\/registro-negocio/, /^\/api\/empleado\/portal\//,
];

export async function anotar(db: Db, datos: { userId?: string | null; usuario?: string | null; rol?: string | null; colmadoId?: number | null; accion: string; detalle?: string | null; ip?: string | null }) {
  try {
    await db.insert(bitacora).values({
      userId: datos.userId ?? null, usuario: datos.usuario?.slice(0, 120) ?? null, rol: datos.rol ?? null, colmadoId: datos.colmadoId ?? null,
      accion: datos.accion.slice(0, 200), detalle: datos.detalle?.slice(0, 500) ?? null, ip: datos.ip ?? null,
    });
  } catch (err) {
    console.error("[bitacora] No se pudo anotar:", err instanceof Error ? err.message : err);
  }
}

/** Anota cada cambio que sale bien de un usuario con sesión: quién, qué ruta, de qué sucursal. Sin el cuerpo. */
export const bitacoraCambios: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const metodo = c.req.method;
  if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS" || c.res.status >= 400) return;
  const ruta = new URL(c.req.url).pathname;
  if (SIN_BITACORA.some((r) => r.test(ruta))) return;
  const user = c.get("user");
  if (!user) return;
  const tarea = anotar(getDb(c.env.DB), {
    userId: user.id, usuario: user.email, rol: user.role, colmadoId: c.var.session?.data.colmadoId ?? user.colmadoId ?? null,
    accion: `${metodo} ${ruta}`, detalle: c.get("bitacoraDetalle") ?? null, ip: c.req.header("CF-Connecting-IP") ?? null,
  });
  try { c.executionCtx.waitUntil(tarea); } catch { await tarea; }
};

// ---------- Errores del servidor ----------

const UMBRAL = 5;
const VENTANA_MS = 10 * 60 * 1000;

/** Guarda el error; si hay 5 o más en 10 minutos, avisa por correo a la plataforma (máximo uno por hora). */
export async function registrarError(env: Env, datos: { ref: string; origen?: string; metodo?: string; ruta?: string; error: unknown }): Promise<void> {
  try {
    const db = getDb(env.DB);
    const e = datos.error;
    await db.insert(errores).values({
      ref: datos.ref, origen: datos.origen ?? "api", metodo: datos.metodo ?? null, ruta: datos.ruta?.slice(0, 300) ?? null,
      mensaje: String((e instanceof Error ? e.message : e) ?? "").slice(0, 500), pila: e instanceof Error ? String(e.stack ?? "").slice(0, 3000) : null,
    });
    const recientes = await db.select().from(errores).where(gt(errores.fecha, new Date(Date.now() - VENTANA_MS))).orderBy(sql`${errores.id} desc`).limit(20);
    if (recientes.length < UMBRAL || !correoListo(env)) return;
    // Una vez por hora como máximo.
    const clave = `errores:${new Date().toISOString().slice(0, 13)}`;
    const nueva = await db.insert(avisosEnviados).values({ clave }).onConflictDoNothing().returning();
    if (!nueva.length) return;
    const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "platform_admin"));
    const filas = recientes.map((x) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${escHtml(x.fecha.toISOString().slice(11, 19))}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${escHtml(x.metodo ?? "")} ${escHtml(x.ruta ?? "")}<br><small>ref ${escHtml(x.ref)}</small></td><td style="padding:4px 8px;border-bottom:1px solid #eee">${escHtml(x.mensaje ?? "")}</td></tr>`).join("");
    const html = plantillaCorreo(`DelyWa tuvo ${recientes.length} errores en 10 minutos`,
      `<p>Puede que un negocio no esté pudiendo trabajar. Estos son los últimos (hora UTC):</p><table style="border-collapse:collapse;font-size:13px">${filas}</table><p>Mira el detalle en Plataforma → Seguridad → Errores del sistema, o en Cloudflare → Workers → delywa → Logs buscando la referencia.</p><p style="color:#777">Este aviso se manda como máximo una vez por hora.</p>`);
    for (const a of admins) {
      if (a.email) await enviarCorreo(env, { para: a.email, asunto: `⚠️ DelyWa: ${recientes.length} errores en 10 minutos`, html }).catch((er) => console.error("[errores] Aviso no enviado:", er instanceof Error ? er.message : er));
    }
  } catch (err) {
    console.error("[errores] No se pudo registrar:", err instanceof Error ? err.message : err);
  }
}

/** Limpieza diaria: errores de más de 30 días, bitácora de más de 180, avisos de más de 120, frases no entendidas de más de 60. */
export async function limpiarSeguridad(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const dia = 24 * 60 * 60 * 1000;
  await db.batch([
    db.delete(errores).where(lt(errores.fecha, new Date(Date.now() - 30 * dia))),
    db.delete(bitacora).where(lt(bitacora.fecha, new Date(Date.now() - 180 * dia))),
    db.delete(avisosEnviados).where(and(lt(avisosEnviados.fecha, new Date(Date.now() - 120 * dia)))),
    db.delete(botNoEntendidos).where(lt(botNoEntendidos.fecha, new Date(Date.now() - 60 * dia))),
  ]);
}
