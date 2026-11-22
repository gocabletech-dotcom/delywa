import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Configuración → Lo que aprendió el bot: cuando corriges el nombre de un producto al confirmar o
// editar un pedido del chat («Una fria» → «Presidente grande»), el bot lo anota. Si la misma corrección
// se repite en otro pedido, la aprende y la próxima vez escribe el producto como tú lo pusiste.

type Correccion = { id: number; dicho: string; producto: string; veces: number; estado: "esperando" | "aprendida" | "descartada"; fecha: string };
type Datos = { correcciones: Correccion[]; vecesParaAprender: number };

const boton = "inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm font-semibold border disabled:opacity-50";

export function BotAprendido({ colmadoId }: { colmadoId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = `/api/colmados/${colmadoId}/bot-aprendido`;
  const { data, isLoading } = useQuery<Datos>({
    queryKey: ["bot-aprendido", colmadoId],
    queryFn: async () => { const r = await fetch(base, { credentials: "include" }); if (!r.ok) throw new Error((await r.json()).error); return r.json(); },
  });
  const [ocupado, setOcupado] = useState<number | null>(null);
  const accion = async (id: number, url: string, metodo: string, aviso: string) => {
    setOcupado(id);
    const r = await fetch(url, { method: metodo, credentials: "include" });
    const j = await r.json().catch(() => ({}));
    setOcupado(null);
    if (!r.ok) { toast({ title: "No se pudo", description: j.error, variant: "destructive" }); return; }
    qc.setQueryData(["bot-aprendido", colmadoId], (v: Datos | undefined) => (v ? { ...v, correcciones: j.correcciones } : v));
    toast({ title: aviso });
  };
  const visibles = (data?.correcciones ?? []).filter((c) => c.estado !== "descartada");
  const veces = data?.vecesParaAprender ?? 2;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 mb-6" data-testid="bot-aprendido">
      <h3 className="text-lg font-bold text-slate-900">Lo que aprendió el bot</h3>
      <p className="mt-1 text-[15px] text-slate-600">
        Cuando cambias el nombre de un producto al confirmar o editar un pedido del chat, el bot lo anota.
        Si haces la misma corrección {veces} veces, la aprende y la próxima vez lo escribe como tú. Si fue un cambio
        de un día (no había el producto), tócale «Olvidar».
      </p>
      <div className="mt-4">
        {isLoading ? <p className="text-sm text-slate-500">Cargando…</p> : !visibles.length ? (
          <p className="text-sm text-slate-500">Todavía no hay correcciones. Aparecen aquí cuando cambias un nombre en un pedido del chat.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibles.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-3" data-testid={`aprendido-${c.id}`}>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[15px] text-slate-900">El cliente dice <b>«{c.dicho}»</b> → <b>{c.producto}</b></p>
                  <p className="text-xs text-slate-500">
                    {c.estado === "aprendida" ? "✅ Ya lo aprendió" : `Visto ${c.veces} de ${veces} veces · todavía no lo usa`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.estado === "esperando" && (
                    <button type="button" disabled={ocupado === c.id} className={`${boton} border-[#17804F] text-[#17804F] hover:bg-[#E7F2EC]`}
                      onClick={() => accion(c.id, `${base}/${c.id}/ensenar`, "POST", "El bot ya lo aprendió")} data-testid={`btn-ensenar-ya-${c.id}`}>
                      {ocupado === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}Enseñar ya
                    </button>
                  )}
                  <button type="button" disabled={ocupado === c.id} className={`${boton} border-slate-300 text-red-700 hover:bg-red-50`}
                    onClick={() => accion(c.id, `${base}/${c.id}`, "DELETE", "Listo, el bot lo olvidó")} data-testid={`btn-olvidar-${c.id}`}>
                    <Trash2 className="w-4 h-4" />Olvidar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
