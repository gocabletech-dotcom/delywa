import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Truck,
  Package,
  CheckCircle2,
  XCircle,
  RotateCcw,
  LogOut,
  MapPin,
  Phone,
  Loader2,
  ChevronRight,
  AlertCircle,
  Navigation,
  DollarSign,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  ExternalLink,
  Route as RouteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { buildMapUrl } from "@/lib/mapUtils";
import { usePaises, getDisplayPrefix, findPaisForNumber, getPhoneExample } from "@/hooks/use-paises";
import RutaEntrega from "@/components/repartidor/RutaEntrega";
import { businessTheme } from "@/lib/temaNegocio";

function normalizePhone(prefix: string, localInput: string): string {
  const prefixDigits = prefix.replace(/\D/g, "");
  const cleaned = localInput.replace(/\D/g, "");
  const withoutPrefix = cleaned.startsWith(prefixDigits) ? cleaned.slice(prefixDigits.length) : cleaned;
  return `+${prefixDigits}${withoutPrefix}`;
}


function timeAgo(dateString: string): string {
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function formatHora(dateString: string): string {
  return new Date(dateString).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
}

interface DeliveryInfo {
  id: number;
  nombre: string;
  estado: string;
  ultimaActivacion: string | null;
}

interface ColmadoInfo {
  id: number;
  nombre: string;
  logo: string | null;
  tiempoEstimado: string | null;
  simboloMoneda: string;
  colorPrimario?: string | null;
}

interface Pedido {
  id: number;
  clienteNombre: string;
  clienteWhatsapp: string;
  clienteUbicacion: string;
  clienteLatitud?: string | null;
  clienteLongitud?: string | null;
  productos: string;
  total: string;
  totalConfirmado: string | null;
  montoPago: string;
  necesitaDevuelta: boolean;
  vueltoEntregado: string | null;
  vueltoEntregadoAlDelivery: boolean;
  estado: string;
  metodoPago: string | null;
  fechaCreacion: string;
  motivoRetorno: string | null;
}

interface CuadreItem {
  id: number;
  deliveryId: number;
  colmadoId: number;
  fechaCuadre: string;
  pedidosIds: number[];
  totalEfectivoCobrado: string;
  totalDevueltaEntregada: string;
  totalVueltoRetornado: string | null;
  netoAEntregar: string;
  estado: string;
  notasRepartidor: string | null;
  notasNegocio: string | null;
  fechaCreacion: string;
  fechaConfirmacion: string | null;
}

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_camino: "En camino",
  llegando: "Llegando",
  entregado: "Entregado",
  cancelado: "Cancelado",
  retorno: "Retorno",
  pendiente_confirmacion: "Por confirmar",
  esperando_pago: "Esp. pago",
};

const ESTADO_COLORS: Record<string, string> = {
  pendiente: "bg-orange-100 text-orange-700",
  en_camino: "bg-blue-100 text-blue-700",
  llegando: "bg-indigo-100 text-indigo-700",
  entregado: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
  retorno: "bg-gray-100 text-gray-600",
  pendiente_confirmacion: "bg-yellow-100 text-yellow-700",
  esperando_pago: "bg-purple-100 text-purple-700",
};

export default function RepartidorPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: paises } = usePaises();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loginLocalDigits, setLoginLocalDigits] = useState("");
  const [loginPaisId, setLoginPaisId] = useState<number | null>(null);
  const [loginForm, setLoginForm] = useState({ codigoAcceso: "" });
  const [loginError, setLoginError] = useState("");
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);
  const urlParamsRef = useRef<{ tel: string | null; c: string | null }>({ tel: null, c: null });
  const prefixFromUrl = useRef(false);
  const [showCuadreModal, setShowCuadreModal] = useState(false);
  const [notasCuadre, setNotasCuadre] = useState("");
  const [expandedCuadreId, setExpandedCuadreId] = useState<number | null>(null);
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<Set<number>>(new Set());
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [tickSeg, setTickSeg] = useState(0);
  const [retornoModal, setRetornoModal] = useState<{ pedidoId: number } | null>(null);
  const [retornoMotivoPersonalizado, setRetornoMotivoPersonalizado] = useState("");
  const [retornoMostrarOtro, setRetornoMostrarOtro] = useState(false);
  const [scheduleEndedBanner, setScheduleEndedBanner] = useState(false);
  const [activeTab, setActiveTab] = useState<"pedidos" | "rutas">("pedidos");

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["portal-repartidor-me"],
    queryFn: async () => {
      const res = await fetch("/api/portal-repartidor/me", { credentials: "include" });
      if (res.status === 401) {
        const body = await res.json().catch(() => ({}));
        if (body?.reason === "schedule_ended") {
          setScheduleEndedBanner(true);
        }
        return null;
      }
      if (!res.ok) throw new Error("Error al obtener sesión");
      setScheduleEndedBanner(false);
      return res.json() as Promise<{ delivery: DeliveryInfo; colmado: ColmadoInfo | null; fueraDeHorario?: boolean; horaFinTurno?: string | null }>;
    },
    retry: false,
  });

  const { data: colmadoPublico } = useQuery({
    queryKey: ["colmado-publico", slug],
    queryFn: async () => {
      const res = await fetch(`/api/chat-web/colmado/${slug}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ id: number; nombre: string; logo: string | null; whatsappNumero: string; tipoNegocio: string; colorPrimario?: string | null }>;
    },
    enabled: !!slug,
  });

  // Helper: find the best pais ID for a full phone number string
  const findPaisIdForNumber = (fullNumber: string): number | null => {
    if (!paises || paises.length === 0) return null;
    const match = findPaisForNumber(fullNumber, paises);
    return match?.id ?? null;
  };

  // Parse URL params on mount — pre-fill phone + code from the link sent via WhatsApp
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tel = params.get("tel");
    const c = params.get("c");
    urlParamsRef.current = { tel, c };
    if (tel) {
      const fullDigits = tel.replace(/\D/g, "");
      const fullWithPlus = `+${fullDigits}`;
      const paisId = findPaisIdForNumber(fullWithPlus);
      if (paisId !== null) {
        const foundPais = paises!.find((p) => p.id === paisId)!;
        const prefixDigits = getDisplayPrefix(foundPais).replace(/\D/g, "");
        const localDigits = fullDigits.startsWith(prefixDigits)
          ? fullDigits.slice(prefixDigits.length)
          : fullDigits;
        setLoginPaisId(paisId);
        setLoginLocalDigits(localDigits);
        prefixFromUrl.current = true;
      }
      urlParamsRef.current.tel = fullWithPlus;
    }
    if (c) {
      setLoginForm({ codigoAcceso: c.toUpperCase() });
    }
  }, [paises]);

  useEffect(() => {
    // Default to DO (or first country) when paises load; override with colmado's prefix if available
    if (!paises || paises.length === 0) return;
    const source = !prefixFromUrl.current && colmadoPublico?.whatsappNumero
      ? colmadoPublico.whatsappNumero
      : null;
    if (source) {
      const paisId = findPaisIdForNumber(source);
      if (paisId !== null) { setLoginPaisId(paisId); return; }
    }
    if (loginPaisId === null) {
      const doPais = paises.find((p) => p.codigo === "DO");
      setLoginPaisId(doPais?.id ?? paises[0]?.id ?? null);
    }
  }, [colmadoPublico, paises]);

  useEffect(() => {
    if (!sessionLoading) {
      setIsLoggedIn(!!session);
      setCheckingSession(false);
    }
  }, [session, sessionLoading]);

  // GPS tracking: send position to server every time it changes (while active)
  useEffect(() => {
    const deliveryId = session?.delivery?.id;
    const isDeliveryActivo = session?.delivery?.estado === "activo";
    if (!deliveryId || !isDeliveryActivo || !navigator.geolocation) return;
    let watchId: number;
    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          await fetch(`/api/deliveries/${deliveryId}/ubicacion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              latitud: position.coords.latitude,
              longitud: position.coords.longitude,
            }),
          });
        } catch {
          /* silently ignore GPS update failures */
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [session?.delivery?.id, session?.delivery?.estado]);

  // Auto-submit login when session check is done and URL params are present
  useEffect(() => {
    if (!checkingSession && !isLoggedIn && !autoLoginAttempted) {
      const { tel, c } = urlParamsRef.current;
      if (tel && c) {
        setAutoLoginAttempted(true);
        loginMutation.mutate({ overrideNumero: tel, overrideCodigo: c });
      }
    }
  }, [checkingSession, isLoggedIn]);

  const loginMutation = useMutation({
    mutationFn: async (overrides?: { overrideNumero?: string; overrideCodigo?: string }) => {
      const selectedLoginPais = paises?.find((p) => p.id === loginPaisId);
      const loginPrefix = selectedLoginPais ? getDisplayPrefix(selectedLoginPais) : "+1";
      const fullNumber = overrides?.overrideNumero ?? normalizePhone(loginPrefix, loginLocalDigits);
      const codigo = overrides?.overrideCodigo ?? loginForm.codigoAcceso;
      const res = await fetch("/api/portal-repartidor/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          whatsappNumero: fullNumber,
          codigoAcceso: codigo.trim().toUpperCase(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al iniciar sesión");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-me"] });
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-pedidos"] });
      setIsLoggedIn(true);
      setLoginError("");
    },
    onError: (error: Error) => {
      setLoginError(error.message);
    },
  });

  const activarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal-repartidor/activar", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Error al activar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-me"] });
      toast({ title: "Activado", description: "Ahora estás disponible para recibir pedidos" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo activar", variant: "destructive" });
    },
  });

  const desactivarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal-repartidor/desactivar", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Error al desactivar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-me"] });
      toast({ title: "Desactivado", description: "Ya no apareces como disponible" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo desactivar", variant: "destructive" });
    },
  });

  useEffect(() => {
    const interval = setInterval(() => setTickSeg(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Heartbeat: keep "last seen in portal" timestamp fresh every 2 min while logged in
  useEffect(() => {
    if (!isLoggedIn) return;
    const ping = () => fetch("/api/portal-repartidor/heartbeat", { method: "POST", credentials: "include" }).catch(() => {});
    ping(); // immediate ping on login
    const id = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [isLoggedIn]);

  // Helper: check a portal API response for schedule expiry or account_disabled and force logout if needed.
  // Returns true when the caller should bail out and return default data.
  const checkPortalExpiry = async (res: Response): Promise<boolean> => {
    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body?.reason === "schedule_ended") {
        setScheduleEndedBanner(true);
        setIsLoggedIn(false);
        queryClient.clear();
      } else if (body?.reason === "account_disabled") {
        setIsLoggedIn(false);
        queryClient.clear();
        toast({ title: "Acceso deshabilitado", description: body.error || "El negocio ha deshabilitado tu cuenta.", variant: "destructive" });
      }
      return true;
    }
    return false;
  };

  const { data: pedidos = [], isLoading: pedidosLoading } = useQuery<Pedido[]>({
    queryKey: ["portal-repartidor-pedidos"],
    queryFn: async () => {
      const res = await fetch("/api/portal-repartidor/pedidos", { credentials: "include" });
      if (await checkPortalExpiry(res)) return [];
      if (!res.ok) return [];
      const data = await res.json();
      setLastFetchTime(new Date());
      return data;
    },
    enabled: isLoggedIn,
    refetchInterval: 10000,
  });

  const { data: pedidosSinCuadre = [] } = useQuery<Pedido[]>({
    queryKey: ["portal-repartidor-pedidos-sin-cuadre"],
    queryFn: async () => {
      const res = await fetch("/api/portal-repartidor/pedidos-sin-cuadre", { credentials: "include" });
      if (await checkPortalExpiry(res)) return [];
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isLoggedIn,
    refetchInterval: 30000,
  });

  const { data: cuadresData } = useQuery<{ cuadres: CuadreItem[]; total: number }>({
    queryKey: ["portal-repartidor-cuadres"],
    queryFn: async () => {
      const res = await fetch("/api/portal-repartidor/cuadres?limit=20", { credentials: "include" });
      if (await checkPortalExpiry(res)) return { cuadres: [], total: 0 };
      if (!res.ok) return { cuadres: [], total: 0 };
      return res.json();
    },
    enabled: isLoggedIn,
  });
  const cuadresHistorial = cuadresData?.cuadres ?? [];

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ pedidoId, estado, motivoRetorno }: { pedidoId: number; estado: string; motivoRetorno?: string }) => {
      const res = await fetch(`/api/portal-repartidor/pedidos/${pedidoId}/estado`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, ...(motivoRetorno ? { motivoRetorno } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al actualizar pedido");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-pedidos"] });
      toast({ title: "Pedido actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const crearCuadreMutation = useMutation({
    mutationFn: async ({ pedidoIds, notasRepartidor }: { pedidoIds: number[]; notasRepartidor?: string }) => {
      const res = await fetch("/api/portal-repartidor/cuadre", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoIds, notasRepartidor: notasRepartidor || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear cuadre");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-pedidos-sin-cuadre"] });
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-cuadres"] });
      queryClient.invalidateQueries({ queryKey: ["portal-repartidor-pedidos"] });
      setShowCuadreModal(false);
      setNotasCuadre("");
      toast({ title: "Cuadre registrado", description: "El negocio revisará tu cuadre pronto" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal-repartidor/logout", { method: "POST", credentials: "include" });
      return res.json();
    },
    onSuccess: () => {
      setIsLoggedIn(false);
      queryClient.clear();
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!loginLocalDigits.trim() || !loginForm.codigoAcceso.trim()) {
      setLoginError("Completa todos los campos");
      return;
    }
    loginMutation.mutate(undefined);
  };

  const delivery = session?.delivery;
  const colmado = session?.colmado;
  const moneda = colmado?.simboloMoneda || "RD$";
  const isActivo = delivery?.estado === "activo";

  const pedidosActivos = pedidos
    .filter(p => !["entregado", "cancelado", "retorno", "fusionado"].includes(p.estado))
    .sort((a, b) => new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime());
  const pedidosHistorial = pedidos.filter(p => ["entregado", "cancelado", "retorno", "fusionado"].includes(p.estado)).slice(0, 10);

  const secondsSinceUpdate = lastFetchTime ? Math.floor((Date.now() - lastFetchTime.getTime()) / 1000) : null;
  void tickSeg;

  const getDevuelta = (p: Pedido): number => {
    const total = parseFloat(p.totalConfirmado ?? p.total) || 0;
    const montoPago = parseFloat(p.montoPago) || 0;
    const tieneVuelto = p.necesitaDevuelta || (montoPago > 0 && montoPago > total);
    if (!tieneVuelto) return 0;
    if (p.vueltoEntregado !== null && p.vueltoEntregado !== undefined) {
      return parseFloat(p.vueltoEntregado) || 0;
    }
    return Math.max(0, montoPago - total);
  };

  const _cobrado = pedidosSinCuadre.filter(p => p.estado === "entregado").reduce((sum, p) => sum + (parseFloat(p.totalConfirmado ?? p.total) || 0), 0);
  const _devuelta = pedidosSinCuadre.filter(p => p.estado === "entregado").reduce((sum, p) => sum + getDevuelta(p), 0);
  const _vueltoRetornado = pedidosSinCuadre.filter(p => p.estado === "retorno").reduce((sum, p) => sum + (parseFloat(p.vueltoEntregado ?? "0") || 0), 0);
  const _efectivoRecibidoNegocio = pedidosSinCuadre.filter(p => p.estado === "entregado").reduce((sum, p) => {
    if (p.vueltoEntregadoAlDelivery && p.vueltoEntregado) return sum + (parseFloat(p.vueltoEntregado) || 0);
    return sum;
  }, 0);
  // neto = cobrado(totalConfirmado) + efectivoRecibidoNegocio + vueltoRetornado
  // La devuelta NO se resta: cobrado ya usa totalConfirmado (neto del cliente).
  // El efectivo que el negocio dio al delivery para cambio también debe devolverse.
  const cuadreTotales = { cobrado: _cobrado, devuelta: _devuelta, vueltoRetornado: _vueltoRetornado, neto: _cobrado + _efectivoRecibidoNegocio + _vueltoRetornado };

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (checkingSession || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  // ─── Login Screen ─────────────────────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4" style={businessTheme(colmadoPublico?.colorPrimario)}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
              <Truck size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Portal Repartidor</h1>
            <p className="text-gray-500 text-sm mt-1">Ingresa tus datos para continuar</p>
          </div>

          {scheduleEndedBanner && (
            <div
              className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 text-center"
              data-testid="banner-schedule-ended"
            >
              Tu turno ha finalizado. El negocio ya cerró sus operaciones.
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">Número de WhatsApp</Label>
                <div className="flex">
                  <select
                    value={loginPaisId ?? ""}
                    onChange={(e) => setLoginPaisId(Number(e.target.value))}
                    className="border border-r-0 rounded-l-md px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                    data-testid="select-prefix-login"
                  >
                    {(paises || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.bandera || ""} {getDisplayPrefix(p)}
                      </option>
                    ))}
                  </select>
                  <Input
                    id="whatsapp"
                    type="tel"
                    placeholder={getPhoneExample(
                      paises?.find((p) => p.id === loginPaisId)?.codigo ?? "DO"
                    )}
                    value={loginLocalDigits}
                    onChange={(e) => setLoginLocalDigits(e.target.value.replace(/\D/g, ""))}
                    className="rounded-l-none"
                    inputMode="numeric"
                    data-testid="input-whatsapp-login"
                  />
                </div>
                <p className="text-xs text-gray-400">Selecciona tu país + dígitos sin prefijo</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código de acceso</Label>
                <Input
                  id="codigo"
                  type="text"
                  placeholder="Ej: AB3X7K"
                  value={loginForm.codigoAcceso}
                  onChange={(e) => setLoginForm({ ...loginForm, codigoAcceso: e.target.value.toUpperCase() })}
                  className="font-mono tracking-widest uppercase"
                  maxLength={6}
                  data-testid="input-codigo-login"
                />
              </div>

              {loginError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-sm" data-testid="login-error">
                  <AlertCircle size={16} />
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-primary"
                disabled={loginMutation.isPending}
                data-testid="button-login-repartidor"
              >
                {loginMutation.isPending ? (
                  <><Loader2 size={16} className="mr-2 animate-spin" /> Ingresando...</>
                ) : (
                  <>Ingresar <ChevronRight size={16} className="ml-1" /></>
                )}
              </Button>
            </form>
            <p className="text-center text-xs text-gray-400 mt-4">
              Tu código de acceso lo proporciona el dueño del negocio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main Portal ─────────────────────────────────────────────────────────

  const fueraDeHorario = session?.fueraDeHorario ?? false;
  const horaFinTurno = session?.horaFinTurno
    ? new Date(session.horaFinTurno).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen bg-gray-50" style={businessTheme(session?.colmado?.colorPrimario)}>
      {/* Out-of-hours grace-window banner */}
      {fueraDeHorario && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2 text-sm text-amber-800" data-testid="banner-fuera-de-horario">
          <Clock size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <span>
            <strong>El negocio ya está fuera de horario.</strong> Puedes completar tus entregas y cuadrar.
            {horaFinTurno && <> Tu sesión cierra a las <strong>{horaFinTurno}</strong>.</>}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {colmado?.logo ? (
            <img src={colmado.logo} alt="" className="w-9 h-9 rounded-lg object-contain border border-gray-200" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {colmado?.nombre?.charAt(0).toUpperCase() || "N"}
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">Repartidor</p>
            <p className="font-semibold text-sm capitalize leading-tight">{delivery?.nombre}</p>
          </div>
        </div>
        <button
          onClick={() => logoutMutation.mutate()}
          className="text-gray-400 hover:text-red-500 p-2"
          data-testid="button-logout-repartidor"
        >
          <LogOut size={20} />
        </button>
      </div>

      {/* Availability Toggle */}
      <div className="p-4">
        <div className={`rounded-2xl p-5 text-center transition-colors ${isActivo ? 'bg-green-500' : 'bg-gray-200'}`}>
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full ${isActivo ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
            <span className={`text-lg font-bold ${isActivo ? 'text-white' : 'text-gray-500'}`}>
              {isActivo ? "DISPONIBLE" : "NO DISPONIBLE"}
            </span>
          </div>
          {isActivo && delivery?.ultimaActivacion && (
            <p className="text-green-100 text-xs mb-3">
              Activado: {new Date(delivery.ultimaActivacion).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          <Button
            className={`w-full font-bold text-base py-5 rounded-xl ${
              isActivo
                ? 'bg-white text-green-600 hover:bg-green-50'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
            onClick={() => isActivo ? desactivarMutation.mutate() : activarMutation.mutate()}
            disabled={activarMutation.isPending || desactivarMutation.isPending}
            data-testid="button-toggle-disponibilidad"
          >
            {activarMutation.isPending || desactivarMutation.isPending ? (
              <Loader2 size={20} className="animate-spin mr-2" />
            ) : isActivo ? (
              <XCircle size={20} className="mr-2" />
            ) : (
              <CheckCircle2 size={20} className="mr-2" />
            )}
            {isActivo ? "Tomar descanso" : "Estoy disponible"}
          </Button>
        </div>
      </div>

      {/* ── Tabs: Pedidos Asignados / Ruta Optimizada ── */}
      <div className="px-4 pb-2">
        {/* Tab bar */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-4">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "pedidos" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setActiveTab("pedidos")}
            data-testid="tab-pedidos"
          >
            <Package size={14} />
            Pedidos
            {pedidosActivos.length > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold leading-none">
                {pedidosActivos.length}
              </span>
            )}
          </button>
          {session?.delivery && (
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "rutas" ? "bg-white shadow text-gray-800" : "text-gray-500 hover:text-gray-700"}`}
              onClick={() => setActiveTab("rutas")}
              data-testid="tab-rutas"
            >
              <RouteIcon size={14} />
              Ruta optimizada
            </button>
          )}
        </div>

        {/* Live update indicator */}
        {secondsSinceUpdate !== null && (
          <div className="flex justify-end mb-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className={`w-1.5 h-1.5 rounded-full ${secondsSinceUpdate < 15 ? "bg-green-400 animate-pulse" : "bg-gray-300"}`} />
              act. hace {secondsSinceUpdate}s
            </div>
          </div>
        )}

        {activeTab === "pedidos" && (
        pedidosLoading ? (
          <div className="text-center py-10">
            <Loader2 className="animate-spin text-primary mx-auto" size={28} />
            <p className="text-sm text-gray-400 mt-2">Cargando pedidos...</p>
          </div>
        ) : pedidosActivos.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-gray-200" data-testid="no-pedidos">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Package size={26} className="text-gray-300" />
            </div>
            <p className="text-gray-500 text-sm font-medium">Sin pedidos asignados</p>
            {!isActivo && (
              <p className="text-gray-400 text-xs mt-1">Actívate para recibir pedidos</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {pedidosActivos.map((pedido, index) => {
              const total = parseFloat(pedido.totalConfirmado ?? pedido.total) || 0;
              const devuelta = getDevuelta(pedido);
              const esEfectivo = !pedido.metodoPago || pedido.metodoPago === "efectivo";
              const mapUrl = buildMapUrl(pedido.clienteUbicacion, {
                latitud: pedido.clienteLatitud,
                longitud: pedido.clienteLongitud,
              });
              const isUpdating = updateEstadoMutation.isPending;

              let productosParseados: any[] = [];
              try {
                const raw = pedido.productos;
                productosParseados = typeof raw === "string" ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
              } catch {}

              const accentColor =
                pedido.estado === "en_camino" ? "from-blue-400 to-blue-500" :
                pedido.estado === "llegando" ? "from-indigo-400 to-indigo-500" :
                pedido.estado === "pendiente_confirmacion" ? "from-yellow-400 to-yellow-500" :
                pedido.estado === "esperando_pago" ? "from-purple-400 to-purple-500" :
                "from-orange-400 to-orange-500";

              return (
                <div
                  key={pedido.id}
                  className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100"
                  data-testid={`pedido-card-${pedido.id}`}
                >
                  {/* Gradient top accent */}
                  <div className={`h-1.5 w-full bg-gradient-to-r ${accentColor}`} />

                  {/* ── Card Header ── */}
                  <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-gray-900 text-lg leading-none">#{pedido.id}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${ESTADO_COLORS[pedido.estado] || "bg-gray-100 text-gray-600"}`}>
                          {ESTADO_LABELS[pedido.estado] || pedido.estado}
                        </span>
                        {index === 0 && pedidosActivos.length > 1 && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                            🔝 Primero
                          </span>
                        )}
                      </div>
                      <p className="text-base font-bold text-gray-800 mt-1 leading-tight truncate">{pedido.clienteNombre}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={11} className="text-gray-400" />
                        <span className="text-xs text-gray-400">{formatHora(pedido.fechaCreacion)} · {timeAgo(pedido.fechaCreacion)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-green-600 text-2xl leading-none">{moneda}{total.toLocaleString()}</p>
                      <p className="text-xs text-gray-400 capitalize mt-1 font-medium">
                        {pedido.metodoPago === "transferencia" ? "🏦 Transferencia" : pedido.metodoPago === "tarjeta" ? "💳 Tarjeta" : "💵 Efectivo"}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4 space-y-3">

                    {/* ── Products list ── */}
                    <div className="bg-gray-50 rounded-xl overflow-hidden">
                      <div className="px-3 pt-2.5 pb-1 border-b border-gray-100">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                          <ClipboardList size={11} /> Productos
                        </p>
                      </div>
                      <div className="px-3 py-2">
                        {productosParseados.length > 0 ? (
                          <ul className="space-y-2">
                            {productosParseados.map((p: any, i: number) => {
                              const nombre = p.nombre || p.name || "Producto";
                              const cantidad = p.cantidad && Number(p.cantidad) > 1 ? Number(p.cantidad) : null;
                              const precio = p.monto || p.precio || null;
                              return (
                                <li key={i} className="flex items-center justify-between gap-3" data-testid={`producto-${pedido.id}-${i}`}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    {cantidad && (
                                      <span className="shrink-0 bg-gray-200 text-gray-600 text-xs font-bold rounded-md px-1.5 py-0.5 leading-none">
                                        {cantidad}×
                                      </span>
                                    )}
                                    <span className="text-sm text-gray-700 leading-tight">{nombre}</span>
                                  </div>
                                  {precio && (
                                    <span className="text-sm font-bold text-gray-700 shrink-0 tabular-nums">
                                      {moneda}{Number(precio).toLocaleString()}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-600 leading-relaxed py-0.5">{pedido.productos}</p>
                        )}
                      </div>
                    </div>

                    {/* ── Cash: Cobrar / Devolver ── */}
                    {esEfectivo && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center" data-testid={`cobrar-${pedido.id}`}>
                            <p className="text-xs text-green-600 font-bold uppercase tracking-wider mb-1">Cobrar</p>
                            <p className="text-xl font-extrabold text-green-700 leading-none">{moneda}{total.toLocaleString()}</p>
                          </div>
                          {devuelta > 0 ? (
                            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-3 text-center" data-testid={`devolver-${pedido.id}`}>
                              <p className="text-xs text-orange-600 font-bold uppercase tracking-wider mb-1">
                                {pedido.vueltoEntregado ? "Llevas devuelta" : "Devolver"}
                              </p>
                              <p className="text-xl font-extrabold text-orange-700 leading-none">{moneda}{devuelta.toLocaleString()}</p>
                            </div>
                          ) : (
                            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-center">
                              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Devuelta</p>
                              <p className="text-xl font-extrabold text-gray-300 leading-none">{moneda}0</p>
                            </div>
                          )}
                        </div>
                        {pedido.vueltoEntregadoAlDelivery && devuelta > 0 && (
                          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5" data-testid={`vuelto-negocio-${pedido.id}`}>
                            <DollarSign size={15} className="text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-700 font-semibold">El negocio ya te entregó {moneda}{devuelta.toLocaleString()} de devuelta para el cliente</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Location + Phone ── */}
                    <div className="space-y-2">
                      <a
                        href={mapUrl || undefined}
                        target={mapUrl ? "_blank" : undefined}
                        rel={mapUrl ? "noopener noreferrer" : undefined}
                        aria-disabled={!mapUrl}
                        className={`flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-3 transition-colors group ${mapUrl ? "hover:bg-blue-100" : "opacity-60 pointer-events-none"}`}
                        data-testid={`ubicacion-link-${pedido.id}`}
                      >
                        <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                          <Navigation size={17} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-blue-500 font-bold uppercase tracking-wide mb-0.5">Dirección</p>
                          <p className="text-sm text-blue-700 font-medium leading-tight">{pedido.clienteUbicacion || "Dirección por confirmar"}</p>
                          {mapUrl && <p className="text-xs text-blue-500 font-semibold mt-1">Abrir en Google Maps</p>}
                        </div>
                        <ExternalLink size={14} className="text-blue-300 shrink-0 group-hover:text-blue-500 transition-colors" />
                      </a>

                      <a
                        href={`tel:${pedido.clienteWhatsapp}`}
                        className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 hover:bg-gray-100 transition-colors"
                        data-testid={`telefono-link-${pedido.id}`}
                      >
                        <div className="w-9 h-9 bg-gray-700 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
                          <Phone size={16} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-0.5">Teléfono</p>
                          <p className="text-sm text-gray-700 font-semibold">{pedido.clienteWhatsapp}</p>
                        </div>
                      </a>
                    </div>

                    {/* ── Action buttons ── */}
                    <div className="space-y-2 pt-1">
                      <Button
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-5 rounded-xl text-base shadow-sm"
                        onClick={() => updateEstadoMutation.mutate({ pedidoId: pedido.id, estado: "entregado" })}
                        disabled={isUpdating}
                        data-testid={`btn-entregado-${pedido.id}`}
                      >
                        {isUpdating ? <Loader2 size={18} className="mr-2 animate-spin" /> : <CheckCircle2 size={18} className="mr-2" />}
                        Marcar como entregado
                      </Button>

                      {/* "Llegando" — only shown when already en_camino */}
                      {pedido.estado === "en_camino" && (
                        <Button
                          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 rounded-xl text-sm shadow-sm"
                          onClick={() => updateEstadoMutation.mutate({ pedidoId: pedido.id, estado: "llegando" })}
                          disabled={isUpdating}
                          data-testid={`btn-llegando-${pedido.id}`}
                        >
                          {isUpdating ? <Loader2 size={16} className="mr-2 animate-spin" /> : <span className="mr-2">🏠</span>}
                          Ya estoy llegando
                        </Button>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {pedido.estado !== "en_camino" && pedido.estado !== "llegando" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl py-4 font-semibold"
                            onClick={() => updateEstadoMutation.mutate({ pedidoId: pedido.id, estado: "en_camino" })}
                            disabled={isUpdating}
                            data-testid={`btn-en-camino-${pedido.id}`}
                          >
                            <Navigation size={14} className="mr-1.5" />
                            En camino
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className={`text-orange-600 border-orange-200 hover:bg-orange-50 rounded-xl py-4 font-semibold ${(pedido.estado === "en_camino" || pedido.estado === "llegando") ? "col-span-2" : ""}`}
                          onClick={() => { setRetornoModal({ pedidoId: pedido.id }); setRetornoMotivoPersonalizado(""); setRetornoMostrarOtro(false); }}
                          disabled={isUpdating}
                          data-testid={`btn-retorno-${pedido.id}`}
                        >
                          <RotateCcw size={14} className="mr-1.5" />
                          Retorno
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-red-400 border-red-100 hover:bg-red-50 rounded-xl py-3 text-xs font-medium"
                        onClick={() => updateEstadoMutation.mutate({ pedidoId: pedido.id, estado: "cancelado" })}
                        disabled={isUpdating}
                        data-testid={`btn-cancelado-${pedido.id}`}
                      >
                        <XCircle size={13} className="mr-1.5" />
                        Cancelar pedido
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* ── Ruta tab ── */}
        {activeTab === "rutas" && session?.delivery && (
          <div className="bg-white rounded-xl border border-gray-100 p-3">
            <RutaEntrega
              deliveryId={session.delivery.id}
              pedidosDisponibles={pedidosActivos}
              pedidosConEstado={pedidos}
              moneda={moneda}
              onUpdateEstado={(pedidoId, estado, opts) =>
                updateEstadoMutation.mutate({ pedidoId, estado, ...opts })
              }
              onAbrirRetorno={(pedidoId) => {
                setRetornoModal({ pedidoId });
                setRetornoMotivoPersonalizado("");
                setRetornoMostrarOtro(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Order History */}
      {pedidosHistorial.length > 0 && (
        <div className="px-4 mt-2">
          <h2 className="font-semibold text-gray-500 text-sm mb-2">Historial reciente</h2>
          <div className="space-y-2">
            {pedidosHistorial.map((pedido) => (
              <div
                key={pedido.id}
                className="bg-white rounded-xl px-4 py-3 flex items-center justify-between opacity-70"
                data-testid={`historial-${pedido.id}`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-700">#{pedido.id} — {pedido.clienteNombre}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[pedido.estado] || 'bg-gray-100 text-gray-600'}`}>
                      {ESTADO_LABELS[pedido.estado] || pedido.estado}
                    </span>
                    {pedido.estado === "retorno" && pedido.motivoRetorno && (
                      <span className="text-xs text-gray-500 italic" data-testid={`motivo-retorno-${pedido.id}`}>{pedido.motivoRetorno}</span>
                    )}
                  </div>
                </div>
                <p className="font-semibold text-gray-600">{moneda}{parseFloat(pedido.totalConfirmado ?? pedido.total).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cuadres History */}
      <div className={`px-4 mt-4 ${pedidosSinCuadre.length > 0 ? "pb-28" : "pb-8"}`}>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={16} className="text-gray-500" />
          <h2 className="font-semibold text-gray-700">Mis cuadres</h2>
        </div>
        {cuadresHistorial.length === 0 ? (
          <div className="bg-white rounded-xl p-5 text-center text-gray-400 text-sm" data-testid="no-cuadres">
            No tienes cuadres registrados aún
          </div>
        ) : (
          <div className="space-y-2">
            {cuadresHistorial.map((c) => (
              <div key={c.id} className="bg-white rounded-xl shadow-sm overflow-hidden" data-testid={`cuadre-row-${c.id}`}>
                <button
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                  onClick={() => setExpandedCuadreId(expandedCuadreId === c.id ? null : c.id)}
                  data-testid={`cuadre-expand-${c.id}`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {new Date(c.fechaCuadre + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.estado === "confirmado" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {c.estado === "confirmado" ? "Confirmado" : "Pendiente"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{c.pedidosIds.length} pedido{c.pedidosIds.length !== 1 ? "s" : ""} · Neto: <span className="font-semibold text-gray-700">{moneda}{parseFloat(c.netoAEntregar).toLocaleString()}</span></p>
                  </div>
                  {expandedCuadreId === c.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>
                {expandedCuadreId === c.id && (
                  <div className="border-t px-4 py-3 bg-gray-50 text-sm space-y-1.5">
                    <div className="flex justify-between text-gray-600">
                      <span>Efectivo cobrado</span>
                      <span className="font-medium">{moneda}{parseFloat(c.totalEfectivoCobrado).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Devuelta enviada</span>
                      <span className="font-medium">− {moneda}{parseFloat(c.totalDevueltaEntregada).toLocaleString()}</span>
                    </div>
                    {c.totalVueltoRetornado && parseFloat(c.totalVueltoRetornado) > 0 && (
                      <div className="flex justify-between text-orange-600">
                        <span>Devuelta retornada</span>
                        <span className="font-medium">+ {moneda}{parseFloat(c.totalVueltoRetornado).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-gray-900 pt-1 border-t">
                      <span>Neto a entregar</span>
                      <span>{moneda}{parseFloat(c.netoAEntregar).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-gray-400 pt-1">Pedidos: {c.pedidosIds.map(id => `#${id}`).join(", ")}</p>
                    {c.notasRepartidor && <p className="text-xs text-gray-500">Notas: {c.notasRepartidor}</p>}
                    {c.notasNegocio && <p className="text-xs text-blue-600">Negocio: {c.notasNegocio}</p>}
                    {c.fechaConfirmacion && (
                      <p className="text-xs text-green-600">Confirmado: {new Date(c.fechaConfirmacion).toLocaleDateString("es-DO")}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cuadrar sticky banner */}
      {pedidosSinCuadre.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 z-20" data-testid="cuadre-banner">
          <Button
            className="w-full bg-primary font-bold py-5 text-base"
            onClick={() => { setShowCuadreModal(true); setSelectedPedidoIds(new Set(pedidosSinCuadre.map(p => p.id))); }}
            data-testid="button-cuadrar"
          >
            <DollarSign size={20} className="mr-2" />
            Cuadrar ({pedidosSinCuadre.length} pedido{pedidosSinCuadre.length !== 1 ? "s" : ""})
          </Button>
        </div>
      )}

      {/* Cuadre Modal */}
      {showCuadreModal && (
        <div className="fixed inset-0 z-50 bg-gray-950/70 flex flex-col" data-testid="cuadre-modal">
          <div className="bg-white flex-1 flex flex-col max-h-screen overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold">Cuadre de Caja</h2>
                <p className="text-xs text-gray-500">{pedidosSinCuadre.length} pedido{pedidosSinCuadre.length !== 1 ? "s" : ""} pendientes de cuadre</p>
              </div>
              <button onClick={() => setShowCuadreModal(false)} className="p-2 text-gray-400 hover:text-gray-600" data-testid="button-close-cuadre-modal">
                <X size={22} />
              </button>
            </div>

            {/* Pedidos list with checkboxes */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {pedidosSinCuadre.filter(p => p.estado === "entregado").map((p) => {
                const total = parseFloat(p.totalConfirmado ?? p.total) || 0;
                const devuelta = getDevuelta(p);
                const vueltoRegistrado = p.vueltoEntregado !== null && p.vueltoEntregado !== undefined;
                const isSelected = selectedPedidoIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 border transition-colors ${isSelected ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"}`}
                    onClick={() => setSelectedPedidoIds(prev => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}
                    data-testid={`cuadre-pedido-${p.id}`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-green-500 border-green-500" : "border-gray-300"}`}>
                      {isSelected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">#{p.id} — {p.clienteNombre}</p>
                      {devuelta > 0 && (
                        <p className="text-xs text-orange-600 mt-0.5">
                          {vueltoRegistrado ? "Devuelta enviada" : "Devolver"}: {moneda}{devuelta.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-bold text-green-700 shrink-0">{moneda}{total.toLocaleString()}</p>
                  </button>
                );
              })}
              {pedidosSinCuadre.filter(p => p.estado === "retorno").length > 0 && (
                <>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide pt-1">Retornos con devuelta a entregar</p>
                  {pedidosSinCuadre.filter(p => p.estado === "retorno").map((p) => {
                    const vuelto = parseFloat(p.vueltoEntregado ?? "0") || 0;
                    const isSelected = selectedPedidoIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        className={`w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 border transition-colors ${isSelected ? "bg-orange-50 border-orange-400" : "bg-gray-50 border-gray-200"}`}
                        onClick={() => setSelectedPedidoIds(prev => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}
                        data-testid={`cuadre-retorno-${p.id}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "bg-orange-500 border-orange-500" : "border-gray-300"}`}>
                          {isSelected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">#{p.id} — {p.clienteNombre}</p>
                          {p.motivoRetorno && <p className="text-xs text-gray-500 mt-0.5 italic">{p.motivoRetorno}</p>}
                          <p className="text-xs text-orange-600 mt-0.5">Devuelta a retornar: {moneda}{vuelto.toLocaleString()}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium shrink-0">Retorno</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Totals (based on selected pedidos) */}
            {(() => {
              const selEntregados = pedidosSinCuadre.filter(p => p.estado === "entregado" && selectedPedidoIds.has(p.id));
              const selRetornos = pedidosSinCuadre.filter(p => p.estado === "retorno" && selectedPedidoIds.has(p.id));
              const selCobrado = selEntregados.reduce((sum, p) => sum + (parseFloat(p.totalConfirmado ?? p.total) || 0), 0);
              const selDevuelta = selEntregados.reduce((sum, p) => sum + getDevuelta(p), 0);
              const selVueltoRetornado = selRetornos.reduce((sum, p) => sum + (parseFloat(p.vueltoEntregado ?? "0") || 0), 0);
              const selEfectivoRecibidoNegocio = selEntregados.reduce((sum, p) => {
                if (p.vueltoEntregadoAlDelivery && p.vueltoEntregado) {
                  return sum + (parseFloat(p.vueltoEntregado) || 0);
                }
                return sum;
              }, 0);
              const selNeto = selCobrado + selEfectivoRecibidoNegocio + selVueltoRetornado;
              return (
                <div className="px-4 py-3 bg-gray-50 border-t space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Efectivo cobrado</span>
                    <span className="font-medium">{moneda}{selCobrado.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Devuelta enviada</span>
                    <span className="font-medium">− {moneda}{selDevuelta.toLocaleString()}</span>
                  </div>
                  {selVueltoRetornado > 0 && (
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>Devuelta retornada</span>
                      <span className="font-medium">+ {moneda}{selVueltoRetornado.toLocaleString()}</span>
                    </div>
                  )}
                  {selEfectivoRecibidoNegocio > 0 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>Efectivo recibido del negocio</span>
                      <span className="font-medium">+ {moneda}{selEfectivoRecibidoNegocio.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Neto a entregar</span>
                    <span className="text-xl text-primary">{moneda}{selNeto.toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}

            {/* Notes + Confirm */}
            <div className="px-4 py-4 border-t space-y-3">
              <div>
                <Label htmlFor="notas-cuadre" className="text-sm text-gray-700">Notas (opcional)</Label>
                <textarea
                  id="notas-cuadre"
                  placeholder="Alguna observación sobre este cuadre..."
                  value={notasCuadre}
                  onChange={(e) => setNotasCuadre(e.target.value)}
                  className="mt-1.5 w-full resize-none text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  rows={2}
                  data-testid="input-notas-cuadre"
                />
              </div>
              <Button
                className="w-full bg-primary font-bold py-5 text-base"
                disabled={crearCuadreMutation.isPending || selectedPedidoIds.size === 0}
                onClick={() => crearCuadreMutation.mutate({ pedidoIds: Array.from(selectedPedidoIds), notasRepartidor: notasCuadre })}
                data-testid="button-confirmar-cuadre"
              >
                {crearCuadreMutation.isPending ? (
                  <><Loader2 size={18} className="mr-2 animate-spin" /> Procesando...</>
                ) : (
                  <>Confirmar Cuadre</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Retorno Modal */}
      {retornoModal && (
        <div className="fixed inset-0 z-50 bg-gray-950/70 flex items-end" data-testid="retorno-modal">
          <div className="bg-white w-full rounded-t-2xl shadow-xl px-4 pt-5 pb-8 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-gray-900">¿Por qué retornaste el pedido?</h3>
              <button onClick={() => setRetornoModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600" data-testid="button-close-retorno-modal">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {["Cliente ausente", "Dirección no encontrada", "Cliente rechazó el pedido", "Producto dañado"].map((motivo) => (
                <Button
                  key={motivo}
                  variant="outline"
                  className="text-sm text-gray-700 border-gray-300 rounded-xl py-3 h-auto whitespace-normal text-left"
                  onClick={() => {
                    updateEstadoMutation.mutate({ pedidoId: retornoModal.pedidoId, estado: "retorno", motivoRetorno: motivo });
                    setRetornoModal(null);
                  }}
                  data-testid={`btn-motivo-${motivo.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  {motivo}
                </Button>
              ))}
              {!retornoMostrarOtro && (
                <Button
                  variant="outline"
                  className="col-span-2 text-sm text-gray-500 border-gray-200 rounded-xl py-3"
                  onClick={() => setRetornoMostrarOtro(true)}
                  data-testid="btn-motivo-otro"
                >
                  Otro motivo...
                </Button>
              )}
            </div>
            {retornoMostrarOtro && (
              <div className="space-y-2">
                <textarea
                  placeholder="Escribe el motivo..."
                  value={retornoMotivoPersonalizado}
                  onChange={(e) => setRetornoMotivoPersonalizado(e.target.value)}
                  className="w-full resize-none text-sm border border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  rows={2}
                  autoFocus
                  data-testid="input-motivo-personalizado"
                />
                <Button
                  className="w-full font-semibold py-4"
                  disabled={!retornoMotivoPersonalizado.trim() || updateEstadoMutation.isPending}
                  onClick={() => {
                    updateEstadoMutation.mutate({ pedidoId: retornoModal.pedidoId, estado: "retorno", motivoRetorno: retornoMotivoPersonalizado.trim() });
                    setRetornoModal(null);
                  }}
                  data-testid="btn-confirmar-retorno-personalizado"
                >
                  Confirmar retorno
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
