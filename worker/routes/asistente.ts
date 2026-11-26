import { Hono, type Context } from "hono";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { asistenteConversaciones, asistenteMensajes, asistenteRespuestas, planes } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { permitirEvento } from "../lib/rate-limit";
import { correoListo, enviarCorreo, escHtml, plantillaCorreo, SOPORTE } from "../lib/correo";
import { respuestaDeTema, responder, TITULOS, type PlanPublico, type Respuesta } from "../lib/asistente-pagina";
import { anotar } from "../lib/seguridad";

// Chat de la página principal: un asistente que contesta al instante (sin IA, como el de FoodPOS)
// y, si no sabe o la persona lo pide, manda sus datos a soporte por correo.

export const asistenteRoutes = new Hono<AppEnv>();

const ip = (c: Context<AppEnv>) => c.req.header("CF-Connecting-IP") ?? "sin-ip";
const tokenValido = (t: unknown) => (typeof t === "string" && /^[a-f0-9]{32}$/.test(t) ? t : null);
const nuevoToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Planes activos tal como están en la base (precios y días de prueba en vivo). */
async function planesPublicos(db: Db): Promise<PlanPublico[]> {
  const filas = (await db.select().from(planes).where(eq(planes.activo, true)).orderBy(planes.orden)).filter((p) => p.visible);
  return filas.map((p) => ({
    nombre: p.nombre, precio: Number(p.precioMensual || 0), moneda: p.moneda || "USD", trial: p.esTrial, dias: p.duracionDias,
    descripcion: p.descripcionCorta, caracteristicas: (p.caracteristicas ?? []).slice(0, 5),
  }));
}

async function conversacion(db: Db, token: unknown) {
  const t = tokenValido(token);
  if (t) {
    const [c] = await db.select().from(asistenteConversaciones).where(eq(asistenteConversaciones.token, t)).limit(1);
    if (c) return c;
  }
  const [c] = await db.insert(asistenteConversaciones).values({ token: nuevoToken() }).returning();
  return c;
}

export const LIMITES_ASISTENTE = { porConexion: 30, ventanaMs: 10 * 60 * 1000, mensajesPorConversacion: 120, soportePorHora: 5 };

asistenteRoutes.post("/api/asistente", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  if (!(await permitirEvento(db, `asistente:${ip(c)}`, LIMITES_ASISTENTE.porConexion, LIMITES_ASISTENTE.ventanaMs))) {
    return c.json({ error: `Muchos mensajes seguidos. Espera unos minutos o escríbenos a ${SOPORTE}.` }, 429);
  }
  const conv = await conversacion(db, body.conv);
  if (conv.mensajes >= LIMITES_ASISTENTE.mensajesPorConversacion) {
    return c.json({ conv: conv.token, respuesta: { tema: null, texto: `Esta conversación ya es muy larga. Escríbenos a **${SOPORTE}** y te ayudamos.`, acciones: ["soporte"], soporte: true } });
  }
  const tema = texto(body.tema, 30);
  const escrito = texto(body.texto, 500);
  if (!tema && !escrito) return c.json({ error: "Escribe tu pregunta." }, 400);

  const listaPlanes = await planesPublicos(db);
  let r: Respuesta | null = tema ? respuestaDeTema(tema, listaPlanes) : null;
  if (!r) {
    const aprendidas = await db.select({ id: asistenteRespuestas.id, pregunta: asistenteRespuestas.pregunta, respuesta: asistenteRespuestas.respuesta })
      .from(asistenteRespuestas).where(eq(asistenteRespuestas.activo, true));
    r = responder(escrito, { planes: listaPlanes, aprendidas });
  }
  if (!r) return c.json({ error: "Escribe tu pregunta." }, 400);

  const pregunta = tema ? (TITULOS[tema] ?? tema) : escrito;
  await db.batch([
    db.insert(asistenteMensajes).values({ convId: conv.id, rol: "persona", texto: pregunta, tema: r.tema }),
    db.insert(asistenteMensajes).values({ convId: conv.id, rol: "asistente", texto: r.texto, tema: r.tema }),
    db.update(asistenteConversaciones).set({ mensajes: sql`${asistenteConversaciones.mensajes} + 2`, visto: new Date() }).where(eq(asistenteConversaciones.id, conv.id)),
    ...(r.aprendidaId ? [db.update(asistenteRespuestas).set({ usos: sql`${asistenteRespuestas.usos} + 1` }).where(eq(asistenteRespuestas.id, r.aprendidaId))] : []),
  ] as any);
  const { aprendidaId: _a, ...publica } = r;
  return c.json({ conv: conv.token, respuesta: publica });
});

/** Tocó «Crear mi negocio» desde el chat. */
asistenteRoutes.post("/api/asistente/evento", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const t = tokenValido(body.conv);
  if (t) await getDb(c.env.DB).update(asistenteConversaciones).set({ convirtio: true }).where(eq(asistenteConversaciones.token, t));
  return c.json({ ok: true });
});

/** Pidió que el equipo le escriba: correo a soporte con sus datos y la conversación. */
asistenteRoutes.post("/api/asistente/soporte", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  if (!(await permitirEvento(db, `asistente-soporte:${ip(c)}`, LIMITES_ASISTENTE.soportePorHora, 60 * 60 * 1000))) {
    return c.json({ error: `Ya recibimos varios mensajes desde esta conexión. Escríbenos directo a ${SOPORTE}.` }, 429);
  }
  const nombre = texto(body.nombre, 80);
  const correo = texto(body.correo, 120).toLowerCase();
  const whatsapp = texto(body.whatsapp, 25).replace(/[^\d+ ()-]/g, "");
  const negocio = texto(body.negocio, 80);
  const necesita = texto(body.necesita, 1500);
  if (!nombre) return c.json({ error: "Escribe tu nombre." }, 400);
  if (!correo && whatsapp.replace(/\D/g, "").length < 7) return c.json({ error: "Déjanos tu correo o tu WhatsApp para poder contestarte." }, 400);
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return c.json({ error: "Ese correo no es válido." }, 400);
  if (!necesita) return c.json({ error: "Cuéntanos qué necesitas." }, 400);

  const conv = await conversacion(db, body.conv);
  const historia = await db.select({ rol: asistenteMensajes.rol, texto: asistenteMensajes.texto }).from(asistenteMensajes)
    .where(eq(asistenteMensajes.convId, conv.id)).orderBy(asistenteMensajes.id);
  await db.batch([
    db.insert(asistenteMensajes).values({ convId: conv.id, rol: "persona", texto: `[Pidió que le escriban] ${necesita}`, tema: "soporte" }),
    db.update(asistenteConversaciones).set({ soporte: true, visto: new Date() }).where(eq(asistenteConversaciones.id, conv.id)),
  ] as any);

  const cuerpo = `Hola Delywa, les escribo desde el chat de la página.\n\nNombre: ${nombre}\nCorreo: ${correo || "-"}\nWhatsApp: ${whatsapp || "-"}\nNegocio: ${negocio || "-"}\n\nLo que necesito:\n${necesita}`;
  const mailto = `mailto:${SOPORTE}?subject=${encodeURIComponent(`Consulta desde el chat de delywa.com · ${nombre}`)}&body=${encodeURIComponent(cuerpo)}`;
  if (!correoListo(c.env)) return c.json({ ok: true, enviado: false, mailto });

  const tel = whatsapp.replace(/\D/g, "");
  const wa = tel ? `https://wa.me/${tel.length === 10 ? `1${tel}` : tel}?text=${encodeURIComponent(`Hola ${nombre}, le escribimos de Delywa por su mensaje en delywa.com.`)}` : "";
  const fila = (k: string, v: string) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b736f">${k}</td><td style="padding:4px 0;font-weight:600">${v}</td></tr>` : "");
  const chat = historia.slice(-30).map((m) => `<tr><td style="padding:4px 10px 4px 0;vertical-align:top;font-weight:700;color:${m.rol === "persona" ? "#b45309" : "#6b736f"}">${m.rol === "persona" ? "Persona" : "Asistente"}</td><td style="padding:4px 0">${escHtml(m.texto).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</td></tr>`).join("");
  const html = plantillaCorreo(`${nombre} pidió que le escriban`, `
    <p>Este correo lo mandó el <b>asistente del chat de la página principal</b> de Delywa. La persona pidió que el equipo la contacte.</p>
    <div style="background:#FFF4E4;border:1px solid #F0E2CC;border-radius:10px;padding:12px 14px;margin:12px 0"><b>Lo que necesita:</b><br>${escHtml(necesita).replace(/\n/g, "<br>")}</div>
    <table style="font-size:14px;border-collapse:collapse">${fila("Nombre", escHtml(nombre))}${fila("Correo", escHtml(correo))}${fila("WhatsApp", escHtml(whatsapp))}${fila("Negocio", escHtml(negocio))}${fila("Conversación", `#${conv.id}`)}</table>
    <p>${correo ? "Toca «Responder» y le llega directo a la persona." : "No dejó correo: escríbele por WhatsApp."}${wa ? ` <a href="${escHtml(wa)}">Escribirle por WhatsApp</a>` : ""}</p>
    ${chat ? `<p style="margin-top:16px"><b>Conversación</b></p><table style="font-size:13px;border-collapse:collapse">${chat}</table>` : ""}`);
  try {
    await enviarCorreo(c.env, { para: SOPORTE, asunto: `[Delywa · Chat de la página] ${nombre} necesita ayuda${negocio ? ` · ${negocio}` : ""}`, html, responder: correo || undefined });
  } catch (err) {
    console.error("[asistente] Correo a soporte no enviado:", err instanceof Error ? err.message : err);
    return c.json({ ok: true, enviado: false, mailto });
  }
  if (correo) {
    const confirmacion = plantillaCorreo("Recibimos tu mensaje", `<p>¡Gracias, ${escHtml(nombre.split(" ")[0])}! Recibimos tu mensaje desde el chat de delywa.com. El equipo de Delywa te va a escribir pronto.</p>
      <div style="background:#F4F6F5;border-radius:10px;padding:12px 14px"><b>Tu mensaje:</b><br>${escHtml(necesita).replace(/\n/g, "<br>")}</div>
      <p>Si quieres agregar algo, responde este correo o escribe a ${SOPORTE}.</p>`);
    await enviarCorreo(c.env, { para: correo, asunto: "Recibimos tu mensaje · Delywa", html: confirmacion, responder: SOPORTE }).catch(() => undefined);
  }
  return c.json({ ok: true, enviado: true });
});

// ---------- Plataforma → Asistente de la página ----------

asistenteRoutes.use("/api/admin/asistente", requireAuth, requireAdmin);
asistenteRoutes.use("/api/admin/asistente/*", requireAuth, requireAdmin);

asistenteRoutes.get("/api/admin/asistente", async (c) => {
  const db = getDb(c.env.DB);
  const hace = (dias: number) => new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const [[resumen], temas, sinRespuesta, aprendidas, conversaciones] = await Promise.all([
    db.select({
      conversaciones: sql<number>`count(*)`, mensajes: sql<number>`coalesce(sum(${asistenteConversaciones.mensajes}), 0)`,
      soporte: sql<number>`coalesce(sum(${asistenteConversaciones.soporte}), 0)`, convirtio: sql<number>`coalesce(sum(${asistenteConversaciones.convirtio}), 0)`,
    }).from(asistenteConversaciones).where(and(gt(asistenteConversaciones.creado, hace(7)), gt(asistenteConversaciones.mensajes, 0))),
    db.select({ tema: asistenteMensajes.tema, n: sql<number>`count(*)` }).from(asistenteMensajes)
      .where(and(eq(asistenteMensajes.rol, "persona"), isNotNull(asistenteMensajes.tema), gt(asistenteMensajes.creado, hace(30))))
      .groupBy(asistenteMensajes.tema).orderBy(desc(sql`count(*)`)).limit(12),
    db.select({ id: asistenteMensajes.id, texto: asistenteMensajes.texto, creado: asistenteMensajes.creado, conv: asistenteMensajes.convId }).from(asistenteMensajes)
      .where(and(eq(asistenteMensajes.rol, "persona"), isNull(asistenteMensajes.tema))).orderBy(desc(asistenteMensajes.id)).limit(40),
    db.select().from(asistenteRespuestas).orderBy(desc(asistenteRespuestas.id)),
    db.select({
      id: asistenteConversaciones.id, mensajes: asistenteConversaciones.mensajes, soporte: asistenteConversaciones.soporte,
      convirtio: asistenteConversaciones.convirtio, creado: asistenteConversaciones.creado,
      primera: sql<string>`(select texto from asistente_mensajes m where m.conv_id = ${asistenteConversaciones.id} and m.rol = 'persona' order by m.id limit 1)`,
    }).from(asistenteConversaciones).where(gt(asistenteConversaciones.mensajes, 0)).orderBy(desc(asistenteConversaciones.id)).limit(30),
  ]);
  return c.json({
    resumen: { conversaciones: Number(resumen?.conversaciones ?? 0), mensajes: Number(resumen?.mensajes ?? 0), soporte: Number(resumen?.soporte ?? 0), convirtio: Number(resumen?.convirtio ?? 0) },
    temas: temas.map((t) => ({ tema: t.tema, titulo: TITULOS[t.tema ?? ""] ?? t.tema, n: Number(t.n) })),
    sinRespuesta, aprendidas, conversaciones, soporte: SOPORTE,
  });
});

asistenteRoutes.get("/api/admin/asistente/conversacion/:id", async (c) => {
  const id = Number(c.req.param("id")) || 0;
  return c.json(await getDb(c.env.DB).select({ rol: asistenteMensajes.rol, texto: asistenteMensajes.texto, tema: asistenteMensajes.tema, creado: asistenteMensajes.creado })
    .from(asistenteMensajes).where(eq(asistenteMensajes.convId, id)).orderBy(asistenteMensajes.id));
});

asistenteRoutes.post("/api/admin/asistente/respuestas", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pregunta = texto(body.pregunta, 300), respuesta = texto(body.respuesta, 2000);
  if (!pregunta || !respuesta) return c.json({ error: "Escribe la pregunta y la respuesta." }, 400);
  const db = getDb(c.env.DB);
  const [fila] = await db.insert(asistenteRespuestas).values({ pregunta, respuesta }).returning();
  const u = c.var.user;
  await anotar(db, { userId: u.id, usuario: u.email, rol: u.role, accion: `Enseñó al asistente de la página: «${pregunta.slice(0, 80)}»`, ip: ip(c) });
  return c.json(fila, 201);
});

asistenteRoutes.put("/api/admin/asistente/respuestas/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const cambios: Partial<typeof asistenteRespuestas.$inferInsert> = {};
  if (typeof body.pregunta === "string" && body.pregunta.trim()) cambios.pregunta = texto(body.pregunta, 300);
  if (typeof body.respuesta === "string" && body.respuesta.trim()) cambios.respuesta = texto(body.respuesta, 2000);
  if (typeof body.activo === "boolean") cambios.activo = body.activo;
  if (!Object.keys(cambios).length) return c.json({ error: "Nada que cambiar." }, 400);
  const r = await getDb(c.env.DB).update(asistenteRespuestas).set(cambios).where(eq(asistenteRespuestas.id, Number(c.req.param("id")) || 0)).returning();
  if (!r.length) return c.json({ error: "Respuesta no encontrada" }, 404);
  return c.json(r[0]);
});

asistenteRoutes.delete("/api/admin/asistente/respuestas/:id", async (c) => {
  await getDb(c.env.DB).delete(asistenteRespuestas).where(eq(asistenteRespuestas.id, Number(c.req.param("id")) || 0));
  return c.json({ ok: true });
});

