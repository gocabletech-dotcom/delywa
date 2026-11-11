import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { MessageCircle, ExternalLink, Loader2, CheckCircle2, AlertCircle, Smartphone, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

declare global {
  interface Window {
    FB?: { login: (callback: (response: any) => void, options: any) => void; init: (options: any) => void };
  }
}

export default function WhatsAppConfigPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [metaReady, setMetaReady] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const { data: roleData } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => (await fetch("/api/user/role")).json(),
    enabled: isAuthenticated,
  });
  const colmadoId = roleData?.colmadoId;

  const { data: colmado, isLoading: colmadoLoading } = useQuery({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const response = await fetch(`/api/colmados/${colmadoId}`);
      if (!response.ok) throw new Error("Error al cargar colmado");
      return response.json();
    },
    enabled: !!colmadoId,
  });

  const { data: metaConfig } = useQuery({
    queryKey: ["meta-config"],
    queryFn: async () => (await fetch("/api/meta/config")).json(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) window.location.href = "/login";
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!metaConfig?.configured || window.FB) {
      if (window.FB) setMetaReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onload = () => {
      window.FB?.init({ appId: metaConfig.appId, cookie: true, xfbml: true, version: "v18.0" });
      setMetaReady(true);
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [metaConfig]);

  const connectWhatsApp = () => {
    if (!window.FB || !metaConfig?.configured || !colmadoId) {
      toast({ title: "Meta no está configurado", description: "El administrador debe configurar la aplicación de Meta.", variant: "destructive" });
      return;
    }
    setConnecting(true);
    let authorizationCode: string | null = null;
    const receiveSignupMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (event.data.event !== "FINISH") {
        setConnecting(false);
        window.removeEventListener("message", receiveSignupMessage);
        return;
      }
      const phoneNumberId = event.data.data?.phone_number_id;
      const wabaId = event.data.data?.waba_id;
      window.removeEventListener("message", receiveSignupMessage);
      try {
          if (!authorizationCode) throw new Error("Meta no devolvió el código de autorización.");
          const result = await fetch("/api/whatsapp/oauth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: authorizationCode, colmadoId, phoneNumberId, wabaId }),
          });
          const body = await result.json();
          if (!result.ok) throw new Error(body.error || "No se pudo conectar WhatsApp.");
          await queryClient.invalidateQueries({ queryKey: ["colmado", colmadoId] });
          toast({ title: "WhatsApp conectado", description: "La cuenta de WhatsApp Business fue autorizada correctamente." });
        } catch (error: any) {
          toast({ title: "No se pudo conectar WhatsApp", description: error.message, variant: "destructive" });
      } finally {
        setConnecting(false);
      }
    };
    window.addEventListener("message", receiveSignupMessage);
    window.FB.login((response: any) => {
      authorizationCode = response?.authResponse?.code || null;
      if (!authorizationCode) {
        window.removeEventListener("message", receiveSignupMessage);
        setConnecting(false);
        toast({ title: "Autorización cancelada", description: "No se recibió autorización de Meta.", variant: "destructive" });
      }
    }, { config_id: metaConfig.configId, response_type: "code", override_default_response_type: true, extras: { feature: "whatsapp_embedded_signup", sessionInfoVersion: "3" } });
  };

  if (authLoading || colmadoLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#25D366]" /></div>;
  if (!colmadoId) return <div className="min-h-screen flex items-center justify-center p-4"><Card><CardContent className="pt-6 text-center"><AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" /><p>Debes tener un colmado registrado para configurar WhatsApp.</p><Button onClick={() => setLocation("/admin")} className="mt-4">Volver</Button></CardContent></Card></div>;

  const isConfigured = Boolean(colmado?.whatsappConfigured || colmado?.whatsappPhoneNumberId);
  return (
    <div className="min-h-screen bg-gray-50" data-testid="whatsapp-config-page">
      <header className="bg-[#25D366] text-white shadow-lg"><div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between"><div className="flex items-center gap-3"><MessageCircle className="w-8 h-8" fill="currentColor" /><div><h1 className="text-xl font-bold">Configuración WhatsApp</h1><p className="text-sm opacity-90">{colmado?.nombre}</p></div></div><Button variant="ghost" className="text-white hover:bg-white/20" onClick={() => setLocation("/admin/dashboard")}>Volver al Panel</Button></div></header>
      <main className="max-w-4xl mx-auto p-4 space-y-6">
        <Card className={isConfigured ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}><CardContent className="pt-6 flex items-center gap-3">{isConfigured ? <CheckCircle2 className="w-8 h-8 text-green-600" /> : <AlertCircle className="w-8 h-8 text-yellow-600" />}<div><p className="font-semibold text-lg">{isConfigured ? "WhatsApp Business conectado" : "WhatsApp Business no conectado"}</p><p className="text-sm text-gray-700">{isConfigured ? `Número autorizado: ${colmado.whatsappPhoneNumberId}` : "Conecta una cuenta mediante la autorización oficial de Meta."}</p></div></CardContent></Card>
        <Card><CardHeader><div className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-[#25D366]" /><CardTitle>Conectar con Meta</CardTitle></div><CardDescription>Autoriza a Delywa para recibir y responder mensajes de tu WhatsApp Business. No pegues Access Tokens en Delywa.</CardDescription></CardHeader><CardContent className="space-y-4"><Button onClick={connectWhatsApp} disabled={connecting || !metaReady} className="w-full bg-[#1877F2] hover:bg-[#166fe5]">{connecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageCircle className="w-4 h-4 mr-2" />} {connecting ? "Conectando..." : "Continuar con Meta"}</Button>{!metaConfig?.configured && <p className="text-sm text-amber-700">La aplicación de Meta aún no está configurada en el servidor.</p>}<p className="text-xs text-gray-500">La autorización permite usar solamente el número de WhatsApp Business que selecciones para gestionar conversaciones y pedidos.</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-lg">Webhook de mensajes</CardTitle><CardDescription>Configura estos valores en Meta for Developers → WhatsApp → Configuration.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div><p className="font-medium">Callback URL</p><code className="block p-2 bg-gray-100 rounded break-all">{window.location.origin}/api/webhook/whatsapp</code></div><div><p className="font-medium">Verify Token</p><code className="block p-2 bg-gray-100 rounded">delywa_verify_token</code></div><a href="https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">Documentación de webhooks <ExternalLink className="w-3 h-3" /></a></CardContent></Card>
        <Card className="border-blue-100 bg-blue-50/50"><CardContent className="pt-6 flex items-start gap-3"><Unplug className="w-5 h-5 text-blue-600 mt-0.5" /><p className="text-sm text-blue-900">Puedes revocar el acceso desde la configuración de tu cuenta de Meta. Delywa dejará de usar la cuenta autorizada.</p></CardContent></Card>
      </main>
    </div>
  );
}