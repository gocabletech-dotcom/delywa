import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <Link href="/">
          <a className="inline-flex items-center text-primary hover:underline mb-6">
            <ArrowLeft size={16} className="mr-1" />
            Volver al inicio
          </a>
        </Link>
        
        <h1 className="text-3xl font-bold mb-6">Términos y Condiciones</h1>
        <p className="text-gray-600 mb-4">Última actualización: Enero 2025</p>
        
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">1. Aceptación de los Términos</h2>
          <p className="text-gray-700">
            Al acceder y utilizar DelyWa, aceptas estos términos y condiciones en su totalidad. 
            Si no estás de acuerdo con alguna parte de estos términos, no debes usar nuestra plataforma.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">2. Descripción del Servicio</h2>
          <p className="text-gray-700 mb-2">
            DelyWa es una plataforma de gestión de delivery que permite a negocios en República Dominicana:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Recibir pedidos automáticamente por WhatsApp</li>
            <li>Gestionar entregas y repartidores</li>
            <li>Procesar pagos y llevar control de ventas</li>
            <li>Optimizar rutas de entrega</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">3. Planes y Suscripciones</h2>
          <p className="text-gray-700 mb-2">
            DelyWa ofrece diferentes planes de suscripción:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li><strong>Trial:</strong> 15 días gratis para probar la plataforma</li>
            <li><strong>Básico:</strong> RD$999/mes con funciones esenciales</li>
            <li><strong>Profesional:</strong> RD$1,999/mes con todas las funciones</li>
          </ul>
          <p className="text-gray-700 mt-2">
            Los precios están sujetos a cambios con previo aviso de 30 días.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">4. Responsabilidades del Usuario</h2>
          <p className="text-gray-700">
            Como usuario de DelyWa, te comprometes a:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Proporcionar información veraz y actualizada</li>
            <li>Mantener la confidencialidad de tus credenciales</li>
            <li>Usar la plataforma solo para fines legítimos de negocio</li>
            <li>Cumplir con las leyes locales de comercio y protección al consumidor</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">5. Uso de WhatsApp Business</h2>
          <p className="text-gray-700">
            Al conectar tu cuenta de WhatsApp Business a DelyWa, confirmas que:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Tienes autorización para usar dicha cuenta</li>
            <li>Cumples con las políticas de WhatsApp Business</li>
            <li>Aceptas los términos de uso de Meta para WhatsApp Business API</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">6. Limitación de Responsabilidad</h2>
          <p className="text-gray-700">
            DelyWa no se hace responsable por:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Pérdidas derivadas de la calidad de productos vendidos por el negocio</li>
            <li>Problemas en las entregas causados por terceros</li>
            <li>Interrupciones del servicio de WhatsApp o Meta</li>
            <li>Uso indebido de la plataforma por parte del usuario</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">7. Cancelación</h2>
          <p className="text-gray-700">
            Puedes cancelar tu suscripción en cualquier momento contactándonos por WhatsApp. 
            La cancelación será efectiva al final del período de facturación actual.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">8. Modificaciones</h2>
          <p className="text-gray-700">
            Nos reservamos el derecho de modificar estos términos en cualquier momento. 
            Los cambios serán notificados a través de la plataforma y entrarán en vigencia 
            30 días después de su publicación.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">9. Contacto</h2>
          <p className="text-gray-700">
            Para preguntas sobre estos términos, contáctanos por WhatsApp al +1 (919) 343-6706.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t">
          <Link href="/">
            <a className="text-primary hover:underline">← Volver al inicio</a>
          </Link>
        </div>
      </div>
    </div>
  );
}
