import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen, ChevronRight, PackageX } from "lucide-react";

// Inicio: lo que se está acabando o se agotó (inventario) y cuánto te deben (fiado).

type Alertas = { agotados: Array<{ id: number; nombre: string }>; bajos: Array<{ id: number; nombre: string; inventario: number }> };

export function AvisosInicio({ colmadoId }: { colmadoId: number }) {
  const { data: alertas } = useQuery<Alertas>({
    queryKey: ["inventario-alertas", colmadoId],
    queryFn: async () => { const r = await fetch(`/api/colmados/${colmadoId}/inventario/alertas`); return r.ok ? r.json() : { agotados: [], bajos: [] }; },
    refetchInterval: 120_000,
  });
  const { data: fiado } = useQuery<{ totalFiado: number; conDeuda: number }>({
    queryKey: ["fiado", colmadoId, "resumen"],
    queryFn: async () => { const r = await fetch(`/api/colmados/${colmadoId}/fiado`); return r.ok ? r.json() : { totalFiado: 0, conDeuda: 0 }; },
  });
  const nInv = (alertas?.agotados.length ?? 0) + (alertas?.bajos.length ?? 0);
  if (!nInv && !fiado?.conDeuda) return null;
  const nombres = [...(alertas?.agotados ?? []).map((a) => `${a.nombre} (agotado)`), ...(alertas?.bajos ?? []).map((b) => `${b.nombre} (quedan ${b.inventario})`)];
  return (
    <div className="grid sm:grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
      {nInv > 0 && (
        <Link href="/negocio/menu">
          <div className="rounded-2xl bg-white border border-red-200 px-4 py-3 flex items-center gap-3 cursor-pointer h-full" data-testid="aviso-inventario">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 grid place-items-center shrink-0"><PackageX size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 leading-tight">{nInv} producto{nInv === 1 ? "" : "s"} por reponer</p>
              <p className="text-xs sm:text-sm text-slate-600 truncate">{nombres.slice(0, 3).join(", ")}{nombres.length > 3 ? "…" : ""}</p>
            </div>
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          </div>
        </Link>
      )}
      {!!fiado?.conDeuda && (
        <Link href="/negocio/fiado">
          <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 flex items-center gap-3 cursor-pointer h-full" data-testid="aviso-fiado">
            <div className="w-10 h-10 rounded-xl bg-[#E7F2EC] text-[#0F5C39] grid place-items-center shrink-0"><BookOpen size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 leading-tight">Te deben RD${fiado.totalFiado.toLocaleString("es-DO")}</p>
              <p className="text-xs sm:text-sm text-slate-600">{fiado.conDeuda} cliente{fiado.conDeuda === 1 ? "" : "s"} con fiado</p>
            </div>
            <ChevronRight size={16} className="text-slate-400 shrink-0" />
          </div>
        </Link>
      )}
    </div>
  );
}
