import { Link } from "wouter";
import { ArrowLeft, MessageCircle, Phone, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link href="/">
          <a className="inline-flex items-center text-primary hover:underline mb-6">
            <ArrowLeft size={16} className="mr-1" />
            Volver al inicio
          </a>
        </Link>

        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-3xl font-bold mb-2">Contacto</h1>
          <p className="text-gray-600 mb-8">
            Estamos aquí para ayudarte. Contáctanos por cualquiera de estos medios.
          </p>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-green-50 rounded-xl p-6 border border-green-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">WhatsApp</h3>
                  <p className="text-gray-500 text-sm">Respuesta rápida</p>
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                Escríbenos directamente para soporte, ventas o cualquier consulta.
              </p>
              <a
                href="https://wa.me/19193436706?text=Hola,%20tengo%20una%20consulta%20sobre%20DelyWa"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full justify-center"
                data-testid="button-contact-whatsapp"
              >
                <MessageCircle size={18} />
                Escribir por WhatsApp
              </a>
            </div>

            <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                  <Phone className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Teléfono</h3>
                  <p className="text-gray-500 text-sm">Llamadas directas</p>
                </div>
              </div>
              <p className="text-gray-600 mb-4">
                Llámanos para hablar directamente con nuestro equipo.
              </p>
              <a
                href="tel:+19193436706"
                className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full justify-center"
                data-testid="button-contact-phone"
              >
                <Phone size={18} />
                +1 (919) 343-6706
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t">
            <h2 className="text-xl font-semibold mb-4">Información</h2>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium">Ubicación</p>
                  <p className="text-gray-600">República Dominicana</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium">Horario de atención</p>
                  <p className="text-gray-600">Lunes a Viernes: 8:00 AM - 6:00 PM</p>
                  <p className="text-gray-600">Sábados: 9:00 AM - 1:00 PM</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-6 bg-primary/5 rounded-xl border border-primary/10">
            <h3 className="font-semibold mb-2">¿Listo para empezar?</h3>
            <p className="text-gray-600 mb-4">
              Registra tu negocio hoy y comienza a recibir pedidos por WhatsApp.
            </p>
            <a
              href="https://wa.me/19193436706?text=Quiero%20registrar%20mi%20negocio%20en%20DelyWa"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              data-testid="button-register-business"
            >
              <MessageCircle size={18} />
              Registrar mi Negocio
            </a>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/">
            <a className="text-primary hover:underline">← Volver al inicio</a>
          </Link>
        </div>
      </div>
    </div>
  );
}
