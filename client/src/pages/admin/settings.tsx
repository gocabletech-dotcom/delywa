import { prepararLogo } from "@/lib/imagen";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

type Colmado = {
  id: number;
  nombre: string;
  slug: string | null;
  whatsappNumero: string;
  direccion: string;
  planId: number;
  estado: string;
  ownerUserId: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappAccessToken: string | null;
  tipoNegocio: string;
  impuesto: string | null;
  logo: string | null;
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
};

type BancoCuenta = {
  nombre: string;
  numeroCuenta: string;
  tipoCuenta?: string;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    direccion: "",
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
    horaApertura: "08:00",
    horaCierre: "22:00",
    diasServicio: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"] as string[],
    estaAbiertoManual: true,
    mensajeCerrado: "Estamos cerrados. Abrimos pronto.",
    mensajeBienvenida: "",
    mensajeConfirmacion: "",
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

  const { data: colmado, isLoading: loadingColmado } = useQuery<Colmado>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["unread-messages", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/conversaciones/unread`);
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 10000,
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
      bancos: [...prev.bancos, { nombre: "", numeroCuenta: "", tipoCuenta: "" }],
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
        horaApertura: colmado.horaApertura || "08:00",
        horaCierre: colmado.horaCierre || "22:00",
        diasServicio: colmado.diasServicio || ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"],
        estaAbiertoManual: colmado.estaAbiertoManual !== false,
        mensajeCerrado: colmado.mensajeCerrado || "Estamos cerrados. Abrimos pronto.",
        mensajeBienvenida: colmado.mensajeBienvenida || "",
        mensajeConfirmacion: colmado.mensajeConfirmacion || "",
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
      if (!res.ok) throw new Error("Error al guardar configuración");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colmado", colmadoId] });
      toast({
        title: "Configuración guardada",
        description: "Los cambios se han guardado correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo guardar la configuración.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
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
  
  const navItems = [
    { icon: TrendingUp, label: "Dashboard", href: "/admin/dashboard" },
    { icon: MessageCircle, label: "Conversaciones", href: "/admin/conversaciones", badge: unreadData?.count },
    { icon: Users, label: "Clientes", href: "/admin/clientes" },
    { icon: Package, label: "Pedidos", href: "/admin/pedidos" },
    { icon: Truck, label: "Deliveries", href: "/admin/deliveries" },
    { icon: DollarSign, label: "Ventas", href: "/admin/ventas" },
    ...(tieneMenu ? [{ icon: FileText, label: "Menú", href: "/admin/menu" }] : []),
    { icon: Settings, label: "Configuración", href: "/admin/settings", active: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
              {colmado?.logo ? (
                <img src={colmado.logo} alt="" className="w-full h-full object-contain" />
              ) : (
                colmado?.nombre?.charAt(0).toUpperCase() || "N"
              )}
            </div>
            <span className="font-bold text-lg truncate">{colmado?.nombre || "Mi Negocio"}</span>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${
                  item.active
                    ? "bg-green-50 text-green-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.badge ? (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
              {colmado?.logo ? (
                <img src={colmado.logo} alt="" className="w-full h-full object-contain" />
              ) : (
                colmado?.nombre?.charAt(0).toUpperCase() || "N"
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{colmado?.nombre || "Mi Negocio"}</p>
              <p className="text-xs text-gray-500 truncate">{colmado?.nombre || ""}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 lg:ml-0">
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Configuración</h1>
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

        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {/* Chat Web - Sección destacada arriba del formulario */}
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
                <div className="space-y-4">
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
                <div className="space-y-2">
                  <Label>Ubicación en el Mapa</Label>
                  <LocationPicker
                    latitude={formData.latitud}
                    longitude={formData.longitud}
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
                    <Label htmlFor="costoDelivery">Costo de Delivery (RD$)</Label>
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
                    <Label htmlFor="pedidoMinimo">Pedido Mínimo (RD$)</Label>
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

            <Card className="mb-16">
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
    </div>
  );
}
