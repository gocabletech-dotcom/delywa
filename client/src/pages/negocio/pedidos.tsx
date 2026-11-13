import { useState, useEffect, useRef } from "react";
import { printOrderWindow, generateOrderPdf } from "@/services/PrinterService";
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
  Users,
  Phone,
  Settings,
  UtensilsCrossed,
  Send,
  RefreshCw,
  Edit,
  ArrowRight,
  BookOpen,
  Printer,
  FileDown,
  Trash2,
  AlertTriangle,
  AlertCircle,
  LogOut,
  ExternalLink,
  Smartphone,
  ClipboardList,
  Pencil,
  Banknote,
  GitMerge,
  Share2,
  Copy,
  Eye,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { buildMapUrl } from "@/lib/mapUtils";

const formatProductos = (productosStr: string, sustituciones?: Array<{ original: string; nuevo: string }>, moneda = "RD$"): string => {
  try {
    const productos = JSON.parse(productosStr);
    if (Array.isArray(productos)) {
      return productos.map((p: any) => {
        let texto = p.nombre;
        if (p.monto) texto += ` (${moneda}${p.monto})`;
        else if (p.cantidad) texto = `${p.cantidad}x ${p.nombre}`;
        else if (p.precio) texto = `${p.cantidad || 1}x ${p.nombre} (${moneda}${p.precio})`;
        return texto;
      }).join(", ");
    }
    return productosStr;
  } catch {
    return productosStr;
  }
};

const generateWhatsAppDeliveryMessage = (pedido: any, colmadoNombre: string, moneda = "RD$"): string => {
  let productos = "";
  try {
    const prods = JSON.parse(pedido.productos);
    if (Array.isArray(prods)) {
      productos = prods.map((p: any) => {
        if (p.monto) return `• ${p.nombre} - ${moneda}${p.monto}`;
        if (p.cantidad) return `• ${p.cantidad}x ${p.nombre}`;
        return `• ${p.nombre}`;
      }).join("\n");
    }
  } catch {
    productos = pedido.productos;
  }
  
  let mensaje = `🛵 *Nuevo Pedido #${pedido.id}*\n\n`;
  mensaje += `📍 *Negocio:* ${colmadoNombre}\n`;
  mensaje += `👤 *Cliente:* ${pedido.clienteNombre}\n`;
  mensaje += `📱 *WhatsApp:* ${pedido.clienteWhatsapp}\n\n`;
  mensaje += `📝 *Productos:*\n${productos}\n\n`;
  mensaje += `💰 *Total:* ${moneda}${pedido.total || "Por confirmar"}`;
  
  if (pedido.metodoPago) {
    mensaje += `\n💳 *Pago:* ${pedido.metodoPago === "efectivo" ? "Efectivo" : pedido.metodoPago === "transferencia" ? "Transferencia (Ya pagado)" : "Tarjeta POS"}`;
  }
  
  if (pedido.metodoPago === "efectivo" && pedido.montoPago) {
    const devuelta = parseFloat(pedido.montoPago) - parseFloat(pedido.total || "0");
    if (devuelta > 0) {
      mensaje += `\n💵 *Cobrar:* ${moneda}${pedido.total} (cliente paga con ${moneda}${pedido.montoPago}, devuelta ${moneda}${devuelta})`;
    }
  }
  
  if (pedido.clienteUbicacion) {
    mensaje += `\n\n📍 *Ubicación:*\n${pedido.clienteUbicacion}`;
  }
  
  return encodeURIComponent(mensaje);
};

const getTrackingShareUrl = (pedidoId: number): string =>
  `${window.location.origin}/compartir/seguimiento/${pedidoId}`;

const getBusinessTimezone = (codigoPais?: string) => ({
  DO: "America/Santo_Domingo",
  US: "America/New_York",
  AR: "America/Argentina/Buenos_Aires",
  MX: "America/Mexico_City",
  CO: "America/Bogota",
  CL: "America/Santiago",
  PE: "America/Lima",
  ES: "Europe/Madrid",
}[codigoPais || "DO"] || "America/Santo_Domingo");

const getBusinessDate = (date: Date | string, codigoPais?: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getBusinessTimezone(codigoPais),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof date === "string" ? new Date(date) : date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatProductosConSustituciones = (productosStr: string, sustituciones?: Array<{ original: string; nuevo: string }>, moneda = "RD$"): React.ReactNode[] => {
  try {
    const productos = JSON.parse(productosStr);
    if (!Array.isArray(productos)) return [productosStr];
    
    return productos.map((p: any, idx: number) => {
      let texto = p.nombre;
      if (p.monto) texto += ` (${moneda}${p.monto})`;
      else if (p.cantidad && p.precio) texto = `${p.cantidad}x ${p.nombre} (${moneda}${p.precio})`;
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

interface PedidoNegocio {
  id: number;
  clienteNombre: string;
  clienteWhatsapp: string;
  clienteUbicacion: string;
  productos: string;
  total: string;
  totalConfirmado: string | null;
  tipoEntrega?: "delivery" | "pickup";
  costoDeliveryAplicado?: string;
  costoDeliveryAplicadoFijado?: boolean;
  montoPago: string;
  necesitaDevuelta: boolean;
  vueltoEntregado: string | null;
  vueltoEntregadoAlDelivery: boolean;
  vueltoEntregadoAt: string | null;
  vueltoEntregadoPor: string | null;
  estado: string;
  metodoPago: string | null;
  fechaCreacion: string;
  motivoRetorno: string | null;
  fusionadoEnPedidoId: number | null;
  cuadreId: number | null;
  sustituciones?: Array<{ original: string; nuevo: string }>;
  metricasDistancia?: {
    estado: "disponible" | "pickup" | "ubicacion_cliente_incompleta" | "no_se_pudo_calcular" | "sucursales_sin_ubicacion" | "fuera_de_radio" | "ruta_no_disponible";
    sucursales: Array<{
      sucursalId: number;
      nombreSucursal: string;
      esSucursalOrigen: boolean;
      esMasCercana: boolean;
      distanciaMillas: number;
      tiempoEstimadoMinutos: number;
      fuente?: "ruta" | "gps";
    }>;
    sucursalesSinUbicacion: number;
    sucursalesFueraDeRadio: number;
  };
  [key: string]: unknown;
}

function DistanciaPedido({ pedido, compact = false, metricasRuta, proveedorRutas, traficoDisponible = false }: {
  pedido: PedidoNegocio;
  compact?: boolean;
  metricasRuta?: PedidoNegocio["metricasDistancia"];
  proveedorRutas?: string | null;
  traficoDisponible?: boolean;
}) {
  if (pedido.tipoEntrega === "pickup") return null;
  const metricas = metricasRuta?.estado === "ruta_no_disponible"
    ? pedido.metricasDistancia
    : metricasRuta || pedido.metricasDistancia;

  if (!metricas) {
    return <p className="text-xs text-gray-400" data-testid={`pedido-distancia-${pedido.id}`}>Calculando distancia…</p>;
  }
  if (metricas.estado === "ubicacion_cliente_incompleta") {
    return <p className="text-xs text-amber-700" data-testid={`pedido-distancia-${pedido.id}`}>Ubicación del cliente insuficiente para calcular distancia.</p>;
  }
  if (metricas.estado === "no_se_pudo_calcular") {
    return <p className="text-xs text-amber-700" data-testid={`pedido-distancia-${pedido.id}`}>No se pudo calcular la distancia todavía.</p>;
  }
  if (metricas.estado === "sucursales_sin_ubicacion") {
    return <p className="text-xs text-amber-700" data-testid={`pedido-distancia-${pedido.id}`}>La sucursal no tiene ubicación GPS para calcular distancia.</p>;
  }
  if (metricas.estado !== "disponible") return null;

  const origen = metricas.sucursales.find((sucursal) => sucursal.esSucursalOrigen) || metricas.sucursales[0];
  const alternativas = metricas.sucursales.filter((sucursal) => sucursal.sucursalId !== origen?.sucursalId);
  if (!origen) return null;

  return (
    <div className={`rounded-md border border-sky-100 bg-sky-50/70 ${compact ? "p-2" : "mt-2 ml-5 p-2"}`} data-testid={`pedido-distancia-${pedido.id}`}>
      <div className="flex items-center gap-1.5 text-xs text-sky-900">
        <Navigation size={13} className="shrink-0" />
        <span className="font-medium">Desde {origen.nombreSucursal}:</span>
        <span>{origen.distanciaMillas.toFixed(1)} mi</span>
        <span className="text-[10px] text-sky-700">
          ({origen.fuente === "ruta" ? `ruta vial${traficoDisponible ? " · tráfico" : ""}${proveedorRutas ? ` · ${proveedorRutas}` : ""}` : "estimado GPS"})
        </span>
      </div>
      {alternativas.length > 0 && (
        <div className="mt-1.5 border-t border-sky-100 pt-1.5 text-[11px] text-sky-900">
          <p className="font-medium">Otras sucursales</p>
          {alternativas.map((sucursal) => (
            <p key={sucursal.sucursalId} className="mt-0.5">
              {sucursal.nombreSucursal}: {sucursal.distanciaMillas.toFixed(1)} mi{" "}
              <span className="text-[10px]">({sucursal.fuente === "ruta" ? `ruta vial${traficoDisponible ? " · tráfico" : ""}` : "GPS"})</span>
              {sucursal.esMasCercana && <span className="ml-1 font-medium text-emerald-700">Más cercana</span>}
            </p>
          ))}
        </div>
      )}
      {origen.esMasCercana && alternativas.length > 0 && (
        <p className="mt-1 text-[10px] font-medium text-emerald-700">La sucursal de origen es la más cercana.</p>
      )}
    </div>
  );
}

export default function PedidosPage() {
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [tabActual, setTabActual] = useState<"activos" | "historial">("activos");
  const [filtroFecha, setFiltroFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [verDetalleOpen, setVerDetalleOpen] = useState(false);
  const [pedidoVerDetalle, setPedidoVerDetalle] = useState<PedidoNegocio | null>(null);
  const [pedidoVistaPrevia, setPedidoVistaPrevia] = useState<PedidoNegocio | null>(null);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<any>(null);
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
    // Always fetch the latest orders when opening this section, even if the
    // shared sidebar query already has a cached response.
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  // Al volver a esta página con el botón "atrás" (por ejemplo desde WhatsApp), se piden los pedidos de nuevo.
  useEffect(() => {
    const alVolver = (e: PageTransitionEvent) => { if (e.persisted) queryClient.invalidateQueries({ queryKey: ["pedidos"] }); };
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);
  const [refrescando, setRefrescando] = useState(false);
  const refrescar = async () => {
    setRefrescando(true);
    try {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["pedidos"] }), queryClient.invalidateQueries({ queryKey: ["ventas-hoy"] })]);
    } finally { setRefrescando(false); }
  };

  const pedidosParaRutas = Array.isArray(pedidos)
    ? pedidos.filter((pedido: PedidoNegocio) => pedido.tipoEntrega !== "pickup").map((pedido: PedidoNegocio) => pedido.id)
    : [];
  const { data: rutasData } = useQuery<{
    configured: boolean;
    routingStatus?: "unconfigured" | "available" | "unavailable";
    providerName?: string | null;
    trafficEnabled?: boolean;
    results: Array<{ pedidoId: number; metricasDistancia: PedidoNegocio["metricasDistancia"] }>;
  }>({
    queryKey: ["pedidos-rutas", colmadoId, pedidosParaRutas],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos/distancias-ruta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoIds: pedidosParaRutas }),
      });
      if (!res.ok) {
        return {
          configured: true,
          routingStatus: "unavailable" as const,
          providerName: "Proveedor de rutas",
          trafficEnabled: false,
          results: [],
        };
      }
      return res.json();
    },
    enabled: !!colmadoId && pedidosParaRutas.length > 0,
    retry: false,
  });
  const metricasRutaPorPedido = new Map(
    (rutasData?.results || []).map((resultado) => [resultado.pedidoId, resultado.metricasDistancia]),
  );

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

  const pedidosPendientes = pedidos?.filter((p: any) => p.estado === "pendiente") || [];

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    direccion: string;
    whatsappNumero: string;
    telefonoAlternativo: string | null;
    impuesto: string;
    costoDelivery: string;
    estado: string;
    tipoNegocio: string;
    codigoPais?: string;
    tituloCompartirPedido: string | null;
    descripcionCompartirPedido: string | null;
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

  const moneda = colmadoData?.simboloMoneda || "RD$";
  const getCostoDeliveryPedido = (pedido?: {
    tipoEntrega?: string;
    costoDeliveryAplicado?: string | null;
    costoDeliveryAplicadoFijado?: boolean;
  }) => {
    if (!pedido || pedido.tipoEntrega === "pickup") return 0;
    const costoRegistrado = Math.max(0, parseFloat(pedido.costoDeliveryAplicado ?? "0") || 0);
    return pedido.costoDeliveryAplicadoFijado
      ? costoRegistrado
      : Math.max(0, parseFloat(colmadoData?.costoDelivery ?? "0") || 0);
  };

  const sonPedidosFusionables = (pedido: PedidoNegocio, otro: PedidoNegocio) => {
    const telefono = (value: string) => String(value || "").replace(/\D/g, "");
    const direccion = (value: string) => String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");

    return pedido.id !== otro.id
      && pedido.estado === "pendiente"
      && otro.estado === "pendiente"
      && !pedido.deliveryId
      && !otro.deliveryId
      && pedido.tipoEntrega !== "pickup"
      && otro.tipoEntrega !== "pickup"
      && telefono(pedido.clienteWhatsapp) === telefono(otro.clienteWhatsapp)
      && direccion(pedido.clienteUbicacion) === direccion(otro.clienteUbicacion);
  };

  const copiarLinkSeguimiento = async (pedidoId: number) => {
    const url = getTrackingShareUrl(pedidoId);
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copiado",
        description: "Ya puedes compartirlo con el cliente",
      });
    } catch {
      toast({
        title: "No se pudo copiar el link",
        description: "Intenta copiarlo de nuevo",
        variant: "destructive",
      });
    }
  };

  const compartirLinkSeguimiento = async (pedidoId: number) => {
    const url = getTrackingShareUrl(pedidoId);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Seguimiento del pedido #${pedidoId}`,
          text: "Consulta el estado de tu pedido",
          url,
        });
      } catch (error) {
        // Closing the native share sheet is an intentional no-op.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
      return;
    }
    await copiarLinkSeguimiento(pedidoId);
  };

  const handlePrint = (pedido: any) => {
    if (!colmadoData) return;
    printOrderWindow(pedido, colmadoData, toast);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el estado");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["ventas-hoy"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "No se pudo actualizar el pedido", description: error.message, variant: "destructive" });
    },
  });

  const asignarDeliveryMutation = useMutation({
    mutationFn: async ({ pedidoId, deliveryId }: { pedidoId: number; deliveryId: number }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/asignar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw Object.assign(new Error(data.error || "Error al asignar delivery"), { reason: data.reason });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Delivery asignado" });
    },
    onError: (error: any) => {
      toast({
        title: error.reason === "cuadre_pendiente" ? "Cuadre pendiente" : "Error al asignar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cambiarAPickupMutation = useMutation({
    mutationFn: async (pedidoId: number) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/cambiar-a-pickup`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cambiar el pedido a pickup");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Pedido cambiado a pickup", description: "Se quitó el delivery y el cargo aplicado se eliminó del total." });
    },
    onError: (error: Error) => {
      toast({ title: "No se pudo cambiar a pickup", description: error.message, variant: "destructive" });
    },
  });

  const confirmarPagoMutation = useMutation({
    mutationFn: async (pedidoId: number) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/confirmar-pago`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Error al confirmar pago");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Pago confirmado", description: "El pedido está listo para entrega" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo confirmar el pago", variant: "destructive" });
    },
  });

  const avisarComprobanteMutation = useMutation({
    mutationFn: async (pedidoId: number) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/avisar-comprobante`, { method: "POST" });
      if (!res.ok) throw new Error("Error al enviar aviso");
      return res.json();
    },
    onSuccess: (data) => {
      if (data?.conversacionNueva) {
        toast({ title: "Conversación reabierta", description: "Se abrió una nueva conversación y se envió el detalle del pedido al cliente" });
      } else {
        toast({ title: "Aviso enviado", description: "Se notificó al cliente que esperas el comprobante" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo enviar el aviso", variant: "destructive" });
    },
  });

  const revisarProductosMutation = useMutation({
    mutationFn: async ({ pedidoId, productos, totalConfirmado }: { pedidoId: number; productos: any[]; totalConfirmado?: string }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/revisar-productos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productos, ...(totalConfirmado !== undefined ? { totalConfirmado } : {}) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error al actualizar productos");
      return res.json();
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

  const hoy = getBusinessDate(new Date(), colmadoData?.codigoPais);
  const pedidosActivos = pedidos?.filter((p: any) =>
    p.fechaCreacion && getBusinessDate(p.fechaCreacion, colmadoData?.codigoPais) === hoy && p.estado !== "fusionado"
  ) || [];
  const pedidosHistorial = pedidos?.filter((p: any) => {
    if (!filtroFecha) return true;
    return p.fechaCreacion && getBusinessDate(p.fechaCreacion, colmadoData?.codigoPais) === filtroFecha;
  }) || [];

  const pedidosFiltrados = tabActual === "activos"
    ? pedidosActivos.filter((p: any) => filtroEstado === "todos" || p.estado === filtroEstado)
    : pedidosHistorial.filter((p: any) => filtroEstado === "todos" || p.estado === filtroEstado);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pedidoParaConfirmar, setPedidoParaConfirmar] = useState<any>(null);
  const [totalConfirmado, setTotalConfirmado] = useState("");
  const [sustituciones, setSustituciones] = useState<Array<{ original: string; nuevo: string }>>([]);
  const [productosAdicionales, setProductosAdicionales] = useState<Array<{ nombre: string; monto: string }>>([]);
  const [newProductNombre, setNewProductNombre] = useState("");
  const [newProductPrecio, setNewProductPrecio] = useState("");
  const whatsappWindowRef = useRef<Window | null>(null);
  const [revisarOpen, setRevisarOpen] = useState(false);
  const [pedidoParaRevisar, setPedidoParaRevisar] = useState<any>(null);
  const [productosRevisados, setProductosRevisados] = useState<any[]>([]);
  const [sustitucionesRevisar, setSustitucionesRevisar] = useState<Array<{ original: string; nuevo: string }>>([]);
  const [productosAdicionalesRevisar, setProductosAdicionalesRevisar] = useState<Array<{ nombre: string; monto: string }>>([]);
  const [totalRevisado, setTotalRevisado] = useState("");
  const [newProductNombreRevisar, setNewProductNombreRevisar] = useState("");
  const [newProductPrecioRevisar, setNewProductPrecioRevisar] = useState("");

  // Inline product editing state for the confirm modal
  const [productosParaConfirmar, setProductosParaConfirmar] = useState<Array<{nombre: string; cantidad: number; precio: string; nombreOriginal: string}>>([]);
  const [newProdNombreConf, setNewProdNombreConf] = useState("");
  const [newProdCantidadConf, setNewProdCantidadConf] = useState("1");
  const [newProdPrecioConf, setNewProdPrecioConf] = useState("");

  // Editar pedido (pendiente orders in list)
  const [editarOpen, setEditarOpen] = useState(false);
  const [pedidoParaEditar, setPedidoParaEditar] = useState<any>(null);
  const [productosEditando, setProductosEditando] = useState<Array<{nombre: string; cantidad: number; precio: string}>>([]);
  const [newProdNombreEdit, setNewProdNombreEdit] = useState("");
  const [newProdCantidadEdit, setNewProdCantidadEdit] = useState("1");
  const [newProdPrecioEdit, setNewProdPrecioEdit] = useState("");

  const confirmarPedidoMutation = useMutation({
    mutationFn: async ({ pedidoId, total, sustituciones, productosAdicionales, productosActualizados }: { pedidoId: number; total: string; sustituciones: Array<{ original: string; nuevo: string }>; productosAdicionales: Array<{ nombre: string; monto: string }>; productosActualizados?: Array<{ nombre: string; cantidad: number; monto: number; textoOriginal: string; encontradoEnMenu: boolean }> }) => {
      const res = await fetch(`/api/pedidos/${pedidoId}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalConfirmado: total, sustituciones, productosAdicionales, productosActualizados }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al confirmar pedido");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      // El pedido cambia de estado en pantalla al instante; después se confirma con el servidor.
      if (data.estado) {
        queryClient.setQueriesData({ queryKey: ["pedidos"] }, (lista: unknown) => Array.isArray(lista)
          ? lista.map((p: any) => (p?.id === variables.pedidoId ? { ...p, estado: data.estado, total: data.total ?? p.total, totalConfirmado: data.total ?? p.totalConfirmado } : p))
          : lista);
      }
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      
      if (data.necesitaEnvioManual && data.whatsappNumero && data.mensajeParaEnviar) {
        const numero = data.whatsappNumero.replace(/\+/g, "");
        const url = `https://wa.me/${numero}?text=${encodeURIComponent(data.mensajeParaEnviar)}`;
        // The tab is opened by the confirmation click, avoiding popup blockers
        // after the server finishes confirming the order.
        if (whatsappWindowRef.current && !whatsappWindowRef.current.closed) {
          whatsappWindowRef.current.location.href = url;
          whatsappWindowRef.current = null;
        } else if (!window.open(url, "_blank")) {
          // Solo si el navegador bloquea la pestaña nueva se sale de esta página.
          window.location.href = url;
        }
        setConfirmOpen(false);
        setPedidoParaConfirmar(null);
        toast({ title: "Pedido confirmado", description: "WhatsApp se abrió automáticamente para enviar la confirmación." });
      } else {
        whatsappWindowRef.current?.close();
        whatsappWindowRef.current = null;
        setConfirmOpen(false);
        setPedidoParaConfirmar(null);
        setTotalConfirmado("");
        setSustituciones([]);
        setProductosAdicionales([]);
        setNewProductNombre("");
        setNewProductPrecio("");
        toast({
          title: "Pedido confirmado",
          description: data.envioWhatsApp
            ? "La confirmación fue enviada por el canal integrado de WhatsApp."
            : "La confirmación fue enviada por el canal de chat activo.",
        });
      }
    },
    onError: (error: Error) => {
      whatsappWindowRef.current?.close();
      whatsappWindowRef.current = null;
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  const deletePedidoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/pedidos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Pedido eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar pedido", variant: "destructive" });
    },
  });

  const fusionarMutation = useMutation({
    mutationFn: async ({ idDestino, idOrigen }: { idDestino: number; idOrigen: number }) => {
      const res = await fetch(`/api/pedidos/${idDestino}/fusionar/${idOrigen}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al fusionar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Pedidos fusionados", description: "Los productos fueron combinados en un solo pedido con un solo delivery." });
    },
    onError: (error: Error) => {
      toast({ title: "Error al fusionar", description: error.message, variant: "destructive" });
    },
  });

  const [vueltoEdits, setVueltoEdits] = useState<Record<number, string>>({});
  const [vueltoEditMode, setVueltoEditMode] = useState<Record<number, boolean>>({});

  // Controlled delivery-assignment dialog with optional vuelto step
  const [asignarDialogOpen, setAsignarDialogOpen] = useState(false);
  const [asignarDialogPedido, setAsignarDialogPedido] = useState<PedidoNegocio | null>(null);
  const [asignarDialogStep, setAsignarDialogStep] = useState<"select" | "vuelto">("select");
  const [asignarDialogVuelto, setAsignarDialogVuelto] = useState("");
  const [asignarDialogDelivery, setAsignarDialogDelivery] = useState<any>(null);

  // Inline devuelta registration on the list card
  const [devueltaInlinePedidoId, setDevueltaInlinePedidoId] = useState<number | null>(null);
  const [devueltaInlineMonto, setDevueltaInlineMonto] = useState("");

  const updateVueltoMutation = useMutation({
    mutationFn: async ({ pedidoId, monto }: { pedidoId: number; monto: string }) => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos/${pedidoId}/vuelto`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto: parseFloat(monto) }),
      });
      if (!res.ok) throw new Error("Error al actualizar vuelto");
      return res.json();
    },
    onSuccess: (_, { pedidoId }) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      setVueltoEdits((prev) => { const n = { ...prev }; delete n[pedidoId]; return n; });
      setVueltoEditMode((prev) => { const n = { ...prev }; delete n[pedidoId]; return n; });
      toast({ title: "Devuelta actualizada" });
    },
    onError: () => {
      toast({ title: "Error al actualizar vuelto", variant: "destructive" });
    },
  });

  const entregarVueltoDeliveryMutation = useMutation({
    mutationFn: async ({ pedidoId, monto }: { pedidoId: number; monto?: string }) => {
      const body: Record<string, unknown> = {};
      if (monto !== undefined && monto !== "") body.monto = parseFloat(monto);
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos/${pedidoId}/entregar-vuelto-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al registrar");
      }
      return res.json();
    },
    onSuccess: (_, { pedidoId }) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      setVueltoEdits((prev) => { const n = { ...prev }; delete n[pedidoId]; return n; });
      toast({ title: "Devuelta entregada al delivery", description: "Quedó registrado en el pedido" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openConfirmModal = (pedido: any) => {
    setPedidoParaConfirmar(pedido);
    setSustituciones([]);
    setProductosAdicionales([]);
    setNewProductNombre("");
    setNewProductPrecio("");

    // Build editable product list from stored JSON
    try {
      const prods = JSON.parse(pedido.productos);
      if (Array.isArray(prods)) {
        setProductosParaConfirmar(prods.map((p: any) => ({
          nombre: p.nombre || p.name || "Producto",
          cantidad: parseInt(p.cantidad) || 1,
          precio: p.monto != null && p.monto !== 0 ? String(p.monto) : p.precio != null && p.precio !== 0 ? String(p.precio) : "",
          nombreOriginal: p.nombre || p.name || "Producto",
        })));
      } else {
        setProductosParaConfirmar([]);
      }
    } catch {
      setProductosParaConfirmar([]);
    }
    setNewProdNombreConf(""); setNewProdCantidadConf("1"); setNewProdPrecioConf("");
    setTotalConfirmado("");
    setConfirmOpen(true);
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case "pendiente_confirmacion": return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "esperando_confirmacion_sustituciones": return "bg-amber-100 text-amber-700 border-amber-300";
      case "esperando_pago": return "bg-purple-100 text-purple-600 border-purple-300";
      case "esperando_comprobante": return "bg-indigo-100 text-indigo-600 border-indigo-300";
      case "esperando_confirmacion_pago": return "bg-cyan-100 text-cyan-600 border-cyan-300";
      case "pendiente": return "bg-orange-100 text-orange-600 border-orange-300";
      case "en_preparacion": return "bg-blue-100 text-blue-600 border-blue-300";
      case "listo": return "bg-purple-100 text-purple-600 border-purple-300";
      case "en_camino": return "bg-blue-100 text-blue-600 border-blue-300";
      case "entregado": return "bg-green-100 text-green-600 border-green-300";
      case "cancelado": return "bg-red-100 text-red-600 border-red-300";
      case "retorno": return "bg-gray-100 text-gray-600 border-gray-300";
      case "fusionado": return "bg-violet-100 text-violet-700 border-violet-300";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case "pendiente_confirmacion": return "Por Confirmar";
      case "esperando_confirmacion_sustituciones": return "Confirmando Cambios";
      case "esperando_pago": return "Esperando Pago";
      case "esperando_comprobante": return "Esperando Comprobante";
      case "esperando_confirmacion_pago": return "Confirmar Pago";
      case "pendiente": return "Pendiente";
      case "en_preparacion": return "En Preparación";
      case "listo": return "Listo";
      case "en_camino": return "En Camino";
      case "entregado": return "Entregado";
      case "cancelado": return "Cancelado";
      case "retorno": return "Retorno";
      case "fusionado": return "Fusionado";
      default: return estado;
    }
  };

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

  return (
    <NegocioLayout title="Pedidos" activeNav="pedidos" headerRight={<Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 text-white/80 hover:text-white hover:bg-white/10" onClick={refrescar} disabled={refrescando} title="Refrescar" data-testid="button-refresh"><RefreshCw size={18} className={`sm:hidden ${refrescando ? "animate-spin" : ""}`} /><RefreshCw size={20} className={`hidden sm:block ${refrescando ? "animate-spin" : ""}`} /></Button>}>
      {/* Sidebar */}

      {/* Main Content */}

        {/* ── Tabs ── */}
        <div className="bg-white border-b shrink-0">
          <div className="flex flex-wrap items-center gap-0 px-4 border-b">
            {(["activos", "historial"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setTabActual(tab); setFiltroEstado("todos"); }}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tabActual === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "activos" ? "Activos" : "Historial"}
                <span className="ml-1.5 text-xs opacity-60">
                  ({tab === "activos" ? pedidosActivos.length : pedidosHistorial.length})
                </span>
              </button>
            ))}
            {tabActual === "historial" && (
              <div className="ml-0 sm:ml-auto flex w-full sm:w-auto min-w-0 items-center gap-1.5 pr-0 sm:pr-2 py-1">
                <span className="text-xs text-gray-500">Fecha:</span>
                <input
                  type="date"
                  value={filtroFecha}
                  onChange={(e) => setFiltroFecha(e.target.value)}
                  className="text-xs border rounded px-2 py-1 h-7 min-w-0 flex-1 sm:flex-none"
                />
              </div>
            )}
          </div>
          {/* State chips */}
          <div className="flex flex-wrap gap-1.5 px-3 py-2">
            {[
              { value: "todos", label: "Todos", color: "bg-gray-100 text-gray-700 border-gray-300" },
              { value: "pendiente_confirmacion", label: "Por Confirmar", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
              { value: "esperando_comprobante", label: "Esp. Recibo", color: "bg-indigo-100 text-indigo-600 border-indigo-300" },
              { value: "esperando_pago", label: "Esp. Pago", color: "bg-purple-100 text-purple-600 border-purple-300" },
              { value: "esperando_confirmacion_pago", label: "Conf. Pago", color: "bg-cyan-100 text-cyan-600 border-cyan-300" },
              { value: "esperando_confirmacion_sustituciones", label: "Conf. Cambios", color: "bg-amber-100 text-amber-700 border-amber-300" },
              { value: "pendiente", label: "Pendiente", color: "bg-orange-100 text-orange-600 border-orange-300" },
               { value: "en_preparacion", label: "En Preparación", color: "bg-blue-100 text-blue-600 border-blue-300" },
               { value: "listo", label: "Listo", color: "bg-purple-100 text-purple-600 border-purple-300" },
              { value: "en_camino", label: "En Camino", color: "bg-blue-100 text-blue-600 border-blue-300" },
              { value: "entregado", label: "Entregado", color: "bg-green-100 text-green-600 border-green-300" },
              { value: "cancelado", label: "Cancelado", color: "bg-red-100 text-red-600 border-red-300" },
              { value: "retorno", label: "Retorno", color: "bg-gray-100 text-gray-600 border-gray-300" },
              { value: "fusionado", label: "Fusionado", color: "bg-violet-100 text-violet-700 border-violet-300" },
            ].map((s) => {
              const source = tabActual === "activos" ? pedidosActivos : pedidosHistorial;
              const cnt = s.value === "todos" ? source.length : source.filter((p: any) => p.estado === s.value).length;
              return (
                <button
                  key={s.value}
                  onClick={() => setFiltroEstado(s.value)}
                  data-testid={`filter-chip-${s.value}`}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all ${s.color} ${
                    filtroEstado === s.value ? "ring-2 ring-offset-1 ring-primary/40 border-2" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {s.label} <span className="opacity-60">({cnt})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="text-center py-16">
              <Package size={60} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No hay pedidos</h3>
              <p className="text-gray-500">{tabActual === "historial" ? "No hay pedidos para esa fecha" : "Los pedidos aparecerán aquí cuando los clientes ordenen por WhatsApp"}</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border divide-y shadow-sm">
              {pedidosFiltrados.map((pedido: PedidoNegocio) => (
                <div key={pedido.id} className="flex flex-col px-4 py-3 hover:bg-gray-50 transition-colors" data-testid={`pedido-card-${pedido.id}`}>
                  {/* ── Row 1: summary info ── */}
                  <div className="flex items-center gap-3 min-w-0">
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getEstadoColor(pedido.estado).split(" ")[0].replace("bg-", "bg-").replace("100", "400")}`} />

                  {/* ID + cliente + estado */}
                  <div className="w-28 shrink-0">
                    <span className="font-mono text-xs text-gray-400">#{pedido.id}</span>
                    <p className="font-semibold text-sm leading-tight truncate">{pedido.clienteNombre}</p>
                  </div>

                  {/* Status badge */}
                  <div className="w-32 shrink-0 hidden sm:block">
                    <Badge variant="outline" className={`text-[11px] h-5 px-1.5 ${getEstadoColor(pedido.estado)}`}>
                      {getEstadoLabel(pedido.estado)}
                    </Badge>
                    <Badge variant="outline" className={`ml-1 text-[10px] h-5 px-1.5 ${pedido.tipoEntrega === "pickup" ? "border-green-300 bg-green-50 text-green-700" : "border-blue-200 bg-blue-50 text-blue-700"}`} data-testid={`tipo-entrega-${pedido.id}`}>
                      {pedido.tipoEntrega === "pickup" ? "🏪 Pickup" : "🛵 Delivery"}
                    </Badge>
                    {pedido.estado === "retorno" && pedido.motivoRetorno && (
                      <p className="text-[10px] text-gray-400 italic truncate mt-0.5" data-testid={`motivo-retorno-${pedido.id}`}>{pedido.motivoRetorno}</p>
                    )}
                    {pedido.estado === "fusionado" && pedido.fusionadoEnPedidoId && (
                      <p className="text-[10px] text-violet-600 truncate mt-0.5" data-testid={`pedido-fusionado-en-${pedido.id}`}>
                        Incluido en #{pedido.fusionadoEnPedidoId}
                      </p>
                    )}
                  </div>

                  {/* Products summary */}
                  <div className="flex-1 min-w-0 hidden md:block">
                    <p className="text-xs text-gray-600 truncate">
                      {(() => {
                        try {
                          const prods = JSON.parse(pedido.productos);
                          if (!Array.isArray(prods)) return pedido.productos;
                          return prods.map((p: any) => {
                            const nombre = p.nombre || p.name || "Producto";
                            const cant = parseInt(p.cantidad) || 1;
                            const sust = pedido.sustituciones?.find((s: any) => s.original === nombre);
                            const nomFinal = sust?.nuevo ? `${nombre}→${sust.nuevo}` : nombre;
                            return cant > 1 ? `${cant}x ${nomFinal}` : nomFinal;
                          }).join(", ");
                        } catch { return pedido.productos; }
                      })()}
                    </p>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {new Date(pedido.fechaCreacion).toLocaleString("es-DO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {pedido.metodoPago && (
                        <span className={`ml-1 ${pedido.metodoPago === "transferencia" ? "text-blue-500" : pedido.metodoPago === "tarjeta" ? "text-purple-500" : ""}`}>
                          · {pedido.metodoPago === "efectivo" ? "Efectivo" : pedido.metodoPago === "transferencia" ? "Transferencia" : "Tarjeta"}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Total */}
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-primary">{moneda}{parseFloat(pedido.totalConfirmado || pedido.total || "0").toFixed(2)}</p>
                    {pedido.necesitaDevuelta && parseFloat(pedido.montoPago) > 0 && (
                      <p className="text-[10px] text-orange-600">Dev: {moneda}{(parseFloat(pedido.montoPago) - parseFloat(pedido.totalConfirmado || pedido.total || "0")).toFixed(2)}</p>
                    )}
                  </div>

                  {/* Ver button */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs shrink-0"
                    onClick={() => { setPedidoVerDetalle(pedido); setVerDetalleOpen(true); }}
                    data-testid={`ver-pedido-${pedido.id}`}
                  >
                    Ver
                  </Button>
                  </div>{/* end row 1 */}

                  <DistanciaPedido
                    pedido={pedido}
                    metricasRuta={metricasRutaPorPedido.get(pedido.id)}
                    proveedorRutas={rutasData?.providerName}
                    traficoDisponible={rutasData?.trafficEnabled}
                  />

                  {/* ── Row 2: action buttons (wrap freely, never overflow) ── */}
                  <div className="flex gap-1.5 flex-wrap pt-2 pl-5">
                          {!!pedido.deliveryId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                              title="Vista previa del enlace para el cliente"
                              aria-label="Vista previa del enlace para el cliente"
                              data-testid={`vista-previa-seguimiento-${pedido.id}`}
                              onClick={() => setPedidoVistaPrevia(pedido)}
                            >
                              <Eye size={14} />
                            </Button>
                          )}
                          {!!pedido.deliveryId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                              title="Copiar link de seguimiento para el cliente"
                              aria-label="Copiar link de seguimiento para el cliente"
                              data-testid={`compartir-seguimiento-${pedido.id}`}
                              onClick={() => copiarLinkSeguimiento(pedido.id)}
                            >
                              <Copy size={14} />
                            </Button>
                          )}
                          {!!pedido.deliveryId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                              title="Compartir link de seguimiento"
                              aria-label="Compartir link de seguimiento"
                              data-testid={`compartir-seguimiento-nativo-${pedido.id}`}
                              onClick={() => compartirLinkSeguimiento(pedido.id)}
                            >
                              <Share2 size={14} />
                            </Button>
                          )}
                          {pedido.tipoEntrega !== "pickup" && !["entregado", "cancelado", "retorno", "fusionado"].includes(pedido.estado) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-300 text-green-700 hover:bg-green-50"
                              disabled={cambiarAPickupMutation.isPending}
                              onClick={() => {
                                if (confirm(`¿Cambiar el Pedido #${pedido.id} a pickup?\n\nSe quitará el repartidor y el cargo de delivery aplicado. El cliente será avisado para recoger su pedido en el negocio.`)) {
                                  cambiarAPickupMutation.mutate(pedido.id);
                                }
                              }}
                              data-testid={`cambiar-a-pickup-${pedido.id}`}
                            >
                              🏪 Cambiar a Pickup
                            </Button>
                          )}
                          {pedido.estado === "pendiente_confirmacion" && (
                            <>
                              {pedido.metodoPago === "transferencia" && !pedido.comprobanteUrl && (
                                <>
                                  <Badge className="bg-indigo-100 text-indigo-700 text-xs" data-testid={`badge-sin-comprobante-${pedido.id}`}>
                                    Sin comprobante aún
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-indigo-600 border-indigo-300"
                                    onClick={() => avisarComprobanteMutation.mutate(pedido.id)}
                                    disabled={avisarComprobanteMutation.isPending}
                                    data-testid={`avisar-comprobante-${pedido.id}`}
                                  >
                                    <Send size={14} className="mr-1" /> Avisar al cliente
                                  </Button>
                                </>
                              )}
                              {pedido.metodoPago === "transferencia" && pedido.comprobanteUrl && (
                                <a
                                  href={pedido.comprobanteUrl as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-indigo-600 underline flex items-center gap-1"
                                  data-testid={`ver-comprobante-${pedido.id}`}
                                >
                                  📄 Ver comprobante
                                </a>
                              )}
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
                          {pedido.estado === "esperando_confirmacion_sustituciones" && pedido.tipoEntrega !== "pickup" && (
                            <>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button size="sm" variant="outline" data-testid={`asignar-delivery-sust-${pedido.id}`}>
                                    <Truck size={14} className="mr-1" /> {pedido.deliveryId ? "Reasignar" : "Asignar Delivery"}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>{pedido.deliveryId ? "Reasignar Delivery" : "Asignar Delivery"}</DialogTitle>
                                  </DialogHeader>
                                  <p className="text-sm text-gray-500 mt-1">El pedido está esperando confirmación de sustituciones. El delivery quedará pre-asignado.</p>
                                  <div className="space-y-3 mt-4">
                                    {deliveries?.map((delivery: any) => (
                                      <div key={delivery.id} className="flex items-center gap-2">
                                        <button
                                          className="flex-1 flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                                          onClick={() => {
                                            asignarDeliveryMutation.mutate({ pedidoId: pedido.id, deliveryId: delivery.id });
                                          }}
                                          data-testid={`select-delivery-sust-${delivery.id}`}
                                        >
                                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${delivery.estado === "activo" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                                            <Truck size={18} />
                                          </div>
                                          <div className="text-left flex-1">
                                            <p className="font-medium">{delivery.nombre}</p>
                                            <p className="text-sm text-gray-500">{delivery.whatsappNumero}</p>
                                          </div>
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${delivery.estado === "activo" ? "bg-green-100 text-green-700" : delivery.estado === "en_descanso" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                                            {delivery.estado === "activo" ? "Activo" : delivery.estado === "en_descanso" ? "En descanso" : "Inactivo"}
                                          </span>
                                        </button>
                                      </div>
                                    ))}
                                    {(!deliveries || deliveries.length === 0) && (
                                      <p className="text-center text-gray-500 py-4">No hay deliveries registrados</p>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </>
                          )}
                          {pedido.estado === "esperando_pago" && (
                            <>
                              <Badge className="bg-purple-100 text-purple-700 text-xs">
                                Esperando respuesta del cliente
                              </Badge>
                              <Button 
                                size="sm" 
                                className="bg-green-500 hover:bg-green-600"
                                onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "pendiente" })}
                                data-testid={`marcar-pagado-${pedido.id}`}
                              >
                                <CheckCircle2 size={14} className="mr-1" /> Marcar Pagado
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
                          {pedido.estado === "esperando_comprobante" && (
                            <>
                              <Badge className="bg-indigo-100 text-indigo-700 text-xs">
                                Esperando comprobante de transferencia
                              </Badge>
                              {pedido.metodoPago === "transferencia" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-indigo-600 border-indigo-300"
                                  onClick={() => avisarComprobanteMutation.mutate(pedido.id)}
                                  disabled={avisarComprobanteMutation.isPending}
                                  data-testid={`avisar-comprobante-${pedido.id}`}
                                >
                                  <Send size={14} className="mr-1" /> Avisar al cliente
                                </Button>
                              )}
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
                          {pedido.estado === "esperando_confirmacion_pago" && (
                            <>
                              <Button
                                size="sm"
                                className="bg-cyan-600 hover:bg-cyan-700"
                                onClick={() => {
                                  let prods: any[] = [];
                                  try { prods = JSON.parse(pedido.productos); } catch {}
                                  const subtotal = prods.reduce((sum: number, p: any) => sum + parseFloat(p.monto || p.precio || 0) * parseInt(p.cantidad || 1, 10), 0);
                                  setPedidoParaRevisar(pedido);
                                  setProductosRevisados(prods);
                                  setSustitucionesRevisar([]);
                                  setProductosAdicionalesRevisar([]);
                                  setTotalRevisado(subtotal.toFixed(2));
                                  setNewProductNombreRevisar("");
                                  setNewProductPrecioRevisar("");
                                  setRevisarOpen(true);
                                }}
                                data-testid={`revisar-confirmar-${pedido.id}`}
                              >
                                <CheckCircle2 size={14} className="mr-1" /> Revisar y Confirmar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "cancelado" })}
                              >
                                <XCircle size={14} className="mr-1" /> Rechazar
                              </Button>
                            </>
                          )}
                          {pedido.estado === "pendiente" && (
                            <>
                              {pedido.tipoEntrega !== "pickup" && pedido.deliveryId && (
                                <span className="text-xs text-gray-500">Delivery se asigna cuando cocina marque listo</span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPedidoParaEditar(pedido);
                                  try {
                                    const prods = JSON.parse(pedido.productos);
                                    if (Array.isArray(prods)) {
                                      setProductosEditando(prods.map((p: any) => ({
                                        nombre: p.nombre || p.name || "Producto",
                                        cantidad: parseInt(p.cantidad) || 1,
                                        precio: p.monto != null && p.monto !== 0 ? String(p.monto) : p.precio != null && p.precio !== 0 ? String(p.precio) : "",
                                      })));
                                    } else { setProductosEditando([]); }
                                  } catch { setProductosEditando([]); }
                                  setNewProdNombreEdit(""); setNewProdCantidadEdit("1"); setNewProdPrecioEdit("");
                                  setEditarOpen(true);
                                }}
                                data-testid={`editar-pedido-${pedido.id}`}
                              >
                                <Pencil size={14} className="mr-1" /> Editar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "cancelado" })}
                                data-testid={`cancelar-pedido-${pedido.id}`}
                              >
                                <XCircle size={14} className="mr-1" /> Cancelar
                              </Button>
                              {/* Fusionar is available while both orders are still being prepared. */}
                              {!pedido.deliveryId && (() => {
                                const otrosPendientes = (pedidos as PedidoNegocio[])?.filter(
                                  (p: PedidoNegocio) => sonPedidosFusionables(pedido, p)
                                ) || [];
                                if (otrosPendientes.length === 0) return null;
                                return otrosPendientes.map((otro: PedidoNegocio) => (
                                  <Button
                                    key={otro.id}
                                    size="sm"
                                    variant="outline"
                                    className="text-violet-700 border-violet-300 hover:bg-violet-50"
                                    disabled={fusionarMutation.isPending}
                                    onClick={() => {
                                      if (confirm(`¿Fusionar Pedido #${pedido.id} con Pedido #${otro.id}?\n\nLos productos del #${otro.id} se añadirán al #${pedido.id} y se cobrará un solo delivery. El pedido #${otro.id} quedará marcado como Fusionado, no como Cancelado.`)) {
                                        fusionarMutation.mutate({ idDestino: pedido.id, idOrigen: otro.id });
                                      }
                                    }}
                                    data-testid={`fusionar-pedido-${pedido.id}-${otro.id}`}
                                  >
                                    <GitMerge size={14} className="mr-1" /> Fusionar con #{otro.id}
                                  </Button>
                                ));
                              })()}
                            </>
                          )}
                          {pedido.estado === "en_camino" && (
                            <>
                              {pedido.metodoPago === "efectivo" && !pedido.vueltoEntregadoAlDelivery && (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="bg-orange-50 text-orange-600 border-orange-300 text-[11px] gap-1 shrink-0"
                                    data-testid={`badge-sin-devuelta-${pedido.id}`}
                                  >
                                    <AlertCircle size={11} /> Sin devuelta
                                  </Badge>
                                  {devueltaInlinePedidoId === pedido.id ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Monto"
                                        value={devueltaInlineMonto}
                                        onChange={(e) => setDevueltaInlineMonto(e.target.value)}
                                        className="h-7 w-24 text-xs px-2"
                                        data-testid={`devuelta-inline-input-${pedido.id}`}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            entregarVueltoDeliveryMutation.mutate(
                                              { pedidoId: pedido.id, monto: devueltaInlineMonto || undefined },
                                              { onSettled: () => { setDevueltaInlinePedidoId(null); setDevueltaInlineMonto(""); } }
                                            );
                                          } else if (e.key === "Escape") {
                                            setDevueltaInlinePedidoId(null);
                                            setDevueltaInlineMonto("");
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white px-2"
                                        disabled={entregarVueltoDeliveryMutation.isPending}
                                        data-testid={`devuelta-inline-confirmar-${pedido.id}`}
                                        onClick={() => {
                                          entregarVueltoDeliveryMutation.mutate(
                                            { pedidoId: pedido.id, monto: devueltaInlineMonto || undefined },
                                            { onSettled: () => { setDevueltaInlinePedidoId(null); setDevueltaInlineMonto(""); } }
                                          );
                                        }}
                                      >
                                        ✓
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs px-2"
                                        onClick={() => { setDevueltaInlinePedidoId(null); setDevueltaInlineMonto(""); }}
                                        data-testid={`devuelta-inline-cancelar-${pedido.id}`}
                                      >
                                        ✕
                                      </Button>
                                    </span>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50 px-2"
                                      data-testid={`registrar-devuelta-inline-${pedido.id}`}
                                      onClick={() => {
                                        const total = parseFloat(pedido.totalConfirmado ?? pedido.total ?? "0");
                                        const pago = parseFloat(pedido.montoPago ?? "0");
                                        const calc = Math.max(0, pago - total);
                                        setDevueltaInlineMonto(calc > 0 ? calc.toFixed(2) : "");
                                        setDevueltaInlinePedidoId(pedido.id);
                                      }}
                                    >
                                      <Banknote size={12} className="mr-1" /> Registrar devuelta
                                    </Button>
                                  )}
                                </>
                              )}
                              {(() => {
                                const deliveryAsignado = deliveries?.find((d: any) => d.id === pedido.deliveryId);
                                const deliveryWhatsapp = deliveryAsignado?.whatsappNumero?.replace(/\D/g, "");
                                return deliveryWhatsapp ? (
                                  <a
                                    href={`https://wa.me/${deliveryWhatsapp}?text=${generateWhatsAppDeliveryMessage(pedido, colmadoData?.nombre || "", moneda)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                    data-testid={`whatsapp-reenviar-${pedido.id}`}
                                  >
                                    <ExternalLink size={14} className="mr-1" /> WhatsApp
                                  </a>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => reenviarDeliveryMutation.mutate(pedido.id)}
                                    disabled={reenviarDeliveryMutation.isPending}
                                    data-testid={`reenviar-pedido-${pedido.id}`}
                                  >
                                    <Send size={14} className="mr-1" /> Reenviar
                                  </Button>
                                );
                              })()}
                              {/* Reasignar — visible when delivery cannot deliver or none assigned */}
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`reasignar-delivery-${pedido.id}`}
                                onClick={() => {
                                  setAsignarDialogPedido(pedido);
                                  setAsignarDialogStep("select");
                                  setAsignarDialogVuelto("");
                                  setAsignarDialogDelivery(null);
                                  setAsignarDialogOpen(true);
                                }}
                              >
                                <Truck size={14} className="mr-1" /> Reasignar
                              </Button>
                            </>
                          )}
                          {["pendiente", "en_camino", "llegando"].includes(pedido.estado) && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              disabled={updateEstadoMutation.isPending}
                              onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "entregado" })}
                              data-testid={`entregar-pedido-${pedido.id}`}
                            >
                              <CheckCircle2 size={14} className="mr-1" /> Marcar Entregado
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePrint(pedido)}
                            data-testid={`imprimir-pedido-${pedido.id}`}
                          >
                            <Printer size={14} className="mr-1" /> Imprimir
                          </Button>
                          {!["entregado", "cancelado"].includes(pedido.estado) && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50"
                              onClick={() => {
                                if (confirm("¿Estás seguro de eliminar este pedido?")) {
                                  deletePedidoMutation.mutate(pedido.id);
                                }
                              }}
                              data-testid={`eliminar-pedido-${pedido.id}`}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="text-green-600 border-green-300 hover:bg-green-50"
                            onClick={() => {
                              const productos = (() => {
                                try {
                                  return JSON.parse(pedido.productos).map((p: any) => 
                                    `• ${p.nombre || p.producto}: ${moneda}${p.monto || p.precio || 0}`
                                  ).join("\n");
                                } catch { return ""; }
                              })();
                              const total = pedido.totalConfirmado || pedido.total;
                              const mensaje = encodeURIComponent(
                                `*Confirmación de Pedido #${pedido.id}*\n\n` +
                                `${productos}\n\n` +
                                `*Total: ${moneda}${total}*\n\n` +
                                `Tu pedido está siendo preparado. ¡Gracias por tu compra!`
                              );
                              const numero = pedido.clienteWhatsapp.replace(/\D/g, "");
                              window.open(`https://wa.me/${numero}?text=${mensaje}`, "_blank");
                            }}
                            data-testid={`whatsapp-pedido-${pedido.id}`}
                          >
                            <MessageCircle size={14} className="mr-1" /> WhatsApp
                          </Button>
                    </div>
                  </div>
                ))}
              </div>
          )}
        </main>

      {/* Confirmation Modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg w-full mx-4 sm:mx-auto max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar Pedido #{pedidoParaConfirmar?.id}</DialogTitle>
          </DialogHeader>
          
          {pedidoParaConfirmar && (
            <div className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium mb-1">Cliente</h4>
                <p className="text-gray-700">{pedidoParaConfirmar.clienteNombre}</p>
                {pedidoParaConfirmar.clienteUbicacion && (
                  <p className="text-sm text-gray-500 whitespace-pre-line leading-snug">{pedidoParaConfirmar.clienteUbicacion}</p>
                )}
                <DistanciaPedido
                  pedido={pedidoParaConfirmar}
                  compact
                  metricasRuta={metricasRutaPorPedido.get(pedidoParaConfirmar.id)}
                  proveedorRutas={rutasData?.providerName}
                  traficoDisponible={rutasData?.trafficEnabled}
                />
              </div>

              <div>
                <h4 className="font-medium mb-2">Productos</h4>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_40px_72px_48px_20px] gap-1 text-xs text-gray-500 px-1 mb-1">
                  <span>Producto</span>
                  <span className="text-center">Cant.</span>
                  <span className="text-center">Precio</span>
                  <span className="text-right">Total</span>
                  <span></span>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
                  {productosParaConfirmar.map((p, idx) => {
                    const precio = parseFloat(p.precio) || 0;
                    const subtotal = p.cantidad * precio;
                    const sinPrecio = !p.precio || precio === 0;
                    return (
                      <div key={idx} className="grid grid-cols-[1fr_40px_72px_48px_20px] gap-1 items-center">
                        <Input
                          value={p.nombre}
                          onChange={(e) => {
                            const updated = [...productosParaConfirmar];
                            updated[idx] = { ...updated[idx], nombre: e.target.value };
                            setProductosParaConfirmar(updated);
                          }}
                          className="h-7 text-xs px-2"
                        />
                        <Input
                          type="number"
                          min="1"
                          value={p.cantidad}
                          onChange={(e) => {
                            const updated = [...productosParaConfirmar];
                            updated[idx] = { ...updated[idx], cantidad: parseInt(e.target.value) || 1 };
                            setProductosParaConfirmar(updated);
                          }}
                          className="h-7 text-xs text-center px-1"
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={p.precio}
                          onChange={(e) => {
                            const updated = [...productosParaConfirmar];
                            updated[idx] = { ...updated[idx], precio: e.target.value };
                            setProductosParaConfirmar(updated);
                          }}
                          className={`h-7 text-xs text-right px-2 ${sinPrecio ? "border-red-400 bg-red-50 focus:border-red-500" : ""}`}
                        />
                        <span className="text-xs text-right font-medium text-gray-700 tabular-nums">
                          {subtotal > 0 ? subtotal.toFixed(0) : <span className="text-red-400">—</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => setProductosParaConfirmar(productosParaConfirmar.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 flex items-center justify-center"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                  {productosParaConfirmar.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2 italic">Sin productos</p>
                  )}
                </div>
                {/* Add product row */}
                <div className="grid grid-cols-[1fr_40px_72px_32px] gap-1 mt-2">
                  <Input
                    placeholder="Producto"
                    value={newProdNombreConf}
                    onChange={(e) => setNewProdNombreConf(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!newProdNombreConf.trim()) return; setProductosParaConfirmar([...productosParaConfirmar, { nombre: newProdNombreConf.trim(), cantidad: parseInt(newProdCantidadConf) || 1, precio: newProdPrecioConf, nombreOriginal: "" }]); setNewProdNombreConf(""); setNewProdCantidadConf("1"); setNewProdPrecioConf(""); } }}
                    data-testid="input-new-product-nombre"
                  />
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={newProdCantidadConf}
                    onChange={(e) => setNewProdCantidadConf(e.target.value)}
                    className="h-8 text-sm text-center px-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Precio"
                    value={newProdPrecioConf}
                    onChange={(e) => setNewProdPrecioConf(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-new-product-precio"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 border-green-300 text-green-700 hover:bg-green-50 shrink-0"
                    onClick={() => {
                      if (!newProdNombreConf.trim()) return;
                      setProductosParaConfirmar([...productosParaConfirmar, { nombre: newProdNombreConf.trim(), cantidad: parseInt(newProdCantidadConf) || 1, precio: newProdPrecioConf, nombreOriginal: "" }]);
                      setNewProdNombreConf(""); setNewProdCantidadConf("1"); setNewProdPrecioConf("");
                    }}
                    data-testid="button-add-extra-product"
                    title="Agregar producto"
                  >
                    <Plus size={14} />
                  </Button>
                </div>
                {productosParaConfirmar.some(p => !p.precio || parseFloat(p.precio) === 0) && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> Todos los productos deben tener precio antes de confirmar.
                  </p>
                )}
              </div>

              {/* Auto-calculated total */}
              {(() => {
                const subtotalProductos = productosParaConfirmar.reduce((sum, p) => sum + (p.cantidad * (parseFloat(p.precio) || 0)), 0);
                const delivery = parseFloat(colmadoData?.costoDelivery ?? "0");
                const totalAuto = subtotalProductos + delivery;
                return (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal productos</span>
                      <span className="font-medium">{moneda}{subtotalProductos.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Delivery</span>
                      <span>{moneda}{delivery.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                      <span>Total cliente paga</span>
                      <span>{moneda}{totalAuto.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

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
                    disabled={
                      productosParaConfirmar.length === 0 ||
                      productosParaConfirmar.some(p => !p.precio || parseFloat(p.precio) === 0) ||
                      confirmarPedidoMutation.isPending ||
                      revisarProductosMutation.isPending
                    }
                    onClick={() => {
                      if (!pedidoParaConfirmar) return;
                      // Reserve the WhatsApp tab from the user gesture. If the
                      // integrated channel sends successfully, it is closed.
                      whatsappWindowRef.current = window.open("about:blank", "_blank");
                      const subtotalProductos = productosParaConfirmar.reduce((sum, p) => sum + (p.cantidad * (parseFloat(p.precio) || 0)), 0);
                      const deliveryCostConf = getCostoDeliveryPedido(pedidoParaConfirmar);
                      const totalFinal = (subtotalProductos + deliveryCostConf).toFixed(2);
                      const productosFinales = productosParaConfirmar.map(p => ({
                        nombre: p.nombre,
                        cantidad: p.cantidad,
                        monto: parseFloat(p.precio) || 0,
                        textoOriginal: p.nombreOriginal || p.nombre,
                        encontradoEnMenu: false,
                      }));
                      confirmarPedidoMutation.mutate({
                        pedidoId: pedidoParaConfirmar.id,
                        total: totalFinal,
                        sustituciones: [],
                        productosAdicionales: [],
                        productosActualizados: productosFinales,
                      });
                    }}
                    data-testid="button-enviar-confirmacion"
                  >
                    <Send size={14} className="mr-1" />
                     {(confirmarPedidoMutation.isPending || revisarProductosMutation.isPending) ? "Guardando..." : "Confirmar y enviar por WhatsApp"}
                  </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Revisar y Confirmar modal (transfer payment) ── */}
      <Dialog open={revisarOpen} onOpenChange={(open) => { if (!open) { setRevisarOpen(false); setPedidoParaRevisar(null); setProductosRevisados([]); setSustitucionesRevisar([]); setProductosAdicionalesRevisar([]); setTotalRevisado(""); setNewProductNombreRevisar(""); setNewProductPrecioRevisar(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Revisar y Confirmar Pedido #{pedidoParaRevisar?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {pedidoParaRevisar?.comprobanteUrl && (
              <div>
                <p className="text-sm font-medium mb-1 text-gray-700">Comprobante de transferencia:</p>
                <img
                  src={pedidoParaRevisar.comprobanteUrl}
                  alt="Comprobante"
                  className="w-full max-h-52 object-contain rounded-lg border"
                />
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Productos (haz clic para sustituir)</h4>
              <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_52px_88px_64px_24px] gap-1 text-xs text-gray-500 px-1 mb-1">
                  <span>Producto</span>
                  <span className="text-center">Cant.</span>
                  <span className="text-center">Precio unit.</span>
                  <span className="text-right">Subtotal</span>
                  <span></span>
                </div>
                {productosRevisados.map((prod: any, idx: number) => {
                  const precio = parseFloat(prod.monto || prod.precio || 0);
                  const cantidad = parseInt(prod.cantidad || 1, 10);
                  const subtotal = cantidad * precio;
                  const sinPrecio = !precio;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_52px_88px_64px_24px] gap-1 items-center">
                      <Input
                        value={prod.nombre || prod.name || ""}
                        onChange={(e) => {
                          const updated = [...productosRevisados];
                          updated[idx] = { ...updated[idx], nombre: e.target.value };
                          setProductosRevisados(updated);
                        }}
                        className="h-7 text-xs px-2"
                      />
                      <Input
                        type="number"
                        min="1"
                        value={cantidad}
                        onChange={(e) => {
                          const updated = [...productosRevisados];
                          updated[idx] = { ...updated[idx], cantidad: parseInt(e.target.value) || 1 };
                          setProductosRevisados(updated);
                        }}
                        className="h-7 text-xs text-center px-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={prod.monto || prod.precio || ""}
                        onChange={(e) => {
                          const updated = [...productosRevisados];
                          updated[idx] = { ...updated[idx], monto: parseFloat(e.target.value) || 0, precio: parseFloat(e.target.value) || 0 };
                          setProductosRevisados(updated);
                        }}
                        className={`h-7 text-xs text-right px-2 ${sinPrecio ? "border-red-400 bg-red-50" : ""}`}
                        data-testid={`precio-producto-revisar-${idx}`}
                      />
                      <span className="text-xs text-right font-medium text-gray-700 tabular-nums">
                        {subtotal > 0 ? subtotal.toFixed(0) : <span className="text-red-400">—</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setProductosRevisados(productosRevisados.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 flex items-center justify-center"
                        data-testid={`eliminar-producto-revisar-${idx}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {productosRevisados.length === 0 && (
                  <p className="text-sm text-gray-400 italic text-center py-2">Sin productos. Rechaza el pedido.</p>
                )}
                {/* Add product row */}
                <div className="grid grid-cols-[1fr_52px_88px_auto] gap-1 mt-2">
                  <Input placeholder="Producto" value={newProductNombreRevisar} onChange={(e) => setNewProductNombreRevisar(e.target.value)} className="h-8 text-sm" data-testid="input-new-product-nombre-revisar" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!newProductNombreRevisar.trim()) return; setProductosRevisados([...productosRevisados, { nombre: newProductNombreRevisar.trim(), cantidad: parseInt(newProductPrecioRevisar) ? 1 : 1, monto: 0 }]); setNewProductNombreRevisar(""); setNewProductPrecioRevisar(""); } }} />
                  <Input type="number" min="1" placeholder="1" defaultValue="1" className="h-8 text-sm text-center px-1" />
                  <Input type="number" min="0" placeholder="Precio" value={newProductPrecioRevisar} onChange={(e) => setNewProductPrecioRevisar(e.target.value)} className="h-8 text-sm" data-testid="input-new-product-precio-revisar" />
                  <Button type="button" size="sm" variant="outline" className="h-8 border-green-300 text-green-700 whitespace-nowrap" onClick={() => { if (!newProductNombreRevisar.trim()) return; setProductosRevisados([...productosRevisados, { nombre: newProductNombreRevisar.trim(), cantidad: 1, monto: parseFloat(newProductPrecioRevisar) || 0, precio: parseFloat(newProductPrecioRevisar) || 0 }]); setNewProductNombreRevisar(""); setNewProductPrecioRevisar(""); }} data-testid="button-add-extra-product-revisar">
                    <Plus size={13} className="mr-1" /> Agregar
                  </Button>
                </div>
                {productosRevisados.some((p: any) => !p.monto && !p.precio) && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> Todos los productos deben tener precio.</p>
                )}
              </div>
            </div>

            {/* Auto-calculated total for revisar modal */}
            {(() => {
              const subtotalProductos = productosRevisados.reduce((sum: number, p: any) => sum + (parseInt(p.cantidad || 1) * (parseFloat(p.monto || p.precio || 0))), 0);
              const delivery = getCostoDeliveryPedido(pedidoParaRevisar);
              const totalAuto = subtotalProductos + delivery;
              return (
                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal productos</span>
                    <span className="font-medium">{moneda}{subtotalProductos.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery</span>
                    <span>{moneda}{delivery.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                    <span>Total cliente paga</span>
                    <span>{moneda}{totalAuto.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setRevisarOpen(false); setPedidoParaRevisar(null); setProductosRevisados([]); setSustitucionesRevisar([]); setProductosAdicionalesRevisar([]); setTotalRevisado(""); setNewProductNombreRevisar(""); setNewProductPrecioRevisar(""); }}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={
                  productosRevisados.length === 0 ||
                  productosRevisados.some((p: any) => !p.monto && !p.precio) ||
                  confirmarPagoMutation.isPending ||
                  revisarProductosMutation.isPending
                }
                data-testid="button-confirmar-pago-revisado"
                onClick={async () => {
                  if (!pedidoParaRevisar) return;
                  try {
                    const subtotalProductos = productosRevisados.reduce((sum: number, p: any) => sum + (parseInt(p.cantidad || 1) * (parseFloat(p.monto || p.precio || 0))), 0);
                    const deliveryCostRevisar = getCostoDeliveryPedido(pedidoParaRevisar);
                    const totalConDeliveryRevisar = (subtotalProductos + deliveryCostRevisar).toFixed(2);
                    await revisarProductosMutation.mutateAsync({ pedidoId: pedidoParaRevisar.id, productos: productosRevisados, totalConfirmado: totalConDeliveryRevisar });
                    await confirmarPagoMutation.mutateAsync(pedidoParaRevisar.id);
                    setRevisarOpen(false);
                    setPedidoParaRevisar(null);
                    setProductosRevisados([]);
                    setSustitucionesRevisar([]);
                    setProductosAdicionalesRevisar([]);
                    setTotalRevisado("");
                    setNewProductNombreRevisar("");
                    setNewProductPrecioRevisar("");
                  } catch {
                    toast({ title: "Error al confirmar", variant: "destructive" });
                  }
                }}
              >
                <CheckCircle2 size={14} className="mr-1" />
                {(confirmarPagoMutation.isPending || revisarProductosMutation.isPending) ? "Confirmando..." : "Confirmar Pedido"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Editar Pedido modal (pendiente orders) ── */}
      <Dialog open={editarOpen} onOpenChange={(open) => { if (!open) { setEditarOpen(false); setPedidoParaEditar(null); setProductosEditando([]); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Pedido #{pedidoParaEditar?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Column headers */}
            <div>
              <div className="grid grid-cols-[1fr_52px_88px_64px_24px] gap-1 text-xs text-gray-500 px-1 mb-1">
                <span>Producto</span>
                <span className="text-center">Cant.</span>
                <span className="text-center">Precio unit.</span>
                <span className="text-right">Subtotal</span>
                <span></span>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 space-y-1.5">
                {productosEditando.map((p, idx) => {
                  const precio = parseFloat(p.precio) || 0;
                  const subtotal = p.cantidad * precio;
                  const sinPrecio = !p.precio || precio === 0;
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_52px_88px_64px_24px] gap-1 items-center">
                      <Input
                        value={p.nombre}
                        onChange={(e) => {
                          const updated = [...productosEditando];
                          updated[idx] = { ...updated[idx], nombre: e.target.value };
                          setProductosEditando(updated);
                        }}
                        className="h-7 text-xs px-2"
                      />
                      <Input
                        type="number"
                        min="1"
                        value={p.cantidad}
                        onChange={(e) => {
                          const updated = [...productosEditando];
                          updated[idx] = { ...updated[idx], cantidad: parseInt(e.target.value) || 1 };
                          setProductosEditando(updated);
                        }}
                        className="h-7 text-xs text-center px-1"
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={p.precio}
                        onChange={(e) => {
                          const updated = [...productosEditando];
                          updated[idx] = { ...updated[idx], precio: e.target.value };
                          setProductosEditando(updated);
                        }}
                        className={`h-7 text-xs text-right px-2 ${sinPrecio ? "border-red-400 bg-red-50" : ""}`}
                      />
                      <span className="text-xs text-right font-medium text-gray-700 tabular-nums">
                        {subtotal > 0 ? subtotal.toFixed(0) : <span className="text-red-400">—</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setProductosEditando(productosEditando.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 flex items-center justify-center"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {productosEditando.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2 italic">Sin productos</p>
                )}
              </div>
              {/* Add product row */}
              <div className="grid grid-cols-[1fr_52px_88px_auto] gap-1 mt-2">
                <Input
                  placeholder="Producto"
                  value={newProdNombreEdit}
                  onChange={(e) => setNewProdNombreEdit(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newProdNombreEdit.trim()) return;
                      setProductosEditando([...productosEditando, { nombre: newProdNombreEdit.trim(), cantidad: parseInt(newProdCantidadEdit) || 1, precio: newProdPrecioEdit }]);
                      setNewProdNombreEdit(""); setNewProdCantidadEdit("1"); setNewProdPrecioEdit("");
                    }
                  }}
                />
                <Input type="number" min="1" placeholder="1" value={newProdCantidadEdit} onChange={(e) => setNewProdCantidadEdit(e.target.value)} className="h-8 text-sm text-center px-1" />
                <Input type="number" min="0" placeholder="Precio" value={newProdPrecioEdit} onChange={(e) => setNewProdPrecioEdit(e.target.value)} className="h-8 text-sm" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-green-300 text-green-700 whitespace-nowrap"
                  onClick={() => {
                    if (!newProdNombreEdit.trim()) return;
                    setProductosEditando([...productosEditando, { nombre: newProdNombreEdit.trim(), cantidad: parseInt(newProdCantidadEdit) || 1, precio: newProdPrecioEdit }]);
                    setNewProdNombreEdit(""); setNewProdCantidadEdit("1"); setNewProdPrecioEdit("");
                  }}
                >
                  <Plus size={13} className="mr-1" /> Agregar
                </Button>
              </div>
              {productosEditando.some(p => !p.precio || parseFloat(p.precio) === 0) && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> Hay productos sin precio — el total no se calculará correctamente.
                </p>
              )}
            </div>

            {/* Auto-calculated total */}
            {(() => {
              const subtotalProductos = productosEditando.reduce((sum, p) => sum + (p.cantidad * (parseFloat(p.precio) || 0)), 0);
              const delivery = getCostoDeliveryPedido(pedidoParaEditar);
              const totalAuto = subtotalProductos + delivery;
              return (
                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal productos</span>
                    <span className="font-medium">{moneda}{subtotalProductos.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery</span>
                    <span>{moneda}{delivery.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 border-t pt-1">
                    <span>Total</span>
                    <span>{moneda}{totalAuto.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setEditarOpen(false); setPedidoParaEditar(null); setProductosEditando([]); }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={productosEditando.length === 0 || revisarProductosMutation.isPending}
                onClick={async () => {
                  if (!pedidoParaEditar) return;
                  const subtotalProductos = productosEditando.reduce((sum, p) => sum + (p.cantidad * (parseFloat(p.precio) || 0)), 0);
                  const deliveryCostEdit = getCostoDeliveryPedido(pedidoParaEditar);
                  const totalFinalEdit = (subtotalProductos + deliveryCostEdit).toFixed(2);
                  const productosFinalesEdit = productosEditando.map(p => ({
                    nombre: p.nombre,
                    cantidad: p.cantidad,
                    monto: parseFloat(p.precio) || 0,
                    textoOriginal: p.nombre,
                    encontradoEnMenu: false,
                  }));
                  try {
                    await revisarProductosMutation.mutateAsync({
                      pedidoId: pedidoParaEditar.id,
                      productos: productosFinalesEdit,
                      totalConfirmado: totalFinalEdit,
                    });
                    queryClient.invalidateQueries({ queryKey: ["pedidos"] });
                    toast({ title: "Pedido actualizado" });
                    setEditarOpen(false);
                    setPedidoParaEditar(null);
                    setProductosEditando([]);
                  } catch (err) {
                    toast({ title: "No se pudo actualizar el pedido", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
                  }
                }}
              >
                <CheckCircle2 size={14} className="mr-1" />
                {revisarProductosMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Modal "Ver Pedido" — full invoice detail ── */}
      <Dialog open={verDetalleOpen} onOpenChange={(o) => { if (!o) { setVerDetalleOpen(false); setPedidoVerDetalle(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {pedidoVerDetalle && (() => {
            const p = pedidoVerDetalle;
            interface ProdRow { nombre: string; cantidad: number; precio: number; sustNuevo?: string; }
            const rows: ProdRow[] = [];
            try {
              const prods = JSON.parse(p.productos);
              if (Array.isArray(prods)) {
                prods.forEach((pr: any) => {
                  const nombre = pr.nombre || pr.name || "Producto";
                  const cantidad = parseInt(pr.cantidad) || 1;
                  const precio = parseFloat(pr.monto ?? pr.precio ?? 0);
                  const sust = p.sustituciones?.find((s: any) => s.original === nombre);
                  rows.push({ nombre, cantidad, precio, sustNuevo: sust?.nuevo });
                });
              }
            } catch {}
            const deliveryCosto = getCostoDeliveryPedido(p);
            const totalMostrado = parseFloat(p.totalConfirmado || p.total || "0");
            const subtotalProductos = rows.reduce((s, r) => s + r.cantidad * r.precio, 0);
            const subtotalDisplay = subtotalProductos > 0 ? subtotalProductos : Math.max(0, totalMostrado - deliveryCosto);
            const devuelta = p.necesitaDevuelta && parseFloat(p.montoPago) > 0
              ? parseFloat(p.montoPago) - totalMostrado : null;
            const devueltaCalc = Math.max(0, parseFloat(p.montoPago || "0") - totalMostrado);

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span>Pedido #{p.id}</span>
                    <Badge variant="outline" className={`text-xs ${getEstadoColor(p.estado)}`}>{getEstadoLabel(p.estado)}</Badge>
                  </DialogTitle>
                </DialogHeader>
                <DistanciaPedido
                  pedido={p}
                  compact
                  metricasRuta={metricasRutaPorPedido.get(p.id)}
                  proveedorRutas={rutasData?.providerName}
                  traficoDisponible={rutasData?.trafficEnabled}
                />

                <div className="space-y-4 mt-2">
                  {/* Client info */}
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <p className="font-semibold">{p.clienteNombre}</p>
                      <a href={`tel:${p.clienteWhatsapp}`} className="text-gray-500 flex items-center gap-1 hover:text-gray-700">
                        <Phone size={12} /> {p.clienteWhatsapp}
                      </a>
                      {p.clienteUbicacion && (
                        <p className="text-gray-500 text-xs mt-0.5 whitespace-pre-line leading-snug">
                          <MapPin size={11} className="inline-block mr-0.5 align-text-top shrink-0" />
                          {p.clienteUbicacion}
                        </p>
                      )}
                      {buildMapUrl(p.clienteUbicacion) && (
                        <a href={buildMapUrl(p.clienteUbicacion)} target="_blank" rel="noopener noreferrer" className="text-blue-500 flex items-center gap-1 hover:text-blue-700 text-xs mt-0.5">
                          <ExternalLink size={11} /> Ver en mapa
                        </a>
                      )}
                    </div>
                    <div className="text-right text-xs text-gray-400">
                      <p className="flex items-center gap-1 justify-end"><Clock size={11} />{new Date(p.fechaCreacion).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}</p>
                      {p.metodoPago && <p className="mt-0.5 capitalize">{p.metodoPago === "efectivo" ? "💵 Efectivo" : p.metodoPago === "transferencia" ? "🏦 Transferencia" : "💳 Tarjeta"}</p>}
                    </div>
                  </div>

                  {/* Invoice table */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_40px_76px_72px] gap-x-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 px-3 py-1.5">
                      <span>Descripción</span>
                      <span className="text-center">Cant.</span>
                      <span className="text-right">P. Unit.</span>
                      <span className="text-right">Importe</span>
                    </div>
                    <div className="divide-y">
                      {rows.length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-2 italic">Sin detalle de productos</p>
                      ) : rows.map((r, i) => (
                        <div key={i} className="grid grid-cols-[1fr_40px_76px_72px] gap-x-2 px-3 py-1.5 text-sm items-baseline">
                          <span className="text-gray-800 leading-tight">
                            {r.sustNuevo ? (
                              <>
                                <span className="line-through text-gray-400 text-xs mr-1">{r.nombre}</span>
                                <span className="text-green-700 font-medium">→ {r.sustNuevo}</span>
                              </>
                            ) : r.nombre}
                          </span>
                          <span className="text-center text-gray-600 tabular-nums">{r.cantidad}</span>
                          <span className="text-right text-gray-500 tabular-nums text-xs">
                            {r.precio > 0 ? `${moneda}${r.precio.toFixed(2)}` : <span className="text-gray-300">—</span>}
                          </span>
                          <span className={`text-right font-semibold tabular-nums ${r.precio > 0 ? "text-gray-800" : "text-gray-300"}`}>
                            {r.precio > 0 ? `${moneda}${(r.cantidad * r.precio).toFixed(2)}` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Totals */}
                    <div className="border-t bg-gray-50 px-3 py-2 space-y-1 text-sm">
                      <div className="flex justify-between text-gray-500">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{moneda}{subtotalDisplay.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>{p.tipoEntrega === "pickup" ? "Pickup" : "Delivery"}</span>
                        <span className="tabular-nums">{p.tipoEntrega === "pickup" ? "Sin costo" : `${moneda}${deliveryCosto.toFixed(2)}`}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base border-t pt-1">
                        <span>Total</span>
                        <span className="tabular-nums text-primary">{moneda}{totalMostrado.toFixed(2)}</span>
                      </div>
                      {p.metodoPago === "efectivo" && parseFloat(p.montoPago) > 0 && (
                        <div className="border-t pt-1 space-y-0.5 text-xs text-gray-500">
                          <div className="flex justify-between">
                            <span>Paga con</span>
                            <span className="tabular-nums">{moneda}{parseFloat(p.montoPago).toFixed(2)}</span>
                          </div>
                          {devuelta !== null && devuelta > 0 && (
                            <div className="flex justify-between font-semibold text-orange-600">
                              <span>Devuelta</span>
                              <span className="tabular-nums">{moneda}{devuelta.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* PDF download */}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadPdf(p)}
                      data-testid={`pdf-pedido-${p.id}`}
                    >
                      <FileDown size={14} className="mr-1" /> Descargar PDF
                    </Button>
                  </div>

                  {/* Vuelto al delivery — only for cash orders without cuadre */}
                  {p.metodoPago === "efectivo" && !p.cuadreId && (() => {
                    const yaEntregado = p.vueltoEntregadoAlDelivery;
                    const estadoCerrado = ["entregado", "cancelado", "retorno", "fusionado"].includes(p.estado);
                    if (estadoCerrado && !yaEntregado) return null;
                    const tieneDelivery = !!p.deliveryId;
                    return (
                      <div className="border rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1"><Banknote size={13} className="text-orange-500" /> Devuelta al delivery</p>
                        {yaEntregado ? (
                          <div className="flex items-center gap-1.5 text-green-700 text-xs" data-testid={`badge-vuelto-entregado-${p.id}`}>
                            <CheckCircle2 size={13} className="shrink-0" />
                            <span className="font-medium">Entregada: {moneda}{parseFloat(p.vueltoEntregado ?? "0").toFixed(2)}</span>
                            {p.vueltoEntregadoPor && <span className="text-gray-400">· por {p.vueltoEntregadoPor}</span>}
                          </div>
                        ) : !tieneDelivery ? (
                          <p className="text-xs text-amber-600 flex items-center gap-1" data-testid={`aviso-sin-delivery-${p.id}`}><AlertCircle size={12} /> Asigna un delivery primero</p>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {devueltaCalc > 0 && (
                              <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium" data-testid={`badge-vuelto-calculado-${p.id}`}>{moneda}{devueltaCalc.toFixed(2)} calculado</span>
                            )}
                            <Input
                              type="number"
                              min="0"
                              placeholder={devueltaCalc > 0 ? devueltaCalc.toString() : "Monto"}
                              value={vueltoEdits[p.id] ?? ""}
                              onChange={(e) => setVueltoEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              className="h-7 w-24 text-sm"
                              data-testid={`input-vuelto-${p.id}`}
                            />
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                              disabled={entregarVueltoDeliveryMutation.isPending}
                              onClick={async () => {
                                const monto = vueltoEdits[p.id] ?? (devueltaCalc > 0 ? devueltaCalc.toString() : undefined);
                                await entregarVueltoDeliveryMutation.mutateAsync({ pedidoId: p.id, monto });
                                setVerDetalleOpen(false);
                              }}
                              data-testid={`entregar-vuelto-delivery-${p.id}`}
                            >
                              <Banknote size={12} className="mr-1" /> Entregué la devuelta
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* ── Link preview — mirrors the metadata of the WhatsApp share URL ── */}
      <Dialog open={!!pedidoVistaPrevia} onOpenChange={(open) => { if (!open) setPedidoVistaPrevia(null); }}>
        <DialogContent className="max-w-sm">
          {pedidoVistaPrevia && (() => {
            const negocioNombre = colmadoData?.nombre || "Tu negocio";
            const title = colmadoData?.tituloCompartirPedido?.trim() || `Seguimiento de pedido · ${negocioNombre}`;
            const description = colmadoData?.descripcionCompartirPedido?.trim() || `Sigue el estado del pedido #${pedidoVistaPrevia.id} de ${negocioNombre}.`;
            const imageUrl = colmadoData?.logo
              ? new URL(colmadoData.logo, window.location.origin).toString()
              : `${window.location.origin}/delywa-logo.png`;
            const shareUrl = getTrackingShareUrl(pedidoVistaPrevia.id);

            return (
              <>
                <DialogHeader>
                  <DialogTitle>Vista previa del enlace</DialogTitle>
                </DialogHeader>
                <div className="rounded-xl border bg-white overflow-hidden shadow-sm mt-2" data-testid="vista-previa-tarjeta">
                  <div className="h-40 bg-gray-100 flex items-center justify-center overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={`Logo de ${negocioNombre}`}
                      className="w-full h-full object-contain p-5"
                      onError={(event) => {
                        const image = event.currentTarget;
                        if (!image.src.endsWith("/delywa-logo.png")) {
                          image.src = `${window.location.origin}/delywa-logo.png`;
                        }
                      }}
                    />
                  </div>
                  <div className="p-4 space-y-1">
                    <p className="text-xs text-gray-500 truncate">{new URL(shareUrl).host}</p>
                    <p className="font-semibold text-base leading-snug">{title}</p>
                    <p className="text-sm text-gray-600 leading-snug">{description}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-md bg-gray-50 border px-3 py-2">
                  <p className="text-[11px] font-medium text-gray-500 mb-1">Enlace que se compartirá</p>
                  <p className="text-xs text-gray-700 break-all" data-testid="vista-previa-url">{shareUrl}</p>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* ── Controlled delivery assignment dialog (with devuelta step for cash orders) ── */}
      <Dialog open={asignarDialogOpen} onOpenChange={(o) => { if (!o) { setAsignarDialogOpen(false); setAsignarDialogPedido(null); setAsignarDialogStep("select"); setAsignarDialogVuelto(""); setAsignarDialogDelivery(null); } }}>
        <DialogContent>
          {asignarDialogStep === "select" && (
            <>
              <DialogHeader>
                <DialogTitle>{asignarDialogPedido?.deliveryId ? "Reasignar Delivery" : "Asignar Delivery"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                {deliveries?.map((delivery: any) => (
                  <div key={delivery.id} className="flex items-center gap-2">
                    <button
                      className="flex-1 flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                      onClick={async () => {
                        if (!asignarDialogPedido) return;
                        try {
                          await asignarDeliveryMutation.mutateAsync({ pedidoId: asignarDialogPedido.id, deliveryId: delivery.id });
                          updateEstadoMutation.mutate({ id: asignarDialogPedido.id, estado: "en_camino" });
                        } catch { return; }
                        if (asignarDialogPedido.metodoPago === "efectivo" && !asignarDialogPedido.vueltoEntregadoAlDelivery) {
                          setAsignarDialogDelivery(delivery);
                          setAsignarDialogStep("vuelto");
                        } else {
                          setAsignarDialogOpen(false);
                          setAsignarDialogPedido(null);
                        }
                      }}
                      data-testid={`select-delivery-${delivery.id}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${delivery.estado === "activo" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                        <Truck size={18} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="font-medium">{delivery.nombre}</p>
                        <p className="text-sm text-gray-500">{delivery.whatsappNumero}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${delivery.estado === "activo" ? "bg-green-100 text-green-700" : delivery.estado === "en_descanso" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                        {delivery.estado === "activo" ? "Activo" : delivery.estado === "en_descanso" ? "En descanso" : "Inactivo"}
                      </span>
                    </button>
                    <a
                      href={asignarDialogPedido ? `https://wa.me/${delivery.whatsappNumero?.replace(/\D/g, "")}?text=${generateWhatsAppDeliveryMessage(asignarDialogPedido, colmadoData?.nombre || "", moneda)}` : "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 transition-colors"
                      title="Enviar pedido por WhatsApp"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!asignarDialogPedido) return;
                        try {
                          await asignarDeliveryMutation.mutateAsync({ pedidoId: asignarDialogPedido.id, deliveryId: delivery.id });
                          updateEstadoMutation.mutate({ id: asignarDialogPedido.id, estado: "en_camino" });
                        } catch { return; }
                        if (asignarDialogPedido.metodoPago === "efectivo" && !asignarDialogPedido.vueltoEntregadoAlDelivery) {
                          setAsignarDialogDelivery(delivery);
                          setAsignarDialogStep("vuelto");
                        } else {
                          setAsignarDialogOpen(false);
                          setAsignarDialogPedido(null);
                        }
                      }}
                      data-testid={`whatsapp-delivery-${delivery.id}`}
                    >
                      <ExternalLink size={20} className="text-green-600" />
                    </a>
                  </div>
                ))}
                {(!deliveries || deliveries.length === 0) && (
                  <p className="text-center text-gray-500 py-4">No hay deliveries registrados</p>
                )}
              </div>
            </>
          )}

          {asignarDialogStep === "vuelto" && asignarDialogPedido && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-green-600" />
                  Delivery asignado
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <Truck size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{asignarDialogDelivery?.nombre}</p>
                    <p className="text-xs text-gray-500">Asignado al pedido #{asignarDialogPedido.id}</p>
                  </div>
                </div>

                {(() => {
                  const total = parseFloat(asignarDialogPedido.totalConfirmado || asignarDialogPedido.total || "0");
                  const montoPago = parseFloat(asignarDialogPedido.montoPago || "0");
                  const devueltaCalc = Math.max(0, montoPago - total);
                  return (
                    <div className="border rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        <Banknote size={15} className="text-orange-500" /> Devuelta al delivery
                      </p>
                      {devueltaCalc > 0 && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span>Calculado:</span>
                          <span className="font-semibold text-orange-600">{moneda}{devueltaCalc.toFixed(2)}</span>
                          <span className="text-xs text-gray-400">(paga {moneda}{montoPago} · total {moneda}{total})</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder={devueltaCalc > 0 ? devueltaCalc.toFixed(2) : "Monto"}
                          value={asignarDialogVuelto}
                          onChange={(e) => setAsignarDialogVuelto(e.target.value)}
                          className="h-9 w-32 text-sm"
                          data-testid={`asignar-input-vuelto-${asignarDialogPedido.id}`}
                          autoFocus
                        />
                        <Button
                          className="bg-orange-500 hover:bg-orange-600 text-white"
                          disabled={entregarVueltoDeliveryMutation.isPending}
                          onClick={async () => {
                            if (!asignarDialogPedido) return;
                            const monto = asignarDialogVuelto || (devueltaCalc > 0 ? devueltaCalc.toString() : undefined);
                            await entregarVueltoDeliveryMutation.mutateAsync({ pedidoId: asignarDialogPedido.id, monto });
                            setAsignarDialogOpen(false);
                            setAsignarDialogPedido(null);
                            setAsignarDialogStep("select");
                            setAsignarDialogVuelto("");
                            setAsignarDialogDelivery(null);
                          }}
                          data-testid={`asignar-entregar-vuelto-${asignarDialogPedido.id}`}
                        >
                          <Banknote size={14} className="mr-1" /> Entregué la devuelta
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                <Button
                  variant="ghost"
                  className="w-full text-gray-500 text-sm"
                  onClick={() => {
                    setAsignarDialogOpen(false);
                    setAsignarDialogPedido(null);
                    setAsignarDialogStep("select");
                    setAsignarDialogVuelto("");
                    setAsignarDialogDelivery(null);
                  }}
                >
                  Registrar después
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </NegocioLayout>
  );
}
