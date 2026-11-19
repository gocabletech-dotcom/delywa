import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { useAuth } from "@/hooks/use-auth";

// Reportes: cuánto se vendió en un periodo, día por día, y cómo va cada sucursal.
// Solo dueño y colmadero (el servidor lo exige).

type Periodo = "hoy" | "semana" | "mes" | "mes-pasado";
type Fila = { sucursalId: number; sucursal: string; totalVentas: string; pedidosEntregados: number; pedidosCancelados: number };
type Dia = { fecha: string; totalVentas: string; pedidosEntregados: number; pedidosCancelados: number };

const PERIODOS: Array<{ id: Periodo; texto: string }> = [
  { id: "hoy", texto: "Hoy" },
  { id: "semana", texto: "Últimos 7 días" },
  { id: "mes", texto: "Este mes" },
  { id: "mes-pasado", texto: "Mes pasado" },
];

const aDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Rango en la hora del aparato (el de RD para los colmados). */
function rango(p: Periodo, ahora = new Date()) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);
  if (p === "hoy") return { desde: hoy, hasta: manana };
  if (p === "semana") { const d = new Date(hoy); d.setDate(d.getDate() - 6); return { desde: d, hasta: manana }; }
  if (p === "mes") return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: manana };
  return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), hasta: new Date(hoy.getFullYear(), hoy.getMonth(), 1) };
}

export default function ReportesPage() {
  const qc = useQueryClient();
  const { isAuthenticated, isLoading: cargandoSesion } = useAuth();
  useEffect(() => { if (!cargandoSesion && !isAuthenticated) window.location.href = "/login"; }, [cargandoSesion, isAuthenticated]);
  const { data: rol } = useQuery({ queryKey: ["user-role"], queryFn: async () => { const r = await fetch("/api/user/role"); return r.ok ? r.json() : null; }, enabled: isAuthenticated });
  const colmadoId = rol?.colmadoId as number | undefined;
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const { desde, hasta } = useMemo(() => rango(periodo), [periodo]);

  const { data: consolidado, isLoading, error } = useQuery<{ reportes: Fila[] }>({
    queryKey: ["reportes", periodo],
    queryFn: async () => {
      const r = await fetch(`/api/negocio/reportes?desde=${encodeURIComponent(desde.toISOString())}&hasta=${encodeURIComponent(hasta.toISOString())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "No se pudo cargar el reporte");
      return j;
    },
    enabled: isAuthenticated,
  });
  // Día por día de la sucursal activa: hasta 62 días atrás cubre el mes pasado completo.
  const { data: dias = [] } = useQuery<Dia[]>({
    queryKey: ["ventas-historial", colmadoId, 62],
    queryFn: async () => { const r = await fetch(`/api/colmados/${colmadoId}/ventas?limit=62`); return r.ok ? r.json() : []; },
    enabled: !!colmadoId,
  });
  const { data: negocio } = useQuery<{ simboloMoneda?: string; nombre?: string }>({
    queryKey: ["colmado", colmadoId], queryFn: async () => (await fetch(`/api/colmados/${colmadoId}`)).json(), enabled: !!colmadoId,
  });
  const moneda = negocio?.simboloMoneda || "RD$";
  const dinero = (n: number) => `${moneda}${Math.round(n).toLocaleString("es-DO")}`;

  const filas = consolidado?.reportes ?? [];
  const total = filas.reduce((s, f) => s + Number(f.totalVentas || 0), 0);
  const entregados = filas.reduce((s, f) => s + (f.pedidosEntregados || 0), 0);
  const cancelados = filas.reduce((s, f) => s + (f.pedidosCancelados || 0), 0);
  const ticket = entregados ? total / entregados : 0;

  const serie = useMemo(() => {
    const porFecha = new Map(dias.map((d) => [d.fecha, d]));
    const salida: Array<{ fecha: string; etiqueta: string; total: number }> = [];
    for (const d = new Date(desde); d < hasta; d.setDate(d.getDate() + 1)) {
      const clave = aDia(d);
      salida.push({ fecha: clave, etiqueta: d.toLocaleDateString("es-DO", { day: "numeric", month: "short" }), total: Number(porFecha.get(clave)?.totalVentas || 0) });
    }
    return salida;
  }, [dias, desde, hasta]);

  const varias = filas.length > 1;
  const nombreActiva = filas.find((f) => f.sucursalId === colmadoId)?.sucursal ?? negocio?.nombre;

  const refrescar = (
    <button type="button" onClick={() => qc.invalidateQueries()} className="h-10 w-10 grid place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Actualizar" data-testid="button-refresh">
      <RefreshCw size={20} />
    </button>
  );

  return (
    <NegocioLayout title="Reportes" activeNav="reportes" headerRight={refrescar}>
      <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Periodo" data-testid="periodos-reporte">
            {PERIODOS.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} onClick={() => setPeriodo(p.id)}
                className={`shrink-0 min-h-[40px] px-4 rounded-full text-sm font-semibold border ${periodo === p.id ? "bg-[#E7F2EC] border-[#17804F] text-[#0F5C39]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {p.texto}
              </button>
            ))}
          </div>

          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{(error as Error).message}</div>}

          <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4" aria-label="Resumen del periodo">
            {[
              { id: "vendido", texto: "Vendido", valor: dinero(total), grande: true },
              { id: "entregados", texto: "Pedidos entregados", valor: entregados.toLocaleString("es-DO") },
              { id: "ticket", texto: "Promedio por pedido", valor: entregados ? dinero(ticket) : "—" },
              { id: "cancelados", texto: "Cancelados", valor: cancelados.toLocaleString("es-DO") },
            ].map((k) => (
              <div key={k.id} className={`rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:p-5 ${k.grande ? "col-span-2 lg:col-span-1" : ""}`} data-testid={`kpi-${k.id}`}>
                <p className="text-xs sm:text-sm text-slate-500">{k.texto}</p>
                <p className={`${k.grande ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"} font-bold font-heading text-slate-900`}>{isLoading ? "…" : k.valor}</p>
              </div>
            ))}
          </section>

          {periodo !== "hoy" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Ventas por día" data-testid="grafica-ventas-dia">
              <h2 className="font-bold text-slate-900">Ventas por día</h2>
              <p className="text-sm text-slate-500">{varias ? `Sucursal activa: ${nombreActiva}. Cámbiala en el menú para ver otra.` : "Solo pedidos entregados."}</p>
              <div className="h-56 sm:h-64 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#EEF2F0" />
                    <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : String(v))} />
                    <Tooltip cursor={{ fill: "#E7F2EC" }} formatter={(v: number) => [dinero(v), "Vendido"]} labelFormatter={(l) => String(l)} />
                    <Bar dataKey="total" fill="#17804F" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Por sucursal" data-testid="tabla-sucursales">
            <h2 className="font-bold text-slate-900">{varias ? "Por sucursal" : "Tu negocio"}</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {filas.map((f) => {
                const parte = total ? Number(f.totalVentas || 0) / total : 0;
                return (
                  <li key={f.sucursalId} className="py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-slate-900 truncate">{f.sucursal}</span>
                      <span className="font-bold text-slate-900 tabular-nums">{dinero(Number(f.totalVentas || 0))}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      {varias && <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true"><div className="h-full bg-[#17804F]" style={{ width: `${Math.round(parte * 100)}%` }} /></div>}
                      <span className="text-xs text-slate-500 shrink-0">{f.pedidosEntregados} entregados · {f.pedidosCancelados} cancelados{varias ? ` · ${Math.round(parte * 100)}%` : ""}</span>
                    </div>
                  </li>
                );
              })}
              {!isLoading && !filas.length && <li className="py-3 text-sm text-slate-500">No hay datos en este periodo.</li>}
            </ul>
          </section>
        </div>
      </main>
    </NegocioLayout>
  );
}
