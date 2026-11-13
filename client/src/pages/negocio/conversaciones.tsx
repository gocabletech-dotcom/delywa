import { useState, useEffect, useRef, useCallback } from "react";
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
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  Send,
  UtensilsCrossed,
  Mic,
  Square,
  Loader2,
  ChevronLeft,
  Trash2,
  RefreshCw,
  BookOpen,
  Phone,
  AlertTriangle,
  Smartphone,
  QrCode,
  Copy,
  Check,
  Download,
  ExternalLink,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { stripInternalAddressContext } from "@shared/visible-message";
import { Avatar, Burbuja, Checks, IOS, IPhone, IconoIOS, SeparadorFecha, fondoWhatsApp, horaCorta, textoFecha } from "@/components/whatsapp/ios";

type Conversacion = {
  id: number;
  colmadoId: number;
  clienteWhatsapp: string;
  clienteNombre: string | null;
  noLeidosColmado: number;
  ultimoPedidoEstado: string | null;
  ultimoMensaje: string;
  esDelivery: boolean;
  ultimoTexto?: string | null;
  ultimoRol?: string | null;
};

const esDelCliente = (rol: string) => rol === "user" || rol === "cliente";
const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente_confirmacion: "Por confirmar", esperando_pago: "Esperando pago", esperando_confirmacion_pago: "Revisar pago", pendiente: "Pendiente",
  en_preparacion: "Preparando", listo: "Listo", en_camino: "En camino", llegando: "Llegando", entregado: "Entregado", cancelado: "Cancelado", retorno: "Devuelto",
};
const etiquetaEstado = (e: string | null) => (e ? ETIQUETAS_ESTADO[e] ?? null : null);
function colorEstado(e: string): React.CSSProperties {
  if (e === "entregado") return { background: "#D8FDD2", color: "#15603E" };
  if (e === "cancelado" || e === "retorno") return { background: "#FDE2E1", color: "#B42318" };
  if (e === "en_camino" || e === "llegando") return { background: "#E1F0FF", color: "#0B57D0" };
  return { background: "#FFF1D6", color: "#8A5300" };
}
function vistaPrevia(texto: string | null | undefined): string {
  if (!texto) return "";
  return stripInternalAddressContext(texto).replace(/\*/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}
function horaLista(fecha: string): string {
  const f = new Date(fecha);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (f.toDateString() === hoy.toDateString()) return f.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
  if (f.toDateString() === ayer.toDateString()) return "Ayer";
  return f.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

type Mensaje = {
  id: number;
  conversacionId: number;
  rol: string;
  contenido: string;
  fechaEnvio: string;
};

export default function ConversacionesPage() {
  const [selectedConversacion, setSelectedConversacion] = useState<Conversacion | null>(null);
  const [activeTab, setActiveTab] = useState("todas");
  const [searchTerm, setSearchTerm] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();

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

  const { data: conversaciones, isLoading: loadingConversaciones } = useQuery({
    queryKey: ["conversaciones", colmadoId, activeTab],
    queryFn: async () => {
      const estadoParam = activeTab !== "todas" ? `?estado=${activeTab}` : "";
      const res = await fetch(`/api/colmados/${colmadoId}/conversaciones${estadoParam}`);
      if (!res.ok) throw new Error("Error al cargar conversaciones");
      return res.json() as Promise<Conversacion[]>;
    },
    enabled: !!colmadoId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const { data: mensajes, isLoading: loadingMensajes } = useQuery({
    queryKey: ["mensajes", selectedConversacion?.id],
    queryFn: async () => {
      if (!selectedConversacion) return [];
      const res = await fetch(`/api/conversaciones/${selectedConversacion.id}/mensajes`);
      if (!res.ok) throw new Error("Error al cargar mensajes");
      return res.json() as Promise<Mensaje[]>;
    },
    enabled: !!selectedConversacion,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
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

  const { data: pedidosData } = useQuery({
    queryKey: ["pedidos", colmadoId, "recientes"],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos?recientes=1`);
      if (!res.ok) throw new Error("Error al cargar pedidos");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const pedidosPendientes = pedidosData?.filter((p: any) => p.estado === "pendiente") || [];

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    slug: string | null;
    logo: string | null;
    estado: string;
    tipoNegocio: string;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar colmado");
      return res.json();
    },
    enabled: !!colmadoId,
  });

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

  const markAsReadMutation = useMutation({
    mutationFn: async (conversacionId: number) => {
      const res = await fetch(`/api/conversaciones/${conversacionId}/read`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Error");
      return conversacionId;
    },
    onSuccess: (conversacionId) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey as unknown[];
          return key[0] === "conversaciones" || key[0] === "unread-messages";
        }
      });
      setSelectedConversacion((prev) => 
        prev?.id === conversacionId ? { ...prev, noLeidosColmado: 0 } : prev
      );
    },
  });

  const [sendError, setSendError] = useState<string | null>(null);

  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversacionId, message }: { conversacionId: number; message: string }) => {
      const res = await fetch(`/api/conversaciones/${conversacionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      // Sin WhatsApp integrado: se abre WhatsApp con el mensaje listo para enviarlo a mano.
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.necesitaEnvioManual && data.enlaceWhatsApp) {
          window.open(data.enlaceWhatsApp, "_blank", "noopener");
          return data;
        }
        throw new Error(data.error || "Error al enviar mensaje");
      }
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al enviar mensaje");
      }
      return res.json();
    },
    onSuccess: () => {
      setMessageText("");
      setSendError(null);
      queryClient.invalidateQueries({ queryKey: ["mensajes", selectedConversacion?.id] });
    },
    onError: (error: Error) => {
      setSendError(error.message);
    },
  });

  const sendVoiceMutation = useMutation({
    mutationFn: async ({ conversacionId, audioBlob }: { conversacionId: number; audioBlob: Blob }) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "voice.ogg");
      const res = await fetch(`/api/conversaciones/${conversacionId}/send-voice`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al enviar nota de voz");
      }
      return res.json();
    },
    onSuccess: () => {
      setSendError(null);
      queryClient.invalidateQueries({ queryKey: ["mensajes", selectedConversacion?.id] });
    },
    onError: (error: Error) => {
      setSendError(error.message);
    },
  });

  const deleteConversacionMutation = useMutation({
    mutationFn: async (conversacionId: number) => {
      const res = await fetch(`/api/conversaciones/${conversacionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar conversación");
      return res.json();
    },
    onSuccess: () => {
      setSelectedConversacion(null);
      queryClient.invalidateQueries({ queryKey: ["conversaciones"] });
      queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
    },
  });

  const handleDeleteConversacion = () => {
    if (!selectedConversacion) return;
    setShowDeleteDialog(true);
  };
  
  const confirmDeleteConversacion = () => {
    if (!selectedConversacion) return;
    deleteConversacionMutation.mutate(selectedConversacion.id);
    setShowDeleteDialog(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try OGG first (WhatsApp preferred), fallback to WebM
      let mimeType = "audio/ogg;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm;codecs=opus";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Use the actual recorded mimetype
        const actualMimeType = mediaRecorder.mimeType || mimeType;
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        stream.getTracks().forEach((track) => track.stop());
        
        if (selectedConversacion && audioBlob.size > 0) {
          sendVoiceMutation.mutate({ conversacionId: selectedConversacion.id, audioBlob });
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const chatWebUrl = colmadoData?.slug
    ? `${window.location.origin}/pedir/${colmadoData.slug}`
    : null;

  const handleCopyLink = useCallback(() => {
    if (!chatWebUrl) return;
    const doCopy = () => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(chatWebUrl).then(() => {
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2000);
        }).catch(() => {
          // Fallback for clipboard API failure
          const el = document.createElement("textarea");
          el.value = chatWebUrl;
          el.style.position = "fixed";
          el.style.opacity = "0";
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 2000);
        });
      } else {
        const el = document.createElement("textarea");
        el.value = chatWebUrl;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    };
    doCopy();
  }, [chatWebUrl]);

  const handleDownloadQr = useCallback(() => {
    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${colmadoData?.slug || "negocio"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [colmadoData?.slug]);

  const handleSendMessage = () => {
    if (messageText.trim() && selectedConversacion) {
      sendMessageMutation.mutate({ conversacionId: selectedConversacion.id, message: messageText.trim() });
    }
  };

  useEffect(() => {
    if (selectedConversacion && selectedConversacion.noLeidosColmado > 0) {
      markAsReadMutation.mutate(selectedConversacion.id);
    }
    setSendError(null);
  }, [selectedConversacion?.id]);

  useEffect(() => {
    const caja = messagesEndRef.current?.closest(".overflow-y-auto"); if (caja) caja.scrollTo({ top: caja.scrollHeight, behavior: "smooth" });
  }, [mensajes]);

  const totalNoLeidos = (conversaciones || []).reduce((n, c) => n + (c.noLeidosColmado > 0 ? 1 : 0), 0);
  const filteredConversaciones = (conversaciones || []).filter((c) =>
    (c.clienteNombre || c.clienteWhatsapp).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getEstadoBadge = (estado: string | null) => {
    switch (estado) {
      case "pendiente":
        return <Badge className="bg-orange-500 text-white">Pendiente</Badge>;
      case "en_camino":
        return <Badge className="bg-blue-500 text-white">En Camino</Badge>;
      case "entregado":
        return <Badge className="bg-green-500 text-white">Entregado</Badge>;
      case "cancelado":
        return <Badge className="bg-red-500 text-white">Cancelado</Badge>;
      default:
        return null;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Hoy";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Ayer";
    }
    return date.toLocaleDateString("es-DO", { day: "numeric", month: "short" });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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

  const conversacionesHeaderRight = (
    <div className="flex items-center gap-1">
      {chatWebUrl && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onClick={() => setShowQrDialog(true)}
          title="Mi Link de Pedidos"
          data-testid="button-show-qr"
        >
          <QrCode size={18} className="sm:hidden" />
          <QrCode size={20} className="hidden sm:block" />
        </Button>
      )}
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
  );

  return (
    <NegocioLayout title="Chats" activeNav="conversaciones" headerRight={conversacionesHeaderRight}>


        <main className="flex-1 flex overflow-hidden min-h-0 bg-[#e9edef] md:bg-gradient-to-br md:from-[#dfe7e3] md:to-[#cfd8dc]">
          {/* Se ve como WhatsApp en un iPhone: en computadora con el marco del teléfono, en el celular a pantalla completa. */}
          <IPhone alto="calc(100dvh - 8rem)" altoMovil="calc(100dvh - 147px)" arriba>
            {!selectedConversacion ? (
              <div className="flex-1 min-h-0 flex flex-col bg-white" data-testid="lista-chats">
                <div className="px-4 pt-2 pb-2 shrink-0">
                  <div className="flex items-center justify-between h-8">
                    <span className="text-[17px]" style={{ color: IOS.azul }}>{totalNoLeidos > 0 ? `${totalNoLeidos} sin leer` : ""}</span>
                    {chatWebUrl && (
                      <button onClick={() => setShowQrDialog(true)} className="p-1" title="Mi link de pedidos" aria-label="Mi link de pedidos">
                        <QrCode size={22} color={IOS.azul} />
                      </button>
                    )}
                  </div>
                  <h1 className="text-[34px] font-bold leading-tight tracking-tight text-black">Chats</h1>
                  <div className="mt-2 flex items-center gap-2 rounded-[10px] bg-[#EEEEF0] px-2.5 h-9">
                    <Search size={17} color={IOS.gris} />
                    <input
                      placeholder="Buscar"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 bg-transparent outline-none text-[17px] placeholder:text-[#8E8E93]"
                      data-testid="input-search-cliente"
                    />
                  </div>
                  <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {[["todas", "Todos"], ["pendiente", "Pendientes"], ["entregado", "Entregados"], ["cancelado", "Cancelados"]].map(([valor, texto]) => (
                      <button
                        key={valor}
                        onClick={() => setActiveTab(valor)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium ${activeTab === valor ? "bg-[#D8FDD2] text-[#15603E]" : "bg-[#F0F2F5] text-[#54656F]"}`}
                        data-testid={`tab-${valor}`}
                      >
                        {texto}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto pb-6">
                  {loadingConversaciones ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin" color={IOS.gris} /></div>
                  ) : filteredConversaciones.length === 0 ? (
                    <div className="text-center py-16 px-6 text-[#8E8E93]">
                      <MessageCircle size={44} className="mx-auto mb-3 opacity-40" />
                      <p className="text-[15px]">No hay conversaciones todavía</p>
                    </div>
                  ) : (
                    filteredConversaciones.map((conv) => {
                      const nombre = conv.clienteNombre || conv.clienteWhatsapp;
                      const sinLeer = conv.noLeidosColmado > 0;
                      const mioUltimo = conv.ultimoRol && !["user", "cliente"].includes(conv.ultimoRol);
                      return (
                        <button
                          key={conv.id}
                          onClick={() => setSelectedConversacion(conv)}
                          className="w-full flex items-center gap-3 pl-4 text-left active:bg-[#E5E5EA]"
                          data-testid={`conversacion-${conv.id}`}
                        >
                          {conv.esDelivery
                            ? <div className="w-[52px] h-[52px] rounded-full bg-[#1DAA61] flex items-center justify-center shrink-0"><Truck size={24} color="#fff" /></div>
                            : <Avatar nombre={nombre} tamano={52} color={sinLeer ? IOS.verde : "#BFC8CD"} />}
                          <div className="flex-1 min-w-0 py-2.5 pr-4 border-b border-[#E5E5EA]">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-[17px] font-semibold text-black truncate">{nombre}</span>
                              <span className={`text-[14px] shrink-0 ${sinLeer ? "text-[#1DAA61] font-medium" : "text-[#8E8E93]"}`}>{horaLista(conv.ultimoMensaje)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-[15px] text-[#8E8E93] truncate flex items-center gap-1">
                                {mioUltimo && <Checks />}
                                {conv.esDelivery ? "Mensajes de delivery" : vistaPrevia(conv.ultimoTexto) || etiquetaEstado(conv.ultimoPedidoEstado) || conv.clienteWhatsapp}
                              </span>
                              {sinLeer ? (
                                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#25D366] text-white text-[13px] font-semibold flex items-center justify-center">
                                  {conv.noLeidosColmado > 99 ? "99+" : conv.noLeidosColmado}
                                </span>
                              ) : conv.ultimoPedidoEstado && !conv.esDelivery ? (
                                <span className="shrink-0 text-[11px] font-medium rounded-full px-2 py-0.5" style={colorEstado(conv.ultimoPedidoEstado)}>{etiquetaEstado(conv.ultimoPedidoEstado)}</span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col" data-testid="pantalla-chat">
                {/* Cabecera del chat (iOS) */}
                <div className="shrink-0 flex items-center gap-2 px-2 h-[52px] bg-[#F6F6F6]/95 backdrop-blur border-b border-[#D1D1D6]">
                  <button className="flex items-center gap-1 px-1 h-full" onClick={() => setSelectedConversacion(null)} aria-label="Volver a los chats">
                    {IconoIOS.atras()}
                    {totalNoLeidos > 0 && <span className="text-[17px]" style={{ color: IOS.azul }}>{totalNoLeidos}</span>}
                  </button>
                  {selectedConversacion.esDelivery
                    ? <div className="w-9 h-9 rounded-full bg-[#1DAA61] flex items-center justify-center shrink-0"><Truck size={18} color="#fff" /></div>
                    : <Avatar nombre={selectedConversacion.clienteNombre || selectedConversacion.clienteWhatsapp} tamano={36} color="#BFC8CD" />}
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-[16px] font-semibold text-black truncate">{selectedConversacion.clienteNombre || selectedConversacion.clienteWhatsapp}</p>
                    <p className="text-[12px] text-[#8E8E93] truncate">
                      {selectedConversacion.esDelivery ? "Repartidor" : etiquetaEstado(selectedConversacion.ultimoPedidoEstado) || "Cliente"} · +{selectedConversacion.clienteWhatsapp}
                    </p>
                  </div>
                  <a
                    href={`https://wa.me/${selectedConversacion.clienteWhatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2"
                    title="Llamar o abrir en WhatsApp"
                    data-testid="button-whatsapp-manual"
                  >
                    {IconoIOS.telefono()}
                  </a>
                  <button onClick={handleDeleteConversacion} className="p-2" title="Eliminar conversación" data-testid="button-delete-conversacion">
                    <Trash2 size={20} color="#FF3B30" />
                  </button>
                </div>

                {/* Mensajes sobre el fondo de WhatsApp */}
                <div className="flex-1 min-h-0 overflow-y-auto py-2" style={fondoWhatsApp}>
                  {loadingMensajes ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin" color={IOS.gris} /></div>
                  ) : (
                    (() => {
                      const lista = [...(mensajes || [])].reverse();
                      return lista.map((msg, i) => {
                        const fecha = new Date(msg.fechaEnvio);
                        const anterior = lista[i - 1];
                        const nuevoDia = !anterior || new Date(anterior.fechaEnvio).toDateString() !== fecha.toDateString();
                        const mio = !esDelCliente(msg.rol);
                        const cola = nuevoDia || !anterior || esDelCliente(anterior.rol) !== esDelCliente(msg.rol);
                        return (
                          <div key={msg.id}>
                            {nuevoDia && <SeparadorFecha texto={textoFecha(fecha)} />}
                            <Burbuja mia={mio} cola={cola} hora={horaCorta(fecha)} testId={`mensaje-${msg.id}`}>
                              <span className="whitespace-pre-wrap">{stripInternalAddressContext(msg.contenido)}</span>
                            </Burbuja>
                          </div>
                        );
                      });
                    })()
                  )}
                  <div ref={messagesEndRef} className="h-2" />
                </div>

                {/* Barra para escribir (iOS) */}
                <div className="shrink-0 bg-[#F6F6F6] border-t border-[#D1D1D6] px-2 pt-1.5 pb-2 md:pb-7">
                  {sendError && (
                    <div className="bg-[#FFF8E1] border border-[#FFE082] text-[#7A5B00] px-3 py-2 rounded-xl mb-1.5 text-[13px] flex items-start gap-2" data-testid="send-error-banner">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p>{sendError}</p>
                        <button onClick={() => setSendError(null)} className="underline mt-1 text-[12px]">Cerrar</button>
                      </div>
                    </div>
                  )}
                  {isRecording ? (
                    <div className="flex items-center gap-3 h-9 px-2">
                      <span className="w-2.5 h-2.5 bg-[#FF3B30] rounded-full animate-pulse" />
                      <span className="flex-1 text-[16px] text-black tabular-nums">{formatRecordingTime(recordingTime)}</span>
                      <button onClick={stopRecording} className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center" data-testid="button-stop-recording" aria-label="Enviar nota de voz">
                        {IconoIOS.enviar()}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <div className="flex-1 flex items-center rounded-[18px] bg-white border border-[#D1D1D6] px-3 min-h-[36px]">
                        <input
                          placeholder="Mensaje"
                          className="flex-1 bg-transparent outline-none text-[16px] py-1.5"
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                          disabled={sendMessageMutation.isPending || sendVoiceMutation.isPending}
                          data-testid="input-message"
                        />
                      </div>
                      {messageText.trim() ? (
                        <button
                          onClick={handleSendMessage}
                          disabled={sendMessageMutation.isPending}
                          className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center shrink-0"
                          aria-label="Enviar"
                          data-testid="button-send-message"
                        >
                          {sendMessageMutation.isPending ? <Loader2 size={16} className="animate-spin text-white" /> : IconoIOS.enviar()}
                        </button>
                      ) : (
                        <button
                          onClick={startRecording}
                          disabled={sendVoiceMutation.isPending}
                          className="w-9 h-9 flex items-center justify-center shrink-0"
                          aria-label="Grabar nota de voz"
                          data-testid="button-start-recording"
                        >
                          {sendVoiceMutation.isPending ? <Loader2 size={18} className="animate-spin" color={IOS.azul} /> : IconoIOS.microfono()}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </IPhone>
        </main>

      {/* QR Code Dialog */}
      {showQrDialog && chatWebUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowQrDialog(false)}
          data-testid="qr-dialog-overlay"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-testid="qr-dialog"
          >
            <div className="bg-[#075E54] px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-lg">Mi Link de Pedidos</h2>
                <p className="text-[#8CDBCB] text-xs mt-0.5">Compártelo con tus clientes</p>
              </div>
              <button
                onClick={() => setShowQrDialog(false)}
                className="text-white/70 hover:text-white p-1"
                data-testid="button-close-qr"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center gap-5">
              {/* QR Code */}
              <div className="p-4 bg-white rounded-xl shadow-md border border-gray-100">
                <QRCodeCanvas
                  id="qr-canvas"
                  value={chatWebUrl}
                  size={200}
                  fgColor="#075E54"
                  bgColor="#ffffff"
                  level="M"
                  includeMargin={false}
                  data-testid="qr-canvas"
                />
              </div>

              {/* URL display */}
              <div className="w-full">
                <p className="text-xs text-gray-500 mb-1 text-center">Tu link de pedidos web</p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
                  <span className="text-xs text-gray-700 flex-1 truncate font-mono" data-testid="text-chat-url">
                    {chatWebUrl}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: linkCopied ? "#f0fdf4" : "#f9fafb",
                    border: `1px solid ${linkCopied ? "#86efac" : "#e5e7eb"}`,
                    color: linkCopied ? "#15803d" : "#374151",
                  }}
                  data-testid="button-copy-link"
                >
                  {linkCopied ? (
                    <>
                      <Check size={16} />
                      ¡Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copiar link
                    </>
                  )}
                </button>

                <button
                  onClick={handleDownloadQr}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
                  style={{ background: "#25D366" }}
                  data-testid="button-download-qr"
                >
                  <Download size={16} />
                  Descargar QR
                </button>
              </div>

              <a
                href={chatWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#075E54] hover:underline"
                data-testid="link-open-chat"
              >
                <ExternalLink size={13} />
                Ver cómo lo ven tus clientes
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo de confirmación para eliminar conversación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar conversación</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>¿Eliminar la conversación con <strong>{selectedConversacion?.clienteNombre || selectedConversacion?.clienteWhatsapp}</strong>?</p>
                <p className="mt-2 text-green-700 font-medium">Se conservará: el cliente y todo su historial de pedidos.</p>
                <p className="mt-1">Se eliminarán: los mensajes del chat. Esta acción no se puede deshacer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteConversacion}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NegocioLayout>
  );
}
