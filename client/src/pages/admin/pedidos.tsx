import { useState, useEffect } from "react";
import { formatDominicanDateTime } from "@/lib/date-utils";
import { printOrderTicket, generateOrderPdf } from "@/services/PrinterService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  MessageCircle,
  Truck,
  Package,
  DollarSign,
  TrendingUp,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Menu,
  X,
  ChevronLeft,
  User,
  Phone,
  Settings,
  Send,
  RefreshCw,
  Edit,
  ArrowRight,
  BookOpen,
  Printer,
  FileDown,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const formatProductos = (productosStr: string, sustituciones?: Array<{ original: string; nuevo: string }>): string => {
  try {
    const productos = JSON.parse(productosStr);
    if (Array.isArray(productos)) {
      return productos.map((p: any) => {
        let texto = p.nombre;
        if (p.monto) texto += ` (RD$${p.monto})`;
        else if (p.cantidad) texto = `${p.cantidad}x ${p.nombre}`;
        else if (p.precio) texto = `${p.cantidad || 1}x ${p.nombre} (RD$${p.precio})`;
        return texto;
      }).join(", ");
    }
    return productosStr;
  } catch {
    return productosStr;
  }
};

const formatProductosConSustituciones = (productosStr: string, sustituciones?: Array<{ original: string; nuevo: string }>): React.ReactNode[] => {
  try {
    const productos = JSON.parse(productosStr);
    if (!Array.isArray(productos)) return [productosStr];
    
    return productos.map((p: any, idx: number) => {
      let texto = p.nombre;
      if (p.monto) texto += ` (RD$${p.monto})`;
      else if (p.cantidad && p.precio) texto = `${p.cantidad}x ${p.nombre} (RD$${p.precio})`;
      else if (p.cantidad) texto = `${p.cantidad}x ${p.nombre}`;
      
      const sustitucion = sustituciones?.find(s => 
        s.original.toLowerCase().includes(p.nombre.toLowerCase()) || 
        p.nombre.toLowerCase().includes(s.original.toLowerCase())
      );
      
      if (sustitucion) {
        return (
          <span key={idx} className="block">
            <span className="line-through text-gray-400">{texto}</span>
            <span className="text-green-600 ml-2">→ {sustitucion.nuevo}</span>
          </span>
        );
      }
      
      return <span key={idx} className="block">{texto}</span>;
    });
  } catch {
    return [productosStr];
  }
};

export default function PedidosPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<any>(null);
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

  const { data: pedidos, isLoading } = useQuery({
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

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    direccion: string;
    whatsappNumero: string;
    telefonoAlternativo: string | null;
    impuesto: string;
    costoDelivery: string;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const handlePrint = (pedido: any) => {
    if (!colmadoData) return;
    printOrderTicket(pedido, colmadoData, toast);
  };

  const handleDownloadPdf = (pedido: any) => {
    if (!colmadoData) return;
    generateOrderPdf(pedido, colmadoData, toast);
  };

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

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: number; estado: string }) => {
      const res = await fetch(`/api/pedidos/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["ventas-hoy"] });
      toast({ title: "Estado actualizado" });
    },
  });

  const asignarDeliveryMutation = useMutation({
    mutationFn: async ({ pedidoId, deliveryId }: { pedidoId: number; deliveryId: number }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/asignar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Delivery asignado" });
    },
  });

  const reenviarDeliveryMutation = useMutation({
    mutationFn: async (pedidoId: number) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/reenviar-delivery`, {
        method: "POST",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al reenviar");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      // Sin WhatsApp integrado, se abre WhatsApp con el mensaje listo para el repartidor.
      if (data?.necesitaEnvioManual && data.enlaceWhatsApp) {
        window.open(data.enlaceWhatsApp, "_blank", "noopener");
        toast({ title: "Abre WhatsApp para enviar el pedido al delivery" });
        return;
      }
      toast({ title: "Pedido reenviado al delivery" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const pedidosFiltrados = pedidos?.filter((p: any) => 
    filtroEstado === "todos" || p.estado === filtroEstado
  ) || [];

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pedidoParaConfirmar, setPedidoParaConfirmar] = useState<any>(null);
  const [totalConfirmado, setTotalConfirmado] = useState("");
  const [sustituciones, setSustituciones] = useState<Array<{ original: string; nuevo: string }>>([]);
  const [envioManualData, setEnvioManualData] = useState<{ whatsappNumero: string; mensaje: string } | null>(null);

  const confirmarPedidoMutation = useMutation({
    mutationFn: async ({ pedidoId, total, sustituciones }: { pedidoId: number; total: string; sustituciones: Array<{ original: string; nuevo: string }> }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalConfirmado: total, sustituciones }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al confirmar pedido");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      
      if (data.necesitaEnvioManual && data.whatsappNumero && data.mensajeParaEnviar) {
        setEnvioManualData({
          whatsappNumero: data.whatsappNumero,
          mensaje: data.mensajeParaEnviar,
        });
        toast({ title: "Pedido confirmado. Envía la confirmación por WhatsApp." });
      } else {
        setConfirmOpen(false);
        setPedidoParaConfirmar(null);
        setTotalConfirmado("");
        setSustituciones([]);
        setEnvioManualData(null);
        toast({ title: "Pedido confirmado y enviado al cliente" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const abrirWhatsApp = () => {
    if (!envioManualData) return;
    const numero = envioManualData.whatsappNumero.replace(/\+/g, "");
    const mensaje = encodeURIComponent(envioManualData.mensaje);
    window.open(`https://wa.me/${numero}?text=${mensaje}`, "_blank");
    setConfirmOpen(false);
    setPedidoParaConfirmar(null);
    setTotalConfirmado("");
    setSustituciones([]);
    setEnvioManualData(null);
  };

  const openConfirmModal = (pedido: any) => {
    setPedidoParaConfirmar(pedido);
    setTotalConfirmado("");
    setSustituciones([]);
    setConfirmOpen(true);
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case "pendiente_confirmacion": return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "esperando_confirmacion_sustituciones": return "bg-amber-100 text-amber-700 border-amber-300";
      case "esperando_pago": return "bg-purple-100 text-purple-600 border-purple-300";
      case "pendiente": return "bg-orange-100 text-orange-600 border-orange-300";
      case "en_preparacion": return "bg-blue-100 text-blue-600 border-blue-300";
      case "listo": return "bg-purple-100 text-purple-600 border-purple-300";
      case "en_camino": return "bg-blue-100 text-blue-600 border-blue-300";
      case "entregado": return "bg-green-100 text-green-600 border-green-300";
      case "cancelado": return "bg-red-100 text-red-600 border-red-300";
      case "retorno": return "bg-gray-100 text-gray-600 border-gray-300";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case "pendiente_confirmacion": return "Por Confirmar";
      case "esperando_confirmacion_sustituciones": return "Confirmando Cambios";
      case "esperando_pago": return "Esperando Pago";
      case "pendiente": return "Pendiente";
      case "en_preparacion": return "En Preparación";
      case "listo": return "Listo";
      case "en_camino": return "En Camino";
      case "entregado": return "Entregado";
      case "cancelado": return "Cancelado";
      case "retorno": return "Retorno";
      default: return estado;
    }
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
              <User size={20} />
              Clientes
            </Link>
            <Link href="/admin/pedidos" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium">
              <Package size={20} />
              Pedidos
            </Link>
            <Link href="/admin/deliveries" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
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
              <h1 className="text-xl font-bold font-heading">Pedidos</h1>
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
          </div>
        </header>

        {/* Status Filter Chips */}
        <div className="bg-white border-b px-2 sm:px-4 lg:px-6 py-2 sm:py-3 sticky top-0 z-10">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {[
              { value: "todos", label: "Todos", color: "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200" },
              { value: "pendiente_confirmacion", label: "Por Confirmar", color: "bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200" },
              { value: "esperando_pago", label: "Esp. Pago", color: "bg-purple-100 text-purple-600 border-purple-300 hover:bg-purple-200" },
              { value: "pendiente", label: "Pendiente", color: "bg-orange-100 text-orange-600 border-orange-300 hover:bg-orange-200" },
              { value: "en_camino", label: "En Camino", color: "bg-blue-100 text-blue-600 border-blue-300 hover:bg-blue-200" },
              { value: "entregado", label: "Entregado", color: "bg-green-100 text-green-600 border-green-300 hover:bg-green-200" },
              { value: "cancelado", label: "Cancelado", color: "bg-red-100 text-red-600 border-red-300 hover:bg-red-200" },
              { value: "retorno", label: "Retorno", color: "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200" },
            ].map((status) => (
              <button
                key={status.value}
                onClick={() => setFiltroEstado(status.value)}
                data-testid={`filter-chip-${status.value}`}
                className={`
                  px-2 py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-2 rounded-full text-[10px] sm:text-xs lg:text-sm font-medium border transition-all duration-200
                  ${filtroEstado === status.value 
                    ? `${status.color} ring-2 ring-offset-1 ring-primary/50 shadow-md border-2` 
                    : `${status.color} opacity-70 hover:opacity-100`
                  }
                `}
              >
                {status.label}
                <span className="ml-0.5 sm:ml-1 opacity-75">
                  ({status.value === "todos" 
                    ? pedidos?.length || 0 
                    : pedidos?.filter((p: any) => p.estado === status.value).length || 0
                  })
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="text-center py-16">
              <Package size={60} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No hay pedidos</h3>
              <p className="text-gray-500">Los pedidos aparecerán aquí cuando los clientes ordenen por WhatsApp</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {pedidosFiltrados.map((pedido: any) => (
                <Card key={pedido.id} className="border-none shadow-sm hover:shadow-md transition-shadow" data-testid={`pedido-card-${pedido.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${getEstadoColor(pedido.estado)}`}>
                          <Package size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold">{pedido.clienteNombre}</h3>
                            <Badge variant="outline" className={getEstadoColor(pedido.estado)}>
                              {getEstadoLabel(pedido.estado)}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            {pedido.sustituciones && pedido.sustituciones.length > 0 
                              ? formatProductosConSustituciones(pedido.productos, pedido.sustituciones)
                              : formatProductos(pedido.productos)}
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Phone size={12} /> {pedido.clienteWhatsapp}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin size={12} /> {pedido.clienteUbicacion}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {new Date(pedido.fechaCreacion).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col lg:items-end gap-3">
                        <div className="text-right">
                          <p className="text-xl font-bold text-primary">RD${parseFloat(pedido.total).toLocaleString()}</p>
                          <p className="text-sm text-gray-500">
                            Paga con: RD${parseFloat(pedido.montoPago).toLocaleString()}
                            {pedido.necesitaDevuelta && (
                              <span className="text-orange-600 ml-1">(Devuelta: RD${(parseFloat(pedido.montoPago) - parseFloat(pedido.total)).toLocaleString()})</span>
                            )}
                          </p>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                          {pedido.estado === "pendiente_confirmacion" && (
                            <>
                              <Button 
                                size="sm" 
                                className="bg-yellow-500 hover:bg-yellow-600"
                                onClick={() => openConfirmModal(pedido)}
                                data-testid={`confirmar-pedido-${pedido.id}`}
                              >
                                <Edit size={14} className="mr-1" /> Confirmar Pedido
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "cancelado" })}
                                data-testid={`cancelar-pedido-${pedido.id}`}
                              >
                                <XCircle size={14} className="mr-1" /> Cancelar
                              </Button>
                            </>
                          )}
                          {pedido.estado === "esperando_pago" && (
                            <Badge className="bg-purple-100 text-purple-700 text-xs">
                              Esperando respuesta del cliente
                            </Badge>
                          )}
                          {pedido.estado === "pendiente" && (
                            <>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline" data-testid={`asignar-delivery-${pedido.id}`}>
                                    <Truck size={14} className="mr-1" /> Asignar
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Asignar Delivery</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3 mt-4">
                                    {deliveries?.filter((d: any) => d.estado === "activo").map((delivery: any) => (
                                      <button
                                        key={delivery.id}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                                        onClick={() => {
                                          asignarDeliveryMutation.mutate({ pedidoId: pedido.id, deliveryId: delivery.id });
                                          updateEstadoMutation.mutate({ id: pedido.id, estado: "en_camino" });
                                        }}
                                        data-testid={`select-delivery-${delivery.id}`}
                                      >
                                        <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                          <Truck size={18} />
                                        </div>
                                        <div className="text-left">
                                          <p className="font-medium">{delivery.nombre}</p>
                                          <p className="text-sm text-gray-500">{delivery.whatsappNumero}</p>
                                        </div>
                                      </button>
                                    ))}
                                    {(!deliveries || deliveries.filter((d: any) => d.estado === "activo").length === 0) && (
                                      <p className="text-center text-gray-500 py-4">No hay deliveries activos</p>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "cancelado" })}
                                data-testid={`cancelar-pedido-${pedido.id}`}
                              >
                                <XCircle size={14} className="mr-1" /> Cancelar
                              </Button>
                            </>
                          )}
                          {pedido.estado === "en_camino" && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => reenviarDeliveryMutation.mutate(pedido.id)}
                                disabled={reenviarDeliveryMutation.isPending}
                                data-testid={`reenviar-pedido-${pedido.id}`}
                              >
                                <Send size={14} className="mr-1" /> Reenviar
                              </Button>
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "entregado" })}
                                data-testid={`entregar-pedido-${pedido.id}`}
                              >
                                <CheckCircle2 size={14} className="mr-1" /> Marcar Entregado
                              </Button>
                            </>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePrint(pedido)}
                            data-testid={`imprimir-pedido-${pedido.id}`}
                          >
                            <Printer size={14} className="mr-1" /> Imprimir
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleDownloadPdf(pedido)}
                            data-testid={`pdf-pedido-${pedido.id}`}
                          >
                            <FileDown size={14} className="mr-1" /> PDF
                          </Button>
                        </div>
                      </div>
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

      {/* Confirmation Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar Pedido #{pedidoParaConfirmar?.id}</DialogTitle>
          </DialogHeader>
          
          {pedidoParaConfirmar && (
            <div className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium mb-1">Cliente</h4>
                <p className="text-gray-700">{pedidoParaConfirmar.clienteNombre}</p>
                <p className="text-sm text-gray-500">{pedidoParaConfirmar.clienteUbicacion}</p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Productos (haz clic para sustituir)</h4>
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  {(() => {
                    try {
                      const productos = JSON.parse(pedidoParaConfirmar.productos);
                      if (!Array.isArray(productos)) return <p className="text-sm text-gray-500">Sin productos</p>;
                      
                      return productos.map((p: any, idx: number) => {
                        const productoNombre = p.nombre || p.name || "Producto";
                        const productoTexto = p.monto 
                          ? `${productoNombre} (RD$${p.monto})` 
                          : p.cantidad 
                            ? `${p.cantidad}x ${productoNombre}` 
                            : productoNombre;
                        
                        const sustitucion = sustituciones.find(s => s.original === productoNombre);
                        
                        return (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            {sustitucion ? (
                              <>
                                <span className="line-through text-gray-400 flex-shrink-0">{productoTexto}</span>
                                <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
                                <Input
                                  value={sustitucion.nuevo}
                                  onChange={(e) => {
                                    const newSubs = sustituciones.map(s => 
                                      s.original === productoNombre ? { ...s, nuevo: e.target.value } : s
                                    );
                                    setSustituciones(newSubs);
                                  }}
                                  placeholder="Producto nuevo"
                                  className="h-8 text-sm flex-1 border-green-300 focus:border-green-500"
                                  autoFocus
                                />
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => setSustituciones(sustituciones.filter(s => s.original !== productoNombre))}
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                >
                                  <X size={14} />
                                </Button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="flex items-center gap-2 w-full text-left hover:bg-gray-100 rounded px-2 py-1 -mx-2 transition-colors group"
                                onClick={() => setSustituciones([...sustituciones, { original: productoNombre, nuevo: "" }])}
                              >
                                <span className="flex-1">{productoTexto}</span>
                                <Edit size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            )}
                          </div>
                        );
                      });
                    } catch {
                      return <p className="text-sm text-gray-500">{pedidoParaConfirmar.productos}</p>;
                    }
                  })()}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Haz clic en un producto para sustituirlo por otro
                </p>
              </div>

              <div>
                <Label htmlFor="totalConfirmado" className="font-medium">Total del Pedido (RD$) *</Label>
                <Input
                  id="totalConfirmado"
                  type="number"
                  placeholder="Ej: 350"
                  value={totalConfirmado}
                  onChange={(e) => setTotalConfirmado(e.target.value)}
                  className="mt-1"
                  data-testid="input-total-confirmado"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ingresa el total de los productos (sin incluir delivery)
                </p>
              </div>

              {envioManualData ? (
                <div className="space-y-3 pt-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-800 font-medium mb-2">
                      Pedido confirmado. Elige cómo enviar al cliente:
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={abrirWhatsApp}
                      data-testid="button-enviar-whatsapp"
                    >
                      <ExternalLink size={14} className="mr-1" />
                      Enviar por WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setConfirmOpen(false);
                        setPedidoParaConfirmar(null);
                        setTotalConfirmado("");
                        setSustituciones([]);
                        setEnvioManualData(null);
                      }}
                      data-testid="button-cerrar-envio"
                    >
                      Cerrar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirmOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={!totalConfirmado || confirmarPedidoMutation.isPending}
                    onClick={() => confirmarPedidoMutation.mutate({
                      pedidoId: pedidoParaConfirmar.id,
                      total: totalConfirmado,
                      sustituciones: sustituciones.filter(s => s.nuevo.trim() !== "")
                    })}
                    data-testid="button-enviar-confirmacion"
                  >
                    <Send size={14} className="mr-1" />
                    {confirmarPedidoMutation.isPending ? "Enviando..." : "Enviar al Cliente"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
