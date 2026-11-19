import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Configuración → Preguntas frecuentes: lo que el bot contesta de tu colmado cuando un cliente pregunta
// (¿venden gas?, ¿fían?, ¿hacen delivery a tal sector?). Valen para todas tus sucursales.

type Pregunta = { id: number; pregunta: string; respuesta: string };
type Datos = { preguntas: Pregunta[]; limites: { cantidad: number; pregunta: number; respuesta: number } };

const campo = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#17804F]/40";
const boton = "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold text-[15px] disabled:opacity-50";

export function PreguntasFrecuentes({ colmadoId }: { colmadoId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = `/api/colmados/${colmadoId}/preguntas-frecuentes`;
  const { data, isLoading } = useQuery<Datos>({
    queryKey: ["preguntas-frecuentes", colmadoId],
    queryFn: async () => { const r = await fetch(base, { credentials: "include" }); if (!r.ok) throw new Error((await r.json()).error); return r.json(); },
  });
  const [editando, setEditando] = useState<Pregunta | null>(null);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (url: string, metodo: string, cuerpo?: unknown, aviso?: string) => {
    setOcupado(true);
    const r = await fetch(url, { method: metodo, credentials: "include", headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { toast({ title: "No se pudo guardar", description: j.error, variant: "destructive" }); return false; }
    qc.setQueryData(["preguntas-frecuentes", colmadoId], (v: Datos | undefined) => (v ? { ...v, preguntas: j.preguntas } : v));
    if (aviso) toast({ title: aviso });
    return true;
  };
  const limpiar = () => { setEditando(null); setPregunta(""); setRespuesta(""); };
  const lim = data?.limites ?? { cantidad: 30, pregunta: 200, respuesta: 1500 };
  const lleno = (data?.preguntas.length ?? 0) >= lim.cantidad && !editando;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 mb-6" data-testid="preguntas-frecuentes">
      <h3 className="text-lg font-bold text-slate-900">Preguntas frecuentes</h3>
      <p className="mt-1 text-[15px] text-slate-600">Lo que el bot contesta de tu colmado cuando un cliente pregunta. Escribe la pregunta como la haría un cliente y la respuesta corta. Valen para todas tus sucursales.</p>

      <form className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={async (e) => {
        e.preventDefault();
        const ok = editando
          ? await enviar(`${base}/${editando.id}`, "PUT", { pregunta, respuesta }, "Pregunta actualizada")
          : await enviar(base, "POST", { pregunta, respuesta }, "Pregunta agregada");
        if (ok) limpiar();
      }}>
        <div className="space-y-1">
          <label htmlFor="pf-pregunta" className="block text-sm font-semibold text-slate-700">Pregunta</label>
          <input id="pf-pregunta" className={campo} value={pregunta} maxLength={lim.pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Venden gas?" disabled={lleno} data-testid="input-pf-pregunta" />
        </div>
        <div className="space-y-1">
          <label htmlFor="pf-respuesta" className="block text-sm font-semibold text-slate-700">Respuesta</label>
          <textarea id="pf-respuesta" rows={3} className={campo} value={respuesta} maxLength={lim.respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Sí, cambiamos tanques de 25 y 50 libras. El delivery del gas cuesta RD$100." disabled={lleno} data-testid="input-pf-respuesta" />
          <p className="text-xs text-slate-500">{respuesta.length} de {lim.respuesta} letras.</p>
        </div>
        {lleno && <p className="text-sm text-amber-800">Llegaste al máximo de {lim.cantidad} preguntas. Borra una para agregar otra.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={ocupado || !pregunta.trim() || !respuesta.trim()} className={`${boton} bg-[#17804F] text-white hover:bg-[#0F5C39]`} data-testid="button-pf-guardar">
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : editando ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editando ? "Guardar cambios" : "Agregar pregunta"}
          </button>
          {editando && <button type="button" onClick={limpiar} className={`${boton} border border-slate-300 text-slate-700`}><X className="w-4 h-4" />Cancelar</button>}
        </div>
      </form>

      <div className="mt-4">
        {isLoading ? <p className="text-slate-500 text-sm">Cargando…</p> : !data?.preguntas.length ? (
          <p className="text-sm text-slate-500">Todavía no tienes preguntas. Empieza por las que más te hacen tus clientes.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.preguntas.map((p) => (
              <li key={p.id} className="py-3 flex gap-3" data-testid={`pf-${p.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{p.pregunta}</p>
                  <p className="text-[15px] text-slate-600 whitespace-pre-line">{p.respuesta}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" aria-label={`Editar: ${p.pregunta}`} className="w-10 h-10 grid place-items-center rounded-lg border border-slate-200 hover:bg-slate-50"
                    onClick={() => { setEditando(p); setPregunta(p.pregunta); setRespuesta(p.respuesta); document.getElementById("pf-pregunta")?.focus(); }}><Pencil className="w-4 h-4" /></button>
                  <button type="button" aria-label={`Borrar: ${p.pregunta}`} className="w-10 h-10 grid place-items-center rounded-lg border border-slate-200 text-red-700 hover:bg-red-50"
                    onClick={() => { if (window.confirm(`¿Borrar la pregunta «${p.pregunta}»?`)) enviar(`${base}/${p.id}`, "DELETE", undefined, "Pregunta borrada"); }}><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
