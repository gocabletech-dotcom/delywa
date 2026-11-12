import { prepararLogo } from "@/lib/imagen";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Store, Users, Package, DollarSign, Settings, LogOut, MessageSquare, Save, X, Plus, Edit, ChevronDown, ChevronRight, MapPin, Phone, Trash2, Building2, Percent, Crown, Image, Video, Download, Tag, FileText, LayoutGrid, BookOpen, Sparkles, Check, AlertCircle, Ban, Play, Truck, Brain, Globe, KeyRound } from "lucide-react";
import { IntegracionesSection } from "@/components/admin/IntegracionesSection";
import promoVideo1 from "@assets/generated_videos/complete_delivery_flow_sequence.mp4";
import promoVideo2 from "@assets/generated_videos/delywa_logo_with_slogan.mp4";
import promoVideoFull1 from "@assets/generated_videos/customer_types_order_ai_responds.mp4";
import promoVideoFull2 from "@assets/generated_videos/owner_confirms_delivery_receives_order.mp4";
import promoVideoFull3 from "@assets/generated_videos/green_delivery_delywa_logo_finale.mp4";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface TecnologiasHabilitadas {
  api_evo?: boolean;
  meta?: boolean;
  link_pedido?: boolean;
}

interface Negocio {
  id: number;
  nombre: string;
  whatsappNumero: string;
  direccion: string;
  ciudad: string | null;
  provincia: string | null;
  estado: string;
  ownerUserId: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappAccessToken: string | null;
  evolutionApiUrl: string | null;
  evolutionApiKey: string | null;
  evolutionInstanceName: string | null;
  whatsappProvider: string | null;
  fechaSuscripcion: string;
  tipoNegocio: string;
  impuesto: string | null;
  logo: string | null;
  planId: number;
  fechaInicioPlan: string | null;
  fechaVencimiento: string | null;
  estadoSuscripcion: string;
  diaCorte: number;
  diasGracia: number;
  paisId: number | null;
  codigoPostal: string | null;
  tecnologiasHabilitadas: TecnologiasHabilitadas | null;
}

interface Plan {
  id: number;
  nombre: string;
  slug: string;
  precioMensual: string;
  duracionDias: number;
  esTrial: boolean;
  descripcionCorta: string | null;
  caracteristicas: string[];
  limiteDeliveries: number | null;
  limitePedidosDiarios: number | null;
  soportePrioritario: boolean;
  activo: boolean;
  orden: number;
}

interface TipoNegocioCatalogo {
  id: number;
  slug: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  activo: boolean;
  orden: number;
  fechaCreacion: string;
}

interface PlatformStats {
  totalColmados: number;
  totalDeliveries: number;
  totalPedidos: number;
  totalVentas: string;
}

interface MenuPlantillaItem {
  id: number;
  plantillaId: number;
  nombre: string;
  precioSugerido: string | null;
  descripcion: string | null;
  orden: number;
  activo: boolean;
}

interface MenuPlantilla {
  id: number;
  tipoNegocio: string;
  categoria: string;
  orden: number;
  activo: boolean;
  items: MenuPlantillaItem[];
}

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  whatsappNumero: string | null;
  role: string;
  colmadoId: number | null;
  deliveryId: number | null;
  createdAt: string;
}

interface PlantillaJerga {
  id: number;
  tipoNegocio: string;
  jerga: string;
  productoIdentificado: string;
  precioSugerido: string | null;
  descripcion: string | null;
  activo: boolean;
  fechaCreacion: string;
  paisId: number | null;
}

interface ConocimientoArchivo {
  id: number;
  tipoNegocio: string;
  nombre: string;
  contenido: string;
  fechaCreacion: string;
}

interface Pais {
  id: number;
  codigo: string;
  nombre: string;
  bandera: string | null;
  prefijoCelular: string;
  moneda: string;
  simboloMoneda: string;
  zonaHoraria: string;
  activo: boolean;
  fechaCreacion: string;
  etiquetaEstado: string | null;
  etiquetaCodigoPostal: string | null;
  requiereCodigoPostal: boolean;
  ejemploDireccion: string | null;
  ejemploCiudad: string | null;
  ejemploEstado: string | null;
  ejemploCodigoPostal: string | null;
  patronCodigoPostal: string | null;
}

// Returns the user-facing international dialing prefix for a country.
// DO is stored as "1809" in the DB (to preserve existing phone numbers) but
// the country code is "+1" — 809/829/849 are area codes, not part of the prefix.
function getDisplayPrefix(pais: { codigo: string; prefijoCelular: string }): string {
  if (pais.codigo === "DO") return "+1";
  const p = pais.prefijoCelular.startsWith("+") ? pais.prefijoCelular : `+${pais.prefijoCelular}`;
  return p;
}

// Returns an example local number (without prefix) for a given country code.
function getPhoneExample(codigoPais: string): string {
  const examples: Record<string, string> = {
    DO: "8091234567", US: "2125551234", AR: "1151234567", MX: "5512345678",
    CO: "3001234567", VE: "4121234567", PE: "9991234567", CL: "912345678",
    EC: "991234567", BO: "71234567", PY: "981234567", UY: "91234567",
    GT: "51234567", SV: "71234567", HN: "91234567", NI: "81234567",
    CR: "81234567", PA: "61234567", ES: "612345678",
  };
  return examples[codigoPais] || "1234567890";
}

// Builds a WhatsApp placeholder string like "Ej: +18091234567" for the given country.
function whatsappPlaceholder(pais: { codigo: string; prefijoCelular: string } | undefined): string {
  if (!pais) return "Ej: +18091234567";
  const prefix = getDisplayPrefix(pais);
  return `Ej: ${prefix}${getPhoneExample(pais.codigo)}`;
}

type SectionType = "tipos-negocio" | "plantillas-menu" | "planes" | "negocios" | "jerga" | "system-prompt" | "datos-conocimiento" | "delivery-prompt" | "productos-restringidos" | "paises" | "zip-alert-template" | "integraciones";

const tiposNegocioLocal = [
  { value: "colmado", label: "Colmado" },
  { value: "colmadon", label: "Colmadón" },
  { value: "cafeteria", label: "Cafetería" },
  { value: "restaurant", label: "Restaurant" },
  { value: "fast_food", label: "Fast Food" },
  { value: "farmacia", label: "Farmacia" },
  { value: "pizzeria", label: "Pizzería" },
];

const getTipoLabel = (tipo: string) => {
  return tiposNegocioLocal.find(t => t.value === tipo)?.label || tipo;
};

export default function PlatformAdminPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [activeSection, setActiveSection] = useState<SectionType>("negocios");
  
  const [expandedNegocio, setExpandedNegocio] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  
  const [showCreateTipoDialog, setShowCreateTipoDialog] = useState(false);
  const [showEditTipoDialog, setShowEditTipoDialog] = useState(false);
  const [showDeleteTipoConfirm, setShowDeleteTipoConfirm] = useState<number | null>(null);
  
  const [showCreateJergaDialog, setShowCreateJergaDialog] = useState(false);
  const [showEditJergaDialog, setShowEditJergaDialog] = useState(false);
  const [showDeleteJergaConfirm, setShowDeleteJergaConfirm] = useState<number | null>(null);
  const [selectedTipoJerga, setSelectedTipoJerga] = useState<string | null>(null);
  const [selectedPaisJerga, setSelectedPaisJerga] = useState<number | null>(null);
  const [generatingJerga, setGeneratingJerga] = useState(false);
  
  const [selectedTipoConocimiento, setSelectedTipoConocimiento] = useState<string>("colmado");
  const [showUploadConocimiento, setShowUploadConocimiento] = useState(false);
  const [newConocimientoNombre, setNewConocimientoNombre] = useState("");
  const [newConocimientoContenido, setNewConocimientoContenido] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptDirty, setSystemPromptDirty] = useState(false);
  const [deliveryPrompt, setDeliveryPrompt] = useState("");
  const [deliveryPromptDirty, setDeliveryPromptDirty] = useState(false);
  const [zipAlertTemplate, setZipAlertTemplate] = useState({ name: "", language: "" });
  const [zipAlertTemplateDirty, setZipAlertTemplateDirty] = useState(false);
  
  const [showCreateRestringidoDialog, setShowCreateRestringidoDialog] = useState(false);
  const [showEditRestringidoDialog, setShowEditRestringidoDialog] = useState(false);
  const [showDeleteRestringidoConfirm, setShowDeleteRestringidoConfirm] = useState<number | null>(null);
  const [newRestringido, setNewRestringido] = useState({ palabraClave: "", categoria: "alcohol" });
  const [editRestringido, setEditRestringido] = useState<{ id: number; palabraClave: string; categoria: string; activo: boolean } | null>(null);

  const [showCreatePaisDialog, setShowCreatePaisDialog] = useState(false);
  const [showEditPaisDialog, setShowEditPaisDialog] = useState(false);
  const [showDeletePaisConfirm, setShowDeletePaisConfirm] = useState<number | null>(null);
  const [generatingPaisJerga, setGeneratingPaisJerga] = useState<number | null>(null);
  const [newPais, setNewPais] = useState({ codigo: "", nombre: "", bandera: "", prefijoCelular: "", moneda: "", simboloMoneda: "", zonaHoraria: "", activo: true, etiquetaEstado: "Provincia", etiquetaCodigoPostal: "", ejemploDireccion: "", ejemploCiudad: "", ejemploEstado: "", ejemploCodigoPostal: "", patronCodigoPostal: "", requiereCodigoPostal: false });
  const [editPais, setEditPais] = useState<Pais | null>(null);

  const [isEditPlanOpen, setIsEditPlanOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editPlanFormData, setEditPlanFormData] = useState<Partial<Plan>>({});
  const [editPlanCaracteristicasText, setEditPlanCaracteristicasText] = useState("");
  
  const [newJerga, setNewJerga] = useState({
    tipoNegocio: "colmado",
    jerga: "",
    productoIdentificado: "",
    precioSugerido: "",
    descripcion: "",
  });
  
  const [editJerga, setEditJerga] = useState<PlantillaJerga | null>(null);
  
  const [selectedNegocio, setSelectedNegocio] = useState<Negocio | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [evolutionApiUrl, setEvolutionApiUrl] = useState("");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [evolutionInstanceName, setEvolutionInstanceName] = useState("");
  
  const [newNegocio, setNewNegocio] = useState({
    nombre: "",
    whatsappNumero: "",
    direccion: "",
    ciudad: "",
    provincia: "",
    codigoPostal: "",
    tipoNegocio: "colmado",
    impuesto: "0",
    planId: 1,
    diaCorte: 28,
    diasGracia: 6,
    paisId: null as number | null,
  });
  
  const [editNegocio, setEditNegocio] = useState<{
    id: number;
    nombre: string;
    whatsappNumero: string;
    direccion: string;
    ciudad: string;
    provincia: string;
    tipoNegocio: string;
    impuesto: string;
    logo: string;
    planId: number;
    diaCorte: number;
    diasGracia: number;
    fechaVencimiento: string | null;
    estadoSuscripcion: string;
    paisId: number | null;
    codigoPostal: string | null;
  } | null>(null);
  
  const [newTipoNegocio, setNewTipoNegocio] = useState({
    slug: "",
    nombre: "",
    descripcion: "",
    icono: "",
    activo: true,
    orden: 0,
  });
  
  const [editTipoNegocio, setEditTipoNegocio] = useState<TipoNegocioCatalogo | null>(null);
  
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [createLogoPreview, setCreateLogoPreview] = useState<string | null>(null);
  
  const [newUser, setNewUser] = useState({ email: "", password: "", firstName: "", colmadoId: 0 });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserData, setEditUserData] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadLogo = async (colmadoId: number): Promise<string | null> => {
    if (!logoFile) return null;
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', await prepararLogo(logoFile));
      const res = await fetch(`/api/colmados/${colmadoId}/logo`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al subir logo');
      }
      const data = await res.json();
      return data.logo;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const saveWhatsAppConfig = useMutation({
    mutationFn: async ({ colmadoId, evolutionApiUrl, evolutionApiKey, evolutionInstanceName }: { colmadoId: number; evolutionApiUrl: string; evolutionApiKey: string; evolutionInstanceName: string }) => {
      const res = await fetch(`/api/colmados/${colmadoId}/evolution-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evolutionApiUrl, evolutionApiKey, evolutionInstanceName }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      setShowWhatsAppDialog(false);
      setSelectedNegocio(null);
      setEvolutionApiUrl("");
      setEvolutionApiKey("");
      setEvolutionInstanceName("");
      toast({ title: "Configuracion Evolution API guardada" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createNegocioMutation = useMutation({
    mutationFn: async (data: typeof newNegocio) => {
      const res = await fetch("/api/colmados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, estado: "activo" }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear negocio");
      }
      const newColmado = await res.json();
      if (createLogoFile && newColmado.id) {
        const formData = new FormData();
        formData.append('logo', await prepararLogo(createLogoFile));
        await fetch(`/api/colmados/${newColmado.id}/logo`, {
          method: 'POST',
          body: formData,
        });
      }
      return newColmado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
      setShowCreateDialog(false);
      setNewNegocio({ nombre: "", whatsappNumero: "", direccion: "", ciudad: "", provincia: "", codigoPostal: "", tipoNegocio: "colmado", impuesto: "0", planId: 1, diaCorte: 28, diasGracia: 6, paisId: null });
      setCreateLogoFile(null);
      setCreateLogoPreview(null);
      toast({ title: "Negocio creado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateNegocioMutation = useMutation({
    mutationFn: async (data: NonNullable<typeof editNegocio>) => {
      if (logoFile) {
        await uploadLogo(data.id);
      }
      const res = await fetch(`/api/colmados/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: data.nombre,
          whatsappNumero: data.whatsappNumero,
          direccion: data.direccion,
          ciudad: data.ciudad,
          provincia: data.provincia,
          tipoNegocio: data.tipoNegocio,
          impuesto: data.impuesto,
          planId: data.planId,
          diaCorte: data.diaCorte,
          diasGracia: data.diasGracia,
          fechaVencimiento: data.fechaVencimiento,
          estadoSuscripcion: data.estadoSuscripcion,
          paisId: data.paisId,
          codigoPostal: data.codigoPostal || null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      setShowEditDialog(false);
      setEditNegocio(null);
      setLogoFile(null);
      setLogoPreview(null);
      toast({ title: "Negocio actualizado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteNegocioMutation = useMutation({
    mutationFn: async (negocioId: number) => {
      const res = await fetch(`/api/colmados/${negocioId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al eliminar negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
      setShowDeleteConfirm(null);
      toast({ title: "Negocio eliminado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTecnologiasMutation = useMutation({
    mutationFn: async ({ negocioId, tecnologias }: { negocioId: number; tecnologias: TecnologiasHabilitadas }) => {
      const res = await fetch(`/api/admin/colmados/${negocioId}/tecnologias`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tecnologias),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar tecnologías");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      toast({ title: "Tecnologías actualizadas" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleEstadoMutation = useMutation({
    mutationFn: async ({ negocioId, estado }: { negocioId: number; estado: string }) => {
      const res = await fetch(`/api/colmados/${negocioId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al cambiar estado");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      toast({ title: "Estado del negocio actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; colmadoId: number }) => {
      const res = await fetch(`/api/colmados/${data.colmadoId}/owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password, firstName: data.firstName }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreateUserDialog(false);
      setNewUser({ email: "", password: "", firstName: "", colmadoId: 0 });
      toast({ title: "Usuario creado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { userId: string; email?: string; password?: string; firstName?: string; lastName?: string }) => {
      const res = await fetch(`/api/users/${data.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password, firstName: data.firstName, lastName: data.lastName }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowEditUserDialog(false);
      setEditingUser(null);
      setEditUserData({ email: "", password: "", firstName: "", lastName: "" });
      toast({ title: "Usuario actualizado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al eliminar usuario");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      setShowDeleteUserConfirm(null);
      toast({ title: "Usuario eliminado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createTipoNegocioMutation = useMutation({
    mutationFn: async (data: typeof newTipoNegocio) => {
      const res = await fetch("/api/admin/tipos-negocio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear tipo de negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-negocio-catalogo"] });
      setShowCreateTipoDialog(false);
      setNewTipoNegocio({ slug: "", nombre: "", descripcion: "", icono: "", activo: true, orden: 0 });
      toast({ title: "Tipo de negocio creado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTipoNegocioMutation = useMutation({
    mutationFn: async (data: TipoNegocioCatalogo) => {
      const res = await fetch(`/api/admin/tipos-negocio/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: data.slug,
          nombre: data.nombre,
          descripcion: data.descripcion,
          icono: data.icono,
          activo: data.activo,
          orden: data.orden,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar tipo de negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-negocio-catalogo"] });
      setShowEditTipoDialog(false);
      setEditTipoNegocio(null);
      toast({ title: "Tipo de negocio actualizado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTipoNegocioMutation = useMutation({
    mutationFn: async (tipoId: number) => {
      const res = await fetch(`/api/admin/tipos-negocio/${tipoId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al eliminar tipo de negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-negocio-catalogo"] });
      setShowDeleteTipoConfirm(null);
      toast({ title: "Tipo de negocio eliminado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
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

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Error al cargar estadísticas");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: negocios, isLoading: negociosLoading } = useQuery<Negocio[]>({
    queryKey: ["admin-colmados"],
    queryFn: async () => {
      const res = await fetch("/api/admin/colmados");
      if (!res.ok) throw new Error("Error al cargar negocios");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Error al cargar usuarios");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: planes } = useQuery<Plan[]>({
    queryKey: ["planes"],
    queryFn: async () => {
      const res = await fetch("/api/planes");
      if (!res.ok) throw new Error("Error al cargar planes");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: tiposNegocioCatalogo, isLoading: tiposLoading } = useQuery<TipoNegocioCatalogo[]>({
    queryKey: ["tipos-negocio-catalogo"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tipos-negocio");
      if (!res.ok) throw new Error("Error al cargar tipos de negocio");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: todasPlantillas, isLoading: plantillasLoading } = useQuery<MenuPlantilla[]>({
    queryKey: ["todas-plantillas"],
    queryFn: async () => {
      const res = await fetch("/api/plantillas-menu");
      if (!res.ok) throw new Error("Error al cargar plantillas");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: plantillasJerga, isLoading: jergaLoading } = useQuery<PlantillaJerga[]>({
    queryKey: ["plantillas-jerga"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plantillas-jerga");
      if (!res.ok) throw new Error("Error al cargar plantillas de jerga");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: conocimientoArchivos, isLoading: conocimientoLoading } = useQuery<ConocimientoArchivo[]>({
    queryKey: ["conocimiento", selectedTipoConocimiento],
    queryFn: async () => {
      const res = await fetch(`/api/admin/conocimiento/${selectedTipoConocimiento}`);
      if (!res.ok) throw new Error("Error al cargar archivos de conocimiento");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: metaPolicies } = useQuery<{ content: string }>({
    queryKey: ["meta-policies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/meta-policies");
      if (!res.ok) throw new Error("Error al cargar políticas de Meta");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: systemPromptData } = useQuery<{ prompt: string }>({
    queryKey: ["system-prompt"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-prompt");
      if (!res.ok) throw new Error("Error al cargar system prompt");
      const data = await res.json();
      setSystemPrompt(data.prompt || "");
      return data;
    },
    enabled: roleData?.role === "platform_admin",
  });

  const { data: zipAlertTemplateData } = useQuery<{ name: string; language: string }>({
    queryKey: ["zip-alert-template"],
    queryFn: async () => {
      const res = await fetch("/api/admin/zip-alert-template");
      if (!res.ok) throw new Error("Error al cargar plantilla de alerta ZIP");
      const data = await res.json();
      setZipAlertTemplate({ name: data.name || "", language: data.language || "" });
      return data;
    },
    enabled: roleData?.role === "platform_admin",
  });

  const saveZipAlertTemplateMutation = useMutation({
    mutationFn: async (template: typeof zipAlertTemplate) => {
      const res = await fetch("/api/admin/zip-alert-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar plantilla de alerta ZIP");
      return data;
    },
    onSuccess: (data) => {
      setZipAlertTemplate({ name: data.name, language: data.language });
      setZipAlertTemplateDirty(false);
      queryClient.invalidateQueries({ queryKey: ["zip-alert-template"] });
      toast({ title: "Plantilla de alerta ZIP guardada" });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const createConocimientoMutation = useMutation({
    mutationFn: async (data: { tipoNegocio: string; nombre: string; contenido: string }) => {
      const res = await fetch("/api/admin/conocimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear archivo de conocimiento");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conocimiento"] });
      setShowUploadConocimiento(false);
      setNewConocimientoNombre("");
      setNewConocimientoContenido("");
      toast({ title: "Archivo de conocimiento creado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteConocimientoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/conocimiento/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar archivo");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conocimiento"] });
      toast({ title: "Archivo eliminado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveSystemPromptMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch("/api/admin/system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Error al guardar system prompt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-prompt"] });
      setSystemPromptDirty(false);
      toast({ title: "System prompt guardado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: deliveryPromptData } = useQuery<{ prompt: string }>({
    queryKey: ["delivery-prompt"],
    queryFn: async () => {
      const res = await fetch("/api/admin/delivery-prompt");
      if (!res.ok) throw new Error("Error al cargar delivery prompt");
      const data = await res.json();
      setDeliveryPrompt(data.prompt || "");
      return data;
    },
    enabled: roleData?.role === "platform_admin",
  });

  const saveDeliveryPromptMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch("/api/admin/delivery-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error("Error al guardar delivery prompt");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-prompt"] });
      setDeliveryPromptDirty(false);
      toast({ title: "Prompt de delivery guardado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: productosRestringidos = [], isLoading: isLoadingRestringidos } = useQuery<Array<{ id: number; palabraClave: string; categoria: string; activo: boolean; fechaCreacion: string }>>({
    queryKey: ["productos-restringidos"],
    queryFn: async () => {
      const res = await fetch("/api/admin/productos-restringidos");
      if (!res.ok) throw new Error("Error al cargar productos restringidos");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const createRestringidoMutation = useMutation({
    mutationFn: async (data: { palabraClave: string; categoria: string }) => {
      const res = await fetch("/api/admin/productos-restringidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear producto restringido");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos-restringidos"] });
      setShowCreateRestringidoDialog(false);
      setNewRestringido({ palabraClave: "", categoria: "alcohol" });
      toast({ title: "Producto restringido agregado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateRestringidoMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; palabraClave?: string; categoria?: string; activo?: boolean }) => {
      const res = await fetch(`/api/admin/productos-restringidos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al actualizar producto restringido");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos-restringidos"] });
      setShowEditRestringidoDialog(false);
      setEditRestringido(null);
      toast({ title: "Producto restringido actualizado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteRestringidoMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/productos-restringidos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar producto restringido");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos-restringidos"] });
      setShowDeleteRestringidoConfirm(null);
      toast({ title: "Producto restringido eliminado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: paises = [], isLoading: isLoadingPaises } = useQuery<Pais[]>({
    queryKey: ["admin-paises"],
    queryFn: async () => {
      const res = await fetch("/api/admin/paises");
      if (!res.ok) throw new Error("Error al cargar países");
      return res.json();
    },
    enabled: roleData?.role === "platform_admin",
  });

  const createPaisMutation = useMutation({
    mutationFn: async (data: typeof newPais) => {
      const res = await fetch("/api/admin/paises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, bandera: data.bandera || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear país");
      }
      return res.json();
    },
    onSuccess: (createdPais: Pais) => {
      queryClient.invalidateQueries({ queryKey: ["admin-paises"] });
      setShowCreatePaisDialog(false);
       setNewPais({ codigo: "", nombre: "", bandera: "", prefijoCelular: "", moneda: "", simboloMoneda: "", zonaHoraria: "", activo: true, etiquetaEstado: "Provincia", etiquetaCodigoPostal: "", ejemploDireccion: "", ejemploCiudad: "", ejemploEstado: "", ejemploCodigoPostal: "", patronCodigoPostal: "", requiereCodigoPostal: false });
      toast({ title: "País creado", description: "Generando jerga local con IA..." });
      generarJergaPais(createdPais.id);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePaisMutation = useMutation({
    mutationFn: async (data: Pais) => {
      const res = await fetch(`/api/admin/paises/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: data.codigo, nombre: data.nombre, bandera: data.bandera,
          prefijoCelular: data.prefijoCelular, moneda: data.moneda,
          simboloMoneda: data.simboloMoneda, zonaHoraria: data.zonaHoraria, activo: data.activo,
          etiquetaEstado: data.etiquetaEstado || null,
          etiquetaCodigoPostal: data.etiquetaCodigoPostal || null,
          requiereCodigoPostal: data.requiereCodigoPostal ?? false,
          ejemploDireccion: data.ejemploDireccion || null,
          ejemploCiudad: data.ejemploCiudad || null,
          ejemploEstado: data.ejemploEstado || null,
          ejemploCodigoPostal: data.ejemploCodigoPostal || null,
           patronCodigoPostal: data.patronCodigoPostal || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar país");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-paises"] });
      setShowEditPaisDialog(false);
      setEditPais(null);
      toast({ title: "País actualizado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePaisMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/paises/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar país");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-paises"] });
      setShowDeletePaisConfirm(null);
      toast({ title: "País eliminado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/planes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar plan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planes"] });
      toast({ title: "Plan eliminado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Plan> }) => {
      const res = await fetch(`/api/planes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al actualizar plan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planes"] });
      setIsEditPlanOpen(false);
      setEditingPlan(null);
      toast({ title: "Plan actualizado exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setEditPlanFormData({ ...plan });
    setEditPlanCaracteristicasText((plan.caracteristicas as string[] || []).join("\n"));
    setIsEditPlanOpen(true);
  };

  const handleUpdatePlan = () => {
    if (!editingPlan) return;
    const caracteristicas = editPlanCaracteristicasText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    updatePlanMutation.mutate({
      id: editingPlan.id,
      data: {
        nombre: editPlanFormData.nombre,
        slug: editPlanFormData.slug,
        precioMensual: editPlanFormData.precioMensual,
        duracionDias: editPlanFormData.duracionDias,
        descripcionCorta: editPlanFormData.descripcionCorta,
        limiteDeliveries: editPlanFormData.limiteDeliveries,
        limitePedidosDiarios: editPlanFormData.limitePedidosDiarios,
        soportePrioritario: editPlanFormData.soportePrioritario,
        activo: editPlanFormData.activo,
        esTrial: editPlanFormData.esTrial,
        orden: editPlanFormData.orden,
        caracteristicas,
      },
    });
  };

  const generarJergaPais = async (paisId: number) => {
    setGeneratingPaisJerga(paisId);
    try {
      const res = await fetch(`/api/admin/paises/${paisId}/generar-jerga`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al generar jerga");
      }
      const result = await res.json();
      toast({ title: "Jerga generada", description: `Se generaron ${result.generadas} entradas de jerga para este país` });
      queryClient.invalidateQueries({ queryKey: ["plantillas-jerga"] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingPaisJerga(null);
    }
  };

  const createJergaMutation = useMutation({
    mutationFn: async (data: typeof newJerga) => {
      const res = await fetch("/api/admin/plantillas-jerga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          precioSugerido: data.precioSugerido || null,
          descripcion: data.descripcion || null,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear jerga");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plantillas-jerga"] });
      setShowCreateJergaDialog(false);
      setNewJerga({ tipoNegocio: "colmado", jerga: "", productoIdentificado: "", precioSugerido: "", descripcion: "" });
      toast({ title: "Plantilla de jerga creada exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateJergaMutation = useMutation({
    mutationFn: async (data: PlantillaJerga) => {
      const res = await fetch(`/api/admin/plantillas-jerga/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoNegocio: data.tipoNegocio,
          jerga: data.jerga,
          productoIdentificado: data.productoIdentificado,
          precioSugerido: data.precioSugerido,
          descripcion: data.descripcion,
          activo: data.activo,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar jerga");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plantillas-jerga"] });
      setShowEditJergaDialog(false);
      setEditJerga(null);
      toast({ title: "Plantilla de jerga actualizada exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteJergaMutation = useMutation({
    mutationFn: async (jergaId: number) => {
      const res = await fetch(`/api/admin/plantillas-jerga/${jergaId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al eliminar jerga");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plantillas-jerga"] });
      setShowDeleteJergaConfirm(null);
      toast({ title: "Plantilla de jerga eliminada exitosamente" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const generarJergaConIA = async (tipoNegocio: string) => {
    setGeneratingJerga(true);
    try {
      const res = await fetch("/api/admin/jerga/generar-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoNegocio }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al generar jerga con IA");
      }
      toast({
        title: "Jerga generada",
        description: `Se crearon plantillas de jerga para ${getTipoLabel(tipoNegocio)}`,
      });
      queryClient.invalidateQueries({ queryKey: ["plantillas-jerga"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingJerga(false);
    }
  };

  const getJergaForTipo = (tipoSlug: string) => {
    return (plantillasJerga || []).filter(j => {
      if (j.tipoNegocio !== tipoSlug) return false;
      if (selectedPaisJerga === null) return true;
      return j.paisId === selectedPaisJerga || j.paisId === null;
    });
  };

  const tipoTieneJerga = (tipoSlug: string) => {
    return getJergaForTipo(tipoSlug).length > 0;
  };

  const [selectedTipoPlantilla, setSelectedTipoPlantilla] = useState<string | null>(null);
  const [generatingPlantilla, setGeneratingPlantilla] = useState(false);

  const getPlantillasForTipo = (tipoSlug: string) => {
    return todasPlantillas?.filter(p => p.tipoNegocio === tipoSlug) || [];
  };

  const tipoTienePlantilla = (tipoSlug: string) => {
    return getPlantillasForTipo(tipoSlug).length > 0;
  };

  const generarPlantillaConIA = async (tipoNegocio: TipoNegocioCatalogo) => {
    setGeneratingPlantilla(true);
    try {
      const res = await fetch("/api/admin/plantillas/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoNegocio: tipoNegocio.slug,
          nombreTipo: tipoNegocio.nombre,
          descripcion: tipoNegocio.descripcion,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al generar plantilla");
      }
      toast({
        title: "Plantilla generada",
        description: `Se crearon productos sugeridos para ${tipoNegocio.nombre}`,
      });
      queryClient.invalidateQueries({ queryKey: ["todas-plantillas"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingPlantilla(false);
    }
  };

  const handleCreateLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCreateLogoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCreateLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const openEditDialog = (negocio: Negocio) => {
    setEditNegocio({
      id: negocio.id,
      nombre: negocio.nombre,
      whatsappNumero: negocio.whatsappNumero,
      direccion: negocio.direccion,
      ciudad: negocio.ciudad || "",
      provincia: negocio.provincia || "",
      tipoNegocio: negocio.tipoNegocio || "colmado",
      impuesto: negocio.impuesto || "0",
      logo: negocio.logo || "",
      planId: negocio.planId || 1,
      diaCorte: negocio.diaCorte || 28,
      diasGracia: negocio.diasGracia || 6,
      fechaVencimiento: negocio.fechaVencimiento ? new Date(negocio.fechaVencimiento).toISOString().split('T')[0] : null,
      estadoSuscripcion: negocio.estadoSuscripcion || "activa",
      paisId: negocio.paisId ?? null,
      codigoPostal: negocio.codigoPostal ?? null,
    });
    setShowEditDialog(true);
  };

  const openWhatsAppDialog = (negocio: Negocio) => {
    setSelectedNegocio(negocio);
    setEvolutionApiUrl(negocio.evolutionApiUrl || "");
    setEvolutionApiKey(negocio.evolutionApiKey || "");
    setEvolutionInstanceName(negocio.evolutionInstanceName || "");
    setShowWhatsAppDialog(true);
  };

  const openCreateUserDialog = (negocio: Negocio) => {
    setNewUser({ email: "", password: "", firstName: "", colmadoId: negocio.id });
    setShowCreateUserDialog(true);
  };

  const openEditUserDialog = (user: User) => {
    setEditingUser(user);
    setEditUserData({
      email: user.email || "",
      password: "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
    });
    setShowEditUserDialog(true);
  };

  const openEditTipoDialog = (tipo: TipoNegocioCatalogo) => {
    setEditTipoNegocio(tipo);
    setShowEditTipoDialog(true);
  };

  const getNegocioUsers = (negocioId: number) => {
    return users?.filter(u => u.colmadoId === negocioId) || [];
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/login");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (roleData?.role !== "platform_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <p className="text-red-600 font-medium">Acceso denegado</p>
          <p className="text-gray-500 text-sm mt-2">Solo administradores de plataforma</p>
          <Button onClick={() => navigate("/admin")} className="mt-4" variant="outline">
            Volver
          </Button>
        </div>
      </div>
    );
  }

  const isLoading = statsLoading || negociosLoading || usersLoading;

  const renderTiposNegocioSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Tipos de Negocio</h2>
          <p className="text-sm text-slate-500">Gestiona los tipos de negocio disponibles en la plataforma</p>
        </div>
        <Button 
          onClick={() => setShowCreateTipoDialog(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="button-add-tipo-negocio"
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Tipo
        </Button>
      </div>

      {tiposLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiposNegocioCatalogo?.map((tipo) => (
            <Card key={tipo.id} className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow" data-testid={`card-tipo-negocio-${tipo.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {tipo.icono ? (
                      <span className="text-2xl">{tipo.icono}</span>
                    ) : (
                      <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                        <Tag className="w-5 h-5 text-emerald-600" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-slate-800">{tipo.nombre}</h3>
                      <p className="text-xs text-slate-400">slug: {tipo.slug}</p>
                    </div>
                  </div>
                  <Badge variant={tipo.activo ? "default" : "secondary"} className={tipo.activo ? "bg-emerald-100 text-emerald-700" : ""}>
                    {tipo.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                
                {tipo.descripcion && (
                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">{tipo.descripcion}</p>
                )}
                
                <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
                  <span>Orden: {tipo.orden}</span>
                  <span>Creado: {new Date(tipo.fechaCreacion).toLocaleDateString()}</span>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditTipoDialog(tipo)}
                    className="flex-1"
                    data-testid={`button-edit-tipo-${tipo.id}`}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteTipoConfirm(tipo.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid={`button-delete-tipo-${tipo.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {(!tiposNegocioCatalogo || tiposNegocioCatalogo.length === 0) && (
            <div className="col-span-full text-center py-12 text-slate-500">
              <Tag className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p>No hay tipos de negocio registrados</p>
              <Button 
                onClick={() => setShowCreateTipoDialog(true)}
                variant="outline"
                className="mt-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar el primer tipo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderPlanesSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Planes de Suscripción</h2>
          <p className="text-sm text-slate-500">Administra los planes disponibles en la plataforma</p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/admin/planes")}
          className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
          data-testid="button-manage-plans-detail"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Plan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {planes?.map((plan) => (
          <Card key={plan.id} className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow" data-testid={`card-plan-${plan.id}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-slate-800">{plan.nombre}</h3>
                  <p className="text-xs text-slate-400">slug: {plan.slug}</p>
                </div>
                <Badge variant={plan.activo ? "default" : "secondary"} className={plan.esTrial ? "bg-blue-100 text-blue-700" : plan.activo ? "bg-emerald-100 text-emerald-700" : ""}>
                  {plan.esTrial ? "Trial" : plan.activo ? "Activo" : "Inactivo"}
                </Badge>
              </div>

              <div className="text-2xl font-bold text-emerald-600 mb-2">
                {parseFloat(plan.precioMensual) === 0 ? "Gratis" : `RD$${parseFloat(plan.precioMensual).toLocaleString()}`}
                {parseFloat(plan.precioMensual) > 0 && <span className="text-sm font-normal text-slate-500">/mes</span>}
              </div>

              {plan.descripcionCorta && (
                <p className="text-sm text-slate-600 mb-4">{plan.descripcionCorta}</p>
              )}

              <div className="space-y-2 text-sm text-slate-600 mb-4">
                <div className="flex justify-between">
                  <span>Duración:</span>
                  <span className="font-medium">{plan.duracionDias} días</span>
                </div>
                <div className="flex justify-between">
                  <span>Deliveries:</span>
                  <span className="font-medium">{plan.limiteDeliveries === null ? "Ilimitado" : plan.limiteDeliveries}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pedidos/día:</span>
                  <span className="font-medium">{plan.limitePedidosDiarios === null ? "Ilimitados" : plan.limitePedidosDiarios}</span>
                </div>
                <div className="flex justify-between">
                  <span>Soporte prioritario:</span>
                  <Badge variant="outline" className={plan.soportePrioritario ? "text-emerald-600" : "text-slate-400"}>
                    {plan.soportePrioritario ? "Sí" : "No"}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEditPlan(plan)}
                  data-testid={`button-edit-plan-${plan.id}`}
                >
                  <Edit className="w-3.5 h-3.5 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    if (confirm(`¿Eliminar el plan "${plan.nombre}"? Esta acción no se puede deshacer.`)) {
                      deletePlanMutation.mutate(plan.id);
                    }
                  }}
                  disabled={deletePlanMutation.isPending}
                  data-testid={`button-delete-plan-${plan.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {(!planes || planes.length === 0) && (
          <div className="col-span-full text-center py-12 text-slate-500">
            <Crown className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>No hay planes registrados</p>
          </div>
        )}
      </div>

      <Dialog open={isEditPlanOpen} onOpenChange={setIsEditPlanOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Plan: {editingPlan?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={editPlanFormData.nombre || ""}
                  onChange={(e) => setEditPlanFormData((f) => ({ ...f, nombre: e.target.value }))}
                  data-testid="input-edit-plan-nombre"
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (URL)</Label>
                <Input
                  value={editPlanFormData.slug || ""}
                  onChange={(e) => setEditPlanFormData((f) => ({ ...f, slug: e.target.value }))}
                  data-testid="input-edit-plan-slug"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio Mensual (RD$)</Label>
                <Input
                  type="number"
                  value={editPlanFormData.precioMensual || "0"}
                  onChange={(e) => setEditPlanFormData((f) => ({ ...f, precioMensual: e.target.value }))}
                  data-testid="input-edit-plan-precio"
                />
              </div>
              <div className="space-y-2">
                <Label>Duración (días)</Label>
                <Input
                  type="number"
                  value={editPlanFormData.duracionDias || 30}
                  onChange={(e) => setEditPlanFormData((f) => ({ ...f, duracionDias: parseInt(e.target.value) || 30 }))}
                  data-testid="input-edit-plan-duracion"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción Corta</Label>
              <Input
                value={editPlanFormData.descripcionCorta || ""}
                onChange={(e) => setEditPlanFormData((f) => ({ ...f, descripcionCorta: e.target.value }))}
                data-testid="input-edit-plan-descripcion"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Límite Deliveries (vacío = ilimitado)</Label>
                <Input
                  type="number"
                  value={editPlanFormData.limiteDeliveries ?? ""}
                  onChange={(e) => setEditPlanFormData((f) => ({ ...f, limiteDeliveries: e.target.value ? parseInt(e.target.value) : null }))}
                  placeholder="Ilimitado"
                  data-testid="input-edit-plan-deliveries"
                />
              </div>
              <div className="space-y-2">
                <Label>Límite Pedidos/Día (vacío = ilimitado)</Label>
                <Input
                  type="number"
                  value={editPlanFormData.limitePedidosDiarios ?? ""}
                  onChange={(e) => setEditPlanFormData((f) => ({ ...f, limitePedidosDiarios: e.target.value ? parseInt(e.target.value) : null }))}
                  placeholder="Ilimitado"
                  data-testid="input-edit-plan-pedidos"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Características (una por línea)</Label>
              <Textarea
                value={editPlanCaracteristicasText}
                onChange={(e) => setEditPlanCaracteristicasText(e.target.value)}
                rows={5}
                data-testid="textarea-edit-plan-caracteristicas"
              />
            </div>
            <div className="space-y-2">
              <Label>Orden de visualización</Label>
              <Input
                type="number"
                value={editPlanFormData.orden ?? 0}
                onChange={(e) => setEditPlanFormData((f) => ({ ...f, orden: parseInt(e.target.value) || 0 }))}
                data-testid="input-edit-plan-orden"
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editPlanFormData.esTrial || false}
                  onCheckedChange={(checked) => setEditPlanFormData((f) => ({ ...f, esTrial: checked }))}
                  data-testid="switch-edit-plan-trial"
                />
                <Label>Es Trial</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editPlanFormData.soportePrioritario || false}
                  onCheckedChange={(checked) => setEditPlanFormData((f) => ({ ...f, soportePrioritario: checked }))}
                  data-testid="switch-edit-plan-soporte"
                />
                <Label>Soporte Prioritario</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editPlanFormData.activo !== false}
                  onCheckedChange={(checked) => setEditPlanFormData((f) => ({ ...f, activo: checked }))}
                  data-testid="switch-edit-plan-activo"
                />
                <Label>Activo</Label>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleUpdatePlan}
              disabled={updatePlanMutation.isPending || !editPlanFormData.nombre || !editPlanFormData.slug}
              data-testid="button-submit-edit-plan"
            >
              {updatePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderNegociosSection = () => (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow" data-testid="card-total-negocios">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Negocios</p>
                <p className="text-3xl font-bold text-slate-800">{stats?.totalColmados || 0}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl">
                <Store className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow" data-testid="card-total-deliveries">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Deliveries</p>
                <p className="text-3xl font-bold text-slate-800">{stats?.totalDeliveries || 0}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow" data-testid="card-total-pedidos">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Pedidos</p>
                <p className="text-3xl font-bold text-slate-800">{stats?.totalPedidos || 0}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-xl">
                <Package className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow" data-testid="card-total-ventas">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Ventas</p>
                <p className="text-2xl md:text-3xl font-bold text-slate-800">
                  RD${parseFloat(stats?.totalVentas || "0").toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-0 shadow-sm" data-testid="card-negocios-list">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between border-b bg-slate-50/50 gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" />
              Negocios Registrados
            </CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              {negocios?.length || 0} negocios en la plataforma
            </p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-add-negocio"
          >
            <Plus className="w-4 h-4 mr-2" />
            Agregar Negocio
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {negocios?.map((negocio) => {
              const negocioUsers = getNegocioUsers(negocio.id);
              const isExpanded = expandedNegocio === negocio.id;
              const plan = planes?.find(p => p.id === negocio.planId);
              return (
                <Collapsible
                  key={negocio.id}
                  open={isExpanded}
                  onOpenChange={() => setExpandedNegocio(isExpanded ? null : negocio.id)}
                >
                  <CollapsibleTrigger className="w-full p-4 hover:bg-slate-50 transition-colors" data-testid={`trigger-negocio-${negocio.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                        {negocio.logo ? (
                          <img 
                            src={negocio.logo} 
                            alt={negocio.nombre} 
                            className="w-12 h-12 object-contain rounded-lg bg-white border"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <Store className="w-6 h-6 text-emerald-600" />
                          </div>
                        )}
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-800">{negocio.nombre}</h3>
                            <Badge variant="outline" className="text-xs">
                              {getTipoLabel(negocio.tipoNegocio)}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Phone className="w-3 h-3" />
                            {negocio.whatsappNumero}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          className={
                            negocio.estadoSuscripcion === "activa" 
                              ? "bg-emerald-100 text-emerald-700" 
                              : negocio.estadoSuscripcion === "en_gracia"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }
                        >
                          {negocio.estadoSuscripcion === "activa" ? "Activo" : negocio.estadoSuscripcion === "en_gracia" ? "En Gracia" : "Suspendido"}
                        </Badge>
                        {plan && (
                          <Badge variant="outline" className="hidden sm:flex">
                            <Crown className="w-3 h-3 mr-1" />
                            {plan.nombre}
                          </Badge>
                        )}
                        {negocio.evolutionInstanceName && (
                          <Badge variant="outline" className="bg-green-50 text-green-600 hidden sm:flex">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Evolution
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 bg-slate-50/50 border-t">
                      <div className="grid md:grid-cols-2 gap-4 pt-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            <span>{negocio.direccion}</span>
                          </div>
                          {negocio.ciudad && (
                            <div className="text-sm text-slate-500 ml-6">
                              {(() => {
                                const sp = (paises || []).find((p) => p.id === negocio.paisId);
                                if (sp?.requiereCodigoPostal) {
                                  return [negocio.ciudad, negocio.provincia, (negocio as any).codigoPostal].filter(Boolean).join(", ");
                                }
                                return [negocio.ciudad, negocio.provincia].filter(Boolean).join(", ");
                              })()}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Percent className="w-4 h-4 text-slate-400" />
                            <span>Impuesto: {negocio.impuesto || "0"}%</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-2">
                            Día de corte: {negocio.diaCorte} | Días de gracia: {negocio.diasGracia}
                          </div>
                          {negocio.fechaVencimiento && (
                            <div className="text-xs text-slate-400">
                              Vencimiento: {new Date(negocio.fechaVencimiento).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-700">Usuarios asignados:</p>
                          {negocioUsers.length > 0 ? (
                            <div className="space-y-1">
                              {negocioUsers.map(u => (
                                <div key={u.id} className="flex items-center justify-between bg-white p-2 rounded-lg border text-sm">
                                  <div>
                                    <span className="font-medium">{u.firstName || u.email}</span>
                                    <span className="text-slate-400 ml-2">({u.role})</span>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditUserDialog(u)}
                                      data-testid={`button-edit-user-${u.id}`}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setShowDeleteUserConfirm(u.id)}
                                      className="text-red-500 hover:text-red-600"
                                      data-testid={`button-delete-user-${u.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-400">Sin usuarios asignados</p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCreateUserDialog(negocio)}
                            className="w-full mt-2"
                            data-testid={`button-add-user-${negocio.id}`}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Agregar Usuario
                          </Button>
                        </div>
                      </div>
                      {/* Tecnologías habilitadas */}
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1">
                          <Settings className="w-4 h-4 text-slate-400" />
                          Tecnologías habilitadas
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { key: "api_evo" as const, label: "API Evo", desc: "WhatsApp vía Evolution API", color: "text-green-700" },
                            { key: "meta" as const, label: "Meta", desc: "WhatsApp vía Meta Cloud API", color: "text-blue-700" },
                            { key: "link_pedido" as const, label: "Link Pedido", desc: "Página pública de pedidos", color: "text-purple-700" },
                          ].map(({ key, label, desc, color }) => {
                            const techs = negocio.tecnologiasHabilitadas || {};
                            // Respect the stored value — only true when explicitly set to true.
                            // New colmados start with {} (all false) per design.
                            const enabled = techs[key] === true;
                            return (
                              <div key={key} className="flex items-center justify-between bg-white rounded-lg border px-3 py-2">
                                <div>
                                  <p className={`text-sm font-medium ${color}`}>{label}</p>
                                  <p className="text-xs text-slate-400">{desc}</p>
                                </div>
                                <Switch
                                  checked={!!enabled}
                                  onCheckedChange={(checked) =>
                                    updateTecnologiasMutation.mutate({
                                      negocioId: negocio.id,
                                      tecnologias: { [key]: checked },
                                    })
                                  }
                                  disabled={updateTecnologiasMutation.isPending}
                                  data-testid={`switch-tech-${key}-${negocio.id}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(negocio)}
                          data-testid={`button-edit-negocio-${negocio.id}`}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openWhatsAppDialog(negocio)}
                          className="text-green-600"
                          data-testid={`button-whatsapp-${negocio.id}`}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Config WA
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleEstadoMutation.mutate({ 
                            negocioId: negocio.id, 
                            estado: negocio.estado === "inactivo" ? "activo" : "inactivo" 
                          })}
                          className={negocio.estado === "inactivo" 
                            ? "text-green-600 hover:text-green-700 hover:bg-green-50" 
                            : "text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"}
                          disabled={toggleEstadoMutation.isPending}
                          data-testid={`button-toggle-estado-${negocio.id}`}
                        >
                          {negocio.estado === "inactivo" ? (
                            <>
                              <Play className="w-4 h-4 mr-1" />
                              Activar
                            </>
                          ) : (
                            <>
                              <Ban className="w-4 h-4 mr-1" />
                              Inactivar
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(negocio.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          data-testid={`button-delete-negocio-${negocio.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
            {(!negocios || negocios.length === 0) && (
              <div className="p-8 text-center text-slate-500">
                <Store className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>No hay negocios registrados</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-0 shadow-sm mt-6" data-testid="card-promo-videos">
        <CardHeader className="border-b bg-slate-50/50">
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-emerald-600" />
            Videos Promocionales
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">Demo Flujo Completo</h3>
              <video 
                src={promoVideo1} 
                controls 
                className="w-full rounded-lg shadow-sm"
                poster=""
              />
              <a 
                href={promoVideo1} 
                download="delywa-demo-flujo.mp4"
                className="inline-flex items-center gap-2 mt-2 text-emerald-600 hover:text-emerald-700 text-sm"
              >
                <Download className="w-4 h-4" />
                Descargar
              </a>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-2">Logo con Slogan</h3>
              <video 
                src={promoVideo2} 
                controls 
                className="w-full rounded-lg shadow-sm"
              />
              <a 
                href={promoVideo2} 
                download="delywa-logo-slogan.mp4"
                className="inline-flex items-center gap-2 mt-2 text-emerald-600 hover:text-emerald-700 text-sm"
              >
                <Download className="w-4 h-4" />
                Descargar
              </a>
            </div>
          </div>
          
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-slate-700 mb-4">Set Completo para Promoción (24s total)</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-2">Parte 1: Cliente ordena (8s)</p>
                <video 
                  src={promoVideoFull1} 
                  controls 
                  className="w-full rounded-lg shadow-sm mb-2"
                />
                <a 
                  href={promoVideoFull1} 
                  download="delywa-parte1-ordena.mp4"
                  className="inline-flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </a>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-2">Parte 2: Dueño confirma (8s)</p>
                <video 
                  src={promoVideoFull2} 
                  controls 
                  className="w-full rounded-lg shadow-sm mb-2"
                />
                <a 
                  href={promoVideoFull2} 
                  download="delywa-parte2-confirma.mp4"
                  className="inline-flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </a>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-2">Parte 3: Entrega + Logo (8s)</p>
                <video 
                  src={promoVideoFull3} 
                  controls 
                  className="w-full rounded-lg shadow-sm mb-2"
                />
                <a 
                  href={promoVideoFull3} 
                  download="delywa-parte3-entrega.mp4"
                  className="inline-flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );

  const renderPlantillasMenuSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Plantillas de Menú</h2>
          <p className="text-sm text-slate-500">Gestiona las plantillas de productos sugeridos para cada tipo de negocio</p>
        </div>
      </div>

      {plantillasLoading || tiposLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Tipos de Negocio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tiposNegocioCatalogo?.filter(t => t.activo).map((tipo) => {
                  const tienePlantilla = tipoTienePlantilla(tipo.slug);
                  const isSelected = selectedTipoPlantilla === tipo.slug;
                  return (
                    <button
                      key={tipo.id}
                      onClick={() => setSelectedTipoPlantilla(tipo.slug)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                        isSelected
                          ? "bg-emerald-50 border-emerald-300"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                      data-testid={`btn-tipo-plantilla-${tipo.slug}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-emerald-100" : "bg-slate-100"}`}>
                          <Tag className={`w-4 h-4 ${isSelected ? "text-emerald-600" : "text-slate-500"}`} />
                        </div>
                        <span className={`font-medium ${isSelected ? "text-emerald-700" : "text-slate-700"}`}>
                          {tipo.nombre}
                        </span>
                      </div>
                      {tienePlantilla ? (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <Check className="w-3 h-3 mr-1" />
                          Tiene
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-slate-500">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Sin plantilla
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {selectedTipoPlantilla ? (
              <Card className="bg-white border-0 shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Plantilla: {tiposNegocioCatalogo?.find(t => t.slug === selectedTipoPlantilla)?.nombre}
                    </CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      {tipoTienePlantilla(selectedTipoPlantilla)
                        ? `${getPlantillasForTipo(selectedTipoPlantilla).length} categorías con productos`
                        : "Este tipo no tiene plantilla definida"}
                    </p>
                  </div>
                  {!tipoTienePlantilla(selectedTipoPlantilla) && (
                    <Button
                      onClick={() => {
                        const tipo = tiposNegocioCatalogo?.find(t => t.slug === selectedTipoPlantilla);
                        if (tipo) generarPlantillaConIA(tipo);
                      }}
                      disabled={generatingPlantilla}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      data-testid="btn-generar-plantilla-ia"
                    >
                      {generatingPlantilla ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Generar con IA
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {tipoTienePlantilla(selectedTipoPlantilla) ? (
                    <div className="space-y-4">
                      {getPlantillasForTipo(selectedTipoPlantilla).map((plantilla) => (
                        <div key={plantilla.id} className="border rounded-lg p-4">
                          <h4 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-emerald-600" />
                            {plantilla.categoria}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {plantilla.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-2 bg-slate-50 rounded-md"
                              >
                                <span className="text-sm text-slate-700">{item.nombre}</span>
                                {item.precioSugerido && (
                                  <span className="text-sm font-medium text-emerald-600">
                                    RD${item.precioSugerido}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      <p className="mb-2">No hay plantilla para este tipo de negocio</p>
                      <p className="text-sm">Haz clic en "Generar con IA" para crear una plantilla sugerida</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white border-0 shadow-sm">
                <CardContent className="py-12">
                  <div className="text-center text-slate-500">
                    <BookOpen className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Selecciona un tipo de negocio para ver su plantilla</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderJergaSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Plantillas de Jerga</h2>
          <p className="text-sm text-slate-500">Gestiona las plantillas de jerga por tipo de negocio. Esta jerga se copia automáticamente cuando se crea un nuevo negocio.</p>
        </div>
        <div className="flex items-center gap-2">
          {paises.length > 0 && (
            <select
              value={selectedPaisJerga ?? ""}
              onChange={(e) => setSelectedPaisJerga(e.target.value ? parseInt(e.target.value) : null)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="select-pais-jerga-filter"
            >
              <option value="">Todos los países</option>
              {paises.map((p) => (
                <option key={p.id} value={p.id}>{p.bandera} {p.nombre}</option>
              ))}
            </select>
          )}
          <Button
            onClick={() => setShowCreateJergaDialog(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="btn-create-jerga"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Jerga
          </Button>
        </div>
      </div>

      {jergaLoading || tiposLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Tipos de Negocio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tiposNegocioCatalogo?.filter(t => t.activo).map((tipo) => {
                  const tieneJerga = tipoTieneJerga(tipo.slug);
                  const isSelected = selectedTipoJerga === tipo.slug;
                  return (
                    <button
                      key={tipo.id}
                      onClick={() => setSelectedTipoJerga(tipo.slug)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                        isSelected
                          ? "bg-emerald-50 border-emerald-300"
                          : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                      data-testid={`btn-tipo-jerga-${tipo.slug}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-emerald-100" : "bg-slate-100"}`}>
                          <MessageSquare className={`w-4 h-4 ${isSelected ? "text-emerald-600" : "text-slate-500"}`} />
                        </div>
                        <span className={`font-medium ${isSelected ? "text-emerald-700" : "text-slate-700"}`}>
                          {tipo.nombre}
                        </span>
                      </div>
                      {tieneJerga ? (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <Check className="w-3 h-3 mr-1" />
                          {getJergaForTipo(tipo.slug).length}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-slate-500">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Sin jerga
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {selectedTipoJerga ? (
              <Card className="bg-white border-0 shadow-sm">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">
                      Jerga: {tiposNegocioCatalogo?.find(t => t.slug === selectedTipoJerga)?.nombre}
                    </CardTitle>
                    <p className="text-sm text-slate-500 mt-1">
                      {tipoTieneJerga(selectedTipoJerga)
                        ? `${getJergaForTipo(selectedTipoJerga).length} términos de jerga`
                        : "Este tipo no tiene jerga definida"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setNewJerga({ ...newJerga, tipoNegocio: selectedTipoJerga });
                        setShowCreateJergaDialog(true);
                      }}
                      variant="outline"
                      size="sm"
                      data-testid="btn-add-jerga-tipo"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Agregar
                    </Button>
                    <Button
                      onClick={() => generarJergaConIA(selectedTipoJerga)}
                      disabled={generatingJerga}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                      size="sm"
                      data-testid="btn-generar-jerga-ia"
                    >
                      {generatingJerga ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Generar con IA
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {tipoTieneJerga(selectedTipoJerga) ? (
                    (() => {
                      const allJerga = getJergaForTipo(selectedTipoJerga);
                      const globalJerga = allJerga.filter(j => j.paisId === null);
                      const byCountry = paises.filter(p => allJerga.some(j => j.paisId === p.id));
                      const renderJergaList = (items: PlantillaJerga[]) => (
                        <div className="space-y-2">
                          {items.map((jerga) => (
                            <div
                              key={jerga.id}
                              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
                              data-testid={`jerga-item-${jerga.id}`}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-slate-800">"{jerga.jerga}"</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-emerald-700">{jerga.productoIdentificado}</span>
                                  {jerga.precioSugerido && (
                                    <Badge variant="outline" className="text-xs">
                                      RD${jerga.precioSugerido}
                                    </Badge>
                                  )}
                                </div>
                                {jerga.descripcion && (
                                  <p className="text-xs text-slate-500 mt-1">{jerga.descripcion}</p>
                                )}
                              </div>
                              <div className="flex gap-1 ml-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditJerga(jerga);
                                    setShowEditJergaDialog(true);
                                  }}
                                  data-testid={`btn-edit-jerga-${jerga.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowDeleteJergaConfirm(jerga.id)}
                                  className="text-red-500 hover:text-red-600"
                                  data-testid={`btn-delete-jerga-${jerga.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                      return (
                        <div className="space-y-5">
                          {globalJerga.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Globe className="w-4 h-4 text-slate-400" />
                                <span className="text-sm font-medium text-slate-500">Global / Sin país específico ({globalJerga.length})</span>
                              </div>
                              {renderJergaList(globalJerga)}
                            </div>
                          )}
                          {byCountry.map(p => {
                            const countryJerga = allJerga.filter(j => j.paisId === p.id);
                            return (
                              <div key={p.id}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-lg">{p.bandera}</span>
                                  <span className="text-sm font-medium text-slate-600">{p.nombre} ({countryJerga.length})</span>
                                </div>
                                {renderJergaList(countryJerga)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                      <p className="mb-2">No hay jerga para este tipo de negocio</p>
                      <p className="text-sm">Haz clic en "Generar con IA" para crear jerga sugerida</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white border-0 shadow-sm">
                <CardContent className="py-12">
                  <div className="text-center text-slate-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Selecciona un tipo de negocio para ver su jerga</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderSystemPromptSection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800" data-testid="text-system-prompt-title">System Prompt</h2>
        <p className="text-sm text-slate-500">Define la personalidad, tono y reglas generales del bot de WhatsApp</p>
      </div>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-emerald-600" />
            System Prompt Global
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">Este prompt se envía al inicio de cada conversación con el bot. Define el comportamiento general del asistente: tono, idioma, reglas de interacción, etc.</p>
          <Textarea
            value={systemPrompt}
            onChange={(e) => { setSystemPrompt(e.target.value); setSystemPromptDirty(true); }}
            rows={12}
            placeholder="Eres un asistente virtual para negocios dominicanos. Tu trabajo es ayudar a los clientes a hacer pedidos de forma amigable y eficiente..."
            className="font-mono text-sm"
            data-testid="textarea-system-prompt"
          />
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              <strong>Diferencia con Datos de Conocimiento:</strong> El system prompt define <em>cómo</em> se comporta el bot (personalidad, reglas, tono). Los datos de conocimiento definen <em>qué sabe</em> el bot (productos, precios, información del negocio).
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => saveSystemPromptMutation.mutate(systemPrompt)}
              disabled={!systemPromptDirty || saveSystemPromptMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-save-system-prompt"
            >
              {saveSystemPromptMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Guardar Prompt
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderZipAlertTemplateSection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800" data-testid="text-zip-alert-template-title">Alerta ZIP de Meta</h2>
        <p className="text-sm text-slate-500">Configura la plantilla aprobada que recibe el negocio cuando se detectan demasiadas direcciones sin código postal.</p>
      </div>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="w-5 h-5 text-emerald-600" />
            Plantilla aprobada de WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            La plantilla debe estar creada y aprobada en Meta antes de guardarla aquí. Debe aceptar el conteo de alertas como su primer parámetro (por ejemplo, <code>{"{{1}}"}</code>).
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="zip-alert-template-name">Nombre de plantilla</Label>
              <Input
                id="zip-alert-template-name"
                value={zipAlertTemplate.name}
                onChange={(e) => { setZipAlertTemplate({ ...zipAlertTemplate, name: e.target.value }); setZipAlertTemplateDirty(true); }}
                placeholder="zip_alert_operativo"
                data-testid="input-zip-alert-template-name"
              />
              <p className="text-xs text-slate-500">Identificador de Meta en minúsculas, con letras, números, guion o guion bajo.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip-alert-template-language">Idioma (locale)</Label>
              <Input
                id="zip-alert-template-language"
                value={zipAlertTemplate.language}
                onChange={(e) => { setZipAlertTemplate({ ...zipAlertTemplate, language: e.target.value }); setZipAlertTemplateDirty(true); }}
                placeholder="es_ES"
                data-testid="input-zip-alert-template-language"
              />
              <p className="text-xs text-slate-500">Usa el locale exacto de Meta, por ejemplo es_ES o en_US.</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => saveZipAlertTemplateMutation.mutate(zipAlertTemplate)}
              disabled={!zipAlertTemplateDirty || saveZipAlertTemplateMutation.isPending || !zipAlertTemplateData}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-save-zip-alert-template"
            >
              {saveZipAlertTemplateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Guardar plantilla
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderDatosConocimientoSection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800" data-testid="text-conocimiento-title">Datos de Conocimiento</h2>
        <p className="text-sm text-slate-500">Archivos con información específica por tipo de negocio que el bot usa para responder</p>
      </div>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-emerald-600" />
            Archivos de Conocimiento por Tipo de Negocio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">Sube archivos .txt con información específica para cada tipo de negocio. El bot usará esta información para responder preguntas.</p>
          
          <div className="flex flex-wrap gap-2">
            {tiposNegocioLocal.map(tipo => (
              <Button
                key={tipo.value}
                variant={selectedTipoConocimiento === tipo.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTipoConocimiento(tipo.value)}
                className={selectedTipoConocimiento === tipo.value ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                data-testid={`button-tipo-conocimiento-${tipo.value}`}
              >
                {tipo.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-medium text-slate-700">
              Archivos para: <span className="text-emerald-600">{getTipoLabel(selectedTipoConocimiento)}</span>
            </h3>
            <Button
              size="sm"
              onClick={() => setShowUploadConocimiento(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-add-conocimiento"
            >
              <Plus className="w-4 h-4 mr-1" />
              Agregar Archivo
            </Button>
          </div>

          {conocimientoLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : conocimientoArchivos && conocimientoArchivos.length > 0 ? (
            <div className="space-y-3">
              {conocimientoArchivos.map(archivo => (
                <div key={archivo.id} className="border rounded-lg p-4" data-testid={`card-conocimiento-${archivo.id}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-slate-700">{archivo.nombre}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {new Date(archivo.fechaCreacion).toLocaleDateString("es-DO")}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteConocimientoMutation.mutate(archivo.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        data-testid={`button-delete-conocimiento-${archivo.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                      <ChevronRight className="w-3 h-3" />
                      Ver contenido ({archivo.contenido.length} caracteres)
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 p-3 bg-slate-50 rounded text-xs text-slate-600 whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {archivo.contenido}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p>No hay archivos de conocimiento para {getTipoLabel(selectedTipoConocimiento)}</p>
            </div>
          )}

          {showUploadConocimiento && (
            <Card className="border-2 border-emerald-200 bg-emerald-50/30">
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="conocimiento-nombre">Nombre del archivo</Label>
                  <Input
                    id="conocimiento-nombre"
                    value={newConocimientoNombre}
                    onChange={(e) => setNewConocimientoNombre(e.target.value)}
                    placeholder="Ej: productos-disponibles.txt"
                    data-testid="input-conocimiento-nombre"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="conocimiento-contenido">Contenido</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".txt";
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
                              const text = await file.text();
                              setNewConocimientoContenido(text);
                              if (!newConocimientoNombre) setNewConocimientoNombre(file.name);
                            }
                          };
                          input.click();
                        }}
                        data-testid="button-upload-file"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        Cargar archivo .txt
                      </Button>
                    </div>
                    <Textarea
                      id="conocimiento-contenido"
                      value={newConocimientoContenido}
                      onChange={(e) => setNewConocimientoContenido(e.target.value)}
                      rows={10}
                      placeholder="Pega o escribe el contenido del archivo aquí..."
                      className="font-mono text-sm"
                      data-testid="textarea-conocimiento-contenido"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setShowUploadConocimiento(false); setNewConocimientoNombre(""); setNewConocimientoContenido(""); }}
                    data-testid="button-cancel-conocimiento"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => createConocimientoMutation.mutate({
                      tipoNegocio: selectedTipoConocimiento,
                      nombre: newConocimientoNombre,
                      contenido: newConocimientoContenido,
                    })}
                    disabled={!newConocimientoNombre || !newConocimientoContenido || createConocimientoMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid="button-save-conocimiento"
                  >
                    {createConocimientoMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Save className="w-4 h-4 mr-2" />
                    Guardar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Ban className="w-5 h-5 text-red-500" />
            Políticas de Meta (Solo lectura)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-700">
              <strong>Estas políticas están hardcodeadas</strong> y se aplican automáticamente cuando el negocio usa la API oficial de Meta/WhatsApp Business.
              No se aplican al Chat Web.
            </p>
          </div>
          <pre className="p-4 bg-slate-50 rounded-lg text-xs text-slate-600 whitespace-pre-wrap max-h-80 overflow-y-auto" data-testid="text-meta-policies">
            {metaPolicies?.content || "Cargando..."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );

  const renderDeliveryPromptSection = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800" data-testid="text-delivery-prompt-title">Prompt de Delivery</h2>
        <p className="text-sm text-slate-500">Mensaje que se envía al repartidor cuando se activa escribiendo "activo" por WhatsApp</p>
      </div>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-emerald-600" />
            Mensaje de Activación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Este mensaje se envía automáticamente al delivery cuando escribe "activo", "disponible" o "listo" por WhatsApp. 
            Usa las variables disponibles para personalizar el mensaje.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800 font-medium mb-2">Variables disponibles:</p>
            <ul className="text-sm text-amber-700 space-y-1">
              <li><code className="bg-amber-100 px-1 rounded">{"{delivery_nombre}"}</code> - Nombre del repartidor</li>
              <li><code className="bg-amber-100 px-1 rounded">{"{negocio_nombre}"}</code> - Nombre del negocio</li>
            </ul>
          </div>
          <Textarea
            value={deliveryPrompt}
            onChange={(e) => { setDeliveryPrompt(e.target.value); setDeliveryPromptDirty(true); }}
            rows={10}
            placeholder={"✅ ¡Hola {delivery_nombre}! Ya estás activo para {negocio_nombre}.\n\n📋 Instrucciones:\n- Mantente pendiente de los pedidos que te lleguen\n- Confirma la entrega escribiendo: entregado #ID\n- Si no puedes entregar: cancelado #ID\n- Para devolver al negocio: retorno #ID\n- Para descansar escribe: inactivo\n\n¡Buena jornada!"}
            className="font-mono text-sm"
            data-testid="textarea-delivery-prompt"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => saveDeliveryPromptMutation.mutate(deliveryPrompt)}
              disabled={!deliveryPromptDirty || saveDeliveryPromptMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="button-save-delivery-prompt"
            >
              {saveDeliveryPromptMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-2" />
              Guardar Prompt
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
            Comandos del Delivery
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-600 mb-3">Los repartidores pueden usar estos comandos por WhatsApp:</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="font-medium text-emerald-700 min-w-[140px]">activo / disponible / listo</span>
                <span className="text-slate-500">Se activa para recibir pedidos</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-emerald-700 min-w-[140px]">inactivo / descanso / pausa</span>
                <span className="text-slate-500">Deja de recibir pedidos</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-emerald-700 min-w-[140px]">entregado #123</span>
                <span className="text-slate-500">Confirma la entrega del pedido</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-emerald-700 min-w-[140px]">cancelado #123</span>
                <span className="text-slate-500">No pudo entregar el pedido</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-medium text-emerald-700 min-w-[140px]">retorno #123</span>
                <span className="text-slate-500">Devuelve el pedido al negocio</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderPaisesSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Globe className="w-6 h-6 text-emerald-600" />
            Países
          </h2>
          <p className="text-slate-500 text-sm mt-1">Soporte multi-país para la plataforma. Cada país tiene su propia jerga y configuración.</p>
        </div>
        <Button onClick={() => setShowCreatePaisDialog(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-create-pais">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo País
        </Button>
      </div>

      {isLoadingPaises ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : paises.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No hay países configurados</p>
            <p className="text-slate-400 text-sm mt-1">Crea el primer país para habilitar el soporte multi-país</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {paises.map((pais) => {
            const jergaCount = (plantillasJerga || []).filter((j: PlantillaJerga) => j.paisId === pais.id).length;
            return (
              <Card key={pais.id} className="border border-slate-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {pais.bandera && (
                        <span className="text-3xl">{pais.bandera}</span>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-800">{pais.nombre}</h3>
                          <Badge variant="outline" className="text-xs">{pais.codigo}</Badge>
                          {!pais.activo && <Badge variant="secondary" className="text-xs">Inactivo</Badge>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                          <span title={pais.codigo === "DO" ? "País: +1 (809/829/849 son códigos de área)" : undefined}>{getDisplayPrefix(pais)}</span>
                          <span>{pais.simboloMoneda} {pais.moneda}</span>
                          <span>{pais.zonaHoraria}</span>
                          {jergaCount > 0 && (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                              {jergaCount} jergas
                            </Badge>
                          )}
                        </div>
                        <div
                          className="flex items-center gap-2 mt-2 text-xs"
                          data-testid={`postal-pattern-status-${pais.id}`}
                        >
                          <span className="font-medium text-slate-600">Formato postal:</span>
                          {pais.patronCodigoPostal ? (
                            <code
                              className="max-w-full break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700"
                              data-testid={`postal-pattern-${pais.id}`}
                            >
                              {pais.patronCodigoPostal}
                            </code>
                          ) : (
                            <span className="text-slate-400" data-testid={`postal-pattern-empty-${pais.id}`}>
                              No configurado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generarJergaPais(pais.id)}
                        disabled={generatingPaisJerga === pais.id}
                        title="Generar jerga con IA"
                        data-testid={`button-generar-jerga-pais-${pais.id}`}
                      >
                        {generatingPaisJerga === pais.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        <span className="ml-1 hidden sm:inline">Generar Jerga</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setEditPais(pais); setShowEditPaisDialog(true); }}
                        data-testid={`button-edit-pais-${pais.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeletePaisConfirm(pais.id)}
                        className="text-red-500 hover:text-red-700 hover:border-red-300"
                        data-testid={`button-delete-pais-${pais.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create País Dialog */}
      <Dialog open={showCreatePaisDialog} onOpenChange={setShowCreatePaisDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              Crear Nuevo País
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createPaisMutation.mutate(newPais); }} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pais-codigo">Código ISO (ej: AR)</Label>
                <Input id="pais-codigo" value={newPais.codigo} onChange={(e) => setNewPais({ ...newPais, codigo: e.target.value.toUpperCase() })} placeholder="AR" maxLength={3} required data-testid="input-new-pais-codigo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pais-bandera">Emoji Bandera</Label>
                <Input id="pais-bandera" value={newPais.bandera} onChange={(e) => setNewPais({ ...newPais, bandera: e.target.value })} placeholder="🇦🇷" data-testid="input-new-pais-bandera" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="pais-nombre">Nombre del País</Label>
                <Input id="pais-nombre" value={newPais.nombre} onChange={(e) => setNewPais({ ...newPais, nombre: e.target.value })} placeholder="Argentina" required data-testid="input-new-pais-nombre" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pais-prefijo">Prefijo Celular</Label>
                <Input id="pais-prefijo" value={newPais.prefijoCelular} onChange={(e) => setNewPais({ ...newPais, prefijoCelular: e.target.value })} placeholder="54" required data-testid="input-new-pais-prefijo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pais-moneda">Código Moneda</Label>
                <Input id="pais-moneda" value={newPais.moneda} onChange={(e) => setNewPais({ ...newPais, moneda: e.target.value.toUpperCase() })} placeholder="ARS" maxLength={5} required data-testid="input-new-pais-moneda" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pais-simbolo">Símbolo Moneda</Label>
                <Input id="pais-simbolo" value={newPais.simboloMoneda} onChange={(e) => setNewPais({ ...newPais, simboloMoneda: e.target.value })} placeholder="$" maxLength={5} required data-testid="input-new-pais-simbolo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pais-zona">Zona Horaria</Label>
                <Input id="pais-zona" value={newPais.zonaHoraria} onChange={(e) => setNewPais({ ...newPais, zonaHoraria: e.target.value })} placeholder="America/Argentina/Buenos_Aires" required data-testid="input-new-pais-zona" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch id="pais-activo" checked={newPais.activo} onCheckedChange={(v) => setNewPais({ ...newPais, activo: v })} data-testid="switch-new-pais-activo" />
                <Label htmlFor="pais-activo">País activo</Label>
              </div>
              <div className="col-span-2 pt-3 border-t">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Formato de Dirección</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Etiqueta Estado/Provincia</Label>
                    <Input value={newPais.etiquetaEstado} onChange={(e) => setNewPais({ ...newPais, etiquetaEstado: e.target.value })} placeholder="Ej: Provincia, State" data-testid="input-new-pais-etiqueta-estado" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Etiqueta Código Postal</Label>
                    <Input value={newPais.etiquetaCodigoPostal} onChange={(e) => setNewPais({ ...newPais, etiquetaCodigoPostal: e.target.value })} placeholder="Ej: ZIP Code (vacío = sin CP)" data-testid="input-new-pais-etiqueta-cp" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ejemplo Dirección</Label>
                    <Input value={newPais.ejemploDireccion} onChange={(e) => setNewPais({ ...newPais, ejemploDireccion: e.target.value })} placeholder="Ej: Calle Principal #123" data-testid="input-new-pais-ejemplo-dir" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ejemplo Ciudad</Label>
                    <Input value={newPais.ejemploCiudad} onChange={(e) => setNewPais({ ...newPais, ejemploCiudad: e.target.value })} placeholder="Ej: Santo Domingo" data-testid="input-new-pais-ejemplo-ciudad" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ejemplo Estado/Provincia</Label>
                    <Input value={newPais.ejemploEstado} onChange={(e) => setNewPais({ ...newPais, ejemploEstado: e.target.value })} placeholder="Ej: Distrito Nacional" data-testid="input-new-pais-ejemplo-estado" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ejemplo Código Postal</Label>
                    <Input value={newPais.ejemploCodigoPostal} onChange={(e) => setNewPais({ ...newPais, ejemploCodigoPostal: e.target.value })} placeholder="Ej: 10001" data-testid="input-new-pais-ejemplo-cp" />
                  </div>
                   <div className="col-span-2 space-y-1">
                     <Label className="text-xs">Patrón Código Postal (opcional)</Label>
                     <Input value={newPais.patronCodigoPostal} onChange={(e) => setNewPais({ ...newPais, patronCodigoPostal: e.target.value })} placeholder={"Ej: \\d{5}(-\\d{4})?"} className="font-mono" data-testid="input-new-pais-patron-cp" />
                     <p className="text-xs text-slate-500">Expresión regular para validar el código postal. Déjalo vacío si no aplica.</p>
                   </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Switch id="new-pais-requiere-cp" checked={newPais.requiereCodigoPostal} onCheckedChange={(v) => setNewPais({ ...newPais, requiereCodigoPostal: v })} data-testid="switch-new-pais-requiere-cp" />
                    <Label htmlFor="new-pais-requiere-cp" className="text-sm">Requiere código postal</Label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreatePaisDialog(false)} data-testid="button-cancel-create-pais">Cancelar</Button>
              <Button type="submit" disabled={createPaisMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-submit-create-pais">
                {createPaisMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear País
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit País Dialog */}
      <Dialog open={showEditPaisDialog} onOpenChange={(open) => { if (!open) { setShowEditPaisDialog(false); setEditPais(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar País
            </DialogTitle>
          </DialogHeader>
          {editPais && (
            <form onSubmit={(e) => { e.preventDefault(); updatePaisMutation.mutate(editPais); }} className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Código ISO</Label>
                  <Input value={editPais.codigo} onChange={(e) => setEditPais({ ...editPais, codigo: e.target.value.toUpperCase() })} maxLength={3} required data-testid="input-edit-pais-codigo" />
                </div>
                <div className="space-y-2">
                  <Label>Emoji Bandera</Label>
                  <Input value={editPais.bandera || ""} onChange={(e) => setEditPais({ ...editPais, bandera: e.target.value || null })} placeholder="🇦🇷" data-testid="input-edit-pais-bandera" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Nombre del País</Label>
                  <Input value={editPais.nombre} onChange={(e) => setEditPais({ ...editPais, nombre: e.target.value })} required data-testid="input-edit-pais-nombre" />
                </div>
                <div className="space-y-2">
                  <Label>Prefijo Celular</Label>
                  <Input value={editPais.prefijoCelular} onChange={(e) => setEditPais({ ...editPais, prefijoCelular: e.target.value })} required data-testid="input-edit-pais-prefijo" />
                </div>
                <div className="space-y-2">
                  <Label>Código Moneda</Label>
                  <Input value={editPais.moneda} onChange={(e) => setEditPais({ ...editPais, moneda: e.target.value.toUpperCase() })} maxLength={5} required data-testid="input-edit-pais-moneda" />
                </div>
                <div className="space-y-2">
                  <Label>Símbolo Moneda</Label>
                  <Input value={editPais.simboloMoneda} onChange={(e) => setEditPais({ ...editPais, simboloMoneda: e.target.value })} maxLength={5} required data-testid="input-edit-pais-simbolo" />
                </div>
                <div className="space-y-2">
                  <Label>Zona Horaria</Label>
                  <Input value={editPais.zonaHoraria} onChange={(e) => setEditPais({ ...editPais, zonaHoraria: e.target.value })} required data-testid="input-edit-pais-zona" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Switch id="edit-pais-activo" checked={editPais.activo} onCheckedChange={(v) => setEditPais({ ...editPais, activo: v })} data-testid="switch-edit-pais-activo" />
                  <Label htmlFor="edit-pais-activo">País activo</Label>
                </div>
                <div className="col-span-2 pt-3 border-t">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Formato de Dirección</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Etiqueta Estado/Provincia</Label>
                      <Input value={editPais.etiquetaEstado ?? ""} onChange={(e) => setEditPais({ ...editPais, etiquetaEstado: e.target.value || null })} placeholder="Ej: Provincia, State" data-testid="input-edit-pais-etiqueta-estado" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Etiqueta Código Postal</Label>
                      <Input value={editPais.etiquetaCodigoPostal ?? ""} onChange={(e) => setEditPais({ ...editPais, etiquetaCodigoPostal: e.target.value || null })} placeholder="Ej: ZIP Code (vacío = sin CP)" data-testid="input-edit-pais-etiqueta-cp" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ejemplo Dirección</Label>
                      <Input value={editPais.ejemploDireccion ?? ""} onChange={(e) => setEditPais({ ...editPais, ejemploDireccion: e.target.value || null })} placeholder="Ej: Calle Principal #123" data-testid="input-edit-pais-ejemplo-dir" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ejemplo Ciudad</Label>
                      <Input value={editPais.ejemploCiudad ?? ""} onChange={(e) => setEditPais({ ...editPais, ejemploCiudad: e.target.value || null })} placeholder="Ej: Santo Domingo" data-testid="input-edit-pais-ejemplo-ciudad" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ejemplo Estado/Provincia</Label>
                      <Input value={editPais.ejemploEstado ?? ""} onChange={(e) => setEditPais({ ...editPais, ejemploEstado: e.target.value || null })} placeholder="Ej: Distrito Nacional" data-testid="input-edit-pais-ejemplo-estado" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ejemplo Código Postal</Label>
                      <Input value={editPais.ejemploCodigoPostal ?? ""} onChange={(e) => setEditPais({ ...editPais, ejemploCodigoPostal: e.target.value || null })} placeholder="Ej: 10001" data-testid="input-edit-pais-ejemplo-cp" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Patrón Código Postal (opcional)</Label>
                      <Input value={editPais.patronCodigoPostal ?? ""} onChange={(e) => setEditPais({ ...editPais, patronCodigoPostal: e.target.value || null })} placeholder={"Ej: \\d{5}(-\\d{4})?"} className="font-mono" data-testid="input-edit-pais-patron-cp" />
                      <p className="text-xs text-slate-500">Expresión regular para validar el código postal. Déjalo vacío si no aplica.</p>
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <Switch id="edit-pais-requiere-cp" checked={editPais.requiereCodigoPostal ?? false} onCheckedChange={(v) => setEditPais({ ...editPais, requiereCodigoPostal: v })} data-testid="switch-edit-pais-requiere-cp" />
                      <Label htmlFor="edit-pais-requiere-cp" className="text-sm">Requiere código postal</Label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowEditPaisDialog(false); setEditPais(null); }} data-testid="button-cancel-edit-pais">Cancelar</Button>
                <Button type="submit" disabled={updatePaisMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-submit-edit-pais">
                  {updatePaisMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete País Confirm */}
      <Dialog open={showDeletePaisConfirm !== null} onOpenChange={(open) => { if (!open) setShowDeletePaisConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Eliminar País
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-600 text-sm">¿Estás seguro de que deseas eliminar este país? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDeletePaisConfirm(null)} data-testid="button-cancel-delete-pais">Cancelar</Button>
            <Button variant="destructive" onClick={() => showDeletePaisConfirm && deletePaisMutation.mutate(showDeletePaisConfirm)} disabled={deletePaisMutation.isPending} data-testid="button-confirm-delete-pais">
              {deletePaisMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderProductosRestringidosSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800" data-testid="text-productos-restringidos-title">Productos Restringidos</h2>
          <p className="text-sm text-slate-500">Palabras clave que activan la verificación de edad antes de procesar el pedido</p>
        </div>
        <Button
          onClick={() => setShowCreateRestringidoDialog(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="button-add-restringido"
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar
        </Button>
      </div>

      <Card className="bg-white border-0 shadow-sm">
        <CardContent className="p-0">
          {isLoadingRestringidos ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : productosRestringidos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Ban className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>No hay productos restringidos configurados</p>
              <p className="text-sm">Agrega palabras clave que requieran verificación de edad</p>
            </div>
          ) : (
            <div className="divide-y">
              {(["alcohol", "tabaco"] as const).map(cat => {
                const items = productosRestringidos.filter(p => p.categoria === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} className="p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Badge variant={cat === "alcohol" ? "default" : "secondary"} className={cat === "alcohol" ? "bg-amber-500" : "bg-red-500"}>
                        {cat === "alcohol" ? "🍺 Alcohol" : "🚬 Tabaco"}
                      </Badge>
                      <span className="text-slate-400 text-xs">({items.length} palabras)</span>
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {items.map(producto => (
                        <div
                          key={producto.id}
                          className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                            producto.activo 
                              ? "bg-white border-slate-200 text-slate-700" 
                              : "bg-slate-50 border-slate-100 text-slate-400 line-through"
                          }`}
                          data-testid={`restringido-${producto.id}`}
                        >
                          <span>{producto.palabraClave}</span>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={() => updateRestringidoMutation.mutate({ id: producto.id, activo: !producto.activo })}
                              className="text-slate-400 hover:text-emerald-600"
                              title={producto.activo ? "Desactivar" : "Activar"}
                              data-testid={`toggle-restringido-${producto.id}`}
                            >
                              {producto.activo ? <Ban className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => {
                                setEditRestringido(producto);
                                setShowEditRestringidoDialog(true);
                              }}
                              className="text-slate-400 hover:text-blue-600"
                              data-testid={`edit-restringido-${producto.id}`}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setShowDeleteRestringidoConfirm(producto.id)}
                              className="text-slate-400 hover:text-red-600"
                              data-testid={`delete-restringido-${producto.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            ¿Cómo funciona?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm text-slate-600">
            <p>Cuando un cliente escribe un mensaje por WhatsApp o Chat Web que contenga alguna de estas palabras clave:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>El sistema detecta que es un producto restringido</li>
              <li>Le pregunta al cliente si es mayor de 18 años</li>
              <li>Si confirma, se guarda la verificación y <strong>no se le vuelve a preguntar</strong></li>
              <li>Si rechaza, no puede pedir ese tipo de producto</li>
            </ol>
            <p className="text-amber-700 font-medium">Esto aplica para todos los tipos de negocio.</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreateRestringidoDialog} onOpenChange={setShowCreateRestringidoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Producto Restringido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Palabra Clave</Label>
              <Input
                value={newRestringido.palabraClave}
                onChange={(e) => setNewRestringido({ ...newRestringido, palabraClave: e.target.value })}
                placeholder="ej: cerveza, ron, cigarrillo"
                data-testid="input-restringido-palabra"
              />
              <p className="text-xs text-slate-400 mt-1">Se buscará esta palabra dentro del mensaje del cliente (sin importar mayúsculas)</p>
            </div>
            <div>
              <Label>Categoría</Label>
              <select
                value={newRestringido.categoria}
                onChange={(e) => setNewRestringido({ ...newRestringido, categoria: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm"
                data-testid="select-restringido-categoria"
              >
                <option value="alcohol">🍺 Alcohol</option>
                <option value="tabaco">🚬 Tabaco</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateRestringidoDialog(false)}>Cancelar</Button>
              <Button
                onClick={() => createRestringidoMutation.mutate(newRestringido)}
                disabled={!newRestringido.palabraClave.trim() || createRestringidoMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-save-restringido"
              >
                {createRestringidoMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditRestringidoDialog} onOpenChange={setShowEditRestringidoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Producto Restringido</DialogTitle>
          </DialogHeader>
          {editRestringido && (
            <div className="space-y-4">
              <div>
                <Label>Palabra Clave</Label>
                <Input
                  value={editRestringido.palabraClave}
                  onChange={(e) => setEditRestringido({ ...editRestringido, palabraClave: e.target.value })}
                  data-testid="input-edit-restringido-palabra"
                />
              </div>
              <div>
                <Label>Categoría</Label>
                <select
                  value={editRestringido.categoria}
                  onChange={(e) => setEditRestringido({ ...editRestringido, categoria: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  data-testid="select-edit-restringido-categoria"
                >
                  <option value="alcohol">🍺 Alcohol</option>
                  <option value="tabaco">🚬 Tabaco</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editRestringido.activo}
                  onCheckedChange={(checked) => setEditRestringido({ ...editRestringido, activo: checked })}
                  data-testid="switch-edit-restringido-activo"
                />
                <Label>{editRestringido.activo ? "Activo" : "Inactivo"}</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEditRestringidoDialog(false)}>Cancelar</Button>
                <Button
                  onClick={() => updateRestringidoMutation.mutate({ id: editRestringido.id, palabraClave: editRestringido.palabraClave, categoria: editRestringido.categoria, activo: editRestringido.activo })}
                  disabled={updateRestringidoMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  data-testid="button-update-restringido"
                >
                  {updateRestringidoMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteRestringidoConfirm !== null} onOpenChange={() => setShowDeleteRestringidoConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar producto restringido?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">Esta acción no se puede deshacer. La palabra clave dejará de activar verificación de edad.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteRestringidoConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteRestringidoConfirm && deleteRestringidoMutation.mutate(showDeleteRestringidoConfirm)}
              disabled={deleteRestringidoMutation.isPending}
              data-testid="button-confirm-delete-restringido"
            >
              {deleteRestringidoMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  const sidebarItems = [
    { id: "tipos-negocio" as SectionType, label: "Tipos de Negocio", icon: Tag },
    { id: "plantillas-menu" as SectionType, label: "Plantillas Menú", icon: BookOpen },
    { id: "jerga" as SectionType, label: "Jerga", icon: MessageSquare },
    { id: "system-prompt" as SectionType, label: "System Prompt", icon: Brain },
    { id: "datos-conocimiento" as SectionType, label: "Datos Conocimiento", icon: FileText },
    { id: "delivery-prompt" as SectionType, label: "Prompt Delivery", icon: Truck },
    { id: "zip-alert-template" as SectionType, label: "Alerta ZIP Meta", icon: Settings },
    { id: "productos-restringidos" as SectionType, label: "Productos Restringidos", icon: Ban },
    { id: "paises" as SectionType, label: "Países", icon: Globe },
    { id: "planes" as SectionType, label: "Planes", icon: Crown },
    { id: "negocios" as SectionType, label: "Negocios", icon: Store },
    { id: "integraciones" as SectionType, label: "Integraciones", icon: KeyRound },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" data-testid="platform-admin-page">
      <header className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-5 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="p-1.5 md:p-2 bg-white/10 rounded-xl">
              <Building2 className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold tracking-tight">Panel Admin</h1>
              <p className="text-xs md:text-sm text-emerald-100 hidden sm:block">Gestión de Plataforma</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-xs md:text-sm bg-white/10 px-2 md:px-3 py-1 md:py-1.5 rounded-full hidden sm:inline" data-testid="text-admin-username">
              {user?.firstName || user?.email || "Admin"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => { window.location.href = "/"; }); }}
              className="text-white hover:bg-white/20"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="w-64 min-h-[calc(100vh-64px)] bg-white border-r shadow-sm hidden md:block">
          <nav className="p-4 space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeSection === item.id
                    ? "bg-emerald-50 text-emerald-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
                data-testid={`sidebar-${item.id}`}
              >
                <item.icon className={`w-5 h-5 ${activeSection === item.id ? "text-emerald-600" : "text-slate-400"}`} />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-40">
          <nav className="flex justify-around p-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  activeSection === item.id
                    ? "text-emerald-600"
                    : "text-slate-400"
                }`}
                data-testid={`mobile-nav-${item.id}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs">{item.label.split(" ")[0]}</span>
              </button>
            ))}
          </nav>
        </div>

        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : (
            <>
              {activeSection === "tipos-negocio" && renderTiposNegocioSection()}
              {activeSection === "plantillas-menu" && renderPlantillasMenuSection()}
              {activeSection === "jerga" && renderJergaSection()}
              {activeSection === "system-prompt" && renderSystemPromptSection()}
              {activeSection === "datos-conocimiento" && renderDatosConocimientoSection()}
              {activeSection === "delivery-prompt" && renderDeliveryPromptSection()}
              {activeSection === "zip-alert-template" && renderZipAlertTemplateSection()}
              {activeSection === "productos-restringidos" && renderProductosRestringidosSection()}
              {activeSection === "paises" && renderPaisesSection()}
              {activeSection === "planes" && renderPlanesSection()}
              {activeSection === "negocios" && renderNegociosSection()}
              {activeSection === "integraciones" && <IntegracionesSection />}
            </>
          )}
        </main>
      </div>

      <Dialog open={showCreateTipoDialog} onOpenChange={setShowCreateTipoDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-600" />
              Crear Tipo de Negocio
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createTipoNegocioMutation.mutate(newTipoNegocio); }} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tipo-nombre">Nombre</Label>
              <Input
                id="tipo-nombre"
                value={newTipoNegocio.nombre}
                onChange={(e) => setNewTipoNegocio({ ...newTipoNegocio, nombre: e.target.value })}
                placeholder="Ej: Restaurante"
                required
                data-testid="input-tipo-nombre"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo-slug">Slug</Label>
              <Input
                id="tipo-slug"
                value={newTipoNegocio.slug}
                onChange={(e) => setNewTipoNegocio({ ...newTipoNegocio, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="Ej: restaurante"
                required
                data-testid="input-tipo-slug"
              />
              <p className="text-xs text-slate-500">Identificador único, sin espacios</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo-icono">Icono (emoji)</Label>
              <Input
                id="tipo-icono"
                value={newTipoNegocio.icono}
                onChange={(e) => setNewTipoNegocio({ ...newTipoNegocio, icono: e.target.value })}
                placeholder="Ej: 🍔"
                data-testid="input-tipo-icono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo-descripcion">Descripción</Label>
              <Textarea
                id="tipo-descripcion"
                value={newTipoNegocio.descripcion}
                onChange={(e) => setNewTipoNegocio({ ...newTipoNegocio, descripcion: e.target.value })}
                placeholder="Descripción del tipo de negocio"
                rows={3}
                data-testid="input-tipo-descripcion"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo-orden">Orden</Label>
                <Input
                  id="tipo-orden"
                  type="number"
                  min="0"
                  value={newTipoNegocio.orden}
                  onChange={(e) => setNewTipoNegocio({ ...newTipoNegocio, orden: parseInt(e.target.value) || 0 })}
                  data-testid="input-tipo-orden"
                />
              </div>
              <div className="flex items-center justify-between pt-7">
                <Label htmlFor="tipo-activo">Activo</Label>
                <Switch
                  id="tipo-activo"
                  checked={newTipoNegocio.activo}
                  onCheckedChange={(checked) => setNewTipoNegocio({ ...newTipoNegocio, activo: checked })}
                  data-testid="switch-tipo-activo"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateTipoDialog(false);
                  setNewTipoNegocio({ slug: "", nombre: "", descripcion: "", icono: "", activo: true, orden: 0 });
                }}
                data-testid="button-cancel-create-tipo"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createTipoNegocioMutation.isPending || !newTipoNegocio.nombre || !newTipoNegocio.slug}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-submit-create-tipo"
              >
                {createTipoNegocioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear Tipo
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditTipoDialog} onOpenChange={(open) => { if (!open) { setShowEditTipoDialog(false); setEditTipoNegocio(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Tipo de Negocio
            </DialogTitle>
          </DialogHeader>
          {editTipoNegocio && (
            <form onSubmit={(e) => { e.preventDefault(); updateTipoNegocioMutation.mutate(editTipoNegocio); }} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-tipo-nombre">Nombre</Label>
                <Input
                  id="edit-tipo-nombre"
                  value={editTipoNegocio.nombre}
                  onChange={(e) => setEditTipoNegocio({ ...editTipoNegocio, nombre: e.target.value })}
                  required
                  data-testid="input-edit-tipo-nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tipo-slug">Slug</Label>
                <Input
                  id="edit-tipo-slug"
                  value={editTipoNegocio.slug}
                  onChange={(e) => setEditTipoNegocio({ ...editTipoNegocio, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  required
                  data-testid="input-edit-tipo-slug"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tipo-icono">Icono (emoji)</Label>
                <Input
                  id="edit-tipo-icono"
                  value={editTipoNegocio.icono || ""}
                  onChange={(e) => setEditTipoNegocio({ ...editTipoNegocio, icono: e.target.value })}
                  data-testid="input-edit-tipo-icono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-tipo-descripcion">Descripción</Label>
                <Textarea
                  id="edit-tipo-descripcion"
                  value={editTipoNegocio.descripcion || ""}
                  onChange={(e) => setEditTipoNegocio({ ...editTipoNegocio, descripcion: e.target.value })}
                  rows={3}
                  data-testid="input-edit-tipo-descripcion"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-tipo-orden">Orden</Label>
                  <Input
                    id="edit-tipo-orden"
                    type="number"
                    min="0"
                    value={editTipoNegocio.orden}
                    onChange={(e) => setEditTipoNegocio({ ...editTipoNegocio, orden: parseInt(e.target.value) || 0 })}
                    data-testid="input-edit-tipo-orden"
                  />
                </div>
                <div className="flex items-center justify-between pt-7">
                  <Label htmlFor="edit-tipo-activo">Activo</Label>
                  <Switch
                    id="edit-tipo-activo"
                    checked={editTipoNegocio.activo}
                    onCheckedChange={(checked) => setEditTipoNegocio({ ...editTipoNegocio, activo: checked })}
                    data-testid="switch-edit-tipo-activo"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowEditTipoDialog(false); setEditTipoNegocio(null); }}
                  data-testid="button-cancel-edit-tipo"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateTipoNegocioMutation.isPending || !editTipoNegocio.nombre || !editTipoNegocio.slug}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-submit-edit-tipo"
                >
                  {updateTipoNegocioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteTipoConfirm !== null} onOpenChange={(open) => { if (!open) setShowDeleteTipoConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Tipo de Negocio</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">¿Estás seguro de que deseas eliminar este tipo de negocio? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteTipoConfirm(null)} data-testid="button-cancel-delete-tipo">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteTipoConfirm && deleteTipoNegocioMutation.mutate(showDeleteTipoConfirm)}
              disabled={deleteTipoNegocioMutation.isPending}
              data-testid="button-confirm-delete-tipo"
            >
              {deleteTipoNegocioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" />
              Crear Nuevo Negocio
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createNegocioMutation.mutate(newNegocio); }} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="tipoNegocio">Tipo de Negocio</Label>
                <select
                  id="tipoNegocio"
                  value={newNegocio.tipoNegocio}
                  onChange={(e) => setNewNegocio({ ...newNegocio, tipoNegocio: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  data-testid="select-new-negocio-tipo"
                >
                  {tiposNegocioCatalogo && tiposNegocioCatalogo.filter(t => t.activo).length > 0 
                    ? tiposNegocioCatalogo.filter(t => t.activo).map((tipo) => (
                        <option key={tipo.slug} value={tipo.slug}>{tipo.nombre}</option>
                      ))
                    : tiposNegocioLocal.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                      ))
                  }
                </select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="nombre">Nombre del Negocio</Label>
                <Input
                  id="nombre"
                  value={newNegocio.nombre}
                  onChange={(e) => setNewNegocio({ ...newNegocio, nombre: e.target.value })}
                  placeholder="Ej: Mi Restaurante"
                  required
                  data-testid="input-new-negocio-nombre"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="whatsappNumero">Número WhatsApp</Label>
                <Input
                  id="whatsappNumero"
                  value={newNegocio.whatsappNumero}
                  onChange={(e) => setNewNegocio({ ...newNegocio, whatsappNumero: e.target.value })}
                  placeholder={whatsappPlaceholder(
                    newNegocio.paisId
                      ? paises.find((p) => p.id === newNegocio.paisId)
                      : paises.find((p) => p.codigo === "DO")
                  )}
                  required
                  data-testid="input-new-negocio-whatsapp"
                />
              </div>
              {(() => {
                const sp = (paises || []).find((p) => p.id === newNegocio.paisId)
                  ?? (paises || []).find((p) => p.codigo === "DO");
                const isUS = sp?.requiereCodigoPostal ?? false;
                return (
                  <>
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="direccion">{isUS ? "Street Address" : "Dirección"}</Label>
                      <Input
                        id="direccion"
                        value={newNegocio.direccion}
                        onChange={(e) => setNewNegocio({ ...newNegocio, direccion: e.target.value })}
                        placeholder={sp?.ejemploDireccion ? `Ej: ${sp.ejemploDireccion}` : "Ej: Calle Principal #123"}
                        required
                        data-testid="input-new-negocio-direccion"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ciudad">{isUS ? "City" : "Ciudad"}</Label>
                      <Input
                        id="ciudad"
                        value={newNegocio.ciudad}
                        onChange={(e) => setNewNegocio({ ...newNegocio, ciudad: e.target.value })}
                        placeholder={sp?.ejemploCiudad ? `Ej: ${sp.ejemploCiudad}` : "Ej: Santo Domingo"}
                        data-testid="input-new-negocio-ciudad"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="provincia">{sp?.etiquetaEstado ?? "Provincia"}</Label>
                      <Input
                        id="provincia"
                        value={newNegocio.provincia}
                        onChange={(e) => setNewNegocio({ ...newNegocio, provincia: e.target.value })}
                        placeholder={sp?.ejemploEstado ? `Ej: ${sp.ejemploEstado}` : "Ej: Distrito Nacional"}
                        data-testid="input-new-negocio-provincia"
                      />
                    </div>
                    {isUS && (
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="codigoPostal">{sp?.etiquetaCodigoPostal ?? "ZIP Code"}</Label>
                        <Input
                          id="codigoPostal"
                          value={newNegocio.codigoPostal}
                          onChange={(e) => setNewNegocio({ ...newNegocio, codigoPostal: e.target.value })}
                          placeholder={sp?.ejemploCodigoPostal ? `Ej: ${sp.ejemploCodigoPostal}` : "Ej: 10001"}
                          data-testid="input-new-negocio-codigo-postal"
                        />
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="col-span-2 space-y-2">
                <Label htmlFor="impuesto" className="flex items-center gap-1">
                  <Percent className="w-3 h-3" />
                  Impuesto (%)
                </Label>
                <Input
                  id="impuesto"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={newNegocio.impuesto}
                  onChange={(e) => setNewNegocio({ ...newNegocio, impuesto: e.target.value })}
                  placeholder="0"
                  data-testid="input-new-negocio-impuesto"
                />
                <p className="text-xs text-slate-500">Déjalo en 0 si no aplica impuesto</p>
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="planId" className="flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Plan de Suscripción
                </Label>
                <select
                  id="planId"
                  value={newNegocio.planId}
                  onChange={(e) => setNewNegocio({ ...newNegocio, planId: parseInt(e.target.value) })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  data-testid="select-new-negocio-plan"
                >
                  {planes?.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.nombre} - {parseFloat(plan.precioMensual) === 0 ? "Gratis" : `RD$${parseFloat(plan.precioMensual).toLocaleString()}/mes`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diaCorte">Día de Corte (1-28)</Label>
                <Input
                  id="diaCorte"
                  type="number"
                  min="1"
                  max="28"
                  value={newNegocio.diaCorte}
                  onChange={(e) => setNewNegocio({ ...newNegocio, diaCorte: parseInt(e.target.value) || 28 })}
                  data-testid="input-new-negocio-diacorte"
                />
                <p className="text-xs text-slate-500">Día del mes que vence el plan</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diasGracia">Días de Gracia</Label>
                <Input
                  id="diasGracia"
                  type="number"
                  min="0"
                  max="15"
                  value={newNegocio.diasGracia}
                  onChange={(e) => setNewNegocio({ ...newNegocio, diasGracia: parseInt(e.target.value) || 6 })}
                  data-testid="input-new-negocio-diasgracia"
                />
                <p className="text-xs text-slate-500">Días para renovar después del vencimiento</p>
              </div>
              {paises.length > 0 && (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="new-paisId" className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    País
                  </Label>
                  <select
                    id="new-paisId"
                    value={newNegocio.paisId ?? ""}
                    onChange={(e) => {
                      const selectedPaisId = e.target.value ? parseInt(e.target.value) : null;
                      const selectedPaisData = selectedPaisId ? paises.find(p => p.id === selectedPaisId) : null;
                      setNewNegocio({
                        ...newNegocio,
                        paisId: selectedPaisId,
                        whatsappNumero: selectedPaisData && !newNegocio.whatsappNumero ? getDisplayPrefix(selectedPaisData) : newNegocio.whatsappNumero,
                      });
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="select-new-negocio-pais"
                  >
                    <option value="">República Dominicana (predeterminado)</option>
                    {paises.filter(p => p.activo && p.codigo !== "DO").map((p) => (
                      <option key={p.id} value={p.id}>{p.bandera} {p.nombre} ({getDisplayPrefix(p)})</option>
                    ))}
                  </select>
                  {(() => {
                    const selectedPaisData = newNegocio.paisId ? paises.find(p => p.id === newNegocio.paisId) : paises.find(p => p.codigo === "DO");
                    return selectedPaisData ? (
                      <p className="text-xs text-slate-500 mt-1">
                        Moneda: <span className="font-medium">{selectedPaisData.moneda}</span> ({selectedPaisData.simboloMoneda}) · Prefijo: {getDisplayPrefix(selectedPaisData)}{selectedPaisData.codigo === "DO" ? " (809/829/849)" : ""}
                      </p>
                    ) : null;
                  })()}
                </div>
              )}
              <div className="col-span-2 space-y-2">
                <Label htmlFor="logo" className="flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  Logo del Negocio
                </Label>
                <div className="flex items-center gap-4">
                  {createLogoPreview && (
                    <img 
                      src={createLogoPreview} 
                      alt="Logo preview" 
                      className="w-16 h-16 object-contain rounded-lg border bg-white" 
                    />
                  )}
                  <div className="flex-1">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleCreateLogoChange}
                      className="cursor-pointer"
                      data-testid="input-new-negocio-logo"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Opcional. La imagen se ajustará a 512x512 px
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewNegocio({ nombre: "", whatsappNumero: "", direccion: "", ciudad: "", provincia: "", codigoPostal: "", tipoNegocio: "colmado", impuesto: "0", planId: 1, diaCorte: 28, diasGracia: 6, paisId: null });
                  setCreateLogoFile(null);
                  setCreateLogoPreview(null);
                }}
                data-testid="button-cancel-create"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createNegocioMutation.isPending || !newNegocio.nombre || !newNegocio.whatsappNumero || !newNegocio.direccion}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-submit-create"
              >
                {createNegocioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear Negocio
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditNegocio(null); setLogoFile(null); setLogoPreview(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Negocio
            </DialogTitle>
          </DialogHeader>
          {editNegocio && (
            <form onSubmit={(e) => { e.preventDefault(); updateNegocioMutation.mutate(editNegocio); }} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-tipoNegocio">Tipo de Negocio</Label>
                  <select
                    id="edit-tipoNegocio"
                    value={editNegocio.tipoNegocio}
                    onChange={(e) => setEditNegocio({ ...editNegocio, tipoNegocio: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                    data-testid="select-edit-negocio-tipo"
                  >
                    {tiposNegocioCatalogo && tiposNegocioCatalogo.length > 0 
                      ? tiposNegocioCatalogo.map((tipo) => (
                          <option key={tipo.slug} value={tipo.slug}>{tipo.nombre}</option>
                        ))
                      : tiposNegocioLocal.map((tipo) => (
                          <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                        ))
                    }
                  </select>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-nombre">Nombre del Negocio</Label>
                  <Input
                    id="edit-nombre"
                    value={editNegocio.nombre}
                    onChange={(e) => setEditNegocio({ ...editNegocio, nombre: e.target.value })}
                    placeholder="Ej: Mi Restaurante"
                    required
                    data-testid="input-edit-negocio-nombre"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-whatsappNumero">Número WhatsApp</Label>
                  <Input
                    id="edit-whatsappNumero"
                    value={editNegocio.whatsappNumero}
                    onChange={(e) => setEditNegocio({ ...editNegocio, whatsappNumero: e.target.value })}
                    placeholder={whatsappPlaceholder(
                      editNegocio.paisId
                        ? paises.find((p) => p.id === editNegocio.paisId)
                        : paises.find((p) => p.codigo === "DO")
                    )}
                    required
                    data-testid="input-edit-negocio-whatsapp"
                  />
                </div>
                {(() => {
                  const sp = (paises || []).find((p) => p.id === editNegocio.paisId)
                    ?? (paises || []).find((p) => p.codigo === "DO");
                  const isUS = sp?.requiereCodigoPostal ?? false;
                  return (
                    <>
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="edit-direccion">{isUS ? "Street Address" : "Dirección"}</Label>
                        <Input
                          id="edit-direccion"
                          value={editNegocio.direccion}
                          onChange={(e) => setEditNegocio({ ...editNegocio, direccion: e.target.value })}
                          placeholder={sp?.ejemploDireccion ? `Ej: ${sp.ejemploDireccion}` : "Ej: Calle Principal #123"}
                          required
                          data-testid="input-edit-negocio-direccion"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-ciudad">{isUS ? "City" : "Ciudad"}</Label>
                        <Input
                          id="edit-ciudad"
                          value={editNegocio.ciudad}
                          onChange={(e) => setEditNegocio({ ...editNegocio, ciudad: e.target.value })}
                          placeholder={sp?.ejemploCiudad ? `Ej: ${sp.ejemploCiudad}` : "Ej: Santo Domingo"}
                          data-testid="input-edit-negocio-ciudad"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-provincia">{sp?.etiquetaEstado ?? "Provincia"}</Label>
                        <Input
                          id="edit-provincia"
                          value={editNegocio.provincia}
                          onChange={(e) => setEditNegocio({ ...editNegocio, provincia: e.target.value })}
                          placeholder={sp?.ejemploEstado ? `Ej: ${sp.ejemploEstado}` : "Ej: Distrito Nacional"}
                          data-testid="input-edit-negocio-provincia"
                        />
                      </div>
                      {isUS && (
                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="edit-codigoPostal">{sp?.etiquetaCodigoPostal ?? "ZIP Code"}</Label>
                          <Input
                            id="edit-codigoPostal"
                            value={editNegocio.codigoPostal ?? ""}
                            onChange={(e) => setEditNegocio({ ...editNegocio, codigoPostal: e.target.value })}
                            placeholder={sp?.ejemploCodigoPostal ? `Ej: ${sp.ejemploCodigoPostal}` : "Ej: 10001"}
                            data-testid="input-edit-negocio-codigo-postal"
                          />
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-impuesto" className="flex items-center gap-1">
                    <Percent className="w-3 h-3" />
                    Impuesto (%)
                  </Label>
                  <Input
                    id="edit-impuesto"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editNegocio.impuesto}
                    onChange={(e) => setEditNegocio({ ...editNegocio, impuesto: e.target.value })}
                    placeholder="0"
                    data-testid="input-edit-negocio-impuesto"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-planId" className="flex items-center gap-1">
                    <Crown className="w-3 h-3" />
                    Plan de Suscripción
                  </Label>
                  <select
                    id="edit-planId"
                    value={editNegocio.planId}
                    onChange={(e) => setEditNegocio({ ...editNegocio, planId: parseInt(e.target.value) })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                    data-testid="select-edit-negocio-plan"
                  >
                    {planes?.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.nombre} - {parseFloat(plan.precioMensual) === 0 ? "Gratis" : `RD$${parseFloat(plan.precioMensual).toLocaleString()}/mes`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-diaCorte">Día de Corte (1-28)</Label>
                  <Input
                    id="edit-diaCorte"
                    type="number"
                    min="1"
                    max="28"
                    value={editNegocio.diaCorte}
                    onChange={(e) => setEditNegocio({ ...editNegocio, diaCorte: parseInt(e.target.value) || 28 })}
                    data-testid="input-edit-negocio-diacorte"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-diasGracia">Días de Gracia</Label>
                  <Input
                    id="edit-diasGracia"
                    type="number"
                    min="0"
                    max="15"
                    value={editNegocio.diasGracia}
                    onChange={(e) => setEditNegocio({ ...editNegocio, diasGracia: parseInt(e.target.value) || 6 })}
                    data-testid="input-edit-negocio-diasgracia"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-fechaVencimiento">Fecha de Vencimiento</Label>
                  <Input
                    id="edit-fechaVencimiento"
                    type="date"
                    value={editNegocio.fechaVencimiento || ""}
                    onChange={(e) => setEditNegocio({ ...editNegocio, fechaVencimiento: e.target.value || null })}
                    data-testid="input-edit-negocio-fechavencimiento"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-estadoSuscripcion">Estado Suscripción</Label>
                  <select
                    id="edit-estadoSuscripcion"
                    value={editNegocio.estadoSuscripcion}
                    onChange={(e) => setEditNegocio({ ...editNegocio, estadoSuscripcion: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="select-edit-negocio-estado-suscripcion"
                  >
                    <option value="activa">Activa</option>
                    <option value="en_gracia">En Gracia</option>
                    <option value="suspendida">Suspendida</option>
                  </select>
                </div>
                {paises.length > 0 && (
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="edit-paisId" className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      País
                    </Label>
                    <select
                      id="edit-paisId"
                      value={editNegocio.paisId ?? ""}
                      onChange={(e) => {
                        const selectedPaisId = e.target.value ? parseInt(e.target.value) : null;
                        const selectedPaisData = selectedPaisId ? paises.find(p => p.id === selectedPaisId) : null;
                        setEditNegocio({
                          ...editNegocio,
                          paisId: selectedPaisId,
                          whatsappNumero: selectedPaisData && !editNegocio.whatsappNumero ? getDisplayPrefix(selectedPaisData) : editNegocio.whatsappNumero,
                        });
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="select-edit-negocio-pais"
                    >
                      <option value="">República Dominicana (predeterminado)</option>
                      {paises.filter(p => p.activo && p.codigo !== "DO").map((p) => (
                        <option key={p.id} value={p.id}>{p.bandera} {p.nombre} ({getDisplayPrefix(p)})</option>
                      ))}
                    </select>
                    {(() => {
                      const selectedPaisData = editNegocio.paisId ? paises.find(p => p.id === editNegocio.paisId) : paises.find(p => p.codigo === "DO");
                      return selectedPaisData ? (
                        <p className="text-xs text-slate-500 mt-1">
                          Moneda: <span className="font-medium">{selectedPaisData.moneda}</span> ({selectedPaisData.simboloMoneda}) · Prefijo: {getDisplayPrefix(selectedPaisData)}{selectedPaisData.codigo === "DO" ? " (809/829/849)" : ""}
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-logo">Logo</Label>
                  <div className="flex items-center gap-4">
                    {(logoPreview || editNegocio.logo) && (
                      <img 
                        src={logoPreview || editNegocio.logo} 
                        alt="Logo preview" 
                        className="w-16 h-16 object-contain rounded-lg border bg-white" 
                      />
                    )}
                    <div className="flex-1">
                      <Input
                        id="edit-logo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleLogoFileChange}
                        className="cursor-pointer"
                        data-testid="input-edit-negocio-logo"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        La imagen se ajustará automáticamente a 512x512 px
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowEditDialog(false); setEditNegocio(null); setLogoFile(null); setLogoPreview(null); }}
                  data-testid="button-cancel-edit"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateNegocioMutation.isPending || !editNegocio.nombre || !editNegocio.whatsappNumero || !editNegocio.direccion}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-submit-edit"
                >
                  {updateNegocioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showWhatsAppDialog} onOpenChange={(open) => { if (!open) { setShowWhatsAppDialog(false); setSelectedNegocio(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              Evolution API - {selectedNegocio?.nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="evolutionApiUrl">URL del Servidor Evolution API</Label>
              <Input
                id="evolutionApiUrl"
                value={evolutionApiUrl}
                onChange={(e) => setEvolutionApiUrl(e.target.value)}
                placeholder="https://tu-evolution-api.com"
                data-testid="input-evolution-api-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evolutionApiKey">API Key</Label>
              <Input
                id="evolutionApiKey"
                type="password"
                value={evolutionApiKey}
                onChange={(e) => setEvolutionApiKey(e.target.value)}
                placeholder="Clave API de Evolution"
                data-testid="input-evolution-api-key"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evolutionInstanceName">Nombre de Instancia</Label>
              <Input
                id="evolutionInstanceName"
                value={evolutionInstanceName}
                onChange={(e) => setEvolutionInstanceName(e.target.value)}
                placeholder="mi-negocio"
                data-testid="input-evolution-instance-name"
              />
              <p className="text-xs text-slate-500">
                Nombre unico de la instancia en Evolution API para este negocio
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => { setShowWhatsAppDialog(false); setSelectedNegocio(null); }}
                data-testid="button-cancel-whatsapp"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => selectedNegocio && saveWhatsAppConfig.mutate({
                  colmadoId: selectedNegocio.id,
                  evolutionApiUrl,
                  evolutionApiKey,
                  evolutionInstanceName,
                })}
                disabled={saveWhatsAppConfig.isPending || !evolutionApiUrl || !evolutionApiKey || !evolutionInstanceName}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-save-whatsapp"
              >
                {saveWhatsAppConfig.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateUserDialog} onOpenChange={(open) => { if (!open) { setShowCreateUserDialog(false); setNewUser({ email: "", password: "", firstName: "", colmadoId: 0 }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Crear Usuario para Negocio
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createUserMutation.mutate(newUser); }} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-firstName">Nombre</Label>
              <Input
                id="user-firstName"
                value={newUser.firstName}
                onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value.toLowerCase() })}
                placeholder="Nombre del usuario"
                required
                data-testid="input-user-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email / Usuario</Label>
              <Input
                id="user-email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value.toLowerCase() })}
                placeholder="usuario@email.com"
                required
                data-testid="input-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-password">Contraseña</Label>
              <Input
                id="user-password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Contraseña segura"
                required
                data-testid="input-user-password"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreateUserDialog(false); setNewUser({ email: "", password: "", firstName: "", colmadoId: 0 }); }}
                data-testid="button-cancel-create-user"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending || !newUser.email || !newUser.password || !newUser.firstName}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-submit-create-user"
              >
                {createUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear Usuario
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditUserDialog} onOpenChange={(open) => { if (!open) { setShowEditUserDialog(false); setEditingUser(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Usuario
            </DialogTitle>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={(e) => { 
              e.preventDefault(); 
              updateUserMutation.mutate({
                userId: editingUser.id,
                email: editUserData.email || undefined,
                password: editUserData.password || undefined,
                firstName: editUserData.firstName || undefined,
                lastName: editUserData.lastName || undefined,
              }); 
            }} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-user-firstName">Nombre</Label>
                <Input
                  id="edit-user-firstName"
                  value={editUserData.firstName}
                  onChange={(e) => setEditUserData({ ...editUserData, firstName: e.target.value })}
                  placeholder="Nombre"
                  data-testid="input-edit-user-firstname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-lastName">Apellido</Label>
                <Input
                  id="edit-user-lastName"
                  value={editUserData.lastName}
                  onChange={(e) => setEditUserData({ ...editUserData, lastName: e.target.value })}
                  placeholder="Apellido"
                  data-testid="input-edit-user-lastname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-email">Email</Label>
                <Input
                  id="edit-user-email"
                  value={editUserData.email}
                  onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                  placeholder="Email"
                  data-testid="input-edit-user-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-user-password">Nueva Contraseña (opcional)</Label>
                <Input
                  id="edit-user-password"
                  type="password"
                  value={editUserData.password}
                  onChange={(e) => setEditUserData({ ...editUserData, password: e.target.value })}
                  placeholder="Dejar vacío para no cambiar"
                  data-testid="input-edit-user-password"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowEditUserDialog(false); setEditingUser(null); }}
                  data-testid="button-cancel-edit-user"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-submit-edit-user"
                >
                  {updateUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm !== null} onOpenChange={(open) => { if (!open) setShowDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Negocio</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">¿Estás seguro de que deseas eliminar este negocio? Se eliminarán también todos los datos asociados (pedidos, deliveries, etc.).</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(null)} data-testid="button-cancel-delete">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteConfirm && deleteNegocioMutation.mutate(showDeleteConfirm)}
              disabled={deleteNegocioMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteNegocioMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteUserConfirm !== null} onOpenChange={(open) => { if (!open) setShowDeleteUserConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Usuario</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">¿Estás seguro de que deseas eliminar este usuario?</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteUserConfirm(null)} data-testid="button-cancel-delete-user">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteUserConfirm && deleteUserMutation.mutate(showDeleteUserConfirm)}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateJergaDialog} onOpenChange={(open) => { if (!open) { setShowCreateJergaDialog(false); setNewJerga({ tipoNegocio: "colmado", jerga: "", productoIdentificado: "", precioSugerido: "", descripcion: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              Nueva Plantilla de Jerga
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createJergaMutation.mutate(newJerga); }} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="jerga-tipoNegocio">Tipo de Negocio</Label>
              <select
                id="jerga-tipoNegocio"
                value={newJerga.tipoNegocio}
                onChange={(e) => setNewJerga({ ...newJerga, tipoNegocio: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
                data-testid="select-jerga-tipo"
              >
                {tiposNegocioCatalogo && tiposNegocioCatalogo.filter(t => t.activo).length > 0 
                  ? tiposNegocioCatalogo.filter(t => t.activo).map((tipo) => (
                      <option key={tipo.slug} value={tipo.slug}>{tipo.nombre}</option>
                    ))
                  : tiposNegocioLocal.map((tipo) => (
                      <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                    ))
                }
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jerga-jerga">Jerga</Label>
              <Input
                id="jerga-jerga"
                value={newJerga.jerga}
                onChange={(e) => setNewJerga({ ...newJerga, jerga: e.target.value })}
                placeholder="Ej: brugal, una fría, morir soñando"
                required
                data-testid="input-jerga-jerga"
              />
              <p className="text-xs text-slate-500">Palabra o frase coloquial que usan los clientes</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jerga-producto">Producto Identificado</Label>
              <Input
                id="jerga-producto"
                value={newJerga.productoIdentificado}
                onChange={(e) => setNewJerga({ ...newJerga, productoIdentificado: e.target.value })}
                placeholder="Ej: Ron Brugal, Cerveza fría, Jugo de naranja con leche"
                required
                data-testid="input-jerga-producto"
              />
              <p className="text-xs text-slate-500">Producto real que representa la jerga</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="jerga-precio">Precio Sugerido (opcional)</Label>
              <Input
                id="jerga-precio"
                type="number"
                step="0.01"
                min="0"
                value={newJerga.precioSugerido}
                onChange={(e) => setNewJerga({ ...newJerga, precioSugerido: e.target.value })}
                placeholder="Ej: 150.00"
                data-testid="input-jerga-precio"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jerga-descripcion">Descripción (opcional)</Label>
              <Textarea
                id="jerga-descripcion"
                value={newJerga.descripcion}
                onChange={(e) => setNewJerga({ ...newJerga, descripcion: e.target.value })}
                placeholder="Contexto adicional sobre cuándo se usa esta jerga"
                rows={2}
                data-testid="input-jerga-descripcion"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreateJergaDialog(false); setNewJerga({ tipoNegocio: "colmado", jerga: "", productoIdentificado: "", precioSugerido: "", descripcion: "" }); }}
                data-testid="button-cancel-create-jerga"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createJergaMutation.isPending || !newJerga.jerga || !newJerga.productoIdentificado}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-submit-create-jerga"
              >
                {createJergaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear Jerga
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditJergaDialog} onOpenChange={(open) => { if (!open) { setShowEditJergaDialog(false); setEditJerga(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Plantilla de Jerga
            </DialogTitle>
          </DialogHeader>
          {editJerga && (
            <form onSubmit={(e) => { e.preventDefault(); updateJergaMutation.mutate(editJerga); }} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-jerga-tipoNegocio">Tipo de Negocio</Label>
                <select
                  id="edit-jerga-tipoNegocio"
                  value={editJerga.tipoNegocio}
                  onChange={(e) => setEditJerga({ ...editJerga, tipoNegocio: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  data-testid="select-edit-jerga-tipo"
                >
                  {tiposNegocioCatalogo && tiposNegocioCatalogo.length > 0 
                    ? tiposNegocioCatalogo.map((tipo) => (
                        <option key={tipo.slug} value={tipo.slug}>{tipo.nombre}</option>
                      ))
                    : tiposNegocioLocal.map((tipo) => (
                        <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                      ))
                  }
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-jerga-jerga">Jerga</Label>
                <Input
                  id="edit-jerga-jerga"
                  value={editJerga.jerga}
                  onChange={(e) => setEditJerga({ ...editJerga, jerga: e.target.value })}
                  placeholder="Ej: brugal, una fría"
                  required
                  data-testid="input-edit-jerga-jerga"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-jerga-producto">Producto Identificado</Label>
                <Input
                  id="edit-jerga-producto"
                  value={editJerga.productoIdentificado}
                  onChange={(e) => setEditJerga({ ...editJerga, productoIdentificado: e.target.value })}
                  placeholder="Ej: Ron Brugal"
                  required
                  data-testid="input-edit-jerga-producto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-jerga-precio">Precio Sugerido (opcional)</Label>
                <Input
                  id="edit-jerga-precio"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editJerga.precioSugerido || ""}
                  onChange={(e) => setEditJerga({ ...editJerga, precioSugerido: e.target.value || null })}
                  placeholder="Ej: 150.00"
                  data-testid="input-edit-jerga-precio"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-jerga-descripcion">Descripción (opcional)</Label>
                <Textarea
                  id="edit-jerga-descripcion"
                  value={editJerga.descripcion || ""}
                  onChange={(e) => setEditJerga({ ...editJerga, descripcion: e.target.value || null })}
                  placeholder="Contexto adicional"
                  rows={2}
                  data-testid="input-edit-jerga-descripcion"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowEditJergaDialog(false); setEditJerga(null); }}
                  data-testid="button-cancel-edit-jerga"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateJergaMutation.isPending || !editJerga.jerga || !editJerga.productoIdentificado}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-submit-edit-jerga"
                >
                  {updateJergaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteJergaConfirm !== null} onOpenChange={(open) => { if (!open) setShowDeleteJergaConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Plantilla de Jerga</DialogTitle>
          </DialogHeader>
          <p className="text-slate-600">¿Estás seguro de que deseas eliminar esta plantilla de jerga? Esta acción no se puede deshacer.</p>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteJergaConfirm(null)} data-testid="button-cancel-delete-jerga">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteJergaConfirm && deleteJergaMutation.mutate(showDeleteJergaConfirm)}
              disabled={deleteJergaMutation.isPending}
              data-testid="button-confirm-delete-jerga"
            >
              {deleteJergaMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
