import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  MapPin,
  MessageCircle,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { formatDateRD } from "@/lib/date-utils";
import NegocioLayout from "@/components/negocio/NegocioLayout";

type ZipAlertaEvento = {
  id: number;
  canal: string;
  clienteIdentificador: string | null;
  direccionRecibida: string | null;
  fechaCreacion: string;
};

type ZipAlertasResponse = {
  eventos: ZipAlertaEvento[];
  limit: number;
  offset: number;
  hasMore: boolean;
  dias: number;
};

const PAGE_SIZE = 20;

function formatClienteIdentificador(evento: ZipAlertaEvento): string {
  if (!evento.clienteIdentificador) return "No identificado";
  if (evento.canal === "web") {
    return `Sesión ${evento.clienteIdentificador.slice(0, 8)}${evento.clienteIdentificador.length > 8 ? "…" : ""}`;
  }

  const digits = evento.clienteIdentificador.replace(/\D/g, "");
  if (digits.length >= 4) return `•••• ${digits.slice(-4)}`;
  return "Cliente no identificado";
}

function getCanalInfo(canal: string) {
  switch (canal.toLowerCase()) {
    case "meta":
      return { label: "Meta", icon: MessageCircle, className: "bg-green-100 text-green-700 border-green-200" };
    case "evolution":
      return { label: "Evolution", icon: Smartphone, className: "bg-blue-100 text-blue-700 border-blue-200" };
    case "web":
      return { label: "Web", icon: Globe, className: "bg-purple-100 text-purple-700 border-purple-200" };
    default:
      return { label: canal || "Desconocido", icon: Globe, className: "bg-gray-100 text-gray-700 border-gray-200" };
  }
}

export default function ZipAlertasPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: roleData } = useQuery<{ colmadoId?: number }>({
    queryKey: ["user-role"],
    queryFn: async () => {
      const res = await fetch("/api/user/role");
      if (!res.ok) return {};
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const colmadoId = roleData?.colmadoId;
  const { data, isLoading, isError, refetch } = useQuery<ZipAlertasResponse>({
    queryKey: ["zip-alertas-detalle", colmadoId, page],
    queryFn: async () => {
      const res = await fetch(
        `/api/colmados/${colmadoId}/analytics/zip-alertas/detalle?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      if (!res.ok) throw new Error("Error al cargar alertas ZIP");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const eventos = data?.eventos || [];
  const canGoPrevious = page > 0;
  const canGoNext = data?.hasMore === true;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <NegocioLayout title="Alertas de código postal" activeNav="settings">
      <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 sm:mb-6">
            <div className="flex items-start gap-3">
              <Link href="/negocio/dashboard">
                <Button variant="outline" size="icon" className="shrink-0" title="Volver al dashboard" data-testid="button-volver-dashboard">
                  <ArrowLeft size={18} />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold font-heading text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                  Detalle de alertas ZIP
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Direcciones rechazadas por falta de código postal en los últimos 30 días.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="self-end sm:self-start"
              data-testid="button-refresh-zip-alertas"
            >
              <RefreshCw size={15} className={`mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader className="px-4 sm:px-6 pb-3">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <MapPin size={18} className="text-amber-600" />
                Eventos registrados
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
                </div>
              ) : isError ? (
                <div className="text-center py-10 text-gray-500">
                  <AlertTriangle size={34} className="mx-auto mb-2 text-amber-500" />
                  <p className="font-medium text-gray-700">No se pudieron cargar las alertas.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                    Intentar de nuevo
                  </Button>
                </div>
              ) : eventos.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <MapPin size={38} className="mx-auto mb-2 opacity-40" />
                  <p className="font-medium text-gray-700">No hay alertas ZIP en los últimos 30 días.</p>
                  <p className="text-sm mt-1">Las direcciones rechazadas por falta de código postal aparecerán aquí.</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:grid md:grid-cols-[150px_110px_150px_minmax(0,1fr)] gap-4 px-3 pb-2 border-b text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span>Fecha y hora</span>
                    <span>Canal</span>
                    <span>Cliente</span>
                    <span>Dirección rechazada</span>
                  </div>
                  <div className="divide-y">
                    {eventos.map((evento) => {
                      const canal = getCanalInfo(evento.canal);
                      const CanalIcon = canal.icon;
                      return (
                        <div
                          key={evento.id}
                          className="grid md:grid-cols-[150px_110px_150px_minmax(0,1fr)] gap-2 md:gap-4 px-3 py-4"
                          data-testid={`zip-alerta-${evento.id}`}
                        >
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <Clock size={14} className="text-gray-400 shrink-0 md:hidden" />
                            <span>{formatDateRD(evento.fechaCreacion, { includeTime: true })}</span>
                          </div>
                          <div>
                            <Badge variant="outline" className={`gap-1 ${canal.className}`}>
                              <CanalIcon size={13} />
                              {canal.label}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="text-xs text-gray-400 md:hidden mr-1">Cliente:</span>
                            {formatClienteIdentificador(evento)}
                          </div>
                          <div className="min-w-0 text-sm text-gray-800 break-words">
                            <span className="text-xs text-gray-400 md:hidden mr-1">Dirección:</span>
                            {evento.direccionRecibida || "No se recibió texto de dirección"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t pt-4 mt-2">
                    <p className="text-xs sm:text-sm text-gray-500">
                      Página {page + 1} · Mostrando {eventos.length} evento{eventos.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((current) => current - 1)}
                        disabled={!canGoPrevious || isLoading}
                        data-testid="button-zip-alertas-anterior"
                      >
                        <ChevronLeft size={16} className="mr-1" />
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((current) => current + 1)}
                        disabled={!canGoNext || isLoading}
                        data-testid="button-zip-alertas-siguiente"
                      >
                        Siguiente
                        <ChevronRight size={16} className="ml-1" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </NegocioLayout>
  );
}