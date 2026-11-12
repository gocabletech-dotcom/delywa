import { prepararFoto } from "@/lib/imagen";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send, CheckCheck, MoreVertical, Mic, MapPin, Square,
  Loader2, Paperclip, ArrowLeft, ChevronRight, Plus, Minus,
  UtensilsCrossed, ChevronDown, PenLine
} from "lucide-react";
import { businessTheme } from "@/lib/temaNegocio";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number | string;
  clientId?: string;
  rol: "user" | "assistant";
  contenido: string;
  fechaCreacion: string;
  opciones?: string[];
}

interface Colmado {
  id: number;
  nombre: string;
  logo: string | null;
  whatsappNumero: string;
  tipoNegocio: string;
  codigoPais: string;
  etiquetaEstado: string | null;
  etiquetaCodigoPostal: string | null;
  requiereCodigoPostal: boolean;
  ejemploDireccion: string | null;
  ejemploCiudad: string | null;
  ejemploEstado: string | null;
  ejemploCodigoPostal: string | null;
  patronCodigoPostal: string | null;
  colorPrimario?: string | null;
}

interface StoredSession {
  sessionId: string;
  clienteNombre: string;
  clienteWhatsapp: string;
}

interface MenuProducto {
  id: number;
  colmadoId: number;
  nombre: string;
  descripcion: string | null;
  precio: string;
  categoria: string;
  imagen: string | null;
  disponible: boolean;
  orden: number | null;
}

interface MenuData {
  usaMenu: boolean;
  tieneMenu: boolean;
  simboloMoneda: string;
  categorias: string[];
  productosPorCategoria: Record<string, MenuProducto[]>;
}

interface CartItem {
  producto: MenuProducto;
  cantidad: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WA_BG = "#e5ddd5";
const WA_HEADER = "#075E54";
// The business theme owns the primary action color. Keep this alias for the
// WhatsApp-style UI while allowing each business to use its configured color.
const WA_GREEN = "hsl(var(--primary))";

const WA_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' opacity='0.06'%3E%3Cpath fill='%23000' d='M40 38v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V4h-2v4h-4v2h4v4h2V10h4V8h-4zM10 38v-4H8v4H4v2h4v4h2v-4h4v-2h-4zm0-30V4H8v4H4v2h4v4h2V10h4V8h-4z'/%3E%3C/svg%3E")`;

// ─── Session helpers ───────────────────────────────────────────────────────────

function getLocalSessionKey(codigo: string) {
  return `chatSession_${codigo}`;
}

function loadStoredSession(codigo: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(getLocalSessionKey(codigo));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveStoredSession(codigo: string, session: StoredSession) {
  try {
    localStorage.setItem(getLocalSessionKey(codigo), JSON.stringify(session));
  } catch {}
}

function clearStoredSession(codigo: string) {
  try {
    localStorage.removeItem(getLocalSessionKey(codigo));
  } catch {}
}

// ─── Address label helpers ─────────────────────────────────────────────────────

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

interface ParsedAddress {
  calle: string;
  ciudad: string;
  estado: string;
  codigoPostal: string;
}

function parseStoredAddress(address: string, colmado: Colmado): ParsedAddress {
  // The helper stores labelled comma-separated parts. Strip a possible Maps
  // URL appended by an older session before parsing the address fields.
  const cleanAddress = address.split(/\nhttps?:\/\//i)[0].trim();
  const labels = getAddressLabels(colmado.codigoPais);
  const fieldLabels = [
    { key: "calle", labels: [labels.calle, "Dirección", "Direccion", "Street Address", "Endereço"] },
    { key: "ciudad", labels: [labels.ciudad, "Ciudad", "City", "Cidade"] },
    { key: "estado", labels: [colmado.etiquetaEstado || "Provincia", "Provincia", "State", "Estado"] },
    { key: "codigoPostal", labels: [colmado.etiquetaCodigoPostal || "ZIP Code", "ZIP Code", "Código Postal", "Codigo Postal", "Postal Code"] },
  ] as const;
  const parsed: ParsedAddress = { calle: "", ciudad: "", estado: "", codigoPostal: "" };
  const knownLabels = fieldLabels.flatMap(field =>
    field.labels.map(label => ({ key: field.key, label: label.toLowerCase() }))
  );
  const unlabelledParts: string[] = [];

  for (const part of cleanAddress.split(",").map(value => value.trim()).filter(Boolean)) {
    const separator = part.indexOf(":");
    const label = separator > 0 ? part.slice(0, separator).trim().toLowerCase() : "";
    const match = knownLabels.find(item => item.label === label);
    if (match) {
      parsed[match.key] = part.slice(separator + 1).trim();
    } else {
      unlabelledParts.push(part);
    }
  }

  // Keep compatibility with older free-form addresses while preserving any
  // values that were successfully parsed from labelled fields.
  const positionalKeys: Array<keyof ParsedAddress> = ["calle", "ciudad", "estado", "codigoPostal"];
  let positionalIndex = 0;
  for (const part of unlabelledParts) {
    while (positionalIndex < positionalKeys.length && parsed[positionalKeys[positionalIndex]]) {
      positionalIndex++;
    }
    if (positionalIndex >= positionalKeys.length) break;
    parsed[positionalKeys[positionalIndex]] = part;
    positionalIndex++;
  }

  return parsed;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type PageView = "loading" | "onboarding" | "chat" | "tracking";

// ─── Country codes (priority: DO, US, AR, VE, then rest) ──────────────────
const COUNTRIES = [
  { code: "+1",   id: "+1-DO", flag: "🇩🇴", name: "Rep. Dominicana",  digits: 10 },
  { code: "+1",   id: "+1-US", flag: "🇺🇸", name: "Estados Unidos",   digits: 10 },
  { code: "+54",  id: "+54",   flag: "🇦🇷", name: "Argentina",         digits: 10 },
  { code: "+58",  id: "+58",   flag: "🇻🇪", name: "Venezuela",         digits: 10 },
  // ── rest ──
  { code: "+52",  id: "+52",   flag: "🇲🇽", name: "México",            digits: 10 },
  { code: "+57",  id: "+57",   flag: "🇨🇴", name: "Colombia",          digits: 10 },
  { code: "+51",  id: "+51",   flag: "🇵🇪", name: "Perú",              digits: 9  },
  { code: "+56",  id: "+56",   flag: "🇨🇱", name: "Chile",             digits: 9  },
  { code: "+593", id: "+593",  flag: "🇪🇨", name: "Ecuador",           digits: 9  },
  { code: "+595", id: "+595",  flag: "🇵🇾", name: "Paraguay",          digits: 9  },
  { code: "+598", id: "+598",  flag: "🇺🇾", name: "Uruguay",           digits: 8  },
  { code: "+591", id: "+591",  flag: "🇧🇴", name: "Bolivia",           digits: 8  },
  { code: "+502", id: "+502",  flag: "🇬🇹", name: "Guatemala",         digits: 8  },
  { code: "+503", id: "+503",  flag: "🇸🇻", name: "El Salvador",       digits: 8  },
  { code: "+504", id: "+504",  flag: "🇭🇳", name: "Honduras",          digits: 8  },
  { code: "+505", id: "+505",  flag: "🇳🇮", name: "Nicaragua",         digits: 8  },
  { code: "+506", id: "+506",  flag: "🇨🇷", name: "Costa Rica",        digits: 8  },
  { code: "+507", id: "+507",  flag: "🇵🇦", name: "Panamá",            digits: 8  },
  { code: "+53",  id: "+53",   flag: "🇨🇺", name: "Cuba",              digits: 8  },
  { code: "+509", id: "+509",  flag: "🇭🇹", name: "Haití",             digits: 8  },
  { code: "+1",   id: "+1-PR", flag: "🇵🇷", name: "Puerto Rico",       digits: 10 },
  { code: "+34",  id: "+34",   flag: "🇪🇸", name: "España",            digits: 9  },
  { code: "+55",  id: "+55",   flag: "🇧🇷", name: "Brasil",            digits: 11 },
  { code: "+44",  id: "+44",   flag: "🇬🇧", name: "Reino Unido",       digits: 10 },
  { code: "+33",  id: "+33",   flag: "🇫🇷", name: "Francia",           digits: 9  },
  { code: "+49",  id: "+49",   flag: "🇩🇪", name: "Alemania",          digits: 10 },
  { code: "+39",  id: "+39",   flag: "🇮🇹", name: "Italia",            digits: 10 },
  { code: "+351", id: "+351",  flag: "🇵🇹", name: "Portugal",          digits: 9  },
] as const;

export default function PedirPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const search = useSearch();

  // ── Session state ──────────────────────────────────────────────────────────
  const [pageView, setPageView] = useState<PageView>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteWhatsapp, setClienteWhatsapp] = useState("");
  const [logoError, setLogoError] = useState(false);

  // ── Onboarding state ───────────────────────────────────────────────────────
  const [onboardingNombre, setOnboardingNombre] = useState("");
  const [onboardingTel, setOnboardingTel] = useState("");
  const [onboardingCountry, setOnboardingCountry] = useState("+1-DO");   // default: Dominican Republic
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [onboardingNombreError, setOnboardingNombreError] = useState("");
  const [onboardingTelError, setOnboardingTelError] = useState("");
  const [pendingCartSubmit, setPendingCartSubmit] = useState(false);

  // ── Catalog panel state ────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);

  // ── Delivery tracking state ────────────────────────────────────────────────
  const [pedidoEstado, setPedidoEstado] = useState<string | null>(null);
  const [enCaminoDetectedAt, setEnCaminoDetectedAt] = useState<number | null>(null);
  const [colmadoTiempoEstimado, setColmadoTiempoEstimado] = useState<string | null>(null);
  // activePedido: populated when onboarding check finds an existing order
  const [activePedido, setActivePedido] = useState<{
    id: number; estado: string; productos: string;
    total: string; metodoPago: string; fechaCreacion: string;
  } | null>(null);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");

  // True when the last assistant message has active quick-reply chips.
  // While true the entire input area is locked — the user must tap a chip.
  const hasActiveOpciones = messages.length > 0 && (() => {
    const last = [...messages].reverse().find(m => m.rol === "assistant");
    return !!(last?.opciones && last.opciones.length > 0);
  })();
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isUploadingComprobante, setIsUploadingComprobante] = useState(false);

  // ── Address helper state ────────────────────────────────────────────────────
  const [showAddressHelper, setShowAddressHelper] = useState(false);
  const [addrCalle, setAddrCalle] = useState("");
  const [addrCiudad, setAddrCiudad] = useState("");
  const [addrEstado, setAddrEstado] = useState("");
  const [addrCP, setAddrCP] = useState("");
  // addrCPError: empty string = no error, "required" = missing, "format" = wrong format
  const [addrCPError, setAddrCPError] = useState<"" | "required" | "format">("");
  const [addressWasReused, setAddressWasReused] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  // Tracks how many messages were in the list last time we ran the scroll effect.
  // We only auto-scroll when messages are ADDED (count grows), not when an existing
  // message is updated (e.g. voice-note transcription replacing the placeholder).
  const prevMessageCountRef = useRef(0);
  // Set to true when the user explicitly sends a message (force-scroll to bottom).
  const forceScrollRef = useRef(false);
  // Set to true when the user taps a quick-reply chip. Prevents the poll from
  // restoring chips on the previous bot message before the server advances its state.
  // Reset when a new assistant message arrives from the server.
  const suppressChipRestoreRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoRegisteredRef = useRef(false);
  const queryClient = useQueryClient();

  // ─── Data fetching ───────────────────────────────────────────────────────

  const { data: colmado, isLoading: loadingColmado, error: colmadoError } = useQuery<Colmado>({
    queryKey: ["/api/chat-web/colmado", codigo],
    queryFn: async () => {
      const res = await fetch(`/api/chat-web/colmado/${codigo}`);
      if (!res.ok) throw new Error("Negocio no encontrado");
      return res.json();
    },
    enabled: !!codigo,
  });

  const { data: menuData, isLoading: loadingMenu, error: menuError } = useQuery<MenuData>({
    queryKey: ["/api/chat-web/menu", codigo],
    queryFn: async () => {
      const res = await fetch(`/api/chat-web/menu/${codigo}`);
      if (!res.ok) throw new Error("Error al obtener el menú");
      return res.json();
    },
    enabled: !!codigo && !!colmado,
  });

  // Reset logo error when the logo URL changes (e.g. after re-upload in settings)
  useEffect(() => { setLogoError(false); }, [colmado?.logo]);

  // ─── Init session mutation ────────────────────────────────────────────────

  const initSession = useMutation({
    mutationFn: async ({ nombre, whatsapp }: { nombre: string; whatsapp: string }) => {
      const res = await fetch(`/api/chat-web/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colmadoId: colmado?.id,
          clienteNombre: nombre,
          clienteWhatsapp: whatsapp,
        }),
      });
      if (!res.ok) throw new Error("Error al iniciar sesión");
      return res.json();
    },
    onSuccess: (data, vars) => {
      setSessionId(data.sessionId);
      setClienteNombre(vars.nombre);
      setClienteWhatsapp(vars.whatsapp);

      if (data.direccionGuardada && colmado) {
        const savedAddress = parseStoredAddress(data.direccionGuardada, colmado);
        setAddrCalle(savedAddress.calle);
        setAddrCiudad(savedAddress.ciudad);
        setAddrEstado(savedAddress.estado);
        setAddrCP(savedAddress.codigoPostal);
        setAddrCPError("");
        setAddressWasReused(true);
        // Let a returning customer review or complete the address before
        // sending it for the new order.
        if (data.isReturningClient) setShowAddressHelper(true);
      } else {
        setAddrCalle("");
        setAddrCiudad("");
        setAddrEstado("");
        setAddrCP("");
        setAddrCPError("");
        setAddressWasReused(false);
      }

      const initialMessages: Message[] = [];
      if (data.historialMensajes && data.historialMensajes.length > 0) {
        data.historialMensajes.forEach((m: any, index: number) => {
          initialMessages.push({
            id: m.id || index,
            rol: m.rol as "user" | "assistant",
            contenido: m.contenido,
            fechaCreacion: m.fechaCreacion || new Date().toISOString(),
          });
        });
      }
      // If a saved cart was found, append the bot's resume message so the
      // customer sees it immediately before typing anything.
      if (data.mensajeBienvenida) {
        initialMessages.push({
          id: `carrito_bienvenida_${Date.now()}`,
          rol: "assistant" as const,
          contenido: data.mensajeBienvenida,
          fechaCreacion: new Date().toISOString(),
        });
      }
      setMessages(initialMessages);

      if (codigo) {
        saveStoredSession(codigo, {
          sessionId: data.sessionId,
          clienteNombre: vars.nombre,
          clienteWhatsapp: vars.whatsapp,
        });
      }

      if (pendingCartSubmit) {
        setPendingCartSubmit(false);
        sendCartAsMessage(data.sessionId);
      } else if (activePedido) {
        // Has an active order detected from the phone check — stay on tracking screen
        setPageView("tracking");
      } else {
        setPageView("chat");
      }
    },
    onError: () => {
      setPendingCartSubmit(false);
    },
  });

  // ─── Check pedido by phone (used in onboarding) ───────────────────────────
  const checkPedidoMutation = useMutation({
    mutationFn: async ({ whatsapp, colmadoId }: { whatsapp: string; colmadoId: number }) => {
      const res = await fetch(`/api/chat-web/check-pedido?colmadoId=${colmadoId}&whatsapp=${encodeURIComponent(whatsapp)}`);
      if (!res.ok) return { pedido: null };
      return res.json() as Promise<{ pedido: { id: number; estado: string; productos: string; total: string; metodoPago: string; fechaCreacion: string } | null }>;
    },
  });

  // ─── URL params: pre-fill from ?tel= and ?nombre= ────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(search);
    const tel = params.get("tel");
    const nombre = params.get("nombre");
    if (!tel) return;

    const digits = tel.replace(/\D/g, "");
    setOnboardingTel(digits);
    setClienteWhatsapp(digits);

    if (nombre) {
      setOnboardingNombre(nombre.trim());
      setClienteNombre(nombre.trim());
    }
  }, [search]);

  // ─── Auto-register when ?tel= + ?nombre= + colmado loaded ────────────────

  useEffect(() => {
    if (!colmado || !codigo || !menuData) return;
    if (autoRegisteredRef.current) return;

    const params = new URLSearchParams(search);
    const tel = params.get("tel");
    const nombre = params.get("nombre");
    if (!tel || !nombre) return;

    autoRegisteredRef.current = true;
    const digits = tel.replace(/\D/g, "");

    // Check for active pedido before auto-registering too
    (async () => {
      try {
        const res = await fetch(`/api/chat-web/check-pedido?colmadoId=${colmado.id}&whatsapp=${encodeURIComponent(digits)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.pedido) {
            setActivePedido(data.pedido);
            setPedidoEstado(data.pedido.estado);
            setClienteNombre(nombre.trim());
            setClienteWhatsapp(digits);
            setPageView("tracking");
            initSession.mutate({ nombre: nombre.trim(), whatsapp: digits });
            return;
          }
        }
      } catch { /* fall through */ }
      // No active pedido — start a fresh chat session.
      // Pass a per-call onSuccess to explicitly handle the carritoGuardado case:
      // if the session response contains a saved cart, ensure we enter chat view
      // even if the global onSuccess cannot determine the correct pageView due to
      // stale state in the auto-register async context.
      initSession.mutate({ nombre: nombre.trim(), whatsapp: digits }, {
        onSuccess: (sessionData) => {
          if (sessionData.carritoGuardado && sessionData.mensajeBienvenida) {
            setPageView("chat");
          }
        },
      });
    })();
  }, [colmado, menuData, codigo]);

  // ─── Redirect to visual menu when link_pedido is active ──────────────────

  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!menuData || !codigo) return;
    if (menuData.usaMenu) {
      setLocation(`/menu/${codigo}`);
    }
  }, [menuData, codigo]);

  // ─── If menu query fails, fall back to onboarding ─────────────────────────

  useEffect(() => {
    if (!menuError || !colmado || !codigo) return;
    setPageView("onboarding");
  }, [menuError, colmado, codigo]);

  // ─── Show onboarding (pre-fill phone/name from localStorage if available) ──

  useEffect(() => {
    if (!codigo || !colmado || !menuData) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("tel") && params.get("nombre")) return; // auto-register handles this

    const stored = loadStoredSession(codigo);
    if (stored) {
      if (!onboardingTel && stored.clienteWhatsapp) setOnboardingTel(stored.clienteWhatsapp);
      if (!onboardingNombre && stored.clienteNombre) setOnboardingNombre(stored.clienteNombre);
    }
    setPageView("onboarding");
  }, [codigo, colmado, menuData]);

  // ─── Hacer otro pedido (from tracking screen) ────────────────────────────

  const handleHacerOtroPedido = useCallback(() => {
    setMessages([]);
    setPedidoEstado(null);
    setEnCaminoDetectedAt(null);
    setColmadoTiempoEstimado(null);
    setActivePedido(null);
    // Re-init session with same name+phone — skips onboarding
    if (clienteNombre && clienteWhatsapp && colmado) {
      initSession.mutate({ nombre: clienteNombre, whatsapp: clienteWhatsapp });
    } else {
      setPageView("onboarding");
    }
  }, [clienteNombre, clienteWhatsapp, colmado]);

  // ─── Onboarding submit ────────────────────────────────────────────────────

  const handleOnboardingSubmit = async (forCart = false) => {
    setOnboardingNombreError("");
    setOnboardingTelError("");

    const nombre = onboardingNombre.trim();
    const tel = onboardingTel.trim();

    if (!nombre) {
      setOnboardingNombreError("Por favor escribe tu nombre");
      return;
    }
    if (!tel || tel.replace(/\D/g, "").length < 7) {
      setOnboardingTelError("Por favor escribe un número de teléfono válido");
      return;
    }

    // Build full E.164-style phone: countryCode + localDigits (no leading zeros).
    const selectedCountry = COUNTRIES.find(c => c.id === onboardingCountry) ?? COUNTRIES[0];
    const localDigits = tel.replace(/\D/g, "").replace(/^0+/, "");
    const digits = selectedCountry.code.replace("+", "") + localDigits;
    if (forCart) setPendingCartSubmit(true);

    // Check for an existing active order before starting a new session
    if (colmado?.id) {
      try {
        const result = await checkPedidoMutation.mutateAsync({ whatsapp: digits, colmadoId: colmado.id });
        if (result.pedido) {
          // Active order found — store it, set tracking state, init session in bg
          setActivePedido(result.pedido);
          setPedidoEstado(result.pedido.estado);
          setClienteNombre(nombre);
          setClienteWhatsapp(digits);
          setPageView("tracking");
          // Init session in the background so session polling takes over
          initSession.mutate({ nombre, whatsapp: digits });
          return;
        }
      } catch {
        // On error, fall through to normal session init
      }
    }

    initSession.mutate({ nombre, whatsapp: digits });
  };

  // ─── Cart helpers ─────────────────────────────────────────────────────────

  const cartTotal = cart.reduce((sum, item) => sum + parseFloat(item.producto.precio) * item.cantidad, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.cantidad, 0);
  const simbolo = menuData?.simboloMoneda || "RD$";

  const addToCart = (producto: MenuProducto) => {
    setCart(prev => {
      const existing = prev.find(i => i.producto.id === producto.id);
      if (existing) {
        return prev.map(i => i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      }
      return [...prev, { producto, cantidad: 1 }];
    });
  };

  const removeFromCart = (productoId: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.producto.id === productoId);
      if (!existing) return prev;
      if (existing.cantidad === 1) return prev.filter(i => i.producto.id !== productoId);
      return prev.map(i => i.producto.id === productoId ? { ...i, cantidad: i.cantidad - 1 } : i);
    });
  };

  const getCartQuantity = (productoId: number) => {
    return cart.find(i => i.producto.id === productoId)?.cantidad || 0;
  };

  // ─── Cart → chat ──────────────────────────────────────────────────────────

  const sendCartAsMessage = useCallback((sid: string) => {
    if (cart.length === 0) return;

    let msg = `🛒 *Mi pedido:*\n`;
    cart.forEach(item => {
      const subtotal = parseFloat(item.producto.precio) * item.cantidad;
      msg += `• ${item.cantidad}x ${item.producto.nombre} — ${simbolo}${subtotal.toFixed(2)}\n`;
    });
    msg += `\n💰 *Total: ${simbolo}${cartTotal.toFixed(2)}*`;

    setPageView("chat");
    setShowCatalogPanel(false);

    setTimeout(() => {
      const userMessage: Message = {
        id: Date.now(),
        clientId: `opt_${Date.now()}_u`,
        rol: "user",
        contenido: msg,
        fechaCreacion: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      setIsTyping(true);

      fetch(`/api/chat-web/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, mensaje: msg }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.respuesta) {
            const assistantMessage: Message = {
              id: Date.now() + 1,
              clientId: `opt_${Date.now()}_a`,
              rol: "assistant",
              contenido: data.respuesta,
              fechaCreacion: new Date().toISOString(),
              opciones: data.opciones,
            };
            const typingDelay = Math.min(Math.max(data.respuesta.length * 25, 800), 3000);
            setTimeout(() => {
              setIsTyping(false);
              setMessages(prev => {
                const yaExiste = prev.some(m => m.rol === "assistant" && m.contenido === assistantMessage.contenido);
                if (yaExiste) return prev;
                return [...prev, assistantMessage];
              });
            }, typingDelay);
          } else {
            setIsTyping(false);
          }
        })
        .catch(() => setIsTyping(false));
    }, 100);
  }, [cart, cartTotal, simbolo]);

  const handleFinalizarPedido = () => {
    if (cart.length === 0) return;
    if (sessionId) {
      sendCartAsMessage(sessionId);
    } else {
      setShowCatalogPanel(false);
      setPageView("onboarding");
      setPendingCartSubmit(true);
    }
  };

  // ─── Chat messaging ───────────────────────────────────────────────────────

  const sendMessage = useMutation({
    mutationFn: async (mensaje: string) => {
      const res = await fetch(`/api/chat-web/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, mensaje }),
      });
      if (!res.ok) throw new Error("Error al enviar mensaje");
      return res.json();
    },
    onMutate: (mensaje) => {
      const userMessage: Message = {
        id: Date.now(),
        clientId: `opt_${Date.now()}_u`,
        rol: "user",
        contenido: mensaje,
        fechaCreacion: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      setIsTyping(true);
    },
    onSuccess: (data) => {
      if (data.respuesta) {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          clientId: `opt_${Date.now()}_a`,
          rol: "assistant",
          contenido: data.respuesta,
          fechaCreacion: new Date().toISOString(),
          opciones: data.opciones,
        };
        const typingDelay = Math.min(Math.max(data.respuesta.length * 25, 800), 3000);
        setTimeout(() => {
          setIsTyping(false);
          setMessages(prev => {
            const yaExiste = prev.some(m => m.rol === "assistant" && m.contenido === assistantMessage.contenido);
            if (yaExiste) return prev;
            return [...prev, assistantMessage];
          });
        }, typingDelay);
      } else {
        setIsTyping(false);
      }
    },
    onError: () => {
      setIsTyping(false);
    },
  });

  const { data: sessionPollData } = useQuery({
    queryKey: ["chat-web-messages", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await fetch(`/api/chat-web/session/${sessionId}`);
      if (!res.ok) return null;
      return res.json(); // { session, mensajes, pedidoEstado, colmado }
    },
    enabled: !!sessionId && (pageView === "chat" || pageView === "tracking"),
    refetchInterval: 3000,
  });
  const serverMessages: Message[] = sessionPollData?.mensajes ?? [];

  // Poll pedido by phone when in tracking mode but session doesn't have pedidoId yet
  // (covers the window between phone-check detection and the session poll catching up)
  const { data: phonePedidoData } = useQuery({
    queryKey: ["check-pedido-phone", clienteWhatsapp, colmado?.id],
    queryFn: async () => {
      if (!clienteWhatsapp || !colmado?.id) return null;
      const res = await fetch(`/api/chat-web/check-pedido?colmadoId=${colmado.id}&whatsapp=${encodeURIComponent(clienteWhatsapp)}`);
      if (!res.ok) return null;
      return res.json() as Promise<{ pedido: { id: number; estado: string; productos: string; total: string; metodoPago: string; fechaCreacion: string } | null }>;
    },
    enabled: pageView === "tracking" && !!clienteWhatsapp && !!colmado?.id,
    refetchInterval: 3000,
  });

  // Sync activePedido from phone poll (keeps tracking screen up to date)
  useEffect(() => {
    if (!phonePedidoData) return;
    if (phonePedidoData.pedido) {
      const newEstado = phonePedidoData.pedido.estado;
      setActivePedido(phonePedidoData.pedido);
      // Always sync pedidoEstado from phone poll — it hits the DB fresh every 3s
      setPedidoEstado(newEstado);
      if (newEstado === "en_camino" && !enCaminoDetectedAt) {
        setEnCaminoDetectedAt(Date.now());
      }
    }
  }, [phonePedidoData]);

  // Sync messages from poll data
  useEffect(() => {
    if (serverMessages && serverMessages.length > 0) {
      const historyMsgs = messages.filter(m => typeof m.id === "string" && String(m.id).startsWith("history_"));
      const optimisticMsgs = messages.filter(m => typeof m.id === "number" && (m.id as number) >= 1000000000000);
      const currentSessionMsgs = messages.filter(m => typeof m.id === "number" && (m.id as number) < 1000000000000);
      const localMsgIds = new Set(currentSessionMsgs.map(m => m.id));
      const hasNewMessages = serverMessages.some((sm: Message) => !localMsgIds.has(sm.id));

      if (hasNewMessages) {
        const usedClientIds = new Set<string>();
        const mergedServer = serverMessages.map((sm: Message) => {
          // Preserve opciones from the in-memory message (not persisted in DB)
          const inMemory = currentSessionMsgs.find(m => m.id === sm.id);
          const match = optimisticMsgs.find(
            om => om.clientId && !usedClientIds.has(om.clientId) && om.rol === sm.rol && om.contenido === sm.contenido
          );
          if (match?.clientId) {
            usedClientIds.add(match.clientId);
            return { ...sm, clientId: match.clientId, opciones: match.opciones ?? inMemory?.opciones };
          }
          return { ...sm, opciones: inMemory?.opciones };
        });
        const newOptimistic = optimisticMsgs.filter(m => !m.clientId || !usedClientIds.has(m.clientId));
        const allMerged = [...historyMsgs, ...mergedServer, ...newOptimistic];

        // Preserve the synthetic carrito_bienvenida message until its DB copy arrives.
        // The server stores this message in the current session DB immediately on session
        // creation (so it comes back on the first poll), but there is a brief window
        // between when the merge drops the synthetic message and when the numeric-ID DB
        // copy appears in mergedServer.  Keep the synthetic copy visible during that gap.
        const carritoWelcome = messages.find(
          m => typeof m.id === "string" && String(m.id).startsWith("carrito_bienvenida_")
        );
        if (carritoWelcome) {
          const dbCopyPresent = mergedServer.some(
            sm => sm.rol === "assistant" && sm.contenido === carritoWelcome.contenido
          );
          if (!dbCopyPresent) {
            allMerged.push(carritoWelcome);
          }
        }

        // Restore quick-reply chips on the last assistant message when opciones are missing
        // (opciones are not persisted to DB — this covers page reloads and returning clients).
        const estadoConv: string | null = sessionPollData?.estadoConversacion ?? null;
        const metodosDisp: string[] = sessionPollData?.metodosHabilitados ?? [];

        // If a chip was just tapped, wait until a new assistant message arrives before
        // restoring chips — otherwise the poll would re-lock the input before the bot responds.
        if (suppressChipRestoreRef.current) {
          const lastMsg = allMerged[allMerged.length - 1];
          if (lastMsg?.rol === "assistant") {
            // Bot replied — safe to allow chip restoration again
            suppressChipRestoreRef.current = false;
          }
        }

        if (!suppressChipRestoreRef.current && estadoConv && allMerged.length > 0) {
          const lastAssistantIdx = [...allMerged].map((m, i) => ({ m, i }))
            .filter(({ m }) => m.rol === "assistant")
            .slice(-1)[0]?.i ?? -1;
          if (lastAssistantIdx >= 0 && !allMerged[lastAssistantIdx].opciones) {
            let chipsToRestore: string[] | undefined;
            if (estadoConv === "preguntando_algo_mas") {
              chipsToRestore = ["➕ Agregar", "✅ Confirmar pedido"];
            } else if (
              estadoConv === "esperando_metodo_pago" ||
              estadoConv === "esperando_pago"
            ) {
              chipsToRestore = metodosDisp.length > 0 ? metodosDisp : undefined;
            }
            if (chipsToRestore) {
              allMerged[lastAssistantIdx] = { ...allMerged[lastAssistantIdx], opciones: chipsToRestore };
            }
          }
        }

        setMessages(allMerged);
      }
    }
  }, [sessionPollData]);

  // Track pedido estado changes → trigger tracking screen
  useEffect(() => {
    const estado = sessionPollData?.pedidoEstado as string | null | undefined;
    if (!estado) return;

    setPedidoEstado(estado);

    // Capture tiempoEstimado from session poll colmado info
    if (sessionPollData?.colmado?.tiempoEstimado) {
      setColmadoTiempoEstimado(sessionPollData.colmado.tiempoEstimado);
    }

    const trackingStates = ["en_camino", "llegando", "entregado"];
    if (!trackingStates.includes(estado)) return;

    // Mark when we first detected en_camino
    if (estado === "en_camino" && !enCaminoDetectedAt) {
      setEnCaminoDetectedAt(Date.now());
    }

    // llegando or entregado → go to tracking immediately
    if (estado === "llegando" || estado === "entregado") {
      if (pageView !== "tracking") setPageView("tracking");
    }
  }, [sessionPollData]);

  // 60-second timer: after en_camino is detected, transition to tracking screen
  useEffect(() => {
    if (!enCaminoDetectedAt || pageView === "tracking") return;
    const elapsed = Date.now() - enCaminoDetectedAt;
    const remaining = Math.max(0, 60000 - elapsed);
    const timer = setTimeout(() => {
      if (pageView === "chat") setPageView("tracking");
    }, remaining);
    return () => clearTimeout(timer);
  }, [enCaminoDetectedAt]);

  useEffect(() => {
    const container = chatScrollRef.current;
    const currentCount = messages.length;
    const prevCount = prevMessageCountRef.current;

    // Only consider scrolling when the message list grows (new message added)
    // or when isTyping changes (show/hide typing indicator).
    // Skips scrolling for in-place updates like transcription replacing a placeholder.
    const isNewMessage = currentCount > prevCount;
    prevMessageCountRef.current = currentCount;

    if (!container) return;

    // Force-scroll when the user explicitly sent something (voice or text)
    if (forceScrollRef.current && isNewMessage) {
      forceScrollRef.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    forceScrollRef.current = false;

    if (!isNewMessage) return; // pure update (e.g. transcription text swap) — don't scroll

    // New message arrived: only auto-scroll if the user is already near the bottom
    // (within 120px), so reading history is never interrupted by poll updates
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom <= 120) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputMessage.trim() || !sessionId) return;
    forceScrollRef.current = true;
    sendMessage.mutate(inputMessage.trim());
    setInputMessage("");
  };

  const handleSendAddress = () => {
    if (!sessionId || !addrCalle.trim()) return;
    const labels = getAddressLabels(colmado?.codigoPais);
    const etiquetaEstado = colmado?.etiquetaEstado || "Provincia";
    const etiquetaCP = colmado?.etiquetaCodigoPostal;
    const patronCP = colmado?.patronCodigoPostal;
    // Block submission when ZIP is required but missing
    if (colmado?.requiereCodigoPostal && etiquetaCP && !addrCP.trim()) {
      setAddrCPError("required");
      return;
    }
    // Block submission when ZIP is provided but doesn't match expected format
    if (etiquetaCP && addrCP.trim() && patronCP) {
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
    const parts: string[] = [];
    if (addrCalle.trim()) parts.push(`${labels.calle}: ${addrCalle.trim()}`);
    if (addrCiudad.trim()) parts.push(`${labels.ciudad}: ${addrCiudad.trim()}`);
    if (addrEstado.trim()) parts.push(`${etiquetaEstado}: ${addrEstado.trim()}`);
    if (etiquetaCP && addrCP.trim()) parts.push(`${etiquetaCP}: ${addrCP.trim()}`);
    const addressText = parts.join(", ");
    sendMessage.mutate(addressText);
    setShowAddressHelper(false);
    setAddrCalle("");
    setAddrCiudad("");
    setAddrEstado("");
    setAddrCP("");
    setAddrCPError("");
    setAddressWasReused(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleComprobanteUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const original = event.target.files?.[0];
    if (!original || !sessionId) return;
    setIsUploadingComprobante(true);
    try {
      const file = await prepararFoto(original);
      const presignedRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `comprobante_${sessionId}_${Date.now()}.${file.name.split(".").pop()}`,
          size: file.size,
          contentType: file.type,
          uso: "comprobante",
        }),
      });
      if (!presignedRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await presignedRes.json();
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload file");
      const comprobanteRes = await fetch("/api/chat-web/comprobante", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, comprobanteUrl: objectPath }),
      });
      if (!comprobanteRes.ok) throw new Error("Failed to save comprobante");
      queryClient.invalidateQueries({ queryKey: ["/api/chat-web/messages", sessionId] });
    } catch (error) {
      console.error("Error uploading comprobante:", error);
      setMessages(prev => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          rol: "assistant",
          contenido: "❌ Error al subir el comprobante. Por favor intenta de nuevo.",
          fechaCreacion: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsUploadingComprobante(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("No se pudo acceder al micrófono. Por favor, permite el acceso.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const sendVoiceMessage = async (audioBlob: Blob) => {
    if (!sessionId) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const audioDataUrl = reader.result as string;
      // Optimistic placeholder while Whisper is processing
      forceScrollRef.current = true;
      const placeholderId = Date.now();
      const userMessage: Message = {
        id: placeholderId,
        clientId: `opt_${placeholderId}_u`,
        rol: "user",
        contenido: "🎙️ [Nota de voz]",
        fechaCreacion: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage]);
      setIsTyping(true);
      try {
        const res = await fetch(`/api/chat-web/voice-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, audioData: audioDataUrl }),
        });
        const data = await res.json();
        // Replace the placeholder with the actual transcribed text (or keep icon on failure)
        setMessages(prev => prev.map(m =>
          m.id === placeholderId
            ? { ...m, contenido: data.transcribedText ? `🎙️ ${data.transcribedText}` : "🎙️ [Nota de voz]" }
            : m
        ));
        if (data.respuesta) {
          const assistantMessage: Message = {
            id: Date.now() + 1,
            clientId: `opt_${Date.now()}_a`,
            rol: "assistant",
            contenido: data.respuesta,
            fechaCreacion: new Date().toISOString(),
            opciones: data.opciones,
          };
          const typingDelay = Math.min(Math.max(data.respuesta.length * 25, 800), 3000);
          setTimeout(() => {
            setIsTyping(false);
            setMessages(prev => {
              const yaExiste = prev.some(m => m.rol === "assistant" && m.contenido === assistantMessage.contenido);
              if (yaExiste) return prev;
              return [...prev, assistantMessage];
            });
          }, typingDelay);
        } else {
          setIsTyping(false);
        }
      } catch (error) {
        setIsTyping(false);
        console.error("Error sending voice message:", error);
      }
    };
    reader.readAsDataURL(audioBlob);
  };

  const shareLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización");
      return;
    }
    setIsGettingLocation(true);
    const locationSafetyTimer = setTimeout(() => {
      setIsGettingLocation(false);
    }, 12000);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        clearTimeout(locationSafetyTimer);
        const { latitude, longitude } = position.coords;
        const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
        const userMessage: Message = {
          id: Date.now(),
          clientId: `opt_${Date.now()}_u`,
          rol: "user",
          contenido: `📍 Ubicación compartida: ${mapsLink}`,
          fechaCreacion: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMessage]);
        setIsTyping(true);
        let typingScheduled = false;
        try {
          const res = await fetch(`/api/chat-web/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, latitude, longitude }),
          });
          const data = await res.json();
          if (data.respuesta) {
            const assistantMessage: Message = {
              id: Date.now() + 1,
              clientId: `opt_${Date.now()}_a`,
              rol: "assistant",
              contenido: data.respuesta,
              fechaCreacion: new Date().toISOString(),
            };
            const typingDelay = Math.min(Math.max(data.respuesta.length * 25, 800), 3000);
            typingScheduled = true;
            setTimeout(() => {
              setIsTyping(false);
              setMessages(prev => {
                const yaExiste = prev.some(m => m.rol === "assistant" && m.contenido === assistantMessage.contenido);
                if (yaExiste) return prev;
                return [...prev, assistantMessage];
              });
            }, typingDelay);
          }
        } catch (error) {
          console.error("Error sharing location:", error);
        } finally {
          if (!typingScheduled) setIsTyping(false);
          setIsGettingLocation(false);
        }
      },
      (error) => {
        clearTimeout(locationSafetyTimer);
        setIsGettingLocation(false);
        console.error("Error getting location:", error);
        alert("No se pudo obtener tu ubicación.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ─── Delivery Tracking Screen ─────────────────────────────────────────────

  if (pageView === "tracking" && colmado) {
    // States that mean the order is being prepared (not yet in transit)
    const PREP_STATES = ["pendiente", "en_preparacion", "listo", "pendiente_confirmacion", "esperando_pago"];
    const isPrep = PREP_STATES.includes(pedidoEstado ?? "");
    const isEntregado = pedidoEstado === "entregado";
    const isLlegando  = pedidoEstado === "llegando";

    // ── Shared header ──────────────────────────────────────────────────────
    const TrackingHeader = () => (
      <header
        className="text-white px-4 py-2 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: WA_HEADER, boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
      >
        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">
          {colmado.logo && !logoError ? (
            <img src={colmado.logo} alt={colmado.nombre} className="w-full h-full object-cover" onError={() => setLogoError(true)} />
          ) : (
            <span className="font-bold text-sm" style={{ color: WA_HEADER }}>
              {colmado.nombre.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-[15px] leading-tight truncate">{colmado.nombre}</h1>
          <p className="text-[12px] opacity-80">Estado de tu pedido</p>
        </div>
      </header>
    );

    // ── Shared CSS keyframes ───────────────────────────────────────────────
    const TrackingStyles = () => (
      <style>{`
        @keyframes moto-slide {
          0%   { transform: translateX(-8px) rotate(-2deg); }
          50%  { transform: translateX(8px)  rotate(2deg); }
          100% { transform: translateX(-8px) rotate(-2deg); }
        }
        @keyframes road-move {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-48px); }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(37,211,102,0.5); }
          70%  { box-shadow: 0 0 0 12px rgba(37,211,102,0); }
          100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); }
        }
        @keyframes celebrate {
          0%,100% { transform: scale(1) rotate(0deg); }
          25%     { transform: scale(1.15) rotate(-5deg); }
          75%     { transform: scale(1.15) rotate(5deg); }
        }
        @keyframes fade-up {
          from { opacity:0; transform:translateY(16px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes prep-bounce {
          0%,100% { transform: translateY(0) scale(1); }
          40%     { transform: translateY(-10px) scale(1.08); }
          70%     { transform: translateY(-4px) scale(1.03); }
        }
        @keyframes prep-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    );

    // ── Shared bottom action buttons ───────────────────────────────────────
    const TrackingActions = ({ showChat = true }: { showChat?: boolean }) => (
      <div className="w-full max-w-sm mt-5">
        {isEntregado && (
          <button
            onClick={handleHacerOtroPedido}
            disabled={initSession.isPending || checkPedidoMutation.isPending}
            className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 transition-all active:scale-[0.97]"
            style={{ background: WA_GREEN, boxShadow: "0 4px 16px rgba(37,211,102,0.35)" }}
          >
            {initSession.isPending ? (
              <><Loader2 size={20} className="animate-spin" /> Iniciando...</>
            ) : (
              <>🛒 Hacer otro pedido</>
            )}
          </button>
        )}
        {showChat && !isEntregado && (
          <button
            onClick={() => setPageView("chat")}
            className="w-full py-3 rounded-2xl text-sm font-medium text-gray-500 border border-gray-200 bg-white transition-all active:bg-gray-50"
          >
            💬 Ver el chat
          </button>
        )}
      </div>
    );

    // ══════════════════════════════════════════════════════════════════════
    // PREP SCREEN — pendiente / pendiente_confirmacion / esperando_pago
    // ══════════════════════════════════════════════════════════════════════
    if (isPrep) {
      const prepSteps = [
        { key: "recibido",    label: "Recibido",    icon: "📋" },
        { key: "confirmado",  label: "Confirmado",  icon: "✔️"  },
        { key: "en_camino",   label: "En camino",   icon: "🛵"  },
        { key: "entregado",   label: "Entregado",   icon: "✅"  },
      ];
      // step 0 = recibido (pendiente_confirmacion — colmado hasn't confirmed yet)
      // step 1 = confirmado (pendiente or esperando_pago — colmado confirmed)
      const prepActiveIdx =
        pedidoEstado === "esperando_pago" || pedidoEstado === "pendiente" ? 1 : 0;

      const prepInfo =
        pedidoEstado === "esperando_pago"
          ? { label: "Esperando pago", color: "#a855f7", bg: "rgba(168,85,247,0.1)", icon: "💳", desc: "El negocio está esperando la confirmación del pago" }
          : pedidoEstado === "pendiente"
            ? { label: "Pedido confirmado", color: "#22c55e", bg: "rgba(34,197,94,0.1)", icon: "✔️", desc: "Tu pedido fue confirmado y está siendo preparado" }
            : { label: "Esperando confirmación", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "🔍", desc: "El negocio está revisando tu pedido" };

      // Parse products for summary
      let productos: { nombre: string; cantidad?: number; monto?: number }[] = [];
      try {
        const p = activePedido?.productos ?? sessionPollData?.session?.productosCapturados;
        if (typeof p === "string") productos = JSON.parse(p);
        else if (Array.isArray(p)) productos = p;
      } catch { /* ignore */ }

      return (
        <div className="min-h-screen flex flex-col" style={{ background: WA_BG, backgroundImage: WA_PATTERN }}>
          <TrackingHeader />
          <TrackingStyles />

          <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
            {/* Main card */}
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden" style={{ animation: "fade-up 0.4s ease" }}>

              {/* Badge + description */}
              <div className="flex flex-col items-center pt-7 pb-3 px-6">
                <div className="px-4 py-1.5 rounded-full text-sm font-bold mb-2"
                     style={{ background: prepInfo.bg, color: prepInfo.color }}>
                  {prepInfo.label}
                </div>
                <p className="text-gray-500 text-xs text-center">{prepInfo.desc}</p>
              </div>

              {/* Animated icon */}
              <div className="mx-5 my-3 rounded-2xl flex items-center justify-center" style={{ height: 80, background: "#f8fafc" }}>
                <div style={{ fontSize: 46, animation: "prep-bounce 2s ease-in-out infinite" }}>
                  {prepInfo.icon}
                </div>
                {/* Spinner ring */}
                <div style={{
                  position: "absolute",
                  width: 60, height: 60,
                  borderRadius: "50%",
                  border: `3px solid ${prepInfo.color}22`,
                  borderTopColor: prepInfo.color,
                  animation: "prep-spin 1.4s linear infinite",
                }} />
              </div>

              {/* 4-step progress */}
              <div className="px-5 pb-4">
                <div className="flex items-center">
                  {prepSteps.map((step, i) => (
                    <div key={step.key} className="flex items-center" style={{ flex: i < prepSteps.length - 1 ? 1 : 0 }}>
                      <div className="flex flex-col items-center" style={{ minWidth: 44 }}>
                        <div style={{
                          width: 36, height: 36,
                          borderRadius: "50%",
                          background: i <= prepActiveIdx ? prepInfo.color : "#e5e7eb",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16,
                          transition: "all 0.4s ease",
                          animation: i === prepActiveIdx ? "pulse-ring 1.8s ease-in-out infinite" : "none",
                        }}>
                          {i <= prepActiveIdx ? step.icon : (
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db" }} />
                          )}
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, marginTop: 4, textAlign: "center",
                          color: i <= prepActiveIdx ? prepInfo.color : "#9ca3af",
                          transition: "color 0.4s ease",
                        }}>
                          {step.label}
                        </span>
                      </div>
                      {i < prepSteps.length - 1 && (
                        <div style={{
                          flex: 1, height: 3, marginBottom: 20,
                          background: i < prepActiveIdx ? prepInfo.color : "#e5e7eb",
                          transition: "background 0.4s ease",
                        }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Products summary if available */}
              {productos.length > 0 && (
                <div className="mx-5 mb-4 rounded-xl px-3 py-3" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  <p className="text-xs font-bold text-gray-500 mb-2">Tu pedido</p>
                  {productos.slice(0, 4).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-600 py-0.5">
                      <span>{p.cantidad ? `${p.cantidad}x ` : ""}{p.nombre}</span>
                      {p.monto ? <span className="font-medium">RD${p.monto}</span> : null}
                    </div>
                  ))}
                  {productos.length > 4 && (
                    <p className="text-xs text-gray-400 mt-1">+{productos.length - 4} más...</p>
                  )}
                </div>
              )}

              {/* Total */}
              {(activePedido?.total || sessionPollData?.session?.totalEstimado) && (
                <div className="mx-5 mb-5 flex items-center justify-between rounded-xl px-3 py-2.5"
                     style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <span className="text-xs font-bold text-green-700">Total estimado</span>
                  <span className="text-sm font-bold text-green-700">
                    RD${activePedido?.total ?? sessionPollData?.session?.totalEstimado}
                  </span>
                </div>
              )}
            </div>

            <TrackingActions showChat={true} />
          </div>
        </div>
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // DELIVERY TRACKING SCREEN — en_camino / llegando / entregado
    // ══════════════════════════════════════════════════════════════════════
    const trackingSteps = [
      { key: "en_camino", label: "En camino", icon: "🛵" },
      { key: "llegando",  label: "Llegando",  icon: "🏠" },
      { key: "entregado", label: "Entregado", icon: "✅" },
    ];
    const activeIdx =
      isEntregado ? 2 : isLlegando ? 1 : 0;

    const stateInfo = isEntregado
      ? { label: "¡Pedido entregado!", color: "#22c55e", bg: "rgba(34,197,94,0.12)" }
      : isLlegando
        ? { label: "¡Ya está llegando!", color: "#6366f1", bg: "rgba(99,102,241,0.12)" }
        : { label: "En camino", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" };

    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ ...businessTheme(colmado?.colorPrimario), background: WA_BG, backgroundImage: WA_PATTERN }}
      >
        <TrackingHeader />
        <TrackingStyles />

        {/* Tracking content */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">

          {/* White card */}
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden"
               style={{ animation: "fade-up 0.4s ease" }}>

            {/* State badge */}
            <div className="flex flex-col items-center pt-7 pb-2 px-6">
              <div
                className="px-4 py-1.5 rounded-full text-sm font-bold mb-1"
                style={{ background: stateInfo.bg, color: stateInfo.color }}
              >
                {stateInfo.label}
              </div>
              <p className="text-gray-500 text-xs mt-1">
                {isEntregado
                  ? `¡Gracias por tu compra, ${clienteNombre}! 🎉`
                  : isLlegando
                    ? "El delivery está a punto de llegar"
                    : "Tu delivery va en camino a tu dirección"}
              </p>
            </div>

            {/* Moto animation */}
            <div className="mx-5 my-4">
              <div
                className="relative rounded-2xl flex items-center justify-center overflow-hidden"
                style={{ height: 90, background: "#f1f5f9" }}
              >
                {!isEntregado && (
                  <div className="absolute bottom-5 flex gap-3" style={{ animation: "road-move 0.8s linear infinite" }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} style={{ width: 32, height: 4, background: "#cbd5e1", borderRadius: 9 }} />
                    ))}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 44,
                    zIndex: 1,
                    animation: isEntregado
                      ? "celebrate 0.7s ease-in-out infinite"
                      : "moto-slide 1.2s ease-in-out infinite",
                  }}
                >
                  {isEntregado ? "🎉" : "🛵"}
                </div>
                {(isLlegando || isEntregado) && (
                  <div className="absolute right-5" style={{ fontSize: 28, zIndex: 1 }}>
                    {isEntregado ? "✅" : "🏁"}
                  </div>
                )}
              </div>
            </div>

            {/* 3-step progress bar */}
            <div className="px-6 pb-5">
              <div className="flex items-center">
                {trackingSteps.map((step, i) => (
                  <div key={step.key} className="flex items-center" style={{ flex: i < trackingSteps.length - 1 ? 1 : 0 }}>
                    <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
                      <div
                        style={{
                          width: 44, height: 44,
                          borderRadius: "50%",
                          background: i <= activeIdx ? WA_GREEN : "#e5e7eb",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20,
                          transition: "all 0.4s ease",
                          animation: i === activeIdx ? "pulse-ring 1.8s ease-in-out infinite" : "none",
                        }}
                      >
                        {i <= activeIdx ? step.icon : (
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#d1d5db" }} />
                        )}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, marginTop: 5, textAlign: "center", lineHeight: 1.2,
                        color: i <= activeIdx ? WA_GREEN : "#9ca3af",
                        transition: "color 0.4s ease",
                      }}>
                        {step.label}
                      </span>
                    </div>
                    {i < trackingSteps.length - 1 && (
                      <div style={{
                        flex: 1, height: 3, marginBottom: 22,
                        background: i < activeIdx ? WA_GREEN : "#e5e7eb",
                        transition: "background 0.4s ease",
                      }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {!isEntregado && colmadoTiempoEstimado && (
              <div className="mx-5 mb-5 flex items-center gap-2 rounded-xl px-3 py-2.5"
                   style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 16 }}>⏱️</span>
                <span style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>
                  Tiempo estimado: {colmadoTiempoEstimado}
                </span>
              </div>
            )}
          </div>

          <TrackingActions showChat={!isEntregado} />
        </div>
      </div>
    );
  }

  // ─── Error (checked before loading to prevent spinner trap) ──────────────

  if (colmadoError || (!loadingColmado && !colmado)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: WA_BG }}>
        <div className="bg-white rounded-2xl p-8 text-center max-w-md shadow-xl">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Negocio no encontrado</h1>
          <p className="text-gray-500 text-sm">El enlace que usaste no es válido o el negocio no está disponible.</p>
        </div>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loadingColmado || loadingMenu || pageView === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: WA_BG }}>
        <div
          className="animate-spin rounded-full h-12 w-12 border-4 border-transparent"
          style={{ borderTopColor: WA_GREEN }}
        />
      </div>
    );
  }

  if (!colmado) return null;

  // ─── Onboarding ────────────────────────────────────────────────────────────

  if (pageView === "onboarding") {
    const avatarEl = colmado.logo && !logoError ? (
      <img src={colmado.logo} alt={colmado.nombre} className="w-full h-full object-cover" onError={() => setLogoError(true)} />
    ) : (
      <span className="font-bold text-3xl" style={{ color: WA_HEADER }}>
        {colmado.nombre.charAt(0).toUpperCase()}
      </span>
    );

    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: WA_BG, backgroundImage: WA_PATTERN }}
        data-testid="onboarding-container"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="px-6 pt-10 pb-8 text-center" style={{ background: WA_HEADER }}>
            <div className="w-32 h-32 rounded-full bg-white mx-auto flex items-center justify-center overflow-hidden mb-5 shadow-lg">
              {avatarEl}
            </div>
            <h1 className="text-white font-bold text-xl tracking-wide">{colmado.nombre}</h1>
            <p className="text-sm mt-1" style={{ color: "#8CDBCB" }}>
              {menuData?.tieneMenu ? "Menú Digital" : "Chat de Pedidos"}
            </p>
          </div>

          <div className="px-6 py-8">
            <p className="text-gray-700 font-medium text-sm mb-1">¿Cómo te llamas?</p>
            <input
              type="text"
              placeholder="Ej: Juan Pérez"
              value={onboardingNombre}
              onChange={(e) => setOnboardingNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOnboardingSubmit(pendingCartSubmit)}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              autoFocus
              data-testid="input-name"
            />
            {onboardingNombreError && (
              <p className="text-red-500 text-xs mt-1 px-1" data-testid="text-name-error">
                {onboardingNombreError}
              </p>
            )}

            <p className="text-gray-700 font-medium text-sm mb-1 mt-4">Teléfono / WhatsApp</p>
            <div className="relative flex gap-2 items-stretch">
              {/* Country code selector */}
              <button
                type="button"
                onClick={() => setCountryDropdownOpen(o => !o)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-3 bg-white outline-none focus:border-primary focus:ring-1 focus:ring-primary select-none whitespace-nowrap"
                style={{ minWidth: 88 }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>
                  {COUNTRIES.find(c => c.id === onboardingCountry)?.flag}
                </span>
                <span className="text-gray-700 text-sm font-medium">
                  {COUNTRIES.find(c => c.id === onboardingCountry)?.code}
                </span>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-gray-400 flex-shrink-0">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Local number input */}
              <input
                type="tel"
                placeholder="8095551234"
                value={onboardingTel}
                onChange={(e) => setOnboardingTel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOnboardingSubmit(pendingCartSubmit)}
                className="flex-1 rounded-xl border border-gray-300 px-3 py-3 text-[15px] outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                data-testid="input-phone"
              />

              {/* Dropdown */}
              {countryDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCountryDropdownOpen(false)} />
                  <div
                    className="absolute left-0 top-full mt-1 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
                    style={{ width: 268, maxHeight: 300, overflowY: "auto" }}
                  >
                    {COUNTRIES.map((c, i) => (
                      <div key={c.id}>
                        {i === 4 && <div className="h-px bg-gray-100 mx-3 my-1" />}
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                          style={{ background: c.id === onboardingCountry ? "rgba(37,211,102,0.09)" : undefined }}
                          onClick={() => { setOnboardingCountry(c.id); setCountryDropdownOpen(false); }}
                        >
                          <span style={{ fontSize: 22, lineHeight: 1 }}>{c.flag}</span>
                          <span className="flex-1 text-gray-800 text-sm font-medium truncate">{c.name}</span>
                          <span className="text-gray-400 text-sm font-mono">{c.code}</span>
                          {c.id === onboardingCountry && (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M2 7l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            {onboardingTelError && (
              <p className="text-red-500 text-xs mt-1 px-1" data-testid="text-phone-error">
                {onboardingTelError}
              </p>
            )}

            <button
              onClick={() => handleOnboardingSubmit(pendingCartSubmit)}
              disabled={initSession.isPending || checkPedidoMutation.isPending}
              className="mt-6 w-full py-3 rounded-xl text-white font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{ background: WA_GREEN }}
              data-testid="button-start-chat"
            >
              {(initSession.isPending || checkPedidoMutation.isPending) ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {checkPedidoMutation.isPending ? "Verificando..." : "Iniciando..."}
                </>
              ) : (
                <>
                  {pendingCartSubmit ? "Confirmar pedido" : "Empezar a pedir"}
                  <ChevronRight size={20} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  const allProductos = Object.values(menuData?.productosPorCategoria || {}).flat();
  const allCats = ["Todos", ...(menuData?.categorias || [])];
  const catalogFiltered = activeCategory === "Todos"
    ? allProductos
    : (menuData?.productosPorCategoria[activeCategory] || []);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: WA_BG, backgroundImage: WA_PATTERN }}
      data-testid="chat-container"
    >
      <header
        className="text-white px-4 py-2 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: "hsl(var(--primary))", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
      >
        <button
          onClick={() => setPageView(pedidoEstado ? "tracking" : "onboarding")}
          className="p-1 -ml-1 rounded-full active:bg-white/20 transition-colors"
          aria-label="Volver"
          data-testid="button-back"
        >
          <ArrowLeft size={22} className="opacity-80" />
        </button>

        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">
          {colmado.logo && !logoError ? (
            <img src={colmado.logo} alt={colmado.nombre} className="w-full h-full object-cover" onError={() => setLogoError(true)} />
          ) : (
            <span className="font-bold text-sm" style={{ color: WA_HEADER }}>
              {colmado.nombre.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-[15px] leading-tight truncate" data-testid="text-business-name">
            {colmado.nombre}
          </h1>
          <p className="text-[12px] opacity-80 truncate">
            {isTyping ? "escribiendo..." : "en línea"}
          </p>
        </div>

        {menuData?.tieneMenu && (
          <button
            onClick={() => setShowCatalogPanel(prev => !prev)}
            className="p-1 rounded-full transition-colors relative"
            style={{ background: showCatalogPanel ? "rgba(255,255,255,0.2)" : "transparent" }}
            data-testid="button-toggle-catalog"
            title="Ver menú"
          >
            <UtensilsCrossed size={20} />
            {cartItemCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                style={{ background: "#ef4444", color: "white" }}
              >
                {cartItemCount}
              </span>
            )}
          </button>
        )}
        <button className="p-1 opacity-80" data-testid="button-menu">
          <MoreVertical size={20} />
        </button>
      </header>

      {/* ── Catalog panel (slides down below header) ─────────────────────── */}
      {showCatalogPanel && menuData?.tieneMenu && (
        <div
          className="bg-white border-b border-gray-200 overflow-hidden flex flex-col"
          style={{ maxHeight: "58vh" }}
          data-testid="catalog-panel"
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0"
            style={{ background: WA_HEADER }}
          >
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">🍽️ Menú</span>
              {cartItemCount > 0 && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}
                >
                  {cartItemCount} en carrito
                </span>
              )}
            </div>
            <button
              onClick={() => setShowCatalogPanel(false)}
              className="text-white opacity-80 p-1"
              data-testid="button-close-catalog"
            >
              <ChevronDown size={20} />
            </button>
          </div>

          {/* Category pills */}
          {(menuData?.categorias || []).length > 0 && (
            <div className="overflow-x-auto flex-shrink-0 px-3 py-2 bg-gray-50" style={{ scrollbarWidth: "none" }}>
              <div className="flex gap-2 min-w-max">
                {allCats.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className="px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border"
                    style={activeCategory === cat
                      ? { background: WA_GREEN, color: "#fff", borderColor: WA_GREEN }
                      : { background: "#fff", color: "#374151", borderColor: "#d1d5db" }
                    }
                    data-testid={`catalog-tab-${cat}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product rows */}
          <div className="overflow-y-auto flex-1">
            {catalogFiltered.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">Sin productos en esta categoría</p>
            ) : (
              catalogFiltered.map(producto => {
                const qty = getCartQuantity(producto.id);
                return (
                  <div
                    key={producto.id}
                    className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0"
                    data-testid={`catalog-item-${producto.id}`}
                  >
                    {/* Square thumbnail */}
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 shadow-sm">
                      {producto.imagen ? (
                        <img src={producto.imagen} alt={producto.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white text-xl font-bold select-none"
                          style={{ background: WA_HEADER }}
                        >
                          {producto.nombre.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Name + price */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{producto.nombre}</p>
                      {producto.descripcion && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{producto.descripcion}</p>
                      )}
                      <p className="text-sm font-bold mt-0.5" style={{ color: WA_GREEN }}>
                        {simbolo}{parseFloat(producto.precio).toFixed(2)}
                      </p>
                    </div>

                    {/* +/- controls */}
                    {qty === 0 ? (
                      <button
                        onClick={() => addToCart(producto)}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-md active:scale-95 transition-transform"
                        style={{ background: WA_GREEN }}
                        data-testid={`catalog-add-${producto.id}`}
                      >
                        <Plus size={18} />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => removeFromCart(producto.id)}
                          className="w-7 h-7 rounded-full border-2 flex items-center justify-center active:scale-95 transition-transform"
                          style={{ borderColor: WA_GREEN, color: WA_GREEN }}
                          data-testid={`catalog-remove-${producto.id}`}
                        >
                          <Minus size={13} />
                        </button>
                        <span className="font-bold text-sm w-5 text-center">{qty}</span>
                        <button
                          onClick={() => addToCart(producto)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
                          style={{ background: WA_GREEN }}
                          data-testid={`catalog-add-more-${producto.id}`}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Floating cart send footer */}
          {cartItemCount > 0 && (
            <div className="px-3 py-2.5 border-t border-gray-100 flex-shrink-0 bg-white shadow-inner">
              <button
                onClick={handleFinalizarPedido}
                className="w-full py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-between px-4 shadow-sm active:scale-[0.98] transition-transform"
                style={{ background: WA_GREEN }}
                data-testid="button-enviar-pedido"
              >
                <div className="flex items-center gap-2">
                  <Send size={16} />
                  <span>Enviar pedido</span>
                </div>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
                  {simbolo}{cartTotal.toFixed(2)}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      <main ref={chatScrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        <div className="max-w-2xl mx-auto space-y-1 pb-20">
          {messages.length === 0 && !isTyping && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center" data-testid="empty-chat">
              <div
                className="w-28 h-28 rounded-full bg-white shadow-lg flex items-center justify-center mb-4 overflow-hidden border-4"
                style={{ borderColor: WA_GREEN }}
              >
                {colmado.logo ? (
                  <img src={colmado.logo} alt={colmado.nombre} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-3xl" style={{ color: WA_GREEN }}>
                    {colmado.nombre.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-gray-700 font-medium mb-1">¡Hola, {clienteNombre}! 👋</p>
              <p className="text-gray-500 text-sm">
                Escríbenos lo que necesitas y te atendemos al instante.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.clientId ?? String(message.id)}
              className={`flex flex-col ${message.rol === "user" ? "items-end" : "items-start"}`}
              data-testid={`message-${message.rol}-${message.id}`}
            >
              <div
                className="relative max-w-[80%] rounded-lg px-3 py-2 shadow-sm"
                style={{
                  background: message.rol === "user" ? "#DCF8C6" : "#ffffff",
                  borderRadius: message.rol === "user"
                    ? "8px 8px 2px 8px"
                    : "8px 8px 8px 2px",
                }}
              >
                {message.rol === "user" ? (
                  <span
                    style={{
                      position: "absolute", right: -6, bottom: 0,
                      width: 0, height: 0,
                      borderTop: "6px solid #DCF8C6",
                      borderLeft: "6px solid transparent",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      position: "absolute", left: -6, bottom: 0,
                      width: 0, height: 0,
                      borderTop: "6px solid #ffffff",
                      borderRight: "6px solid transparent",
                    }}
                  />
                )}
                <p className="text-[14.5px] text-gray-800 whitespace-pre-wrap break-words leading-snug">
                  {message.contenido.startsWith("📍 Ubicación compartida:") ? "📍 Ubicación compartida" : message.contenido}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className="text-[11px] text-gray-400">{formatTime(message.fechaCreacion)}</span>
                  {message.rol === "user" && (
                    <CheckCheck size={15} style={{ color: "#53bdeb" }} />
                  )}
                </div>
              </div>
              {/* Quick-reply chips — only for the last assistant message with options */}
              {message.rol === "assistant" && message.opciones && message.opciones.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1.5 max-w-[80%]" data-testid={`quick-replies-${message.id}`}>
                  {message.opciones.map((opcion, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        // Dismiss chips immediately on tap and suppress poll from
                        // restoring them before the bot has a chance to respond
                        suppressChipRestoreRef.current = true;
                        setMessages(prev => prev.map(m =>
                          m.id === message.id ? { ...m, opciones: undefined } : m
                        ));
                        forceScrollRef.current = true;
                        sendMessage.mutate(opcion);
                        setInputMessage("");
                      }}
                      disabled={sendMessage.isPending || !sessionId}
                      className="px-3.5 py-1.5 rounded-full text-sm font-medium border-2 bg-white transition-all active:scale-95 disabled:opacity-40 shadow-sm"
                      style={{ borderColor: WA_GREEN, color: WA_GREEN }}
                      data-testid={`quick-reply-${message.id}-${i}`}
                    >
                      {opcion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start" data-testid="typing-indicator">
              <div className="bg-white rounded-lg rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#a0aec0", animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#a0aec0", animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "#a0aec0", animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Address helper panel (shown when bot asks for location) ─────────── */}
      {showAddressHelper && colmado && (
        <div
          className="sticky bottom-0 z-10 bg-white border-t border-gray-200 shadow-lg"
          data-testid="address-helper-panel"
        >
          <div className="max-w-2xl mx-auto px-4 pt-3 pb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">
                {addressWasReused ? "📍 Revisa tu dirección de entrega" : "📍 Escribe tu dirección de entrega"}
              </p>
              <button
                onClick={() => setShowAddressHelper(false)}
                className="text-gray-400 hover:text-gray-600 text-xs"
                data-testid="button-close-address-helper"
              >
                ✕ Cerrar
              </button>
            </div>
            {addressWasReused && (
              <p className="mb-2 text-xs text-gray-500" data-testid="saved-address-notice">
                Encontramos una dirección guardada. Puedes corregir cualquier dato antes de usarla.
              </p>
            )}
            <div className="space-y-2">
              {(() => {
                const labels = getAddressLabels(colmado.codigoPais);
                return (
                  <>
                    <input
                      type="text"
                      placeholder={`${labels.calle} (ej: ${colmado.ejemploDireccion || "Calle Principal #123"})`}
                      value={addrCalle}
                      onChange={(e) => setAddrCalle(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      data-testid="input-addr-calle"
                    />
                    <input
                      type="text"
                      placeholder={`${labels.ciudad} (ej: ${colmado.ejemploCiudad || "Santo Domingo"})`}
                      value={addrCiudad}
                      onChange={(e) => setAddrCiudad(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      data-testid="input-addr-ciudad"
                    />
                  </>
                );
              })()}
              {colmado.etiquetaEstado && (
                <input
                  type="text"
                  placeholder={`${colmado.etiquetaEstado} (ej: ${colmado.ejemploEstado || "Distrito Nacional"})`}
                  value={addrEstado}
                  onChange={(e) => setAddrEstado(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  data-testid="input-addr-estado"
                />
              )}
              {colmado.etiquetaCodigoPostal && (
                <div>
                  <input
                    type="text"
                    placeholder={`${colmado.etiquetaCodigoPostal}${colmado.requiereCodigoPostal ? " *" : ""}${colmado.ejemploCodigoPostal ? ` (ej: ${colmado.ejemploCodigoPostal})` : ""}`}
                    value={addrCP}
                    onChange={(e) => { setAddrCP(e.target.value); if (e.target.value.trim()) setAddrCPError(""); }}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 ${addrCPError ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-gray-300 focus:border-primary focus:ring-primary"}`}
                    data-testid="input-addr-cp"
                  />
                  {addrCPError === "required" && (
                    <p className="mt-1 text-xs text-red-500" data-testid="error-addr-cp">
                      {colmado.etiquetaCodigoPostal} es requerido para este negocio
                    </p>
                  )}
                  {addrCPError === "format" && (
                    <p className="mt-1 text-xs text-red-500" data-testid="error-addr-cp-format">
                      Formato inválido{colmado.ejemploCodigoPostal ? ` — ej: ${colmado.ejemploCodigoPostal}` : ""}
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={handleSendAddress}
                disabled={!addrCalle.trim() || sendMessage.isPending}
                className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: WA_GREEN }}
                data-testid="button-send-address"
              >
                <Send size={16} />
                Usar esta dirección
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="sticky bottom-0 z-10 px-2 py-2" style={{ background: "#f0f0f0" }}>
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          {isRecording ? (
            <>
              <div className="flex-1 flex items-center gap-3 bg-white rounded-full px-4 py-3 shadow-sm">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-500 font-medium text-sm">{formatRecordingTime(recordingTime)}</span>
                <span className="text-gray-500 text-xs">Grabando...</span>
              </div>
              <button
                onClick={stopRecording}
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-md"
                style={{ background: "#ef4444" }}
                data-testid="button-stop-recording"
              >
                <Square size={18} className="text-white" fill="white" />
              </button>
            </>
          ) : (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleComprobanteUpload}
                accept="image/*"
                className="hidden"
                data-testid="input-comprobante"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingComprobante || !sessionId || hasActiveOpciones}
                className="p-2 rounded-full transition-colors disabled:opacity-40"
                style={{ color: "#6b7280" }}
                data-testid="button-attach"
                title="Adjuntar comprobante"
              >
                {isUploadingComprobante ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <Paperclip size={22} />
                )}
              </button>

              <button
                onClick={shareLocation}
                disabled={isGettingLocation || !sessionId || hasActiveOpciones}
                className="p-2 rounded-full transition-colors disabled:opacity-40"
                style={{ color: "#6b7280" }}
                data-testid="button-location"
                title="Compartir ubicación GPS"
              >
                {isGettingLocation ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : (
                  <MapPin size={22} />
                )}
              </button>

              <button
                onClick={() => setShowAddressHelper(prev => !prev)}
                disabled={!sessionId || hasActiveOpciones}
                className="p-2 rounded-full transition-colors disabled:opacity-40"
                style={{ color: showAddressHelper ? WA_GREEN : "#6b7280" }}
                data-testid="button-address-helper"
                title="Escribir dirección"
              >
                <PenLine size={22} />
              </button>

              <div className="flex-1">
                <input
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={hasActiveOpciones ? "Elige una opción arriba ↑" : "Escribe un mensaje"}
                  className="w-full rounded-full bg-white px-4 py-3 text-[15px] outline-none shadow-sm"
                  style={{ border: "none", color: hasActiveOpciones ? "#9ca3af" : undefined }}
                  disabled={!sessionId || hasActiveOpciones}
                  data-testid="input-message"
                />
              </div>

              {inputMessage.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={!inputMessage.trim() || !sessionId || sendMessage.isPending || hasActiveOpciones}
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0 disabled:opacity-40"
                  style={{ background: WA_GREEN }}
                  data-testid="button-send"
                >
                  <Send size={19} className="text-white" style={{ marginLeft: 2 }} />
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={!sessionId || hasActiveOpciones}
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0 disabled:opacity-40"
                  style={{ background: WA_GREEN }}
                  data-testid="button-record"
                  title="Grabar nota de voz"
                >
                  <Mic size={19} className="text-white" />
                </button>
              )}
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
