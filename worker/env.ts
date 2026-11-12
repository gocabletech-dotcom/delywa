import type { Session } from "./lib/session";
import type { User } from "@shared/schema";
import type { Integraciones } from "./lib/integraciones";

export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  /** Workers AI: notas de voz (Whisper) y la IA de respaldo del bot del chat. */
  AI?: Ai;
  /** Respaldos diarios de la base (bucket delywa-respaldos). Si falta, no se respalda. */
  RESPALDOS?: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_URL: string;
  /** Cola de avisos entrantes de WhatsApp. Si falta, el webhook los atiende él mismo. */
  COLA_WEBHOOKS?: Queue<unknown>;
  /** Salas de tiempo real (Durable Objects). Si falta, el panel sigue con su consulta periódica. */
  SALAS?: DurableObjectNamespace;
  /** Clave con la que se cifran las llaves guardadas desde el panel. La crea el instalador. */
  DELYWA_CLAVE_MAESTRA?: string;
  /** Llaves del panel ya leídas (las pone envEfectivo). */
  __integraciones?: Integraciones;
  /** El entorno tal como lo dio Cloudflare, sin las llaves del panel. */
  __base?: Env;
  // Llaves de servicios: se configuran en el panel de plataforma; un secreto de Cloudflare sirve de respaldo.
  OPENAI_API_KEY?: string;
  AI_GATEWAY_URL?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_CONFIG_ID?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  META_GRAPH_VERSION?: string;
  // Proveedor de rutas por carretera (opcional). Sin él se usa la distancia GPS.
  ROUTING_PROVIDER_URL?: string;
  ROUTING_PROVIDER_API_KEY?: string;
  ROUTING_PROVIDER_NAME?: string;
  ROUTING_PROVIDER_TRAFFIC?: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    session: Session;
    /** Usuario autenticado; lo carga requireAuth. */
    user: User;
    /** Texto extra para la bitácora (por ejemplo, qué llaves se cambiaron). */
    bitacoraDetalle?: string;
  };
};
