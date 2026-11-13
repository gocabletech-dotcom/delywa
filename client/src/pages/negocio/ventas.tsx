import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  CheckCircle2,
  XCircle,
  Calendar,
  BarChart3,
  RefreshCw,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";

export default function VentasPage() {
  const [location] = useLocation();
  const soloReportes = location === "/negocio/reportes";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated, logout } = useAuth();

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
  const puedeReporteConsolidado = roleData?.role === "colmado_owner" || roleData?.role === "admin_pedidos";

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

  type VentaDia = { fecha: string; totalVentas: string; pedidosEntregados: number; pedidosCancelados: number };

  const { data: historialVentas, isLoading } = useQuery<VentaDia[]>({
    queryKey: ["ventas-historial", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/ventas?limit=30`);
      if (!res.ok) throw new Error("Error al cargar historial de ventas");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  type ReporteSucursal = { sucursalId: number; sucursal: string; totalVentas: string; pedidosEntregados: number; pedidosCancelados: number };
  const { data: reporteConsolidado } = useQuery<{ reportes: ReporteSucursal[] }>({
    queryKey: ["reporte-consolidado"],
    queryFn: async () => {
      const res = await fetch("/api/negocio/reportes");
      if (!res.ok) throw new Error("Error al cargar reporte consolidado");
      return res.json();
    },
    enabled: isAuthenticated && puedeReporteConsolidado,
  });

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    estado: string;
    tipoNegocio: string;
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

  const totalDelMes = historialVentas?.reduce((acc, v) => acc + parseFloat(v.totalVentas || "0"), 0) || 0;
  const totalEntregadosMes = historialVentas?.reduce((acc, v) => acc + (v.pedidosEntregados || 0), 0) || 0;
  const totalCanceladosMes = historialVentas?.reduce((acc, v) => acc + (v.pedidosCancelados || 0), 0) || 0;

  const moneda = colmadoData?.simboloMoneda || "RD$";

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
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    );
  }

  const headerRight = (
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
  );

  return (
    <NegocioLayout title={soloReportes ? "Reportes" : "Ventas y Cuadre"} activeNav={soloReportes ? "reportes" : "ventas"} headerRight={headerRight}>
      <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
        {/* Ventas de Hoy */}
        {!soloReportes && <Card className="border-none shadow-sm mb-4 sm:mb-6 bg-gradient-to-br from-primary to-green-600 text-white">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
              <div>
                <p className="text-green-100 mb-1 text-sm sm:text-base">Ventas de Hoy</p>
                <p className="text-2xl sm:text-4xl font-bold font-heading">
                  {moneda}{parseFloat(ventasHoy?.totalVentas || 0).toLocaleString()}
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
                <Badge variant="outline" className={`text-white border-white/50 ${ventasHoy?.cuadrado ? "bg-white/20" : ""}`}>
                  {ventasHoy?.cuadrado ? "✓ Caja Cuadrada" : "Pendiente de Cuadrar"}
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
        </Card>}

        {/* Resumen del Mes */}
        {!soloReportes && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <Card className="border-none shadow-sm" data-testid="stat-total-mes">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <BarChart3 size={18} />
                </div>
                <span className="text-gray-500 text-sm sm:text-base">Total del Mes</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading">{moneda}{totalDelMes.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm" data-testid="stat-entregados-mes">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} />
                </div>
                <span className="text-gray-500 text-sm sm:text-base">Entregados</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading">{totalEntregadosMes} pedidos</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm" data-testid="stat-cancelados-mes">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <XCircle size={18} />
                </div>
                <span className="text-gray-500 text-sm sm:text-base">Cancelados</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold font-heading">{totalCanceladosMes} pedidos</p>
            </CardContent>
          </Card>
        </div>}

        {puedeReporteConsolidado && (
          <Card className="border-none shadow-sm mb-4 sm:mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-heading flex items-center gap-2">
                <BarChart3 size={20} /> Reporte consolidado por sucursal
              </CardTitle>
              <p className="text-sm text-gray-500">Este resumen es de consulta. Selecciona una sucursal para realizar acciones operativas.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b">
                    <th className="text-left py-2 px-2 text-sm font-medium text-gray-500">Sucursal</th>
                    <th className="text-right py-2 px-2 text-sm font-medium text-gray-500">Ventas</th>
                    <th className="text-center py-2 px-2 text-sm font-medium text-gray-500">Entregados</th>
                    <th className="text-center py-2 px-2 text-sm font-medium text-gray-500">Cancelados</th>
                  </tr></thead>
                  <tbody>{reporteConsolidado?.reportes.map((reporte) => (
                    <tr key={reporte.sucursalId} className="border-b">
                      <td className="py-2 px-2 font-medium">{reporte.sucursal}</td>
                      <td className="py-2 px-2 text-right font-bold text-primary">{moneda}{parseFloat(reporte.totalVentas || "0").toLocaleString()}</td>
                      <td className="py-2 px-2 text-center">{reporte.pedidosEntregados}</td>
                      <td className="py-2 px-2 text-center">{reporte.pedidosCancelados}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historial de Ventas */}
        {!soloReportes && <Card className="border-none shadow-sm">
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
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-500">Fecha</th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-500">Total</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-500">Entregados</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-500 hidden sm:table-cell">Cancelados</th>
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-500 hidden sm:table-cell">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialVentas.map((venta, index) => (
                      <tr key={venta.fecha || index} className="border-b hover:bg-gray-50" data-testid={`venta-row-${index}`}>
                        <td className="py-2 sm:py-3 px-2 sm:px-4">
                          <span className="font-medium text-xs sm:text-sm">
                            {new Date(venta.fecha + "T12:00:00").toLocaleDateString("es-DO", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-right font-bold text-primary text-xs sm:text-sm">
                          {moneda}{parseFloat(venta.totalVentas || "0").toLocaleString()}
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center">
                          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 text-xs">
                            {venta.pedidosEntregados || 0}
                          </Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center hidden sm:table-cell">
                          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">
                            {venta.pedidosCancelados || 0}
                          </Badge>
                        </td>
                        <td className="py-2 sm:py-3 px-2 sm:px-4 text-center hidden sm:table-cell">
                          <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
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
        </Card>}
      </main>
    </NegocioLayout>
  );
}
