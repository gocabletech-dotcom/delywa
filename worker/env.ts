import type { Session } from "./lib/session";
import type { User } from "@shared/schema";

export interface Env {
  DB: D1Database;
  UPLOADS: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_URL: string;
  // Secretos (wrangler secret put ...). Se cargan en la capa 4.
  OPENAI_API_KEY?: string;
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
  };
};
