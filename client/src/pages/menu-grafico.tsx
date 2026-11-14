import { useState, useEffect } from "react";
import { enlaceSeguimiento, type PedidoConCodigo } from "@/lib/seguimiento";
import { useParams } from "wouter";
import { emojiDeProducto } from "@/lib/emojiProductos";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  MapPin, 
  Phone, 
  User, 
  Send, 
  Share2,
  Check,
  Loader2,
  Store,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  X,
  ArrowLeft,
  History,
  ChevronRight,
  AlertCircle
} from "lucide-react";
import { businessTheme } from "@/lib/temaNegocio";

interface Colmado {
  id: number;
  nombre: string;
  logo: string | null;
  whatsappNumero: string;
  direccion: string;
  tipoNegocio: string;
  costoDelivery: string | null;
  tiempoEstimado: string | null;
  simboloMoneda: string;
  etiquetaEstado: string | null;
  etiquetaCodigoPostal: string | null;
  patronCodigoPostal: string | null;
  requiereCodigoPostal: boolean;
  ejemploDireccion: string | null;
  ejemploCiudad: string | null;
  ejemploEstado: string | null;
  ejemploCodigoPostal: string | null;
  codigoPais: string;
  colorPrimario?: string | null;
}

interface AddressLabels {
  calle: string;
  ciudad: string;
}

function getAddressLabels(codigoPais: string | undefined): AddressLabels {
  switch (codigoPais) {
    case "US":
      return { calle: "Street Address", ciudad: "City" };
    case "BR":
      return { calle: "Endereço", ciudad: "Cidade" };
    default:
      return { calle: "Dirección", ciudad: "Ciudad" };
  }
}

interface MenuProducto {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  categoria: string;
  imagen: string | null;
  emoji: string | null;
  disponible: boolean;
  inventario: number | null;
}

interface CartItem extends MenuProducto {
  cantidad: number;
}

interface PedidoCreado {
  id: number;
  codigoSeguimiento?: string | null;
  estado: string;
  tipoEntrega?: "delivery" | "pickup";
}

interface PedidoReciente {
  id: number;
  codigoSeguimiento?: string | null;
  estado: string;
  total: string;
  fecha: string;
  productos: string;
  tipoEntrega?: "delivery" | "pickup";
}

interface ClienteBusqueda {
  encontrado: boolean;
  cliente: {
    nombre: string | null;
    direccion: string | null;
  } | null;
  pedidosRecientes: PedidoReciente[];
}

type ViewState = "auth" | "menu" | "checkout" | "tracking" | "historial";

export default function MenuGraficoPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>("Todos");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [viewState, setViewState] = useState<ViewState>("auth");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteWhatsapp, setClienteWhatsapp] = useState("+1");
  const [tipoEntrega, setTipoEntrega] = useState<"delivery" | "pickup">("delivery");
  const [direccionTexto, setDireccionTexto] = useState("");
  const [addrCalle, setAddrCalle] = useState("");
  const [addrCiudad, setAddrCiudad] = useState("");
  const [addrEstado, setAddrEstado] = useState("");
  const [addrCP, setAddrCP] = useState("");
  const [addrCPError, setAddrCPError] = useState<"" | "required" | "format">("");
  const [latitud, setLatitud] = useState("");
  const [longitud, setLongitud] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [pedidoCreado, setPedidoCreado] = useState<PedidoCreado | null>(null);
  const [pedidoCompartidoId, setPedidoCompartidoId] = useState<number | null>(null);
  const [formError, setFormError] = useState("");
  const [isSearchingCliente, setIsSearchingCliente] = useState(false);
  const [clienteEncontrado, setClienteEncontrado] = useState<ClienteBusqueda | null>(null);

  useEffect(() => {
    const savedCart = localStorage.getItem(`cart-${codigo}`);
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error("Error loading cart:", e);
      }
    }
  }, [codigo]);

  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem(`cart-${codigo}`, JSON.stringify(cart));
    } else {
      localStorage.removeItem(`cart-${codigo}`);
    }
  }, [cart, codigo]);

  const { data: colmado, isLoading: loadingColmado, error: colmadoError } = useQuery<Colmado>({
    queryKey: ["menu-grafico-colmado", codigo],
    queryFn: async () => {
      const res = await fetch(`/api/menu-grafico/colmado/${codigo}`);
      if (!res.ok) throw new Error("Negocio no encontrado");
      return res.json();
    },
    enabled: !!codigo,
  });

  // Los colmados no tienen menú: se piden hablando, como por WhatsApp.
  useEffect(() => {
    if (colmado && ["colmado", "colmadon"].includes(colmado.tipoNegocio)) window.location.replace(`/pedir/${codigo}`);
  }, [colmado, codigo]);

  const { data: productos = [], isLoading: loadingProductos } = useQuery<MenuProducto[]>({
    queryKey: ["menu-grafico-productos", colmado?.id],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmado?.id}/menu`);
      if (!res.ok) throw new Error("Error al cargar menú");
      return res.json();
    },
    enabled: !!colmado?.id,
  });

  const { data: categorias = [] } = useQuery<string[]>({
    queryKey: ["menu-grafico-categorias", colmado?.id],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmado?.id}/menu/categorias`);
      if (!res.ok) throw new Error("Error al cargar categorías");
      return res.json();
    },
    enabled: !!colmado?.id,
  });

  const { data: pedidoActualizado } = useQuery<PedidoCreado>({
    queryKey: ["pedido-tracking", pedidoCreado?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pedidos/${pedidoCreado?.id}/estado`);
      if (!res.ok) throw new Error("Error al obtener estado");
      return res.json();
    },
    enabled: !!pedidoCreado?.id && viewState === "tracking",
    refetchInterval: 5000,
  });

  const { data: pedidosTracking = [] } = useQuery<PedidoReciente[]>({
    queryKey: ["menu-grafico-pedidos-cliente", colmado?.id, clienteWhatsapp],
    queryFn: async () => {
      const params = new URLSearchParams({
        colmadoId: String(colmado?.id),
        whatsapp: clienteWhatsapp,
      });
      const res = await fetch(`/api/menu-grafico/pedidos-cliente?${params.toString()}`);
      if (!res.ok) throw new Error("Error al obtener pedidos activos");
      const data = await res.json();
      return data.pedidos ?? [];
    },
    enabled: !!colmado?.id && !!clienteWhatsapp && viewState === "tracking",
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (pedidosTracking.length === 0) return;

    setClienteEncontrado(prev => {
      const pedidosPorId = new Map<number, PedidoReciente>(
        (prev?.pedidosRecientes ?? []).map(pedido => [pedido.id, pedido])
      );
      pedidosTracking.forEach(pedido => {
        pedidosPorId.set(pedido.id, pedido);
      });

      const pedidosRecientes = Array.from(pedidosPorId.values())
        .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime())
        .slice(0, 5);

      return {
        encontrado: prev?.encontrado ?? true,
        cliente: prev?.cliente ?? {
          nombre: clienteNombre || null,
          direccion: direccionTexto || null,
        },
        pedidosRecientes,
      };
    });
  }, [pedidosTracking, clienteNombre, direccionTexto]);

  const crearPedidoMutation = useMutation({
    mutationFn: async (data: {
      colmadoId: number;
      clienteNombre: string;
      clienteWhatsapp: string;
      direccionTexto: string;
      latitud: string;
      longitud: string;
      productos: Array<{ nombre: string; cantidad: number; precio: number }>;
      total: number;
      tipoEntrega: "delivery" | "pickup";
    }) => {
      const res = await fetch("/api/menu-grafico/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear pedido");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPedidoCreado(data);
      setCart([]);
      localStorage.removeItem(`cart-${codigo}`);
      setViewState("tracking");
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  const productosDisponibles = productos.filter(p => p.disponible && (p.inventario === null || p.inventario === undefined || p.inventario > 0));
  const productosFiltrados = categoriaActiva === "Todos" 
    ? productosDisponibles 
    : productosDisponibles.filter(p => p.categoria === categoriaActiva);

  const agregarAlCarrito = (producto: MenuProducto) => {
    setCart(prev => {
      const existente = prev.find(item => item.id === producto.id);
      if (existente) {
        return prev.map(item => 
          item.id === producto.id 
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const moneda = colmado?.simboloMoneda || "RD$";

  const actualizarCantidad = (productoId: number, delta: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === productoId) {
          const nuevaCantidad = item.cantidad + delta;
          if (nuevaCantidad <= 0) return null as any;
          return { ...item, cantidad: nuevaCantidad };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const eliminarDelCarrito = (productoId: number) => {
    setCart(prev => prev.filter(item => item.id !== productoId));
  };

  const totalItems = cart.reduce((acc, item) => acc + item.cantidad, 0);
  const subtotal = cart.reduce((acc, item) => acc + (parseFloat(item.precio) * item.cantidad), 0);
  const costoDeliveryConfigurado = colmado?.costoDelivery ? parseFloat(colmado.costoDelivery) : 0;
  const costoDelivery = tipoEntrega === "delivery" ? costoDeliveryConfigurado : 0;
  const total = subtotal + costoDelivery;

  const obtenerUbicacion = () => {
    if (!navigator.geolocation) {
      setFormError("Tu navegador no soporta geolocalización");
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toString();
        const lng = position.coords.longitude.toString();
        setLatitud(lat);
        setLongitud(lng);
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await res.json();
          if (data.display_name) {
            setAddrCalle(data.display_name);
          }
        } catch (e) {
          console.error("Error getting address:", e);
        }
        
        setIsGettingLocation(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        setFormError("No se pudo obtener tu ubicación. Por favor ingresa la dirección manualmente.");
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const buildDireccionTexto = (): string => {
    if (!colmado) return direccionTexto.trim();
    const labels = getAddressLabels(colmado.codigoPais);
    const parts: string[] = [];
    if (addrCalle.trim()) parts.push(`${labels.calle}: ${addrCalle.trim()}`);
    if (addrCiudad.trim()) parts.push(`${labels.ciudad}: ${addrCiudad.trim()}`);
    if (colmado.etiquetaEstado && addrEstado.trim()) parts.push(`${colmado.etiquetaEstado}: ${addrEstado.trim()}`);
    if (colmado.etiquetaCodigoPostal && addrCP.trim()) parts.push(`${colmado.etiquetaCodigoPostal}: ${addrCP.trim()}`);
    if (parts.length > 0) return parts.join(", ");
    return direccionTexto.trim();
  };

  const handleSubmitPedido = () => {
    setFormError("");
    
    if (!clienteNombre.trim()) {
      setFormError("Por favor ingresa tu nombre");
      return;
    }
    
    const validacion = validarWhatsapp(clienteWhatsapp);
    if (!validacion.valido) {
      setFormError(validacion.error);
      return;
    }
    
    const finalDireccion = buildDireccionTexto();
    if (tipoEntrega === "delivery" && !finalDireccion) {
      setFormError("Por favor ingresa tu dirección o usa el botón de ubicación");
      return;
    }

    if (tipoEntrega === "delivery" && colmado!.requiereCodigoPostal && colmado!.etiquetaCodigoPostal && !addrCP.trim()) {
      setAddrCPError("required");
      return;
    }

    // Block submission when ZIP is provided but doesn't match expected format
    const patronCP = colmado!.patronCodigoPostal;
    if (tipoEntrega === "delivery" && colmado!.etiquetaCodigoPostal && addrCP.trim() && patronCP) {
      try {
        const formatRegex = new RegExp(`^(?:${patronCP})$`, "i");
        if (!formatRegex.test(addrCP.trim())) {
          setAddrCPError("format");
          return;
        }
      } catch {
        // Malformed regex — skip format check
      }
    }
    setAddrCPError("");

    crearPedidoMutation.mutate({
      colmadoId: colmado!.id,
      clienteNombre: clienteNombre.trim(),
      clienteWhatsapp: clienteWhatsapp.trim(),
      direccionTexto: tipoEntrega === "delivery" ? finalDireccion : "",
      latitud: tipoEntrega === "delivery" ? latitud : "",
      longitud: tipoEntrega === "delivery" ? longitud : "",
      productos: cart.map(item => ({
        nombre: item.nombre,
        cantidad: item.cantidad,
        precio: parseFloat(item.precio),
        id: item.id,
      })),
      total,
      tipoEntrega,
    });
  };

  const validarWhatsapp = (numero: string): { valido: boolean; error: string } => {
    const limpio = numero.replace(/[\s\-\(\)]/g, "");
    
    // Must start with + for international format
    if (!limpio.startsWith("+")) {
      return { valido: false, error: "El número debe empezar con + y el código de país (ej: +18091234567)" };
    }
    
    // Remove + and check only digits remain
    const soloDigitos = limpio.substring(1);
    if (!/^\d+$/.test(soloDigitos)) {
      return { valido: false, error: "El número solo puede contener dígitos después del +" };
    }
    
    // Check length (international format: 10-15 digits)
    if (soloDigitos.length < 10 || soloDigitos.length > 15) {
      return { valido: false, error: "El número debe tener entre 10 y 15 dígitos (ej: +18091234567)" };
    }
    
    // Common Dominican codes: +1809, +1829, +1849
    const codigosDominicanos = ["1809", "1829", "1849"];
    const esNumerosDominicanos = codigosDominicanos.some(cod => soloDigitos.startsWith(cod));
    
    // If starts with 1 (North America), should be 11 digits total
    if (soloDigitos.startsWith("1") && soloDigitos.length !== 11) {
      return { valido: false, error: "Los números de RD/USA deben tener 11 dígitos (ej: +18091234567)" };
    }
    
    return { valido: true, error: "" };
  };

  const buscarCliente = async () => {
    if (!clienteNombre.trim()) {
      setFormError("Por favor ingresa tu nombre");
      return;
    }
    
    const validacion = validarWhatsapp(clienteWhatsapp);
    if (!validacion.valido) {
      setFormError(validacion.error);
      return;
    }

    setFormError("");
    setIsSearchingCliente(true);
    
    try {
      const res = await fetch("/api/menu-grafico/buscar-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colmadoId: colmado?.id,
          whatsapp: clienteWhatsapp.trim(),
        }),
      });
      
      if (res.ok) {
        const data: ClienteBusqueda = await res.json();
        setClienteEncontrado(data);
        
        // If customer was found, use their saved name if we don't have one
        if (data.encontrado && data.cliente?.nombre && !clienteNombre.trim()) {
          setClienteNombre(data.cliente.nombre);
        }
        // Use saved address as a legacy fallback in direccionTexto to avoid label
        // duplication when buildDireccionTexto runs (the formatted string may already
        // contain "Label: value" pairs from a previous order with the new format)
        if (data.encontrado && data.cliente?.direccion) {
          setDireccionTexto(data.cliente.direccion);
        }
      }
      
      // Move to menu after checking
      setViewState("menu");
    } catch (error) {
      console.error("Error searching cliente:", error);
      // Even on error, proceed to menu
      setViewState("menu");
    } finally {
      setIsSearchingCliente(false);
    }
  };

  const formatProductosResumen = (productos: string) => {
    try {
      const parsed = JSON.parse(productos);
      if (Array.isArray(parsed)) {
        return parsed.map((p: any) => `${p.cantidad || 1}x ${p.nombre}`).join(", ");
      }
    } catch {
      // If not JSON, it's old format text
    }
    return productos?.substring(0, 50) + (productos?.length > 50 ? "..." : "") || "Sin productos";
  };

  const compartirSeguimiento = async (pedido: PedidoConCodigo) => {
    const pedidoId = pedido.id;
    const url = enlaceSeguimiento(pedido, true);
    const shareData = {
      title: `Seguimiento del pedido #${pedidoId}`,
      text: `Mira el estado de mi pedido #${pedidoId}`,
      url,
    };

    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }

      setPedidoCompartidoId(pedidoId);
      window.setTimeout(() => {
        setPedidoCompartidoId(current => current === pedidoId ? null : current);
      }, 2500);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFormError("No se pudo compartir el enlace. Intenta nuevamente.");
    }
  };

  const getEstadoInfo = (estado: string) => {
    const estados: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
      pendiente_confirmacion: { label: "Esperando confirmación", icon: <Clock className="w-5 h-5" />, color: "text-amber-500" },
      esperando_confirmacion_sustituciones: { label: "Confirmando cambios", icon: <Clock className="w-5 h-5" />, color: "text-amber-500" },
      esperando_pago: { label: "Esperando pago", icon: <Clock className="w-5 h-5" />, color: "text-amber-600" },
      esperando_comprobante: { label: "Esperando comprobante", icon: <Clock className="w-5 h-5" />, color: "text-indigo-500" },
      esperando_confirmacion_pago: { label: "Confirmando pago", icon: <Clock className="w-5 h-5" />, color: "text-cyan-500" },
      pendiente: { label: "Confirmado", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-500" },
      en_preparacion: { label: "En preparación", icon: <Package className="w-5 h-5" />, color: "text-blue-500" },
      en_camino: { label: "En camino", icon: <Truck className="w-5 h-5" />, color: "text-purple-500" },
      llegando: { label: "Llegando", icon: <Truck className="w-5 h-5" />, color: "text-purple-600" },
      entregado: { label: "Entregado", icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-600" },
      cancelado: { label: "Cancelado", icon: <X className="w-5 h-5" />, color: "text-red-500" },
      retorno: { label: "Retornado", icon: <X className="w-5 h-5" />, color: "text-orange-500" },
      fusionado: { label: "Fusionado", icon: <Package className="w-5 h-5" />, color: "text-violet-500" },
    };
    return estados[estado] || { label: estado, icon: <Clock className="w-5 h-5" />, color: "text-gray-500" };
  };

  if (loadingColmado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-green-600" />
          <p className="mt-2 text-gray-600">Cargando menú...</p>
        </div>
      </div>
    );
  }

  if (colmadoError || !colmado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="p-6 text-center max-w-md">
          <Store className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Negocio no encontrado</h2>
          <p className="text-gray-600">El enlace que seguiste no es válido o el negocio ya no está disponible.</p>
        </Card>
      </div>
    );
  }

  // Auth view - ask for name and WhatsApp first
  if (viewState === "auth") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white" style={businessTheme(colmado.colorPrimario)}>
        <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-lg">
          {colmado.logo ? (
            <img src={colmado.logo} alt={colmado.nombre} className="w-10 h-10 rounded-full object-cover border-2 border-white/30" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-semibold">{colmado.nombre}</h1>
            <p className="text-xs text-green-100">Menú digital</p>
          </div>
        </div>

        <div className="p-4 max-w-lg mx-auto">
          <Card className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">¡Bienvenido!</h2>
              <p className="text-gray-600 text-sm">
                Para ver el menú y hacer tu pedido, por favor ingresa tus datos
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="auth-nombre">Tu nombre</Label>
                <Input
                  id="auth-nombre"
                  placeholder="¿Cómo te llamas?"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  data-testid="input-auth-nombre"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-whatsapp">Tu WhatsApp</Label>
                <Input
                  id="auth-whatsapp"
                  placeholder="+1809XXXXXXX"
                  value={clienteWhatsapp}
                  onChange={(e) => setClienteWhatsapp(e.target.value)}
                  data-testid="input-auth-whatsapp"
                />
                <p className="text-xs text-gray-500">
                  Incluye el código de país (ej: +1809, +1849)
                </p>
              </div>

              {formError && (
                <p className="text-sm text-red-500 bg-red-50 p-2 rounded" data-testid="text-auth-error">
                  {formError}
                </p>
              )}

              <Button
                onClick={buscarCliente}
                disabled={isSearchingCliente}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
                data-testid="button-continuar-menu"
              >
                {isSearchingCliente ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    Ver Menú
                    <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Show recent orders if customer has been found */}
          {clienteEncontrado?.pedidosRecientes && clienteEncontrado.pedidosRecientes.length > 0 && (
            <Card className="p-4 mt-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-gray-700">
                <Clock className="w-5 h-5 text-green-600" /> Tu historial de pedidos
              </h3>
              <div className="space-y-3">
                {clienteEncontrado.pedidosRecientes.map(pedido => {
                  const estadoInfo = getEstadoInfo(pedido.estado);
                  let fechaFormateada = '';
                  try {
                    if (pedido.fecha) {
                      const fecha = new Date(pedido.fecha);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString('es-DO', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                      }
                    }
                  } catch {
                    fechaFormateada = '';
                  }
                  
                  // Background color based on status
                  const bgColor = pedido.estado === 'entregado' ? 'bg-green-50 border-green-200' :
                                  pedido.estado === 'cancelado' ? 'bg-red-50 border-red-200' :
                                  pedido.estado === 'en_camino' ? 'bg-purple-50 border-purple-200' :
                                  'bg-amber-50 border-amber-200';
                  
                  return (
                    <div 
                      key={pedido.id} 
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${bgColor}`}
                      onClick={() => {
                        setPedidoCreado({ id: pedido.id, estado: pedido.estado });
                        setViewState("tracking");
                      }}
                      data-testid={`pedido-reciente-${pedido.id}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-full ${
                            pedido.estado === 'entregado' ? 'bg-green-100' :
                            pedido.estado === 'cancelado' ? 'bg-red-100' :
                            pedido.estado === 'en_camino' ? 'bg-purple-100' :
                            'bg-amber-100'
                          }`}>
                            <span className={estadoInfo.color}>{estadoInfo.icon}</span>
                          </div>
                          <div>
                            <p className="font-bold text-gray-800">Pedido #{pedido.id}</p>
                            <p className="text-xs text-gray-500">{fechaFormateada}</p>
                          </div>
                        </div>
                        <Badge className={`${
                          pedido.estado === 'entregado' ? 'bg-green-600' :
                          pedido.estado === 'cancelado' ? 'bg-red-600' :
                          pedido.estado === 'en_camino' ? 'bg-purple-600' :
                          'bg-amber-600'
                        } text-white`}>
                          {estadoInfo.label}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                        {formatProductosResumen(pedido.productos)}
                      </p>
                      
                      <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        {pedido.total !== "0" ? (
                          <p className="text-lg font-bold text-green-600">{moneda}{parseFloat(pedido.total).toLocaleString()}</p>
                        ) : (
                          <p className="text-sm text-gray-500 italic">Pendiente de confirmar precio</p>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          Tocar para ver detalles →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (viewState === "tracking" && pedidoCreado) {
    const pedidoSeleccionadoEnLista = pedidosTracking.find(pedido => pedido.id === pedidoCreado.id);
    const pedidoSeleccionado = pedidoSeleccionadoEnLista ?? {
      id: pedidoCreado.id,
      estado: pedidoActualizado?.estado || pedidoCreado.estado,
      total: "0",
      fecha: "",
      productos: "",
    };
    const pedidosParaMostrar = pedidoSeleccionadoEnLista
      ? pedidosTracking
      : [pedidoSeleccionado, ...pedidosTracking];
    const estadoActual = pedidoActualizado?.estado || pedidoSeleccionado.estado;
    const estadoInfo = getEstadoInfo(estadoActual);

    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
        <div className="sticky top-0 z-50 bg-green-600 text-white px-4 py-3 flex items-center gap-3 shadow-lg">
          {colmado.logo ? (
            <img src={colmado.logo} alt={colmado.nombre} className="w-10 h-10 rounded-full object-cover border-2 border-white/30" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-semibold">{colmado.nombre}</h1>
            <p className="text-xs text-green-100">Seguimiento de pedido</p>
          </div>
        </div>

        <div className="p-4 max-w-lg mx-auto">
          {pedidosParaMostrar.length > 1 && (
            <Card className="p-4 mb-4" data-testid="tracking-pedidos">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold text-gray-800">Tus pedidos activos</h2>
                  <p className="text-xs text-gray-500">Selecciona uno para ver su estado</p>
                </div>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                  {pedidosParaMostrar.length}
                </Badge>
              </div>

              <div className="space-y-2">
                {pedidosParaMostrar.map(pedido => {
                  const pedidoEstadoInfo = getEstadoInfo(
                    pedido.id === pedidoCreado.id && pedidoActualizado?.estado
                      ? pedidoActualizado.estado
                      : pedido.estado
                  );
                  const esSeleccionado = pedido.id === pedidoCreado.id;
                  let fechaFormateada = "";
                  if (pedido.fecha) {
                    const fecha = new Date(pedido.fecha);
                    if (!Number.isNaN(fecha.getTime())) {
                      fechaFormateada = fecha.toLocaleDateString("es-DO", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    }
                  }

                  return (
                    <div
                      key={pedido.id}
                      className={`rounded-xl border p-3 transition-all ${
                        esSeleccionado
                          ? "border-green-500 bg-green-50 shadow-sm"
                          : "border-gray-200 bg-white hover:border-green-300"
                      }`}
                      onClick={() => {
                        setPedidoCreado({ id: pedido.id, estado: pedido.estado });
                        setFormError("");
                      }}
                      data-testid={`tracking-pedido-${pedido.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${esSeleccionado ? "bg-green-100" : "bg-gray-100"}`}>
                          <span className={pedidoEstadoInfo.color}>{pedidoEstadoInfo.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm text-gray-800">Pedido #{pedido.id}</span>
                            <span className={`text-xs font-semibold ${pedidoEstadoInfo.color}`}>
                              {pedidoEstadoInfo.label}
                            </span>
                          </div>
                          {fechaFormateada && (
                            <p className="text-[11px] text-gray-400 mt-0.5">{fechaFormateada}</p>
                          )}
                          <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                            {formatProductosResumen(pedido.productos)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-green-600 hover:bg-green-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            compartirSeguimiento(pedido);
                          }}
                          aria-label={`Compartir seguimiento del pedido ${pedido.id}`}
                          data-testid={`button-compartir-seguimiento-${pedido.id}`}
                        >
                          {pedidoCompartidoId === pedido.id ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Share2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-6 text-center">
            <div className={`${estadoInfo.color} mb-4`}>
              {estadoInfo.icon}
            </div>
            <h2 className="text-xl font-semibold mb-2">{estadoInfo.label}</h2>
            <p className="text-gray-500 mb-4">Pedido #{pedidoCreado.id}</p>
            {(pedidoActualizado?.tipoEntrega || pedidoCreado.tipoEntrega) === "pickup" && (
              <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" data-testid="tracking-pickup">
                🏪 Recogerás este pedido en el negocio. Te avisaremos cuando esté listo.
              </p>
            )}
            
            <div className="flex justify-center gap-2 mb-6">
              {["pendiente_confirmacion", "pendiente", "en_camino", "entregado"].map((paso, idx) => (
                <div
                  key={paso}
                  className={`w-3 h-3 rounded-full ${
                    ["pendiente_confirmacion", "pendiente", "en_preparacion", "en_camino", "entregado"].indexOf(estadoActual) >= idx
                      ? "bg-green-500"
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>

            <p className="text-sm text-gray-600 mb-6">
              {estadoActual === "pendiente_confirmacion" && "El negocio está revisando tu pedido..."}
              {estadoActual === "pendiente" && ((pedidoActualizado?.tipoEntrega || pedidoCreado.tipoEntrega) === "pickup"
                ? "Tu pedido ha sido confirmado y se está preparando para recoger."
                : "Tu pedido ha sido confirmado y se está preparando.")}
              {estadoActual === "en_preparacion" && "Tu pedido está siendo preparado."}
              {estadoActual === "en_camino" && "Tu pedido va en camino. ¡Prepárate para recibirlo!"}
              {estadoActual === "entregado" && ((pedidoActualizado?.tipoEntrega || pedidoCreado.tipoEntrega) === "pickup"
                ? "¡Tu pedido fue entregado en el negocio! Gracias por tu compra."
                : "¡Tu pedido ha sido entregado! Gracias por tu compra.")}
              {estadoActual === "cancelado" && "Lo sentimos, tu pedido ha sido cancelado."}
            </p>

            <Button
              type="button"
              variant="outline"
              className="w-full mb-3 border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => compartirSeguimiento(pedidoCreado)}
              data-testid="button-compartir-seguimiento"
            >
              {pedidoCompartidoId === pedidoCreado.id ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Enlace copiado
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 mr-2" />
                  Compartir seguimiento
                </>
              )}
            </Button>

            <Button
              onClick={() => {
                setPedidoCreado(null);
                setViewState("menu");
              }}
              variant="outline"
              className="w-full"
              data-testid="button-nuevo-pedido"
            >
              Hacer otro pedido
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Historial view - modern order history
  if (viewState === "historial") {
    const pedidosActivos = clienteEncontrado?.pedidosRecientes?.filter(
      p => !['entregado', 'cancelado', 'retorno'].includes(p.estado)
    ) || [];
    const pedidosAnteriores = clienteEncontrado?.pedidosRecientes?.filter(
      p => ['entregado', 'cancelado', 'retorno'].includes(p.estado)
    ) || [];

    const formatFecha = (fecha: string) => {
      try {
        const date = new Date(fecha);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('es-DO', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return '';
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 via-indigo-50 to-white">
        <div className="sticky top-0 z-50 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 flex items-center gap-3 shadow-lg">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setViewState("menu")}
            data-testid="button-volver-historial"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">Mis Pedidos</h1>
            <p className="text-xs text-purple-100">{clienteEncontrado?.pedidosRecientes?.length || 0} pedidos</p>
          </div>
        </div>

        <div className="p-4 max-w-lg mx-auto space-y-6">
          {/* Active orders section */}
          {pedidosActivos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-amber-100 rounded-full">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="font-bold text-gray-800">Pedidos Activos</h2>
                <Badge className="bg-amber-500 text-white">{pedidosActivos.length}</Badge>
              </div>
              
              <div className="space-y-3">
                {pedidosActivos.map(pedido => {
                  const estadoInfo = getEstadoInfo(pedido.estado);
                  const isEnCamino = pedido.estado === 'en_camino';
                  
                  return (
                    <Card 
                      key={pedido.id}
                      className={`p-4 cursor-pointer transition-all hover:shadow-lg border-2 ${
                        isEnCamino ? 'border-purple-300 bg-gradient-to-r from-purple-50 to-indigo-50' : 'border-amber-200 bg-amber-50'
                      }`}
                      onClick={() => {
                        setPedidoCreado({ id: pedido.id, estado: pedido.estado });
                        setViewState("tracking");
                      }}
                      data-testid={`pedido-activo-${pedido.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-3 rounded-xl ${
                          isEnCamino ? 'bg-purple-100' : 'bg-amber-100'
                        } ${!['entregado', 'cancelado'].includes(pedido.estado) ? 'animate-pulse' : ''}`}>
                          <span className={estadoInfo.color}>{estadoInfo.icon}</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-gray-800">Pedido #{pedido.id}</span>
                            <Badge className={`${
                              isEnCamino ? 'bg-purple-600' : 'bg-amber-600'
                            } text-white text-xs`}>
                              {estadoInfo.label}
                            </Badge>
                          </div>
                          
                          <p className="text-xs text-gray-500 mb-2">{formatFecha(pedido.fecha)}</p>
                          
                          <p className="text-sm text-gray-600 line-clamp-1">
                            {formatProductosResumen(pedido.productos)}
                          </p>
                          
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200">
                            {pedido.total !== "0" ? (
                              <span className="font-bold text-green-600">{moneda}{parseFloat(pedido.total).toLocaleString()}</span>
                            ) : (
                              <span className="text-sm text-gray-500 italic">Por confirmar</span>
                            )}
                            <span className="text-xs text-purple-600 font-medium flex items-center gap-1">
                              Ver seguimiento <ChevronRight className="w-4 h-4" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Previous orders section */}
          {pedidosAnteriores.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-gray-100 rounded-full">
                  <History className="w-4 h-4 text-gray-600" />
                </div>
                <h2 className="font-bold text-gray-800">Pedidos Anteriores</h2>
              </div>
              
              <div className="space-y-2">
                {pedidosAnteriores.map(pedido => {
                  const estadoInfo = getEstadoInfo(pedido.estado);
                  const esEntregado = pedido.estado === 'entregado';
                  const esCancelado = pedido.estado === 'cancelado';
                  
                  return (
                    <Card 
                      key={pedido.id}
                      className={`p-3 cursor-pointer transition-all hover:shadow-md border ${
                        esEntregado ? 'border-green-200 bg-green-50/50' : 
                        esCancelado ? 'border-red-200 bg-red-50/50' : 'border-gray-200'
                      }`}
                      onClick={() => {
                        setPedidoCreado({ id: pedido.id, estado: pedido.estado });
                        setViewState("tracking");
                      }}
                      data-testid={`pedido-anterior-${pedido.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          esEntregado ? 'bg-green-100' : 
                          esCancelado ? 'bg-red-100' : 'bg-gray-100'
                        }`}>
                          <span className={estadoInfo.color}>{estadoInfo.icon}</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-800">Pedido #{pedido.id}</span>
                            <span className={`text-xs font-medium ${estadoInfo.color}`}>
                              {estadoInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">{formatFecha(pedido.fecha)}</p>
                        </div>
                        
                        {pedido.total !== "0" && (
                          <span className="font-bold text-green-600">{moneda}{parseFloat(pedido.total).toLocaleString()}</span>
                        )}
                        
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {(!clienteEncontrado?.pedidosRecientes || clienteEncontrado.pedidosRecientes.length === 0) && (
            <Card className="p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Sin pedidos aún</h3>
              <p className="text-gray-500 text-sm mb-4">
                Cuando hagas tu primer pedido, aparecerá aquí
              </p>
              <Button
                onClick={() => setViewState("menu")}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="button-explorar-menu"
              >
                Explorar menú
              </Button>
            </Card>
          )}

          {/* New order button */}
          <Button
            onClick={() => setViewState("menu")}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            size="lg"
            data-testid="button-nuevo-pedido-historial"
          >
            <Plus className="w-5 h-5 mr-2" />
            Hacer nuevo pedido
          </Button>
        </div>
      </div>
    );
  }

  if (viewState === "checkout") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
        <div className="sticky top-0 z-50 bg-green-600 text-white px-4 py-3 flex items-center gap-3 shadow-lg">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-green-700"
            onClick={() => setViewState("menu")}
            data-testid="button-volver-menu"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-semibold">Confirmar Pedido</h1>
            <p className="text-xs text-green-100">{colmado.nombre}</p>
          </div>
        </div>

        <div className="p-4 max-w-lg mx-auto space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Tu pedido
            </h3>
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between items-center text-sm">
                  <span>{item.cantidad}x {item.nombre}</span>
                  <span className="font-medium">{moneda}{(parseFloat(item.precio) * item.cantidad).toFixed(0)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{moneda}{subtotal.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>{tipoEntrega === "delivery" ? "Delivery" : "Pickup"}</span>
                <span>{tipoEntrega === "delivery" ? `${moneda}${costoDelivery.toFixed(0)}` : "Sin costo"}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2">
                <span>Total</span>
                <span className="text-green-600">{moneda}{total.toFixed(0)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>¿Cómo deseas recibir tu pedido?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setTipoEntrega("delivery"); setFormError(""); }}
                  className={`rounded-xl border p-3 text-left transition-colors ${tipoEntrega === "delivery" ? "border-green-600 bg-green-50 ring-1 ring-green-600" : "border-gray-200 hover:border-green-300"}`}
                  data-testid="option-entrega-delivery"
                >
                  <span className="flex items-center gap-2 font-semibold text-sm"><Truck className="w-4 h-4 text-green-600" /> Delivery</span>
                  <span className="block text-xs text-gray-500 mt-1">A tu dirección · {moneda}{costoDeliveryConfigurado.toFixed(0)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setTipoEntrega("pickup"); setFormError(""); }}
                  className={`rounded-xl border p-3 text-left transition-colors ${tipoEntrega === "pickup" ? "border-green-600 bg-green-50 ring-1 ring-green-600" : "border-gray-200 hover:border-green-300"}`}
                  data-testid="option-entrega-pickup"
                >
                  <span className="flex items-center gap-2 font-semibold text-sm"><Store className="w-4 h-4 text-green-600" /> Pickup</span>
                  <span className="block text-xs text-gray-500 mt-1">Recoger en el negocio · sin costo</span>
                </button>
              </div>
            </div>
            <h3 className="font-semibold flex items-center gap-2">
              <User className="w-4 h-4" /> Tus datos
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                placeholder="Tu nombre"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                data-testid="input-nombre"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                placeholder="+1809XXXXXXX"
                value={clienteWhatsapp}
                onChange={(e) => setClienteWhatsapp(e.target.value)}
                data-testid="input-whatsapp"
              />
            </div>

            {tipoEntrega === "delivery" ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Dirección de entrega
              </Label>
              {(() => {
                const labels = getAddressLabels(colmado.codigoPais);
                return (
                  <div className="space-y-2">
                    <Input
                      placeholder={`${labels.calle} (ej: ${colmado.ejemploDireccion || "Calle Principal #123"})`}
                      value={addrCalle}
                      onChange={(e) => setAddrCalle(e.target.value)}
                      data-testid="input-addr-calle"
                    />
                    <Input
                      placeholder={`${labels.ciudad} (ej: ${colmado.ejemploCiudad || "Santo Domingo"})`}
                      value={addrCiudad}
                      onChange={(e) => setAddrCiudad(e.target.value)}
                      data-testid="input-addr-ciudad"
                    />
                    {colmado.etiquetaEstado && (
                      <Input
                        placeholder={`${colmado.etiquetaEstado} (ej: ${colmado.ejemploEstado || "Distrito Nacional"})`}
                        value={addrEstado}
                        onChange={(e) => setAddrEstado(e.target.value)}
                        data-testid="input-addr-estado"
                      />
                    )}
                    {colmado.etiquetaCodigoPostal && (
                      <div>
                        <Input
                          placeholder={`${colmado.etiquetaCodigoPostal}${colmado.ejemploCodigoPostal ? ` (ej: ${colmado.ejemploCodigoPostal})` : ""}`}
                          value={addrCP}
                          onChange={(e) => { setAddrCP(e.target.value); setAddrCPError(""); }}
                          data-testid="input-addr-cp"
                          className={addrCPError ? "border-red-500" : ""}
                        />
                        {addrCPError === "required" && (
                          <p className="mt-1 text-xs text-red-500" data-testid="error-addr-cp-required">
                            {colmado.etiquetaCodigoPostal} es requerido
                          </p>
                        )}
                        {addrCPError === "format" && (
                          <p className="mt-1 text-xs text-red-500" data-testid="error-addr-cp-format">
                            Formato inválido{colmado.ejemploCodigoPostal ? ` — ej: ${colmado.ejemploCodigoPostal}` : ""}
                          </p>
                        )}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={obtenerUbicacion}
                      disabled={isGettingLocation}
                      data-testid="button-ubicacion"
                    >
                      {isGettingLocation ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Obteniendo ubicación...</>
                      ) : (
                        <><MapPin className="w-4 h-4 mr-2" /> Usar mi ubicación actual</>
                      )}
                    </Button>
                    {latitud && longitud && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Ubicación capturada
                      </p>
                    )}
                    {direccionTexto && !addrCalle && !addrCiudad && (
                      <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded flex items-start gap-1">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>Dirección anterior: {direccionTexto} — puedes actualizarla arriba o dejarla en blanco para reusarla.</span>
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
            ) : (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900" data-testid="pickup-instructions">
                <p className="font-semibold flex items-center gap-2"><Store className="w-4 h-4" /> Recogerás en {colmado.nombre}</p>
                <p className="mt-1 text-green-800">{colmado.direccion || "El negocio te confirmará el punto de recogida."}</p>
                <p className="mt-1 text-xs text-green-700">El negocio preparará tu pedido y te avisará cuando esté listo para recoger.</p>
              </div>
            )}

            {formError && (
              <p className="text-sm text-red-500 bg-red-50 p-2 rounded" data-testid="text-error">
                {formError}
              </p>
            )}

            <Button
              onClick={handleSubmitPedido}
              disabled={crearPedidoMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
              data-testid="button-enviar-pedido"
            >
              {crearPedidoMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Pedido
                </>
              )}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const pedidosActivosBanner = clienteEncontrado?.pedidosRecientes?.filter(
    p => !['entregado', 'cancelado', 'retorno'].includes(p.estado)
  ) || [];

  return (
      <div className="min-h-screen bg-gray-50 pb-28" style={businessTheme(colmado.colorPrimario)}>

      {/* ── Sticky top nav ── */}
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-lg">
        {colmado.logo ? (
          <img src={colmado.logo} alt={colmado.nombre} className="w-9 h-9 rounded-full object-cover border-2 border-white/30 flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm leading-tight truncate">{colmado.nombre}</h1>
          {colmado.tiempoEstimado && (
            <p className="text-xs text-green-100 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {colmado.tiempoEstimado}
            </p>
          )}
        </div>

        {/* Historial button */}
        {clienteEncontrado && (
          <button
            onClick={() => setViewState("historial")}
            className="relative p-2 rounded-full hover:bg-green-700 transition-colors"
            data-testid="button-mis-pedidos-flotante"
          >
            <History className="w-5 h-5" />
            {pedidosActivosBanner.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {pedidosActivosBanner.length}
              </span>
            )}
          </button>
        )}

        {/* Cart button */}
        <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-white hover:bg-green-700"
              data-testid="button-abrir-carrito"
            >
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <Badge className="absolute -top-1 -right-1 bg-white text-green-600 text-xs h-5 w-5 p-0 flex items-center justify-center">
                  {totalItems}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Tu Carrito
              </SheetTitle>
            </SheetHeader>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[50vh] text-gray-400">
                <ShoppingCart className="w-12 h-12 mb-3" />
                <p>Tu carrito está vacío</p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl" data-testid={`cart-item-${item.id}`}>
                    {item.imagen ? (
                      <img src={item.imagen} alt={item.nombre} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center text-green-600 font-bold text-xl flex-shrink-0">
                        {item.nombre.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{item.nombre}</p>
                      <p className="text-green-600 font-bold">{moneda}{parseFloat(item.precio).toFixed(0)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => actualizarCantidad(item.id, -1)} data-testid={`button-menos-${item.id}`}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-6 text-center font-bold text-sm">{item.cantidad}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => actualizarCantidad(item.id, 1)} data-testid={`button-mas-${item.id}`}>
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => eliminarDelCarrito(item.id)} data-testid={`button-eliminar-${item.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{moneda}{subtotal.toFixed(0)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Delivery</span><span>{moneda}{costoDelivery.toFixed(0)}</span></div>
                  <div className="flex justify-between font-bold text-lg pt-1"><span>Total</span><span className="text-green-600">{moneda}{total.toFixed(0)}</span></div>
                </div>
                <Button onClick={() => { setIsCartOpen(false); setViewState("checkout"); }} className="w-full bg-green-600 hover:bg-green-700 rounded-2xl" size="lg" data-testid="button-ir-checkout">
                  Confirmar pedido
                </Button>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Hero banner ── */}
      <div className="relative bg-gradient-to-br from-green-600 to-green-800 text-white px-4 pt-8 pb-10 text-center">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M0 0h40v40H0z'/%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative">
          {colmado.logo ? (
            <img src={colmado.logo} alt={colmado.nombre} className="w-20 h-20 rounded-2xl object-cover border-4 border-white/30 mx-auto mb-3 shadow-xl" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3 shadow-xl border-4 border-white/30">
              <span className="text-3xl font-black">{colmado.nombre.charAt(0)}</span>
            </div>
          )}
          <h2 className="text-2xl font-black leading-tight">{colmado.nombre}</h2>
          <div className="flex items-center justify-center gap-4 mt-2 text-green-100 text-xs">
            {colmado.tiempoEstimado && (
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{colmado.tiempoEstimado}</span>
            )}
            {colmado.costoDelivery && parseFloat(colmado.costoDelivery) > 0 && (
              <span className="flex items-center gap-1"><Truck className="w-3 h-3" />Delivery {moneda}{parseFloat(colmado.costoDelivery).toFixed(0)}</span>
            )}
          </div>
        </div>
        {/* Curved bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gray-50" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      </div>

      {/* ── Active order banner ── */}
      {pedidosActivosBanner.length > 0 && (() => {
        const pedidoMasReciente = pedidosActivosBanner[0];
        const estadoInfo = getEstadoInfo(pedidoMasReciente.estado);
        const isEnCamino = pedidoMasReciente.estado === 'en_camino';
        return (
          <div
            className={`mx-4 mt-3 p-3 rounded-2xl cursor-pointer transition-all active:scale-[0.98] shadow-md ${isEnCamino ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white' : 'bg-gradient-to-r from-amber-400 to-orange-400 text-white'}`}
            onClick={() => { setPedidoCreado({ id: pedidoMasReciente.id, estado: pedidoMasReciente.estado }); setViewState("tracking"); }}
            data-testid="banner-pedido-activo"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/20 animate-pulse">
                {isEnCamino ? <Truck className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{isEnCamino ? '🚚 ¡Tu pedido va en camino!' : '⏳ Pedido en proceso'}</p>
                <p className="text-xs opacity-90">Pedido #{pedidoMasReciente.id} · {estadoInfo.label}</p>
              </div>
              <ChevronRight className="w-5 h-5 opacity-75" />
            </div>
          </div>
        );
      })()}

      {/* ── Category pills ── */}
      <div className="sticky top-[52px] z-40 bg-gray-50 px-4 py-3 overflow-x-auto border-b border-gray-100" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-2 min-w-max">
          {["Todos", ...categorias].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoriaActiva(cat)}
              className="px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shadow-sm border"
              style={categoriaActiva === cat
                ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" }
                : { background: "#fff", color: "#374151", borderColor: "#e5e7eb" }
              }
              data-testid={cat === "Todos" ? "button-categoria-todos" : `button-categoria-${cat}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Products grid ── */}
      {loadingProductos ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-green-600" />
        </div>
      ) : productosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Package className="w-12 h-12 mb-3" />
          <p className="text-sm">No hay productos disponibles</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
          {productosFiltrados.map(producto => {
            const enCarrito = cart.find(item => item.id === producto.id);
            return (
              <div
                key={producto.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all active:scale-[0.97] cursor-pointer border border-gray-100"
                onClick={() => agregarAlCarrito(producto)}
                data-testid={`card-producto-${producto.id}`}
              >
                {/* Square image */}
                <div className="aspect-square relative bg-gray-100">
                  {producto.imagen ? (
                    <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white">
                      <span className="text-5xl select-none">{emojiDeProducto(producto)}</span>
                    </div>
                  )}
                  {enCarrito && (
                    <div className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-md">
                      {enCarrito.cantidad}
                    </div>
                  )}
                </div>

                <div className="p-2.5">
                  <p className="font-semibold text-gray-900 text-xs leading-tight line-clamp-2 mb-1" data-testid={`text-nombre-${producto.id}`}>
                    {producto.nombre}
                  </p>
                  {producto.descripcion && (
                    <p className="text-[10px] text-gray-400 line-clamp-1 mb-1">{producto.descripcion}</p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-green-600 font-black text-sm" data-testid={`text-precio-${producto.id}`}>
                      {moneda}{parseFloat(producto.precio).toFixed(0)}
                    </span>
                    <button
                      className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-700 text-white flex items-center justify-center shadow-md transition-all active:scale-90"
                      onClick={(e) => { e.stopPropagation(); agregarAlCarrito(producto); }}
                      data-testid={`button-agregar-${producto.id}`}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Sticky bottom cart bar ── */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-2xl">
          <Button
            onClick={() => setViewState("checkout")}
            className="w-full bg-green-600 hover:bg-green-700 rounded-2xl h-14 text-base font-bold shadow-lg"
            data-testid="button-ver-carrito"
          >
            <div className="flex items-center justify-between w-full px-2">
              <div className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full h-6 w-6 flex items-center justify-center text-xs font-black">
                  {totalItems}
                </span>
                <span>Ver carrito</span>
              </div>
              <span className="font-black">{moneda}{total.toFixed(0)}</span>
            </div>
          </Button>
        </div>
      )}
    </div>
  );
}
