import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Database, Download, History, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Seguridad: bitácora (quién hizo qué), errores del sistema y respaldos diarios.

type Bitacora = { id: number; usuario: string | null; rol: string | null; colmadoId: number | null; accion: string; detalle: string | null; ip: string | null; fecha: string };
type ErrorSistema = { id: number; ref: string; metodo: string | null; ruta: string | null; mensaje: string | null; fecha: string };
type Respaldo = { dia: string; estado: "en_curso" | "listo" | "fallido"; totalTablas: number; tablaActual: number; filas: number; bytes: number; inicio: string; fin: string | null; error: string | null };

const fecha = (v: string) => new Date(v).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "medium" });
const tamano = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const ROLES: Record<string, string> = { platform_admin: "Plataforma", colmado_owner: "Dueño", admin_pedidos: "Admin. pedidos", operador_sucursal: "Operador", delivery: "Repartidor" };

export function SeguridadSection() {
  const [pestana, setPestana] = useState<"bitacora" | "errores" | "respaldos">("bitacora");
  const pestanas = [
    { id: "bitacora" as const, texto: "Bitácora", icono: History },
    { id: "errores" as const, texto: "Errores del sistema", icono: AlertTriangle },
    { id: "respaldos" as const, texto: "Respaldos", icono: Database },
  ];
  return (
    <div className="space-y-6" data-testid="section-seguridad">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Seguridad</h2>
        <p className="text-gray-500 text-sm">Quién hizo qué, los errores del servidor y los respaldos diarios de la base de datos.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {pestanas.map((p) => (
          <Button key={p.id} variant={pestana === p.id ? "default" : "outline"} onClick={() => setPestana(p.id)} className={pestana === p.id ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
            <p.icono className="w-4 h-4 mr-2" />{p.texto}
          </Button>
        ))}
      </div>
      {pestana === "bitacora" && <BitacoraLista />}
      {pestana === "errores" && <ErroresLista />}
      {pestana === "respaldos" && <Respaldos />}
    </div>
  );
}

function BitacoraLista() {
  const { data, isLoading } = useQuery<Bitacora[]>({ queryKey: ["/api/admin/bitacora"], queryFn: () => pedirJSON<Bitacora[]>("GET", "/api/admin/bitacora") });
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Últimos 100 cambios</CardTitle><p className="text-sm text-gray-500">Se guardan 180 días. Nunca se guardan contraseñas ni llaves.</p></CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> : !data?.length ? <p className="text-sm text-gray-500">Todavía no hay movimientos.</p> : (
          <div className="divide-y text-sm">
            {data.map((b) => (
              <div key={b.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{b.accion}</span><span className="text-xs text-gray-400">{fecha(b.fecha)}</span></div>
                <p className="text-xs text-gray-500">{b.usuario ?? "—"} {b.rol ? `· ${ROLES[b.rol] ?? b.rol}` : ""} {b.colmadoId ? `· negocio #${b.colmadoId}` : ""} {b.ip ? `· IP ${b.ip}` : ""}</p>
                {b.detalle && <p className="text-xs text-gray-600 mt-0.5">{b.detalle}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ErroresLista() {
  const { data, isLoading } = useQuery<ErrorSistema[]>({ queryKey: ["/api/admin/errores"], queryFn: () => pedirJSON<ErrorSistema[]>("GET", "/api/admin/errores") });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Errores del servidor</CardTitle>
        <p className="text-sm text-gray-500">Se guardan 30 días. Si hay 5 o más en 10 minutos te llega un correo (si el correo está configurado en Integraciones). Busca la referencia en Cloudflare → Workers → delywa → Logs para ver el detalle completo.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> : !data?.length ? <p className="text-sm text-gray-500">No hay errores. 🎉</p> : (
          <div className="divide-y text-sm">
            {data.map((e) => (
              <div key={e.id} className="py-2">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{e.metodo} {e.ruta}</span><span className="text-xs text-gray-400">{fecha(e.fecha)}</span></div>
                <p className="text-xs text-red-700">{e.mensaje}</p>
                <p className="text-xs text-gray-400">ref {e.ref}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Respaldos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ disponible: boolean; respaldos: Respaldo[] }>({
    queryKey: ["/api/admin/respaldos"], queryFn: () => pedirJSON("GET", "/api/admin/respaldos"),
    refetchInterval: (q) => (q.state.data?.respaldos.some((r) => r.estado === "en_curso") ? 15_000 : false),
  });
  const ahora = useMutation({
    mutationFn: () => pedirJSON<{ terminado: boolean }>("POST", "/api/admin/respaldos/ahora"),
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["/api/admin/respaldos"] }); toast({ title: r.terminado ? "Respaldo listo" : "Respaldo empezado", description: r.terminado ? undefined : "Se completa solo en los próximos minutos." }); },
    onError: (e: Error) => toast({ title: "No se pudo", description: e.message, variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Respaldos diarios</CardTitle>
        <p className="text-sm text-gray-500">Todos los días a las 5:00 a.m. (hora de RD) se copia toda la base a Cloudflare R2, por partes. Se guardan 30 días; los más viejos se borran solos. No se copian las sesiones ni los contadores de intentos.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && !data.disponible && <p className="text-sm text-amber-700">El bucket de respaldos no está conectado. Vuelve a correr el instalador para crearlo.</p>}
        <Button onClick={() => ahora.mutate()} disabled={ahora.isPending || !data?.disponible} className="bg-emerald-600 hover:bg-emerald-700">
          {ahora.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}Respaldar ahora
        </Button>
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-600" /> : !data?.respaldos.length ? <p className="text-sm text-gray-500">Todavía no hay respaldos.</p> : (
          <div className="divide-y text-sm">
            {data.respaldos.map((r) => (
              <div key={r.dia} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{r.dia}</p>
                  <p className="text-xs text-gray-500">{r.filas.toLocaleString("es-DO")} filas · {tamano(r.bytes)}{r.estado === "en_curso" ? ` · tabla ${r.tablaActual + 1} de ${r.totalTablas}` : ""}{r.error ? ` · ${r.error}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.estado === "fallido" ? "destructive" : "outline"}>{r.estado === "listo" ? "Listo" : r.estado === "en_curso" ? "En curso" : "Falló"}</Badge>
                  {r.estado === "listo" && (
                    <a href={`/api/admin/respaldos/${r.dia}/descargar`} className="inline-flex items-center text-emerald-700 underline"><Download className="w-4 h-4 mr-1" />Descargar .sql</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="rounded-lg bg-slate-50 border p-3 text-xs text-slate-600">
          <b>Para restaurar</b> (solo sobre una base de datos VACÍA, nunca sobre la que está en uso): crea una base nueva en Cloudflare D1 y corre <code>npx wrangler d1 execute NOMBRE-DE-LA-BASE-NUEVA --remote --file delywa-respaldo-AAAA-MM-DD.sql</code>. Pide ayuda antes de hacerlo.
        </div>
      </CardContent>
    </Card>
  );
}
