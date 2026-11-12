import { useState, useEffect, useRef } from "react";
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
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Send,
  Mic,
  Square,
  Loader2,
  ChevronLeft,
  Trash2,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(formatDominicanDateTime());
  const [selectedConversacion, setSelectedConversacion] = useState<Conversacion | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(formatDominicanDateTime());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  const [activeTab, setActiveTab] = useState("todas");
  const [searchTerm, setSearchTerm] = useState("");
  const [messageText, setMessageText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
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

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
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
      if (!res.ok) throw new Error("Error al enviar mensaje");
      return res.json();
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["mensajes", selectedConversacion?.id] });
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
      if (!res.ok) throw new Error("Error al enviar nota de voz");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mensajes", selectedConversacion?.id] });
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
    if (confirm("¿Estás seguro de que deseas eliminar esta conversación? Esta acción no se puede deshacer.")) {
      deleteConversacionMutation.mutate(selectedConversacion.id);
    }
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

  const handleSendMessage = () => {
    if (messageText.trim() && selectedConversacion) {
      sendMessageMutation.mutate({ conversacionId: selectedConversacion.id, message: messageText.trim() });
    }
  };

  useEffect(() => {
    if (selectedConversacion && selectedConversacion.noLeidosColmado > 0) {
      markAsReadMutation.mutate(selectedConversacion.id);
    }
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
                )}
              </div>
              <span className="font-heading font-bold text-lg truncate">{colmadoData?.nombre || "Mi Negocio"}</span>
            </div>
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <Link href="/admin" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-dashboard">
              <TrendingUp size={20} />
              Dashboard
            </Link>
            <Link href="/admin/conversaciones" className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary font-medium" data-testid="nav-conversaciones">
              <MessageCircle size={20} />
              Conversaciones
              {(unreadData?.count || 0) > 0 && (
                <Badge className="ml-auto bg-red-500">{unreadData.count}</Badge>
              )}
            </Link>
            <Link href="/admin/clientes" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-clientes">
              <User size={20} />
              Clientes
            </Link>
            <Link href="/admin/pedidos" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-pedidos">
              <Package size={20} />
              Pedidos
            </Link>
            <Link href="/admin/deliveries" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-deliveries">
              <Truck size={20} />
              Deliveries
            </Link>
            <Link href="/admin/ventas" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-ventas">
              <DollarSign size={20} />
              Ventas
            </Link>
            <Link href="/admin/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-settings">
              <Settings size={20} />
              Configuración
            </Link>
            <Link href="/admin/manual" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700" data-testid="nav-manual">
              <BookOpen size={20} />
              Manual de Usuario
            </Link>
          </nav>

          <div className="p-4 border-t space-y-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-10 h-10 rounded-lg border-2 border-gray-300 bg-white flex items-center justify-center text-primary font-bold overflow-hidden shrink-0">
                {colmadoData?.logo ? (
                  <img src={colmadoData.logo} alt="" className="w-full h-full object-contain" />
                ) : (
                  colmadoData?.nombre?.charAt(0).toUpperCase() || "N"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{colmadoData?.nombre || "Mi Negocio"}</p>
                <p className="text-xs text-gray-500">{suscripcionData?.plan?.nombre || "Sin Plan"}</p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 w-full"
              data-testid="button-logout"
            >
              <LogOut size={20} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b px-4 lg:px-6 h-16 flex items-center justify-between">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold font-heading">Conversaciones</h1>
            <p className="text-sm text-gray-500">{currentDateTime}</p>
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

        <main className="flex-1 flex overflow-hidden">
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
                <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2">
                  <button 
                    className="md:hidden p-1 hover:bg-white/20 rounded"
                    onClick={() => setSelectedConversacion(null)}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
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
                    <div className="flex items-center gap-1.5">
                      {selectedConversacion.esDelivery && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-white/20 text-white border-white/30">
                          Delivery
                        </Badge>
                      )}
                      <p className="font-medium text-sm truncate">
                        {selectedConversacion.clienteNombre || selectedConversacion.clienteWhatsapp}
                      </p>
                    </div>
                    <p className="text-xs opacity-80 truncate">{selectedConversacion.clienteWhatsapp}</p>
                  </div>
                  {!selectedConversacion.esDelivery && getEstadoBadge(selectedConversacion.ultimoPedidoEstado)}
                  <button
                    onClick={handleDeleteConversacion}
                    className="p-1.5 hover:bg-red-500/30 rounded transition-colors"
                    title="Eliminar conversación"
                    data-testid="button-delete-conversacion"
                  >
                    <Trash2 size={18} />
                  </button>
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
                            <p className="text-[13px] whitespace-pre-wrap">{msg.contenido}</p>
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
      </div>
    </div>
  );
}
