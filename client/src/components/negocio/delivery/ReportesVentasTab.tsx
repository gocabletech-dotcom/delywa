import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Package, DollarSign } from "lucide-react";

interface FilaReporte {
  deliveryId: number;
  deliveryNombre: string;
  bucket: string;
  totalPedidos: number;
  totalVentas: number;
}

const PALETTE = [
  "#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e",
  "#a78bfa", "#34d399", "#fb923c", "#38bdf8", "#e879f9",
];

function buildRanges() {
  const ahora = new Date();
  const finDeHoy = new Date(ahora);
  finDeHoy.setHours(23, 59, 59, 999);
  const isoHasta = finDeHoy.toISOString();

  const subDias = (n: number) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };
  const subMeses = (n: number) => {
    const d = new Date(ahora);
    d.setMonth(d.getMonth() - n);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  return [
    { label: "7d",    desde: subDias(7),    hasta: isoHasta },
    { label: "30d",   desde: subDias(30),   hasta: isoHasta },
    { label: "90d",   desde: subDias(90),   hasta: isoHasta },
    { label: "6m",    desde: subMeses(6),   hasta: isoHasta },
    { label: "1a",    desde: subMeses(12),  hasta: isoHasta },
    { label: "Todo",  desde: new Date("2000-01-01").toISOString(), hasta: isoHasta },
  ];
}

function formatBucket(bucket: string, agrupacion: string) {
  const d = new Date(bucket + "T12:00:00");
  if (agrupacion === "mes") return d.toLocaleDateString("es-DO", { month: "short" });
  if (agrupacion === "semana") return d.toLocaleDateString("es-DO", { day: "2-digit", month: "short" });
  return d.toLocaleDateString("es-DO", { day: "2-digit", month: "short" });
}

function fmt(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// Custom tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl border border-white/10 min-w-[130px]">
      <p className="font-semibold mb-1.5 text-gray-300">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.fill }} />
            <span className="capitalize truncate max-w-[80px]">{p.dataKey}</span>
          </span>
          <span className="font-bold">RD${Number(p.value).toLocaleString("es-DO")}</span>
        </div>
      ))}
    </div>
  );
};

export default function ReportesVentasTab({ colmadoId }: { colmadoId: number }) {
  const [agrupacion, setAgrupacion] = useState<"dia" | "semana" | "mes">("dia");
  const ranges = buildRanges();
  const [rangeIdx, setRangeIdx] = useState(2);

  const { desde, hasta } = ranges[rangeIdx];

  const { data: reporte, isLoading, error } = useQuery<FilaReporte[]>({
    queryKey: ["reporte-ventas-delivery", colmadoId, agrupacion, desde, hasta],
    queryFn: async () => {
      const params = new URLSearchParams({ agrupacion, desde, hasta });
      const res = await fetch(`/api/colmados/${colmadoId}/deliveries/reporte-ventas?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Error al cargar");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const buckets = Array.from(new Set((reporte || []).map((f) => f.bucket))).sort();
  const deliveryNames = Array.from(new Set((reporte || []).map((f) => f.deliveryNombre)));

  const chartData = buckets.map((bucket) => {
    const row: Record<string, any> = { label: formatBucket(bucket, agrupacion) };
    for (const name of deliveryNames) {
      const match = (reporte || []).find((f) => f.bucket === bucket && f.deliveryNombre === name);
      row[name] = match ? match.totalVentas : 0;
    }
    return row;
  });

  const totals = deliveryNames.map((name, i) => {
    const rows = (reporte || []).filter((f) => f.deliveryNombre === name);
    return {
      name,
      color: PALETTE[i % PALETTE.length],
      ventas: rows.reduce((s, f) => s + f.totalVentas, 0),
      pedidos: rows.reduce((s, f) => s + f.totalPedidos, 0),
    };
  }).sort((a, b) => b.ventas - a.ventas);

  const totalVentasGlobal = totals.reduce((s, t) => s + t.ventas, 0);
  const totalPedidosGlobal = totals.reduce((s, t) => s + t.pedidos, 0);

  // barSize: thin when many buckets, slightly wider when few
  const barSize = Math.max(6, Math.min(18, Math.floor(260 / Math.max(buckets.length, 1) / Math.max(deliveryNames.length, 1))));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Agrupación pill */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(["dia", "semana", "mes"] as const).map((op) => (
            <button
              key={op}
              onClick={() => setAgrupacion(op)}
              className={`px-3 py-1.5 transition-colors font-medium ${
                agrupacion === op
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
              data-testid={`btn-agrup-${op}`}
            >
              {op === "dia" ? "Día" : op === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        {/* Range pills */}
        <div className="flex gap-1 flex-wrap">
          {ranges.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                rangeIdx === i
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
              data-testid={`btn-rango-${r.label}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      {!isLoading && totalVentasGlobal > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-xl bg-indigo-100 flex items-center justify-center">
                <DollarSign size={14} className="text-indigo-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Total ventas</span>
            </div>
            <p className="text-xl font-bold text-gray-900">
              RD${totalVentasGlobal.toLocaleString("es-DO", { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Package size={14} className="text-emerald-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Entregas</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{totalPedidosGlobal}</p>
          </div>
        </div>
      )}

      {/* Chart card */}
      <Card className="border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-500" />
              <span className="text-sm font-semibold text-gray-800">Ventas por repartidor</span>
            </div>
            {/* Legend dots */}
            {deliveryNames.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {deliveryNames.map((name, i) => (
                  <span key={name} className="flex items-center gap-1.5 text-xs text-gray-500 capitalize">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            </div>
          ) : error || chartData.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center gap-2 text-gray-400">
              <TrendingUp size={32} className="text-gray-200" />
              <p className="text-sm">Sin entregas en este período</p>
              <p className="text-xs">Prueba ampliar el rango</p>
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  barCategoryGap="35%"
                  barGap={2}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#f0f0f0"
                    strokeDasharray="0"
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    dy={6}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    tickFormatter={fmt}
                    width={44}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "rgba(99,102,241,0.05)", radius: 4 } as any}
                  />
                  {deliveryNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId={deliveryNames.length === 1 ? undefined : "a"}
                      fill={PALETTE[i % PALETTE.length]}
                      radius={
                        deliveryNames.length === 1 || i === deliveryNames.length - 1
                          ? [6, 6, 0, 0]
                          : [0, 0, 0, 0]
                      }
                      maxBarSize={22}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-delivery table */}
      {totals.length > 0 && (
        <Card className="border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-gray-800 mb-4">Resumen por repartidor</p>
            <div className="space-y-3">
              {totals.map((t) => {
                const pct = totalVentasGlobal > 0 ? (t.ventas / totalVentasGlobal) * 100 : 0;
                return (
                  <div key={t.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: t.color }}
                        />
                        <span className="text-sm font-medium text-gray-800 capitalize">{t.name}</span>
                        <span className="text-xs text-gray-400">{t.pedidos} entregas</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">
                        RD${t.ventas.toLocaleString("es-DO", { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: t.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
