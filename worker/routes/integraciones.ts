import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { colmados, configuracionSistema } from "@shared/schema";
import type { AppEnv, Env } from "../env";
import { getDb, type Db } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import {
  CAMPOS, PREFIJO, SinClaveMaestra, cifrar, claveOpenAINegocio, enmascarar, envEfectivo, esCampo, leerIntegraciones,
  olvidarCache, type NombreCampo,
} from "../lib/integraciones";
import { graphUrl, http, versionGraphValida } from "../lib/whatsapp";
import { verificarTurnstile } from "../lib/turnstile";

// Panel de plataforma → Integraciones: llaves de OpenAI, Meta y Turnstile.
// Solo platform_admin. Los secretos nunca se devuelven completos.
export const integracionRoutes = new Hono<AppEnv>();
integracionRoutes.use("/api/admin/integraciones", requireAuth, requireAdmin);
integracionRoutes.use("/api/admin/integraciones/*", requireAuth, requireAdmin);
integracionRoutes.use("/api/admin/colmados/:id/ia", requireAuth, requireAdmin);
integracionRoutes.use("/api/admin/colmados/:id/ia/*", requireAuth, requireAdmin);

/** El entorno de Cloudflare sin las llaves del panel (las rutas lo leen de nuevo después de guardar). */
const crudo = (c: Context<AppEnv>): Env => c.env.__base ?? c.env;

const TIEMPO_MAXIMO_MS = 15_000;

async function cuerpo(c: Context<AppEnv>): Promise<Record<string, any>> {
  return ((await c.req.json().catch(() => null)) || {}) as Record<string, any>;
}

/** Revisa un valor antes de guardarlo; devuelve el mensaje de error o null si sirve. */
function validar(campo: NombreCampo, valor: string): string | null {
  if (valor.length > 2000 || /\s/.test(valor)) return "no puede tener espacios ni ser tan largo";
  switch (campo) {
    case "meta_app_id":
    case "meta_config_id":
      return /^\d{5,30}$/.test(valor) ? null : "debe ser solo números";
    case "meta_graph_version":
      return versionGraphValida(valor) ? null : "debe tener la forma v24.0";
    case "ai_gateway_url":
      return /^https:\/\/gateway\.ai\.cloudflare\.com\/v1\/[\w-]+\/[\w-]+\/openai\/?$/.test(valor)
        ? null : "debe ser la dirección de OpenAI de tu AI Gateway (https://gateway.ai.cloudflare.com/v1/…/…/openai)";
    case "whatsapp_verify_token":
      return valor.length >= 16 ? null : "debe tener al menos 16 caracteres";
    case "turnstile_activo":
      return "se activa con el botón «Probar y activar»";
    default:
      return valor.length >= 8 ? null : "es demasiado corto";
  }
}

async function guardar(db: Db, env: Env, clave: string, secreto: boolean, valor: string | null, etiqueta: string): Promise<void> {
  if (valor === null) {
    await db.delete(configuracionSistema).where(eq(configuracionSistema.clave, clave));
    return;
  }
  const guardado = secreto ? await cifrar(valor, env.DELYWA_CLAVE_MAESTRA) : valor;
  await db.insert(configuracionSistema)
    .values({ clave, valor: guardado, descripcion: etiqueta, tipo: secreto ? "secreto" : "texto" })
    .onConflictDoUpdate({ target: configuracionSistema.clave, set: { valor: guardado, fechaModificacion: new Date() } });
}

/** Estado de todas las llaves para el panel. */
async function estado(c: Context<AppEnv>) {
  const base = crudo(c);
  const datos = await leerIntegraciones(base);
  const efectivo = await envEfectivo(base);
  const campos = (Object.keys(CAMPOS) as NombreCampo[]).filter((campo) => campo !== "turnstile_activo").map((campo) => {
    const def = CAMPOS[campo];
    const panel = datos.valores[campo];
    const nube = "env" in def && def.env ? (base as any)[def.env] as string | undefined : undefined;
    const valor = panel || nube;
    return {
      campo,
      etiqueta: def.etiqueta,
      secreto: def.secreto,
      configurado: Boolean(valor),
      origen: panel ? "panel" : nube ? "cloudflare" : null,
      vista: def.secreto ? enmascarar(valor) : valor ?? null,
      ilegible: datos.ilegibles.includes(campo),
    };
  });
  const urlPublica = (base.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
  return {
    claveMaestra: Boolean(base.DELYWA_CLAVE_MAESTRA),
    campos,
    meta: {
      webhookUrl: `${urlPublica}/api/webhook/whatsapp`,
      // El administrador tiene que copiarlo a Meta, así que se muestra completo.
      verifyToken: efectivo.WHATSAPP_VERIFY_TOKEN ?? null,
      eliminacionDatosUrl: `${urlPublica}/api/webhook/data-deletion`,
    },
    turnstile: { activo: datos.valores.turnstile_activo === "true", siteKey: efectivo.__integraciones?.valores.turnstile_site_key ?? null },
    negociosConLlavePropia: Object.keys(datos.openaiPorNegocio).length,
  };
}

integracionRoutes.get("/api/admin/integraciones", async (c) => {
  const db = getDb(c.env.DB);
  // Primer uso: se crea un token de verificación del webhook al azar para que no haya que inventarlo.
  const datos = await leerIntegraciones(crudo(c), db);
  if (!datos.valores.whatsapp_verify_token && !crudo(c).WHATSAPP_VERIFY_TOKEN && crudo(c).DELYWA_CLAVE_MAESTRA) {
    const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await guardar(db, crudo(c), `${PREFIJO}whatsapp_verify_token`, true, token, CAMPOS.whatsapp_verify_token.etiqueta);
    olvidarCache(c.env);
  }
  return c.json(await estado(c));
});

integracionRoutes.put("/api/admin/integraciones", async (c) => {
  const body = await cuerpo(c);
  const valores = body.valores;
  if (!valores || typeof valores !== "object" || Array.isArray(valores)) return c.json({ error: "Faltan los valores" }, 400);
  const cambios: Array<[NombreCampo, string | null]> = [];
  for (const [campo, crudo] of Object.entries(valores)) {
    if (!esCampo(campo)) return c.json({ error: `Campo desconocido: ${campo}` }, 400);
    if (crudo !== null && typeof crudo !== "string") return c.json({ error: `${CAMPOS[campo].etiqueta}: valor no válido` }, 400);
    const valor = typeof crudo === "string" ? crudo.trim() : null;
    if (valor) {
      const error = validar(campo, valor);
      if (error) return c.json({ error: `${CAMPOS[campo].etiqueta}: ${error}` }, 400);
    }
    cambios.push([campo, valor || null]);
  }
  const hayTurnstile = cambios.some(([campo]) => campo === "turnstile_site_key" || campo === "turnstile_secret_key");
  const db = getDb(c.env.DB);
  try {
    for (const [campo, valor] of cambios) {
      await guardar(db, crudo(c), `${PREFIJO}${campo}`, CAMPOS[campo].secreto, valor, CAMPOS[campo].etiqueta);
    }
  } catch (err) {
    if (err instanceof SinClaveMaestra) return c.json({ error: err.message }, 503);
    throw err;
  }
  // Llaves de Turnstile nuevas: se apaga hasta probarlas, para que nadie quede fuera del login.
  if (hayTurnstile) await guardar(db, crudo(c), `${PREFIJO}turnstile_activo`, false, null, CAMPOS.turnstile_activo.etiqueta);
  olvidarCache(c.env);
  return c.json(await estado(c));
});

// ---------- Pruebas (no gastan saldo) ----------

async function probarOpenAI(apiKey: string | undefined, gateway: string | undefined) {
  if (!apiKey) return { ok: false, mensaje: "No hay llave de OpenAI configurada." };
  try {
    // Listar modelos no consume saldo.
    const res = await http.fetch(`${(gateway || "https://api.openai.com/v1").replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    if (res.ok) return { ok: true, mensaje: "OpenAI respondió bien: la llave funciona." };
    if (res.status === 401) return { ok: false, mensaje: "OpenAI rechazó la llave (401). Revisa que la copiaste completa." };
    if (res.status === 429) return { ok: false, mensaje: "OpenAI dice que la cuenta no tiene saldo o llegó a su límite (429)." };
    return { ok: false, mensaje: `OpenAI respondió con el código ${res.status}.` };
  } catch {
    return { ok: false, mensaje: "No se pudo contactar a OpenAI." };
  }
}

integracionRoutes.post("/api/admin/integraciones/probar-openai", async (c) => {
  const env = await envEfectivo(crudo(c));
  return c.json(await probarOpenAI(env.OPENAI_API_KEY, env.AI_GATEWAY_URL));
});

integracionRoutes.post("/api/admin/integraciones/probar-meta", async (c) => {
  const env = await envEfectivo(crudo(c));
  const appId = env.META_APP_ID?.trim();
  const secreto = env.META_APP_SECRET?.trim();
  if (!appId || !secreto) return c.json({ ok: false, mensaje: "Faltan el ID o la clave secreta de la app de Meta." });
  try {
    // Token de la app (id|secreto) en el encabezado, nunca en la dirección.
    const res = await http.fetch(graphUrl(`${appId}?fields=name`), {
      headers: { Authorization: `Bearer ${appId}|${secreto}` }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { name?: string };
    if (res.ok) return c.json({ ok: true, mensaje: `Meta reconoce la app${data.name ? ` «${String(data.name).slice(0, 80)}»` : ""}.` });
    return c.json({ ok: false, mensaje: `Meta rechazó el ID o la clave secreta (código ${res.status}).` });
  } catch {
    return c.json({ ok: false, mensaje: "No se pudo contactar a Meta." });
  }
});

integracionRoutes.post("/api/admin/integraciones/probar-turnstile", async (c) => {
  const body = await cuerpo(c);
  const env = await envEfectivo(crudo(c));
  const valores = env.__integraciones?.valores ?? {};
  if (!valores.turnstile_site_key || !valores.turnstile_secret_key) return c.json({ ok: false, mensaje: "Faltan las dos claves de Turnstile." });
  const ok = await verificarTurnstile(valores.turnstile_secret_key, body.token, c.req.header("cf-connecting-ip"));
  if (!ok) return c.json({ ok: false, mensaje: "Cloudflare no aceptó la prueba. Revisa que las claves sean del mismo widget y que delywa.com esté en su lista de dominios." });
  await guardar(getDb(c.env.DB), crudo(c), `${PREFIJO}turnstile_activo`, false, "true", CAMPOS.turnstile_activo.etiqueta);
  olvidarCache(c.env);
  return c.json({ ok: true, mensaje: "Turnstile funciona y quedó activo en el login." });
});

integracionRoutes.post("/api/admin/integraciones/desactivar-turnstile", async (c) => {
  await guardar(getDb(c.env.DB), crudo(c), `${PREFIJO}turnstile_activo`, false, null, CAMPOS.turnstile_activo.etiqueta);
  olvidarCache(c.env);
  return c.json({ ok: true });
});

// ---------- Llave de OpenAI propia de un negocio ----------

async function negocio(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const [fila] = await getDb(c.env.DB).select({ id: colmados.id }).from(colmados).where(eq(colmados.id, id));
  return fila?.id ?? null;
}

async function estadoNegocio(env: Env, id: number) {
  const datos = await leerIntegraciones(env);
  const propia = datos.openaiPorNegocio[id];
  const plataforma = (await envEfectivo(env)).OPENAI_API_KEY;
  return {
    llavePropia: Boolean(propia),
    vista: enmascarar(propia),
    ilegible: datos.ilegibles.includes(`openai_api_key@${id}`),
    usaLlaveDePlataforma: !propia && Boolean(plataforma),
  };
}

integracionRoutes.get("/api/admin/colmados/:id/ia", async (c) => {
  const id = await negocio(c);
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  return c.json(await estadoNegocio(crudo(c), id));
});

integracionRoutes.put("/api/admin/colmados/:id/ia", async (c) => {
  const id = await negocio(c);
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const body = await cuerpo(c);
  const valor = typeof body.openaiApiKey === "string" ? body.openaiApiKey.trim() : null;
  if (body.openaiApiKey !== null && typeof body.openaiApiKey !== "string") return c.json({ error: "Valor no válido" }, 400);
  if (valor) {
    const error = validar("openai_api_key", valor);
    if (error) return c.json({ error: `Llave de OpenAI: ${error}` }, 400);
  }
  try {
    await guardar(getDb(c.env.DB), crudo(c), claveOpenAINegocio(id), true, valor || null, "Llave de OpenAI propia del negocio");
  } catch (err) {
    if (err instanceof SinClaveMaestra) return c.json({ error: err.message }, 503);
    throw err;
  }
  olvidarCache(c.env);
  return c.json(await estadoNegocio(crudo(c), id));
});

integracionRoutes.post("/api/admin/colmados/:id/ia/probar", async (c) => {
  const id = await negocio(c);
  if (!id) return c.json({ error: "Negocio no encontrado" }, 404);
  const env = await envEfectivo(crudo(c));
  const llave = env.__integraciones?.openaiPorNegocio[id] ?? env.OPENAI_API_KEY;
  return c.json(await probarOpenAI(llave, env.AI_GATEWAY_URL));
});
