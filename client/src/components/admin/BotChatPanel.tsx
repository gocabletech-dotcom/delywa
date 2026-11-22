import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Bot, Cpu, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Jerga → «Bot del chat de la página»: cuánto resuelve sin IA y qué no entendió.

type Datos = {
  dias: Array<{ dia: string; mensajes: number; conIa: number; sinEntender: number; notasDeVoz: number }>;
  frases: Array<{ id: number; texto: string; resueltoConIa: boolean; fecha: string; colmado: string | null }>;
  ia?: { dia: string; neuronas: number; llamadasTexto: number; notasDeVoz: number; sinCupo: number; cupo: number; gratis: number };
};

export function BotChatPanel({ onEnsenar }: { onEnsenar?: (frase: string) => void }) {
  const { data, isLoading } = useQuery<Datos>({ queryKey: ["/api/admin/bot-chat"], queryFn: () => pedirJSON<Datos>("GET", "/api/admin/bot-chat") });
  const total = data?.dias.reduce((a, d) => ({ m: a.m + d.mensajes, ia: a.ia + d.conIa, no: a.no + d.sinEntender, voz: a.voz + d.notasDeVoz }), { m: 0, ia: 0, no: 0, voz: 0 });
  const sinIa = total && total.m ? Math.round(((total.m - total.ia - total.no) / total.m) * 100) : null;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cupo, setCupo] = useState<string>("");
  const guardarCupo = async () => {
    try {
      await pedirJSON("PUT", "/api/admin/bot-chat/cupo", { cupo: Number(cupo) });
      toast({ title: "Cupo guardado" });
      setCupo("");
      qc.invalidateQueries({ queryKey: ["/api/admin/bot-chat"] });
    } catch (e: any) { toast({ title: "No se pudo guardar", description: e?.message, variant: "destructive" }); }
  };
  const ia = data?.ia;
  return (
    <Card className="bg-white border-0 shadow-sm" data-testid="panel-bot-chat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Bot className="w-5 h-5 text-emerald-600" />Bot del chat de la página (últimos 14 días)</CardTitle>
        <p className="text-sm text-slate-500">El bot atiende por pasos sin IA. Solo cuando no entiende le pregunta a la IA de Cloudflare, y lo que la IA entiende se agrega a la jerga. Toca «Enseñar» en una frase para agregarla arriba como palabra nueva.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {ia && (
          <div className="rounded-lg border border-slate-200 p-3 space-y-2" data-testid="cupo-ia">
            <p className="flex items-center gap-2 font-semibold text-slate-800"><Cpu className="w-4 h-4 text-emerald-600" />IA de Cloudflare hoy (gratis hasta {ia.gratis.toLocaleString("es-DO")} neuronas al día)</p>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, (ia.neuronas / Math.max(1, ia.cupo)) * 100)}%` }} /></div>
            <p className="text-sm text-slate-600">
              {ia.neuronas.toLocaleString("es-DO")} de {ia.cupo.toLocaleString("es-DO")} neuronas · {ia.llamadasTexto} mensajes con IA · {ia.notasDeVoz} notas de voz
              {ia.sinCupo > 0 && <> · <span className="text-amber-700">{ia.sinCupo} veces sin cupo (le llegó al colmado)</span></>}
            </p>
            <p className="text-xs text-slate-500">El bot se detiene antes del cupo para que nunca cueste: el texto usa hasta el 80 % y el resto queda para las notas de voz. Se reinicia a las 8:00 p. m. (hora de RD).</p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="number" min={0} max={ia.gratis} placeholder={String(ia.cupo)} value={cupo} onChange={(e) => setCupo(e.target.value)} className="h-9 w-32 rounded-md border border-slate-300 px-2 text-sm" aria-label="Cupo diario de neuronas" data-testid="input-cupo-ia" />
              <Button size="sm" variant="outline" disabled={!cupo} onClick={guardarCupo} data-testid="btn-guardar-cupo">Cambiar cupo</Button>
            </div>
          </div>
        )}
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> : !total?.m ? <p className="text-sm text-slate-500">Todavía no hay conversaciones.</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-700">{sinIa}%</p><p className="text-xs text-slate-500">resuelto sin IA</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold">{total.m}</p><p className="text-xs text-slate-500">mensajes</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold">{total.ia}</p><p className="text-xs text-slate-500">usaron IA</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-2xl font-bold">{total.voz}</p><p className="text-xs text-slate-500">notas de voz</p></div>
            </div>
            {data!.frases.length > 0 && (
              <div className="divide-y text-sm">
                {data!.frases.map((f) => (
                  <div key={f.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span>«{f.texto}» <span className="text-xs text-slate-400">· {f.colmado ?? "—"}</span></span>
                    <span className="flex items-center gap-2">
                    {onEnsenar && <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onEnsenar(f.texto)} data-testid={`btn-ensenar-${f.id}`}><GraduationCap className="w-3.5 h-3.5 mr-1" />Enseñar</Button>}
                    <Badge className={f.resueltoConIa ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                      {f.resueltoConIa ? "La IA lo resolvió" : "No se entendió"}
                    </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
