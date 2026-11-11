export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-3xl font-bold mb-6">Política de Privacidad</h1>
        <p className="text-gray-600 mb-4">Última actualización: Agosto 2026</p>
        
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">1. Información que Recopilamos</h2>
          <p className="text-gray-700 mb-2">
            DelyWa recopila la siguiente información para proporcionar nuestros servicios:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Información de contacto (nombre, número de WhatsApp)</li>
            <li>Información del negocio (nombre del colmado, dirección)</li>
            <li>Historial de pedidos y conversaciones</li>
            <li>Identificadores de WhatsApp Business y credenciales cifradas del servidor (nunca visibles para usuarios)</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">2. Uso de la Información</h2>
          <p className="text-gray-700">
            Utilizamos la información recopilada para:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Procesar y gestionar pedidos de delivery</li>
            <li>Facilitar la comunicación entre colmados y clientes</li>
            <li>Mejorar nuestros servicios y experiencia de usuario, sin vender datos personales</li>
            <li>Enviar notificaciones relacionadas con pedidos</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">3. Integración con WhatsApp</h2>
          <p className="text-gray-700">
            Nuestra aplicación se integra con WhatsApp Business API de Meta para procesar mensajes 
            y pedidos. Al conectar tu cuenta de WhatsApp Business, autorizas el acceso a:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Recibir mensajes de clientes y responder en nombre de tu negocio</li>
            <li>Acceder a información básica de tu cuenta de WhatsApp Business</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">4. Protección de Datos</h2>
          <p className="text-gray-700">
            Implementamos medidas de seguridad técnicas y organizativas para proteger tu información 
            personal contra acceso no autorizado, alteración, divulgación o destrucción.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">5. Tus Derechos</h2>
          <p className="text-gray-700">
            Tienes derecho a:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4">
            <li>Acceder a tus datos personales</li>
            <li>Solicitar la corrección de datos inexactos</li>
            <li>Solicitar la eliminación de tus datos</li>
            <li>Revocar el acceso a WhatsApp Business en cualquier momento</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">6. Eliminación de Datos</h2>
          <p className="text-gray-700 mb-3">
            Puedes solicitar la eliminación completa de tus datos en cualquier momento. Al solicitar la eliminación:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4 mb-3">
            <li>Se eliminarán todas tus conversaciones de WhatsApp almacenadas</li>
            <li>Se eliminarán todos los mensajes asociados a tu número</li>
            <li>Se eliminarán las sesiones de chat web vinculadas</li>
            <li>El proceso es irreversible una vez completado</li>
          </ul>
          <p className="text-gray-700 mb-3">
            <strong>¿Cómo solicitar la eliminación?</strong>
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4 mb-3">
            <li>Desde Facebook: Ve a Configuración → Aplicaciones y sitios web → DelyWa → Eliminar</li>
            <li>Por WhatsApp: Escribe "ELIMINAR MIS DATOS" a cualquier negocio conectado</li>
            <li>Por correo: Envía tu solicitud a soporte@delywa.app con tu número de WhatsApp</li>
          </ul>
          <p className="text-gray-700">
            Una vez procesada tu solicitud, recibirás un código de confirmación. Puedes verificar el estado 
            de tu solicitud en cualquier momento usando ese código.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">7. Retención de Datos</h2>
          <p className="text-gray-700">
            Conservamos tus datos personales solo durante el tiempo necesario para cumplir con los fines 
            para los que fueron recopilados, incluyendo requisitos legales, contables o de informes.
            Los datos de conversaciones se mantienen por un máximo de 90 días después de la última interacción.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-3">8. Contacto</h2>
          <p className="text-gray-700">
            Para preguntas sobre esta política de privacidad o el manejo de tus datos, 
            contáctanos a través de:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4 mt-2">
            <li>Email: soporte@delywa.app</li>
            <li>A través de la plataforma DelyWa</li>
          </ul>
        </section>

        <div className="mt-8 pt-6 border-t">
          <a href="/" className="text-primary hover:underline">← Volver al inicio</a>
        </div>
      </div>
    </div>
  );
}
