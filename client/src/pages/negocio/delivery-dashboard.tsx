import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  MessageCircle,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  PackageCheck,
  Navigation,
  Phone,
  DollarSign,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { buildMapUrl } from "@/lib/mapUtils";

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

export default function DeliveryDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: roleData } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const res = await fetch("/api/user/role");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const deliveryId = roleData?.deliveryId;

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ["delivery-pedidos", deliveryId],
    queryFn: async () => {
      const res = await fetch(`/api/deliveries/${deliveryId}/pedidos`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      return res.json();
    },
    enabled: !!deliveryId,
    refetchInterval: 10000,
  });

  const colmadoId = (pedidos as any[])?.[0]?.colmadoId;
  const { data: colmadoData } = useQuery<{ simboloMoneda?: string }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!colmadoId,
  });
  const moneda = colmadoData?.simboloMoneda || "RD$";

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      const res = await fetch(`/api/pedidos/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-pedidos"] });
      toast({ title: "Pedido actualizado" });
    },
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  const pedidosEnCamino = pedidos?.filter((p: any) => p.estado === "en_camino") || [];
  const pedidosListos = pedidos?.filter((p: any) => p.estado === "listo") || [];
  const pedidosPendientes = pedidos?.filter((p: any) => p.estado === "pendiente") || [];
  const pedidosEntregados = pedidos?.filter((p: any) => p.estado === "entregado") || [];

  if (authLoading || !roleData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">
              <MessageCircle size={20} fill="currentColor" />
            </div>
            <div>
              <h1 className="font-bold font-heading text-white">DelyWa</h1>
              <p className="text-xs text-white/70">Panel de Delivery</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10" onClick={() => logout()} data-testid="logout-btn">
            <LogOut size={18} />
          </Button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-none shadow-sm" data-testid="stat-en-camino">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{pedidosEnCamino.length}</p>
              <p className="text-xs text-gray-500">En Camino</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm" data-testid="stat-pendientes">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{pedidosListos.length}</p>
              <p className="text-xs text-gray-500">Listos</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm" data-testid="stat-entregados">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{pedidosEntregados.length}</p>
              <p className="text-xs text-gray-500">Entregados</p>
            </CardContent>
          </Card>
        </div>

        {pedidosListos.length > 0 && (
          <div>
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <PackageCheck size={18} className="text-purple-600" /> Pedidos listos para iniciar
            </h2>
            <div className="space-y-3">
              {pedidosListos.map((pedido: any) => (
                <Card key={pedido.id} className="border-l-4 border-l-purple-500 shadow-sm" data-testid={`pedido-listo-${pedido.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold">{pedido.clienteNombre}</h3>
                        {buildMapUrl(pedido.clienteUbicacion) && (
                          <a href={buildMapUrl(pedido.clienteUbicacion)} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-500 flex items-center gap-1 font-medium">
                            <MapPin size={14} /> Ver mapa
                          </a>
                        )}
                      </div>
                      <Badge className="bg-purple-500">Listo</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{formatProductos(pedido.productos)}</p>
                    <p className="font-bold text-primary mt-2">{moneda}{parseFloat(pedido.total).toLocaleString()}</p>
                    <Button className="w-full mt-3 bg-blue-600" size="sm" onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "en_camino" })} disabled={updateEstadoMutation.isPending} data-testid={`iniciar-entrega-${pedido.id}`}>
                      <Navigation size={15} className="mr-1" /> Iniciar entrega
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {pedidosEnCamino.length > 0 && (
          <div>
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Navigation size={18} className="text-blue-600" /> Entregas Activas
            </h2>
            <div className="space-y-3">
              {pedidosEnCamino.map((pedido: any) => (
                <Card key={pedido.id} className="border-l-4 border-l-blue-500 shadow-sm" data-testid={`pedido-activo-${pedido.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold">{pedido.clienteNombre}</h3>
                        {buildMapUrl(pedido.clienteUbicacion) && (
                          <a
                            href={buildMapUrl(pedido.clienteUbicacion)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1 font-medium"
                            data-testid={`ubicacion-link-${pedido.id}`}
                          >
                            <MapPin size={14} /> Ver mapa
                          </a>
                        )}
                      </div>
                      <Badge className="bg-blue-500">En Camino</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{formatProductos(pedido.productos)}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-primary">{moneda}{parseFloat(pedido.total).toLocaleString()}</p>
                        {pedido.necesitaDevuelta && (
                          <p className="text-xs text-orange-600">
                            Devuelta: {moneda}{(parseFloat(pedido.montoPago) - parseFloat(pedido.total)).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <a href={`tel:${pedido.clienteWhatsapp}`}>
                          <Button size="sm" variant="outline">
                            <Phone size={14} />
                          </Button>
                        </a>
                        <Button 
                          size="sm" 
                          className="bg-green-600"
                          onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "entregado" })}
                          data-testid={`entregar-${pedido.id}`}
                        >
                          <CheckCircle2 size={14} className="mr-1" /> Entregado
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {pedidosPendientes.length > 0 && (
          <div>
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Clock size={18} className="text-orange-600" /> Próximas Entregas
            </h2>
            <div className="space-y-3">
              {pedidosPendientes.map((pedido: any) => (
                <Card key={pedido.id} className="border-l-4 border-l-orange-400 shadow-sm" data-testid={`pedido-pendiente-${pedido.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold">{pedido.clienteNombre}</h3>
                        {buildMapUrl(pedido.clienteUbicacion) && (
                          <a
                            href={buildMapUrl(pedido.clienteUbicacion)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1 font-medium"
                            data-testid={`ubicacion-link-pendiente-${pedido.id}`}
                          >
                            <MapPin size={14} /> Ver mapa
                          </a>
                        )}
                      </div>
                      <Badge variant="outline" className="border-orange-300 text-orange-600">Pendiente</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{formatProductos(pedido.productos)}</p>
                    <p className="font-bold text-primary mt-2">{moneda}{parseFloat(pedido.total).toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        )}

        {!isLoading && (!pedidos || pedidos.length === 0) && (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No tienes pedidos asignados</p>
          </div>
        )}
      </main>
    </div>
  );
}
