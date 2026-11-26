import { Check, Crown, Clock, Lock, Sparkles } from "lucide-react";
import { FUNCIONES_PLAN, INCLUIDO_SIEMPRE, precioPlan } from "@shared/funciones-plan";
import { useSuscripcion, type PlanPublico } from "@/lib/plan";

/** «Mi plan»: el plan actual, los días que le quedan y la comparación de los planes. */
export default function MiPlan({ colmadoId }: { colmadoId: number | null | undefined }) {
  const { data, isLoading } = useSuscripcion(colmadoId);
  if (isLoading || !data) return <p className="text-slate-500 p-4">Cargando tu plan…</p>;
  const actual = data.plan;
  const pagados = data.planes.filter((p) => !p.esTrial);
  const dias = data.diasRestantes;

  return (
    <div className="space-y-5" data-testid="mi-plan">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary text-primary-foreground grid place-items-center shrink-0"><Crown size={24} /></div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-slate-600">Tu plan</p>
          <p className="text-2xl font-extrabold text-slate-900" data-testid="text-mi-plan">{data.vigente?.nombre ?? actual?.nombre ?? "Sin plan"}</p>
          {data.vigente?.cortesia ? (
            <p className="text-sm text-slate-600">Cortesía de Delywa: tienes todo incluido.</p>
          ) : actual?.esTrial ? (
            <p className={`text-sm ${dias <= 3 ? "text-amber-700 font-semibold" : "text-slate-600"}`}>
              {dias > 0 ? `Prueba gratis con todo incluido · te quedan ${dias} día${dias === 1 ? "" : "s"}` : "Tu prueba gratis terminó. Elige un plan para seguir."}
            </p>
          ) : actual ? (
            <p className="text-sm text-slate-600">{precioPlan(actual.precioMensual, actual.moneda)} al mes{data.fechaVencimiento ? ` · se renueva el ${new Date(data.fechaVencimiento).toLocaleDateString("es-DO", { day: "numeric", month: "long" })}` : ""}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {pagados.map((p) => <TarjetaPlan key={p.id} plan={p} esActual={p.id === actual?.id} />)}
      </div>

      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 flex gap-3">
        <Clock size={18} className="shrink-0 mt-0.5 text-slate-500" />
        <p>Los planes se cobran en dólares (US$). Muy pronto podrás pagar con tarjeta desde aquí mismo. Mientras tanto, para cambiar de plan escríbenos a <a href="mailto:soporte@delywa.com" className="font-semibold text-primary underline">soporte@delywa.com</a>.</p>
      </div>
    </div>
  );
}

function TarjetaPlan({ plan, esActual }: { plan: PlanPublico; esActual: boolean }) {
  const funciones = plan.funciones ?? [];
  const anual = plan.precioAnual ? Number(plan.precioAnual) : null;
  return (
    <div className={`rounded-2xl border bg-white p-5 flex flex-col gap-3 ${esActual ? "border-primary ring-2 ring-primary/20" : "border-slate-200"}`} data-testid={`plan-${plan.slug}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-extrabold text-slate-900">{plan.nombre}</p>
          {plan.descripcionCorta && <p className="text-sm text-slate-600">{plan.descripcionCorta}</p>}
        </div>
        {esActual && <span className="text-xs font-bold rounded-full bg-primary text-primary-foreground px-2.5 py-1 shrink-0">Tu plan</span>}
      </div>
      <p className="text-3xl font-extrabold text-slate-900">
        {precioPlan(plan.precioMensual, plan.moneda)}<span className="text-base font-semibold text-slate-500">/mes</span>
      </p>
      {anual ? <p className="text-sm text-emerald-700 font-semibold -mt-2"><Sparkles size={14} className="inline -mt-0.5" /> O {precioPlan(anual, plan.moneda)} al año: 1 mes gratis</p> : null}
      <ul className="space-y-1.5 text-sm">
        <li className="flex gap-2"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />{plan.limiteDeliveries ? `Hasta ${plan.limiteDeliveries} repartidores` : "Repartidores sin límite"}</li>
        <li className="flex gap-2"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />{plan.limitePedidosDiarios ? `Hasta ${plan.limitePedidosDiarios} pedidos al día` : "Pedidos sin límite"}</li>
        {INCLUIDO_SIEMPRE.map((t) => <li key={t} className="flex gap-2"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />{t}</li>)}
        {FUNCIONES_PLAN.map((f) => {
          const incluye = funciones.includes(f.clave);
          return (
            <li key={f.clave} className={`flex gap-2 ${incluye ? "" : "text-slate-400"}`}>
              {incluye ? <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" /> : <Lock size={15} className="shrink-0 mt-0.5" />}
              <span>{f.nombre}{incluye && "enProceso" in f && f.enProceso ? <span className="ml-1.5 whitespace-nowrap text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5">En proceso</span> : null}</span>
            </li>
          );
        })}
        {plan.soportePrioritario && <li className="flex gap-2"><Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />Soporte prioritario</li>}
      </ul>
    </div>
  );
}
