// Pruebas contra una D1 local en memoria (miniflare). Nunca tocan la base real.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { app } from "../index";
import type { Env } from "../env";
import { getDb } from "../db";

const root = fileURLToPath(new URL("../../", import.meta.url));

function splitStatements(file: string, sql: string): string[] {
  if (sql.includes("--> statement-breakpoint")) return sql.split("--> statement-breakpoint");
  // Archivo de datos base: una sentencia INSERT por bloque, terminada en ";".
  return sql.split(/;\s*\n(?=INSERT |--|\s*$)/).map((s) => s.replace(/^(\s*--[^\n]*\n)+/g, ""));
}

export async function createTestApp() {
  const proxy = await getPlatformProxy<Env>({ configPath: `${root}wrangler.jsonc`, persist: false });
  const env = proxy.env;
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
    };
  }

  return { env, db: getDb(env.DB), client, dispose: () => proxy.dispose() };
}
