import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2 } from "lucide-react";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Jerga → «Bot del chat de la página»: cuánto resuelve sin IA y qué no entendió.

type Datos = {
  dias: Array<{ dia: string; mensajes: number; conIa: number; sinEntender: number; notasDeVoz: number }>;
  frases: Array<{ id: number; texto: string; resueltoConIa: boolean; fecha: string; colmado: string | null }>;
};

export function BotChatPanel() {
  const { data, isLoading } = useQuery<Datos>({ queryKey: ["/api/admin/bot-chat"], queryFn: () => pedirJSON<Datos>("GET", "/api/admin/bot-chat") });
  const total = data?.dias.reduce((a, d) => ({ m: a.m + d.mensajes, ia: a.ia + d.conIa, no: a.no + d.sinEntender, voz: a.voz + d.notasDeVoz }), { m: 0, ia: 0, no: 0, voz: 0 });
  const sinIa = total && total.m ? Math.round(((total.m - total.ia - total.no) / total.m) * 100) : null;
  return (
    <Card className="bg-white border-0 shadow-sm" data-testid="panel-bot-chat">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Bot className="w-5 h-5 text-emerald-600" />Bot del chat de la página (últimos 14 días)</CardTitle>
        <p className="text-sm text-slate-500">El bot atiende por pasos sin IA. Solo cuando no entiende le pregunta a la IA de Cloudflare, y lo que la IA entiende se agrega a la jerga. Las frases de abajo sirven para agregar productos o jerga.</p>
      </CardHeader>
      <CardContent className="space-y-4">
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
                    <Badge className={f.resueltoConIa ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                      {f.resueltoConIa ? "La IA lo resolvió" : "No se entendió"}
                    </Badge>
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
