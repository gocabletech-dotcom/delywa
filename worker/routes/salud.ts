import { Hono } from "hono";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { chatWebSesiones, colmados, pedidos } from "@shared/schema";
import { errores, respaldos } from "@shared/models/auth";
import type { AppEnv } from "../env";
import { getDb } from "../db";
import { requireAdmin, requireAuth } from "../lib/auth";
import { consumoDeHoy, cupoDiario } from "../lib/cupo-ia";

// Plataforma → Salud: cómo va la plataforma en una sola pantalla (solo platform_admin).
// Todo son consultas agregadas sobre índices existentes; nada de datos personales.

export const saludRoutes = new Hono<AppEnv>();
saludRoutes.use("/api/admin/salud", requireAuth, requireAdmin);

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

saludRoutes.get("/api/admin/salud", async (c) => {
  const db = getDb(c.env.DB);
  const ahora = Date.now();
  const hace24 = new Date(ahora - DIA);
  const hace7 = new Date(ahora - 7 * DIA);
  const hace14 = new Date(ahora - 14 * DIA);

  const [negocios, porEstado, pedidos24, pedidos7, porColmado7, conPedidos14, errores24, erroresPorRuta, chats24, ultimoRespaldo, ia, cupo] = await Promise.all([
    db.select({ estado: colmados.estado, n: sql<number>`count(*)` }).from(colmados).where(isNull(colmados.negocioPrincipalId)).groupBy(colmados.estado),
    db.select({ estado: pedidos.estado, n: sql<number>`count(*)` }).from(pedidos).where(gte(pedidos.fechaCreacion, hace24)).groupBy(pedidos.estado),
    db.select({ n: sql<number>`count(*)` }).from(pedidos).where(gte(pedidos.fechaCreacion, hace24)),
    db.select({ n: sql<number>`count(*)`, total: sql<number>`coalesce(sum(case when ${pedidos.estado} = 'entregado' then cast(${pedidos.total} as real) else 0 end), 0)` })
      .from(pedidos).where(gte(pedidos.fechaCreacion, hace7)),
    db.select({ colmadoId: pedidos.colmadoId, nombre: colmados.nombre, n: sql<number>`count(*)` }).from(pedidos)
      .innerJoin(colmados, eq(colmados.id, pedidos.colmadoId)).where(gte(pedidos.fechaCreacion, hace7))
      .groupBy(pedidos.colmadoId, colmados.nombre).orderBy(desc(sql`count(*)`)).limit(5),
    db.selectDistinct({ colmadoId: pedidos.colmadoId }).from(pedidos).where(gte(pedidos.fechaCreacion, hace14)),
    db.select({ n: sql<number>`count(*)` }).from(errores).where(gte(errores.fecha, hace24)),
    db.select({ ruta: errores.ruta, n: sql<number>`count(*)` }).from(errores).where(gte(errores.fecha, hace24))
      .groupBy(errores.ruta).orderBy(desc(sql`count(*)`)).limit(5),
    db.select({ n: sql<number>`count(*)` }).from(chatWebSesiones).where(gte(chatWebSesiones.fechaCreacion, hace24)),
    db.select().from(respaldos).orderBy(desc(respaldos.dia)).limit(1),
    consumoDeHoy(db),
    cupoDiario(db),
  ]);

  // Negocios activos que no han tenido pedidos en 14 días: a quién llamar.
  const activos = await db.select({ id: colmados.id, nombre: colmados.nombre, telefono: colmados.whatsappNumero, fechaCreacion: colmados.fechaSuscripcion })
    .from(colmados).where(and(eq(colmados.estado, "activo"), isNull(colmados.negocioPrincipalId)));
  const sucursales = activos.length
    ? await db.select({ id: colmados.id, principal: colmados.negocioPrincipalId }).from(colmados).where(inArray(colmados.negocioPrincipalId, activos.map((a) => a.id)))
    : [];
  const conMovimiento = new Set(conPedidos14.map((p) => p.colmadoId));
  for (const s of sucursales) if (conMovimiento.has(s.id) && s.principal) conMovimiento.add(s.principal);
  const sinPedidos = activos.filter((a) => !conMovimiento.has(a.id)).slice(0, 20)
    .map((a) => ({ id: a.id, nombre: a.nombre, telefono: a.telefono, desde: a.fechaCreacion }));

  const contar = (filas: Array<{ estado: string | null; n: number }>) => Object.fromEntries(filas.map((f) => [f.estado ?? "sin_estado", Number(f.n)]));
  const respaldo = ultimoRespaldo[0];
  const avisos: string[] = [];
  const nErrores = Number(errores24[0]?.n ?? 0);
  if (nErrores >= 20) avisos.push(`${nErrores} errores en las últimas 24 horas. Revisa Seguridad → Errores del sistema.`);
  if (!respaldo || ahora - new Date(respaldo.dia).getTime() > 2 * DIA) avisos.push("No hay un respaldo de la base en los últimos 2 días.");
  else if (respaldo.estado === "fallido") avisos.push(`El respaldo del ${respaldo.dia} falló.`);
  if (ia.neuronas >= cupo * 0.8) avisos.push("La IA del bot va por más del 80 % del cupo gratis de hoy.");
  const pendientes = contar(negocios).pendiente_revision ?? 0;
  if (pendientes) avisos.push(`${pendientes} negocio(s) esperando aprobación en Solicitudes.`);

  return c.json({
    negocios: contar(negocios),
    pedidos: { ultimas24h: Number(pedidos24[0]?.n ?? 0), porEstado24h: contar(porEstado), ultimos7d: Number(pedidos7[0]?.n ?? 0), vendido7d: Math.round(Number(pedidos7[0]?.total ?? 0)) },
    masPedidos7d: porColmado7.map((p) => ({ ...p, n: Number(p.n) })),
    sinPedidos14d: sinPedidos,
    errores: { ultimas24h: nErrores, porRuta: erroresPorRuta.map((e) => ({ ruta: e.ruta, n: Number(e.n) })) },
    chats24h: Number(chats24[0]?.n ?? 0),
    ia: { neuronas: Math.round(ia.neuronas), cupo, llamadasTexto: ia.llamadasTexto, notasDeVoz: ia.notasDeVoz, sinCupo: ia.sinCupo },
    respaldo: respaldo ? { dia: respaldo.dia, estado: respaldo.estado, filas: respaldo.filas } : null,
    avisos,
  });
});
