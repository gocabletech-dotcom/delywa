import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";

type Sesion = { isAuthenticated: boolean; correoActivo?: boolean; user?: { email: string | null; emailVerificado?: boolean } };

/** Aviso para quien todavía no confirmó su correo: manda un código de 6 números y lo revisa. */
export default function AvisoConfirmarCorreo() {
  const qc = useQueryClient();
  const { data } = useQuery<Sesion>({
    queryKey: ["sesion-correo"],
    queryFn: async () => (await fetch("/api/auth/session", { credentials: "include" })).json(),
    staleTime: 5 * 60 * 1000,
  });
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data?.isAuthenticated || !data.correoActivo || !data.user?.email || data.user.emailVerificado) return null;

  const pedir = async () => {
    setOcupado(true); setError(null);
    try {
      const r = await fetch("/api/auth/correo/codigo", { method: "POST", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setError(j.error || "No se pudo mandar el código.");
      else if (j.yaConfirmado) qc.invalidateQueries({ queryKey: ["sesion-correo"] });
      else { setEnviado(true); setCodigo(""); }
    } catch { setError("No hay conexión. Intenta de nuevo."); }
    setOcupado(false);
  };
  const confirmar = async () => {
    setOcupado(true); setError(null);
    try {
      const r = await fetch("/api/auth/correo/confirmar", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "No se pudo confirmar."); if (j.codigoVencido) setEnviado(false); }
      else qc.invalidateQueries({ queryKey: ["sesion-correo"] });
    } catch { setError("No hay conexión. Intenta de nuevo."); }
    setOcupado(false);
  };

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" data-testid="aviso-confirmar-correo">
      <div className="flex flex-wrap items-center gap-3">
        <MailCheck className="w-5 h-5 shrink-0 text-amber-700" aria-hidden="true" />
        <p className="flex-1 basis-56 min-w-0">
          {enviado
            ? <>Te mandamos un código de 6 números a <b className="break-all">{data.user.email}</b>. Escríbelo aquí. Vence en 20 minutos.</>
            : <>Confirma que el correo <b className="break-all">{data.user.email}</b> es tuyo. Así podrás recuperar tu contraseña y recibir los avisos.</>}
        </p>
        {enviado ? (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} aria-label="Código de 6 números"
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-10 w-32 rounded-xl border border-amber-300 bg-white px-3 text-center text-lg tracking-[0.3em] font-semibold"
              data-testid="input-codigo-correo"
            />
            <button type="button" disabled={ocupado || codigo.length !== 6} onClick={confirmar} className="h-10 px-4 rounded-xl bg-[#17804F] text-white font-semibold disabled:opacity-50" data-testid="btn-confirmar-correo">Confirmar</button>
            <button type="button" disabled={ocupado} onClick={pedir} className="h-10 px-2 text-amber-900 underline" data-testid="btn-otro-codigo">Enviar otro código</button>
          </div>
        ) : (
          <button type="button" disabled={ocupado} onClick={pedir} className="h-10 px-4 rounded-xl bg-[#17804F] text-white font-semibold disabled:opacity-50 w-full sm:w-auto" data-testid="btn-enviar-codigo-correo">
            {ocupado ? "Enviando…" : "Enviarme el código"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
    </div>
  );
}
