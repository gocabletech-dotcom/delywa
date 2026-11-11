// Datos por defecto que el servidor original sembraba al arrancar.
import type { InsertMensajeSistema, InsertBotIntencion, InsertPais, InsertConfiguracionSistema } from "./schema";

export const mensajesSistemaDefault: InsertMensajeSistema[] = [
  // Saludos
  {
    clave: "saludo_nuevo_cliente",
    categoria: "saludo",
    titulo: "Saludo a cliente nuevo",
    contenido: "¡Hola! 👋 Bienvenido a {colmado_nombre}. ¿Cómo te llamas?",
    descripcion: "Se envía cuando un cliente nuevo escribe por primera vez"
  },
  {
    clave: "saludo_cliente_conocido",
    categoria: "saludo",
    titulo: "Saludo a cliente conocido",
    contenido: "¡Hola {cliente_nombre}! 👋 Bienvenido de nuevo a {colmado_nombre}. ¿En qué te puedo ayudar?",
    descripcion: "Se envía cuando un cliente conocido escribe"
  },
  // Preguntas del flujo
  {
    clave: "pregunta_nombre",
    categoria: "pregunta",
    titulo: "Preguntar nombre",
    contenido: "¿A nombre de quién va el pedido?",
    descripcion: "Se pregunta cuando el cliente envía productos pero no tenemos su nombre"
  },
  {
    clave: "pregunta_direccion",
    categoria: "pregunta",
    titulo: "Preguntar dirección",
    contenido: "¿Cuál es tu dirección de entrega?",
    descripcion: "Se pregunta cuando no tenemos la dirección del cliente"
  },
  {
    clave: "ofrecer_ubicacion",
    categoria: "pregunta",
    titulo: "Ofrecer guardar ubicación GPS",
    contenido: "¿Me puedes compartir tu ubicación 📍 para guardarla? Así es más fácil encontrarte en futuras entregas. Si prefieres, puedes continuar sin ella.",
    descripcion: "Se ofrece guardar la ubicación GPS del cliente (opcional)"
  },
  {
    clave: "ubicacion_guardada",
    categoria: "confirmacion",
    titulo: "Ubicación GPS guardada",
    contenido: "📍 ¡Ubicación guardada! Ahora te llego más fácil en tus próximos pedidos.",
    descripcion: "Se envía cuando el cliente comparte su ubicación GPS"
  },
  {
    clave: "confirmar_pedido",
    categoria: "confirmacion",
    titulo: "Confirmar pedido",
    contenido: "¿Es todo o deseas agregar algo más?",
    descripcion: "Se pregunta antes de confirmar el pedido final"
  },
  {
    clave: "pedido_confirmado",
    categoria: "confirmacion",
    titulo: "Pedido confirmado",
    contenido: "✅ *¡Pedido #{pedido_id} Confirmado!*\n\n¡Gracias por tu compra! 🙏",
    descripcion: "Se envía cuando el pedido es confirmado exitosamente"
  },
  // Errores y mensajes especiales
  {
    clave: "fuera_horario",
    categoria: "error",
    titulo: "Fuera de horario",
    contenido: "Lo siento, estamos cerrados. 🕐 Nuestro horario es de {hora_apertura} a {hora_cierre}. ¡Te esperamos!",
    descripcion: "Se envía cuando el cliente escribe fuera del horario del colmado"
  },
  {
    clave: "pedido_minimo",
    categoria: "error",
    titulo: "Pedido mínimo no alcanzado",
    contenido: "El pedido mínimo es de RD${pedido_minimo}. Tu pedido actual es de RD${total}. ¿Deseas agregar algo más?",
    descripcion: "Se envía cuando el total del pedido no alcanza el mínimo"
  },
  {
    clave: "producto_no_disponible",
    categoria: "error",
    titulo: "Producto no disponible",
    contenido: "Lo siento, no tenemos {producto} disponible. ¿Te puedo ofrecer algo más?",
    descripcion: "Se envía cuando un producto no está disponible"
  },
  // Flujo del sistema
  {
    clave: "system_prompt_base",
    categoria: "sistema",
    titulo: "Prompt base del sistema",
    contenido: "Eres un asistente de pedidos amigable para un colmado en República Dominicana. Usas lenguaje dominicano casual y emojis. Entiendes jerga como 'chimi' (chimichurri), 'pica pollo' (pollo frito), 'yaroa' (comida callejera). IMPORTANTE: No promociones ni sugieras productos de tabaco o alcohol. Si el cliente pide estos productos, el sistema los manejará por separado.",
    descripcion: "Instrucción base para el modelo de IA"
  },
  {
    clave: "system_flow_instructions",
    categoria: "sistema",
    titulo: "Instrucciones de flujo",
    contenido: "FLUJO DE CONVERSACIÓN:\n1. Si el cliente envía productos pero NO tiene nombre → Pregunta nombre\n2. Si tiene nombre pero NO tiene dirección → Pregunta dirección\n3. Si tiene dirección y NO se ha ofrecido GPS antes → Ofrece guardar ubicación (opcional)\n4. Con nombre y dirección listos → Muestra resumen y pregunta si es todo\n5. Si el cliente confirma → Marca pedidoConfirmado: true",
    descripcion: "Instrucciones del flujo de conversación para el modelo de IA"
  }
];

export const botIntencionesDefault: InsertBotIntencion[] = [
  {
    codigo: "hacer_pedido",
    nombre: "Hacer Pedido",
    icono: "🛒",
    palabrasClave: ["quiero hacer un pedido", "quiero pedir", "quiero ordenar", "hacer un pedido", "hacer pedido", "tomar mi pedido", "quisiera pedir", "quisiera ordenar"],
    respuesta: "¡Hola! 👋 Bienvenido a {NEGOCIO}.\n\n📋 Te envío nuestro menú:\n\n{MENU}\n\n¿Qué te gustaría ordenar?",
    accion: "enviar_menu_bienvenida",
    activo: true,
    orden: 1,
  },
  {
    codigo: "ver_menu",
    nombre: "Ver Menú",
    icono: "📋",
    palabrasClave: ["menú", "menu", "carta", "qué tienen", "que tienen", "qué venden", "que venden", "productos", "opciones"],
    respuesta: "📋 *Menú de {NEGOCIO}*\n\n{MENU}\n\n💬 Envía el nombre de lo que deseas ordenar.",
    accion: "enviar_menu",
    activo: true,
    orden: 2,
  },
  {
    codigo: "precios",
    nombre: "Precios",
    icono: "💰",
    palabrasClave: ["precio", "cuánto cuesta", "cuanto cuesta", "cuánto vale", "cuanto vale", "costo"],
    respuesta: "💰 Aquí están nuestros precios:\n\n{MENU}\n\n¿Algo más en lo que te pueda ayudar?",
    accion: "enviar_menu",
    activo: true,
    orden: 3,
  },
  {
    codigo: "ubicacion",
    nombre: "Ubicación",
    icono: "📍",
    palabrasClave: ["dónde están", "donde están", "donde estan", "ubicación", "ubicacion", "ubicados", "dirección", "direccion", "cómo llego", "como llego", "donde quedan", "donde queda"],
    respuesta: "📍 Estamos ubicados en:\n{DIRECCION}\n\n¿Te gustaría hacer un pedido?",
    accion: "enviar_ubicacion",
    activo: true,
    orden: 4,
  },
  {
    codigo: "horario",
    nombre: "Horario",
    icono: "⏰",
    palabrasClave: ["horario", "hora", "abierto", "abren", "cierran", "cerrado", "atienden"],
    respuesta: "⏰ Nuestro horario de atención:\n{HORARIO}\n\n¿Deseas hacer un pedido?",
    accion: "enviar_horario",
    activo: true,
    orden: 5,
  },
  {
    codigo: "fallback",
    nombre: "Sin Respuesta",
    icono: "❓",
    palabrasClave: [],
    respuesta: "Anotado, voy a consultar. 📝",
    accion: "fallback",
    activo: true,
    orden: 99,
  },
];

export const paisesDefault: InsertPais[] = [
  {
    codigo: "DO", nombre: "República Dominicana", bandera: "🇩🇴", prefijoCelular: "1809",
    moneda: "DOP", simboloMoneda: "RD$", zonaHoraria: "America/Santo_Domingo", activo: true,
    etiquetaEstado: "Provincia", etiquetaCodigoPostal: null, requiereCodigoPostal: false,
    ejemploDireccion: "Calle Principal #123", ejemploCiudad: "Santo Domingo",
    ejemploEstado: "Distrito Nacional", ejemploCodigoPostal: null,
  },
  {
    codigo: "AR", nombre: "Argentina", bandera: "🇦🇷", prefijoCelular: "54",
    moneda: "ARS", simboloMoneda: "$", zonaHoraria: "America/Argentina/Buenos_Aires", activo: true,
    etiquetaEstado: "Provincia", etiquetaCodigoPostal: null, requiereCodigoPostal: false,
    ejemploDireccion: "Av. Corrientes 1234", ejemploCiudad: "Buenos Aires",
    ejemploEstado: "CABA", ejemploCodigoPostal: null,
  },
  {
    codigo: "US", nombre: "Estados Unidos", bandera: "🇺🇸", prefijoCelular: "1",
    moneda: "USD", simboloMoneda: "$", zonaHoraria: "America/New_York", activo: true,
    etiquetaEstado: "State", etiquetaCodigoPostal: "ZIP Code", requiereCodigoPostal: true,
    ejemploDireccion: "123 Main St", ejemploCiudad: "New York",
    ejemploEstado: "NY", ejemploCodigoPostal: "10001",
  },
];

export const zipAlertConfigDefault: InsertConfiguracionSistema[] = [
  {
    clave: "zip_alert_threshold_per_hour",
    valor: "5",
    descripcion: "Cantidad de alertas ZIP por hora que activa un aviso al negocio",
    tipo: "numero",
  },
  {
    clave: "zip_alert_meta_template_name",
    valor: "zip_alert_operativo",
    descripcion: "Nombre de la plantilla aprobada de Meta para avisos ZIP",
    tipo: "texto",
  },
  {
    clave: "zip_alert_meta_template_language",
    valor: "es_ES",
    descripcion: "Idioma de la plantilla de Meta para avisos ZIP",
    tipo: "texto",
  },
];
