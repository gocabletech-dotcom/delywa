import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, ExternalLink, Loader2 } from "lucide-react";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Ingresos: lo que pagan los colmados por su plan (facturas de Stripe), como en FoodPOS.

type Factura = {
  id: string; negocio: string; numero: string | null; estado: string | null; motivo: string | null; plan: string | null;
  total: string; pagado: string; comision: string | null; neto: string | null; reembolsado: string; creada: string | null;
  pagadaEn: string | null; intentos: number; error: string | null; url: string | null;
};
type Ingresos = {
  mes: string; modo: "prueba" | "real";
  totales: { cobrado: number; comision: number; neto: number; reembolsado: number; porCobrar: number; pagos: number };
  recurrenteMensual: number; suscripcionesActivas: number; porPlan: Record<string, number>;
  atrasadas: Array<{ colmadoId: number; negocio: string; fechaFin: string }>;
  proximosAVencer: Array<{ id: number; nombre: string; plan: string | null; vence: string | null }>;
  facturas: Factura[];
};

const usd = (v: number | string | null | undefined) => `US$${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ESTADO: Record<string, { texto: string; clase: string }> = {
  paid: { texto: "Pagada", clase: "bg-emerald-100 text-emerald-800" },
  open: { texto: "Por cobrar", clase: "bg-amber-100 text-amber-800" },
  void: { texto: "Anulada", clase: "bg-slate-100 text-slate-600" },
  uncollectible: { texto: "Incobrable", clase: "bg-red-100 text-red-800" },
  draft: { texto: "Borrador", clase: "bg-slate-100 text-slate-600" },
};
const MOTIVO: Record<string, string> = { subscription_create: "Primer pago", subscription_cycle: "Renovación", subscription_update: "Cambio de plan" };

function Cifra({ valor, texto, tono = "slate" }: { valor: string | number; texto: string; tono?: "slate" | "emerald" | "amber" | "red" }) {
  const fondo = { slate: "bg-slate-50 text-slate-900", emerald: "bg-emerald-50 text-emerald-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-800" }[tono];
  return <div className={`rounded-xl p-3 ${fondo}`}><p className="text-2xl font-bold">{valor}</p><p className="text-xs text-slate-600">{texto}</p></div>;
}

export function IngresosSection() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [modo, setModo] = useState<"" | "prueba" | "real">("");
  const { data, isLoading, error } = useQuery<Ingresos>({
    queryKey: ["/api/admin/ingresos", mes, modo],
    queryFn: () => pedirJSON<Ingresos>("GET", `/api/admin/ingresos?mes=${mes}${modo ? `&modo=${modo}` : ""}`),
  });

  return (
    <div className="space-y-5" data-testid="seccion-ingresos">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><DollarSign className="w-6 h-6 text-emerald-600" />Ingresos</h2>
          <p className="text-sm text-slate-500">Lo que pagan los colmados por su plan con Stripe, en dólares.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="border rounded-lg px-3 min-h-[40px]" data-testid="input-mes-ingresos" />
          <select value={modo || data?.modo || ""} onChange={(e) => setModo(e.target.value as "prueba" | "real")} className="border rounded-lg px-3 min-h-[40px]" data-testid="select-modo-ingresos">
            <option value="real">Dinero real</option>
            <option value="prueba">Pruebas</option>
          </select>
        </div>
      </div>

      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        : error || !data ? <p className="text-red-700">No se pudieron cargar los ingresos.</p>
        : (
          <>
            {data.modo === "prueba" && <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Estás viendo los pagos de prueba: no son dinero real.</p>}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Cifra valor={usd(data.totales.cobrado)} texto={`Cobrado en el mes (${data.totales.pagos} ${data.totales.pagos === 1 ? "pago" : "pagos"})`} tono="emerald" />
              <Cifra valor={usd(data.totales.comision)} texto="Comisión de Stripe" />
              <Cifra valor={usd(data.totales.neto)} texto="Neto para ti" tono="emerald" />
              <Cifra valor={usd(data.totales.porCobrar)} texto="Por cobrar" tono={data.totales.porCobrar ? "amber" : "slate"} />
              <Cifra valor={usd(data.totales.reembolsado)} texto="Reembolsado" tono={data.totales.reembolsado ? "red" : "slate"} />
              <Cifra valor={usd(data.recurrenteMensual)} texto={`Al mes, de ${data.suscripcionesActivas} que pagan`} />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-xl border bg-white p-4">
                <p className="font-semibold mb-2">Negocios por plan</p>
                {Object.entries(data.porPlan).sort((a, b) => b[1] - a[1]).map(([plan, n]) => (
                  <p key={plan} className="flex justify-between text-sm py-0.5"><span>{plan}</span><b>{n}</b></p>
                ))}
              </div>
              <div className="rounded-xl border bg-white p-4">
                <p className="font-semibold mb-2">Pago atrasado</p>
                {data.atrasadas.length === 0 ? <p className="text-sm text-slate-500">Ninguno.</p> : data.atrasadas.map((a) => (
                  <p key={a.colmadoId} className="text-sm flex gap-2 py-0.5"><AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />{a.negocio}</p>
                ))}
              </div>
              <div className="rounded-xl border bg-white p-4">
                <p className="font-semibold mb-2">En sus 3 días de gracia</p>
                {data.proximosAVencer.length === 0 ? <p className="text-sm text-slate-500">Ninguno.</p> : data.proximosAVencer.map((a) => (
                  <p key={a.id} className="text-sm py-0.5">{a.nombre} <span className="text-slate-500">· {a.plan}</span></p>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-white overflow-x-auto">
              <table className="w-full text-sm" data-testid="tabla-facturas">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr><th className="p-3">Fecha</th><th className="p-3">Negocio</th><th className="p-3">Plan</th><th className="p-3">Motivo</th><th className="p-3">Estado</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Comisión</th><th className="p-3 text-right">Neto</th><th className="p-3"></th></tr>
                </thead>
                <tbody>
                  {data.facturas.length === 0 ? (
                    <tr><td colSpan={9} className="p-6 text-center text-slate-500">No hay pagos en este mes.</td></tr>
                  ) : data.facturas.map((f) => {
                    const e = ESTADO[f.estado ?? ""] ?? { texto: f.estado ?? "—", clase: "bg-slate-100 text-slate-600" };
                    return (
                      <tr key={f.id} className="border-t">
                        <td className="p-3 whitespace-nowrap">{f.creada ? new Date(f.creada).toLocaleDateString("es-DO", { day: "numeric", month: "short" }) : "—"}</td>
                        <td className="p-3">{f.negocio}</td>
                        <td className="p-3">{f.plan ?? "—"}</td>
                        <td className="p-3">{MOTIVO[f.motivo ?? ""] ?? f.motivo ?? "—"}</td>
                        <td className="p-3">
                          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${e.clase}`}>{e.texto}</span>
                          {f.error && <p className="text-xs text-red-700 mt-1">{f.error}{f.intentos > 1 ? ` · ${f.intentos} intentos` : ""}</p>}
                          {Number(f.reembolsado) > 0 && <p className="text-xs text-red-700 mt-1">Reembolsado {usd(f.reembolsado)}</p>}
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">{usd(f.total)}</td>
                        <td className="p-3 text-right whitespace-nowrap text-slate-600">{f.comision != null ? usd(f.comision) : "—"}</td>
                        <td className="p-3 text-right whitespace-nowrap font-semibold">{f.neto != null ? usd(f.neto) : "—"}</td>
                        <td className="p-3">{f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700" aria-label="Ver la factura en Stripe"><ExternalLink className="w-4 h-4" /></a>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}
