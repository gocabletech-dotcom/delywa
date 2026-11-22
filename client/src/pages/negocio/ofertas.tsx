import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Loader2 } from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// Ofertas (mejora 12): «hoy hay pollo a 95». Salen arriba del chat de tu página y en el saludo del bot,
// y si quieres, como aviso en el celular de los clientes que aceptaron. Gratis (no van por WhatsApp).

type Oferta = { id: number; texto: string; hasta: string; activa: boolean; vigente: boolean; aviso: string | null; avisados: number; creadoPor: string | null; fechaCreacion: string };
const DURACIONES = [{ h: 12, t: "Hoy" }, { h: 72, t: "3 días" }, { h: 168, t: "1 semana" }];

export default function OfertasPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAuthenticated, isLoading: cargandoSesion } = useAuth();
  useEffect(() => { if (!cargandoSesion && !isAuthenticated) window.location.href = "/login"; }, [cargandoSesion, isAuthenticated]);
  const { data: rol } = useQuery({ queryKey: ["user-role"], queryFn: async () => { const r = await fetch("/api/user/role"); return r.ok ? r.json() : null; }, enabled: isAuthenticated });
  const colmadoId = rol?.colmadoId as number | undefined;
  const base = `/api/colmados/${colmadoId}/ofertas`;
  const { data, isLoading, error } = useQuery<{ ofertas: Oferta[]; suscritos: number }>({
    queryKey: ["ofertas", colmadoId],
    queryFn: async () => { const r = await fetch(base); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; },
    enabled: !!colmadoId,
  });
  const [texto, setTexto] = useState("");
  const [horas, setHoras] = useState(12);
  const [avisar, setAvisar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (url: string, metodo: string, cuerpo?: unknown, aviso?: string) => {
    setOcupado(true);
    const r = await fetch(url, { method: metodo, credentials: "include", headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { toast({ title: "No se pudo", description: j.error, variant: "destructive" }); return false; }
    qc.setQueryData(["ofertas", colmadoId], j);
    if (aviso) toast({ title: aviso });
    return true;
  };
  const suscritos = data?.suscritos ?? 0;

  return (
    <NegocioLayout title="Ofertas" activeNav="ofertas">
      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {error ? <p className="text-red-700">{(error as Error).message}</p> : null}
          <form className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (await enviar(base, "POST", { texto, horas, avisar: avisar && suscritos > 0 }, avisar && suscritos ? `Oferta publicada. Le llega a ${suscritos} cliente${suscritos === 1 ? "" : "s"}.` : "Oferta publicada")) setTexto("");
          }}>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Flame className="w-5 h-5 text-orange-500" />Nueva oferta</h2>
            <p className="text-[15px] text-slate-600">Sale arriba del chat de tu página y en el saludo del bot mientras esté vigente.</p>
            <textarea className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px]" rows={2} maxLength={160} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Hoy pollo a RD$95 la libra 🍗" data-testid="texto-oferta" />
            <p className="text-xs text-slate-500">{texto.length} de 160 letras.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cuánto dura">
              {DURACIONES.map((d) => (
                <button key={d.h} type="button" role="radio" aria-checked={horas === d.h} onClick={() => setHoras(d.h)}
                  className={`min-h-[40px] px-4 rounded-xl border text-sm font-semibold ${horas === d.h ? "border-[#17804F] bg-[#E7F2EC] text-[#0F5C39]" : "border-slate-300 text-slate-700"}`}>{d.t}</button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-[15px] text-slate-700">
              <input type="checkbox" className="mt-1" checked={avisar && suscritos > 0} disabled={!suscritos} onChange={(e) => setAvisar(e.target.checked)} data-testid="avisar-oferta" />
              <span>{suscritos ? `Mandar aviso al celular de ${suscritos} cliente${suscritos === 1 ? "" : "s"} que aceptaron ofertas (uno por día).` : "Todavía ningún cliente aceptó avisos de ofertas. Les sale la opción en el chat después de su primer pedido."}</span>
            </label>
            <button type="submit" disabled={ocupado || texto.trim().length < 5} className="min-h-[48px] w-full rounded-xl bg-[#17804F] text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50" data-testid="publicar-oferta">
              {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Publicar oferta
            </button>
          </form>

          <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
            {isLoading ? <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div> : !data?.ofertas.length ? <p className="p-4 text-sm text-slate-500">Todavía no has publicado ofertas.</p> : data.ofertas.map((o) => (
              <div key={o.id} className="px-4 py-3 flex items-start gap-3" data-testid={`oferta-${o.id}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] ${o.vigente ? "text-slate-900 font-medium" : "text-slate-400 line-through"}`}>{o.texto}</p>
                  <p className="text-xs text-slate-500">
                    {o.vigente ? `Hasta ${new Date(o.hasta).toLocaleString("es-DO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Terminada"}
                    {o.aviso ? ` · ${o.aviso === "enviado" ? `aviso a ${o.avisados} cliente${o.avisados === 1 ? "" : "s"}` : "mandando avisos…"}` : ""}
                  </p>
                </div>
                {o.vigente && <button type="button" disabled={ocupado} className="text-sm text-red-700 font-semibold min-h-[36px]" onClick={() => enviar(`${base}/${o.id}`, "PATCH", {}, "Oferta quitada")}>Quitar</button>}
              </div>
            ))}
          </div>
        </div>
      </main>
    </NegocioLayout>
  );
}
