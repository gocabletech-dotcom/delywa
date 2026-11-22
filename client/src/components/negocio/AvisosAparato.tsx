import { useEffect, useRef, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { activarPush, apagarPush, esIphoneSinInstalar, pushSoportado, sonarAviso, suscripcionActual } from "@/lib/push";

// Avisos de pedidos nuevos en este aparato (mejora 6): suenan aunque la pantalla esté apagada.
//  - AvisoActivar: franja arriba del panel la primera vez (se puede cerrar).
//  - AvisosAparato: en Configuración, para activar, probar o apagar.
//  - useSonidoPedidoNuevo: con el panel abierto, suena cuando entra un pedido por confirmar.

const CERRADO = "delywa-avisos-cerrado";

async function guardar(colmadoId: number) {
  const suscripcion = await activarPush();
  const r = await fetch("/api/push/negocio", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colmadoId, suscripcion }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo activar");
}

export function AvisoActivar({ colmadoId }: { colmadoId?: number }) {
  const { toast } = useToast();
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    if (!colmadoId || !pushSoportado() || Notification.permission === "denied") return;
    try { if (localStorage.getItem(CERRADO)) return; } catch { /* */ }
    suscripcionActual().then((s) => setVer(!s)).catch(() => undefined);
  }, [colmadoId]);
  if (!ver || !colmadoId) return null;
  const cerrar = () => { try { localStorage.setItem(CERRADO, "1"); } catch { /* */ } setVer(false); };
  return (
    <div className="mx-3 sm:mx-6 mt-3 rounded-2xl bg-[#E7F2EC] border border-[#17804F]/30 px-4 py-3 flex items-center gap-3" data-testid="aviso-activar-push">
      <BellRing className="w-6 h-6 text-[#0F5C39] shrink-0" />
      <p className="flex-1 text-sm text-[#0F5C39]"><b>Que te suene cada pedido nuevo</b>, aunque tengas el celular bloqueado.</p>
      <button type="button" disabled={ocupado} className="min-h-[40px] px-3 rounded-xl bg-[#17804F] text-white text-sm font-semibold shrink-0"
        onClick={async () => { setOcupado(true); try { await guardar(colmadoId); toast({ title: "Avisos activados en este aparato 🔔" }); setVer(false); } catch (e: any) { toast({ title: "No se activaron", description: e.message, variant: "destructive" }); } setOcupado(false); }}
        data-testid="activar-push">{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activar"}</button>
      <button type="button" aria-label="Ahora no" className="w-9 h-9 grid place-items-center text-[#0F5C39]" onClick={cerrar}><X className="w-4 h-4" /></button>
    </div>
  );
}

export function AvisosAparato({ colmadoId }: { colmadoId: number }) {
  const { toast } = useToast();
  const [activo, setActivo] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { suscripcionActual().then((s) => setActivo(Boolean(s))).catch(() => setActivo(false)); }, []);
  const hacer = async (f: () => Promise<void>, aviso: string) => {
    setOcupado(true);
    try { await f(); toast({ title: aviso }); } catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); }
    setOcupado(false);
    setActivo(Boolean(await suscripcionActual().catch(() => null)));
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 mb-6" data-testid="avisos-aparato">
      <h3 className="text-lg font-bold text-slate-900">Avisos en este aparato</h3>
      <p className="mt-1 text-[15px] text-slate-600">Te suena y aparece en la pantalla cuando entra un pedido, llega un comprobante o un cliente te escribe, aunque el celular esté bloqueado. Es gratis. Actívalo en cada celular, tablet o computadora donde atiendas.</p>
      {!pushSoportado() ? (
        <p className="mt-3 text-sm text-amber-800">Este navegador no permite avisos. Usa Chrome en Android o en la computadora.</p>
      ) : esIphoneSinInstalar() ? (
        <p className="mt-3 text-sm text-amber-800">En iPhone: toca el botón Compartir de Safari → «Agregar a pantalla de inicio», abre Delywa desde ese ícono y vuelve aquí.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {activo ? (
            <>
              <span className="inline-flex items-center gap-2 min-h-[44px] px-3 text-[#0F5C39] font-semibold">🔔 Activos en este aparato</span>
              <button type="button" disabled={ocupado} className="min-h-[44px] px-4 rounded-xl border border-slate-300 font-semibold" data-testid="probar-push"
                onClick={() => hacer(async () => { const r = await fetch("/api/push/prueba", { method: "POST", credentials: "include" }); if (!r.ok) throw new Error((await r.json()).error); }, "Te mandamos un aviso de prueba")}>Probar</button>
              <button type="button" disabled={ocupado} className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-red-700 font-semibold" onClick={() => hacer(apagarPush, "Avisos apagados en este aparato")}>Apagar</button>
            </>
          ) : (
            <button type="button" disabled={ocupado} className="min-h-[44px] px-4 rounded-xl bg-[#17804F] text-white font-semibold inline-flex items-center gap-2" data-testid="activar-push-config"
              onClick={() => hacer(() => guardar(colmadoId), "Avisos activados en este aparato 🔔")}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}Activar avisos</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Con el panel abierto: suena cuando aumentan los pedidos por confirmar. */
export function useSonidoPedidoNuevo(porConfirmar: number | undefined) {
  const antes = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (porConfirmar === undefined) return;
    if (antes.current !== undefined && porConfirmar > antes.current) sonarAviso();
    antes.current = porConfirmar;
  }, [porConfirmar]);
}
