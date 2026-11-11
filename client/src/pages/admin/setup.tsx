import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, Store, Truck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<"choice" | "colmado" | "delivery">("choice");
  const [colmadoForm, setColmadoForm] = useState({
    nombre: "",
    whatsappNumero: "",
    direccion: "",
  });
  const [deliveryForm, setDeliveryForm] = useState({
    whatsappNumero: "",
  });

  const registerColmadoMutation = useMutation({
    mutationFn: async (data: typeof colmadoForm) => {
      const res = await fetch("/api/user/register-colmado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Colmado registrado exitosamente" });
      setLocation("/admin/dashboard");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const registerDeliveryMutation = useMutation({
    mutationFn: async (data: typeof deliveryForm) => {
      const res = await fetch("/api/user/register-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Registrado como delivery" });
      setLocation("/admin/delivery-dashboard");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white mx-auto mb-4">
            <MessageCircle size={32} fill="currentColor" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Bienvenido a DelyWa</h1>
          <p className="text-gray-600 mt-2">
            {user?.firstName ? `Hola ${user.firstName}, ` : ""}configura tu cuenta para continuar
          </p>
        </div>

        {step === "choice" && (
          <div className="grid gap-4">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => setStep("colmado")}
              data-testid="choice-colmado"
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Store size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">Soy Dueño de Colmado</h3>
                  <p className="text-sm text-gray-500">Quiero registrar mi negocio y recibir pedidos</p>
                </div>
                <ArrowRight className="text-gray-400" />
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => setStep("delivery")}
              data-testid="choice-delivery"
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                  <Truck size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">Soy Delivery</h3>
                  <p className="text-sm text-gray-500">Trabajo haciendo entregas para un colmado</p>
                </div>
                <ArrowRight className="text-gray-400" />
              </CardContent>
            </Card>
          </div>
        )}

        {step === "colmado" && (
          <Card>
            <CardHeader>
              <CardTitle>Registra tu Colmado</CardTitle>
              <CardDescription>Completa los datos de tu negocio para empezar</CardDescription>
            </CardHeader>
            <CardContent>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  registerColmadoMutation.mutate(colmadoForm);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre del Colmado</Label>
                  <Input
                    id="nombre"
                    placeholder="Ej: Colmado Los Hermanos"
                    value={colmadoForm.nombre}
                    onChange={(e) => setColmadoForm({ ...colmadoForm, nombre: e.target.value })}
                    required
                    data-testid="input-nombre-colmado"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">Número de WhatsApp del Negocio</Label>
                  <Input
                    id="whatsapp"
                    placeholder="Ej: 8091234567"
                    value={colmadoForm.whatsappNumero}
                    onChange={(e) => setColmadoForm({ ...colmadoForm, whatsappNumero: e.target.value })}
                    required
                    data-testid="input-whatsapp-colmado"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="direccion">Dirección</Label>
                  <Input
                    id="direccion"
                    placeholder="Ej: Calle Principal #123, Sector"
                    value={colmadoForm.direccion}
                    onChange={(e) => setColmadoForm({ ...colmadoForm, direccion: e.target.value })}
                    required
                    data-testid="input-direccion-colmado"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep("choice")} className="flex-1">
                    Atrás
                  </Button>
                  <Button type="submit" className="flex-1 bg-primary" disabled={registerColmadoMutation.isPending} data-testid="submit-colmado">
                    {registerColmadoMutation.isPending ? "Registrando..." : "Registrar Colmado"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === "delivery" && (
          <Card>
            <CardHeader>
              <CardTitle>Vincular como Delivery</CardTitle>
              <CardDescription>
                Ingresa el número de WhatsApp con el que el colmado te registró
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  registerDeliveryMutation.mutate(deliveryForm);
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="delivery-whatsapp">Tu Número de WhatsApp</Label>
                  <Input
                    id="delivery-whatsapp"
                    placeholder="Ej: 8091234567"
                    value={deliveryForm.whatsappNumero}
                    onChange={(e) => setDeliveryForm({ whatsappNumero: e.target.value })}
                    required
                    data-testid="input-whatsapp-delivery-setup"
                  />
                  <p className="text-xs text-gray-500">
                    El dueño del colmado debe haberte agregado primero con este número
                  </p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep("choice")} className="flex-1">
                    Atrás
                  </Button>
                  <Button type="submit" className="flex-1 bg-primary" disabled={registerDeliveryMutation.isPending} data-testid="submit-delivery-setup">
                    {registerDeliveryMutation.isPending ? "Vinculando..." : "Vincular Cuenta"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
