import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, Loader2, CheckCircle2, AlertCircle, Smartphone, Wifi, WifiOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export default function WhatsAppConfigPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

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

  const { data: colmado, isLoading: colmadoLoading } = useQuery({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar negocio");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading || colmadoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#25D366]" />
      </div>
    );
  }

  if (!colmadoId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-gray-600">Debes tener un negocio registrado para ver esta pagina</p>
            <Button onClick={() => setLocation("/negocio/dashboard")} className="mt-4">
              Volver
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isConfigured = colmado?.evolutionApiUrl && colmado?.evolutionApiKey && colmado?.evolutionInstanceName;

  return (
    <div className="min-h-screen bg-gray-50" data-testid="whatsapp-config-page">
      <header className="bg-[#25D366] text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <MessageCircle className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" />
            <div>
              <h1 className="text-lg sm:text-xl font-bold font-['Poppins']">WhatsApp</h1>
              <p className="text-xs sm:text-sm opacity-90 font-['Inter'] hidden sm:block">{colmado?.nombre}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 text-xs sm:text-sm px-2 sm:px-4" onClick={() => setLocation("/negocio/dashboard")}>
            <span className="hidden sm:inline">Volver al Panel</span>
            <span className="sm:hidden">← Panel</span>
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6">
        {isConfigured ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-start sm:items-center gap-3">
                <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <p className="font-semibold text-green-900 text-base sm:text-lg">WhatsApp Configurado</p>
                  <p className="text-xs sm:text-sm text-green-700">Tu negocio esta configurado para recibir pedidos por WhatsApp</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-start sm:items-center gap-3">
                <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <p className="font-semibold text-yellow-900 text-base sm:text-lg">WhatsApp No Configurado</p>
                  <p className="text-xs sm:text-sm text-yellow-700">Contacta al administrador de la plataforma para configurar WhatsApp en tu negocio</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[#25D366]" />
              <CardTitle>Datos de Conexion WhatsApp</CardTitle>
            </div>
            <CardDescription className="flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Solo lectura - La configuracion es gestionada por el administrador de la plataforma
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>URL del Servidor</Label>
              <div className="p-3 bg-gray-100 rounded-lg border text-sm text-gray-700" data-testid="text-evolution-url">
                {colmado?.evolutionApiUrl || "No configurado"}
              </div>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="p-3 bg-gray-100 rounded-lg border text-sm text-gray-700" data-testid="text-evolution-key">
                {colmado?.evolutionApiKey ? "••••••••••••••••" : "No configurado"}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nombre de Instancia</Label>
              <div className="p-3 bg-gray-100 rounded-lg border text-sm text-gray-700" data-testid="text-evolution-instance">
                {colmado?.evolutionInstanceName || "No configurado"}
              </div>
            </div>

            {isConfigured && (
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="p-3 bg-gray-100 rounded-lg border text-sm text-gray-700 break-all" data-testid="text-webhook-url">
                  {window.location.origin}/api/webhook/evolution/{colmado?.evolutionInstanceName}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-900 text-sm sm:text-base">Necesitas cambios?</p>
                <p className="text-xs sm:text-sm text-blue-700 mt-1">
                  Si necesitas modificar la configuracion de WhatsApp, contacta al administrador de la plataforma. El se encarga de configurar y gestionar la conexion de tu negocio.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
