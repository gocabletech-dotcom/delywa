import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen, Check, Loader2, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Jerga, versión sencilla: una sola lista de «el cliente dice → es este producto».
// Lo que se agrega aquí lo usa el bot de todos los colmados del país en el siguiente minuto.

type Palabra = { id: number; tipoNegocio: string; jerga: string; productoIdentificado: string; paisId: number | null; activo: boolean; origen?: string };
type Pais = { id: number; codigo: string; nombre: string; bandera: string | null };
type Tipo = { slug: string; nombre: string; activo: boolean };

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function JergaSimple({ paises, tipos, paisId, onPais, palabraInicial, onGenerarIA, generando }: {
  paises: Pais[];
  tipos: Tipo[];
  paisId: number | null;
  onPais: (id: number | null) => void;
  /** Frase que el bot no entendió y que se quiere enseñar. */
  palabraInicial?: string | null;
  onGenerarIA?: (tipo: string) => void;
  generando?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState("colmado");
  const [palabras, setPalabras] = useState("");
  const [producto, setProducto] = useState("");
  const [buscar, setBuscar] = useState("");
  const [editando, setEditando] = useState<{ id: number; jerga: string; producto: string } | null>(null);
  const [borrando, setBorrando] = useState<number | null>(null);
  const cajaPalabra = useRef<HTMLInputElement>(null);
  const cajaProducto = useRef<HTMLInputElement>(null);

  // Por defecto, República Dominicana.
  const elegido = useRef(false);
  useEffect(() => {
    if (elegido.current || paisId !== null || !paises.length) return;
    elegido.current = true;
    const rd = paises.find((p) => p.codigo === "DO");
    if (rd) onPais(rd.id);
  }, [paises, paisId, onPais]);

  useEffect(() => {
    if (!palabraInicial) return;
    setPalabras(palabraInicial);
    cajaProducto.current?.focus();
    cajaProducto.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [palabraInicial]);

  const { data, isLoading } = useQuery<Palabra[]>({ queryKey: ["plantillas-jerga"], queryFn: () => pedirJSON<Palabra[]>("GET", "/api/admin/plantillas-jerga") });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["plantillas-jerga"] });

  const lista = useMemo(() => {
    const q = sinTildes(buscar.trim());
    return (data ?? [])
      .filter((j) => j.tipoNegocio === tipo && j.activo !== false && (paisId === null || j.paisId === paisId || j.paisId === null))
      .filter((j) => !q || sinTildes(j.jerga).includes(q) || sinTildes(j.productoIdentificado).includes(q))
      .sort((a, b) => a.jerga.localeCompare(b.jerga, "es"));
  }, [data, tipo, paisId, buscar]);

  const productosConocidos = useMemo(() => [...new Set((data ?? []).filter((j) => j.tipoNegocio === tipo).map((j) => j.productoIdentificado))].sort((a, b) => a.localeCompare(b, "es")), [data, tipo]);

  const agregar = useMutation({
    mutationFn: () => pedirJSON<{ nuevas: number; corregidas: number }>("POST", "/api/admin/jerga-rapida", { palabras, producto, paisId, tipoNegocio: tipo }),
    onSuccess: (r) => {
      toast({ title: "Guardado", description: `${r.nuevas} nueva${r.nuevas === 1 ? "" : "s"}${r.corregidas ? ` y ${r.corregidas} corregida${r.corregidas === 1 ? "" : "s"}` : ""}. El bot ya la conoce.` });
      setPalabras("");
      setProducto("");
      cajaPalabra.current?.focus();
      refrescar();
    },
    onError: (e: Error) => toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" }),
  });
  const corregir = useMutation({
    mutationFn: (e: { id: number; jerga: string; producto: string }) => pedirJSON("PATCH", `/api/admin/plantillas-jerga/${e.id}`, { jerga: e.jerga, productoIdentificado: e.producto }),
    onSuccess: () => { setEditando(null); refrescar(); },
    onError: (e: Error) => toast({ title: "No se pudo corregir", description: e.message, variant: "destructive" }),
  });
  const borrar = useMutation({
    mutationFn: (id: number) => pedirJSON("DELETE", `/api/admin/plantillas-jerga/${id}`),
    onSuccess: () => { setBorrando(null); refrescar(); },
    onError: (e: Error) => toast({ title: "No se pudo borrar", description: e.message, variant: "destructive" }),
  });

  const tiposActivos = tipos.filter((t) => t.activo);
  const selector = "h-9 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <Card className="bg-white border-0 shadow-sm" data-testid="panel-jerga-simple">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="w-5 h-5 text-emerald-600" />Palabras que conoce el bot</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Escribe cómo lo dice el cliente y qué producto es. El bot de todos los colmados lo usa enseguida.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {paises.length > 0 && (
              <select value={paisId ?? ""} onChange={(e) => onPais(e.target.value ? Number(e.target.value) : null)} className={selector} data-testid="select-pais-jerga-filter">
                <option value="">Todos los países</option>
                {paises.map((p) => <option key={p.id} value={p.id}>{p.bandera} {p.nombre}</option>)}
              </select>
            )}
            {tiposActivos.length > 1 && (
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={selector} data-testid="select-tipo-jerga">
                {tiposActivos.map((t) => <option key={t.slug} value={t.slug}>{t.nombre}</option>)}
              </select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => { e.preventDefault(); if (palabras.trim() && producto.trim()) agregar.mutate(); }}
          className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end"
        >
          <label className="text-xs font-medium text-slate-600">
            El cliente dice
            <Input ref={cajaPalabra} value={palabras} onChange={(e) => setPalabras(e.target.value)} placeholder="una fría, una vestida de novia" className="mt-1 bg-white" data-testid="input-jerga-palabras" />
          </label>
          <ArrowRight className="hidden sm:block w-4 h-4 text-slate-400 mb-3" />
          <label className="text-xs font-medium text-slate-600">
            Es este producto
            <Input ref={cajaProducto} value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Cerveza Presidente" list="productos-jerga" className="mt-1 bg-white" data-testid="input-jerga-producto" />
            <datalist id="productos-jerga">{productosConocidos.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <Button type="submit" disabled={agregar.isPending || !palabras.trim() || !producto.trim()} className="bg-emerald-600 hover:bg-emerald-700" data-testid="btn-jerga-agregar">
            {agregar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Agregar
          </Button>
          <p className="sm:col-span-4 text-xs text-slate-500">Puedes poner varias formas de decirlo separadas por coma. Si la palabra ya existe, se corrige.{paisId === null ? " Sin país elegido, vale para todos los países." : ""}</p>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar palabra o producto" className="pl-9" data-testid="input-jerga-buscar" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{lista.length} palabra{lista.length === 1 ? "" : "s"}</span>
            {onGenerarIA && (
              <Button type="button" variant="outline" size="sm" disabled={generando} onClick={() => onGenerarIA(tipo)} data-testid="btn-generar-jerga-ia">
                {generando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}Sugerir con IA
              </Button>
            )}
          </div>
        </div>

        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> : lista.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">{buscar ? "Ninguna palabra coincide con la búsqueda." : "Todavía no hay palabras. Agrega la primera arriba."}</p>
        ) : (
          <div className="divide-y rounded-lg border max-h-[520px] overflow-y-auto">
            {lista.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid={`jerga-item-${j.id}`}>
                {editando?.id === j.id ? (
                  <form className="flex flex-1 flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (editando.jerga.trim() && editando.producto.trim()) corregir.mutate(editando); }}>
                    <Input value={editando.jerga} onChange={(e) => setEditando({ ...editando, jerga: e.target.value })} className="h-8 flex-1 min-w-[120px]" />
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <Input value={editando.producto} onChange={(e) => setEditando({ ...editando, producto: e.target.value })} list="productos-jerga" className="h-8 flex-1 min-w-[120px]" autoFocus />
                    <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 text-emerald-700" disabled={corregir.isPending} title="Guardar"><Check className="w-4 h-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(null)} title="Cancelar"><X className="w-4 h-4" /></Button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium text-slate-800">{j.jerga}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-emerald-700 flex-1">{j.productoIdentificado}</span>
                    {j.origen === "aprendida" && <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Aprendida</Badge>}
                    {j.paisId === null && paisId !== null && <Badge variant="outline" className="text-slate-500">Todos los países</Badge>}
                    {borrando === j.id ? (
                      <span className="flex items-center gap-1 text-xs text-slate-600">
                        ¿Borrar?
                        <Button size="sm" variant="destructive" className="h-7 px-2" disabled={borrar.isPending} onClick={() => borrar.mutate(j.id)} data-testid={`btn-jerga-borrar-si-${j.id}`}>Sí</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setBorrando(null)}>No</Button>
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500" onClick={() => { setBorrando(null); setEditando({ id: j.id, jerga: j.jerga, producto: j.productoIdentificado }); }} title="Corregir" data-testid={`btn-jerga-editar-${j.id}`}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setBorrando(j.id)} title="Borrar" data-testid={`btn-jerga-borrar-${j.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
