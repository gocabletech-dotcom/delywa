import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  Crown,
  Zap,
  Check,
  Users,
  ShoppingBag,
  Loader2,
  Building2,
  LogOut,
  Store,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { Plan, InsertPlan } from "@shared/schema";

export default function PlansAdminPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<InsertPlan>>({
    nombre: "",
    slug: "",
    precioMensual: "0",
    duracionDias: 30,
    esTrial: false,
    descripcionCorta: "",
    caracteristicas: [],
    limiteDeliveries: null,
    limitePedidosDiarios: null,
    soportePrioritario: false,
    activo: true,
    orden: 0,
  });
  const [caracteristicasText, setCaracteristicasText] = useState("");

  const { data: planes = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/planes"],
    queryFn: async () => {
      const res = await fetch("/api/planes");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertPlan) => {
      const res = await fetch("/api/planes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planes"] });
      toast({ title: "Plan creado exitosamente" });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error al crear plan", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertPlan> }) => {
      const res = await fetch(`/api/planes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al actualizar plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planes"] });
      toast({ title: "Plan actualizado exitosamente" });
      setEditingPlan(null);
      setIsEditOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error al actualizar plan", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/planes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar plan");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planes"] });
      toast({ title: "Plan eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar plan", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      nombre: "",
      slug: "",
      precioMensual: "0",
      duracionDias: 30,
      esTrial: false,
      descripcionCorta: "",
      caracteristicas: [],
      limiteDeliveries: null,
      limitePedidosDiarios: null,
      soportePrioritario: false,
      activo: true,
      orden: 0,
    });
    setCaracteristicasText("");
  };

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setIsEditOpen(true);
    setFormData({
      nombre: plan.nombre,
      slug: plan.slug,
      precioMensual: plan.precioMensual,
      duracionDias: plan.duracionDias,
      esTrial: plan.esTrial,
      descripcionCorta: plan.descripcionCorta || "",
      caracteristicas: plan.caracteristicas as string[],
      limiteDeliveries: plan.limiteDeliveries,
      limitePedidosDiarios: plan.limitePedidosDiarios,
      soportePrioritario: plan.soportePrioritario,
      activo: plan.activo,
      orden: plan.orden,
    });
    setCaracteristicasText((plan.caracteristicas as string[] || []).join("\n"));
  };

  const handleSubmit = () => {
    const caracteristicas = caracteristicasText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const data = {
      ...formData,
      caracteristicas,
    } as InsertPlan;

    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (num === 0) return "Gratis";
    return `RD$${num.toLocaleString()}`;
  };

  const getPlanIcon = (plan: Plan) => {
    if (plan.esTrial) return <Zap className="text-blue-500" size={20} />;
    if (plan.slug === "profesional") return <Crown className="text-amber-500" size={20} />;
    return <Check className="text-gray-500" size={20} />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" data-testid="plans-admin-page">
      <header className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-5 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/admin/platform")}
              className="text-white hover:bg-white/20"
              data-testid="button-back"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="p-1.5 md:p-2 bg-white/10 rounded-xl hidden sm:block">
              <Crown className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h1 className="text-lg md:text-2xl font-bold tracking-tight">Gestión de Planes</h1>
              <p className="text-xs md:text-sm text-emerald-100 hidden sm:block">Administra los planes de suscripción</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin/platform")}
              className="text-white hover:bg-white/20 text-xs md:text-sm px-2 md:px-3"
              data-testid="button-negocios"
            >
              <Store className="w-4 h-4 md:mr-2" />
              <span className="hidden md:inline">Negocios</span>
            </Button>
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

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div></div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-primary hover:bg-primary/90"
                onClick={() => {
                  resetForm();
                  setEditingPlan(null);
                }}
                data-testid="button-create-plan"
              >
                <Plus className="mr-2" size={18} />
                Nuevo Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Plan</DialogTitle>
              </DialogHeader>
              <PlanForm
                formData={formData}
                setFormData={setFormData}
                caracteristicasText={caracteristicasText}
                setCaracteristicasText={setCaracteristicasText}
                onSubmit={handleSubmit}
                isLoading={createMutation.isPending}
                submitText="Crear Plan"
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {planes.map((plan) => (
            <Card
              key={plan.id}
              className={`relative ${!plan.activo ? "opacity-60" : ""}`}
              data-testid={`card-admin-plan-${plan.id}`}
            >
              {!plan.activo && (
                <Badge variant="secondary" className="absolute top-2 right-2">
                  Inactivo
                </Badge>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {getPlanIcon(plan)}
                  <CardTitle className="text-lg">{plan.nombre}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-2xl font-bold">{formatPrice(plan.precioMensual)}</p>
                    <p className="text-sm text-gray-500">
                      {plan.esTrial ? `${plan.duracionDias} días gratis` : "por mes"}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <Users size={14} />
                      <span>
                        {plan.limiteDeliveries === null ? "∞" : plan.limiteDeliveries} deliveries
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ShoppingBag size={14} />
                      <span>
                        {plan.limitePedidosDiarios === null ? "∞" : plan.limitePedidosDiarios}{" "}
                        pedidos/día
                      </span>
                    </div>
                  </div>

                  {plan.soportePrioritario && (
                    <Badge variant="secondary" className="text-xs">
                      Soporte Prioritario
                    </Badge>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(plan)}
                      data-testid={`button-edit-plan-${plan.id}`}
                    >
                      <Edit size={14} className="mr-1" />
                      Editar
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(`¿Eliminar el plan "${plan.nombre}"?`)) {
                          deleteMutation.mutate(plan.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-plan-${plan.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Edit Plan Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Plan: {editingPlan?.nombre}</DialogTitle>
            </DialogHeader>
            <PlanForm
              formData={formData}
              setFormData={setFormData}
              caracteristicasText={caracteristicasText}
              setCaracteristicasText={setCaracteristicasText}
              onSubmit={handleSubmit}
              isLoading={updateMutation.isPending}
              submitText="Guardar Cambios"
            />
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function PlanForm({
  formData,
  setFormData,
  caracteristicasText,
  setCaracteristicasText,
  onSubmit,
  isLoading,
  submitText,
}: {
  formData: Partial<InsertPlan>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<InsertPlan>>>;
  caracteristicasText: string;
  setCaracteristicasText: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
  isLoading: boolean;
  submitText: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nombre</Label>
          <Input
            value={formData.nombre || ""}
            onChange={(e) => setFormData((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Básico"
            data-testid="input-plan-nombre"
          />
        </div>
        <div className="space-y-2">
          <Label>Slug (URL)</Label>
          <Input
            value={formData.slug || ""}
            onChange={(e) => setFormData((f) => ({ ...f, slug: e.target.value }))}
            placeholder="Ej: basico"
            data-testid="input-plan-slug"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Precio Mensual (RD$)</Label>
          <Input
            type="number"
            value={formData.precioMensual || "0"}
            onChange={(e) => setFormData((f) => ({ ...f, precioMensual: e.target.value }))}
            data-testid="input-plan-precio"
          />
        </div>
        <div className="space-y-2">
          <Label>Duración (días)</Label>
          <Input
            type="number"
            value={formData.duracionDias || 30}
            onChange={(e) =>
              setFormData((f) => ({ ...f, duracionDias: parseInt(e.target.value) || 30 }))
            }
            data-testid="input-plan-duracion"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descripción Corta</Label>
        <Input
          value={formData.descripcionCorta || ""}
          onChange={(e) => setFormData((f) => ({ ...f, descripcionCorta: e.target.value }))}
          placeholder="Ej: Para negocios pequeños"
          data-testid="input-plan-descripcion"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Límite Deliveries (vacío = ilimitado)</Label>
          <Input
            type="number"
            value={formData.limiteDeliveries ?? ""}
            onChange={(e) =>
              setFormData((f) => ({
                ...f,
                limiteDeliveries: e.target.value ? parseInt(e.target.value) : null,
              }))
            }
            placeholder="Ilimitado"
            data-testid="input-plan-limite-deliveries"
          />
        </div>
        <div className="space-y-2">
          <Label>Límite Pedidos/Día (vacío = ilimitado)</Label>
          <Input
            type="number"
            value={formData.limitePedidosDiarios ?? ""}
            onChange={(e) =>
              setFormData((f) => ({
                ...f,
                limitePedidosDiarios: e.target.value ? parseInt(e.target.value) : null,
              }))
            }
            placeholder="Ilimitado"
            data-testid="input-plan-limite-pedidos"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Características (una por línea)</Label>
        <Textarea
          value={caracteristicasText}
          onChange={(e) => setCaracteristicasText(e.target.value)}
          placeholder="Chat con clientes&#10;Reportes de ventas&#10;Soporte por WhatsApp"
          rows={5}
          data-testid="textarea-plan-caracteristicas"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.esTrial || false}
              onCheckedChange={(checked) => setFormData((f) => ({ ...f, esTrial: checked }))}
              data-testid="switch-plan-trial"
            />
            <Label>Es Trial</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.soportePrioritario || false}
              onCheckedChange={(checked) =>
                setFormData((f) => ({ ...f, soportePrioritario: checked }))
              }
              data-testid="switch-plan-soporte"
            />
            <Label>Soporte Prioritario</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.activo !== false}
              onCheckedChange={(checked) => setFormData((f) => ({ ...f, activo: checked }))}
              data-testid="switch-plan-activo"
            />
            <Label>Activo</Label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Orden de visualización</Label>
        <Input
          type="number"
          value={formData.orden || 0}
          onChange={(e) => setFormData((f) => ({ ...f, orden: parseInt(e.target.value) || 0 }))}
          data-testid="input-plan-orden"
        />
      </div>

      <Button
        className="w-full"
        onClick={onSubmit}
        disabled={isLoading || !formData.nombre || !formData.slug}
        data-testid="button-submit-plan"
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitText}
      </Button>
    </div>
  );
}
