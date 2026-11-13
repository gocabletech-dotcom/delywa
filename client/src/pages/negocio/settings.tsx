import { normalizeBusinessColor } from "@/lib/temaNegocio";
import { prepararLogo } from "@/lib/imagen";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { QRCodeCanvas } from "qrcode.react";
import {
  MessageCircle,
  Truck,
  Package,
  DollarSign,
  TrendingUp,
  Menu,
  X,
  LogOut,
  Settings,
  Save,
  Store,
  MapPin,
  Clock,
  Phone,
  User,
  Users,
  Image,
  FileText,
  Loader2,
  CreditCard,
  Banknote,
  Building2,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Copy,
  ExternalLink,
  MessageSquare,
  BookOpen,
  UtensilsCrossed,
  Smartphone,
  ClipboardList,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import LocationPicker from "@/components/LocationPicker";
import NegocioLayout from "@/components/negocio/NegocioLayout";

type TecnologiasHabilitadas = {
  api_evo?: boolean;
  meta?: boolean;
  link_pedido?: boolean;
};

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

type Colmado = {
  id: number;
  nombre: string;
  slug: string | null;
  whatsappNumero: string;
  direccion: string;
  ciudad: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  planId: number;
  estado: string;
  ownerUserId: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappAccessToken: string | null;
  tipoNegocio: string;
  impuesto: string | null;
  logo: string | null;
  colorPrimario: string | null;
  descripcion: string | null;
  encargadoNombre: string | null;
  telefonoAlternativo: string | null;
  latitud: string | null;
  longitud: string | null;
  costoDelivery: string | null;
  radioEntrega: string | null;
  tiempoEstimado: string | null;
  pedidoMinimo: string | null;
  horaApertura: string | null;
  horaCierre: string | null;
  diasServicio: string[] | null;
  estaAbiertoManual: boolean | null;
  mensajeCerrado: string | null;
  mensajeBienvenida: string | null;
  mensajeConfirmacion: string | null;
  tituloCompartirPedido: string | null;
  descripcionCompartirPedido: string | null;
  botPromptCustom: string | null;
  simboloMoneda?: string;
  paisId?: number | null;
  tecnologiasHabilitadas?: TecnologiasHabilitadas | null;
};

type BancoCuenta = {
  nombre: string;
  numeroCuenta: string;
  tipoCuenta?: string;
  titular?: string;
};

type MetodosPago = {
  id: number;
  colmadoId: number;
  efectivo: boolean;
  transferencia: boolean;
  tarjeta: boolean;
  bancos: BancoCuenta[];
  fechaModificacion: string;
};

export default function SettingsPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    direccion: "",
    ciudad: "",
    provincia: "",
    codigoPostal: "",
    encargadoNombre: "",
    telefonoAlternativo: "",
    latitud: "",
    longitud: "",
    costoDelivery: "0",
    radioEntrega: "5",
    tiempoEstimado: "20-30 min",
    pedidoMinimo: "0",
    impuesto: "0",
    logo: "",
    colorPrimario: "#17804F",
    horaApertura: "08:00",
    horaCierre: "22:00",
    diasServicio: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as string[],
    estaAbiertoManual: true,
    mensajeCerrado: "Estamos cerrados. Abrimos pronto.",
    mensajeBienvenida: "",
    mensajeConfirmacion: "",
    tituloCompartirPedido: "",
    descripcionCompartirPedido: "",
    botPromptCustom: "",
    paisId: "",
  });

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

  const { data: contextoSucursal } = useQuery<{ sucursales: Array<{ id: number; nombre: string }>; sucursalActivaId: number }>({
    queryKey: ["sucursales"],
    queryFn: async () => {
      const res = await fetch("/api/negocio/sucursales");
      if (!res.ok) throw new Error("Error al cargar contexto de sucursal");
      return res.json();
    },
    enabled: isAuthenticated && !!colmadoId,
  });

  const { data: colmado, isLoading: loadingColmado } = useQuery<Colmado>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });


  // Payment methods state and query
  const [metodosPagoData, setMetodosPagoData] = useState({
    efectivo: true,
    transferencia: false,
    tarjeta: false,
    bancos: [] as BancoCuenta[],
  });

  const { data: metodosPago } = useQuery<MetodosPago>({
    queryKey: ["metodos-pago", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/metodos-pago`);
      if (!res.ok) throw new Error("Error al cargar métodos de pago");
      return res.json();
    },
    enabled: !!colmadoId,
  });


  const { data: paisesData } = useQuery<any[]>({
    queryKey: ["paises"],
    queryFn: async () => {
      const res = await fetch("/api/paises");
      if (!res.ok) throw new Error("Error al cargar países");
      return res.json();
    },
  });

  const moneda = colmado?.simboloMoneda || "RD$";

  useEffect(() => {
    if (metodosPago) {
      setMetodosPagoData({
        efectivo: metodosPago.efectivo,
        transferencia: metodosPago.transferencia,
        tarjeta: metodosPago.tarjeta,
        bancos: metodosPago.bancos || [],
      });
    }
  }, [metodosPago]);

  const updateMetodosPagoMutation = useMutation({
    mutationFn: async (data: typeof metodosPagoData) => {
      const res = await fetch(`/api/colmados/${colmadoId}/metodos-pago`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al guardar métodos de pago");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["metodos-pago", colmadoId] });
      toast({
        title: "Métodos de pago guardados",
        description: "La configuración de pagos se ha guardado correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar la configuración de pagos.",
        variant: "destructive",
      });
    },
  });

  const handleAddBanco = () => {
    setMetodosPagoData(prev => ({
      ...prev,
      bancos: [...prev.bancos, { nombre: "", numeroCuenta: "", tipoCuenta: "", titular: "" }],
    }));
  };

  const handleRemoveBanco = (index: number) => {
    setMetodosPagoData(prev => ({
      ...prev,
      bancos: prev.bancos.filter((_, i) => i !== index),
    }));
  };

  const handleBancoChange = (index: number, field: keyof BancoCuenta, value: string) => {
    setMetodosPagoData(prev => ({
      ...prev,
      bancos: prev.bancos.map((banco, i) => 
        i === index ? { ...banco, [field]: value } : banco
      ),
    }));
  };

  const handleSaveMetodosPago = () => {
    updateMetodosPagoMutation.mutate(metodosPagoData);
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (colmado) {
      setFormData({
        nombre: colmado.nombre || "",
        descripcion: colmado.descripcion || "",
        direccion: colmado.direccion || "",
        ciudad: colmado.ciudad || "",
        provincia: colmado.provincia || "",
        codigoPostal: colmado.codigoPostal || "",
        encargadoNombre: colmado.encargadoNombre || "",
        telefonoAlternativo: colmado.telefonoAlternativo || "",
        latitud: colmado.latitud || "",
        longitud: colmado.longitud || "",
        costoDelivery: colmado.costoDelivery ?? "0",
        radioEntrega: colmado.radioEntrega || "5",
        tiempoEstimado: colmado.tiempoEstimado || "20-30 min",
        pedidoMinimo: colmado.pedidoMinimo || "0",
        impuesto: colmado.impuesto || "0",
        logo: colmado.logo || "",
        colorPrimario: normalizeBusinessColor(colmado.colorPrimario),
        horaApertura: colmado.horaApertura || "08:00",
        horaCierre: colmado.horaCierre || "22:00",
        diasServicio: colmado.diasServicio || ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
        estaAbiertoManual: colmado.estaAbiertoManual !== false,
        mensajeCerrado: colmado.mensajeCerrado || "Estamos cerrados. Abrimos pronto.",
        mensajeBienvenida: colmado.mensajeBienvenida || "",
        mensajeConfirmacion: colmado.mensajeConfirmacion || "",
        tituloCompartirPedido: colmado.tituloCompartirPedido || "",
        descripcionCompartirPedido: colmado.descripcionCompartirPedido || "",
        botPromptCustom: colmado.botPromptCustom || "",
        paisId: colmado.paisId?.toString() || "",
      });
    }
  }, [colmado]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<typeof formData>) => {
      const res = await fetch(`/api/colmados/${colmadoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al guardar configuración");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colmado", colmadoId] });
      toast({
        title: "Configuración guardada",
        description: "Los cambios se han guardado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar la configuración.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      paisId: formData.paisId === "" || formData.paisId === undefined ? undefined : formData.paisId,
    };
    updateMutation.mutate(payload);
  };

  if (authLoading || loadingColmado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If no colmado assigned, show message
  if (roleData && !colmadoId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <Store className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-bold mb-2">Sin colmado asignado</h2>
          <p className="text-gray-500">No tienes un colmado asignado a tu cuenta.</p>
        </div>
      </div>
    );
  }

  const tieneMenu = colmado && colmado.tipoNegocio !== "colmado" && colmado.tipoNegocio !== "colmadon";
  const paisSeleccionado = paisesData?.find((pais: any) => pais.id.toString() === formData.paisId);
  const esEstadosUnidos = paisSeleccionado?.codigo === "US";
  

  return (
    <NegocioLayout title="Configuración" activeNav="settings" headerRight={<Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100" onClick={() => queryClient.invalidateQueries()} title="Refrescar" data-testid="button-refresh"><RefreshCw size={18} className="sm:hidden" /><RefreshCw size={20} className="hidden sm:block" /></Button>}>


      <main className="flex-1 lg:ml-0">
        <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto">
          {contextoSucursal && contextoSucursal.sucursales.length > 1 && (
            <Card className="mb-6 border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Building2 className="text-primary mt-0.5 shrink-0" size={20} />
                <div>
                  <p className="font-semibold">Configuración de la sucursal activa</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Estás editando <strong>{contextoSucursal.sucursales.find((s) => s.id === contextoSucursal.sucursalActivaId)?.nombre || "la sucursal seleccionada"}</strong>.
                    La información general del negocio se comparte; dirección, WhatsApp y operación corresponden a esta sucursal.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {/* Tecnologías habilitadas - solo lectura */}
          {colmado?.tecnologiasHabilitadas && (
            <Card className="mb-6" data-testid="card-tecnologias">
              <CardHeader>
                   <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-slate-600" />
                  Tecnologías Habilitadas
                </CardTitle>
                <CardDescription>
                  Canales activos para tu negocio — gestionados por el administrador de la plataforma
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      key: "api_evo" as const,
                      label: "API Evo",
                      desc: "Bot WhatsApp vía Evolution API",
                      icon: <MessageCircle className="w-5 h-5 text-green-600" />,
                      activeColor: "border-green-200 bg-green-50",
                      inactiveColor: "border-gray-200 bg-gray-50",
                    },
                    {
                      key: "meta" as const,
                      label: "Meta",
                      desc: "Bot WhatsApp vía Meta Cloud API",
                      icon: <MessageCircle className="w-5 h-5 text-blue-600" />,
                      activeColor: "border-blue-200 bg-blue-50",
                      inactiveColor: "border-gray-200 bg-gray-50",
                    },
                    {
                      key: "link_pedido" as const,
                      label: "Link Pedido",
                      desc: "Página pública de pedidos",
                      icon: <ClipboardList className="w-5 h-5 text-purple-600" />,
                      activeColor: "border-purple-200 bg-purple-50",
                      inactiveColor: "border-gray-200 bg-gray-50",
                    },
                  ].map(({ key, label, desc, icon, activeColor, inactiveColor }) => {
                    const techs = colmado.tecnologiasHabilitadas || {};
                    const enabled = techs[key] === true;
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-3 rounded-lg border p-3 ${enabled ? activeColor : inactiveColor}`}
                        data-testid={`tech-badge-${key}`}
                      >
                        {icon}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{label}</p>
                          <p className="text-xs text-gray-500 truncate">{desc}</p>
                        </div>
                        {enabled ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        ) : (
                          <span className="text-xs text-gray-400 shrink-0">Inactivo</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Chat Web - Link para copiar */}
          <Card className="mb-6 border-green-200 bg-gradient-to-r from-green-50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-600" />
                Chat Web de Pedidos
              </CardTitle>
              <CardDescription>
                Link público para que tus clientes hagan pedidos sin restricciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white border border-green-300 rounded-lg p-4 shadow-sm">
                <Label className="text-sm font-medium text-green-800 mb-2 block">
                  Tu link de pedidos:
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/pedir/${colmado?.slug || "..."}`}
                    className="bg-gray-50 font-mono text-sm border-green-200"
                    data-testid="input-chat-web-link"
                  />
                  <Button
                    type="button"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      const link = `${window.location.origin}/pedir/${colmado?.slug}`;
                      navigator.clipboard.writeText(link);
                      toast({
                        title: "Link copiado",
                        description: "Ya puedes pegarlo en tu WhatsApp Business",
                      });
                    }}
                    data-testid="button-copy-chat-link"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-green-300"
                    onClick={() => window.open(`/pedir/${colmado?.slug}`, "_blank")}
                    data-testid="button-preview-chat"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>

                {/* QR Code */}
                {colmado?.slug && (() => {
                  const link = `${window.location.origin}/pedir/${colmado.slug}`;
                  return (
                    <div className="mt-4 flex flex-col items-center gap-3 pt-4 border-t border-green-100">
                      <p className="text-xs font-medium text-green-800 self-start">Código QR de tu tienda:</p>
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-green-100 inline-flex flex-col items-center gap-3">
                        <QRCodeCanvas
                          id="colmado-qr"
                          value={link}
                          size={180}
                          bgColor="#ffffff"
                          fgColor="#16a34a"
                          level="H"
                          marginSize={1}
                          imageSettings={{
                            src: "/delywa-logo.png",
                            x: undefined,
                            y: undefined,
                            height: 32,
                            width: 32,
                            excavate: true,
                          }}
                        />
                        <p className="text-[11px] text-gray-400 font-mono truncate max-w-[180px]">{link}</p>
                        <button
                          type="button"
                          onClick={() => {
                            const canvas = document.getElementById("colmado-qr") as HTMLCanvasElement;
                            if (!canvas) return;
                            const url = canvas.toDataURL("image/png");
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `qr-${colmado.slug}.png`;
                            a.click();
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Descargar QR
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              <div className="text-sm text-gray-600 space-y-2">
                <p className="font-medium">¿Cómo usarlo?</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-500">
                  <li>Copia el link de arriba</li>
                  <li>En WhatsApp Business, configura una respuesta automática con este link</li>
                  <li>Cuando un cliente te escriba, recibirá el link para hacer su pedido</li>
                  <li>Tú recibirás el pedido en tu panel de administración</li>
                </ol>
              </div>
              
              <Link href="/negocio/chat-config" className="inline-block">
                <Button type="button" variant="link" className="text-green-600 p-0 h-auto">
                  Ver guía completa de configuración →
                </Button>
              </Link>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit}>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="w-5 h-5" />
                  Información del Negocio
                </CardTitle>
                <CardDescription>
                  Configura los datos básicos de tu colmado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre del Colmado</Label>
                    <Input
                      id="nombre"
                      value={formData.nombre}
                      onChange={(e) => handleInputChange("nombre", e.target.value)}
                      placeholder="Mi Colmado"
                      data-testid="input-nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="encargadoNombre">Nombre del Encargado</Label>
                    <Input
                      id="encargadoNombre"
                      value={formData.encargadoNombre}
                      onChange={(e) => handleInputChange("encargadoNombre", e.target.value)}
                      placeholder="Juan Pérez"
                      data-testid="input-encargado"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descripcion">Descripción</Label>
                  <Textarea
                    id="descripcion"
                    value={formData.descripcion}
                    onChange={(e) => handleInputChange("descripcion", e.target.value)}
                    placeholder="Tu colmado de confianza en el barrio"
                    data-testid="input-descripcion"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número de WhatsApp (no editable)</Label>
                  <Input
                    value={colmado?.whatsappNumero || ""}
                    disabled
                    className="bg-gray-100"
                    data-testid="input-whatsapp-readonly"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefonoAlternativo">Teléfono Alternativo</Label>
                  <Input
                    id="telefonoAlternativo"
                    value={formData.telefonoAlternativo}
                    onChange={(e) => handleInputChange("telefonoAlternativo", e.target.value)}
                    placeholder="809-555-1234"
                    data-testid="input-telefono"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Facturación e Imagen
                </CardTitle>
                <CardDescription>
                  Configura el impuesto y logo de tu negocio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="impuesto">Impuesto (%)</Label>
                    <Input
                      id="impuesto"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.impuesto}
                      onChange={(e) => handleInputChange("impuesto", e.target.value)}
                      placeholder="0"
                      data-testid="input-impuesto"
                    />
                    <p className="text-xs text-gray-500">
                      {parseFloat(formData.impuesto) > 0 
                        ? `Se aplicará ${formData.impuesto}% de impuesto a cada factura`
                        : "Si está en 0%, no se calculará impuesto"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Negocio</Label>
                    <Input
                      value={colmado?.tipoNegocio || "colmado"}
                      disabled
                      className="bg-gray-100 capitalize"
                      data-testid="input-tipo-negocio-readonly"
                    />
                    <p className="text-xs text-gray-500">
                      Solo el administrador puede cambiar el tipo de negocio
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paisId">País y Moneda</Label>
                  <select
                    id="paisId"
                    value={formData.paisId}
                    onChange={(e) => handleInputChange("paisId", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    data-testid="select-pais"
                  >
                    <option value="">Selecciona un país...</option>
                    {(paisesData || []).map((p: any) => (
                      <option key={p.id} value={p.id.toString()}>
                        {p.bandera} {p.nombre} — {p.simboloMoneda} ({p.moneda})
                      </option>
                    ))}
                  </select>
                  {formData.paisId && paisesData && (
                    <p className="text-xs text-gray-500">
                      Símbolo de moneda: <strong>{(paisesData.find((p: any) => p.id.toString() === formData.paisId))?.simboloMoneda || moneda}</strong>
                    </p>
                  )}
                </div>
                <div className="space-y-4">
                   <div className="space-y-2">
                     <Label htmlFor="colorPrimario">Color principal del negocio</Label>
                     <div className="flex items-center gap-3">
                       <Input id="colorPrimario" type="color" value={formData.colorPrimario} onChange={(e) => handleInputChange("colorPrimario", e.target.value)} className="h-10 w-16 cursor-pointer p-1" data-testid="input-color-primario" />
                       <Input value={formData.colorPrimario} onChange={(e) => handleInputChange("colorPrimario", e.target.value)} placeholder="#17804F" maxLength={7} className="max-w-36 uppercase" data-testid="input-color-primario-hex" />
                     </div>
                     <p className="text-xs text-gray-500">Se aplicará al panel, menú, seguimiento y portal de delivery.</p>
                   </div>
                  <Label>Logo del Negocio</Label>
                  <div className="flex items-start gap-6">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-24 h-24 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center overflow-hidden shrink-0">
                        {(formData.logo || colmado?.logo) ? (
                          <img 
                            src={formData.logo || colmado?.logo || ""} 
                            alt="Logo" 
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="text-3xl font-bold text-primary">
                            {colmado?.nombre?.charAt(0).toUpperCase() || "N"}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">Logo actual</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="logoFile" className="text-sm">Subir nueva imagen</Label>
                        <Input
                          id="logoFile"
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file && colmadoId) {
                              const formDataUpload = new FormData();
                              formDataUpload.append("logo", await prepararLogo(file));
                              try {
                                const res = await fetch(`/api/colmados/${colmadoId}/logo`, {
                                  method: "POST",
                                  body: formDataUpload,
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  handleInputChange("logo", data.logo);
                                  queryClient.invalidateQueries({ queryKey: ["colmado", colmadoId] });
                                  toast({ title: "Logo actualizado" });
                                } else {
                                  toast({ title: "Error al subir el logo", variant: "destructive" });
                                }
                              } catch (err) {
                                toast({ title: "Error al subir el logo", variant: "destructive" });
                              }
                            }
                          }}
                          className="cursor-pointer"
                          data-testid="input-logo-file"
                        />
                        <p className="text-xs text-gray-500">
                          Sube una imagen JPG, PNG o GIF (máx. 5MB)
                        </p>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <Label htmlFor="logo" className="text-sm">O ingresa una URL</Label>
                        <Input
                          id="logo"
                          type="text"
                          value={formData.logo}
                          onChange={(e) => handleInputChange("logo", e.target.value)}
                          placeholder="https://ejemplo.com/mi-logo.png"
                          data-testid="input-logo"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Ubicación
                </CardTitle>
                <CardDescription>
                  Dirección y coordenadas de tu colmado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {esEstadosUnidos ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="direccion">Street Address</Label>
                      <Input
                        id="direccion"
                        value={formData.direccion}
                        onChange={(e) => handleInputChange("direccion", e.target.value)}
                        placeholder="123 Main Street, Apt 4B"
                        data-testid="input-direccion-us"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="ciudad">City</Label>
                        <Input
                          id="ciudad"
                          value={formData.ciudad}
                          onChange={(e) => handleInputChange("ciudad", e.target.value)}
                          placeholder="New York"
                          data-testid="input-ciudad-us"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="provincia">State</Label>
                        <select
                          id="provincia"
                          value={formData.provincia}
                          onChange={(e) => handleInputChange("provincia", e.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          data-testid="select-estado-us"
                        >
                          <option value="">Select a state...</option>
                          {US_STATES.map(([code, name]) => (
                            <option key={code} value={code}>{name} ({code})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2 sm:max-w-[220px]">
                      <Label htmlFor="codigoPostal">ZIP Code</Label>
                      <Input
                        id="codigoPostal"
                        value={formData.codigoPostal}
                        onChange={(e) => handleInputChange("codigoPostal", e.target.value)}
                        placeholder="10001 or 10001-1234"
                        inputMode="numeric"
                        maxLength={10}
                        data-testid="input-zip-us"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="direccion">Dirección</Label>
                    <Textarea
                      id="direccion"
                      value={formData.direccion}
                      onChange={(e) => handleInputChange("direccion", e.target.value)}
                      placeholder="Calle Principal #123, Santo Domingo"
                      data-testid="input-direccion"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Ubicación en el Mapa</Label>
                  <LocationPicker
                    latitude={formData.latitud}
                    longitude={formData.longitud}
                    address={[
                      formData.direccion,
                      formData.ciudad,
                      formData.provincia,
                      formData.codigoPostal,
                      esEstadosUnidos ? "United States" : "",
                    ].filter(Boolean).join(", ")}
                    countryCode={paisSeleccionado?.codigo}
                    onLocationChange={(lat, lng) => {
                      handleInputChange("latitud", lat);
                      handleInputChange("longitud", lng);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Horario de Atención
                </CardTitle>
                <CardDescription>
                  Define tus horarios y días de servicio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${formData.estaAbiertoManual ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <Label className="text-base font-medium">
                        {formData.estaAbiertoManual ? "Negocio Abierto" : "Negocio Cerrado"}
                      </Label>
                      <p className="text-sm text-gray-500">
                        {formData.estaAbiertoManual 
                          ? "Tu colmado está recibiendo pedidos" 
                          : "Los clientes verán que estás cerrado"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.estaAbiertoManual}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, estaAbiertoManual: checked }))}
                    data-testid="switch-abierto-manual"
                  />
                </div>
                
                <Separator />
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="horaApertura">Hora de Apertura</Label>
                    <select
                      id="horaApertura"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formData.horaApertura}
                      onChange={(e) => handleInputChange("horaApertura", e.target.value)}
                      data-testid="input-hora-apertura"
                    >
                      {Array.from({ length: 24 }, (_, i) => {
                        const hour24 = i.toString().padStart(2, "0");
                        const hour12 = i % 12 || 12;
                        const period = i >= 12 ? "PM" : "AM";
                        return (
                          <option key={i} value={`${hour24}:00`}>
                            {hour12}:00 {period}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaCierre">Hora de Cierre</Label>
                    <select
                      id="horaCierre"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formData.horaCierre}
                      onChange={(e) => handleInputChange("horaCierre", e.target.value)}
                      data-testid="input-hora-cierre"
                    >
                      {Array.from({ length: 24 }, (_, i) => {
                        const hour24 = i.toString().padStart(2, "0");
                        const hour12 = i % 12 || 12;
                        const period = i >= 12 ? "PM" : "AM";
                        return (
                          <option key={i} value={`${hour24}:00`}>
                            {hour12}:00 {period}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label>Días de Servicio</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "lunes", label: "Lun" },
                      { id: "martes", label: "Mar" },
                      { id: "miercoles", label: "Mié" },
                      { id: "jueves", label: "Jue" },
                      { id: "viernes", label: "Vie" },
                      { id: "sabado", label: "Sáb" },
                      { id: "domingo", label: "Dom" },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          formData.diasServicio.includes(id)
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            diasServicio: prev.diasServicio.includes(id)
                              ? prev.diasServicio.filter(d => d !== id)
                              : [...prev.diasServicio, id]
                          }));
                        }}
                        data-testid={`btn-dia-${id}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="mensajeCerrado">Mensaje cuando esté cerrado</Label>
                  <Textarea
                    id="mensajeCerrado"
                    value={formData.mensajeCerrado}
                    onChange={(e) => handleInputChange("mensajeCerrado", e.target.value)}
                    placeholder="Estamos cerrados. Abrimos pronto."
                    className="min-h-[80px]"
                    data-testid="input-mensaje-cerrado"
                  />
                  <p className="text-xs text-gray-500">
                    Este mensaje se mostrará a los clientes cuando intenten hacer un pedido fuera de horario
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Configuración de Delivery
                </CardTitle>
                <CardDescription>
                  Costos y tiempos de entrega
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="costoDelivery">Costo de Delivery ({moneda})</Label>
                    <Input
                      id="costoDelivery"
                      type="number"
                      value={formData.costoDelivery}
                      onChange={(e) => handleInputChange("costoDelivery", e.target.value)}
                      placeholder="50"
                      data-testid="input-costo-delivery"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pedidoMinimo">Pedido Mínimo ({moneda})</Label>
                    <Input
                      id="pedidoMinimo"
                      type="number"
                      value={formData.pedidoMinimo}
                      onChange={(e) => handleInputChange("pedidoMinimo", e.target.value)}
                      placeholder="0"
                      data-testid="input-pedido-minimo"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="radioEntrega">Radio de Entrega (km)</Label>
                    <Input
                      id="radioEntrega"
                      type="number"
                      step="0.5"
                      value={formData.radioEntrega}
                      onChange={(e) => handleInputChange("radioEntrega", e.target.value)}
                      placeholder="5"
                      data-testid="input-radio-entrega"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tiempoEstimado">Tiempo Estimado de Entrega</Label>
                    <Input
                      id="tiempoEstimado"
                      value={formData.tiempoEstimado}
                      onChange={(e) => handleInputChange("tiempoEstimado", e.target.value)}
                      placeholder="20-30 min"
                      data-testid="input-tiempo-estimado"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Métodos de Pago
                </CardTitle>
                <CardDescription>
                  Configura los métodos de pago que aceptas en tu colmado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="efectivo"
                      checked={metodosPagoData.efectivo}
                      onCheckedChange={(checked) => 
                        setMetodosPagoData(prev => ({ ...prev, efectivo: !!checked }))
                      }
                      data-testid="checkbox-efectivo"
                    />
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-green-600" />
                      <Label htmlFor="efectivo" className="font-medium cursor-pointer">
                        Efectivo
                      </Label>
                    </div>
                    <span className="text-sm text-gray-500">
                      (Se preguntará con cuánto paga para calcular devuelta)
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="tarjeta"
                      checked={metodosPagoData.tarjeta}
                      onCheckedChange={(checked) => 
                        setMetodosPagoData(prev => ({ ...prev, tarjeta: !!checked }))
                      }
                      data-testid="checkbox-tarjeta"
                    />
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      <Label htmlFor="tarjeta" className="font-medium cursor-pointer">
                        Tarjeta de Crédito/Débito
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="transferencia"
                        checked={metodosPagoData.transferencia}
                        onCheckedChange={(checked) => 
                          setMetodosPagoData(prev => ({ ...prev, transferencia: !!checked }))
                        }
                        data-testid="checkbox-transferencia"
                      />
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-600" />
                        <Label htmlFor="transferencia" className="font-medium cursor-pointer">
                          Transferencia Bancaria
                        </Label>
                      </div>
                    </div>

                    {metodosPagoData.transferencia && (
                      <div className="ml-7 space-y-3 p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium text-sm">Cuentas Bancarias</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddBanco}
                            data-testid="button-add-banco"
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Agregar Banco
                          </Button>
                        </div>
                        
                        {metodosPagoData.bancos.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No hay bancos configurados. Agrega al menos uno para usar transferencias.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {metodosPagoData.bancos.map((banco, index) => (
                              <div key={index} className="grid gap-2 p-3 bg-white rounded border" data-testid={`banco-${index}`}>
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs text-gray-500">Banco #{index + 1}</Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveBanco(index)}
                                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                    data-testid={`button-remove-banco-${index}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                                <div className="grid gap-2 md:grid-cols-3">
                                  <Input
                                    placeholder="Nombre del banco"
                                    value={banco.nombre}
                                    onChange={(e) => handleBancoChange(index, "nombre", e.target.value)}
                                    data-testid={`input-banco-nombre-${index}`}
                                  />
                                  <Input
                                    placeholder="Número de cuenta"
                                    value={banco.numeroCuenta}
                                    onChange={(e) => handleBancoChange(index, "numeroCuenta", e.target.value)}
                                    data-testid={`input-banco-cuenta-${index}`}
                                  />
                                  <Input
                                    placeholder="Tipo (Ahorros/Corriente)"
                                    value={banco.tipoCuenta || ""}
                                    onChange={(e) => handleBancoChange(index, "tipoCuenta", e.target.value)}
                                    data-testid={`input-banco-tipo-${index}`}
                                  />
                                  <Input
                                    placeholder="Nombre del titular"
                                    value={banco.titular || ""}
                                    onChange={(e) => handleBancoChange(index, "titular", e.target.value)}
                                    data-testid={`input-banco-titular-${index}`}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSaveMetodosPago}
                    disabled={updateMetodosPagoMutation.isPending}
                    data-testid="button-save-metodos-pago"
                  >
                    {updateMetodosPagoMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Guardar Métodos de Pago
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Mensajes Personalizados
                </CardTitle>
                <CardDescription>
                  Personaliza los mensajes automáticos de WhatsApp (opcional)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mensajeBienvenida">Mensaje de Bienvenida</Label>
                  <Textarea
                    id="mensajeBienvenida"
                    value={formData.mensajeBienvenida}
                    onChange={(e) => handleInputChange("mensajeBienvenida", e.target.value)}
                    placeholder="Deja vacío para usar el mensaje automático basado en la hora"
                    rows={3}
                    data-testid="input-mensaje-bienvenida"
                  />
                  <p className="text-xs text-gray-500">
                    Si lo dejas vacío, se usará: "[Buenos días/tardes/noches] Bienvenido a [Nombre]. ¿En qué te puedo ayudar con tu pedido?"
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mensajeConfirmacion">Mensaje de Confirmación de Pedido</Label>
                  <Textarea
                    id="mensajeConfirmacion"
                    value={formData.mensajeConfirmacion}
                    onChange={(e) => handleInputChange("mensajeConfirmacion", e.target.value)}
                    placeholder="Deja vacío para usar el mensaje por defecto"
                    rows={3}
                    data-testid="input-mensaje-confirmacion"
                  />
                </div>
                <div className="border-t pt-4 space-y-4">
                  <div>
                    <Label className="text-base">Texto al compartir el seguimiento</Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Personaliza el título y la descripción que aparecen en la vista previa de WhatsApp cuando compartes un pedido.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tituloCompartirPedido">Título del enlace</Label>
                    <Input
                      id="tituloCompartirPedido"
                      value={formData.tituloCompartirPedido}
                      onChange={(e) => handleInputChange("tituloCompartirPedido", e.target.value)}
                      placeholder="Seguimiento de pedido · [Nombre del negocio]"
                      maxLength={120}
                      data-testid="input-titulo-compartir-pedido"
                    />
                    <p className="text-xs text-gray-500">
                      Déjalo vacío para usar “Seguimiento de pedido · [Nombre del negocio]”.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descripcionCompartirPedido">Descripción del enlace</Label>
                    <Textarea
                      id="descripcionCompartirPedido"
                      value={formData.descripcionCompartirPedido}
                      onChange={(e) => handleInputChange("descripcionCompartirPedido", e.target.value)}
                      placeholder="Sigue el estado del pedido #[número] de [Nombre del negocio]."
                      maxLength={240}
                      rows={2}
                      data-testid="input-descripcion-compartir-pedido"
                    />
                    <p className="text-xs text-gray-500">
                      Déjala vacía para usar la descripción automática con el número del pedido.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-16">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-purple-600" />
                  Personalización del Bot
                </CardTitle>
                <CardDescription>
                  Ajusta el comportamiento y tono del asistente virtual de tu negocio (opcional)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="botPromptCustom">Prompt personalizado del bot</Label>
                  <Textarea
                    id="botPromptCustom"
                    value={formData.botPromptCustom}
                    onChange={(e) => handleInputChange("botPromptCustom", e.target.value)}
                    placeholder="Deja vacío para usar el comportamiento por defecto del asistente"
                    rows={5}
                    data-testid="input-bot-prompt-custom"
                  />
                  <p className="text-xs text-gray-500">
                    Puedes cambiar el saludo, el tono o añadir instrucciones especiales. Ejemplo: "Eres un asistente amigable del Colmado El Buen Precio. Hablas en dominicano, usas emojis y eres muy atento con los clientes."
                  </p>
                  <p className="text-xs text-gray-400">
                    Si lo dejas vacío, el bot usará su comportamiento estándar.
                  </p>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>

        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t p-2 sm:p-3 z-40 shadow-lg">
          <div className="max-w-4xl mx-auto flex justify-center sm:justify-end">
            <Button
              type="button"
              size="sm"
              disabled={updateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                const form = document.querySelector('form');
                if (form) form.requestSubmit();
              }}
              data-testid="button-save-settings"
              className="text-sm px-4 py-2"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Guardar
            </Button>
          </div>
        </div>
      </main>
    </NegocioLayout>
  );
}
