import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Wallet } from "lucide-react";

// Portal de delivery → «Ganancias»: lo que lleva ganado, cuándo le pagan, sus pagos y lo que debe.
// Solo lo suyo: nunca las ventas del colmado.

type Datos = {
  moneda: string;
  forma: { modelo: "salario" | "comision" | "mixto"; periodo: string; salario: number; porEntrega: number; porcentaje: number };
  hoy: { entregas: number; comision: number; total: number };
  periodo: { entregas: number; salario: number; comision: number; total: number; desde: string; hasta: string; tipo: string; cobraEl: string };
  pagos: Array<{ id: number; desde: string; hasta: string; entregas: number; salario: number; comision: number; total: number; estado: string; fechaPago: string | null; pagadoPor: string | null; notas: string | null }>;
  saldoCuadres: number;
};

const NOMBRE_PERIODO: Record<string, string> = { semanal: "esta semana", quincenal: "esta quincena", mensual: "este mes", personalizado: "esta semana" };
const diaCorto = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-DO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-DO", { day: "numeric", month: "short" });

export function Ganancias() {
  const { data, isLoading, error } = useQuery<Datos>({
    queryKey: ["portal-ganancias"],
    queryFn: async () => { const r = await fetch("/api/portal-repartidor/ganancias", { credentials: "include" }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo cargar"); return r.json(); },
    refetchInterval: 60_000,
  });
  const [abierto, setAbierto] = useState<number | null>(null);
  if (isLoading) return <div className="px-4 py-10 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (error || !data) return <p className="px-4 py-6 text-red-700">{(error as Error)?.message || "No se pudo cargar"}</p>;
  const m = (n: number) => `${data.moneda}${n.toLocaleString("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const f = data.forma;
  const como = [
    (f.modelo === "salario" || f.modelo === "mixto") && f.salario > 0 && `${m(f.salario)} de salario por ${f.periodo === "mensual" ? "mes" : f.periodo === "quincenal" ? "quincena" : "semana"}`,
    (f.modelo === "comision" || f.modelo === "mixto") && f.porEntrega > 0 && `${m(f.porEntrega)} por entrega`,
    (f.modelo === "comision" || f.modelo === "mixto") && f.porcentaje > 0 && `${f.porcentaje} % de lo que entregas`,
  ].filter(Boolean) as string[];
  const p = data.periodo;
  return (
    <div className="px-4 pt-4 space-y-3" data-testid="ganancias">
      <section className="rounded-2xl bg-primary text-primary-foreground p-4">
        <p className="text-sm opacity-90">Llevas ganado {NOMBRE_PERIODO[f.periodo] ?? "este período"} ({diaCorto(p.desde)} – {diaCorto(p.hasta)})</p>
        <p className="text-4xl font-bold mt-1" data-testid="ganado-periodo">{m(p.total)}</p>
        <p className="text-sm mt-1 opacity-90">{p.entregas} entrega{p.entregas === 1 ? "" : "s"} · El período cierra el {diaCorto(p.hasta)}; el colmado te paga desde el {diaCorto(p.cobraEl)}.</p>
        {(p.salario > 0 || p.comision > 0) && (
          <div className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm space-y-0.5">
            {p.salario > 0 && <p className="flex justify-between"><span>Salario</span><span>{m(p.salario)}</span></p>}
            {p.comision > 0 && <p className="flex justify-between"><span>Comisiones</span><span>{m(p.comision)}</span></p>}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-3">
          <p className="text-2xl font-bold text-slate-900" data-testid="ganado-hoy">{m(data.hoy.total)}</p>
          <p className="text-xs text-slate-500">hoy · {data.hoy.entregas} entrega{data.hoy.entregas === 1 ? "" : "s"}</p>
        </div>
        <div className={`rounded-2xl border p-3 ${data.saldoCuadres < 0 ? "bg-red-50 border-red-200" : data.saldoCuadres > 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`} data-testid="saldo-cuadres">
          <p className={`text-2xl font-bold ${data.saldoCuadres < 0 ? "text-red-700" : "text-slate-900"}`}>{m(Math.abs(data.saldoCuadres))}</p>
          <p className="text-xs text-slate-600">{data.saldoCuadres < 0 ? "debes de cuadres (faltó dinero)" : data.saldoCuadres > 0 ? "el colmado te debe de cuadres" : "cuadres al día"}</p>
        </div>
      </div>

      <section className="rounded-2xl bg-white border border-slate-200 p-4">
        <p className="font-semibold text-slate-900 flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" />Cómo te pagan</p>
        <p className="text-sm text-slate-600 mt-1">{como.length ? como.join(" + ") : "El colmado todavía no ha puesto tu forma de pago. Pregúntale."}</p>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200">
        <p className="px-4 pt-4 pb-2 font-semibold text-slate-900">Mis pagos</p>
        {!data.pagos.length ? <p className="px-4 pb-4 text-sm text-slate-500">Todavía no tienes pagos. Cuando cierre tu primer período, aparece aquí.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.pagos.map((x) => (
              <li key={x.id} data-testid={`pago-${x.id}`}>
                <button type="button" className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setAbierto(abierto === x.id ? null : x.id)} aria-expanded={abierto === x.id}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{fechaCorta(x.desde)} – {fechaCorta(x.hasta)}</p>
                    <p className={`text-xs ${x.estado === "pagado" ? "text-emerald-700" : "text-amber-700"}`}>{x.estado === "pagado" ? `Pagado${x.fechaPago ? ` el ${fechaCorta(x.fechaPago)}` : ""}` : "Pendiente de pago"}</p>
                  </div>
                  <span className="font-bold text-slate-900">{m(x.total)}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${abierto === x.id ? "rotate-180" : ""}`} />
                </button>
                {abierto === x.id && (
                  <div className="px-4 pb-3 text-sm text-slate-600 space-y-0.5">
                    <p className="flex justify-between"><span>Entregas</span><span>{x.entregas}</span></p>
                    {x.salario > 0 && <p className="flex justify-between"><span>Salario</span><span>{m(x.salario)}</span></p>}
                    {x.comision > 0 && <p className="flex justify-between"><span>Comisiones</span><span>{m(x.comision)}</span></p>}
                    <p className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{m(x.total)}</span></p>
                    {x.pagadoPor && <p className="text-xs">Te pagó: {x.pagadoPor}</p>}
                    {x.notas && <p className="text-xs">Nota: {x.notas}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-slate-500 px-1">Si algo no te cuadra, habla con el colmado. Lo de hoy y del período se actualiza solo con cada entrega.</p>
    </div>
  );
}
