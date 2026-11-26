// Plan vigente de un negocio y qué funciones incluye. Una sucursal usa el plan de su negocio principal.
// El plan de prueba y la cortesía lo incluyen todo. Lo básico no pasa por aquí: nunca se bloquea.
import type { Context, MiddlewareHandler } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { colmados, planes, type Plan } from "@shared/schema";
import { CLAVES_FUNCIONES, nombreFuncion, type ClaveFuncion } from "@shared/funciones-plan";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";

export type PlanVigente = {
  plan: Plan | null;
  /** Nombre que ve el colmado («Gratis», «Colmado», «Full», «Cortesía»). */
  nombre: string;
  funciones: ClaveFuncion[];
  /** Lo incluye todo (prueba o cortesía). */
  todo: boolean;
  cortesia: boolean;
};

const funcionesDe = (p: Plan | null | undefined): ClaveFuncion[] =>
  (Array.isArray(p?.funciones) ? p!.funciones : []).filter((f): f is ClaveFuncion => (CLAVES_FUNCIONES as string[]).includes(f));

export async function planDe(db: Db, colmadoId: number): Promise<PlanVigente | null> {
  const [c] = await db.select({ id: colmados.id, principal: colmados.negocioPrincipalId, planId: colmados.planId, cortesia: colmados.cortesia })
    .from(colmados).where(eq(colmados.id, colmadoId));
  if (!c) return null;
  const n = c.principal
    ? (await db.select({ planId: colmados.planId, cortesia: colmados.cortesia }).from(colmados).where(eq(colmados.id, c.principal)))[0] ?? c
    : c;
  if (n.cortesia) return { plan: null, nombre: "Cortesía", funciones: [...CLAVES_FUNCIONES], todo: true, cortesia: true };
  const [plan] = await db.select().from(planes).where(eq(planes.id, n.planId));
  if (!plan) return { plan: null, nombre: "Sin plan", funciones: [], todo: false, cortesia: false };
  const todo = !!plan.esTrial;
  return { plan, nombre: plan.nombre, funciones: todo ? [...CLAVES_FUNCIONES] : funcionesDe(plan), todo, cortesia: false };
}

export async function tieneFuncion(db: Db, colmadoId: number, funcion: ClaveFuncion): Promise<boolean> {
  const p = await planDe(db, colmadoId);
  return !!p && p.funciones.includes(funcion);
}

/** El plan pagado más barato que incluye la función (para decir «Está en el plan Full»). */
export async function planQueIncluye(db: Db, funcion: ClaveFuncion): Promise<Plan | undefined> {
  const filas = await db.select().from(planes).where(and(eq(planes.activo, true), eq(planes.visible, true), eq(planes.esTrial, false))).orderBy(asc(planes.orden));
  return filas.filter((p) => funcionesDe(p).includes(funcion)).sort((a, b) => Number(a.precioMensual) - Number(b.precioMensual))[0];
}

/** Respuesta 403 cuando el plan no incluye la función; el panel la usa para mostrar el candado. */
export async function respuestaSinFuncion(c: Context<AppEnv>, db: Db, vigente: PlanVigente | null, funcion: ClaveFuncion) {
  const sugerido = await planQueIncluye(db, funcion);
  return c.json({
    error: `Tu plan ${vigente?.nombre ?? ""} no incluye «${nombreFuncion(funcion)}».${sugerido ? ` Está en el plan ${sugerido.nombre}.` : ""} Cámbialo en Configuración → Mi plan.`.replace("plan  no", "plan no"),
    planFalta: funcion,
    planSugerido: sugerido?.nombre ?? null,
  }, 403);
}

/** Middleware para rutas /api/colmados/:id/… — va después de requireBusinessAccess. */
export function requierePlan(funcion: ClaveFuncion, param = "id"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = getDb(c.env.DB);
    const vigente = await planDe(db, Number(c.req.param(param)));
    if (!vigente?.funciones.includes(funcion)) return respuestaSinFuncion(c, db, vigente, funcion);
    await next();
  };
}
