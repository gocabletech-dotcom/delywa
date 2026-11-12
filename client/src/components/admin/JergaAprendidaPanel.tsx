import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Jerga → «Aprendida de los colmados».
// Palabras que el bot aprendió en cada colmado. Las que usan suficientes colmados ya están
// en el diccionario del país; las demás esperan o se aprueban/descartan aquí.

type Palabra = {
  paisId: number; tipoNegocio: string; jerga: string; productoIdentificado: string;
  colmados: number; veces: number; ultimoUso: number;
  paisNombre: string | null; paisBandera: string | null;
  estado: "en_pais" | "descartada" | "otro_producto" | "pendiente";
  productoEnPais: string | null;
};
type Respuesta = { umbral: number; palabras: Palabra[] };

const ESTADOS: Record<Palabra["estado"], { texto: string; clase: string }> = {
  en_pais: { texto: "En el diccionario del país", clase: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  pendiente: { texto: "Esperando más colmados", clase: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  otro_producto: { texto: "En el país significa otra cosa", clase: "bg-slate-100 text-slate-700 hover:bg-slate-100" },
  descartada: { texto: "Descartada", clase: "bg-red-100 text-red-800 hover:bg-red-100" },
};

export function JergaAprendidaPanel({ paisId }: { paisId: number | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/admin/jerga-aprendida${paisId ? `?paisId=${paisId}` : ""}`;
  const { data, isLoading } = useQuery<Respuesta>({ queryKey: [url], queryFn: () => pedirJSON<Respuesta>("GET", url) });
  const [umbral, setUmbral] = useState("");
  useEffect(() => { if (data) setUmbral(String(data.umbral)); }, [data?.umbral]);

  const refrescar = () => {
    queryClient.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).toLowerCase().includes("jerga") });
  };
  const decidir = useMutation({
    mutationFn: ({ p, accion }: { p: Palabra; accion: "aprobar" | "descartar" }) =>
      pedirJSON("POST", `/api/admin/jerga-aprendida/${accion}`, { paisId: p.paisId, tipoNegocio: p.tipoNegocio, jerga: p.jerga, productoIdentificado: p.productoIdentificado }),
    onSuccess: (_r, { accion }) => { refrescar(); toast({ title: accion === "aprobar" ? "Agregada al diccionario del país" : "Descartada" }); },
    onError: (e: Error) => toast({ title: "No se pudo", description: e.message, variant: "destructive" }),
  });
  const guardarUmbral = useMutation({
    mutationFn: () => pedirJSON("PUT", "/api/admin/jerga-aprendida/umbral", { umbral: Number(umbral) }),
    onSuccess: () => { refrescar(); toast({ title: "Guardado" }); },
    onError: (e: Error) => toast({ title: "No se guardó", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="bg-white border-0 shadow-sm" data-testid="panel-jerga-aprendida">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="w-5 h-5 text-emerald-600" />Aprendida de los colmados</CardTitle>
        <p className="text-sm text-slate-500">
          Cada vez que un cliente usa una palabra nueva y el bot entiende qué producto es, se anota aquí. Cuando la misma palabra para el mismo producto aparece en el número de colmados que indiques, entra sola al diccionario del país y la usan todos los colmados.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-sm font-medium" htmlFor="umbral-jerga">Colmados distintos para que entre sola</label>
            <Input id="umbral-jerga" type="number" min={1} max={50} value={umbral} onChange={(e) => setUmbral(e.target.value)} className="w-28" data-testid="input-umbral-jerga" />
          </div>
          <Button variant="outline" onClick={() => guardarUmbral.mutate()} disabled={guardarUmbral.isPending}>Guardar</Button>
          <p className="text-xs text-slate-400 w-full">Con 1 entra al primer uso; con 2 o más se evita que una palabra rara de un solo cliente se le enseñe a todo el país.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : !data?.palabras.length ? (
          <p className="text-sm text-slate-500">Todavía no hay palabras aprendidas. Aparecerán cuando los clientes escriban a los bots de WhatsApp.</p>
        ) : (
          <div className="divide-y">
            {data.palabras.map((p) => (
              <div key={`${p.paisId}-${p.tipoNegocio}-${p.jerga}-${p.productoIdentificado}`} className="py-3 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-medium">«{p.jerga}» = {p.productoIdentificado}</p>
                  <p className="text-xs text-slate-500">
                    {p.paisBandera} {p.paisNombre} · {p.tipoNegocio} · {p.colmados} colmado{p.colmados === 1 ? "" : "s"} · {p.veces} uso{p.veces === 1 ? "" : "s"}
                    {p.estado === "otro_producto" && p.productoEnPais ? ` · en el país: ${p.productoEnPais}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={ESTADOS[p.estado].clase}>{ESTADOS[p.estado].texto}</Badge>
                  {p.estado !== "en_pais" && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={decidir.isPending}
                      onClick={() => (p.estado !== "otro_producto" || window.confirm(`En el país «${p.jerga}» hoy significa «${p.productoEnPais}». ¿Cambiarlo a «${p.productoIdentificado}» para todos los colmados?`)) && decidir.mutate({ p, accion: "aprobar" })}>
                      Aprobar
                    </Button>
                  )}
                  {(p.estado === "en_pais" || p.estado === "pendiente") && (
                    <Button size="sm" variant="outline" className="text-red-600" disabled={decidir.isPending}
                      onClick={() => window.confirm(`¿Descartar «${p.jerga}» = ${p.productoIdentificado}? No se usará en el país y no volverá a entrar sola.`) && decidir.mutate({ p, accion: "descartar" })}>
                      Descartar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
