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
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    session: Session;
    /** Usuario autenticado; lo carga requireAuth. */
    user: User;
  };
};
