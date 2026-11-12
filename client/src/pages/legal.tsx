import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

// Términos y condiciones, Política de privacidad y Acuerdo de tratamiento de datos (DPA) de Delywa.
// Si cambias el texto, cambia también VERSION_LEGAL (aquí y en worker/data/legal.ts):
// cada negocio que se registra deja constancia de la versión que aceptó.

export const VERSION_LEGAL = "2026-11-12.2";
const FECHA = "12 de noviembre de 2026";
const OPERADOR = "WRMA Developer";
const CONTACTO = "soporte@delywa.com";
const SITIO = "delywa.com";

type Bloque = { titulo: string; parrafos?: string[]; lista?: string[] };
type Documento = { id: "terminos" | "privacidad" | "dpa"; titulo: string; bloques: Bloque[] };

const SUBENCARGADOS = [
  "Cloudflare, Inc. — alojamiento de la aplicación, base de datos, archivos (fotos y comprobantes), protección contra ataques, verificación Turnstile y su inteligencia artificial (Workers AI) para pasar notas de voz a texto y entender mensajes que el bot del chat no entiende.",
  "OpenAI, L.L.C. — inteligencia artificial del bot de WhatsApp, cuando la plataforma la tiene activada.",
  "Meta Platforms, Inc. (WhatsApp Business Platform) — envío y recepción de mensajes de WhatsApp, cuando el negocio conecta su número oficial.",
  "Proveedor de Evolution API que el propio negocio elija — solo si el negocio conecta WhatsApp por esa vía.",
  "OpenStreetMap / Nominatim y, si se activa, un proveedor de rutas — convertir direcciones en ubicaciones y calcular distancias.",
];

const DOCUMENTOS: Documento[] = [
  {
    id: "terminos",
    titulo: "Términos y condiciones",
    bloques: [
      { titulo: "1. Quiénes somos", parrafos: [
        `Delywa (${SITIO}) es una plataforma para que colmados y otros negocios de la República Dominicana reciban pedidos por WhatsApp y por la web, gestionen repartidores, ventas y personal. Delywa es operada por ${OPERADOR} ("Delywa", "nosotros").`,
        `Estos términos son un contrato entre Delywa y la persona que registra un negocio ("el Negocio" o "tú"). Al marcar la casilla de aceptación y pulsar "Crear mi negocio", aceptas estos términos, la Política de privacidad y el Acuerdo de tratamiento de datos.`,
      ] },
      { titulo: "2. Registro y revisión", lista: [
        "Debes ser mayor de edad y tener autoridad para representar al Negocio.",
        "La información que das (nombre del negocio, dirección, teléfono, correo) debe ser verdadera y estar al día.",
        "Todo negocio nuevo queda en revisión: no recibe pedidos ni mensajes hasta que Delywa verifica sus datos y lo activa. Podemos pedirte documentos o datos adicionales.",
        "Delywa puede rechazar una solicitud o suspender un negocio cuyos datos no se puedan verificar o que incumpla estos términos.",
        "Eres responsable de guardar tu contraseña y de todo lo que se haga con tu cuenta y con las cuentas de tu personal.",
      ] },
      { titulo: "3. El servicio", lista: [
        "Atención automática de clientes por WhatsApp y por el chat web, con inteligencia artificial.",
        "Menú en línea, recepción y seguimiento de pedidos, cocina, ventas y cuadres.",
        "Gestión de repartidores, rutas y pagos a repartidores; gestión de empleados, asistencia y nómina.",
        "Las respuestas del bot se generan con inteligencia artificial y pueden contener errores. El Negocio debe revisar y confirmar cada pedido, precio y monto antes de entregarlo o cobrarlo.",
      ] },
      { titulo: "4. Planes y pagos", parrafos: [
        "Los planes, sus límites y precios vigentes son los que se muestran en la plataforma. El período de prueba, si existe, dura lo que indique el plan de prueba. Los cambios de precio se avisan con al menos 30 días de anticipación. Si un pago no se recibe, el negocio entra en un período de gracia y luego puede suspenderse hasta que se ponga al día.",
      ] },
      { titulo: "5. Obligaciones del Negocio", lista: [
        "Cumplir las leyes dominicanas aplicables, incluidas la Ley 358-05 de protección al consumidor, las normas fiscales y sanitarias, y la Ley 172-13 de protección de datos personales.",
        "No vender productos prohibidos, ni bebidas alcohólicas o tabaco a menores de edad.",
        "Cumplir las políticas de WhatsApp Business y de Meta cuando uses su servicio; tener permiso para usar el número de WhatsApp que conectes.",
        "Informar a tus clientes que sus pedidos se atienden con ayuda de Delywa y de inteligencia artificial, y tratar sus datos solo para atender sus pedidos.",
        "No usar la plataforma para enviar publicidad no solicitada, ni para fraude, acoso o cualquier fin ilegal.",
      ] },
      { titulo: "6. Contenido y propiedad", parrafos: [
        "Tu menú, fotos, logo, precios y datos de tus clientes son tuyos. Nos das permiso para guardarlos y mostrarlos solo para prestarte el servicio. La plataforma, su código y su marca son de Delywa.",
      ] },
      { titulo: "7. Disponibilidad", parrafos: [
        "Hacemos lo posible para que el servicio funcione siempre, pero puede haber interrupciones por mantenimiento o por fallas de terceros (internet, WhatsApp, Meta, OpenAI, Cloudflare). No garantizamos que el servicio esté libre de errores.",
      ] },
      { titulo: "8. Limitación de responsabilidad", parrafos: [
        "En la medida en que la ley lo permita, Delywa no responde por la calidad de los productos que vende el Negocio, por las entregas, por pérdidas de ventas o ganancias, ni por fallas de servicios de terceros. La responsabilidad total de Delywa frente al Negocio no superará lo que el Negocio pagó a Delywa en los 3 meses anteriores al hecho que la origine.",
      ] },
      { titulo: "9. Suspensión y cancelación", parrafos: [
        "Puedes dejar de usar Delywa cuando quieras escribiendo a " + CONTACTO + ". Podemos suspender o cancelar una cuenta que incumpla estos términos o la ley. Al cancelar, puedes pedir una copia de tus datos dentro de los 30 días siguientes; después se eliminan según la Política de privacidad.",
      ] },
      { titulo: "10. Cambios, ley aplicable y contacto", parrafos: [
        "Podemos actualizar estos términos; te avisaremos en la plataforma y el uso continuado significa que aceptas la nueva versión. Estos términos se rigen por las leyes de la República Dominicana y cualquier conflicto se someterá a los tribunales de Santo Domingo. Contacto: " + CONTACTO + ".",
      ] },
    ],
  },
  {
    id: "privacidad",
    titulo: "Política de privacidad",
    bloques: [
      { titulo: "1. Alcance", parrafos: [
        `Esta política explica qué datos personales trata Delywa, para qué y qué derechos tienes, conforme a la Ley No. 172-13 sobre Protección Integral de los Datos Personales de la República Dominicana. Responsable: ${OPERADOR}, operador de Delywa. Contacto: ${CONTACTO}.`,
        "Hay dos tipos de datos: los de los negocios y su personal (Delywa es el responsable), y los de los clientes que piden a esos negocios (el negocio es el responsable y Delywa los trata por cuenta del negocio, según el Acuerdo de tratamiento de datos).",
      ] },
      { titulo: "2. Datos que recogemos", lista: [
        "Del dueño y del personal: nombre, correo, teléfono, contraseña (guardada cifrada, nunca en texto), rol, asistencia y datos de nómina que el negocio registre.",
        "Del negocio: nombre, dirección, ubicación, horario, menú, fotos, logo, plan y pagos.",
        "De los clientes del negocio: número de WhatsApp, nombre, dirección y ubicación de entrega, mensajes y notas de voz, pedidos, método de pago y comprobantes de transferencia.",
        "De los repartidores: nombre, teléfono, ubicación GPS mientras están en turno, entregas y cuadres de efectivo.",
        "Técnicos: dirección IP, navegador, fecha y hora de acceso, y registros de seguridad (por ejemplo, intentos de inicio de sesión).",
      ] },
      { titulo: "3. Para qué los usamos", lista: [
        "Prestar el servicio: atender mensajes, tomar y entregar pedidos, calcular rutas, ventas y nómina.",
        "Seguridad: evitar fraudes, accesos indebidos y abuso (límites de intentos, verificación Turnstile).",
        "Facturar los planes y comunicarnos con el negocio.",
        "Cumplir obligaciones legales.",
        "No vendemos datos personales ni los usamos para publicidad de terceros.",
      ] },
      { titulo: "4. Inteligencia artificial", parrafos: [
        "El chat de la página lo atiende un asistente automático por pasos que no usa inteligencia artificial. Solo cuando no entiende un mensaje, ese mensaje se envía a la inteligencia artificial de Cloudflare (Workers AI); las notas de voz también se pasan a texto con Workers AI. En WhatsApp, los mensajes pueden enviarse a OpenAI si la plataforma lo tiene activado. Enviamos solo lo necesario para responder.",
      ] },
      { titulo: "5. Con quién compartimos datos", parrafos: ["Solo con los proveedores que necesitamos para prestar el servicio:"], lista: SUBENCARGADOS },
      { titulo: "6. Transferencias internacionales", parrafos: [
        "Algunos proveedores están fuera de la República Dominicana (principalmente en Estados Unidos). Solo trabajamos con proveedores que ofrecen medidas de seguridad adecuadas.",
      ] },
      { titulo: "7. Cuánto tiempo los guardamos", lista: [
        "Mientras la cuenta del negocio esté activa.",
        "Al cerrar la cuenta, los datos se eliminan en un máximo de 90 días, salvo lo que la ley obligue a conservar (por ejemplo, registros contables).",
        "Las sesiones vencen a los 7 días; los registros de seguridad se borran periódicamente.",
      ] },
      { titulo: "8. Seguridad", parrafos: [
        "Usamos conexión cifrada (HTTPS), contraseñas cifradas, llaves de servicios cifradas, comprobantes de pago privados, control de acceso por rol y por sucursal, y límites de intentos.",
      ] },
      { titulo: "9. Tus derechos", parrafos: [
        `Puedes pedir acceso, rectificación, cancelación (eliminación) u oposición al uso de tus datos escribiendo a ${CONTACTO}. Responderemos en un máximo de 10 días hábiles. Si eres cliente de un negocio, también puedes pedírselo directamente a ese negocio. Para borrar los datos ligados a tu WhatsApp puedes usar la página de eliminación de datos de ${SITIO}.`,
      ] },
      { titulo: "10. Menores de edad", parrafos: ["Delywa no está dirigido a menores de edad. Los negocios no deben vender a menores productos restringidos."] },
      { titulo: "11. Cambios", parrafos: ["Si cambiamos esta política, publicaremos la nueva versión aquí con su fecha."] },
    ],
  },
  {
    id: "dpa",
    titulo: "Acuerdo de tratamiento de datos (DPA)",
    bloques: [
      { titulo: "1. Partes y objeto", parrafos: [
        `Este acuerdo forma parte de los Términos y condiciones. El Negocio es el Responsable del tratamiento de los datos personales de sus clientes, repartidores y empleados. ${OPERADOR}, operador de Delywa, es el Encargado del tratamiento: trata esos datos solo por cuenta del Negocio y para prestarle el servicio, conforme a la Ley No. 172-13.`,
      ] },
      { titulo: "2. Datos y finalidad", lista: [
        "Categorías de personas: clientes del Negocio, repartidores, empleados y usuarios del panel.",
        "Datos: identificación y contacto, direcciones y ubicación, mensajes y notas de voz, pedidos y pagos, asistencia y nómina.",
        "Finalidad: recibir y atender pedidos, entregas, comunicación por WhatsApp y web, ventas, cuadres y nómina.",
        "Duración: mientras dure la cuenta del Negocio, más el plazo de eliminación de la Política de privacidad.",
      ] },
      { titulo: "3. Obligaciones de Delywa", lista: [
        "Tratar los datos solo según las instrucciones del Negocio, que son las que da al usar la plataforma.",
        "Garantizar que su personal guarde confidencialidad.",
        "Aplicar medidas de seguridad técnicas y organizativas adecuadas (cifrado en tránsito, contraseñas y llaves cifradas, control de acceso por rol, registros de seguridad).",
        "Avisar al Negocio sin demora indebida, y en un máximo de 72 horas desde que lo sepa, de cualquier brecha de seguridad que afecte sus datos.",
        "Ayudar al Negocio a responder solicitudes de acceso, rectificación, cancelación y oposición.",
        "Al terminar el servicio, devolver los datos al Negocio si lo pide en los 30 días siguientes y luego eliminarlos, salvo obligación legal de conservarlos.",
        "Poner a disposición del Negocio la información necesaria para demostrar el cumplimiento de este acuerdo.",
      ] },
      { titulo: "4. Subencargados", parrafos: [
        "El Negocio autoriza a Delywa a usar los siguientes subencargados. Delywa avisará en la plataforma antes de agregar uno nuevo; el Negocio puede oponerse y, si no hay solución, cancelar el servicio.",
      ], lista: SUBENCARGADOS },
      { titulo: "5. Obligaciones del Negocio", lista: [
        "Tener una base legal para tratar los datos de sus clientes y personal, e informarles que usa Delywa y servicios de inteligencia artificial.",
        "No subir a la plataforma datos que no necesite para atender pedidos (por ejemplo, números de tarjetas o cuentas bancarias de clientes).",
        "Mantener seguras las cuentas de su personal y quitar el acceso a quien ya no trabaje con él.",
      ] },
      { titulo: "6. Transferencias internacionales", parrafos: [
        "Los datos pueden tratarse en Estados Unidos y otros países donde operan los subencargados. Delywa solo usa proveedores con garantías adecuadas de protección.",
      ] },
      { titulo: "7. Vigencia", parrafos: [
        "Este acuerdo rige mientras el Negocio use Delywa y sus obligaciones de confidencialidad y eliminación continúan después. En caso de conflicto con los Términos, en materia de datos personales prevalece este acuerdo.",
      ] },
    ],
  },
];

export default function LegalPage({ seccion }: { seccion?: Documento["id"] }) {
  useEffect(() => {
    const destino = seccion ?? (window.location.hash.replace("#", "") as Documento["id"]);
    if (destino) document.getElementById(destino)?.scrollIntoView();
  }, [seccion]);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm p-6 md:p-10" data-testid="legal-page">
        <Link href="/" className="inline-flex items-center text-emerald-700 hover:underline mb-6">
          <ArrowLeft size={16} className="mr-1" /> Volver al inicio
        </Link>
        <h1 className="text-3xl font-bold mb-2">Documentos legales de Delywa</h1>
        <p className="text-gray-500 text-sm mb-4">Versión {VERSION_LEGAL} · Última actualización: {FECHA}</p>
        <nav className="flex flex-wrap gap-3 mb-8 text-sm">
          {DOCUMENTOS.map((d) => (
            <a key={d.id} href={`#${d.id}`} className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 hover:bg-emerald-100">{d.titulo}</a>
          ))}
        </nav>
        {DOCUMENTOS.map((d) => (
          <article key={d.id} id={d.id} className="mb-12 scroll-mt-6">
            <h2 className="text-2xl font-bold mb-4 border-b pb-2">{d.titulo}</h2>
            {d.bloques.map((b) => (
              <section key={b.titulo} className="mb-5">
                <h3 className="text-lg font-semibold mb-2">{b.titulo}</h3>
                {b.parrafos?.map((p) => <p key={p} className="text-gray-700 mb-2 leading-relaxed">{p}</p>)}
                {b.lista && (
                  <ul className="list-disc pl-6 text-gray-700 space-y-1">
                    {b.lista.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}
          </article>
        ))}
        <p className="text-sm text-gray-500">¿Preguntas? Escríbenos a {CONTACTO}.</p>
      </div>
    </div>
  );
}
