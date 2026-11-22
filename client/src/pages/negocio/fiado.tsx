import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2, MessageCircle, Plus, Search, X } from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// Fiado: la libreta del colmado. Lo que te debe cada cliente, cuándo se le fió y cuándo abonó.

type Cuenta = { id: number; nombre: string; telefono: string | null; saldo: number; limite: number | null; disponible: number | null; notas: string | null; ultimoMovimiento: string | null };
type Movimiento = { id: number; tipo: "cargo" | "abono"; monto: number; pedidoId: number | null; metodoPago: string | null; nota: string | null; usuario: string | null; fecha: string };

const dinero = (n: number) => `RD$${n.toLocaleString("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const campo = "w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#17804F]/40";
const boton = "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold text-[15px] disabled:opacity-50";

async function enviar(url: string, metodo: string, cuerpo?: unknown) {
  const r = await fetch(url, { method: metodo, credentials: "include", headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar");
  return j;
}

export default function FiadoPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAuthenticated, isLoading: cargandoSesion } = useAuth();
  useEffect(() => { if (!cargandoSesion && !isAuthenticated) window.location.href = "/login"; }, [cargandoSesion, isAuthenticated]);
  const { data: rol } = useQuery({ queryKey: ["user-role"], queryFn: async () => { const r = await fetch("/api/user/role"); return r.ok ? r.json() : null; }, enabled: isAuthenticated });
  const colmadoId = rol?.colmadoId as number | undefined;
  const esAdmin = ["colmado_owner", "admin_pedidos", "platform_admin"].includes(rol?.role);
  const { data: negocio } = useQuery<{ nombre: string }>({ queryKey: ["colmado", colmadoId], queryFn: async () => (await fetch(`/api/colmados/${colmadoId}`)).json(), enabled: !!colmadoId });
  const [buscar, setBuscar] = useState("");
  const base = `/api/colmados/${colmadoId}/fiado`;
  const { data, isLoading } = useQuery<{ cuentas: Cuenta[]; totalFiado: number; conDeuda: number }>({
    queryKey: ["fiado", colmadoId, "lista", buscar],
    queryFn: async () => { const r = await fetch(`${base}?buscar=${encodeURIComponent(buscar)}`); if (!r.ok) throw new Error(); return r.json(); },
    enabled: !!colmadoId,
  });
  const [abierta, setAbierta] = useState<number | null>(null);
  const [nueva, setNueva] = useState(false);
  const recargar = () => qc.invalidateQueries({ queryKey: ["fiado", colmadoId] });

  return (
    <NegocioLayout title="Fiado" activeNav="fiado">
      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-900" data-testid="total-fiado">{dinero(data?.totalFiado ?? 0)}</p><p className="text-sm text-slate-500">te deben en total</p></div>
            <div className="rounded-2xl bg-white border border-slate-200 p-4"><p className="text-2xl font-bold text-slate-900">{data?.conDeuda ?? 0}</p><p className="text-sm text-slate-500">clientes con deuda</p></div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${campo} pl-9`} placeholder="Buscar por nombre o teléfono" value={buscar} onChange={(e) => setBuscar(e.target.value)} data-testid="buscar-fiado" />
            </div>
            <button type="button" className={`${boton} bg-[#17804F] text-white hover:bg-[#0F5C39]`} onClick={() => setNueva(true)} data-testid="nuevo-cliente-fiado"><Plus className="w-4 h-4" />Nuevo</button>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
            {isLoading ? <div className="p-4"><Loader2 className="w-5 h-5 animate-spin text-[#17804F]" /></div> : !data?.cuentas.length ? (
              <div className="p-6 text-center text-slate-600 space-y-1">
                <BookOpen className="w-8 h-8 mx-auto text-slate-400" />
                <p className="font-semibold text-slate-900">Tu libreta está vacía</p>
                <p className="text-sm">Toca «Nuevo» para agregar un cliente. Puedes poner lo que ya debía en la libreta de papel.</p>
              </div>
            ) : data.cuentas.map((c) => {
              const pasado = c.limite != null && c.saldo > c.limite;
              return (
                <button key={c.id} type="button" className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50" onClick={() => setAbierta(c.id)} data-testid={`cuenta-${c.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{c.nombre}</p>
                    <p className="text-xs text-slate-500">{c.telefono || "Sin teléfono"}{c.limite != null ? ` · límite ${dinero(c.limite)}` : ""}</p>
                  </div>
                  <span className={`font-bold ${c.saldo > 0 ? (pasado ? "text-red-700" : "text-slate-900") : "text-[#17804F]"}`}>{c.saldo > 0 ? dinero(c.saldo) : "Al día"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
      {nueva && colmadoId && (
        <NuevaCuenta base={base} esAdmin={esAdmin} onCerrar={() => setNueva(false)} onLista={(id) => { setNueva(false); recargar(); setAbierta(id); toast({ title: "Cliente agregado" }); }} />
      )}
      {abierta && colmadoId && (
        <DetalleCuenta base={base} id={abierta} esAdmin={esAdmin} negocio={negocio?.nombre ?? "el colmado"} onCerrar={() => setAbierta(null)} onCambio={recargar} />
      )}
    </NegocioLayout>
  );
}

function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full sm:max-w-md h-full bg-white overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900 truncate">{titulo}</h2>
          <button type="button" aria-label="Cerrar" className="w-10 h-10 grid place-items-center" onClick={onCerrar}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function NuevaCuenta({ base, esAdmin, onCerrar, onLista }: { base: string; esAdmin: boolean; onCerrar: () => void; onLista: (id: number) => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ nombre: "", telefono: "", limite: "", saldoInicial: "" });
  const [ocupado, setOcupado] = useState(false);
  return (
    <Hoja titulo="Nuevo cliente de fiado" onCerrar={onCerrar}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setOcupado(true);
        try { const c = await enviar(base, "POST", { ...f, limite: esAdmin ? f.limite : undefined }); onLista(c.id); }
        catch (err: any) { toast({ title: "No se pudo guardar", description: err.message, variant: "destructive" }); }
        setOcupado(false);
      }}>
        <label className="block text-sm font-semibold text-slate-700">Nombre<input className={campo} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Doña Carmen" data-testid="fiado-nombre" /></label>
        <label className="block text-sm font-semibold text-slate-700">Teléfono (para recordarle)<input className={campo} inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="809 555 1234" data-testid="fiado-telefono" /></label>
        {esAdmin && <label className="block text-sm font-semibold text-slate-700">Límite (opcional)<input className={campo} inputMode="decimal" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value })} placeholder="Sin límite" data-testid="fiado-limite" /></label>}
        <label className="block text-sm font-semibold text-slate-700">Lo que ya debía (opcional)<input className={campo} inputMode="decimal" value={f.saldoInicial} onChange={(e) => setF({ ...f, saldoInicial: e.target.value })} placeholder="De la libreta de papel" data-testid="fiado-inicial" /></label>
        <button type="submit" disabled={ocupado || !f.nombre.trim()} className={`${boton} w-full bg-[#17804F] text-white`} data-testid="fiado-guardar">{ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</button>
      </form>
    </Hoja>
  );
}

function DetalleCuenta({ base, id, esAdmin, negocio, onCerrar, onCambio }: { base: string; id: number; esAdmin: boolean; negocio: string; onCerrar: () => void; onCambio: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const clave = ["fiado-detalle", base, id];
  const { data } = useQuery<{ cuenta: Cuenta; movimientos: Movimiento[] }>({ queryKey: clave, queryFn: async () => { const r = await fetch(`${base}/${id}`); if (!r.ok) throw new Error(); return r.json(); } });
  const [accion, setAccion] = useState<"abono" | "cargo" | null>(null);
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [limite, setLimite] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const c = data?.cuenta;
  const guardar = async (url: string, metodoHttp: string, cuerpo: unknown, aviso: string) => {
    setOcupado(true);
    try { await enviar(url, metodoHttp, cuerpo); toast({ title: aviso }); qc.invalidateQueries({ queryKey: clave }); onCambio(); setAccion(null); setMonto(""); setNota(""); setLimite(null); }
    catch (err: any) { toast({ title: "No se pudo", description: err.message, variant: "destructive" }); }
    setOcupado(false);
  };
  const recordatorio = c?.telefono && c.saldo > 0
    ? `https://wa.me/${c.telefono.replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")}?text=${encodeURIComponent(`Hola ${c.nombre} 👋, te saludamos de ${negocio}. Te recordamos que tienes un balance pendiente de ${dinero(c.saldo)}. ¡Gracias!`)}`
    : null;
  return (
    <Hoja titulo={c?.nombre ?? "Cuenta"} onCerrar={onCerrar}>
      {!c ? <Loader2 className="w-5 h-5 animate-spin text-[#17804F]" /> : (
        <>
          <div className="rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-sm text-slate-500">Debe</p>
            <p className={`text-3xl font-bold ${c.limite != null && c.saldo > c.limite ? "text-red-700" : "text-slate-900"}`} data-testid="saldo-cuenta">{dinero(c.saldo)}</p>
            {c.limite != null && <p className="text-sm text-slate-500">Límite {dinero(c.limite)} · le quedan {dinero(Math.max(0, c.disponible ?? 0))}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={`${boton} bg-[#17804F] text-white`} onClick={() => setAccion("abono")} data-testid="registrar-abono">Registrar abono</button>
            <button type="button" className={`${boton} border border-slate-300 text-slate-800`} onClick={() => setAccion("cargo")} data-testid="anotar-fiado">Anotar fiado</button>
          </div>
          {recordatorio && <a href={recordatorio} target="_blank" rel="noreferrer" className={`${boton} w-full border border-[#25D366] text-[#128C7E]`} data-testid="recordar-whatsapp"><MessageCircle className="w-4 h-4" />Recordarle por WhatsApp</a>}
          {accion && (
            <form className="rounded-2xl border border-slate-200 p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); guardar(`${base}/${id}/${accion}`, "POST", { monto: Number(monto), nota, metodoPago: metodo }, accion === "abono" ? "Abono registrado" : "Fiado anotado"); }}>
              <p className="font-semibold text-slate-900">{accion === "abono" ? "¿Cuánto pagó?" : "¿Cuánto se le fió?"}</p>
              <input autoFocus className={campo} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Monto" data-testid="monto-movimiento" />
              {accion === "abono" && c.saldo > 0 && <button type="button" className="text-sm text-[#0F5C39] font-semibold" onClick={() => setMonto(String(c.saldo))}>Pagó todo ({dinero(c.saldo)})</button>}
              {accion === "abono" && (
                <select className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo pagó">
                  <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option>
                </select>
              )}
              <input className={campo} value={nota} onChange={(e) => setNota(e.target.value)} placeholder={accion === "cargo" ? "Qué se llevó (opcional)" : "Nota (opcional)"} />
              <div className="flex gap-2">
                <button type="submit" disabled={ocupado || !(Number(monto) > 0)} className={`${boton} flex-1 bg-[#17804F] text-white`} data-testid="guardar-movimiento">{ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</button>
                <button type="button" className={`${boton} border border-slate-300`} onClick={() => setAccion(null)}>Cancelar</button>
              </div>
            </form>
          )}
          {esAdmin && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Límite de fiado</p>
              <div className="flex gap-2">
                <input className={campo} inputMode="decimal" value={limite ?? (c.limite == null ? "" : String(c.limite))} onChange={(e) => setLimite(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Sin límite" data-testid="editar-limite" />
                <button type="button" disabled={limite === null || ocupado} className={`${boton} border border-slate-300`} onClick={() => guardar(`${base}/${id}`, "PATCH", { limite: limite === "" ? null : Number(limite) }, "Límite guardado")}>Guardar</button>
              </div>
              {c.saldo <= 0 && <button type="button" className="text-sm text-red-700 font-medium" onClick={() => { if (window.confirm(`¿Cerrar la cuenta de ${c.nombre}? Ya no saldrá en la lista.`)) guardar(`${base}/${id}`, "PATCH", { activo: false }, "Cuenta cerrada").then(onCerrar); }}>Cerrar esta cuenta</button>}
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-900 mb-2">Movimientos</p>
            {!data.movimientos.length ? <p className="text-sm text-slate-500">Todavía no hay movimientos.</p> : (
              <ul className="divide-y divide-slate-100">
                {data.movimientos.map((m) => (
                  <li key={m.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{m.tipo === "cargo" ? "Fiado" : `Abono${m.metodoPago && m.metodoPago !== "efectivo" ? ` (${m.metodoPago})` : ""}`}{m.nota ? ` · ${m.nota}` : ""}</p>
                      <p className="text-xs text-slate-500">{new Date(m.fecha).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}{m.usuario ? ` · ${m.usuario}` : ""}</p>
                    </div>
                    <span className={`font-semibold whitespace-nowrap ${m.tipo === "cargo" ? "text-slate-900" : "text-[#17804F]"}`}>{m.tipo === "cargo" ? "+" : "−"}{dinero(m.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Hoja>
  );
}
