import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq, lt } from "drizzle-orm";
import { sessions } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb } from "../db";

export const SESSION_COOKIE = "delywa_sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 semana
const ACTIVITY_WRITE_INTERVAL_MS = 60_000; // no escribir en D1 en cada petición

export interface SessionData {
  userId?: string;
  userRole?: string | null;
  colmadoId?: number | null;
  deliveryId?: number | null;
  lastActivity?: number;
  portalDeliveryId?: number;
  portalColmadoId?: number;
  portalSessionCreatedAt?: number;
  portalEmployeeId?: number;
  portalEmployeeBranchId?: number;
}

export class Session {
  data: SessionData;
  private dirty = false;
  private destroyed = false;

  constructor(
    public id: string | null,
    data: SessionData,
    private existsInDb: boolean,
  ) {
    this.data = data;
  }

  /** Marca la sesión para guardarse antes de responder. */
  touch(): void {
    this.dirty = true;
  }

  set<K extends keyof SessionData>(key: K, value: SessionData[K]): void {
    this.data[key] = value;
    this.dirty = true;
  }

  unset(...keys: (keyof SessionData)[]): void {
    for (const key of keys) delete this.data[key];
    this.dirty = true;
  }

  destroy(): void {
    this.data = {};
    this.destroyed = true;
  }

  /** Cambia el identificador (al iniciar sesión) para evitar fijación de sesión. */
  regenerate(): void {
    this.previousId = this.id;
    this.id = null;
    this.existsInDb = false;
    this.dirty = true;
  }
  private previousId: string | null = null;

  async commit(c: Context<AppEnv>): Promise<void> {
    const db = getDb(c.env.DB);
    const secure = new URL(c.req.url).protocol === "https:";
    if (this.previousId) {
      await db.delete(sessions).where(eq(sessions.sid, this.previousId));
      this.previousId = null;
    }
    if (this.destroyed) {
      if (this.id && this.existsInDb) await db.delete(sessions).where(eq(sessions.sid, this.id));
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return;
    }
    if (!this.dirty) return;
    if (Object.keys(this.data).length === 0 && !this.existsInDb) return;
    const expire = new Date(Date.now() + SESSION_TTL_MS);
    if (!this.id) this.id = newSessionId();
    await db
      .insert(sessions)
      .values({ sid: this.id, sess: this.data, expire })
      .onConflictDoUpdate({ target: sessions.sid, set: { sess: this.data, expire } });
    this.existsInDb = true;
    this.dirty = false;
    setCookie(c, SESSION_COOKIE, this.id, {
      path: "/",
      httpOnly: true,
      secure,
      sameSite: "Lax",
      maxAge: SESSION_TTL_MS / 1000,
    });
  }
}

function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Carga la sesión desde D1 y la guarda ANTES de enviar la respuesta, para que
 * las peticiones que el cliente dispara justo después del login ya la vean.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sid = getCookie(c, SESSION_COOKIE);
  let session = new Session(null, {}, false);
  if (sid && /^[a-f0-9]{64}$/.test(sid)) {
    const db = getDb(c.env.DB);
    const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid));
    if (row && row.expire.getTime() > Date.now()) {
      session = new Session(sid, (row.sess ?? {}) as SessionData, true);
    }
  }
  c.set("session", session);
  await next();
  await session.commit(c);
};

/** Actualiza lastActivity, escribiendo en D1 como mucho una vez por minuto. */
export function recordActivity(session: Session): number | undefined {
  const previous = session.data.lastActivity;
  const now = Date.now();
  if (!previous || now - previous > ACTIVITY_WRITE_INTERVAL_MS) session.set("lastActivity", now);
  return previous;
}

export async function deleteExpiredSessions(d1: D1Database): Promise<void> {
  await getDb(d1).delete(sessions).where(lt(sessions.expire, new Date()));
}
