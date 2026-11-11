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
  Plus,
  Menu,
  X,
  Phone,
  User,
  Users,
  MapPin,
  CheckCircle2,
  XCircle,
  Settings,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function DeliveriesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());
  const [nuevoDelivery, setNuevoDelivery] = useState({ nombre: "", whatsappNumero: "" });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
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

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["deliveries", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/deliveries`);
      if (!res.ok) throw new Error("Error al cargar deliveries");
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

  const createDeliveryMutation = useMutation({
    mutationFn: async (data: { nombre: string; whatsappNumero: string; colmadoId: number }) => {
      const res = await fetch(`/api/colmados/${data.colmadoId}/deliveries/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: data.nombre, whatsappNumero: data.whatsappNumero }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear delivery");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      setNuevoDelivery({ nombre: "", whatsappNumero: "" });
      setDialogOpen(false);
      toast({ title: "Delivery y usuario creados exitosamente", description: "El delivery puede iniciar sesión con su número de WhatsApp" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      const res = await fetch(`/api/deliveries/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar estado");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoDelivery.nombre || !nuevoDelivery.whatsappNumero) {
      toast({ title: "Error", description: "Completa todos los campos", variant: "destructive" });
      return;
    }
    createDeliveryMutation.mutate({
      ...nuevoDelivery,
      colmadoId,
    });
  };

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
            <Link href="/admin/deliveries" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium">
              <Truck size={20} />
              Deliveries
            </Link>
            <Link href="/admin/ventas" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
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
              <h1 className="text-xl font-bold font-heading">Equipo de Delivery</h1>
              <p className="text-sm text-gray-500">{currentDateTime}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.location.reload()}
              title="Refrescar"
              data-testid="button-refresh"
            >
              <RefreshCw size={20} />
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary" data-testid="agregar-delivery-btn">
                  <Plus size={16} className="mr-1" /> Agregar Delivery
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar Nuevo Delivery</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre Completo</Label>
                  <Input
                    id="nombre"
                    placeholder="Ej: Juan Pérez"
                    value={nuevoDelivery.nombre}
                    onChange={(e) => setNuevoDelivery({ ...nuevoDelivery, nombre: e.target.value.toLowerCase() })}
                    data-testid="input-nombre-delivery"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">Número de WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    placeholder="Ej: 8091234567"
                    value={nuevoDelivery.whatsappNumero}
                    onChange={(e) => setNuevoDelivery({ ...nuevoDelivery, whatsappNumero: e.target.value })}
                    data-testid="input-whatsapp-delivery"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-4">
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button type="submit" className="bg-primary" disabled={createDeliveryMutation.isPending} data-testid="submit-delivery">
                    {createDeliveryMutation.isPending ? "Guardando..." : "Agregar Delivery"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : !deliveries || deliveries.length === 0 ? (
            <div className="text-center py-16">
              <Truck size={60} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No hay deliveries registrados</h3>
              <p className="text-gray-500 mb-4">Agrega deliveries por número de teléfono para empezar</p>
              <Button className="bg-primary" onClick={() => setDialogOpen(true)}>
                <Plus size={16} className="mr-1" /> Agregar Primer Delivery
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {deliveries.map((delivery: any) => (
                <Card key={delivery.id} className="border-none shadow-sm" data-testid={`delivery-card-${delivery.id}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                        delivery.estado === 'activo' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <Truck size={28} />
                      </div>
                      <Badge variant={delivery.estado === 'activo' ? 'default' : 'secondary'} className={delivery.estado === 'activo' ? 'bg-green-500' : ''}>
                        {delivery.estado === 'activo' ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>

                    <h3 className="font-bold text-lg mb-1">{delivery.nombre}</h3>
                    <p className="text-gray-500 flex items-center gap-2 mb-4">
                      <Phone size={14} /> {delivery.whatsappNumero}
                    </p>
                    
                    <p className="text-xs text-gray-400 mb-4">
                      Registrado: {new Date(delivery.fechaRegistro).toLocaleDateString()}
                    </p>

                    <div className="flex gap-2">
                      {delivery.estado === 'activo' ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => updateEstadoMutation.mutate({ id: delivery.id, estado: 'inactivo' })}
                          data-testid={`desactivar-delivery-${delivery.id}`}
                        >
                          <XCircle size={14} className="mr-1" /> Desactivar
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => updateEstadoMutation.mutate({ id: delivery.id, estado: 'activo' })}
                          data-testid={`activar-delivery-${delivery.id}`}
                        >
                          <CheckCircle2 size={14} className="mr-1" /> Activar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}
