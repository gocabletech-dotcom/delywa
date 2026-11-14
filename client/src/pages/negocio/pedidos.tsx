import { useState, useEffect, useRef } from "react";
import { enlaceSeguimiento, type PedidoConCodigo } from "@/lib/seguimiento";
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
  ChevronDown,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
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

const getTrackingShareUrl = (pedido: PedidoConCodigo): string => enlaceSeguimiento(pedido, true);

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
  codigoSeguimiento?: string | null;
  comprobanteUrl?: string | null;
  comprobanteConfirmado?: boolean | null;
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
  retornoRecibidoAt?: string | null;
  retornoRecibidoPor?: string | null;
  reenviadoComoPedidoId?: number | null;
  reenvioDePedidoId?: number | null;
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
  const [masAbierto, setMasAbierto] = useState<number[]>([]);
  const [historialAbierto, setHistorialAbierto] = useState<number | null>(null);
  const [retornoDialog, setRetornoDialog] = useState<{ pedido: PedidoNegocio; paso: "motivo" | "recibir" | "reenviar" } | null>(null);
  const [retornoMotivo, setRetornoMotivo] = useState("");
  const [columnaMovil, setColumnaMovil] = useState<"confirmar" | "preparando" | "camino" | "cerrados">("confirmar");
  // Historial: por defecto el mes en curso; el día es opcional.
  const [filtroFecha, setFiltroFecha] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");
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
    queryKey: ["pedidos", colmadoId, "recientes"],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos?recientes=1`);
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

  const copiarLinkSeguimiento = async (pedido: PedidoConCodigo) => {
    const url = getTrackingShareUrl(pedido);
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

  const compartirLinkSeguimiento = async (pedido: PedidoConCodigo) => {
    const pedidoId = pedido.id;
    const url = getTrackingShareUrl(pedido);
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
    await copiarLinkSeguimiento(pedido);
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
    mutationFn: async ({ id, estado, motivoRetorno }: { id: number; estado: string; motivoRetorno?: string }) => {
      const res = await fetch(`/api/pedidos/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, ...(motivoRetorno ? { motivoRetorno } : {}) }),
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

  const recibirRetornoMutation = useMutation({
    mutationFn: async (pedido: PedidoNegocio) => {
      const res = await fetch(`/api/pedidos/${pedido.id}/recibir-retorno`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la devolución");
      return pedido;
    },
    onSuccess: (pedido) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      toast({ title: "Devolución recibida", description: `El pedido #${pedido.id} quedó cerrado.` });
      // Siguiente paso natural: ofrecer volver a enviarlo.
      setRetornoDialog({ pedido: { ...pedido, retornoRecibidoAt: new Date().toISOString() }, paso: "reenviar" });
    },
    onError: (error: Error) => toast({ title: "No se pudo recibir", description: error.message, variant: "destructive" }),
  });

  const reenviarMutation = useMutation({
    mutationFn: async (pedido: PedidoNegocio) => {
      const res = await fetch(`/api/pedidos/${pedido.id}/reenviar`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo volver a enviar");
      return data as { pedidoId: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      setRetornoDialog(null);
      toast({ title: `Pedido #${data.pedidoId} creado`, description: "Quedó en Preparando, listo para salir otra vez." });
    },
    onError: (error: Error) => toast({ title: "No se pudo volver a enviar", description: error.message, variant: "destructive" }),
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
      toast({ title: "Pago aprobado", description: "Al cliente le llegó la confirmación y el pedido ya se puede entregar." });
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
      // Sin chat ni WhatsApp conectado: se abre WhatsApp con el mensaje listo.
      if (data?.necesitaEnvioManual && data.whatsappNumero && data.mensajeParaEnviar) {
        window.open(`https://wa.me/${String(data.whatsappNumero).replace(/\D/g, "")}?text=${encodeURIComponent(data.mensajeParaEnviar)}`, "_blank");
      }
      if (data?.conversacionNueva) {
        toast({ title: "Conversación reabierta", description: "Se abrió una nueva conversación y se envió el detalle del pedido al cliente" });
      } else {
        toast({ title: "Comprobante pedido", description: "Al cliente le llegaron tus cuentas y que debe enviar la foto del comprobante." });
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
  // Hoy: lo creado hoy, más los retornos que el negocio todavía no ha recibido (sean del día que sean).
  const retornoAbierto = (p: any) => p.estado === "retorno" && !p.retornoRecibidoAt;
  const pedidosActivos = pedidos?.filter((p: any) =>
    (p.fechaCreacion && getBusinessDate(p.fechaCreacion, colmadoData?.codigoPais) === hoy && p.estado !== "fusionado") || retornoAbierto(p)
  ) || [];
  // El historial se pide al servidor por mes: así la pantalla no carga los pedidos de siempre.
  const mesHistorial = filtroFecha ? filtroFecha.slice(0, 7) : (filtroMes || hoy.slice(0, 7));
  const { data: pedidosDelMes, isLoading: cargandoMes } = useQuery<PedidoNegocio[]>({
    queryKey: ["pedidos", colmadoId, "mes", mesHistorial],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos?mes=${mesHistorial}`);
      if (!res.ok) throw new Error("Error al cargar el historial");
      return res.json();
    },
    enabled: !!colmadoId && tabActual === "historial",
  });
  const pedidosHistorial = (pedidosDelMes ?? []).filter((p: any) => {
    if (!filtroFecha) return true;
    return p.fechaCreacion && getBusinessDate(p.fechaCreacion, colmadoData?.codigoPais) === filtroFecha;
  });

  const vendidoHistorial = pedidosHistorial.filter((p: any) => p.estado === "entregado").reduce((t: number, p: any) => t + (parseFloat(p.totalConfirmado || p.total || "0") || 0), 0);
  const ESTADOS_HISTORIAL = [
    { value: "todos", label: "Todos" },
    { value: "entregado", label: "Entregados" },
    { value: "cancelado", label: "Cancelados" },
    { value: "retorno", label: "No entregados" },
    { value: "en_camino", label: "En camino" },
    { value: "listo", label: "Listos" },
    { value: "en_preparacion", label: "En preparación" },
    { value: "pendiente", label: "Por preparar" },
    { value: "pendiente_confirmacion", label: "Por confirmar" },
    { value: "esperando_confirmacion_pago", label: "Revisar pago" },
    { value: "esperando_comprobante", label: "Esperando comprobante" },
    { value: "esperando_pago", label: "Esperando pago" },
    { value: "esperando_confirmacion_sustituciones", label: "Esperando cambio" },
    { value: "fusionado", label: "Unidos a otro" },
  ];

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
      toast({ title: "Devuelta entregada al repartidor", description: "Quedó registrado en el pedido" });
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
      case "pendiente": return "Por preparar";
      case "en_preparacion": return "En Preparación";
      case "listo": return "Listo";
      case "en_camino": return "En Camino";
      case "entregado": return "Entregado";
      case "cancelado": return "Cancelado";
      case "retorno": return "No entregado";
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

  // ── Tablero: los pedidos de hoy agrupados por lo que toca hacer ──
  const COLUMNAS = [
    { clave: "confirmar", titulo: "Por confirmar", punto: "bg-amber-500", vacio: "Nada por confirmar", estados: ["pendiente_confirmacion", "esperando_comprobante", "esperando_pago", "esperando_confirmacion_pago", "esperando_confirmacion_sustituciones"] },
    { clave: "preparando", titulo: "Preparando", punto: "bg-blue-600", vacio: "Nada en preparación", estados: ["pendiente", "en_preparacion", "listo"] },
    { clave: "camino", titulo: "En camino", punto: "bg-primary", vacio: "Nadie en camino", estados: ["en_camino", "llegando"] },
    { clave: "cerrados", titulo: "Cerrados hoy", punto: "bg-slate-400", vacio: "Todavía no hay entregas", estados: [] as string[] },
  ] as const;
  type ClaveColumna = typeof COLUMNAS[number]["clave"];
  const columnaDe = (estado: string): ClaveColumna => (COLUMNAS.find((c) => (c.estados as readonly string[]).includes(estado))?.clave ?? "cerrados");
  // Un retorno que el repartidor todavía trae de vuelta sigue en la calle: va con "En camino".
  const columnaDePedido = (p: PedidoNegocio): ClaveColumna => (retornoAbierto(p) ? "camino" : columnaDe(p.estado));
  const porColumna = { confirmar: [], preparando: [], camino: [], cerrados: [] } as Record<ClaveColumna, PedidoNegocio[]>;
  for (const p of pedidosActivos as PedidoNegocio[]) porColumna[columnaDePedido(p)].push(p);
  // Lo más viejo primero donde hay que actuar; lo más reciente primero en los cerrados.
  for (const c of ["confirmar", "preparando", "camino"] as const) porColumna[c].sort((a, b) => new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime());
  const vendidoHoy = porColumna.cerrados.filter((p) => p.estado === "entregado").reduce((s, p) => s + (parseFloat(p.totalConfirmado || p.total || "0") || 0), 0);
  const MOTIVOS_RETORNO = ["Cliente ausente", "No contesta el teléfono", "Dirección no encontrada", "Cliente rechazó el pedido", "No tenía el dinero", "Producto dañado"];
  const productosDe = (p: PedidoNegocio): Array<{ nombre: string; cantidad: number }> => {
    try {
      const lista = JSON.parse(p.productos);
      if (Array.isArray(lista)) return lista.map((x: any) => ({ nombre: String(x.nombre || x.name || "Producto"), cantidad: parseInt(x.cantidad) || 1 }));
    } catch { /* texto libre */ }
    return [{ nombre: String(p.productos || "Productos"), cantidad: 1 }];
  };
  /** El siguiente paso de cada pedido; lo demás queda en "Más". */
  const accionPrincipal = (pedido: PedidoNegocio): { texto: string; accion: () => void } | null => {
    switch (pedido.estado) {
      case "pendiente_confirmacion": return { texto: "Confirmar pedido", accion: () => openConfirmModal(pedido) };
      case "esperando_pago": return { texto: "Ya pagó · confirmar", accion: () => updateEstadoMutation.mutate({ id: pedido.id, estado: "pendiente" }) };
      case "en_camino":
      case "llegando":
        // Transferencia sin aprobar: primero se aprueba el pago; después se puede entregar.
        if (pedido.metodoPago === "transferencia" && !pedido.comprobanteConfirmado) return { texto: "Aprobar pago", accion: () => confirmarPagoMutation.mutate(pedido.id) };
        return { texto: "Marcar entregado", accion: () => updateEstadoMutation.mutate({ id: pedido.id, estado: "entregado" }) };
      // Preparación (antes estaba en la pantalla "Cocina").
      case "pendiente": return { texto: "Empezar a preparar", accion: () => updateEstadoMutation.mutate({ id: pedido.id, estado: "en_preparacion" }) };
      case "en_preparacion": return { texto: "Marcar listo", accion: () => updateEstadoMutation.mutate({ id: pedido.id, estado: "listo" }) };
      case "listo": return pedido.tipoEntrega === "pickup"
        ? { texto: "Entregado al cliente", accion: () => updateEstadoMutation.mutate({ id: pedido.id, estado: "entregado" }) }
        : { texto: "Asignar repartidor", accion: () => abrirAsignar(pedido) };
      // Retorno: primero se recibe lo que trae el repartidor; después se puede volver a enviar.
      case "retorno":
        if (!pedido.retornoRecibidoAt) return { texto: "Recibir devolución", accion: () => setRetornoDialog({ pedido, paso: "recibir" }) };
        if (!pedido.reenviadoComoPedidoId) return { texto: "Volver a enviar", accion: () => setRetornoDialog({ pedido, paso: "reenviar" }) };
        return null;
      default: return null;
    }
  };
  const abrirAsignar = (pedido: PedidoNegocio, paso: "select" | "vuelto" = "select") => {
    setAsignarDialogPedido(pedido);
    setAsignarDialogStep(paso);
    setAsignarDialogVuelto("");
    setAsignarDialogDelivery(paso === "vuelto" ? (deliveries as any[] | undefined)?.find((d) => d.id === pedido.deliveryId) ?? null : null);
    setAsignarDialogOpen(true);
  };
  const hace = (fecha: string | number | Date) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
    if (min < 1) return "ahora";
    if (min < 60) return `hace ${min} min`;
    return new Date(fecha).toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
  };

  const tarjetaPedido = (pedido: PedidoNegocio) => (
                <div key={pedido.id} className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm" data-testid={`pedido-card-${pedido.id}`}>
                  {/* ── Encabezado: número, cliente y total ── */}
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <button type="button" className="min-w-0 text-left" onClick={() => { setPedidoVerDetalle(pedido); setVerDetalleOpen(true); }}>
                      <p className="font-bold text-[15px] leading-tight line-clamp-2 break-words text-slate-900">#{pedido.id} · {pedido.clienteNombre}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock size={11} />
                        {tabActual === "activos" ? hace(pedido.fechaCreacion) : new Date(pedido.fechaCreacion).toLocaleString("es-DO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </button>
                    <div className="text-right shrink-0">
                      {parseFloat(pedido.totalConfirmado || pedido.total || "0") > 0 ? (
                        <p className="font-bold text-[15px] text-slate-900">{moneda}{parseFloat(pedido.totalConfirmado || pedido.total || "0").toFixed(2)}</p>
                      ) : (
                        <p className="text-xs font-semibold text-amber-700">Sin precio</p>
                      )}
                      {pedido.necesitaDevuelta && parseFloat(pedido.montoPago) > 0 && (
                        <p className="text-[11px] text-amber-700">Devuelta: {moneda}{(parseFloat(pedido.montoPago) - parseFloat(pedido.totalConfirmado || pedido.total || "0")).toFixed(2)}</p>
                      )}
                    </div>
                  </div>

                  {/* ── Productos ── */}
                  <p className="text-[13px] text-slate-700 leading-snug line-clamp-2">
                    {(() => {
                      try {
                        const prods = JSON.parse(pedido.productos);
                        if (!Array.isArray(prods)) return pedido.productos;
                        return prods.map((p: any) => {
                          const nombre = p.nombre || p.name || "Producto";
                          const cant = parseInt(p.cantidad) || 1;
                          const sust = pedido.sustituciones?.find((s: any) => s.original === nombre);
                          const nomFinal = sust?.nuevo ? `${nombre}→${sust.nuevo}` : nombre;
                          return cant > 1 ? `${cant} ${nomFinal}` : nomFinal;
                        }).join(" · ");
                      } catch { return pedido.productos; }
                    })()}
                  </p>

                  {/* ── Etiquetas: estado, entrega y pago ── */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`text-[11px] h-6 px-2 rounded-full ${getEstadoColor(pedido.estado)}`}>
                      {getEstadoLabel(pedido.estado)}
                    </Badge>
                    <span className="text-[11px] h-6 px-2 rounded-full bg-slate-100 text-slate-700 inline-flex items-center">
                      {pedido.tipoEntrega === "pickup" ? "Recoge en el negocio" : "Delivery"}
                    </span>
                    {pedido.metodoPago && (
                      <span className="text-[11px] h-6 px-2 rounded-full bg-slate-100 text-slate-700 inline-flex items-center">
                        {pedido.metodoPago === "efectivo" ? "Efectivo" : pedido.metodoPago === "transferencia" ? "Transferencia" : "Tarjeta"}
                      </span>
                    )}
                    <button type="button" className="ml-auto text-xs font-semibold text-primary min-h-[28px] px-1" onClick={() => { setPedidoVerDetalle(pedido); setVerDetalleOpen(true); }} data-testid={`ver-pedido-${pedido.id}`}>
                      Ver detalle
                    </button>
                  </div>
                  {pedido.estado === "retorno" && pedido.motivoRetorno && (
                    <p className="text-xs text-slate-500 italic" data-testid={`motivo-retorno-${pedido.id}`}>{pedido.motivoRetorno}</p>
                  )}
                  {pedido.estado === "fusionado" && pedido.fusionadoEnPedidoId && (
                    <p className="text-xs text-violet-700" data-testid={`pedido-fusionado-en-${pedido.id}`}>Incluido en #{pedido.fusionadoEnPedidoId}</p>
                  )}

                  {/* ── Retorno: no se entregó; el repartidor lo trae de vuelta ── */}
                  {pedido.estado === "retorno" && (() => {
                    const devuelta = pedido.vueltoEntregadoAlDelivery ? parseFloat(pedido.vueltoEntregado || "0") || 0 : 0;
                    const repartidor = (deliveries as any[] | undefined)?.find((d) => d.id === pedido.deliveryId)?.nombre;
                    if (!pedido.retornoRecibidoAt) {
                      return (
                        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[13px] text-red-900 leading-snug" data-testid={`retorno-abierto-${pedido.id}`}>
                          <p className="font-semibold">No se pudo entregar{pedido.motivoRetorno ? `: ${pedido.motivoRetorno}` : ""}</p>
                          <p className="mt-0.5">{repartidor ? <span className="capitalize">{repartidor}</span> : "El repartidor"} lo trae de vuelta al negocio{devuelta > 0 ? `, junto con la devuelta de ${moneda}${devuelta.toLocaleString("es-DO")}` : ""}.</p>
                          <button
                            type="button"
                            className="mt-2 w-full min-h-[40px] rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-60"
                            disabled={updateEstadoMutation.isPending}
                            onClick={() => updateEstadoMutation.mutate({ id: pedido.id, estado: "entregado" })}
                            data-testid={`entregar-retorno-${pedido.id}`}
                          >
                            El cliente apareció: marcar entregado
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-[13px] text-slate-700 leading-snug" data-testid={`retorno-recibido-${pedido.id}`}>
                        <p><b>Devuelto al negocio</b>{pedido.motivoRetorno ? ` · ${pedido.motivoRetorno}` : ""}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Recibido {new Date(pedido.retornoRecibidoAt).toLocaleString("es-DO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{pedido.retornoRecibidoPor ? ` por ${pedido.retornoRecibidoPor}` : ""}
                          {pedido.reenviadoComoPedidoId ? ` · se volvió a enviar como #${pedido.reenviadoComoPedidoId}` : ""}
                        </p>
                      </div>
                    );
                  })()}
                  {pedido.estado === "entregado" && pedido.motivoRetorno && (
                    <p className="text-xs text-slate-600" data-testid={`entregado-tras-retorno-${pedido.id}`}>Se entregó después de un intento fallido ({pedido.motivoRetorno}).</p>
                  )}
                  {pedido.reenvioDePedidoId && (
                    <p className="text-xs font-medium text-slate-600" data-testid={`reenvio-de-${pedido.id}`}>Reenvío del pedido #{pedido.reenvioDePedidoId}</p>
                  )}

                  {/* ── Transferencia: el cliente manda la foto del comprobante y el colmado aprueba el pago ── */}
                  {pedido.metodoPago === "transferencia" && !["cancelado", "fusionado", "pendiente_confirmacion"].includes(pedido.estado) && (pedido.estado !== "entregado" || !pedido.comprobanteConfirmado) && (
                    pedido.comprobanteConfirmado ? (
                      <p className="text-xs font-medium text-emerald-700" data-testid={`pago-aprobado-${pedido.id}`}>🏦 Transferencia aprobada ✓</p>
                    ) : (
                      <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5 text-[13px] text-indigo-950 leading-snug" data-testid={`transferencia-${pedido.id}`}>
                        <p className="font-semibold">{pedido.comprobanteUrl ? "🏦 El cliente envió el comprobante" : "🏦 Transferencia: falta el comprobante"}</p>
                        <p className="mt-0.5 text-indigo-900/80">{pedido.comprobanteUrl ? "Revísalo en tu banco y aprueba el pago." : "Pídeselo al cliente: le llegan tus cuentas y cómo enviar la foto."} No se puede entregar hasta aprobarlo.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {pedido.comprobanteUrl ? (
                            <a href={pedido.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[38px] rounded-lg border border-indigo-300 bg-white px-3 font-semibold text-indigo-800" data-testid={`ver-comprobante-tarjeta-${pedido.id}`}>📄 Ver comprobante</a>
                          ) : (
                            <button type="button" className="min-h-[38px] rounded-lg border border-indigo-300 bg-white px-3 font-semibold text-indigo-800 disabled:opacity-60" disabled={avisarComprobanteMutation.isPending} onClick={() => avisarComprobanteMutation.mutate(pedido.id)} data-testid={`pedir-comprobante-${pedido.id}`}>
                              <Send size={13} className="inline mr-1" /> Pedir comprobante
                            </button>
                          )}
                          {/* En camino, "Aprobar pago" ya es el botón grande de la tarjeta. */}
                          {!["en_camino", "llegando"].includes(pedido.estado) && (
                            <button type="button" className="min-h-[38px] rounded-lg bg-indigo-700 px-3 font-semibold text-white disabled:opacity-60" disabled={confirmarPagoMutation.isPending} onClick={() => confirmarPagoMutation.mutate(pedido.id)} data-testid={`aprobar-pago-${pedido.id}`}>
                              Aprobar pago
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {/* ── Devuelta: el negocio le da el cambio al repartidor y él lo cuadra al volver ── */}
                  {(() => {
                    if (pedido.metodoPago !== "efectivo" || pedido.tipoEntrega === "pickup" || !["en_camino", "llegando"].includes(pedido.estado)) return null;
                    const totalPedido = parseFloat(pedido.totalConfirmado || pedido.total || "0");
                    const calculada = Math.max(0, (parseFloat(pedido.montoPago) || 0) - totalPedido);
                    if (pedido.vueltoEntregadoAlDelivery) {
                      return (
                        <p className="rounded-xl bg-primary/10 text-primary text-[13px] font-medium px-3 py-2" data-testid={`devuelta-entregada-${pedido.id}`}>
                          El repartidor lleva {moneda}{(parseFloat(pedido.vueltoEntregado || "0") || 0).toLocaleString("es-DO")} de devuelta. Lo cuadra al volver.
                        </p>
                      );
                    }
                    if (calculada <= 0) return null;
                    return (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2" data-testid={`devuelta-pendiente-${pedido.id}`}>
                        <p className="text-[13px] text-amber-900 leading-snug">Falta darle la devuelta al repartidor: <b>{moneda}{calculada.toLocaleString("es-DO")}</b></p>
                        <Button size="sm" variant="outline" className="h-9 rounded-lg border-amber-400 text-amber-900 bg-white shrink-0" onClick={() => abrirAsignar(pedido, "vuelto")} data-testid={`registrar-devuelta-${pedido.id}`}>
                          Registrar
                        </Button>
                      </div>
                    );
                  })()}
                  {pedido.tipoEntrega !== "pickup" && ["pendiente", "en_preparacion"].includes(pedido.estado) && (
                    <button type="button" className="self-start text-xs font-semibold text-primary min-h-[28px]" onClick={() => abrirAsignar(pedido)} data-testid={`asignar-ya-${pedido.id}`}>
                      Asignar repartidor ya
                    </button>
                  )}

                  {/* ── El paso que toca, en un solo botón ── */}
                  {(() => {
                    const principal = accionPrincipal(pedido);
                    // Sin un paso claro, las opciones salen abiertas (menos en los pedidos ya cerrados).
                    const abiertoDeEntrada = !principal && tabActual === "activos" && columnaDePedido(pedido) !== "cerrados";
                    const abierto = abiertoDeEntrada !== masAbierto.includes(pedido.id);
                    return (
                      <>
                        <div className="flex gap-2">
                          {principal && (
                            <Button className="flex-1 min-w-0 h-auto min-h-[44px] py-2 px-3 rounded-xl text-sm font-semibold whitespace-normal leading-tight" onClick={principal.accion} disabled={updateEstadoMutation.isPending} data-testid={`principal-${pedido.id}`}>
                              {principal.texto}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            className={`h-auto min-h-[44px] rounded-xl text-sm font-semibold border-slate-300 text-slate-800 shrink-0 ${principal ? "px-2.5" : "flex-1"}`}
                            aria-expanded={abierto}
                            aria-label={principal ? (abierto ? "Ocultar opciones" : "Más opciones") : undefined}
                            title={principal ? "Más opciones" : undefined}
                            onClick={() => setMasAbierto((ids) => (ids.includes(pedido.id) ? ids.filter((i) => i !== pedido.id) : [...ids, pedido.id]))}
                            data-testid={`mas-opciones-${pedido.id}`}
                          >
                            {/* En tarjetas angostas (columnas del tablero) solo el ícono, para que el botón principal no se corte. */}
                            {principal
                              ? <><span className="md:hidden 2xl:inline">{abierto ? "Ocultar" : "Más"}</span><MoreHorizontal size={18} className="hidden md:block 2xl:hidden" /></>
                              : abierto ? "Ocultar" : "Opciones"}
                            <ChevronDown size={16} className={`transition-transform ${principal ? "ml-1 md:hidden 2xl:block" : "ml-1"} ${abierto ? "rotate-180" : ""}`} />
                          </Button>
                        </div>
                        <div className={abierto ? "flex flex-col gap-2 rounded-xl bg-slate-50 border border-slate-200 p-2.5" : "hidden"}>
                  <DistanciaPedido
                    pedido={pedido}
                    metricasRuta={metricasRutaPorPedido.get(pedido.id)}
                    proveedorRutas={rutasData?.providerName}
                    traficoDisponible={rutasData?.trafficEnabled}
                  />

                  {/* ── Row 2: action buttons (wrap freely, never overflow) ── */}
                                    <div className="flex gap-1.5 flex-wrap empty:hidden">
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
                              onClick={() => copiarLinkSeguimiento(pedido)}
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
                              onClick={() => compartirLinkSeguimiento(pedido)}
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
                                    <DialogTitle>{pedido.deliveryId ? "Cambiar de repartidor" : "Asignar repartidor"}</DialogTitle>
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
                          {["en_camino", "llegando"].includes(pedido.estado) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => { setRetornoMotivo(""); setRetornoDialog({ pedido, paso: "motivo" }); }}
                              data-testid={`no-se-pudo-entregar-${pedido.id}`}
                            >
                              <RotateCcw size={14} className="mr-1" /> No se pudo entregar
                            </Button>
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
                      </>
                    );
                  })()}
                </div>
  );

  return (
    <NegocioLayout title="Pedidos" activeNav="pedidos" headerRight={<><Link href="/negocio/cocina"><Button variant="outline" size="sm" className="h-10 rounded-xl border-slate-300 text-slate-800 text-sm font-semibold" data-testid="link-preparacion">Preparación</Button></Link><Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100" onClick={refrescar} disabled={refrescando} title="Refrescar" data-testid="button-refresh"><RefreshCw size={18} className={`sm:hidden ${refrescando ? "animate-spin" : ""}`} /><RefreshCw size={20} className={`hidden sm:block ${refrescando ? "animate-spin" : ""}`} /></Button></>}>
      {/* Sidebar */}

      {/* Main Content */}

        {/* ── Tabs ── */}
        <div className="bg-white border-b shrink-0">
          <div className="flex flex-wrap items-center gap-0 px-4">
            {(["activos", "historial"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setTabActual(tab); setFiltroEstado("todos"); }}
                className={`px-4 min-h-[44px] text-sm border-b-2 transition-colors ${
                  tabActual === tab
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-slate-600 font-medium hover:text-slate-900"
                }`}
              >
                {tab === "activos" ? "Hoy" : "Historial"}
                <span className="ml-1.5 text-xs opacity-60">
                  {tab === "activos" ? `(${pedidosActivos.length})` : pedidosDelMes ? `(${pedidosHistorial.length})` : ""}
                </span>
              </button>
            ))}
          </div>
          {/* ── Filtros del historial: mes, día y estado ── */}
          {tabActual === "historial" && (
            <div className="px-3 sm:px-4 lg:px-6 pt-3 pb-3 border-t border-slate-200 flex flex-col gap-3" data-testid="filtros-historial">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 flex-1 min-w-[130px] sm:flex-none sm:w-44">
                  Mes
                  <input
                    type="month"
                    value={filtroMes || hoy.slice(0, 7)}
                    max={hoy.slice(0, 7)}
                    onChange={(e) => { setFiltroMes(e.target.value || hoy.slice(0, 7)); setFiltroFecha(""); setFiltroEstado("todos"); }}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-normal text-slate-900"
                    data-testid="filtro-mes"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 flex-1 min-w-[130px] sm:flex-none sm:w-44">
                  Un día (opcional)
                  <input
                    type="date"
                    value={filtroFecha}
                    max={hoy}
                    onChange={(e) => { setFiltroFecha(e.target.value); setFiltroEstado("todos"); }}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-normal text-slate-900"
                    data-testid="filtro-dia"
                  />
                </label>
                {filtroFecha && (
                  <button type="button" className="h-11 px-2 text-sm font-semibold text-primary" onClick={() => setFiltroFecha("")} data-testid="filtro-todo-el-mes">Ver todo el mes</button>
                )}
                <p className="w-full sm:w-auto sm:ml-auto text-sm text-slate-600 sm:pb-2.5" data-testid="resumen-historial">
                  <b className="text-slate-900">{pedidosHistorial.length}</b> pedido{pedidosHistorial.length === 1 ? "" : "s"} · <b className="text-slate-900">{moneda}{vendidoHistorial.toLocaleString("es-DO", { maximumFractionDigits: 0 })}</b> entregado
                </p>
              </div>
              {/* Solo salen los estados que tienen pedidos */}
              <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist" aria-label="Estado">
                {ESTADOS_HISTORIAL.map((e) => {
                  const cnt = e.value === "todos" ? pedidosHistorial.length : pedidosHistorial.filter((p: any) => p.estado === e.value).length;
                  if (e.value !== "todos" && cnt === 0 && filtroEstado !== e.value) return null;
                  const activo = filtroEstado === e.value;
                  return (
                    <button
                      key={e.value}
                      type="button"
                      role="tab"
                      aria-selected={activo}
                      onClick={() => setFiltroEstado(e.value)}
                      data-testid={`filter-chip-${e.value}`}
                      className={`h-10 px-4 rounded-full text-sm whitespace-nowrap shrink-0 border ${activo ? "bg-primary border-primary text-primary-foreground font-semibold" : "bg-white border-slate-300 text-slate-800 font-medium"}`}
                    >
                      {e.label} <span className={activo ? "opacity-80" : "text-slate-500"}>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
          {isLoading || (tabActual === "historial" && cargandoMes) ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="text-center py-16">
              <Package size={60} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No hay pedidos</h3>
              <p className="text-gray-500">{tabActual === "historial" ? (filtroFecha ? "No hay pedidos ese día" : "No hay pedidos en ese mes") : "Los pedidos aparecerán aquí cuando los clientes ordenen por WhatsApp"}</p>
            </div>
          ) : (
            tabActual === "activos" && filtroEstado === "todos" ? (
              <div className="space-y-4">
                {/* Resumen del día */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {COLUMNAS.map((col) => (
                    <div key={col.clave} className="hidden md:block rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs text-slate-500">{col.titulo}</p>
                      <p className={`text-2xl font-bold ${col.clave === "confirmar" && porColumna[col.clave].length > 0 ? "text-amber-700" : "text-slate-900"}`} data-testid={`resumen-${col.clave}`}>{porColumna[col.clave].length}</p>
                    </div>
                  ))}
                  {/* Tarjeta blanca como en las demás pantallas (antes era un bloque verde). En el celular, en una línea. */}
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 col-span-2 md:col-span-4 lg:col-span-1 flex items-center justify-between gap-3 lg:block">
                    <p className="text-xs text-slate-500">Vendido hoy (entregados)</p>
                    <p className="text-xl lg:text-2xl font-bold text-slate-900" data-testid="resumen-vendido">{moneda}{vendidoHoy.toLocaleString("es-DO", { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
                {/* En el celular se ve una columna a la vez */}
                <div className="flex gap-2 overflow-x-auto md:hidden -mx-1 px-1 pb-1" role="tablist" aria-label="Estado del pedido">
                  {COLUMNAS.map((col) => (
                    <button key={col.clave} type="button" role="tab" aria-selected={columnaMovil === col.clave} onClick={() => setColumnaMovil(col.clave)} data-testid={`columna-tab-${col.clave}`}
                      className={`h-11 px-4 rounded-full text-sm whitespace-nowrap shrink-0 ${columnaMovil === col.clave ? "bg-green-50 text-green-900 border border-green-600 font-semibold" : "bg-white border border-slate-300 text-slate-800 font-medium"}`}>
                      {col.titulo} {porColumna[col.clave].length}
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 items-start">
                  {COLUMNAS.map((col) => (
                    <section key={col.clave} className={`${columnaMovil === col.clave ? "flex" : "hidden"} md:flex flex-col gap-2.5 min-w-0`} aria-label={col.titulo} data-testid={`columna-${col.clave}`}>
                      <h2 className="hidden md:flex items-center gap-2 text-sm font-bold text-slate-900 px-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${col.punto}`} />
                        {col.titulo}
                        <span className="font-medium text-slate-500">{porColumna[col.clave].length}</span>
                      </h2>
                      {porColumna[col.clave].length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{col.vacio}</p>
                      ) : porColumna[col.clave].map((pedido: PedidoNegocio) => tarjetaPedido(pedido))}
                    </section>
                  ))}
                </div>
              </div>
            ) : (
            tabActual === "historial" ? (
              <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden max-w-4xl" data-testid="lista-historial">
                {pedidosFiltrados.map((pedido: PedidoNegocio) => {
                  const abierto = historialAbierto === pedido.id;
                  const totalFila = parseFloat(pedido.totalConfirmado || pedido.total || "0");
                  return (
                    <div key={pedido.id}>
                      <button
                        type="button"
                        aria-expanded={abierto}
                        onClick={() => setHistorialAbierto(abierto ? null : pedido.id)}
                        className={`w-full text-left px-3.5 sm:px-4 py-3 flex items-center gap-3 ${abierto ? "bg-slate-50" : "hover:bg-slate-50"}`}
                        data-testid={`fila-historial-${pedido.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[15px] text-slate-900 truncate">#{pedido.id} · {pedido.clienteNombre}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(pedido.fechaCreacion).toLocaleString("es-DO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            {pedido.tipoEntrega === "pickup" ? " · recoge" : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-[15px] text-slate-900">{totalFila > 0 ? `${moneda}${totalFila.toLocaleString("es-DO", { maximumFractionDigits: 2 })}` : "—"}</p>
                          <Badge variant="outline" className={`mt-0.5 text-[11px] h-5 px-2 rounded-full ${getEstadoColor(pedido.estado)}`}>{getEstadoLabel(pedido.estado)}</Badge>
                        </div>
                        <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
                      </button>
                      {abierto && <div className="px-2.5 sm:px-3 pb-3 bg-slate-50">{tarjetaPedido(pedido)}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3 items-start">
              {pedidosFiltrados.map((pedido: PedidoNegocio) => tarjetaPedido(pedido))}
            </div>
            )
            )
          )}
        </main>

      {/* Confirmation Modal */}
      {/* Confirmar y poner precios: panel fijo a la derecha (pantalla completa en el celular).
          No se cierra al tocar fuera ni con Escape, para no perder los precios escritos; se cierra con Cancelar o la X. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="left-auto right-0 top-0 translate-x-0 translate-y-0 h-[100dvh] max-h-[100dvh] w-full max-w-full sm:max-w-xl grid-cols-[minmax(0,1fr)] rounded-none sm:rounded-l-2xl overflow-y-auto overflow-x-hidden content-start px-4 sm:px-6 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 pb-0"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          data-testid="panel-confirmar"
        >
          <DialogHeader className="text-left">
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
                <div className="grid grid-cols-[minmax(0,1fr)_40px_72px_48px_20px] gap-1 text-xs text-gray-500 px-1 mb-1">
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
                      <div key={idx} className="grid grid-cols-[minmax(0,1fr)_40px_72px_48px_20px] gap-1 items-center">
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
                <div className="grid grid-cols-[minmax(0,1fr)_40px_72px_32px] gap-1 mt-2">
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

              <div className="flex gap-2 sticky bottom-0 -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 bg-background border-t border-slate-200 mt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConfirmOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="flex-[2] min-w-0 h-auto min-h-[44px] py-2 whitespace-normal leading-tight bg-green-600 hover:bg-green-700"
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
                     {(confirmarPedidoMutation.isPending || revisarProductosMutation.isPending) ? "Guardando..." : "Confirmar y enviar al cliente"}
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
                        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1"><Banknote size={13} className="text-orange-500" /> Devuelta para el repartidor</p>
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
            const shareUrl = getTrackingShareUrl(pedidoVistaPrevia);

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
      {/* ── Retorno: motivo, recibir la devolución y volver a enviar ── */}
      <Dialog open={!!retornoDialog} onOpenChange={(o) => { if (!o) { setRetornoDialog(null); setRetornoMotivo(""); } }}>
        <DialogContent className="max-w-md rounded-2xl" data-testid="retorno-dialog">
          {retornoDialog?.paso === "motivo" && (
            <>
              <DialogHeader>
                <DialogTitle>No se pudo entregar el pedido #{retornoDialog.pedido.id}</DialogTitle>
                <DialogDescription>El repartidor lo trae de vuelta. Al cliente le avisamos por el chat.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                {MOTIVOS_RETORNO.map((m) => (
                  <Button key={m} variant="outline" className="h-11 justify-start rounded-xl border-slate-300 text-slate-800 text-[15px]" disabled={updateEstadoMutation.isPending}
                    onClick={() => updateEstadoMutation.mutate({ id: retornoDialog.pedido.id, estado: "retorno", motivoRetorno: m }, { onSuccess: () => setRetornoDialog(null) })}
                    data-testid={`panel-motivo-${m.replace(/\s+/g, "-").toLowerCase()}`}>
                    {m}
                  </Button>
                ))}
                <div className="flex gap-2">
                  <Input value={retornoMotivo} onChange={(e) => setRetornoMotivo(e.target.value)} placeholder="Otro motivo" className="h-11 rounded-xl" data-testid="panel-motivo-otro" />
                  <Button className="h-11 rounded-xl" disabled={!retornoMotivo.trim() || updateEstadoMutation.isPending}
                    onClick={() => updateEstadoMutation.mutate({ id: retornoDialog.pedido.id, estado: "retorno", motivoRetorno: retornoMotivo.trim() }, { onSuccess: () => { setRetornoDialog(null); setRetornoMotivo(""); } })}>
                    Guardar
                  </Button>
                </div>
              </div>
            </>
          )}
          {retornoDialog?.paso === "recibir" && (() => {
            const p = retornoDialog.pedido;
            const devuelta = p.vueltoEntregadoAlDelivery ? parseFloat(p.vueltoEntregado || "0") || 0 : 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Recibir la devolución del pedido #{p.id}</DialogTitle>
                  <DialogDescription>Revisa que el repartidor trajo todo de vuelta.</DialogDescription>
                </DialogHeader>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-200">
                  {productosDe(p).map((x, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 text-sm"><span>{x.nombre}</span><span className="font-semibold">{x.cantidad}</span></div>
                  ))}
                </div>
                {devuelta > 0 && (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
                    También debe traer la devuelta de <b>{moneda}{devuelta.toLocaleString("es-DO")}</b>. Ese dinero se cuadra con el repartidor en <b>Cuadres</b>.
                  </p>
                )}
                {p.motivoRetorno && <p className="text-sm text-slate-600">Motivo: {p.motivoRetorno}</p>}
                <DialogFooter className="gap-2">
                  <Button variant="outline" className="h-11 rounded-xl" onClick={() => setRetornoDialog(null)}>Todavía no</Button>
                  <Button className="h-11 rounded-xl" disabled={recibirRetornoMutation.isPending} onClick={() => recibirRetornoMutation.mutate(p)} data-testid="confirmar-recibir-retorno">
                    {recibirRetornoMutation.isPending ? "Guardando…" : "Sí, lo recibí"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
          {retornoDialog?.paso === "reenviar" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Volver a enviar el pedido #{retornoDialog.pedido.id}?</DialogTitle>
                <DialogDescription>
                  Se crea un pedido nuevo con los mismos productos, el mismo total y la misma dirección, listo para preparar. Al cliente le avisamos.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setRetornoDialog(null)} data-testid="no-reenviar">No, dejarlo así</Button>
                <Button className="h-11 rounded-xl" disabled={reenviarMutation.isPending} onClick={() => reenviarMutation.mutate(retornoDialog.pedido)} data-testid="confirmar-reenviar">
                  {reenviarMutation.isPending ? "Creando…" : "Volver a enviar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={asignarDialogOpen} onOpenChange={(o) => { if (!o) { setAsignarDialogOpen(false); setAsignarDialogPedido(null); setAsignarDialogStep("select"); setAsignarDialogVuelto(""); setAsignarDialogDelivery(null); } }}>
        <DialogContent>
          {asignarDialogStep === "select" && (
            <>
              <DialogHeader>
                <DialogTitle>{asignarDialogPedido?.deliveryId ? "Cambiar de repartidor" : "Asignar repartidor"}</DialogTitle>
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
                        <Banknote size={15} className="text-orange-500" /> Devuelta para el repartidor
                      </p>
                      {devueltaCalc > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-gray-600">
                          <span>Calculado:</span>
                          <span className="font-semibold text-orange-600">{moneda}{devueltaCalc.toFixed(2)}</span>
                          <span className="text-xs text-gray-400">(paga {moneda}{montoPago} · total {moneda}{total})</span>
                        </div>
                      )}
                      {/* En el celular el monto y el botón van uno debajo del otro para que no se salgan de la ventana. */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder={devueltaCalc > 0 ? devueltaCalc.toFixed(2) : "Monto"}
                          value={asignarDialogVuelto}
                          onChange={(e) => setAsignarDialogVuelto(e.target.value)}
                          className="h-11 sm:h-9 w-full sm:w-32 text-base sm:text-sm"
                          data-testid={`asignar-input-vuelto-${asignarDialogPedido.id}`}
                          autoFocus
                        />
                        <Button
                          className="bg-orange-500 hover:bg-orange-600 text-white h-11 sm:h-9"
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
