// Pruebas contra una D1 local en memoria (miniflare). Nunca tocan la base real.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { app } from "../index";
import type { Env } from "../env";
import { getDb } from "../db";
import { filtraciones } from "../lib/claves";
import { servicioCorreo } from "../lib/correo";
import { LOGIN } from "../lib/rate-limit";

const root = fileURLToPath(new URL("../../", import.meta.url));

function splitStatements(file: string, sql: string): string[] {
  if (sql.includes("--> statement-breakpoint")) return sql.split("--> statement-breakpoint");
  // Archivo de datos base: una sentencia INSERT por bloque, terminada en ";".
  return sql.split(/;\s*\n(?=INSERT |--|\s*$)/).map((s) => s.replace(/^(\s*--[^\n]*\n)+/g, ""));
}

/** Correos que se habrían mandado (Resend simulado). */
export const correosEnviados: Array<{ to: string[]; subject: string; html: string }> = [];

export async function createTestApp() {
  const proxy = await getPlatformProxy<Env>({ configPath: `${root}wrangler.jsonc`, persist: false });
  const env = proxy.env;
  // Las salas de tiempo real no funcionan fuera de Cloudflare; las pruebas que las usan ponen una simulada.
  (env as any).SALAS = undefined;
  // Nunca se manda un correo de verdad: quedan en correosEnviados.
  correosEnviados.length = 0;
  servicioCorreo.fetch = async (_url: string, init?: RequestInit) => {
    correosEnviados.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ id: "correo-prueba" }), { status: 200 });
  };
  // Sin la espera creciente del login, para que las pruebas no tarden.
  LOGIN.esperaPorFalloMs = 0; LOGIN.esperaBaseMs = 0;
  // Nunca se consulta el servicio real de contraseñas filtradas: "mango-filtrado-2024" simula una.
  filtraciones.fetch = async (url: string) => {
    const filtrada = "mango-filtrado-2024";
    const h = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(filtrada)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    return new Response(url.endsWith(h.slice(0, 5)) ? `${h.slice(5)}:42\n` : "", { status: 200 });
  };
  for (const file of readdirSync(`${root}migrations`).filter((f) => f.endsWith(".sql")).sort()) {
    for (const statement of splitStatements(file, readFileSync(`${root}migrations/${file}`, "utf8"))) {
      const sql = statement.trim().replace(/;$/, "");
      if (sql) await env.DB.prepare(sql).run();
    }
  }

  /** Cliente HTTP mínimo que conserva cookies, como un navegador. */
  function client() {
    const cookies = new Map<string, string>();
    return {
      cookies,
      async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
        const res = await app.request(
          `https://delywa.test${path}`,
          {
            method,
            headers: {
              ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
              ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
              ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
          },
          env,
        );
        for (const header of res.headers.getSetCookie()) {
          const [pair, ...attrs] = header.split(";");
          const [name, value] = pair.split("=");
          if (!value || attrs.some((a) => /max-age=0/i.test(a))) cookies.delete(name.trim());
          else cookies.set(name.trim(), value);
        }
        const text = await res.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* no es JSON */ }
        return { status: res.status, json, headers: res.headers };
      },
      /** Petición con cuerpo binario o de formulario, sin convertir a JSON. Devuelve la respuesta tal cual. */
      raw(method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) {
        return app.request(`https://delywa.test${path}`, {
          method, body,
          headers: { ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...headers },
        }, env);
      },
    };
  }

  return { env, db: getDb(env.DB), client, dispose: () => proxy.dispose() };
}
