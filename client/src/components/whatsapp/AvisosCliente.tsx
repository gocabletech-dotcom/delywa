import { useEffect, useState } from "react";
import { activarPush, esIphoneSinInstalar, pushSoportado, suscripcionActual } from "@/lib/push";

// Chat del cliente: «¿Te aviso cuando tu pedido salga?» (y ofertas del colmado si quiere). Gratis.
// Solo sale si el navegador lo permite, todavía no aceptó, y no lo cerró en este aparato.

const CERRADO = "delywa-cliente-avisos-cerrado";

export function AvisosCliente({ sessionId, colmado }: { sessionId: string; colmado: string }) {
  const [ver, setVer] = useState(false);
  const [ofertas, setOfertas] = useState(true);
  const [estado, setEstado] = useState<"" | "ocupado" | "listo" | string>("");
  useEffect(() => {
    if (!pushSoportado() || esIphoneSinInstalar() || Notification.permission === "denied") return;
    try { if (localStorage.getItem(CERRADO)) return; } catch { /* */ }
    suscripcionActual().then((s) => setVer(!s)).catch(() => undefined);
  }, []);
  if (!ver) return null;
  if (estado === "listo") return (
    <div className="shrink-0 bg-[#E7F8EE] border-b border-[#C9EBD6] px-4 py-2 text-[13px] text-[#0B6B3A]" data-testid="avisos-cliente-listo">🔔 Listo, te avisamos aquí cuando tu pedido cambie.</div>
  );
  const cerrar = () => { try { localStorage.setItem(CERRADO, "1"); } catch { /* */ } setVer(false); };
  return (
    <div className="shrink-0 bg-white border-b border-[#E5E5EA] px-4 py-2.5 text-[13.5px] space-y-1.5" data-testid="avisos-cliente">
      <p className="text-[#111B21]">🔔 ¿Te aviso en el celular cuando tu pedido salga, aunque cierres el chat?</p>
      <label className="flex items-center gap-2 text-[12.5px] text-[#54656F]">
        <input type="checkbox" checked={ofertas} onChange={(e) => setOfertas(e.target.checked)} /> También las ofertas de {colmado}
      </label>
      {estado && estado !== "ocupado" && <p className="text-[12px] text-[#B42318]">{estado}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={estado === "ocupado"} className="h-9 px-4 rounded-full bg-primary text-white text-[13.5px] font-semibold disabled:opacity-60" data-testid="aceptar-avisos-cliente"
          onClick={async () => {
            setEstado("ocupado");
            try {
              const suscripcion = await activarPush();
              const r = await fetch(`/api/chat-colmado/sesion/${sessionId}/push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suscripcion, ofertas }) });
              if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo");
              setEstado("listo");
            } catch (e: any) { setEstado(e.message || "No se pudo activar"); }
          }}>Sí, avísame</button>
        <button type="button" className="h-9 px-3 rounded-full text-[13.5px] text-[#54656F]" onClick={cerrar}>Ahora no</button>
      </div>
    </div>
  );
}

export function OfertasChat({ ofertas }: { ofertas: Array<{ id: number; texto: string }> }) {
  if (!ofertas.length) return null;
  return (
    <div className="shrink-0 bg-[#FFF4E5] border-b border-[#FFD8A8] px-4 py-2 text-[13.5px] text-[#7A3E00]" data-testid="ofertas-chat">
      {ofertas.map((o) => <p key={o.id}>🔥 <b>Oferta:</b> {o.texto}</p>)}
    </div>
  );
}
