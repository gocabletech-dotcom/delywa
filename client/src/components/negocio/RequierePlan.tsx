import { Link } from "wouter";
import { Lock } from "lucide-react";
import { nombreFuncion, precioPlan, type ClaveFuncion } from "@shared/funciones-plan";
import { cobroMensual, planQueLaTrae, useSuscripcion } from "@/lib/plan";

/** Pantalla con candado cuando el plan no incluye esta parte de Delywa. */
export function SinFuncionEnPlan({ colmadoId, funcion, compacto }: { colmadoId: number | null | undefined; funcion: ClaveFuncion; compacto?: boolean }) {
  const { data } = useSuscripcion(colmadoId);
  const sugerido = planQueLaTrae(data, funcion);
  return (
    <div className={`${compacto ? "" : "max-w-lg mx-auto my-10"} rounded-2xl border border-slate-200 bg-white p-6 text-center grid gap-3 justify-items-center`} data-testid={`sin-funcion-${funcion}`}>
      <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 grid place-items-center"><Lock size={26} /></div>
      <p className="text-lg font-extrabold text-slate-900">{nombreFuncion(funcion)}</p>
      <p className="text-slate-600">
        Tu plan {data?.vigente?.nombre ?? ""} no incluye esta parte.
        {sugerido ? <> Está en el plan <b>{sugerido.nombre}</b> por {precioPlan(cobroMensual(sugerido), sugerido.moneda)} al mes.</> : null}
      </p>
      <Link href="/negocio/settings?seccion=plan" className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-primary text-primary-foreground font-bold" data-testid="link-ver-planes">
        Ver los planes
      </Link>
    </div>
  );
}

/** Modo limitado: el plan terminó y pasaron los 3 días de gracia. Nada se borró. */
export function PlanTerminado({ esDueno }: { esDueno: boolean }) {
  return (
    <div className="max-w-lg mx-auto my-10 rounded-2xl border border-amber-300 bg-white p-6 text-center grid gap-3 justify-items-center" data-testid="plan-terminado">
      <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-700 grid place-items-center"><Lock size={26} /></div>
      <p className="text-lg font-extrabold text-slate-900">Tu plan terminó</p>
      <p className="text-slate-600">
        Por ahora la tienda, el chat y el mostrador no reciben pedidos nuevos. Toda tu información está guardada y vuelve al instante
        {esDueno ? " cuando eliges tu plan." : " cuando el dueño elija un plan. Avísale."}
      </p>
      {esDueno && (
        <Link href="/negocio/settings?seccion=plan" className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-primary text-primary-foreground font-bold" data-testid="link-elegir-plan">
          Elegir mi plan
        </Link>
      )}
    </div>
  );
}
