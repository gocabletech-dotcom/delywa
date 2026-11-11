import { useState, useEffect } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  MessageCircle,
  Truck,
  Package,
  DollarSign,
  TrendingUp,
  Menu,
  X,
  CheckCircle2,
  XCircle,
  Calendar,
  BarChart3,
  Settings,
  Users,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function VentasPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated } = useAuth();

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
      if (!res.ok) throw new Error("Error al cargar ventas de hoy");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: historialVentas, isLoading } = useQuery({
    queryKey: ["ventas-historial", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/ventas?limit=30`);
      if (!res.ok) throw new Error("Error al cargar historial de ventas");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: suscripcionData } = useQuery<{
    plan: { nombre: string };
  }>({
    queryKey: ["suscripcion", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/suscripcion`);
      if (!res.ok) throw new Error("Error al cargar suscripción");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const cuadrarCajaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/ventas/cuadrar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventas-hoy"] });
      queryClient.invalidateQueries({ queryKey: ["ventas-historial"] });
      toast({ title: "Caja cuadrada exitosamente" });
    },
  });

  const totalDelMes = historialVentas?.reduce((acc: number, v: any) => acc + parseFloat(v.totalVentas || 0), 0) || 0;
  const totalEntregadosMes = historialVentas?.reduce((acc: number, v: any) => acc + (v.pedidosEntregados || 0), 0) || 0;
  const totalCanceladosMes = historialVentas?.reduce((acc: number, v: any) => acc + (v.pedidosCancelados || 0), 0) || 0;

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
            <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <TrendingUp size={20} />
              Dashboard
            </Link>
            <Link href="/admin/conversaciones" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <MessageCircle size={20} />
              Conversaciones
            </Link>
            <Link href="/admin/clientes" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <Users size={20} />
              Clientes
            </Link>
            <Link href="/admin/pedidos" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <Package size={20} />
              Pedidos
            </Link>
            <Link href="/admin/deliveries" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <Truck size={20} />
              Deliveries
            </Link>
            <Link href="/admin/ventas" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium">
              <DollarSign size={20} />
              Ventas
            </Link>
            <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <Settings size={20} />
              Configuración
            </Link>
            <Link href="/admin/manual" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
              <BookOpen size={20} />
              Manual de Usuario
            </Link>
          </nav>

          <div className="p-4 border-t">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{colmadoData?.nombre || "Mi Negocio"}</p>
                <p className="text-xs text-gray-500">{suscripcionData?.plan?.nombre || "Sin Plan"}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white border-b px-4 lg:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div>
              <h1 className="text-xl font-bold font-heading">Ventas y Cuadre</h1>
              <p className="text-sm text-gray-500">{currentDateTime}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
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

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {/* Ventas de Hoy */}
          <Card className="border-none shadow-sm mb-6 bg-gradient-to-br from-primary to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <p className="text-green-100 mb-1">Ventas de Hoy</p>
                  <p className="text-4xl font-bold font-heading">
                    RD${parseFloat(ventasHoy?.totalVentas || 0).toLocaleString()}
                  </p>
                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={16} /> {ventasHoy?.pedidosEntregados || 0} entregados
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle size={16} /> {ventasHoy?.pedidosCancelados || 0} cancelados
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline" className={`text-white border-white/50 ${ventasHoy?.cuadrado ? 'bg-white/20' : ''}`}>
                    {ventasHoy?.cuadrado ? '✓ Caja Cuadrada' : 'Pendiente de Cuadrar'}
                  </Badge>
                  {!ventasHoy?.cuadrado && (
                    <Button 
                      variant="secondary" 
                      className="bg-white text-primary hover:bg-green-50"
                      onClick={() => cuadrarCajaMutation.mutate()}
                      disabled={cuadrarCajaMutation.isPending}
                      data-testid="cuadrar-caja-btn"
                    >
                      <CheckCircle2 size={16} className="mr-1" />
                      {cuadrarCajaMutation.isPending ? "Cuadrando..." : "Cuadrar Caja"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen del Mes */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <Card className="border-none shadow-sm" data-testid="stat-total-mes">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <BarChart3 size={20} />
                  </div>
                  <span className="text-gray-500">Total del Mes</span>
                </div>
                <p className="text-2xl font-bold font-heading">RD${totalDelMes.toLocaleString()}</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm" data-testid="stat-entregados-mes">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                    <CheckCircle2 size={20} />
                  </div>
                  <span className="text-gray-500">Entregados</span>
                </div>
                <p className="text-2xl font-bold font-heading">{totalEntregadosMes} pedidos</p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm" data-testid="stat-cancelados-mes">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                    <XCircle size={20} />
                  </div>
                  <span className="text-gray-500">Cancelados</span>
                </div>
                <p className="text-2xl font-bold font-heading">{totalCanceladosMes} pedidos</p>
              </CardContent>
            </Card>
          </div>

          {/* Historial de Ventas */}
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-heading flex items-center gap-2">
                <Calendar size={20} /> Historial de Ventas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : !historialVentas || historialVentas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 size={40} className="mx-auto mb-2 opacity-50" />
                  <p>No hay historial de ventas aún</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Fecha</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Total Ventas</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Entregados</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Cancelados</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialVentas.map((venta: any, index: number) => (
                        <tr key={venta.fecha || index} className="border-b hover:bg-gray-50" data-testid={`venta-row-${index}`}>
                          <td className="py-3 px-4">
                            <span className="font-medium">
                              {new Date(venta.fecha + 'T12:00:00').toLocaleDateString('es-DO', { 
                                weekday: 'short', 
                                day: 'numeric', 
                                month: 'short' 
                              })}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-primary">
                            RD${parseFloat(venta.totalVentas || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
                              {venta.pedidosEntregados || 0}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                              {venta.pedidosCancelados || 0}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="text-blue-600 border-blue-300">
                              Calculado
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
