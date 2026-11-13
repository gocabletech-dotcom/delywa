import { useState, useEffect } from "react";
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
  Users,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Settings,
  RefreshCw,
  BookOpen,
  AlertTriangle,
  LogOut,
  UtensilsCrossed,
  Smartphone,
  Key,
  Copy,
  ExternalLink,
  Send,
  Trash2,
  ClipboardList,
  Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ReportesVentasTab from "@/components/negocio/delivery/ReportesVentasTab";
import ConfiguracionPagoTab from "@/components/negocio/delivery/ConfiguracionPagoTab";
import MapaFlotaTab from "@/components/negocio/delivery/MapaFlotaTab";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { usePaises, getDisplayPrefix, findPaisForNumber, getPhoneExample } from "@/hooks/use-paises";

function normalizePhone(prefix: string, localInput: string): string {
  const prefixDigits = prefix.replace(/\D/g, "");
  const cleaned = localInput.replace(/\D/g, "");
  const withoutPrefix = cleaned.startsWith(prefixDigits) ? cleaned.slice(prefixDigits.length) : cleaned;
  return `+${prefixDigits}${withoutPrefix}`;
}

export default function DeliveriesPage() {
  const [nuevoDelivery, setNuevoDelivery] = useState({ nombre: "" });
  const [nuevoLocalDigits, setNuevoLocalDigits] = useState("");
  const [nuevoPaisId, setNuevoPaisId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { data: paises } = usePaises();

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
    slug: string | null;
    nombre: string;
    logo: string | null;
    estado: string;
    tipoNegocio: string;
    whatsappNumero: string | null;
    latitud: string | null;
    longitud: string | null;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  // Default to DO when paises load; if colmado has a number, match the right country
  useEffect(() => {
    if (!paises || paises.length === 0) return;
    if (colmadoData?.whatsappNumero) {
      const match = findPaisForNumber(colmadoData.whatsappNumero, paises);
      if (match) { setNuevoPaisId(match.id); return; }
    }
    // Fall back to DO, else first active country
    const doPais = paises.find((p) => p.codigo === "DO");
    setNuevoPaisId(doPais?.id ?? paises[0]?.id ?? null);
  }, [colmadoData, paises]);


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
      setNuevoDelivery({ nombre: "" });
      setNuevoLocalDigits("");
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

  const generarCodigoMutation = useMutation({
    mutationFn: async (deliveryId: number) => {
      const res = await fetch(`/api/deliveries/${deliveryId}/generar-codigo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al generar código");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({ title: "Código generado", description: "Comparte el link y código con tu repartidor" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteDeliveryMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/deliveries/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al eliminar delivery");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({ title: "Delivery eliminado", description: "El repartidor fue eliminado correctamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleDeleteDelivery = (delivery: any) => {
    if (window.confirm(`¿Eliminar a ${delivery.nombre}? Esta acción no se puede deshacer.`)) {
      deleteDeliveryMutation.mutate(delivery.id);
    }
  };

  const handleSendWhatsApp = (delivery: any) => {
    const slug = colmadoData?.slug || colmadoId;
    const digits = delivery.whatsappNumero.replace(/\D/g, "");
    const link = `${window.location.origin}/repartidor/${slug}?tel=${digits}&c=${delivery.codigoAcceso}`;
    const text = `🛵 *Portal Repartidor - ${delivery.nombre}*\n\n📱 Número: ${delivery.whatsappNumero}\n🔑 Código: *${delivery.codigoAcceso}*\n\n🔗 Entra directo aquí:\n${link}`;
    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    const a = document.createElement("a");
    a.href = waUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyCode = (delivery: any) => {
    const slug = colmadoData?.slug || colmadoId;
    const digits = delivery.whatsappNumero.replace(/\D/g, "");
    const link = `${window.location.origin}/repartidor/${slug}?tel=${digits}&c=${delivery.codigoAcceso}`;
    const text = `🛵 Portal Repartidor - ${delivery.nombre}\n📱 Número: ${delivery.whatsappNumero}\n🔑 Código: ${delivery.codigoAcceso}\n🔗 ${link}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: "Datos y link copiados al portapapeles" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedPais = paises?.find((p) => p.id === nuevoPaisId);
    const prefix = selectedPais ? getDisplayPrefix(selectedPais) : "+1";
    const fullNumber = normalizePhone(prefix, nuevoLocalDigits);
    if (!nuevoDelivery.nombre || !nuevoLocalDigits) {
      toast({ title: "Error", description: "Completa todos los campos", variant: "destructive" });
      return;
    }
    createDeliveryMutation.mutate({
      nombre: nuevoDelivery.nombre,
      whatsappNumero: fullNumber,
      colmadoId,
    });
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
    <NegocioLayout
      title="Repartidores"
      activeNav="deliveries"
      headerRight={
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 sm:h-10 px-2 sm:px-3 text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs sm:text-sm"
            onClick={() => setDialogOpen(true)}
            data-testid="button-agregar-delivery"
          >
            <Plus size={16} className="mr-1" /> Agregar
          </Button>
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
        </div>
      }
    >
        {/* Agregar Delivery Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Delivery</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nombre del delivery</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ej: Juan Pérez"
                  value={nuevoDelivery.nombre}
                  onChange={(e) => setNuevoDelivery({ nombre: e.target.value })}
                  data-testid="input-nuevo-nombre"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">WhatsApp</label>
                <div className="flex gap-2">
                  <select
                    className="border rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                    value={nuevoPaisId ?? ""}
                    onChange={(e) => setNuevoPaisId(Number(e.target.value))}
                    data-testid="select-nuevo-prefix"
                  >
                    {(paises || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.bandera || ""} {getDisplayPrefix(p)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={getPhoneExample(
                      paises?.find((p) => p.id === nuevoPaisId)?.codigo ?? "DO"
                    )}
                    value={nuevoLocalDigits}
                    onChange={(e) => setNuevoLocalDigits(e.target.value.replace(/\D/g, ""))}
                    data-testid="input-nuevo-whatsapp"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" data-testid="button-cancelar-delivery">Cancelar</Button>
                </DialogClose>
                <Button
                  type="submit"
                  className="bg-primary"
                  disabled={createDeliveryMutation.isPending}
                  data-testid="button-confirmar-delivery"
                >
                  {createDeliveryMutation.isPending ? "Creando..." : "Agregar Delivery"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
          <Tabs defaultValue="repartidores" className="w-full">
            <TabsList className="mb-4 w-full grid grid-cols-4">
              <TabsTrigger value="repartidores" data-testid="tab-repartidores" className="text-xs sm:text-sm px-1 sm:px-3 truncate">
                <Truck size={13} className="shrink-0 mr-1 hidden sm:inline-block" />
                <span className="hidden sm:inline">Repartidores</span>
                <span className="sm:hidden">Repartid.</span>
              </TabsTrigger>
              <TabsTrigger value="mapa" data-testid="tab-mapa" className="text-xs sm:text-sm px-1 sm:px-3">
                <Map size={13} className="shrink-0 mr-1" />
                <span className="hidden sm:inline">Mapa en vivo</span>
                <span className="sm:hidden">Mapa</span>
              </TabsTrigger>
              <TabsTrigger value="reportes" data-testid="tab-reportes" className="text-xs sm:text-sm px-1 sm:px-3">
                Reportes
              </TabsTrigger>
              <TabsTrigger value="configuracion" data-testid="tab-configuracion" className="text-xs sm:text-sm px-1 sm:px-3">
                <span className="hidden sm:inline">Configuración</span>
                <span className="sm:hidden">Config.</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="repartidores">
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
            <div className="space-y-4">
              {/* Portal link info banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-blue-900 text-sm">Portal Web para Repartidores</p>
                  <p className="text-blue-700 text-xs mt-0.5">
                    Genera un código de acceso para cada repartidor. Con ese código pueden activarse y gestionar pedidos desde el celular sin necesidad de WhatsApp.
                  </p>
                  <a
                    href={`/repartidor/${colmadoData?.slug || colmadoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 text-xs font-medium flex items-center gap-1 mt-1 hover:underline"
                    data-testid="link-portal-repartidor"
                  >
                    <ExternalLink size={12} /> Ver portal: /repartidor/{colmadoData?.slug || colmadoId}
                  </a>
                </div>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deliveries.map((delivery: any) => {
                  // ── Real "online" status ─────────────────────────────────────
                  const lastSeenMs = delivery.ultimaUbicacionAt
                    ? Date.now() - new Date(delivery.ultimaUbicacionAt).getTime()
                    : null;
                  const enLinea = lastSeenMs !== null && lastSeenMs < 5 * 60 * 1000;   // < 5 min
                  const reciente = !enLinea && lastSeenMs !== null && lastSeenMs < 30 * 60 * 1000; // 5-30 min
                  const habilitado = delivery.estado !== 'inactivo';

                  // Format last-seen time
                  const lastSeenLabel = (() => {
                    if (!delivery.ultimaUbicacionAt) return null;
                    const ms = Date.now() - new Date(delivery.ultimaUbicacionAt).getTime();
                    const min = Math.floor(ms / 60000);
                    if (min < 1) return 'justo ahora';
                    if (min < 60) return `hace ${min} min`;
                    const h = Math.floor(min / 60);
                    if (h < 24) return `hace ${h} h`;
                    return `hace ${Math.floor(h / 24)} día(s)`;
                  })();

                  return (
                  <Card key={delivery.id} className="border-none shadow-sm" data-testid={`delivery-card-${delivery.id}`}>
                    <CardContent className="p-4">

                      {/* ── Row 1: icon + info + delete ─────────────────────── */}
                      <div className="flex items-start gap-3 mb-3">
                        {/* Truck icon */}
                        <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
                          enLinea ? 'bg-green-100 text-green-600'
                          : habilitado ? 'bg-blue-50 text-blue-400'
                          : 'bg-gray-100 text-gray-300'
                        }`}>
                          <Truck size={22} />
                        </div>

                        {/* Name + phone */}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base leading-tight capitalize truncate" data-testid={`nombre-delivery-${delivery.id}`}>
                            {delivery.nombre}
                          </h3>
                          <p className="text-gray-500 text-sm flex items-center gap-1 mt-0.5">
                            <Phone size={12} className="shrink-0" />
                            <span className="truncate">{delivery.whatsappNumero}</span>
                          </p>
                        </div>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteDelivery(delivery)}
                          disabled={deleteDeliveryMutation.isPending}
                          data-testid={`eliminar-delivery-${delivery.id}`}
                          title="Eliminar delivery"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>

                      {/* ── Row 2: status pills ──────────────────────────────── */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        {/* Real session status */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          enLinea ? 'bg-green-100 text-green-700'
                          : reciente ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                        }`} data-testid={`online-status-${delivery.id}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${enLinea ? 'bg-green-500 animate-pulse' : reciente ? 'bg-yellow-400' : 'bg-gray-400'}`} />
                          {enLinea ? 'En línea' : reciente ? 'Reciente' : 'Sin conexión'}
                        </span>

                        {/* Account enabled/disabled */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          !habilitado ? 'bg-red-100 text-red-600'
                          : delivery.estado === 'en_descanso' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`} data-testid={`cuenta-estado-${delivery.id}`}>
                          {!habilitado ? '🔒 Deshabilitado' : delivery.estado === 'en_descanso' ? '⏸ Descanso' : '✓ Habilitado'}
                        </span>

                        {/* Last seen */}
                        {lastSeenLabel && (
                          <span className={`text-xs ${enLinea ? 'text-green-600 font-medium' : reciente ? 'text-yellow-600' : 'text-gray-400'}`}>
                            · {lastSeenLabel}
                          </span>
                        )}
                        {!delivery.ultimaUbicacionAt && (
                          <span className="text-xs text-gray-400">· Sin actividad</span>
                        )}
                      </div>

                      {/* ── Portal access code ───────────────────────────────── */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Key size={11} className="text-gray-400 shrink-0" />
                          <span className="text-xs font-medium text-gray-500">Código de acceso al portal</span>
                        </div>
                        {delivery.codigoAcceso ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-lg tracking-widest text-primary" data-testid={`codigo-acceso-${delivery.id}`}>
                                {delivery.codigoAcceso}
                              </span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(delivery.codigoAcceso);
                                  toast({ title: "Código copiado", description: delivery.codigoAcceso });
                                }}
                                className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                title="Copiar código"
                                data-testid={`copy-codigo-${delivery.id}`}
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                            <button
                              onClick={() => handleSendWhatsApp(delivery)}
                              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-xs font-semibold transition-colors"
                              data-testid={`whatsapp-codigo-${delivery.id}`}
                            >
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                              Enviar acceso por WhatsApp
                            </button>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Sin código — genera uno para activar el portal</p>
                        )}
                      </div>

                      {/* ── Action buttons ───────────────────────────────────── */}
                      <div className="flex flex-col gap-2">
                        {/* Enable / Disable row */}
                        <div className="flex gap-2">
                          {habilitado ? (
                            <>
                              {delivery.estado === 'activo' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-yellow-600 border-yellow-300 hover:bg-yellow-50 text-xs"
                                  onClick={() => updateEstadoMutation.mutate({ id: delivery.id, estado: 'en_descanso' })}
                                  data-testid={`descanso-delivery-${delivery.id}`}
                                >
                                  <PauseCircle size={13} className="mr-1 shrink-0" /> En Descanso
                                </Button>
                              )}
                              {delivery.estado === 'en_descanso' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 text-green-600 border-green-200 hover:bg-green-50 text-xs"
                                  onClick={() => updateEstadoMutation.mutate({ id: delivery.id, estado: 'activo' })}
                                  data-testid={`activar-delivery-${delivery.id}`}
                                >
                                  <CheckCircle2 size={13} className="mr-1 shrink-0" /> Quitar descanso
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-red-600 border-red-200 hover:bg-red-50 font-medium text-xs"
                                onClick={() => updateEstadoMutation.mutate({ id: delivery.id, estado: 'inactivo' })}
                                data-testid={`desactivar-delivery-${delivery.id}`}
                              >
                                <XCircle size={13} className="mr-1 shrink-0" /> Deshabilitar
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold text-xs"
                              onClick={() => updateEstadoMutation.mutate({ id: delivery.id, estado: 'activo' })}
                              data-testid={`activar-delivery-${delivery.id}`}
                            >
                              <CheckCircle2 size={13} className="mr-1 shrink-0" /> Habilitar portal
                            </Button>
                          )}
                        </div>

                        {/* Generate / Regenerate code */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 text-xs"
                          onClick={() => generarCodigoMutation.mutate(delivery.id)}
                          disabled={generarCodigoMutation.isPending}
                          data-testid={`generar-codigo-${delivery.id}`}
                        >
                          <Key size={13} className="mr-1 shrink-0" />
                          {delivery.codigoAcceso ? "Regenerar código" : "Generar código de acceso"}
                        </Button>
                      </div>

                      {/* Registered date */}
                      <p className="text-xs text-gray-400 mt-3">
                        Registrado: {new Date(delivery.fechaRegistro).toLocaleDateString()}
                      </p>

                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            </div>
          )}
            </TabsContent>

            <TabsContent value="mapa">
              {colmadoId && (
                <MapaFlotaTab
                  colmadoId={colmadoId}
                  colmadoLat={colmadoData?.latitud ? parseFloat(colmadoData.latitud) : null}
                  colmadoLon={colmadoData?.longitud ? parseFloat(colmadoData.longitud) : null}
                />
              )}
            </TabsContent>

            <TabsContent value="reportes">
              {colmadoId && <ReportesVentasTab colmadoId={colmadoId} />}
            </TabsContent>

            <TabsContent value="configuracion">
              <ConfiguracionPagoTab deliveries={deliveries || []} />
            </TabsContent>
          </Tabs>
        </main>
    </NegocioLayout>
  );
}
