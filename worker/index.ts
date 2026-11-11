import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { Env } from "./env";
import { getDb } from "./db";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", async (c) => {
  const db = getDb(c.env.DB);
  const row = await db.get<{ tablas: number }>(
    sql`SELECT count(*) AS tablas FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'`,
  );
  return c.json({ ok: true, servicio: "delywa", tablas: row?.tablas ?? 0 });
});

// Las rutas de negocio se agregan por módulo en la capa 2.
app.all("/api/*", (c) => c.json({ message: "Endpoint aún no migrado" }, 501));

app.onError((err, c) => {
  console.error(`[error] ${c.req.method} ${new URL(c.req.url).pathname}:`, err);
  return c.json({ message: "Error interno del servidor" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // Recordatorio de comprobantes de transferencia: se implementa en la capa 4.
  },
} satisfies ExportedHandler<Env>;
