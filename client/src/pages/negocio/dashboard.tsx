import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Truck,
  Package,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  Plus,
  X,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  PauseCircle,
  Play,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";

const formatProductos = (productosStr: string): string => {
  try {
    const productos = JSON.parse(productosStr);
    if (Array.isArray(productos)) {
      return productos.map((p: { cantidad: number; nombre: string }) => `${p.cantidad}x ${p.nombre}`).join(", ");
    }
    return productosStr;
  } catch {
    return productosStr;
  }
};

const formatEstadoCorto = (estado: string): string => {
  const abreviaturas: Record<string, string> = {
    pendiente_confirmacion: "Por confirmar",
    esperando_confirmacion_sustituciones: "Sustitución",
    esperando_pago: "Esp. pago",
    pendiente: "Pendiente",
    en_camino: "En camino",
    entregado: "Entregado",
    cancelado: "Cancelado",
    retorno: "Retorno",
  };
  return abreviaturas[estado] || estado;
};

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: roleData } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const res = await fetch("/api/user/role");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const colmadoId = roleData?.colmadoId;

  const { data: ventasHoy } = useQuery({
    queryKey: ["ventas-hoy", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/ventas/hoy`);
      if (!res.ok) throw new Error("Error al cargar ventas");
      return res.json();
    },
    enabled: !!colmadoId,
      refetchInterval: 10000,
      staleTime: 0,
  });

  type PedidoBasico = { id: number; estado: string; clienteNombre: string; productos: string; total: string };
  type DeliveryBasico = { id: number; estado: string; nombre: string };

  const { data: pedidos } = useQuery<PedidoBasico[]>({
    queryKey: ["pedidos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 10000,
    staleTime: 0,
  });

  const { data: deliveries } = useQuery<DeliveryBasico[]>({
    queryKey: ["deliveries", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/deliveries`);
      if (!res.ok) throw new Error("Error al cargar deliveries");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const updateDeliveryEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      const res = await fetch(`/api/deliveries/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error("Error al actualizar estado");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries", colmadoId] });
    },
  });

  const { data: suscripcionData } = useQuery<{
    suscripcion: { id: number; estado: string };
    plan: { nombre: string; precio: number };
    diasRestantes: number;
    proximoAVencer: boolean;
    expirado: boolean;
    estadoSuscripcion?: string;
  }>({
    queryKey: ["suscripcion", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/suscripcion`);
      if (!res.ok) throw new Error("Error al cargar suscripción");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    tipoNegocio: string;
    estado: string;
    simboloMoneda?: string;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: analyticsData } = useQuery<{
    mensajesEnviados: number;
    mensajesRecibidos: number;
    conversacionesActivas: number;
    conversacionesTotal: number;
  }>({
    queryKey: ["analytics-mensajes", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/analytics/mensajes`);
      if (!res.ok) throw new Error("Error al cargar analytics");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 60000,
  });

  const { data: zipAlertasData } = useQuery<{ count: number; dias: number }>({
    queryKey: ["zip-alertas", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/analytics/zip-alertas?dias=7`);
      if (!res.ok) return { count: 0, dias: 7 };
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 300000, // refresh every 5 min
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (colmadoData?.estado === "inactivo") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center p-8 bg-white rounded-lg shadow-lg">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Cuenta Suspendida</h1>
          <p className="text-gray-600 mb-6">
            Tu cuenta está temporalmente suspendida. Para reactivar tu servicio, comunícate con nuestro equipo de soporte.
          </p>
          <Button variant="outline" onClick={() => logout()} className="w-full">
            Cerrar Sesión
          </Button>
        </div>
      </div>
    );
  }

  const pedidosPendientes = pedidos?.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado" && p.estado !== "retorno" && p.estado !== "fusionado") || [];
  const pedidosEnCamino = pedidos?.filter((p) => p.estado === "en_camino") || [];
  const moneda = colmadoData?.simboloMoneda || "RD$";

  const stats = [
    {
      title: "Ventas de hoy",
      value: `${moneda}${parseFloat(ventasHoy?.totalVentas || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "bg-green-100 text-green-600",
    },
    {
      title: "Pedidos entregados",
      value: ventasHoy?.pedidosEntregados || 0,
      icon: CheckCircle2,
      color: "bg-blue-100 text-blue-600",
      change: `${ventasHoy?.pedidosCancelados || 0} cancelados`,
    },
    {
      title: "Pendientes",
      value: ventasHoy?.pedidosPendientes ?? pedidosPendientes.length,
      icon: Clock,
      color: "bg-orange-100 text-orange-600",
    },
    {
      title: "Repartidores activos",
      value: deliveries?.filter((d) => d.estado === "activo").length || 0,
      icon: Truck,
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "Mensajes",
      value: (analyticsData?.mensajesRecibidos || 0) + (analyticsData?.mensajesEnviados || 0),
      icon: MessageCircle,
      color: "bg-cyan-100 text-cyan-600",
      change: `${analyticsData?.conversacionesActivas || 0} activas`,
    },
  ];

  const headerRight = (
    <>
      <Badge
        variant="outline"
        className={`text-xs sm:text-sm ${
          ventasHoy?.cuadrado
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-amber-300 bg-amber-50 text-amber-800"
        }`}
      >
        {ventasHoy?.cuadrado ? "Cuadrada" : "Pendiente"}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 sm:h-10 sm:w-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        onClick={() => queryClient.invalidateQueries()}
        title="Refrescar"
        data-testid="button-refresh"
      >
        <RefreshCw size={18} className="sm:hidden" />
        <RefreshCw size={20} className="hidden sm:block" />
      </Button>
    </>
  );

  return (
    <NegocioLayout title="Inicio" activeNav="dashboard" headerRight={headerRight}>
      {/* Subscription Banners */}
      {suscripcionData?.expirado && (
        <div className="bg-red-600 text-white px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid="banner-plan-expirado">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="font-medium text-sm sm:text-base">Tu plan ha expirado. Renueva para seguir usando DelyWa.</span>
          </div>
          <a
            href="https://wa.me/18095551234?text=Hola,%20quiero%20renovar%20mi%20plan%20de%20DelyWa"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-red-600 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-xs sm:text-sm hover:bg-red-50 text-center shrink-0"
            data-testid="button-renovar-whatsapp"
          >
            Renovar
          </a>
        </div>
      )}
      {suscripcionData?.estadoSuscripcion === "suspendida" && (
        <div className="bg-red-600 text-white px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid="banner-suspendido">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="font-medium text-sm sm:text-base">Tu suscripción está suspendida. Contacta soporte.</span>
          </div>
          <a
            href={`https://wa.me/19193436706?text=${encodeURIComponent("Hola, mi suscripción está suspendida y me gustaría reactivarla.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-red-600 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-xs sm:text-sm hover:bg-red-50 text-center shrink-0"
            data-testid="button-reactivar-whatsapp"
          >
            Soporte
          </a>
        </div>
      )}
      {suscripcionData?.estadoSuscripcion === "en_gracia" && (
        <div className="bg-orange-500 text-white px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid="banner-en-gracia">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="font-medium text-sm sm:text-base">Período de gracia. Renueva antes de que se suspenda.</span>
          </div>
          <a
            href={`https://wa.me/19193436706?text=${encodeURIComponent("Hola, mi suscripción está en período de gracia y me gustaría renovar.")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-orange-600 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-xs sm:text-sm hover:bg-orange-50 text-center shrink-0"
            data-testid="button-renovar-gracia-whatsapp"
          >
            Renovar
          </a>
        </div>
      )}
      {suscripcionData?.proximoAVencer && !suscripcionData?.expirado && suscripcionData?.estadoSuscripcion !== "suspendida" && suscripcionData?.estadoSuscripcion !== "en_gracia" && (
        <div className="bg-amber-500 text-white px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" data-testid="banner-plan-por-vencer">
          <div className="flex items-center gap-2 sm:gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="font-medium text-sm sm:text-base">
              Tu plan vence en {suscripcionData.diasRestantes} día{suscripcionData.diasRestantes !== 1 ? "s" : ""}.
            </span>
          </div>
          <a
            href="https://wa.me/18095551234?text=Hola,%20quiero%20renovar%20mi%20plan%20de%20DelyWa"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-amber-600 px-3 sm:px-4 py-1.5 rounded-lg font-medium text-xs sm:text-sm hover:bg-amber-50 text-center shrink-0"
            data-testid="button-renovar-whatsapp"
          >
            Renovar
          </a>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6">
          {stats.map((stat, i) => (
            <Card key={i} className="border-none shadow-sm" data-testid={`stat-${stat.title.toLowerCase().replace(" ", "-")}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <stat.icon size={16} className="sm:hidden" />
                    <stat.icon size={20} className="hidden sm:block" />
                  </div>
                  {stat.change && (
                    <span className="text-xs text-gray-500 hidden sm:block">{stat.change}</span>
                  )}
                </div>
                <p className="text-lg sm:text-2xl font-bold font-heading">{stat.value}</p>
                <p className="text-xs sm:text-sm text-gray-500 truncate">{stat.title}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ZIP Alert Banner — only show when there are alerts in the last 7 days */}
        {zipAlertasData && zipAlertasData.count > 0 && (
          <div className="mb-4 sm:mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 flex items-start gap-3" data-testid="zip-alerta-banner">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-100 text-amber-600 shrink-0 mt-0.5">
              <MapPin size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-amber-800">
                {zipAlertasData.count} dirección{zipAlertasData.count !== 1 ? "es" : ""} sin código postal (últimos 7 días)
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                El bot rechazó estas direcciones porque les faltaba el código postal. Si este número es inusualmente alto, verifica que el prompt del AI esté pidiendo el código postal correctamente.
              </p>
            </div>
             <Link href="/negocio/alertas/zip" className="shrink-0">
               <Button
                 variant="outline"
                 size="sm"
                 className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100 hover:text-amber-900 text-xs sm:text-sm"
                 data-testid="button-ver-zip-alertas"
               >
                 Ver detalle <ChevronRight size={15} className="ml-1" />
               </Button>
             </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Pedidos Recientes */}
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg font-heading">Pedidos recientes</CardTitle>
              <Link href="/negocio/pedidos">
                <Button variant="ghost" size="sm" className="text-primary text-xs sm:text-sm px-2 sm:px-3" data-testid="ver-todos-pedidos">
                  Ver todos <ChevronRight size={14} className="sm:hidden" /><ChevronRight size={16} className="hidden sm:inline" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 sm:gap-3">
                {pedidos?.slice(0, 6).map((pedido) => (
                  <div key={pedido.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-3 bg-gray-50 rounded-lg" data-testid={`pedido-${pedido.id}`}>
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 mb-1 sm:mb-0">
                      <div className={`w-6 h-6 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                        pedido.estado === "pendiente" ? "bg-orange-100 text-orange-600" :
                        pedido.estado === "en_camino" ? "bg-blue-100 text-blue-600" :
                        pedido.estado === "entregado" ? "bg-green-100 text-green-600" :
                        "bg-red-100 text-red-600"
                      }`}>
                        <Package size={12} className="sm:hidden" />
                        <Package size={18} className="hidden sm:block" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-xs sm:text-sm truncate">{pedido.clienteNombre}</p>
                        <p className="text-xs text-gray-500 truncate hidden sm:block">{formatProductos(pedido.productos)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:block sm:text-right shrink-0">
                      <p className="font-bold text-xs sm:text-sm">{moneda}{parseFloat(pedido.total).toLocaleString()}</p>
                      <Badge variant="outline" className={`text-xs whitespace-nowrap ${
                        pedido.estado === "pendiente" || pedido.estado === "pendiente_confirmacion" ? "border-orange-300 text-orange-600" :
                        pedido.estado === "en_camino" ? "border-blue-300 text-blue-600" :
                        pedido.estado === "entregado" ? "border-green-300 text-green-600" :
                        pedido.estado === "esperando_pago" || pedido.estado === "esperando_confirmacion_sustituciones" ? "border-yellow-300 text-yellow-600" :
                        "border-red-300 text-red-600"
                      }`}>
                        {formatEstadoCorto(pedido.estado)}
                      </Badge>
                    </div>
                  </div>
                ))}

                {(!pedidos || pedidos.length === 0) && (
                  <div className="text-center py-6 sm:py-8 text-gray-500 col-span-2 sm:col-span-1">
                    <Package size={32} className="mx-auto mb-2 opacity-50 sm:hidden" />
                    <Package size={40} className="mx-auto mb-2 opacity-50 hidden sm:block" />
                    <p className="text-sm">No hay pedidos aún</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Deliveries */}
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6">
              <CardTitle className="text-base sm:text-lg font-heading">Repartidores</CardTitle>
              <Link href="/negocio/deliveries">
                <Button variant="ghost" size="sm" className="text-primary text-xs sm:text-sm px-2 sm:px-3" data-testid="ver-todos-deliveries">
                  Gestionar <ChevronRight size={14} className="sm:hidden" /><ChevronRight size={16} className="hidden sm:inline" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="space-y-2 sm:space-y-4">
                {deliveries?.map((delivery) => (
                  <div key={delivery.id} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg" data-testid={`delivery-${delivery.id}`}>
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                        delivery.estado === "activo" ? "bg-green-100 text-green-600"
                        : delivery.estado === "en_descanso" ? "bg-yellow-100 text-yellow-600"
                        : "bg-gray-100 text-gray-600"
                      }`}>
                        <Truck size={14} className="sm:hidden" />
                        <Truck size={18} className="hidden sm:block" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs sm:text-sm truncate">{delivery.nombre}</p>
                        <Badge
                          variant={delivery.estado === "activo" ? "default" : delivery.estado === "en_descanso" ? "outline" : "secondary"}
                          className={`text-xs mt-0.5 ${
                            delivery.estado === "activo" ? "bg-green-500 text-white"
                            : delivery.estado === "en_descanso" ? "border-yellow-400 text-yellow-700 bg-yellow-50"
                            : ""
                          }`}
                        >
                          {delivery.estado === "activo" ? "Activo" : delivery.estado === "en_descanso" ? "En Descanso" : "Inactivo"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {delivery.estado !== "activo" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-green-600 hover:bg-green-50 hover:text-green-700"
                          onClick={() => updateDeliveryEstadoMutation.mutate({ id: delivery.id, estado: "activo" })}
                          disabled={updateDeliveryEstadoMutation.isPending}
                          data-testid={`btn-activar-${delivery.id}`}
                          title="Activar"
                        >
                          <Play size={13} />
                        </Button>
                      )}
                      {delivery.estado === "activo" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700"
                          onClick={() => updateDeliveryEstadoMutation.mutate({ id: delivery.id, estado: "en_descanso" })}
                          disabled={updateDeliveryEstadoMutation.isPending}
                          data-testid={`btn-descanso-${delivery.id}`}
                          title="Poner en descanso"
                        >
                          <PauseCircle size={13} />
                        </Button>
                      )}
                      {delivery.estado !== "inactivo" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => updateDeliveryEstadoMutation.mutate({ id: delivery.id, estado: "inactivo" })}
                          disabled={updateDeliveryEstadoMutation.isPending}
                          data-testid={`btn-inactivar-${delivery.id}`}
                          title="Desactivar"
                        >
                          <X size={13} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {(!deliveries || deliveries.length === 0) && (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <Truck size={32} className="mx-auto mb-2 opacity-50 sm:hidden" />
                    <Truck size={40} className="mx-auto mb-2 opacity-50 hidden sm:block" />
                    <p className="text-sm">Todavía no hay repartidores</p>
                    <Link href="/negocio/deliveries">
                      <Button size="sm" className="mt-2 bg-primary text-xs sm:text-sm" data-testid="agregar-primer-delivery">
                        <Plus size={14} className="mr-1 sm:hidden" /><Plus size={16} className="mr-1 hidden sm:inline" /> Agregar Delivery
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </NegocioLayout>
  );
}
