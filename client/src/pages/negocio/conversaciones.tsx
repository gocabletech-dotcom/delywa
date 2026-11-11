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

type Conversacion = {
  id: number;
  colmadoId: number;
  clienteWhatsapp: string;
  clienteNombre: string | null;
  noLeidosColmado: number;
  ultimoPedidoEstado: string | null;
  ultimoMensaje: string;
  esDelivery: boolean;
};

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
    queryKey: ["pedidos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos`);
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

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
          className="h-8 w-8 sm:h-10 sm:w-10 text-white/80 hover:text-white hover:bg-white/10"
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
        className="h-8 w-8 sm:h-10 sm:w-10 text-white/80 hover:text-white hover:bg-white/10"
        onClick={() => window.location.reload()}
        title="Refrescar"
        data-testid="button-refresh"
      >
        <RefreshCw size={18} className="sm:hidden" />
        <RefreshCw size={20} className="hidden sm:block" />
      </Button>
    </div>
  );

  return (
    <NegocioLayout title="Conversaciones" activeNav="conversaciones" headerRight={conversacionesHeaderRight}>


        <main className="flex-1 flex overflow-hidden min-h-0">
          <div className={`w-full md:w-80 lg:w-96 border-r bg-white flex flex-col ${selectedConversacion ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input
                  placeholder="Buscar cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-cliente"
                />
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="grid grid-cols-4 mx-2 md:mx-4 mt-2 text-xs md:text-sm">
                <TabsTrigger value="todas" data-testid="tab-todas" className="px-1 md:px-3">Todas</TabsTrigger>
                <TabsTrigger value="pendiente" className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700 px-1 md:px-3" data-testid="tab-pendiente">
                  <span className="hidden sm:inline">Pendientes</span>
                  <span className="sm:hidden">Pend.</span>
                </TabsTrigger>
                <TabsTrigger value="entregado" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700 px-1 md:px-3" data-testid="tab-entregado">
                  <span className="hidden sm:inline">Entregados</span>
                  <span className="sm:hidden">Entreg.</span>
                </TabsTrigger>
                <TabsTrigger value="cancelado" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-700 px-1 md:px-3" data-testid="tab-cancelado">
                  <span className="hidden sm:inline">Cancelados</span>
                  <span className="sm:hidden">Canc.</span>
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1">
                <div className="p-2">
                  {loadingConversaciones ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    </div>
                  ) : filteredConversaciones.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <MessageCircle size={48} className="mx-auto mb-2 opacity-50" />
                      <p>No hay conversaciones</p>
                    </div>
                  ) : (
                    filteredConversaciones.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversacion(conv)}
                        className={`p-3 rounded-lg cursor-pointer mb-1 transition-colors ${
                          selectedConversacion?.id === conv.id
                            ? "bg-primary/10 border-l-4 border-primary"
                            : conv.noLeidosColmado > 0
                            ? "bg-green-50 hover:bg-green-100"
                            : "hover:bg-gray-50"
                        }`}
                        data-testid={`conversacion-${conv.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${
                              conv.esDelivery
                                ? "bg-[#075e54] text-white"
                                : conv.noLeidosColmado > 0 
                                ? "bg-[#25D366] text-white" 
                                : "bg-gray-200 text-gray-600"
                            }`}>
                              {conv.esDelivery ? (
                                <Truck size={20} />
                              ) : (
                                (conv.clienteNombre || conv.clienteWhatsapp)[0].toUpperCase()
                              )}
                            </div>
                            {conv.noLeidosColmado > 0 && (
                              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                                {conv.noLeidosColmado > 99 ? "99+" : conv.noLeidosColmado}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                {conv.esDelivery && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-[#075e54]/10 text-[#075e54] border-[#075e54]/30">
                                    Delivery
                                  </Badge>
                                )}
                                <span className={`text-sm truncate ${conv.noLeidosColmado > 0 ? "font-bold text-gray-900" : "font-medium"}`}>
                                  {conv.clienteNombre || conv.clienteWhatsapp}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">#{conv.id}</span>
                              </div>
                              <span className={`text-xs ${conv.noLeidosColmado > 0 ? "text-[#25D366] font-medium" : "text-gray-500"}`}>
                                {formatDate(conv.ultimoMensaje)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              {conv.esDelivery ? (
                                <span className="text-xs text-gray-500">Mensajes de delivery</span>
                              ) : (
                                getEstadoBadge(conv.ultimoPedidoEstado)
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </Tabs>
          </div>

          <div className={`flex-1 flex-col bg-[#e5ddd5] ${selectedConversacion ? 'flex' : 'hidden md:flex'}`}>
            {selectedConversacion ? (
              <>
                <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2 min-w-0">
                  <button
                    className="md:hidden p-1 hover:bg-white/20 rounded shrink-0"
                    onClick={() => setSelectedConversacion(null)}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    selectedConversacion.esDelivery
                      ? "bg-white/20 text-white"
                      : "bg-gray-300 text-gray-700"
                  }`}>
                    {selectedConversacion.esDelivery ? (
                      <Truck size={18} />
                    ) : (
                      (selectedConversacion.clienteNombre || selectedConversacion.clienteWhatsapp)[0].toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {selectedConversacion.esDelivery && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-white/20 text-white border-white/30 shrink-0">
                          Delivery
                        </Badge>
                      )}
                      <p className="font-medium text-sm truncate">
                        {selectedConversacion.clienteNombre || selectedConversacion.clienteWhatsapp}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-xs opacity-80 truncate">#{selectedConversacion.id} • {selectedConversacion.clienteWhatsapp}</p>
                      {!selectedConversacion.esDelivery && (
                        <span className="hidden sm:block shrink-0">{getEstadoBadge(selectedConversacion.ultimoPedidoEstado)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <a
                      href={`https://wa.me/${selectedConversacion.clienteWhatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-white/20 rounded transition-colors"
                      title="Abrir WhatsApp"
                      data-testid="button-whatsapp-manual"
                    >
                      <Phone size={18} />
                    </a>
                    <button
                      onClick={handleDeleteConversacion}
                      className="p-1.5 hover:bg-red-500/30 rounded transition-colors"
                      title="Eliminar conversación"
                      data-testid="button-delete-conversacion"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-2 md:p-3">
                  <div className="space-y-1.5">
                    {loadingMensajes ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                      </div>
                    ) : (
                      [...(mensajes || [])].reverse().map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.rol === "user" ? "justify-start" : "justify-end"}`}
                        >
                          <div
                            className={`max-w-[85%] md:max-w-[70%] lg:max-w-[60%] rounded-lg px-2 py-1.5 shadow text-sm ${
                              msg.rol === "user"
                                ? "bg-white text-gray-800 border border-gray-200"
                                : "bg-[#dcf8c6] text-gray-800"
                            }`}
                            data-testid={`mensaje-${msg.id}`}
                          >
                            <p className="text-[13px] whitespace-pre-wrap">
                              {stripInternalAddressContext(msg.contenido)}
                            </p>
                            <p className="text-[9px] text-gray-500 text-right mt-0.5">
                              {formatTime(msg.fechaEnvio)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="bg-[#f0f0f0] p-2 border-t">
                  {sendError && (
                    <div className="bg-amber-100 border border-amber-300 text-amber-800 px-3 py-2 rounded-lg mb-2 text-xs flex items-start gap-2" data-testid="send-error-banner">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p>{sendError}</p>
                        <button 
                          onClick={() => setSendError(null)} 
                          className="text-amber-600 underline mt-1 text-xs"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                  {isRecording ? (
                    <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1.5">
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-500 font-medium text-sm">Grabando... {formatRecordingTime(recordingTime)}</span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={stopRecording}
                        className="text-red-500 hover:text-red-700 h-8 w-8"
                        data-testid="button-stop-recording"
                      >
                        <Square size={16} fill="currentColor" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-white rounded-full px-3 py-1">
                      <Input
                        placeholder="Escribe un mensaje..."
                        className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm"
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                        disabled={sendMessageMutation.isPending || sendVoiceMutation.isPending}
                        data-testid="input-message"
                      />
                      {messageText.trim() ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={handleSendMessage}
                          disabled={sendMessageMutation.isPending}
                          className="h-8 w-8"
                          data-testid="button-send-message"
                        >
                          {sendMessageMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin text-[#075e54]" />
                          ) : (
                            <Send size={16} className="text-[#075e54]" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={startRecording}
                          disabled={sendVoiceMutation.isPending}
                          className="h-8 w-8"
                          data-testid="button-start-recording"
                        >
                          {sendVoiceMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin text-[#075e54]" />
                          ) : (
                            <Mic size={16} className="text-[#075e54]" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <MessageCircle size={64} className="mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Selecciona una conversación</p>
                  <p className="text-sm">Elige un cliente para ver el historial de chat</p>
                </div>
              </div>
            )}
          </div>
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
