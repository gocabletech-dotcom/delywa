import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, MessageCircle, ExternalLink, Smartphone, Settings, ArrowRight, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface Colmado {
  id: number;
  nombre: string;
  slug: string | null;
  logo: string | null;
  whatsappNumero: string;
}

export default function ChatConfigPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const { data: user } = useQuery({
    queryKey: ["/api/auth/me"],
  });

  const { data: colmado } = useQuery<Colmado>({
    queryKey: ["/api/colmado/mine"],
    enabled: !!user,
  });

  const baseUrl = window.location.origin;
  const chatLink = colmado ? `${baseUrl}/pedir/${colmado.slug || colmado.id}` : "";
  
  const mensajeAutorespuesta = colmado 
    ? `¡Hola! 👋 Gracias por escribirnos a ${colmado.nombre}.

Para hacer tu pedido de forma rápida y segura, entra aquí:
👉 ${chatLink}

Te atendemos al instante. ¡Gracias por preferirnos!`
    : "";

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast({
      title: "Copiado",
      description: "El texto se copió al portapapeles",
    });
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white sticky top-0 z-40 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/negocio/dashboard">
            <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10" data-testid="button-volver-panel">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver al Panel
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-bold text-white font-heading">Configurar Chat Web</h1>
          </div>
        </div>
      </header>
      <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Configurar Chat Web
          </h1>
          <p className="text-gray-600">
            Configura tu WhatsApp Business para que los clientes usen tu chat web sin restricciones
          </p>
        </div>

        {/* Link del chat */}
        <Card data-testid="card-chat-link">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Tu Link de Pedidos
            </CardTitle>
            <CardDescription>
              Este es el enlace que los clientes usarán para hacer pedidos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Input
                value={chatLink}
                readOnly
                className="font-mono text-sm min-w-0 flex-1 basis-48"
                data-testid="input-chat-link"
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  onClick={() => copyToClipboard(chatLink, "link")}
                  variant="outline"
                  data-testid="button-copy-link"
                >
                  {copied === "link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  onClick={() => window.open(chatLink, "_blank")}
                  variant="outline"
                  data-testid="button-preview-chat"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Mensaje de autorespuesta */}
        <Card data-testid="card-auto-response">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-green-600" />
              Mensaje de Auto-respuesta
            </CardTitle>
            <CardDescription>
              Copia este mensaje y pégalo en tu WhatsApp Business como mensaje de bienvenida
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Textarea
                value={mensajeAutorespuesta}
                readOnly
                rows={8}
                className="font-sans text-sm resize-none"
                data-testid="textarea-auto-response"
              />
              <Button
                onClick={() => copyToClipboard(mensajeAutorespuesta, "mensaje")}
                className="absolute top-2 right-2"
                size="sm"
                variant="secondary"
                data-testid="button-copy-message"
              >
                {copied === "mensaje" ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                Copiar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Instrucciones paso a paso */}
        <Card data-testid="card-instructions">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-green-600" />
              Cómo Configurar WhatsApp Business
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Step 
                number={1}
                title="Abre WhatsApp Business"
                description="Abre la aplicación WhatsApp Business en tu teléfono"
              />
              
              <Step 
                number={2}
                title="Ve a Configuración"
                description="Toca los tres puntos (⋮) arriba a la derecha y selecciona 'Configuración'"
              />
              
              <Step 
                number={3}
                title="Herramientas para la empresa"
                description="Selecciona 'Herramientas para la empresa'"
              />
              
              <Step 
                number={4}
                title="Mensaje de bienvenida"
                description="Toca 'Mensaje de bienvenida' y actívalo"
              />
              
              <Step 
                number={5}
                title="Pega el mensaje"
                description="Borra el texto actual y pega el mensaje que copiaste arriba"
              />
              
              <Step 
                number={6}
                title="Guarda los cambios"
                description="Toca 'GUARDAR' para activar el mensaje automático"
              />
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
              <h4 className="font-semibold text-green-800 mb-2">¡Listo!</h4>
              <p className="text-green-700 text-sm">
                Ahora cuando un cliente te escriba por WhatsApp, recibirá automáticamente 
                el enlace a tu chat web donde podrá hacer su pedido sin restricciones.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Ventajas */}
        <Card data-testid="card-benefits">
          <CardHeader>
            <CardTitle>Ventajas del Chat Web</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <Benefit 
                title="Sin restricciones"
                description="Vende cualquier producto: cigarrillos, alcohol, medicamentos, etc."
              />
              <Benefit 
                title="Sin límites de mensajes"
                description="No hay límite de conversaciones como en la API de Meta"
              />
              <Benefit 
                title="Tu marca"
                description="El chat muestra tu logo y nombre de negocio"
              />
              <Benefit 
                title="Gratis"
                description="No pagas por mensaje enviado ni recibido"
              />
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function Step({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center font-semibold flex-shrink-0">
        {number}
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function Benefit({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Check className="w-3 h-3 text-white" />
      </div>
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}
