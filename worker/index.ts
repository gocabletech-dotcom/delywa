import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv, Env } from "./env";
import { getDb } from "./db";
import { deleteExpiredSessions, sessionMiddleware } from "./lib/session";
import { enviarRecordatoriosComprobante } from "./lib/cron";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { negocioRoutes } from "./routes/negocios";
import { catalogoRoutes } from "./routes/catalogos";
import { menuRoutes } from "./routes/menu";
import { pedidoRoutes } from "./routes/pedidos";
import { clienteRoutes } from "./routes/clientes";
import { menuGraficoRoutes } from "./routes/menu-grafico";
import { deliveryRoutes } from "./routes/deliveries";
import { portalRepartidorRoutes } from "./routes/portal-repartidor";
import { empleadoRoutes } from "./routes/empleados";
import { conversacionRoutes } from "./routes/conversaciones";
import { plataformaRoutes } from "./routes/plataforma";
import { limpiarSubidasPendientes, uploadRoutes } from "./routes/uploads";
import { whatsappRoutes } from "./routes/whatsapp";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  // Solo método, ruta y error: nunca el cuerpo de la respuesta ni datos de clientes.
  console.error(`[error] ${c.req.method} ${new URL(c.req.url).pathname}:`, err);
  return c.json({ message: "Error interno del servidor" }, 500);
});

app.get("/api/health", async (c) => {
  const row = await getDb(c.env.DB).get<{ tablas: number }>(
    sql`SELECT count(*) AS tablas FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'`,
  );
  return c.json({ ok: true, servicio: "delywa", tablas: row?.tablas ?? 0 });
});

app.use("/api/*", sessionMiddleware);
app.route("/", authRoutes);
app.route("/", userRoutes);
app.route("/", negocioRoutes);
app.route("/", catalogoRoutes);
app.route("/", menuRoutes);
app.route("/", pedidoRoutes);
app.route("/", clienteRoutes);
app.route("/", menuGraficoRoutes);
app.route("/", deliveryRoutes);
app.route("/", portalRepartidorRoutes);
app.route("/", empleadoRoutes);
app.route("/", conversacionRoutes);
app.route("/", plataformaRoutes);
app.route("/", uploadRoutes);
app.route("/", whatsappRoutes);

// Los módulos restantes se agregan por capas.
app.all("/api/*", (c) => c.json({ message: "Endpoint aún no migrado" }, 501));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(deleteExpiredSessions(env.DB));
    ctx.waitUntil(enviarRecordatoriosComprobante(env));
    ctx.waitUntil(limpiarSubidasPendientes(env));
  },
} satisfies ExportedHandler<Env>;
