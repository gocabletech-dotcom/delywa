import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Ban, Edit, Phone, Mail, MapPin, User, FileCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { pedirJSON } from "./IntegracionesSection";

// Plataforma → Solicitudes: negocios que se registraron solos desde la página principal.
// Nacen apagados; aquí se revisan sus datos y se activan con un botón.

type Solicitud = {
  id: number;
  nombre: string;
  estado: "pendiente_revision" | "rechazado";
  tipoNegocio: string;
  whatsappNumero: string;
  direccion: string;
  encargadoNombre: string | null;
  fechaSuscripcion: string;
  slug: string | null;
  paisNombre: string | null;
  paisBandera: string | null;
  duenoNombre: string | null;
  duenoCorreo: string | null;
  duenoCorreoConfirmadoAt: string | number | null;
  aceptaciones: Array<{ documento: string; version: string; fecha: string; ip: string | null }>;
};

const URL = "/api/admin/solicitudes-negocio";
const NOMBRES_DOC: Record<string, string> = { terminos: "Términos", privacidad: "Privacidad", dpa: "DPA" };
const fecha = (v: string) => new Date(v).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });

export function SolicitudesNegocioSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<Solicitud[]>({ queryKey: [URL], queryFn: () => pedirJSON<Solicitud[]>("GET", URL) });

  const decidir = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: "activar" | "rechazar" }) => pedirJSON("POST", `${URL}/${id}/${accion}`),
    onSuccess: (_r, { accion }) => {
      queryClient.invalidateQueries({ queryKey: [URL] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/colmados"] });
      queryClient.invalidateQueries({ queryKey: ["/api/colmados"] });
      toast({ title: accion === "activar" ? "Negocio activado" : "Solicitud rechazada" });
    },
    onError: (e: Error) => toast({ title: "No se pudo", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>;
  const pendientes = (data ?? []).filter((s) => s.estado === "pendiente_revision");
  const rechazadas = (data ?? []).filter((s) => s.estado === "rechazado");

  const tarjeta = (s: Solicitud) => (
    <Card key={s.id} data-testid={`solicitud-${s.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-lg flex-wrap">
          <span>{s.nombre}</span>
          <Badge variant={s.estado === "rechazado" ? "destructive" : "outline"}>{s.estado === "rechazado" ? "Rechazado" : "En revisión"}</Badge>
        </CardTitle>
        <p className="text-xs text-gray-500">Registrado {fecha(s.fechaSuscripcion)} · {s.paisBandera} {s.paisNombre} · {s.tipoNegocio}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid sm:grid-cols-2 gap-2">
          <p className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" />{s.duenoNombre || s.encargadoNombre || "—"}</p>
          <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" />{s.duenoCorreo || "—"}{s.duenoCorreo && (s.duenoCorreoConfirmadoAt ? <span className="text-xs font-medium text-green-700" data-testid={`correo-confirmado-${s.id}`}>· confirmado</span> : <span className="text-xs font-medium text-amber-700" data-testid={`correo-sin-confirmar-${s.id}`}>· sin confirmar</span>)}</p>
          <p className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-400" />
            <a className="text-emerald-700 underline" href={`https://wa.me/${s.whatsappNumero}`} target="_blank" rel="noopener noreferrer">+{s.whatsappNumero}</a>
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            <a className="text-emerald-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}`} target="_blank" rel="noopener noreferrer">{s.direccion}</a>
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <FileCheck className="w-4 h-4" />
          {s.aceptaciones.length
            ? `Aceptó ${s.aceptaciones.map((a) => NOMBRES_DOC[a.documento] ?? a.documento).join(", ")} (versión ${s.aceptaciones[0].version}, ${fecha(s.aceptaciones[0].fecha)}${s.aceptaciones[0].ip ? `, IP ${s.aceptaciones[0].ip}` : ""})`
            : "Sin constancia de aceptación"}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={decidir.isPending}
            onClick={() => window.confirm(`¿Activar «${s.nombre}»? Empezará a recibir pedidos y el bot le responderá a sus clientes.`) && decidir.mutate({ id: s.id, accion: "activar" })}
            data-testid={`button-activar-${s.id}`}
          >
            <Play className="w-4 h-4 mr-1" />Activar
          </Button>
          <Button variant="outline" onClick={() => navigate(`/admin/negocio/${s.id}/editar`)}>
            <Edit className="w-4 h-4 mr-1" />Ver y corregir datos
          </Button>
          {s.estado !== "rechazado" && (
            <Button
              variant="outline"
              className="text-red-600 hover:bg-red-50"
              disabled={decidir.isPending}
              onClick={() => window.confirm(`¿Rechazar «${s.nombre}»? Queda apagado; no se borra nada y puedes activarlo después.`) && decidir.mutate({ id: s.id, accion: "rechazar" })}
              data-testid={`button-rechazar-${s.id}`}
            >
              <Ban className="w-4 h-4 mr-1" />Rechazar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6" data-testid="section-solicitudes">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Solicitudes de negocios</h2>
        <p className="text-gray-500 text-sm">Negocios registrados desde la página principal. Están apagados: no reciben pedidos ni mensajes hasta que los actives.</p>
      </div>
      {pendientes.length === 0 && <p className="text-gray-500">No hay solicitudes pendientes.</p>}
      {pendientes.map(tarjeta)}
      {rechazadas.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-gray-700 pt-4">Rechazadas</h3>
          {rechazadas.map(tarjeta)}
        </>
      )}
    </div>
  );
}
