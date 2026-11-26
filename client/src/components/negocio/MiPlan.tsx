import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, CreditCard, Crown, Loader2, Lock, Sparkles } from "lucide-react";
import { FUNCIONES_PLAN, INCLUIDO_SIEMPRE, precioPlan } from "@shared/funciones-plan";
import { useSuscripcion, type DatosSuscripcion, type PlanPublico } from "@/lib/plan";
import { useToast } from "@/hooks/use-toast";

async function pedir<T>(url: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d as T;
}

const fechaLarga = (f: string | Date) => new Date(f).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" });

/** «Mi plan»: el plan actual, los días que le quedan, la comparación de los planes y el pago con Stripe. */
export default function MiPlan({ colmadoId }: { colmadoId: number | null | undefined }) {
  const { data, isLoading } = useSuscripcion(colmadoId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const confirmado = useRef(false);

  // Al volver de Stripe (?pago=ok&sesion=cs_…): se confirma el pago sin esperar al aviso de Stripe.
  useEffect(() => {
    if (!colmadoId || confirmado.current) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("pago") !== "ok") return;
    confirmado.current = true;
    const sesion = q.get("sesion");
    const limpiar = () => window.history.replaceState(null, "", `${window.location.pathname}?seccion=plan`);
    (sesion ? pedir(`/api/colmados/${colmadoId}/plan/confirmar`, { sesion }) : Promise.resolve())
      .then(() => toast({ title: "¡Pago recibido!", description: "Tu plan ya está activo. Gracias por confiar en Delywa." }))
      .catch(() => toast({ title: "Estamos confirmando tu pago", description: "En unos minutos verás tu plan nuevo aquí." }))
      .finally(() => { limpiar(); queryClient.invalidateQueries({ queryKey: ["suscripcion", colmadoId] }); });
  }, [colmadoId, queryClient, toast]);

  if (isLoading || !data) return <p className="text-slate-500 p-4">Cargando tu plan…</p>;
  const actual = data.plan;
  const pagados = data.planes.filter((p) => !p.esTrial);
  const pago = data.pago;
  const sus = pago?.suscripcion ?? null;
  const pagaConStripe = !!sus && (sus.estado === "activa" || sus.estado === "atrasada");

  const accion = async (clave: string, fn: () => Promise<void>) => {
    setOcupado(clave);
    try { await fn(); } catch (e) {
      toast({ title: "No se pudo", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setOcupado(null); }
  };

  const elegir = (plan: PlanPublico, periodo: "mes" | "anio") => accion(`${plan.id}-${periodo}`, async () => {
    if (pagaConStripe) {
      const precio = periodo === "anio" ? plan.precioAnual : plan.precioMensual;
      const ok = window.confirm(`¿Cambiar a ${plan.nombre} por ${precioPlan(precio, plan.moneda)} ${periodo === "anio" ? "al año" : "al mes"}? Stripe te cobra o te abona la diferencia de los días que faltan.`);
      if (!ok) return;
    }
    const r = await pedir<{ url?: string; cambiado?: boolean; plan?: string }>(`/api/colmados/${colmadoId}/plan/checkout`, { planId: plan.id, periodo });
    if (r.url) { window.location.href = r.url; return; }
    toast({ title: `Listo: ahora tienes el plan ${r.plan}` });
    await queryClient.invalidateQueries({ queryKey: ["suscripcion", colmadoId] });
  });

  const abrirPortal = () => accion("portal", async () => {
    const r = await pedir<{ url: string }>(`/api/colmados/${colmadoId}/plan/portal`);
    window.location.href = r.url;
  });

  const cancelar = (si: boolean) => accion(si ? "cancelar" : "reactivar", async () => {
    if (si && !window.confirm(`¿Cancelar tu plan? Lo sigues usando hasta el ${sus ? fechaLarga(sus.fechaFin) : "fin de lo pagado"} y no se te vuelve a cobrar.`)) return;
    await pedir(`/api/colmados/${colmadoId}/plan/${si ? "cancelar" : "reactivar"}`);
    toast({ title: si ? "Plan cancelado al final del período" : "Tu plan sigue activo" });
    await queryClient.invalidateQueries({ queryKey: ["suscripcion", colmadoId] });
  });

  return (
    <div className="space-y-5" data-testid="mi-plan">
      <Encabezado data={data} />

      {sus?.estado === "atrasada" && (
        <Aviso tono="rojo" testId="aviso-pago-atrasado">
          No se pudo cobrar tu plan. Stripe lo vuelve a intentar en los próximos días; mientras, todo sigue funcionando.
          {pago?.puedePagar && <> Toca <b>Cambiar tarjeta o ver facturas</b> para poner otra tarjeta.</>}
        </Aviso>
      )}
      {sus?.cancelaAlFinal && sus.estado !== "cancelada" && (
        <Aviso tono="ambar" testId="aviso-cancela">Cancelaste tu plan: lo usas hasta el {fechaLarga(sus.fechaFin)} y no se vuelve a cobrar.</Aviso>
      )}
      {pago?.modo === "prueba" && pago.puedePagar && (
        <Aviso tono="ambar" testId="aviso-stripe-prueba">Stripe está en modo de prueba: los pagos no son reales. Usa la tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier código.</Aviso>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {pagados.map((p) => (
          <TarjetaPlan
            key={p.id}
            plan={p}
            esActual={p.id === actual?.id && !actual?.esTrial}
            periodoActual={p.id === sus?.planId && pagaConStripe ? sus.periodo : null}
            botones={!!pago?.activo && pago.puedePagar}
            ocupado={ocupado}
            alElegir={elegir}
            cambiando={pagaConStripe}
          />
        ))}
      </div>

      {pago?.activo && pago.puedePagar && sus?.conTarjeta && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-wrap gap-3 items-center" data-testid="gestionar-pago">
          <CreditCard size={20} className="text-slate-500" />
          <p className="flex-1 min-w-[200px] text-sm text-slate-700">Tu plan se paga con tarjeta por Stripe{sus.periodo === "anio" ? ", una vez al año" : ", cada mes"}.</p>
          <button className="min-h-[44px] px-4 rounded-full border border-slate-300 font-semibold" onClick={abrirPortal} disabled={!!ocupado} data-testid="button-portal-pago">
            {ocupado === "portal" ? <Loader2 size={16} className="inline animate-spin" /> : "Cambiar tarjeta o ver facturas"}
          </button>
          {pagaConStripe && (sus.cancelaAlFinal
            ? <button className="min-h-[44px] px-4 rounded-full bg-primary text-primary-foreground font-semibold" onClick={() => cancelar(false)} disabled={!!ocupado} data-testid="button-reactivar-plan">No cancelar</button>
            : <button className="min-h-[44px] px-4 rounded-full text-red-700 font-semibold" onClick={() => cancelar(true)} disabled={!!ocupado} data-testid="button-cancelar-plan">Cancelar plan</button>)}
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 flex gap-3">
        <Clock size={18} className="shrink-0 mt-0.5 text-slate-500" />
        <p>
          Los planes se cobran en dólares (US$) con tarjeta, por Stripe.{" "}
          {!pago?.activo ? <>Muy pronto podrás pagar desde aquí mismo. Mientras tanto, para cambiar de plan escríbenos a <a href="mailto:soporte@delywa.com" className="font-semibold text-primary underline">soporte@delywa.com</a>.</>
            : pago.esSucursal ? "El plan se cambia desde el negocio principal y aplica a todas sus sucursales."
            : !pago.puedePagar ? "Solo el dueño del negocio puede cambiar o pagar el plan."
            : "Puedes cambiar de plan cuando quieras; Stripe cobra o abona la diferencia de los días que faltan."}
        </p>
      </div>
    </div>
  );
}

function Encabezado({ data }: { data: DatosSuscripcion }) {
  const actual = data.plan;
  const dias = data.diasRestantes;
  const sus = data.pago?.suscripcion;
  return (
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
          <p className="text-sm text-slate-600">
            {sus?.periodo === "anio" && actual.precioAnual ? `${precioPlan(actual.precioAnual, actual.moneda)} al año` : `${precioPlan(actual.precioMensual, actual.moneda)} al mes`}
            {data.fechaVencimiento ? ` · ${sus?.cancelaAlFinal ? "termina" : sus ? "se renueva" : "vence"} el ${fechaLarga(data.fechaVencimiento)}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Aviso({ tono, testId, children }: { tono: "rojo" | "ambar"; testId: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-4 text-sm flex gap-3 ${tono === "rojo" ? "bg-red-50 border-red-200 text-red-900" : "bg-amber-50 border-amber-200 text-amber-900"}`} data-testid={testId}>
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}

function TarjetaPlan({ plan, esActual, periodoActual, botones, ocupado, alElegir, cambiando }: {
  plan: PlanPublico; esActual: boolean; periodoActual: string | null; botones: boolean; ocupado: string | null;
  alElegir: (p: PlanPublico, periodo: "mes" | "anio") => void; cambiando: boolean;
}) {
  const funciones = plan.funciones ?? [];
  const anual = plan.precioAnual ? Number(plan.precioAnual) : null;
  const boton = (periodo: "mes" | "anio", texto: string, principal: boolean) => {
    const esEste = periodoActual === periodo;
    return (
      <button
        className={`min-h-[44px] px-4 rounded-full font-bold w-full ${esEste ? "bg-slate-100 text-slate-500" : principal ? "bg-primary text-primary-foreground" : "border border-primary text-primary"}`}
        disabled={esEste || !!ocupado}
        onClick={() => alElegir(plan, periodo)}
        data-testid={`button-elegir-${plan.slug}-${periodo}`}
      >
        {ocupado === `${plan.id}-${periodo}` ? <Loader2 size={16} className="inline animate-spin" /> : esEste ? "Es tu plan" : texto}
      </button>
    );
  };
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
      {botones && (
        <div className="grid gap-2">
          {boton("mes", cambiando ? "Cambiar a este plan (mensual)" : "Elegir este plan", true)}
          {anual ? boton("anio", cambiando ? "Cambiar a este plan (anual)" : "Pagar el año (1 mes gratis)", false) : null}
        </div>
      )}
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
