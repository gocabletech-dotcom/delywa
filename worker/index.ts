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
import { chatWebRoutes } from "./routes/chat-web";
import { generadorRoutes } from "./routes/generadores";
import { integracionRoutes } from "./routes/integraciones";
import { registroRoutes } from "./routes/registro";
import { jergaAprendidaRoutes } from "./routes/jerga-aprendida";
import { chatColmadoRoutes } from "./routes/chat-colmado";
import { seguridadRoutes } from "./routes/seguridad";
import { borrarRespaldosViejos, iniciarRespaldo, pasoRespaldo } from "./lib/respaldo";
import { avisosFinDePrueba } from "./lib/avisos";
import { olvidarEquiposViejos } from "./lib/cuenta";
import { avisarCambios, tiempoRealRoutes } from "./routes/tiempo-real";
import { envEfectivo } from "./lib/integraciones";
import { bitacoraCambios, cabecerasSeguridad, limpiarSeguridad, mismoOrigen, registrarError } from "./lib/seguridad";
import { procesarAviso, webhookRoutes, type AvisoWebhook } from "./routes/webhooks";

export { SalaNegocio } from "./sala-negocio";

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  // Solo método, ruta y error: nunca el cuerpo de la respuesta ni datos de clientes.
  const ref = crypto.randomUUID().slice(0, 8);
  const ruta = new URL(c.req.url).pathname;
  console.error(`[error] ref ${ref} ${c.req.method} ${ruta}:`, err);
  const tarea = registrarError(c.env, { ref, metodo: c.req.method, ruta, error: err });
  try { c.executionCtx.waitUntil(tarea); } catch { /* pruebas */ }
  return c.json({ message: "Error interno del servidor", ref }, 500);
});

app.use("*", cabecerasSeguridad);

app.get("/api/health", async (c) => {
  const row = await getDb(c.env.DB).get<{ tablas: number }>(
    sql`SELECT count(*) AS tablas FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'`,
  );
  return c.json({ ok: true, servicio: "delywa", tablas: row?.tablas ?? 0 });
});

// Llaves configuradas en el panel de plataforma: se aplican encima de los secretos de Cloudflare.
app.use("/api/*", async (c, next) => {
  c.env = await envEfectivo(c.env);
  await next();
});
app.use("/api/*", mismoOrigen);
app.use("/api/*", sessionMiddleware);
app.use("/api/*", avisarCambios);
app.use("/api/*", bitacoraCambios);
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
app.route("/", chatWebRoutes);
app.route("/", webhookRoutes);
app.route("/", generadorRoutes);
app.route("/", integracionRoutes);
app.route("/", registroRoutes);
app.route("/", jergaAprendidaRoutes);
app.route("/", chatColmadoRoutes);
app.route("/", seguridadRoutes);
app.route("/", tiempoRealRoutes);

// Cualquier otra dirección de la API no existe.
app.all("/api/*", (c) => c.json({ message: "No existe esa dirección de la API" }, 501));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, envBase: Env, ctx: ExecutionContext) {
    const env = await envEfectivo(envBase);
    ctx.waitUntil(deleteExpiredSessions(env.DB));
    ctx.waitUntil(enviarRecordatoriosComprobante(env));
    ctx.waitUntil(limpiarSubidasPendientes(env));
    // Tareas diarias (hora UTC; el cron corre cada 5 minutos).
    const ahora = new Date(_event.scheduledTime || Date.now());
    const hora = ahora.getUTCHours(), primeraVuelta = ahora.getUTCMinutes() < 5;
    ctx.waitUntil((async () => {
      // 09:00 UTC (5:00 a.m. en RD): empieza el respaldo del día; cada vuelta copia una parte.
      if (hora === 9 && primeraVuelta) await iniciarRespaldo(env);
      await pasoRespaldo(env);
      if (hora === 3 && primeraVuelta) { await limpiarSeguridad(env); await borrarRespaldosViejos(env); await olvidarEquiposViejos(getDb(env.DB)); }
      // 14:00 UTC (10:00 a.m. en RD): aviso de fin de prueba gratis.
      if (hora === 14 && primeraVuelta) await avisosFinDePrueba(env);
    })().catch((err) => console.error("[cron] Tarea diaria falló:", err instanceof Error ? err.message : err)));
  },
  /** Cola de avisos de WhatsApp: cada mensaje del cliente lo atiende el bot aquí, sin hacer esperar a Meta. */
  async queue(batch: MessageBatch<unknown>, envBase: Env) {
    const env = await envEfectivo(envBase);
    for (const mensaje of batch.messages) {
      try {
        await procesarAviso(env, mensaje.body as AvisoWebhook);
      } catch (err) {
        console.error("[cola] Error al atender un aviso de WhatsApp:", err instanceof Error ? err.message : err);
      }
      // Siempre se confirma: cada mensaje ya quedó marcado como recibido y reintentarlo lo duplicaría.
      mensaje.ack();
    }
  },
} satisfies ExportedHandler<Env>;
