import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Store,
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

type Negocio = {
  id: number;
  nombre: string;
  whatsappNumero: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  tipoNegocio: string;
  impuesto: string;
  logo: string | null;
  planId: number;
  diaCorte: number;
  diasGracia: number;
  fechaVencimiento: string | null;
  estadoSuscripcion: string;
  paisId: number | null;
  codigoPostal: string | null;
};

type TipoNegocio = {
  id: number;
  slug: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

export default function NegocioEditarPage() {
  const params = useParams();
  const negocioId = params.id ? parseInt(params.id) : null;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: paises } = usePaises();

  const [formData, setFormData] = useState<Negocio | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { data: negocio, isLoading } = useQuery<Negocio>({
    queryKey: ["negocio", negocioId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${negocioId}`);
      if (!res.ok) throw new Error("Error al cargar negocio");
      return res.json();
    },
    enabled: !!negocioId,
  });

  const { data: tiposNegocio } = useQuery<TipoNegocio[]>({
    queryKey: ["tipos-negocio"],
    queryFn: async () => {
      const res = await fetch("/api/tipos-negocio?activos=true");
      if (!res.ok) throw new Error("Error al cargar tipos de negocio");
      return res.json();
    },
  });

  useEffect(() => {
    if (negocio) {
      setFormData({
        ...negocio,
        ciudad: negocio.ciudad || "",
        provincia: negocio.provincia || "",
        impuesto: negocio.impuesto || "0",
        diaCorte: negocio.diaCorte || 28,
        diasGracia: negocio.diasGracia || 6,
        estadoSuscripcion: negocio.estadoSuscripcion || "activa",
        paisId: negocio.paisId ?? null,
        codigoPostal: negocio.codigoPostal ?? null,
      });
    }
  }, [negocio]);

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

  const updateMutation = useMutation({
    mutationFn: async (data: Negocio) => {
      const bodyData: Record<string, any> = {
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
        estadoSuscripcion: data.estadoSuscripcion,
        paisId: data.paisId ?? null,
      };
      
      if (data.fechaVencimiento) {
        bodyData.fechaVencimiento = data.fechaVencimiento;
      }

      const res = await fetch(`/api/colmados/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Error al actualizar negocio");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-colmados"] });
      queryClient.invalidateQueries({ queryKey: ["negocio", negocioId] });
      toast({
        title: "Negocio actualizado",
        description: "Los cambios se han guardado correctamente.",
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
    if (formData) {
      updateMutation.mutate(formData);
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

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
              <Store className="w-5 h-5 text-blue-600" />
              Editar Negocio
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
                          value={formData.codigoPostal ?? ""}
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo" className="flex items-center gap-1">
                  <Image className="w-3 h-3" />
                  Logo del Negocio
                </Label>
                <div className="flex items-center gap-4">
                  {(logoPreview || formData.logo) && (
                    <img 
                      src={logoPreview || formData.logo || ""} 
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
                      La imagen se ajustará automáticamente a 512x512 px
                    </p>
                  </div>
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
            disabled={updateMutation.isPending || !isFormValid}
            onClick={handleSubmit}
            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
            data-testid="button-guardar"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Guardar Cambios
          </Button>
        </div>
      </div>
    </div>
  );
}
