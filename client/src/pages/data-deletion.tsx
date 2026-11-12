import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Facebook, MessageCircle, Mail, CheckCircle } from "lucide-react";

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 bg-red-100 rounded-full w-fit">
              <Trash2 className="w-12 h-12 text-red-600" />
            </div>
            <CardTitle className="text-2xl">Eliminación de Datos</CardTitle>
            <p className="text-gray-600 mt-2">
              Instrucciones para solicitar la eliminación de tus datos personales
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h2 className="text-lg font-semibold mb-3">¿Qué datos se eliminan?</h2>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Todas las conversaciones de WhatsApp almacenadas</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Historial de mensajes asociados a tu número</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Sesiones de chat web vinculadas a tu número</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Información de pedidos asociada</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">Cómo solicitar la eliminación</h2>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Facebook className="w-6 h-6 text-blue-600" />
                    <h3 className="font-medium">Opción 1: Revocar desde Meta</h3>
                  </div>
                  <ol className="list-decimal list-inside text-gray-700 space-y-1 ml-2">
                    <li>Ve a la configuración de tu cuenta de Meta Business</li>
                    <li>Abre las aplicaciones o integraciones conectadas</li>
                    <li>Busca "DelyWa" y revoca el acceso</li>
                    <li>Solicita también el borrado de los datos almacenados</li>
                  </ol>
                </div>

                <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                  <div className="flex items-center gap-3 mb-2">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                    <h3 className="font-medium">Opción 2: Por WhatsApp</h3>
                  </div>
                  <p className="text-gray-700 ml-2">
                    Escribe <strong>"ELIMINAR MIS DATOS"</strong> a cualquier negocio 
                    conectado a DelyWa donde hayas realizado pedidos.
                  </p>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Mail className="w-6 h-6 text-purple-600" />
                    <h3 className="font-medium">Opción 3: Por correo electrónico</h3>
                  </div>
                  <p className="text-gray-700 ml-2">
                    Envía un correo a <strong>soporte@delywa.com</strong> con:
                  </p>
                  <ul className="list-disc list-inside text-gray-700 ml-4 mt-1">
                    <li>Asunto: "Solicitud de eliminación de datos"</li>
                    <li>Tu número de WhatsApp</li>
                    <li>Nombre asociado a la cuenta</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">Tiempo de procesamiento</h2>
              <p className="text-gray-700">
                Las solicitudes de eliminación se procesan automáticamente cuando se reciben 
                desde Facebook. Para solicitudes manuales (WhatsApp o correo), el tiempo 
                máximo de procesamiento es de <strong>48 horas</strong>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">Verificar estado</h2>
              <p className="text-gray-700">
                Una vez procesada tu solicitud, recibirás un código de confirmación. 
                Puedes verificar el estado de tu solicitud visitando:
              </p>
              <div className="mt-2 p-3 bg-gray-100 rounded font-mono text-sm">
                delywa.com/deletion-status/[tu-código]
              </div>
            </section>

            <section className="pt-4 border-t">
              <p className="text-sm text-gray-500 text-center">
                Para más información, consulta nuestra{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  Política de Privacidad
                </a>
              </p>
            </section>

            <div className="text-center pt-2">
              <a href="/" className="text-primary hover:underline">
                ← Volver al inicio
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
