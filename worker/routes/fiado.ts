import { Hono } from "hono";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { fiadoCuentas, fiadoMovimientos, type FiadoCuenta } from "@shared/schema";
import type { AppEnv } from "../env";
import { getDb, type Db } from "../db";
import { requireAuth, requireBusinessAccess } from "../lib/auth";
import { ADMINISTRADORES, OPERADORES, nombreUsuario } from "../lib/permisos";

// Fiado (mejora 5): la libreta del colmado. Cada sucursal tiene sus cuentas; el saldo es lo que debe
// el cliente. Se le fía desde la venta de mostrador (método «Fiado») o anotando a mano; los abonos
// bajan el saldo. Todo queda en movimientos con quién lo hizo.
//  - Despachador, colmadero y dueño: ver, fiar y cobrar.
//  - Dueño y colmadero: crear cuentas con límite, cambiar el límite, desactivar.

export const fiadoRoutes = new Hono<AppEnv>();
const base = "/api/colmados/:id/fiado";
for (const r of [base, `${base}/*`]) {
  fiadoRoutes.use(r, requireAuth, requireBusinessAccess(), async (c, next) => {
    if (!OPERADORES.includes(c.var.user.role ?? "")) return c.json({ error: "No tienes permiso para el fiado de esta sucursal." }, 403);
    await next();
  });
}

const redondeo = (n: number) => Math.round(n * 100) / 100;
const MAXIMO = 1_000_000;
const telefono = (v: unknown) => (typeof v === "string" ? v.replace(/[^\d+]/g, "").slice(0, 16) || null : null);
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function vista(c: FiadoCuenta) {
  const saldo = Number(c.saldo) || 0;
  const limite = c.limite == null ? null : Number(c.limite);
  return { id: c.id, nombre: c.nombre, telefono: c.telefono, saldo, limite, disponible: limite == null ? null : redondeo(limite - saldo), activo: c.activo, notas: c.notas, ultimoMovimiento: c.ultimoMovimiento, fechaCreacion: c.fechaCreacion };
}

async function cuentaDe(db: Db, colmadoId: number, id: number) {
  const [c] = await db.select().from(fiadoCuentas).where(and(eq(fiadoCuentas.id, id), eq(fiadoCuentas.colmadoId, colmadoId)));
  return c;
}

/**
 * Anota un movimiento y cambia el saldo en un solo batch. El cargo vuelve a revisar el límite dentro
 * de la misma sentencia (si dos ventas llegan juntas, la segunda no lo pasa).
 */
export async function moverSaldo(db: Db, cuenta: FiadoCuenta, tipo: "cargo" | "abono", monto: number, extra: { pedidoId?: number; metodoPago?: string | null; nota?: string | null; usuario: string }) {
  const delta = tipo === "cargo" ? monto : -monto;
  const cambio = db.update(fiadoCuentas)
    .set({ saldo: sql`round(cast(${fiadoCuentas.saldo} as real) + ${delta}, 2)`, ultimoMovimiento: new Date() })
    .where(and(eq(fiadoCuentas.id, cuenta.id),
      tipo === "cargo"
        ? sql`(${fiadoCuentas.limite} is null or cast(${fiadoCuentas.saldo} as real) + ${monto} <= cast(${fiadoCuentas.limite} as real) + 0.001)`
        : sql`cast(${fiadoCuentas.saldo} as real) - ${monto} >= -0.001`))
    .returning({ id: fiadoCuentas.id });
  if (!(await cambio).length) return false;
  await db.insert(fiadoMovimientos).values({ cuentaId: cuenta.id, colmadoId: cuenta.colmadoId, tipo, monto: monto.toFixed(2), pedidoId: extra.pedidoId, metodoPago: extra.metodoPago ?? null, nota: extra.nota ?? null, usuario: extra.usuario });
  return true;
}

fiadoRoutes.get(base, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const q = (c.req.query("buscar") ?? "").trim().slice(0, 40);
  const filtro = q ? or(like(fiadoCuentas.nombre, `%${q}%`), like(fiadoCuentas.telefono, `%${q.replace(/\D/g, "") || q}%`)) : undefined;
  const filas = await db.select().from(fiadoCuentas)
    .where(and(eq(fiadoCuentas.colmadoId, colmadoId), eq(fiadoCuentas.activo, true), filtro))
    .orderBy(desc(sql`cast(${fiadoCuentas.saldo} as real)`), fiadoCuentas.nombre).limit(300);
  const cuentas = filas.map(vista);
  return c.json({ cuentas, totalFiado: redondeo(cuentas.reduce((s, x) => s + Math.max(0, x.saldo), 0)), conDeuda: cuentas.filter((x) => x.saldo > 0).length });
});

fiadoRoutes.post(base, async (c) => {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const body = (await c.req.json().catch(() => null)) || {};
  const nombre = texto(body.nombre, 80);
  if (!nombre) return c.json({ error: "Escribe el nombre del cliente." }, 400);
  let limite: string | null = null;
  if (body.limite != null && body.limite !== "") {
    if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero ponen el límite." }, 403);
    const n = Number(body.limite);
    if (!Number.isFinite(n) || n < 0 || n > MAXIMO) return c.json({ error: "Revisa el límite." }, 400);
    limite = n.toFixed(2);
  }
  const tel = telefono(body.telefono);
  if (tel) {
    const [repetido] = await db.select({ id: fiadoCuentas.id }).from(fiadoCuentas).where(and(eq(fiadoCuentas.colmadoId, colmadoId), eq(fiadoCuentas.telefono, tel), eq(fiadoCuentas.activo, true)));
    if (repetido) return c.json({ error: "Ya hay una cuenta con ese teléfono.", cuentaId: repetido.id }, 409);
  }
  const [cuenta] = await db.insert(fiadoCuentas).values({ colmadoId, nombre, telefono: tel, limite, notas: texto(body.notas, 300) }).returning();
  // Deuda vieja de la libreta de papel.
  const inicial = Number(body.saldoInicial);
  if (Number.isFinite(inicial) && inicial > 0 && inicial <= MAXIMO) {
    await db.update(fiadoCuentas).set({ saldo: inicial.toFixed(2), ultimoMovimiento: new Date() }).where(eq(fiadoCuentas.id, cuenta.id));
    await db.insert(fiadoMovimientos).values({ cuentaId: cuenta.id, colmadoId, tipo: "cargo", monto: inicial.toFixed(2), nota: "Lo que debía antes (libreta)", usuario: nombreUsuario(c.var.user) });
  }
  return c.json(vista((await cuentaDe(db, colmadoId, cuenta.id))!), 201);
});

fiadoRoutes.get(`${base}/:cid`, async (c) => {
  const db = getDb(c.env.DB);
  const cuenta = await cuentaDe(db, Number(c.req.param("id")), Number(c.req.param("cid")));
  if (!cuenta) return c.json({ error: "Cuenta no encontrada" }, 404);
  const movimientos = await db.select().from(fiadoMovimientos).where(eq(fiadoMovimientos.cuentaId, cuenta.id)).orderBy(desc(fiadoMovimientos.id)).limit(200);
  return c.json({ cuenta: vista(cuenta), movimientos: movimientos.map((m) => ({ ...m, monto: Number(m.monto) })) });
});

fiadoRoutes.patch(`${base}/:cid`, async (c) => {
  if (!ADMINISTRADORES.includes(c.var.user.role ?? "")) return c.json({ error: "Solo el dueño o el colmadero cambian una cuenta." }, 403);
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const cuenta = await cuentaDe(db, colmadoId, Number(c.req.param("cid")));
  if (!cuenta) return c.json({ error: "Cuenta no encontrada" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const set: Partial<typeof fiadoCuentas.$inferInsert> = {};
  if (body.nombre !== undefined) { const n = texto(body.nombre, 80); if (!n) return c.json({ error: "El nombre no puede quedar vacío." }, 400); set.nombre = n; }
  if (body.telefono !== undefined) set.telefono = telefono(body.telefono);
  if (body.notas !== undefined) set.notas = texto(body.notas, 300);
  if (body.limite !== undefined) {
    if (body.limite === null || body.limite === "") set.limite = null;
    else { const n = Number(body.limite); if (!Number.isFinite(n) || n < 0 || n > MAXIMO) return c.json({ error: "Revisa el límite." }, 400); set.limite = n.toFixed(2); }
  }
  if (body.activo === false) {
    if ((Number(cuenta.saldo) || 0) > 0.001) return c.json({ error: "No se puede cerrar una cuenta que todavía debe." }, 409);
    set.activo = false;
  }
  if (Object.keys(set).length) await db.update(fiadoCuentas).set(set).where(eq(fiadoCuentas.id, cuenta.id));
  return c.json(vista((await cuentaDe(db, colmadoId, cuenta.id))!));
});

async function movimiento(c: any, tipo: "cargo" | "abono") {
  const db = getDb(c.env.DB);
  const colmadoId = Number(c.req.param("id"));
  const cuenta = await cuentaDe(db, colmadoId, Number(c.req.param("cid")));
  if (!cuenta || !cuenta.activo) return c.json({ error: "Cuenta no encontrada" }, 404);
  const body = (await c.req.json().catch(() => null)) || {};
  const monto = redondeo(Number(body.monto));
  if (!Number.isFinite(monto) || monto <= 0 || monto > MAXIMO) return c.json({ error: "Escribe el monto." }, 400);
  const metodo = tipo === "abono" ? (["efectivo", "tarjeta", "transferencia"].includes(body.metodoPago) ? body.metodoPago : "efectivo") : null;
  const ok = await moverSaldo(db, cuenta, tipo, monto, { metodoPago: metodo, nota: texto(body.nota, 200), usuario: nombreUsuario(c.var.user) });
  if (!ok) {
    return c.json({ error: tipo === "cargo"
      ? `Pasa del límite de RD$${Number(cuenta.limite).toLocaleString("es-DO")}. Debe RD$${Number(cuenta.saldo).toLocaleString("es-DO")}.`
      : `El abono es más de lo que debe (RD$${Number(cuenta.saldo).toLocaleString("es-DO")}).` }, 409);
  }
  return c.json(vista((await cuentaDe(db, colmadoId, cuenta.id))!));
}
fiadoRoutes.post(`${base}/:cid/abono`, (c) => movimiento(c, "abono"));
fiadoRoutes.post(`${base}/:cid/cargo`, (c) => movimiento(c, "cargo"));
