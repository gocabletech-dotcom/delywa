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
  // Este teléfono recuerda quién entró la última vez (nombre y número, nunca el código).
  const claveRecordado = `delywa-repartidor-${slug}`;
  const [recordado, setRecordado] = useState<{ nombre: string; numero: string } | null>(() => {
    try {
      const r = JSON.parse(localStorage.getItem(`delywa-repartidor-${slug}`) || "null");
      return r && typeof r.nombre === "string" && typeof r.numero === "string" ? r : null;
    } catch { return null; }
  });
  const ultimoNumero = useRef<string | null>(null);
  const olvidarRepartidor = () => {
    try { localStorage.removeItem(claveRecordado); } catch { /* sin almacenamiento */ }
    setRecordado(null);
    setLoginForm({ codigoAcceso: "" });
    setLoginError("");
  };
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
  const [activeTab, setActiveTab] = useState<"pedidos" | "rutas" | "cuadre" | "historial">("pedidos");

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

  useEffect(() => {
    const d = session?.delivery;
    const numero = ultimoNumero.current ?? recordado?.numero;
    if (!d?.nombre || !numero) return;
    const dato = { nombre: String(d.nombre), numero };
    try { localStorage.setItem(claveRecordado, JSON.stringify(dato)); } catch { /* sin almacenamiento */ }
    setRecordado(dato);
    // El enlace personal trae el número y el código: se quitan de la barra de direcciones al entrar.
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, [session?.delivery?.id]);

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
      ultimoNumero.current = fullNumber;
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
      setLoginForm({ codigoAcceso: "" });
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
    if (recordado) {
      if (loginForm.codigoAcceso.trim().length < 6) { setLoginError("Escribe los 6 caracteres de tu código"); return; }
      loginMutation.mutate({ overrideNumero: recordado.numero });
      return;
    }
    if (!loginLocalDigits.trim() || !loginForm.codigoAcceso.trim()) {
      setLoginError("Escribe tu número y tu código");
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
    const entrando = loginMutation.isPending;
    const escribirCodigo = (valor: string) => {
      const codigo = valor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      setLoginForm({ ...loginForm, codigoAcceso: codigo });
      setLoginError("");
      // Entra solo al escribir el último carácter.
      if (codigo.length === 6 && !entrando) {
        if (recordado) loginMutation.mutate({ overrideNumero: recordado.numero, overrideCodigo: codigo });
        else if (loginLocalDigits.length >= 7) loginMutation.mutate({ overrideCodigo: codigo });
      }
    };
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center px-5 pt-14 pb-8" style={businessTheme(colmadoPublico?.colorPrimario)}>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="text-center flex flex-col items-center gap-3">
            {colmadoPublico?.logo ? (
              <img src={colmadoPublico.logo} alt="" className="w-[72px] h-[72px] rounded-3xl object-contain bg-white border border-slate-200" />
            ) : (
              <div className="w-[72px] h-[72px] rounded-3xl bg-primary text-primary-foreground flex items-center justify-center">
                <Truck size={34} />
              </div>
            )}
            <div>
              <h1 className="text-[26px] font-bold leading-tight capitalize" data-testid="titulo-login-repartidor">{recordado ? `Hola, ${recordado.nombre.split(" ")[0]}` : "Portal del repartidor"}</h1>
              <p className="text-slate-600 text-[15px] mt-1">{colmadoPublico?.nombre ? `Repartidor de ${colmadoPublico.nombre}` : "Entra para ver tus entregas"}</p>
            </div>
          </div>

          {scheduleEndedBanner && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-900 text-center" data-testid="banner-schedule-ended">
              Tu turno terminó. El negocio ya cerró por hoy.
            </div>
          )}

          <form onSubmit={handleLogin} className="bg-white rounded-3xl border border-slate-200 p-5 flex flex-col gap-4">
            {!recordado && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="whatsapp" className="text-[15px] font-semibold">Tu número de WhatsApp</Label>
                <div className="flex">
                  <select
                    value={loginPaisId ?? ""}
                    onChange={(e) => setLoginPaisId(Number(e.target.value))}
                    className="h-12 border border-slate-300 border-r-0 rounded-l-xl px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="País"
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
                    placeholder={getPhoneExample(paises?.find((p) => p.id === loginPaisId)?.codigo ?? "DO")}
                    value={loginLocalDigits}
                    onChange={(e) => setLoginLocalDigits(e.target.value.replace(/\D/g, ""))}
                    className="h-12 rounded-l-none rounded-r-xl text-base"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    data-testid="input-whatsapp-login"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codigo" className="text-[15px] font-semibold">Tu código de 6 letras o números</Label>
              <Input
                id="codigo"
                type="text"
                placeholder="• • • • • •"
                value={loginForm.codigoAcceso}
                onChange={(e) => escribirCodigo(e.target.value)}
                className="h-16 rounded-2xl border-2 border-slate-300 focus-visible:border-primary text-center font-mono text-3xl font-bold tracking-[0.35em] uppercase placeholder:tracking-[0.2em] placeholder:text-slate-300"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={!!recordado}
                data-testid="input-codigo-login"
              />
              <p className="text-[13px] text-slate-500">Es el código que te dio el colmado. Entra solo al escribir el último.</p>
            </div>

            {loginError && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 text-sm" role="alert" data-testid="login-error">
                <AlertCircle size={16} className="shrink-0" />
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full h-14 rounded-2xl text-[17px] font-bold" disabled={entrando} data-testid="button-login-repartidor">
              {entrando ? <><Loader2 size={18} className="mr-2 animate-spin" /> Entrando…</> : "Entrar"}
            </Button>
          </form>

          <div className="flex flex-col items-center gap-2 text-center">
            {recordado && (
              <button type="button" className="min-h-[44px] text-[15px] font-semibold text-primary" onClick={olvidarRepartidor} data-testid="button-otro-numero">
                No soy <span className="capitalize">{recordado.nombre.split(" ")[0]}</span> · entrar con otro número
              </button>
            )}
            <p className="text-[13px] text-slate-500 leading-relaxed">¿Olvidaste el código? Pídele al colmado que te mande tu enlace por WhatsApp: al abrirlo entras sin escribir nada.</p>
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
    <div className="min-h-screen bg-slate-50 text-slate-900" style={businessTheme(session?.colmado?.colorPrimario)}>
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

      {/* Encabezado: quién soy, si estoy disponible y lo que llevo */}
      <header className="bg-primary text-primary-foreground px-4 pt-4 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {colmado?.logo ? (
              <img src={colmado.logo} alt="" className="w-10 h-10 rounded-xl object-contain bg-white shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center font-bold shrink-0">
                {colmado?.nombre?.charAt(0).toUpperCase() || "N"}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-bold text-lg capitalize leading-tight truncate">{delivery?.nombre}</p>
              <p className="text-xs opacity-80 truncate">{colmado?.nombre || "Repartidor"}</p>
            </div>
          </div>
          <button
            onClick={() => logoutMutation.mutate()}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/10 shrink-0"
            aria-label="Salir"
            data-testid="button-logout-repartidor"
          >
            <LogOut size={19} />
          </button>
        </div>
        <button
          type="button"
          aria-pressed={isActivo}
          onClick={() => (isActivo ? desactivarMutation.mutate() : activarMutation.mutate())}
          disabled={activarMutation.isPending || desactivarMutation.isPending}
          className={`mt-3 w-full min-h-[52px] rounded-2xl px-4 flex items-center justify-between gap-3 text-left ${isActivo ? "bg-white text-slate-900" : "bg-white/15 text-white border border-white/40"}`}
          data-testid="button-toggle-disponibilidad"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            {activarMutation.isPending || desactivarMutation.isPending
              ? <Loader2 size={16} className="animate-spin shrink-0" />
              : <span className={`w-3 h-3 rounded-full shrink-0 ${isActivo ? "bg-primary" : "bg-white/60"}`} />}
            <span className="min-w-0">
              <span className="block font-bold text-[15px] leading-tight">{isActivo ? "Disponible" : "No disponible"}</span>
              <span className="block text-xs opacity-75 truncate">
                {isActivo
                  ? (delivery?.ultimaActivacion ? `Desde las ${new Date(delivery.ultimaActivacion).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}` : "Recibes pedidos")
                  : "No te asignan pedidos"}
              </span>
            </span>
          </span>
          <span className={`text-sm font-semibold shrink-0 ${isActivo ? "text-primary" : ""}`}>{isActivo ? "Tomar descanso" : "Estoy disponible"}</span>
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5">
            <p className="text-xs opacity-80">Por entregar</p>
            <p className="text-xl font-bold leading-tight" data-testid="resumen-por-entregar">{pedidosActivos.length}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5">
            <p className="text-xs opacity-80">Por cuadrar</p>
            <p className="text-xl font-bold leading-tight" data-testid="resumen-por-cuadrar">{moneda}{Math.round(cuadreTotales.neto).toLocaleString("es-DO")}</p>
          </div>
        </div>
      </header>

      {/* ── Tabs: Pedidos Asignados / Ruta Optimizada ── */}
      <div className={`px-4 pt-4 pb-2 ${activeTab === "pedidos" || activeTab === "rutas" ? "" : "hidden"}`}>
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
      {activeTab === "historial" && pedidosHistorial.length === 0 && (
        <p className="mx-4 mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Todavía no tienes entregas terminadas.</p>
      )}
      {activeTab === "historial" && pedidosHistorial.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="font-bold text-slate-900 mb-2">Entregas terminadas</h2>
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
      <div className={`px-4 mt-4 ${activeTab === "cuadre" ? "" : "hidden"}`}>
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
        <div className={`fixed bottom-[4.4rem] left-0 right-0 px-4 py-2 z-20 ${activeTab === "pedidos" || activeTab === "cuadre" ? "" : "hidden"}`} data-testid="cuadre-banner">
          <Button
            className="w-full bg-primary font-bold min-h-[52px] text-base rounded-2xl shadow-lg"
            onClick={() => { setShowCuadreModal(true); setSelectedPedidoIds(new Set(pedidosSinCuadre.map(p => p.id))); }}
            data-testid="button-cuadrar"
          >
            <DollarSign size={20} className="mr-2" />
            Cuadrar ({pedidosSinCuadre.length} pedido{pedidosSinCuadre.length !== 1 ? "s" : ""})
          </Button>
        </div>
      )}

      {/* Espacio para el menú de abajo y el botón de cuadrar */}
      <div className={pedidosSinCuadre.length > 0 ? "h-40" : "h-24"} />

      {/* ── Menú de abajo ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200 flex items-stretch gap-1 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]" aria-label="Secciones">
        {([
          ["pedidos", "Entregas", Package, pedidosActivos.length],
          ["rutas", "Ruta", RouteIcon, 0],
          ["cuadre", "Cuadre", ClipboardList, pedidosSinCuadre.length],
          ["historial", "Historial", Clock, 0],
        ] as const).map(([clave, texto, Icono, cuenta]) => (
          <button
            key={clave}
            type="button"
            aria-current={activeTab === clave ? "page" : undefined}
            onClick={() => { setActiveTab(clave); window.scrollTo({ top: 0 }); }}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl ${activeTab === clave ? "bg-primary/10 text-primary font-bold" : "text-slate-600 font-medium"}`}
            data-testid={`tab-${clave}`}
          >
            <span className="relative">
              <Icono size={21} />
              {cuenta > 0 && <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 px-0.5 flex items-center justify-center leading-none ring-2 ring-white">{cuenta > 9 ? "9+" : cuenta}</span>}
            </span>
            <span className="text-[11px] leading-none">{texto}</span>
          </button>
        ))}
      </nav>

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
