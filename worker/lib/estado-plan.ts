// Estado del plan de cada negocio según su fecha de fin (prueba o lo pagado):
//   activa      → hasta la fecha de fin.
//   en_gracia   → 3 días después: todo sigue funcionando y se le avisa.
//   suspendida  → «modo limitado»: el panel abre solo para elegir plan, y la tienda, el chat, el bot y el
//                 mostrador no reciben pedidos nuevos. Ningún dato se borra.
// La cortesía nunca vence. Las sucursales siguen al negocio principal.
import { eq } from "drizzle-orm";
import { avisosEnviados, colmados, planes, users, type Colmado, type Plan } from "@shared/schema";
import type { Env } from "../env";
import type { Db } from "../db";
import { boton, correoListo, enviarCorreo, escHtml, plantillaCorreo, SOPORTE } from "./correo";
import { avisarAlNegocio } from "./push";

const DIA = 24 * 60 * 60 * 1000;
export const DIAS_GRACIA = 3;
export type EstadoPlan = "activa" | "en_gracia" | "suspendida";

/** Fecha en que termina lo que tiene: la guardada, o el inicio del plan + su duración. */
export function finDelPlan(c: Pick<Colmado, "fechaVencimiento" | "fechaInicioPlan" | "fechaSuscripcion">, plan: Pick<Plan, "duracionDias"> | null | undefined): Date | null {
  if (c.fechaVencimiento) return new Date(c.fechaVencimiento);
  const inicio = c.fechaInicioPlan ?? c.fechaSuscripcion;
  return inicio && plan ? new Date(new Date(inicio).getTime() + (plan.duracionDias || 30) * DIA) : null;
}

export function estadoSegunFecha(fin: Date | null, cortesia: boolean, ahora = new Date()): EstadoPlan {
  if (cortesia || !fin) return "activa";
  if (ahora.getTime() <= fin.getTime()) return "activa";
  return ahora.getTime() <= fin.getTime() + DIAS_GRACIA * DIA ? "en_gracia" : "suspendida";
}

/** ¿El negocio (o su principal) está en modo limitado? */
export async function enModoLimitado(db: Db, colmado: Pick<Colmado, "estadoSuscripcion" | "cortesia" | "negocioPrincipalId">): Promise<boolean> {
  let n = colmado;
  if (colmado.negocioPrincipalId) {
    const [p] = await db.select({ estadoSuscripcion: colmados.estadoSuscripcion, cortesia: colmados.cortesia, negocioPrincipalId: colmados.negocioPrincipalId })
      .from(colmados).where(eq(colmados.id, colmado.negocioPrincipalId));
    if (p) n = p;
  }
  return n.estadoSuscripcion === "suspendida" && !n.cortesia;
}

export const MENSAJE_LIMITADO = "Este negocio no está recibiendo pedidos por aquí en este momento. Comunícate directamente con el colmado.";

type Cambio = { colmadoId: number; nombre: string; estadoAnterior: string | null; nuevoEstado: EstadoPlan; fin: Date | null };

/**
 * Revisa todos los negocios principales y les pone su estado (cron de cada hora y botón de la plataforma).
 * Las sucursales copian el del principal. Avisa al dueño al entrar en gracia y al pasar a modo limitado.
 */
export async function revisarPlanes(env: Env, db: Db, ahora = new Date()): Promise<Cambio[]> {
  const filas = await db.select({ c: colmados, plan: planes }).from(colmados).leftJoin(planes, eq(planes.id, colmados.planId));
  const cambios: Cambio[] = [];
  const estadoPrincipal = new Map<number, EstadoPlan>();
  for (const { c, plan } of filas.filter((f) => !f.c.negocioPrincipalId)) {
    const fin = finDelPlan(c, plan);
    const nuevo = estadoSegunFecha(fin, c.cortesia, ahora);
    estadoPrincipal.set(c.id, nuevo);
    if (c.estadoSuscripcion === nuevo) continue;
    await db.update(colmados).set({ estadoSuscripcion: nuevo }).where(eq(colmados.id, c.id));
    cambios.push({ colmadoId: c.id, nombre: c.nombre, estadoAnterior: c.estadoSuscripcion, nuevoEstado: nuevo, fin });
    if (nuevo !== "activa" && c.estado === "activo") await avisarCambio(env, db, c, nuevo, fin, !!plan?.esTrial).catch((e) => console.error("[planes] aviso", e instanceof Error ? e.message : e));
  }
  for (const { c } of filas.filter((f) => f.c.negocioPrincipalId)) {
    const nuevo = estadoPrincipal.get(c.negocioPrincipalId!);
    if (nuevo && c.estadoSuscripcion !== nuevo) await db.update(colmados).set({ estadoSuscripcion: nuevo }).where(eq(colmados.id, c.id));
  }
  return cambios;
}

const base = (env: Env) => (env.PUBLIC_URL || "https://delywa.com").replace(/\/+$/, "");
const fechaCorta = (d: Date) => d.toLocaleDateString("es-DO", { day: "numeric", month: "long", timeZone: "America/Santo_Domingo" });

async function duenoDe(db: Db, c: Colmado) {
  if (!c.ownerUserId) return null;
  const [u] = await db.select({ email: users.email, nombre: users.firstName }).from(users).where(eq(users.id, c.ownerUserId));
  return u ?? null;
}

/** Correo y aviso al celular, una sola vez por cada fecha de fin. */
async function avisarCambio(env: Env, db: Db, c: Colmado, estado: EstadoPlan, fin: Date | null, eraPrueba: boolean) {
  const clave = `plan:${estado}:${c.id}:${fin ? fin.toISOString().slice(0, 10) : "sin-fecha"}`;
  const nueva = await db.insert(avisosEnviados).values({ clave }).onConflictDoNothing().returning();
  if (!nueva.length) return;
  const queTermino = eraPrueba ? "Tu prueba gratis" : "Tu plan";
  const limite = fin ? new Date(fin.getTime() + DIAS_GRACIA * DIA) : null;
  const titulo = estado === "en_gracia"
    ? `${queTermino} de Delywa terminó · ${c.nombre}`
    : `${c.nombre} ya no recibe pedidos nuevos`;
  const texto = estado === "en_gracia"
    ? `Todo sigue funcionando ${limite ? `hasta el ${fechaCorta(limite)}` : `${DIAS_GRACIA} días más`}. Elige tu plan en Configuración → Mi plan para no parar.`
    : "Tu negocio está en modo limitado: la tienda, el chat y el mostrador no reciben pedidos nuevos. Elige un plan en Configuración → Mi plan y todo vuelve al instante.";
  await avisarAlNegocio(env, db, c, { titulo, texto, url: "/negocio/settings?seccion=plan", etiqueta: `plan-${c.id}` }).catch(() => 0);
  // El fin de la prueba ya tiene su correo (avisosFinDePrueba); aquí solo el del modo limitado.
  if (!correoListo(env) || (estado === "en_gracia" && eraPrueba)) return;
  const u = await duenoDe(db, c);
  if (!u?.email) return;
  const hola = u.nombre ? ` ${escHtml(String(u.nombre).split(" ")[0])}` : "";
  const cuerpo = `<p>Hola${hola},</p><p>${escHtml(texto).replace("Configuración → Mi plan", "<b>Configuración → Mi plan</b>")}</p><p>Toda tu información se queda igual.</p>`;
  await enviarCorreo(env, { para: u.email, asunto: titulo, html: plantillaCorreo(titulo, cuerpo + boton("Elegir mi plan", `${base(env)}/negocio/settings?seccion=plan`)), responder: SOPORTE });
}

/** Cobro fallido de Stripe: correo y aviso al dueño, una vez por factura. */
export async function avisarCobroFallido(env: Env, db: Db, colmadoId: number, facturaId: string, monto: string, error: string | null) {
  const nueva = await db.insert(avisosEnviados).values({ clave: `cobro-fallido:${facturaId}` }).onConflictDoNothing().returning();
  if (!nueva.length) return;
  const [c] = await db.select().from(colmados).where(eq(colmados.id, colmadoId));
  if (!c) return;
  const titulo = `No pudimos cobrar tu plan de Delywa · ${c.nombre}`;
  const texto = `El cobro de US$${monto} no pasó${error ? ` (${error})` : ""}. Stripe lo vuelve a intentar en los próximos días y mientras tanto todo sigue funcionando. Para evitar que se corte, pon otra tarjeta en Configuración → Mi plan → Cambiar tarjeta o ver facturas.`;
  await avisarAlNegocio(env, db, c, { titulo, texto: texto.slice(0, 180), url: "/negocio/settings?seccion=plan", etiqueta: `cobro-${c.id}` }).catch(() => 0);
  if (!correoListo(env)) return;
  const u = await duenoDe(db, c);
  if (!u?.email) return;
  const hola = u.nombre ? ` ${escHtml(String(u.nombre).split(" ")[0])}` : "";
  await enviarCorreo(env, {
    para: u.email, asunto: titulo, responder: SOPORTE,
    html: plantillaCorreo(titulo, `<p>Hola${hola},</p><p>${escHtml(texto)}</p>${boton("Cambiar mi tarjeta", `${base(env)}/negocio/settings?seccion=plan`)}`),
  });
}
