import { useState, useEffect } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  MessageCircle,
  Truck,
  Package,
  DollarSign,
  TrendingUp,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
  ChevronRight,
  Settings,
  RefreshCw,
  AlertTriangle,
  Crown,
  BookOpen,
  UtensilsCrossed,
  Download,
  Video,
} from "lucide-react";

import promoVideo1 from "@assets/generated_videos/complete_delivery_flow_sequence.mp4";
import promoVideo2 from "@assets/generated_videos/delywa_logo_with_slogan.mp4";
import promoVideoFull1 from "@assets/generated_videos/customer_types_order_ai_responds.mp4";
import promoVideoFull2 from "@assets/generated_videos/owner_confirms_delivery_receives_order.mp4";
import promoVideoFull3 from "@assets/generated_videos/green_delivery_delywa_logo_finale.mp4";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";

const formatProductos = (productosStr: string): string => {
  try {
    const productos = JSON.parse(productosStr);
    if (Array.isArray(productos)) {
      return productos.map((p: any) => `${p.cantidad}x ${p.nombre}`).join(", ");
    }
    return productosStr;
  } catch {
    return productosStr;
  }
};

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

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

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: ventasHoy } = useQuery({
    queryKey: ["ventas-hoy", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/ventas/hoy`);
      if (!res.ok) throw new Error("Error al cargar ventas");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: pedidos } = useQuery({
    queryKey: ["pedidos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: deliveries } = useQuery({
    queryKey: ["deliveries", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/deliveries`);
      if (!res.ok) throw new Error("Error al cargar deliveries");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["unread-messages", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/conversaciones/unread`);
      if (!res.ok) throw new Error("Error al cargar mensajes no leídos");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 10000,
  });

  const { data: suscripcionData } = useQuery<{
    suscripcion: any;
    plan: any;
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
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pedidosPendientes = pedidos?.filter((p: any) => p.estado === "pendiente") || [];
  const pedidosEnCamino = pedidos?.filter((p: any) => p.estado === "en_camino") || [];

  const stats = [
    {
      title: "Ventas Hoy",
      value: `RD$${parseFloat(ventasHoy?.totalVentas || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "bg-green-100 text-green-600",
      change: "+12%",
    },
    {
      title: "Pedidos Entregados",
      value: ventasHoy?.pedidosEntregados || 0,
      icon: CheckCircle2,
      color: "bg-blue-100 text-blue-600",
      change: `${ventasHoy?.pedidosCancelados || 0} cancelados`,
    },
    {
      title: "Pendientes",
      value: pedidosPendientes.length,
      icon: Clock,
      color: "bg-orange-100 text-orange-600",
    },
    {
      title: "Deliveries Activos",
      value: deliveries?.filter((d: any) => d.estado === "activo").length || 0,
      icon: Truck,
      color: "bg-purple-100 text-purple-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
                )}
              </div>
              <span className="font-heading font-bold text-lg truncate">{colmadoData?.nombre || "Mi Negocio"}</span>
            </div>
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium" data-testid="nav-dashboard">
              <TrendingUp size={20} />
              Dashboard
            </Link>
            <Link href="/admin/conversaciones" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-conversaciones">
              <MessageCircle size={20} />
              Conversaciones
              {(unreadData?.count || 0) > 0 && (
                <Badge className="ml-auto bg-red-500" data-testid="badge-unread-messages">{unreadData.count}</Badge>
              )}
            </Link>
            <Link href="/admin/clientes" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-clientes">
              <Users size={20} />
              Clientes
            </Link>
            <Link href="/admin/pedidos" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-pedidos">
              <Package size={20} />
              Pedidos
              {pedidosPendientes.length > 0 && (
                <Badge className="ml-auto bg-orange-500">{pedidosPendientes.length}</Badge>
              )}
            </Link>
            <Link href="/admin/deliveries" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-deliveries">
              <Truck size={20} />
              Deliveries
            </Link>
            <Link href="/admin/ventas" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-ventas">
              <DollarSign size={20} />
              Ventas
            </Link>
            {colmadoData?.tipoNegocio && !["colmado", "colmadon"].includes(colmadoData.tipoNegocio) && (
              <Link href="/admin/menu" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-menu">
                <UtensilsCrossed size={20} />
                Menú
              </Link>
            )}
            <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-settings">
              <Settings size={20} />
              Configuración
            </Link>
            <Link href="/admin/manual" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-manual">
              <BookOpen size={20} />
              Manual de Usuario
            </Link>
          </nav>

          <div className="p-4 border-t space-y-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" data-testid="text-negocio-name">
                  {colmadoData?.nombre || "Mi Negocio"}
                </p>
                <p className="text-xs text-gray-500" data-testid="text-plan-name">
                  {suscripcionData?.plan?.nombre || "Sin Plan"}
                </p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 w-full"
              data-testid="button-logout"
            >
              <LogOut size={20} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white border-b px-4 lg:px-6 h-16 flex items-center justify-between">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="hidden lg:block">
            <h1 className="text-xl font-bold font-heading">Dashboard</h1>
            <p className="text-sm text-gray-500" data-testid="text-datetime">{currentDateTime}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className={ventasHoy?.cuadrado ? "border-green-500 text-green-600" : "border-orange-500 text-orange-600"}>
              {ventasHoy?.cuadrado ? "Caja Cuadrada" : "Pendiente Cuadrar"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.reload()}
              title="Refrescar"
              data-testid="button-refresh"
            >
              <RefreshCw size={20} />
            </Button>
          </div>
        </header>

        {/* Plan Expiration Warning Banner */}
        {suscripcionData?.expirado && (
          <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between" data-testid="banner-plan-expirado">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} />
              <span className="font-medium">Tu plan ha expirado. Renueva para seguir usando DelyWa.</span>
            </div>
            <a 
              href="https://wa.me/18095551234?text=Hola,%20quiero%20renovar%20mi%20plan%20de%20DelyWa"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-red-600 px-4 py-1.5 rounded-lg font-medium text-sm hover:bg-red-50"
              data-testid="button-renovar-whatsapp"
            >
              Renovar por WhatsApp
            </a>
          </div>
        )}
        {suscripcionData?.estadoSuscripcion === 'suspendida' && (
          <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between" data-testid="banner-suspendido">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} />
              <span className="font-medium">Tu suscripción está suspendida. Contacta soporte para reactivar tu cuenta.</span>
            </div>
            <a 
              href={`https://wa.me/19193436706?text=${encodeURIComponent('Hola, mi suscripción está suspendida y me gustaría reactivarla.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-red-600 px-4 py-1.5 rounded-lg font-medium text-sm hover:bg-red-50"
              data-testid="button-reactivar-whatsapp"
            >
              Contactar Soporte
            </a>
          </div>
        )}
        {suscripcionData?.estadoSuscripcion === 'en_gracia' && (
          <div className="bg-orange-500 text-white px-4 py-3 flex items-center justify-between" data-testid="banner-en-gracia">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} />
              <span className="font-medium">Tu suscripción está en período de gracia. Renueva antes de que se suspenda.</span>
            </div>
            <a 
              href={`https://wa.me/19193436706?text=${encodeURIComponent('Hola, mi suscripción está en período de gracia y me gustaría renovar.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-orange-600 px-4 py-1.5 rounded-lg font-medium text-sm hover:bg-orange-50"
              data-testid="button-renovar-gracia-whatsapp"
            >
              Renovar Ahora
            </a>
          </div>
        )}
        {suscripcionData?.proximoAVencer && !suscripcionData?.expirado && suscripcionData?.estadoSuscripcion !== 'suspendida' && suscripcionData?.estadoSuscripcion !== 'en_gracia' && (
          <div className="bg-amber-500 text-white px-4 py-3 flex items-center justify-between" data-testid="banner-plan-por-vencer">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} />
              <span className="font-medium">
                Tu plan vence en {suscripcionData.diasRestantes} día{suscripcionData.diasRestantes !== 1 ? 's' : ''}. Renueva para no perder acceso.
              </span>
            </div>
            <a 
              href="https://wa.me/18095551234?text=Hola,%20quiero%20renovar%20mi%20plan%20de%20DelyWa"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-amber-600 px-4 py-1.5 rounded-lg font-medium text-sm hover:bg-amber-50"
              data-testid="button-renovar-whatsapp"
            >
              Renovar ahora
            </a>
          </div>
        )}
        {suscripcionData?.plan?.esTrial && !suscripcionData?.expirado && suscripcionData?.estadoSuscripcion !== 'suspendida' && suscripcionData?.estadoSuscripcion !== 'en_gracia' && (
          <div className="bg-blue-500 text-white px-4 py-3 flex items-center justify-between" data-testid="banner-trial">
            <div className="flex items-center gap-3">
              <Crown size={20} />
              <span className="font-medium">
                Estás en el Plan Trial. ¡Cambia de plan y disfruta al máximo de nuestra plataforma!
              </span>
            </div>
            <a 
              href={`https://wa.me/19193436706?text=${encodeURIComponent(`Hola, tengo el Plan Trial y me gustaría cambiar a un plan de pago en DelyWa.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-blue-600 px-4 py-1.5 rounded-lg font-medium text-sm hover:bg-blue-50"
              data-testid="button-trial-upgrade"
            >
              Cambiar Plan
            </a>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((stat, i) => (
              <Card key={i} className="border-none shadow-sm" data-testid={`stat-${stat.title.toLowerCase().replace(' ', '-')}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                      <stat.icon size={20} />
                    </div>
                    {stat.change && (
                      <span className="text-xs text-gray-500">{stat.change}</span>
                    )}
                  </div>
                  <p className="text-2xl font-bold font-heading">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.title}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Pedidos Recientes */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-heading">Pedidos Recientes</CardTitle>
                <Link href="/admin/pedidos">
                  <Button variant="ghost" size="sm" className="text-primary" data-testid="ver-todos-pedidos">
                    Ver todos <ChevronRight size={16} />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pedidos?.slice(0, 5).map((pedido: any) => (
                    <div key={pedido.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg" data-testid={`pedido-${pedido.id}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          pedido.estado === 'pendiente' ? 'bg-orange-100 text-orange-600' :
                          pedido.estado === 'en_camino' ? 'bg-blue-100 text-blue-600' :
                          pedido.estado === 'entregado' ? 'bg-green-100 text-green-600' :
                          'bg-red-100 text-red-600'
                        }`}>
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{pedido.clienteNombre}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[150px]">{formatProductos(pedido.productos)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">RD${parseFloat(pedido.total).toLocaleString()}</p>
                        <Badge variant="outline" className={`text-xs ${
                          pedido.estado === 'pendiente' ? 'border-orange-300 text-orange-600' :
                          pedido.estado === 'en_camino' ? 'border-blue-300 text-blue-600' :
                          pedido.estado === 'entregado' ? 'border-green-300 text-green-600' :
                          'border-red-300 text-red-600'
                        }`}>
                          {pedido.estado}
                        </Badge>
                      </div>
                    </div>
                  ))}

                  {(!pedidos || pedidos.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      <Package size={40} className="mx-auto mb-2 opacity-50" />
                      <p>No hay pedidos aún</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Deliveries */}
            <Card className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-heading">Equipo de Delivery</CardTitle>
                <Link href="/admin/deliveries">
                  <Button variant="ghost" size="sm" className="text-primary" data-testid="ver-todos-deliveries">
                    Gestionar <ChevronRight size={16} />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deliveries?.map((delivery: any) => (
                    <div key={delivery.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg" data-testid={`delivery-${delivery.id}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          delivery.estado === 'activo' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <Truck size={18} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{delivery.nombre}</p>
                          <p className="text-xs text-gray-500">{delivery.whatsappNumero}</p>
                        </div>
                      </div>
                      <Badge variant={delivery.estado === 'activo' ? 'default' : 'secondary'} className={delivery.estado === 'activo' ? 'bg-green-500' : ''}>
                        {delivery.estado}
                      </Badge>
                    </div>
                  ))}

                  {(!deliveries || deliveries.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      <Truck size={40} className="mx-auto mb-2 opacity-50" />
                      <p>No hay deliveries registrados</p>
                      <Link href="/admin/deliveries">
                        <Button size="sm" className="mt-2 bg-primary" data-testid="agregar-primer-delivery">
                          <Plus size={16} className="mr-1" /> Agregar Delivery
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Videos Promocionales */}
          <Card className="border-none shadow-sm mt-6">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-heading flex items-center gap-2">
                <Video size={20} className="text-primary" />
                Videos Promocionales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h4 className="font-semibold text-sm mb-3 text-gray-700">Video Corto (12 segundos)</h4>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg overflow-hidden" data-testid="promo-video-1">
                  <video 
                    src={promoVideo1} 
                    controls 
                    className="w-full h-auto rounded-t-lg"
                  />
                  <div className="p-4">
                    <h4 className="font-medium text-sm mb-2">Parte 1: Flujo Completo</h4>
                    <p className="text-xs text-gray-500 mb-3">Cliente → Negocio → Delivery (6 segundos)</p>
                    <a 
                      href={promoVideo1} 
                      download="delywa-flujo-completo.mp4"
                      className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                      data-testid="download-video-1"
                    >
                      <Download size={16} />
                      Descargar
                    </a>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg overflow-hidden" data-testid="promo-video-2">
                  <video 
                    src={promoVideo2} 
                    controls 
                    className="w-full h-auto rounded-t-lg"
                  />
                  <div className="p-4">
                    <h4 className="font-medium text-sm mb-2">Parte 2: Logo + Slogan</h4>
                    <p className="text-xs text-gray-500 mb-3">"La forma más fácil de vender por WhatsApp" (6 segundos)</p>
                    <a 
                      href={promoVideo2} 
                      download="delywa-logo-slogan.mp4"
                      className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                      data-testid="download-video-2"
                    >
                      <Download size={16} />
                      Descargar
                    </a>
                  </div>
                </div>
              </div>
              
              <h4 className="font-semibold text-sm mb-3 text-gray-700">Video Completo (24 segundos)</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg overflow-hidden" data-testid="promo-video-full-1">
                  <video 
                    src={promoVideoFull1} 
                    controls 
                    className="w-full h-auto rounded-t-lg"
                  />
                  <div className="p-4">
                    <h4 className="font-medium text-sm mb-2">Parte 1: Cliente + IA</h4>
                    <p className="text-xs text-gray-500 mb-3">Cliente escribe, IA responde (8s)</p>
                    <a 
                      href={promoVideoFull1} 
                      download="delywa-cliente-ia.mp4"
                      className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                      data-testid="download-video-full-1"
                    >
                      <Download size={14} />
                      Descargar
                    </a>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg overflow-hidden" data-testid="promo-video-full-2">
                  <video 
                    src={promoVideoFull2} 
                    controls 
                    className="w-full h-auto rounded-t-lg"
                  />
                  <div className="p-4">
                    <h4 className="font-medium text-sm mb-2">Parte 2: Dueño + Delivery</h4>
                    <p className="text-xs text-gray-500 mb-3">Confirma pedido, delivery recibe (8s)</p>
                    <a 
                      href={promoVideoFull2} 
                      download="delywa-dueno-delivery.mp4"
                      className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                      data-testid="download-video-full-2"
                    >
                      <Download size={14} />
                      Descargar
                    </a>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg overflow-hidden" data-testid="promo-video-full-3">
                  <video 
                    src={promoVideoFull3} 
                    controls 
                    className="w-full h-auto rounded-t-lg"
                  />
                  <div className="p-4">
                    <h4 className="font-medium text-sm mb-2">Parte 3: Entrega + Logo</h4>
                    <p className="text-xs text-gray-500 mb-3">Delivery entrega, cierre con logo (8s)</p>
                    <a 
                      href={promoVideoFull3} 
                      download="delywa-entrega-logo.mp4"
                      className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                      data-testid="download-video-full-3"
                    >
                      <Download size={14} />
                      Descargar
                    </a>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Une los 3 videos del set completo para crear tu promocional de 24 segundos.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}
