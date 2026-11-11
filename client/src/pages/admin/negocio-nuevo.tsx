import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Store,
  Crown,
  Percent,
  Image,
  Loader2,
  Save,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { usePaises, getDisplayPrefix, getPhoneExample } from "@/hooks/use-paises";

type Plan = {
  id: number;
  nombre: string;
  precioMensual: string;
};

type TipoNegocio = {
  id: number;
  slug: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

export default function NegocioNuevoPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: paises } = usePaises();

  const [formData, setFormData] = useState({
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

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { data: planes } = useQuery<Plan[]>({
    queryKey: ["planes"],
    queryFn: async () => {
      const res = await fetch("/api/planes");
      if (!res.ok) throw new Error("Error al cargar planes");
      return res.json();
    },
  });

  const { data: tiposNegocio } = useQuery<TipoNegocio[]>({
    queryKey: ["tipos-negocio"],
    queryFn: async () => {
      const res = await fetch("/api/tipos-negocio?activos=true");
      if (!res.ok) throw new Error("Error al cargar tipos de negocio");
      return res.json();
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const bodyData = {
        nombre: data.nombre,
        whatsappNumero: data.whatsappNumero,
        direccion: data.direccion,
        ciudad: data.ciudad || "",
        provincia: data.provincia || "",
        codigoPostal: data.codigoPostal || null,
        tipoNegocio: data.tipoNegocio,
        impuesto: data.impuesto,
        planId: data.planId,
        diaCorte: data.diaCorte,
        diasGracia: data.diasGracia,
        paisId: data.paisId ?? null,
      };

      const res = await fetch("/api/colmados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al crear negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      toast({
        title: "Negocio creado",
        description: "El negocio se ha creado correctamente.",
      });
      navigate("/admin/platform");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const isFormValid = formData.nombre && formData.whatsappNumero && formData.direccion;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/platform")}
            data-testid="button-volver"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Store className="w-5 h-5 text-emerald-600" />
              Crear Nuevo Negocio
            </h1>
          </div>
        </div>
      </header>

      <main className="p-4 pb-20">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tipoNegocio">Tipo de Negocio</Label>
                <select
                  id="tipoNegocio"
                  value={formData.tipoNegocio}
                  onChange={(e) => setFormData({ ...formData, tipoNegocio: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                  data-testid="select-tipo-negocio"
                >
                  {tiposNegocio?.map((tipo) => (
                    <option key={tipo.slug} value={tipo.slug}>{tipo.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre del Negocio *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Mi Restaurante"
                  required
                  data-testid="input-nombre"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paisId" className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  País
                </Label>
                <select
                  id="paisId"
                  value={formData.paisId ?? ""}
                  onChange={(e) =>
                    setFormData({ ...formData, paisId: e.target.value ? parseInt(e.target.value) : null })
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-pais"
                >
                  <option value="">República Dominicana (predeterminado)</option>
                  {(paises || [])
                    .filter((p) => p.activo && p.codigo !== "DO")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.bandera} {p.nombre} ({getDisplayPrefix(p)})
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsappNumero">Número WhatsApp *</Label>
                <Input
                  id="whatsappNumero"
                  value={formData.whatsappNumero}
                  onChange={(e) => setFormData({ ...formData, whatsappNumero: e.target.value })}
                  placeholder={(() => {
                    const selPais = formData.paisId
                      ? (paises || []).find((p) => p.id === formData.paisId)
                      : (paises || []).find((p) => p.codigo === "DO");
                    if (!selPais) return "Ej: +18091234567";
                    return `Ej: ${getDisplayPrefix(selPais)}${getPhoneExample(selPais.codigo)}`;
                  })()}
                  required
                  data-testid="input-whatsapp"
                />
              </div>

              {(() => {
                const sp = (paises || []).find((p) => p.id === formData.paisId)
                  ?? (paises || []).find((p) => p.codigo === "DO");
                const isUS = sp?.requiereCodigoPostal ?? false;
                return (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="direccion">{isUS ? "Street Address" : "Dirección"} *</Label>
                      <Input
                        id="direccion"
                        value={formData.direccion}
                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                        placeholder={sp?.ejemploDireccion ? `Ej: ${sp.ejemploDireccion}` : "Ej: Calle Principal #123"}
                        required
                        data-testid="input-direccion"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ciudad">{isUS ? "City" : "Ciudad"}</Label>
                        <Input
                          id="ciudad"
                          value={formData.ciudad}
                          onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                          placeholder={sp?.ejemploCiudad ? `Ej: ${sp.ejemploCiudad}` : "Ej: Santo Domingo"}
                          data-testid="input-ciudad"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="provincia">{sp?.etiquetaEstado ?? "Provincia"}</Label>
                        <Input
                          id="provincia"
                          value={formData.provincia}
                          onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
                          placeholder={sp?.ejemploEstado ? `Ej: ${sp.ejemploEstado}` : "Ej: Distrito Nacional"}
                          data-testid="input-provincia"
                        />
                      </div>
                    </div>
                    {isUS && (
                      <div className="space-y-2">
                        <Label htmlFor="codigoPostal">{sp?.etiquetaCodigoPostal ?? "ZIP Code"}</Label>
                        <Input
                          id="codigoPostal"
                          value={formData.codigoPostal}
                          onChange={(e) => setFormData({ ...formData, codigoPostal: e.target.value })}
                          placeholder={sp?.ejemploCodigoPostal ? `Ej: ${sp.ejemploCodigoPostal}` : "Ej: 10001"}
                          data-testid="input-codigo-postal"
                        />
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="space-y-2">
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
                  value={formData.impuesto}
                  onChange={(e) => setFormData({ ...formData, impuesto: e.target.value })}
                  placeholder="0"
                  data-testid="input-impuesto"
                />
                <p className="text-xs text-gray-500">Déjalo en 0 si no aplica impuesto</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo" className="flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  Logo del Negocio
                </Label>
                <div className="flex items-center gap-4">
                  {logoPreview && (
                    <img 
                      src={logoPreview} 
                      alt="Logo preview" 
                      className="w-16 h-16 object-contain rounded-lg border bg-white" 
                    />
                  )}
                  <div className="flex-1">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleLogoChange}
                      className="cursor-pointer"
                      data-testid="input-logo"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Opcional. La imagen se ajustará a 512x512 px
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-500" />
                Plan y Suscripción
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planId">Plan de Suscripción</Label>
                <select
                  id="planId"
                  value={formData.planId}
                  onChange={(e) => setFormData({ ...formData, planId: parseInt(e.target.value) })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                  data-testid="select-plan"
                >
                  {planes?.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.nombre} - {parseFloat(plan.precioMensual) === 0 ? "Gratis" : `RD$${parseFloat(plan.precioMensual).toLocaleString()}/mes`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="diaCorte">Día de Corte (1-28)</Label>
                  <Input
                    id="diaCorte"
                    type="number"
                    min="1"
                    max="28"
                    value={formData.diaCorte}
                    onChange={(e) => setFormData({ ...formData, diaCorte: parseInt(e.target.value) || 28 })}
                    data-testid="input-dia-corte"
                  />
                  <p className="text-xs text-gray-500">Día del mes que vence el plan</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diasGracia">Días de Gracia</Label>
                  <Input
                    id="diasGracia"
                    type="number"
                    min="0"
                    max="15"
                    value={formData.diasGracia}
                    onChange={(e) => setFormData({ ...formData, diasGracia: parseInt(e.target.value) || 6 })}
                    data-testid="input-dias-gracia"
                  />
                  <p className="text-xs text-gray-500">Días para renovar después del vencimiento</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3 z-40 shadow-lg">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/platform")}
            className="flex-1 sm:flex-none"
            data-testid="button-cancelar"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={createMutation.isPending || !isFormValid}
            onClick={handleSubmit}
            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-crear"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Crear Negocio
          </Button>
        </div>
      </div>
    </div>
  );
}
