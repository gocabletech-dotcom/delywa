import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MessageCircle, Plus, Trash2, GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Plataforma → Asistente de la página: qué pregunta la gente en el chat de delywa.com,
// qué no supo contestar y las respuestas que usted le enseña.

type Aprendida = { id: number; pregunta: string; respuesta: string; activo: boolean; usos: number };
type Datos = {
  resumen: { conversaciones: number; mensajes: number; soporte: number; convirtio: number };
  temas: Array<{ tema: string; titulo: string; n: number }>;
  sinRespuesta: Array<{ id: number; texto: string; creado: string; conv: number }>;
  aprendidas: Aprendida[];
  conversaciones: Array<{ id: number; mensajes: number; soporte: boolean; convirtio: boolean; creado: string; primera: string | null }>;
  soporte: string;
};
const fecha = (d: string) => new Date(d).toLocaleString("es-DO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function AsistentePaginaSection() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Datos>({ queryKey: ["/api/admin/asistente"] });
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [verConv, setVerConv] = useState<number | null>(null);
  const recargar = () => qc.invalidateQueries({ queryKey: ["/api/admin/asistente"] });

  const crear = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/asistente/respuestas", { pregunta, respuesta })).json(),
    onSuccess: () => { setPregunta(""); setRespuesta(""); recargar(); toast({ title: "Respuesta guardada", description: "El asistente ya la usa." }); },
    onError: (e: Error) => toast({ title: "No se guardó", description: e.message, variant: "destructive" }),
  });
  const cambiar = useMutation({
    mutationFn: async (v: { id: number; activo: boolean }) => (await apiRequest("PUT", `/api/admin/asistente/respuestas/${v.id}`, { activo: v.activo })).json(),
    onSuccess: recargar,
  });
  const borrar = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/admin/asistente/respuestas/${id}`)).json(),
    onSuccess: () => { recargar(); toast({ title: "Respuesta borrada" }); },
  });

  if (isLoading || !data) return <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>;
  const r = data.resumen;

  return (
    <div className="space-y-6" data-testid="section-asistente-pagina">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><MessageCircle className="w-6 h-6 text-emerald-600" />Asistente de la página</h2>
        <p className="text-slate-600 mt-1">El chat de delywa.com contesta solo, sin IA. Aquí ve lo que pregunta la gente, lo que no supo contestar y le enseña respuestas nuevas. Cuando alguien pide que le escriban, llega un correo a {data.soporte}.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["Conversaciones", r.conversaciones], ["Mensajes", r.mensajes], ["Pidieron soporte", r.soporte], ["Tocaron «Crear mi negocio»", r.convirtio]].map(([t, n]) => (
          <Card key={t as string}><CardContent className="p-4"><div className="text-3xl font-bold text-slate-800">{n}</div><div className="text-sm text-slate-500">{t} · 7 días</div></CardContent></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Lo que más preguntan · 30 días</CardTitle></CardHeader>
          <CardContent>
            {data.temas.length === 0 ? <p className="text-slate-500">Todavía nadie ha usado el chat.</p> : (
              <div className="space-y-2">
                {data.temas.map((t) => {
                  const max = data.temas[0].n || 1;
                  return (
                    <div key={t.tema} className="flex items-center gap-3">
                      <div className="w-44 text-sm text-slate-700 truncate">{t.titulo}</div>
                      <div className="flex-1 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${(t.n / max) * 100}%` }} /></div>
                      <div className="w-8 text-right text-sm font-semibold text-slate-700">{t.n}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">No supo contestar · enséñele la respuesta</CardTitle></CardHeader>
          <CardContent>
            {data.sinRespuesta.length === 0 ? <p className="text-slate-500">No hay preguntas sin respuesta. 🎉</p> : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {data.sinRespuesta.map((s) => (
                  <div key={s.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5" data-testid={`sin-respuesta-${s.id}`}>
                    <div className="flex-1 min-w-0"><div className="text-slate-800">{s.texto}</div><div className="text-xs text-slate-500">{fecha(s.creado)}</div></div>
                    <Button size="sm" variant="outline" onClick={() => { setPregunta(s.texto); document.getElementById("form-ensenar")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><GraduationCap className="w-4 h-4 mr-1" />Enseñar</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="form-ensenar">
        <CardHeader><CardTitle className="text-lg">Respuestas enseñadas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">Escriba la pregunta como la haría la gente y la respuesta exacta. Van antes que lo que el asistente ya sabe. Use **así** para poner negrita.</p>
          <div className="grid gap-2">
            <Input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="Pregunta · ej.: ¿Sirve para ferreterías?" maxLength={300} data-testid="input-ensenar-pregunta" />
            <Textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} placeholder="Respuesta" rows={3} maxLength={2000} data-testid="input-ensenar-respuesta" />
            <div><Button onClick={() => crear.mutate()} disabled={!pregunta.trim() || !respuesta.trim() || crear.isPending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-ensenar-guardar"><Plus className="w-4 h-4 mr-1" />Guardar respuesta</Button></div>
          </div>
          {data.aprendidas.length > 0 && (
            <div className="divide-y divide-slate-100 border rounded-lg">
              {data.aprendidas.map((a) => (
                <div key={a.id} className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{a.pregunta}</div>
                    <div className="text-sm text-slate-600 whitespace-pre-line">{a.respuesta}</div>
                    <div className="text-xs text-slate-500 mt-1">Usada {a.usos} {a.usos === 1 ? "vez" : "veces"}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600"><Switch checked={a.activo} onCheckedChange={(v) => cambiar.mutate({ id: a.id, activo: v })} />Activa</label>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("¿Borrar esta respuesta?")) borrar.mutate(a.id); }} aria-label="Borrar"><Trash2 className="w-4 h-4 text-red-600" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Conversaciones recientes</CardTitle></CardHeader>
        <CardContent>
          {data.conversaciones.length === 0 ? <p className="text-slate-500">Todavía no hay conversaciones.</p> : (
            <div className="divide-y divide-slate-100">
              {data.conversaciones.map((c) => (
                <button key={c.id} onClick={() => setVerConv(c.id)} className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-slate-50 px-2 rounded" data-testid={`conv-${c.id}`}>
                  <div className="flex-1 min-w-0"><div className="truncate text-slate-800">{c.primera || "—"}</div><div className="text-xs text-slate-500">#{c.id} · {fecha(c.creado)} · {c.mensajes} mensajes</div></div>
                  {c.soporte && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pidió soporte</Badge>}
                  {c.convirtio && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Crear negocio</Badge>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={verConv !== null} onOpenChange={(v) => !v && setVerConv(null)}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Conversación #{verConv}</DialogTitle></DialogHeader>{verConv !== null && <VerConversacion id={verConv} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function VerConversacion({ id }: { id: number }) {
  const { data, isLoading } = useQuery<Array<{ rol: string; texto: string; tema: string | null }>>({ queryKey: [`/api/admin/asistente/conversacion/${id}`] });
  if (isLoading || !data) return <Loader2 className="w-5 h-5 animate-spin" />;
  return (
    <div className="max-h-[60vh] overflow-y-auto space-y-2">
      {data.map((m, i) => (
        <div key={i} className={m.rol === "persona" ? "flex justify-end" : "flex"}>
          <div className={m.rol === "persona" ? "max-w-[85%] rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm" : "max-w-[85%] rounded-xl bg-slate-100 px-3 py-2 text-sm whitespace-pre-line"}>
            {m.texto.replace(/\*\*/g, "")}
            {m.rol === "persona" && m.tema === null && <div className="text-[11px] text-emerald-100 mt-0.5">No supo contestar</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
