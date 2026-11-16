import { useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// "Mi contraseña": cada usuario cambia la suya (pide la actual) y puede cerrar su sesión en los demás equipos.

const campo = "w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#17804F]/40";

export function CambiarClave({ className, children }: { className?: string; children?: React.ReactNode }) {
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const cerrar = () => { setAbierto(false); setActual(""); setNueva(""); setRepetida(""); setError(""); };

  const pedir = async (url: string, cuerpo?: unknown) => {
    const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "No se pudo completar.");
    return j;
  };

  const cambiar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (nueva !== repetida) return setError("La contraseña nueva y su repetición no coinciden.");
    setOcupado(true);
    try {
      await pedir("/api/auth/password", { actual, nueva });
      toast({ title: "Contraseña cambiada", description: "Se cerró tu sesión en los demás equipos." });
      cerrar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cambiar."); }
    setOcupado(false);
  };

  const cerrarOtras = async () => {
    setOcupado(true);
    try { await pedir("/api/auth/sesiones/cerrar-otras"); toast({ title: "Listo", description: "Tu sesión se cerró en los demás equipos." }); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo."); }
    setOcupado(false);
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={className} data-testid="button-mi-clave">
        {children ?? (<><KeyRound size={19} /> Mi contraseña</>)}
      </button>
      {abierto && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-mi-clave">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-auto text-slate-900">
            <div className="flex items-center justify-between mb-3">
              <h2 id="titulo-mi-clave" className="text-lg font-bold">Mi contraseña</h2>
              <button type="button" onClick={cerrar} className="w-10 h-10 grid place-items-center rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <form onSubmit={cambiar} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="clave-actual" className="block text-sm font-semibold text-slate-700">Contraseña actual</label>
                <input id="clave-actual" type="password" autoComplete="current-password" className={campo} value={actual} onChange={(e) => setActual(e.target.value)} required data-testid="input-clave-actual" />
              </div>
              <div className="space-y-1">
                <label htmlFor="clave-nueva" className="block text-sm font-semibold text-slate-700">Contraseña nueva</label>
                <input id="clave-nueva" type="password" autoComplete="new-password" className={campo} value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={10} data-testid="input-clave-nueva" />
                <p className="text-xs text-slate-500">Mínimo 10 caracteres. No uses una que ya tengas en otro sitio.</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="clave-repetida" className="block text-sm font-semibold text-slate-700">Repite la contraseña nueva</label>
                <input id="clave-repetida" type="password" autoComplete="new-password" className={campo} value={repetida} onChange={(e) => setRepetida(e.target.value)} required data-testid="input-clave-repetida" />
              </div>
              {error && <p className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3" role="alert" data-testid="error-mi-clave">{error}</p>}
              <button type="submit" disabled={ocupado} className="w-full min-h-[46px] rounded-xl bg-[#17804F] text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2" data-testid="button-guardar-clave">
                {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Cambiar contraseña
              </button>
            </form>
            <div className="mt-5 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">¿Dejaste tu sesión abierta en otro teléfono o computadora?</p>
              <button type="button" disabled={ocupado} onClick={cerrarOtras} className="mt-2 w-full min-h-[44px] rounded-xl border border-slate-300 text-slate-800 font-semibold disabled:opacity-50" data-testid="button-cerrar-otras">
                Cerrar sesión en los demás equipos
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
