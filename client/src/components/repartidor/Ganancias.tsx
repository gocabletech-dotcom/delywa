import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, ChevronDown, Loader2, Printer, Wallet } from "lucide-react";
import { imprimirTicket } from "@/lib/ticket";
import { activarPush, esIphoneSinInstalar, pushSoportado, suscripcionActual } from "@/lib/push";

// Portal de delivery → «Ganancias»: lo que lleva ganado, cuándo le pagan, sus pagos y lo que debe.
// Solo lo suyo: nunca las ventas del colmado.

type Datos = {
  moneda: string;
  colmado: string;
  forma: { modelo: "salario" | "comision" | "mixto"; periodo: string; salario: number; porEntrega: number; porcentaje: number; envio: boolean };
  hoy: { entregas: number; comision: number; envio: number; propinas: number; total: number };
  periodo: { entregas: number; salario: number; comision: number; envio: number; propinas: number; total: number; desde: string; hasta: string; tipo: string; cobraEl: string };
  pagos: Array<{
    id: number; desde: string; hasta: string; entregas: number; salario: number; comision: number; envio: number; total: number; estado: string; fechaPago: string | null; pagadoPor: string | null; notas: string | null;
    metodo: string | null; comprobante: string | null; recibido: string | null; ajustes: Array<{ id: number; tipo: string; monto: number; motivo: string | null }>;
  }>;
  saldoCuadres: number;
  adelantos: Array<{ id: number; monto: number; motivo: string | null; estado: "pendiente" | "aprobado" | "rechazado" | "descontado"; respuesta: string | null; fecha: string; resueltoAt: string | null }>;
  adelantoDisponible: number;
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
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const recibi = async (id: number) => {
    setConfirmando(id);
    await fetch(`/api/portal-repartidor/pagos/${id}/recibido`, { method: "POST", credentials: "include" }).catch(() => undefined);
    setConfirmando(null);
    qc.invalidateQueries({ queryKey: ["portal-ganancias"] });
  };
  if (isLoading) return <div className="px-4 py-10 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (error || !data) return <p className="px-4 py-6 text-red-700">{(error as Error)?.message || "No se pudo cargar"}</p>;
  const m = (n: number) => `${data.moneda}${n.toLocaleString("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const f = data.forma;
  const como = [
    (f.modelo === "salario" || f.modelo === "mixto") && f.salario > 0 && `${m(f.salario)} de salario por ${f.periodo === "mensual" ? "mes" : f.periodo === "quincenal" ? "quincena" : "semana"}`,
    (f.modelo === "comision" || f.modelo === "mixto") && f.porEntrega > 0 && `${m(f.porEntrega)} por entrega`,
    (f.modelo === "comision" || f.modelo === "mixto") && f.porcentaje > 0 && `${f.porcentaje} % de lo que entregas`,
    f.envio && "el envío de cada entrega",
  ].filter(Boolean) as string[];
  const ETIQUETA: Record<string, string> = { bono: "Bono", descuento: "Descuento", cuadre: "Cuadres", adelanto: "Adelanto" };
  const recibo = (x: Datos["pagos"][number]) => imprimirTicket({
    negocio: { nombre: data.colmado || "Colmado" }, titulo: `Recibo de pago · ${fechaCorta(x.desde)} – ${fechaCorta(x.hasta)}`, fecha: new Date(x.fechaPago ?? Date.now()),
    lineas: [
      ...(x.salario ? [{ nombre: "Salario", cantidad: 1, precio: x.salario }] : []),
      ...(x.comision ? [{ nombre: `Comisiones (${x.entregas} entregas)`, cantidad: 1, precio: x.comision }] : []),
      ...(x.envio ? [{ nombre: "Envíos", cantidad: 1, precio: x.envio }] : []),
      ...x.ajustes.map((a) => ({ nombre: `${ETIQUETA[a.tipo] ?? a.tipo}${a.motivo ? `: ${a.motivo}` : ""}`, cantidad: 1, precio: a.monto })),
    ],
    total: x.total, pago: { metodo: x.metodo }, moneda: data.moneda,
    pie: x.recibido ? `Recibido por el repartidor el ${new Date(x.recibido).toLocaleString("es-DO")}` : x.pagadoPor ? `Pagado por ${x.pagadoPor}` : "Pendiente de pago",
  });
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
            {p.envio > 0 && <p className="flex justify-between"><span>Envíos</span><span>{m(p.envio)}</span></p>}
          </div>
        )}
        {p.propinas > 0 && <p className="text-sm mt-2 opacity-90">Además, tus propinas: {m(p.propinas)} (son tuyas).</p>}
      </section>
      <AvisosRepartidor />

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
                    <p className={`text-xs ${x.estado === "pagado" ? "text-emerald-700" : "text-amber-700"}`}>{x.estado === "pagado" ? `Pagado${x.fechaPago ? ` el ${fechaCorta(x.fechaPago)}` : ""}${x.recibido ? " · recibido ✓" : " · toca para confirmar"}` : "Pendiente de pago"}</p>
                  </div>
                  <span className="font-bold text-slate-900">{m(x.total)}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${abierto === x.id ? "rotate-180" : ""}`} />
                </button>
                {abierto === x.id && (
                  <div className="px-4 pb-3 text-sm text-slate-600 space-y-0.5">
                    <p className="flex justify-between"><span>Entregas</span><span>{x.entregas}</span></p>
                    {x.salario > 0 && <p className="flex justify-between"><span>Salario</span><span>{m(x.salario)}</span></p>}
                    {x.comision > 0 && <p className="flex justify-between"><span>Comisiones</span><span>{m(x.comision)}</span></p>}
                    {x.envio > 0 && <p className="flex justify-between"><span>Envíos</span><span>{m(x.envio)}</span></p>}
                    {x.ajustes.map((a) => (
                      <p key={a.id} className={`flex justify-between ${a.monto < 0 ? "text-red-700" : "text-emerald-700"}`}><span>{ETIQUETA[a.tipo] ?? a.tipo}{a.motivo ? ` · ${a.motivo}` : ""}</span><span>{a.monto < 0 ? "−" : "+"}{m(Math.abs(a.monto))}</span></p>
                    ))}
                    <p className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{m(x.total)}</span></p>
                    {x.pagadoPor && <p className="text-xs">Te pagó: {x.pagadoPor}{x.metodo ? ` · ${x.metodo}` : ""}</p>}
                    {x.notas && <p className="text-xs">Nota: {x.notas}</p>}
                    {x.comprobante && <a href={x.comprobante} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary underline">Ver foto de la transferencia</a>}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button type="button" className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700" onClick={() => recibo(x)} data-testid={`recibo-${x.id}`}><Printer className="w-4 h-4" />Recibo</button>
                      {x.estado === "pagado" && !x.recibido && (
                        <button type="button" disabled={confirmando === x.id} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold" onClick={() => recibi(x.id)} data-testid={`recibi-${x.id}`}>
                          {confirmando === x.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Recibí mi pago
                        </button>
                      )}
                      {x.recibido && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" />Confirmaste que lo recibiste</span>}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Adelantos datos={data} m={m} />
      <MisNumeros />
      <p className="text-xs text-slate-500 px-1">Si algo no te cuadra, habla con el colmado. Lo de hoy y del período se actualiza solo con cada entrega.</p>
    </div>
  );
}

/** Avisos en el celular: pedido asignado, pago listo y pago hecho. */
function AvisosRepartidor() {
  const [ver, setVer] = useState(false);
  const [estado, setEstado] = useState("");
  useEffect(() => {
    if (!pushSoportado() || esIphoneSinInstalar() || Notification.permission === "denied") return;
    suscripcionActual().then((s) => setVer(!s)).catch(() => undefined);
  }, []);
  if (!ver) return null;
  if (estado === "listo") return <p className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">🔔 Listo: te avisamos cuando te asignen un pedido y cuando te paguen.</p>;
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center gap-3" data-testid="avisos-repartidor">
      <BellRing className="w-6 h-6 text-primary shrink-0" />
      <p className="flex-1 text-sm text-slate-700">Que te avise el celular cuando te asignen un pedido y cuando te paguen.{estado && estado !== "ocupado" ? <span className="block text-red-700">{estado}</span> : null}</p>
      <button type="button" disabled={estado === "ocupado"} className="min-h-[40px] px-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shrink-0"
        onClick={async () => {
          setEstado("ocupado");
          try {
            const suscripcion = await activarPush();
            const r = await fetch("/api/portal-repartidor/push", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suscripcion }) });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo");
            setEstado("listo");
          } catch (e: any) { setEstado(e.message || "No se pudo activar"); }
        }} data-testid="activar-avisos-repartidor">Activar</button>
    </div>
  );
}

/** Después de entregar: «¿Te dieron propina?». */
export function PreguntaPropina({ pedidoId, onCerrar }: { pedidoId: number; onCerrar: () => void }) {
  const [otra, setOtra] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const guardar = async (monto: number) => {
    setOcupado(true);
    await fetch(`/api/portal-repartidor/pedidos/${pedidoId}/propina`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monto }) }).catch(() => undefined);
    setOcupado(false);
    onCerrar();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Propina" data-testid="pregunta-propina">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3">
        <p className="text-lg font-bold text-slate-900">¿Te dieron propina en el pedido #{pedidoId}?</p>
        <p className="text-sm text-slate-600">Es tuya. Se anota para que veas lo que te ganas, pero no entra en la caja del colmado.</p>
        <div className="grid grid-cols-4 gap-2">
          {[25, 50, 100, 200].map((n) => <button key={n} type="button" disabled={ocupado} className="min-h-[48px] rounded-xl border border-slate-300 font-semibold" onClick={() => guardar(n)}>{n}</button>)}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 h-11 rounded-xl border border-slate-300 px-3" inputMode="decimal" placeholder="Otra cantidad" value={otra} onChange={(e) => setOtra(e.target.value.replace(/[^\d.]/g, ""))} />
          <button type="button" disabled={ocupado || !(Number(otra) > 0)} className="min-h-[44px] px-4 rounded-xl bg-primary text-primary-foreground font-semibold" onClick={() => guardar(Number(otra))}>Guardar</button>
        </div>
        <button type="button" className="w-full min-h-[44px] rounded-xl text-slate-600 font-semibold" onClick={onCerrar} data-testid="sin-propina">No me dieron</button>
      </div>
    </div>
  );
}

const ESTADO_ADELANTO: Record<string, [string, string]> = {
  pendiente: ["Esperando al colmado", "text-amber-700"], aprobado: ["Aprobado · se descuenta del próximo pago", "text-emerald-700"],
  rechazado: ["No aprobado", "text-red-700"], descontado: ["Descontado de tu pago", "text-slate-500"],
};

/** Pedir un adelanto: hasta la mitad de lo ganado en el período; el colmado lo aprueba. */
function Adelantos({ datos, m }: { datos: Datos; m: (n: number) => string }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState("");
  const pendiente = datos.adelantos.find((a) => a.estado === "pendiente");
  const pedir = async () => {
    setEstado("ocupado");
    const r = await fetch("/api/portal-repartidor/adelantos", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monto: Number(monto), motivo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setEstado(j.error || "No se pudo"); return; }
    setEstado(""); setAbierto(false); setMonto(""); setMotivo("");
    qc.invalidateQueries({ queryKey: ["portal-ganancias"] });
  };
  const cancelar = async (id: number) => {
    await fetch(`/api/portal-repartidor/adelantos/${id}/cancelar`, { method: "POST", credentials: "include" }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["portal-ganancias"] });
  };
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" data-testid="adelantos">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">Adelanto</p>
          <p className="text-xs text-slate-500">Puedes pedir hasta {m(datos.adelantoDisponible)} ahora (la mitad de lo que llevas ganado). Se descuenta de tu próximo pago.</p>
        </div>
        {!pendiente && !abierto && datos.adelantoDisponible >= 50 && (
          <button type="button" className="min-h-[40px] px-3 rounded-xl border border-primary text-primary text-sm font-semibold shrink-0" onClick={() => setAbierto(true)} data-testid="pedir-adelanto">Pedir</button>
        )}
      </div>
      {abierto && (
        <div className="space-y-2">
          <input className="w-full h-11 rounded-xl border border-slate-300 px-3" inputMode="numeric" placeholder={`Monto (hasta ${m(datos.adelantoDisponible)})`} value={monto} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))} data-testid="monto-adelanto" />
          <input className="w-full h-11 rounded-xl border border-slate-300 px-3" placeholder="Para qué (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {estado && estado !== "ocupado" && <p className="text-sm text-red-700">{estado}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={estado === "ocupado" || !(Number(monto) >= 50)} className="flex-1 min-h-[44px] rounded-xl bg-primary text-primary-foreground font-semibold" onClick={pedir} data-testid="enviar-adelanto">Pedir adelanto</button>
            <button type="button" className="min-h-[44px] px-4 rounded-xl border border-slate-300 font-semibold" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {datos.adelantos.length > 0 && (
        <ul className="divide-y divide-slate-100 text-sm">
          {datos.adelantos.map((a) => (
            <li key={a.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-slate-900">{m(a.monto)} · {fechaCorta(a.fecha)}{a.motivo ? ` · ${a.motivo}` : ""}</p>
                <p className={`text-xs ${ESTADO_ADELANTO[a.estado]?.[1] ?? ""}`}>{ESTADO_ADELANTO[a.estado]?.[0] ?? a.estado}{a.respuesta ? ` · ${a.respuesta}` : ""}</p>
              </div>
              {a.estado === "pendiente" && <button type="button" className="text-xs font-semibold text-red-700" onClick={() => cancelar(a.id)}>Cancelar</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Mis números de los últimos 30 días. */
function MisNumeros() {
  const { data } = useQuery<{ dias30: { entregas: number; fallidas: number; exito: number | null; minutosPromedio: number | null }; porDia: Array<{ dia: string; entregas: number }> }>({
    queryKey: ["portal-estadisticas"],
    queryFn: async () => { const r = await fetch("/api/portal-repartidor/estadisticas", { credentials: "include" }); if (!r.ok) throw new Error(); return r.json(); },
  });
  if (!data) return null;
  const max = Math.max(1, ...data.porDia.map((d) => d.entregas));
  const c = data.dias30;
  return (
    <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3" data-testid="mis-numeros">
      <p className="font-semibold text-slate-900">Mis números (30 días)</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-xl font-bold text-slate-900">{c.entregas}</p><p className="text-[11px] text-slate-500">entregas</p></div>
        <div><p className={`text-xl font-bold ${c.exito != null && c.exito < 90 ? "text-amber-700" : "text-slate-900"}`}>{c.exito != null ? `${c.exito} %` : "—"}</p><p className="text-[11px] text-slate-500">sin fallar ({c.fallidas} no entregadas)</p></div>
        <div><p className="text-xl font-bold text-slate-900">{c.minutosPromedio != null ? `${c.minutosPromedio} min` : "—"}</p><p className="text-[11px] text-slate-500">de listo a entregado</p></div>
      </div>
      <div>
        <div className="flex items-end gap-1 h-20" aria-label="Entregas por día, últimas 2 semanas">
          {data.porDia.map((d) => (
            <div key={d.dia} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.dia}: ${d.entregas}`}>
              <div className="w-full rounded-t bg-primary/80" style={{ height: `${(d.entregas / max) * 100}%`, minHeight: d.entregas ? 4 : 1 }} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">Entregas por día, últimas 2 semanas.</p>
      </div>
    </section>
  );
}
