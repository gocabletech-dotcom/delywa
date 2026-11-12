import { and, eq, isNull } from "drizzle-orm";
import { avisosEnviados, colmados, planes, users } from "@shared/schema";
import type { Env } from "../env";
import { getDb } from "../db";
import { boton, correoListo, enviarCorreo, escHtml, plantillaCorreo, SOPORTE } from "./correo";

const DIA = 24 * 60 * 60 * 1000;

/**
 * Aviso al dueño 3 días antes de que termine su prueba gratis y el día que termina (como FoodPOS v98).
 * Una sola vez por cada fecha de fin. Solo negocios principales, activos y con plan de prueba.
 */
export async function avisosFinDePrueba(env: Env): Promise<number> {
  if (!correoListo(env)) return 0;
  const db = getDb(env.DB);
  const filas = await db
    .select({ id: colmados.id, nombre: colmados.nombre, fechaVencimiento: colmados.fechaVencimiento, fechaInicioPlan: colmados.fechaInicioPlan, duracionDias: planes.duracionDias, email: users.email, dueno: users.firstName })
    .from(colmados)
    .innerJoin(planes, eq(planes.id, colmados.planId))
    .innerJoin(users, eq(users.id, colmados.ownerUserId))
    .where(and(eq(planes.esTrial, true), eq(colmados.estado, "activo"), isNull(colmados.negocioPrincipalId)));
  const base = (env.PUBLIC_URL || "https://delywa.com").replace(/\/+$/, "");
  let enviados = 0;
  for (const f of filas) {
    const fin = f.fechaVencimiento ?? (f.fechaInicioPlan ? new Date(f.fechaInicioPlan.getTime() + f.duracionDias * DIA) : null);
    if (!fin || !f.email) continue;
    const dias = Math.ceil((fin.getTime() - Date.now()) / DIA);
    const tipo = dias <= 0 && dias > -2 ? "fin" : dias >= 1 && dias <= 3 ? "3d" : null;
    if (!tipo) continue;
    const clave = `prueba:${tipo}:${f.id}:${fin.toISOString().slice(0, 10)}`;
    const nueva = await db.insert(avisosEnviados).values({ clave }).onConflictDoNothing().returning();
    if (!nueva.length) continue;
    const hola = f.dueno ? ` ${escHtml(String(f.dueno).split(" ")[0])}` : "";
    const asunto = tipo === "fin" ? `Tu prueba gratis de DelyWa terminó · ${f.nombre}` : `Tu prueba gratis de DelyWa termina en ${dias} día${dias === 1 ? "" : "s"} · ${f.nombre}`;
    const cuerpo = tipo === "fin"
      ? `<p>Hola${hola},</p><p>La prueba gratis de <b>${escHtml(f.nombre)}</b> en DelyWa terminó. Para seguir recibiendo pedidos sin interrupción, escríbenos y te activamos tu plan. Toda tu información se queda igual.</p>`
      : `<p>Hola${hola},</p><p>A la prueba gratis de <b>${escHtml(f.nombre)}</b> le quedan <b>${dias} día${dias === 1 ? "" : "s"}</b>. Para seguir sin interrupciones, escríbenos antes de que termine y te activamos tu plan. Toda tu información se queda igual.</p>`;
    try {
      await enviarCorreo(env, { para: f.email, asunto, html: plantillaCorreo(asunto, cuerpo + boton("Entrar a mi panel", `${base}/login`)), responder: SOPORTE });
      enviados++;
    } catch (err) {
      console.error("[avisos] Fin de prueba no enviado:", err instanceof Error ? err.message : err);
      await db.delete(avisosEnviados).where(eq(avisosEnviados.clave, clave)); // se reintenta al día siguiente
    }
  }
  return enviados;
}
