import { Hono } from "hono";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { pedidos, subidasPendientes } from "@shared/schema";
import type { AppEnv, Env } from "../env";
import { getDb } from "../db";
import { requireAuth, usuarioOpcional } from "../lib/auth";
import { sessionMiddleware } from "../lib/session";
import { ADMINISTRADORES, OPERADORES, puedeOperar } from "../lib/permisos";
import { TIPOS_IMAGEN, tipoPorFirma } from "../lib/imagenes";
import { getColmado, updateColmado } from "../storage/colmados";

// Archivos en R2. El navegador pide un enlace de un solo uso y luego hace PUT
// a este Worker, que valida el tipo y el tamaño antes de guardarlo en el bucket.
export const uploadRoutes = new Hono<AppEnv>();

const MB = 1024 * 1024;
const MAX_PRODUCTO = 5 * MB;
const MAX_COMPROBANTE = 8 * MB;
const MAX_LOGO = 2 * MB;
const VIGENCIA_MS = 10 * 60 * 1000;
const MAX_ANONIMAS_POR_HORA = 10;

const prefijoPublico = (clave: string) => `/uploads/${clave}`;

async function guardar(env: Env, clave: string, bytes: ArrayBuffer, contentType: string, privado: boolean) {
  await env.UPLOADS.put(clave, bytes, {
    httpMetadata: { contentType, cacheControl: privado ? "private, no-store" : "public, max-age=31536000, immutable" },
  });
}

// ---------- Paso 1: pedir el enlace ----------

uploadRoutes.post("/api/uploads/request-url", async (c) => {
  const db = getDb(c.env.DB);
  const body = ((await c.req.json().catch(() => null)) || {}) as Record<string, unknown>;
  const contentType = String(body.contentType || "").toLowerCase();
  const extension = TIPOS_IMAGEN[contentType];
  if (!body.name) return c.json({ error: "Falta el nombre del archivo" }, 400);
  if (!extension) return c.json({ error: "Solo se permiten imágenes JPEG, PNG, WebP o GIF" }, 415);

  // El personal del negocio sube fotos de productos; cualquier otro caso es un comprobante de pago del cliente.
  const user = await usuarioOpcional(c);
  const esPersonal = !!user && OPERADORES.includes(user.role ?? "") && body.uso !== "comprobante";
  const maxBytes = esPersonal ? MAX_PRODUCTO : MAX_COMPROBANTE;
  const size = Number(body.size);
  if (Number.isFinite(size) && size > maxBytes) {
    return c.json({ error: `La imagen no puede superar ${maxBytes / MB} MB` }, 413);
  }
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  if (!esPersonal) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(subidasPendientes)
      .where(and(ip ? eq(subidasPendientes.ip, ip) : sql`${subidasPendientes.ip} is null`, gt(subidasPendientes.fechaCreacion, new Date(Date.now() - 3_600_000))));
    if (Number(n) >= MAX_ANONIMAS_POR_HORA) return c.json({ error: "Demasiadas subidas. Intenta de nuevo más tarde." }, 429);
  }
  const clave = esPersonal
    ? `productos/${c.var.session.data.colmadoId ?? user!.colmadoId ?? 0}/${crypto.randomUUID()}.${extension}`
    : `comprobantes/${crypto.randomUUID()}.${extension}`;
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  await db.insert(subidasPendientes).values({ token, clave, contentType, maxBytes, ip: esPersonal ? `u:${user!.id}` : ip, expiraEn: new Date(Date.now() + VIGENCIA_MS) });
  return c.json({
    uploadURL: `/api/uploads/archivo/${token}`,
    objectPath: prefijoPublico(clave),
    metadata: { name: body.name, size: body.size, contentType },
  });
});

// ---------- Paso 2: recibir el archivo ----------

uploadRoutes.put("/api/uploads/archivo/:token", async (c) => {
  const db = getDb(c.env.DB);
  const [pendiente] = await db.select().from(subidasPendientes).where(eq(subidasPendientes.token, c.req.param("token")));
  if (!pendiente || pendiente.usada || pendiente.expiraEn.getTime() < Date.now()) {
    return c.json({ error: "El enlace de subida no existe, ya se usó o venció" }, 410);
  }
  if (Number(c.req.header("Content-Length") || 0) > pendiente.maxBytes) return c.json({ error: "El archivo es demasiado grande" }, 413);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "El archivo está vacío" }, 400);
  if (bytes.byteLength > pendiente.maxBytes) return c.json({ error: "El archivo es demasiado grande" }, 413);
  if (tipoPorFirma(new Uint8Array(bytes.slice(0, 16))) !== pendiente.contentType) {
    return c.json({ error: "El archivo no es una imagen del tipo indicado" }, 415);
  }
  // El enlace se reclama antes de guardar: dos PUT simultáneos no escriben dos veces.
  const reclamado = await db.update(subidasPendientes).set({ usada: true })
    .where(and(eq(subidasPendientes.token, pendiente.token), eq(subidasPendientes.usada, false))).returning({ token: subidasPendientes.token });
  if (!reclamado.length) return c.json({ error: "El enlace de subida ya se usó" }, 410);
  await guardar(c.env, pendiente.clave, bytes, pendiente.contentType, pendiente.clave.startsWith("comprobantes/"));
  return c.json({ success: true, objectPath: prefijoPublico(pendiente.clave) });
});

/** Tarea programada: borra los enlaces de subida de más de un día. */
export async function limpiarSubidasPendientes(env: Env): Promise<void> {
  await getDb(env.DB).delete(subidasPendientes).where(lt(subidasPendientes.fechaCreacion, new Date(Date.now() - 24 * 3_600_000)));
}

// ---------- Logo del negocio ----------

uploadRoutes.post("/api/colmados/:id/logo", requireAuth, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const colmado = Number.isInteger(colmadoId) ? await getColmado(db, colmadoId) : undefined;
  if (!colmado) return c.json({ error: "Negocio no encontrado" }, 404);
  if (!(await puedeOperar(db, c.var.user, colmadoId, ADMINISTRADORES))) return c.json({ error: "No tienes permiso para modificar este negocio" }, 403);
  if (Number(c.req.header("Content-Length") || 0) > MAX_LOGO + 64 * 1024) return c.json({ error: "El logo no puede superar 2 MB" }, 413);
  const form = await c.req.formData().catch(() => null);
  const archivo = form?.get("logo");
  if (!archivo || typeof archivo === "string") return c.json({ error: "No se recibió ningún archivo" }, 400);
  const bytes = await (archivo as unknown as Blob).arrayBuffer();
  if (bytes.byteLength > MAX_LOGO) return c.json({ error: "El logo no puede superar 2 MB" }, 413);
  const tipo = tipoPorFirma(new Uint8Array(bytes.slice(0, 16)));
  if (!tipo) return c.json({ error: "Tipo de archivo no permitido. Solo JPEG, PNG, WebP, GIF." }, 415);

  const clave = `logos/${colmadoId}/${crypto.randomUUID()}.${TIPOS_IMAGEN[tipo]}`;
  await guardar(c.env, clave, bytes, tipo, false);
  const logo = prefijoPublico(clave);
  await updateColmado(db, colmadoId, { logo });
  // El logo anterior ya no se usa: se borra del bucket.
  if (colmado.logo?.startsWith("/uploads/logos/")) await c.env.UPLOADS.delete(colmado.logo.slice("/uploads/".length));
  return c.json({ success: true, logo });
});

// ---------- Servir archivos ----------

uploadRoutes.get("/uploads/*", sessionMiddleware, async (c) => {
  const clave = decodeURIComponent(new URL(c.req.url).pathname.slice("/uploads/".length));
  if (!/^(productos|logos|comprobantes)\/[A-Za-z0-9/_.-]+$/.test(clave) || clave.includes("..")) return c.notFound();

  // Un comprobante de pago solo lo ve el personal del negocio al que pertenece el pedido.
  const privado = clave.startsWith("comprobantes/");
  if (privado) {
    const user = await usuarioOpcional(c);
    if (!user) return c.json({ error: "No autenticado" }, 401);
    const db = getDb(c.env.DB);
    const [pedido] = await db.select({ colmadoId: pedidos.colmadoId }).from(pedidos).where(eq(pedidos.comprobanteUrl, prefijoPublico(clave))).limit(1);
    const permitido = pedido ? await puedeOperar(db, user, pedido.colmadoId) : user.role === "platform_admin";
    if (!permitido) return c.json({ error: "No tienes permiso para ver este archivo" }, 403);
  }

  const objeto = await c.env.UPLOADS.get(clave, { onlyIf: c.req.raw.headers });
  if (!objeto) return c.notFound();
  const headers = new Headers({
    "Content-Type": objeto.httpMetadata?.contentType || "application/octet-stream",
    "Cache-Control": privado ? "private, no-store" : "public, max-age=31536000, immutable",
    ETag: objeto.httpEtag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  // Sin cuerpo: el navegador ya tiene esta versión (If-None-Match).
  if (!("body" in objeto)) return new Response(null, { status: 304, headers });
  return new Response((objeto as R2ObjectBody).body, { headers });
});
