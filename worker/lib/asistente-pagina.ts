// Delywa · Asistente del chat de la página principal (como el de FoodPOS: sin IA).
// Entiende la pregunta por palabras clave, contesta con información real de Delywa (los planes y los
// días de prueba salen de la base en vivo) y, si no sabe, ofrece que soporte le escriba.
// Lo que la plataforma le enseña (Plataforma → Asistente de la página) va antes que lo que ya sabe.

import { SOPORTE } from "./correo";

/** Quita acentos y signos para comparar. */
export const normal = (t: unknown) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9$ñ ]+/g, " ").replace(/\s+/g, " ").trim();

export type Accion = "registro" | "precio" | "soporte" | "manual" | "legal" | "chat_demo";
type Tema = { tema: string; k: string[]; texto: string; solo?: boolean; acciones?: Accion[]; planes?: boolean; soporte?: boolean };

export type PlanPublico = { nombre: string; precio: number; trial: boolean; dias: number; descripcion: string | null; caracteristicas: string[] };

/** {DIAS} se cambia por los días de prueba del plan Trial de la base. */
const TEMAS: Tema[] = [
  { tema: "saludo", solo: true, k: ["hola", "buenas", "buenos dias", "buenas tardes", "buenas noches", "saludos", "klk", "que lo que", "hey", "epa"],
    texto: "¡Hola! 👋 Soy el asistente de **Delywa**. Te ayudo con precios, cómo piden tus clientes, el delivery, los pagos o cómo empezar. ¿Tienes un colmado?" },
  { tema: "gracias", solo: true, k: ["gracias", "perfecto", "excelente", "ok gracias", "dale", "chevere", "nitido"],
    texto: "¡Con gusto! Puedes probar Delywa gratis {DIAS}, sin tarjeta. ¿Algo más en lo que te ayude?", acciones: ["registro"] },
  { tema: "precio", planes: true, k: ["precio", "precios", "cuanto cuesta", "cuanto vale", "cuanto es", "costo", "plan", "planes", "mensualidad", "pagar al mes", "suscripcion", "barato", "tarifa", "cuanto cobran"],
    texto: "Estos son los planes, en pesos dominicanos. **No cobramos comisión por pedido.** Todos empiezan con la prueba gratis de {DIAS}, sin tarjeta:", acciones: ["registro", "precio"] },
  { tema: "prueba", k: ["gratis", "prueba", "probar", "demo", "sin tarjeta", "mes gratis", "trial"],
    texto: "Sí: la prueba es de **{DIAS} gratis, sin tarjeta y sin contrato**. Usas todo Delywa con tus clientes de verdad: el chat de pedidos, el panel, el portal del delivery y los cuadres. Al terminar eliges el plan que te conviene.", acciones: ["registro"] },
  { tema: "comision", k: ["comision", "porcentaje", "por pedido", "me cobran por venta", "cobran por cada pedido"],
    texto: "**Delywa no cobra comisión por pedido.** Pagas solo tu plan del mes, vendas lo que vendas. El dinero de cada venta es tuyo: el cliente te paga a ti o a tu delivery.", acciones: ["precio"] },
  { tema: "como_funciona", k: ["como funciona", "que es delywa", "que hace", "para que sirve", "como trabaja", "explicame", "en que consiste"],
    texto: "Así funciona: **1)** Tu cliente abre el enlace de tu colmado y pide escribiendo, como en WhatsApp. **2)** El pedido te llega al panel; le pones precio y lo confirmas. **3)** Lo preparas y se lo asignas a tu delivery, que lo ve en su teléfono con la ruta. **4)** Al final del día cuadras el efectivo con cada delivery.", acciones: ["registro", "manual"] },
  { tema: "pedir_cliente", k: ["como pide", "como pedir", "mis clientes", "el cliente pide", "hacer un pedido", "pedido por chat", "enlace", "link", "qr", "codigo qr"],
    texto: "Tu colmado tiene **su propio chat** con enlace y código QR, por ejemplo **tucolmado.delywa.com**. El cliente escribe como en WhatsApp: «2 libras de arroz y una fría». El bot entiende la jerga dominicana, le pide la ubicación y cómo va a pagar, y el pedido te llega al panel. Compartes el enlace en tu estado de WhatsApp, Instagram o lo pegas impreso en el colmado.", acciones: ["chat_demo", "registro"] },
  { tema: "whatsapp", k: ["whatsapp", "wasap", "whatsapp business", "mensajes", "bot", "respuesta automatica", "meta"],
    texto: "**No necesitas WhatsApp Business** para usar Delywa: tus clientes piden por el chat de tu colmado y los avisos (confirmado, en camino, entregado) les llegan ahí mismo. Si tienes WhatsApp Business, pones un mensaje de bienvenida con tu enlace y quien te escriba pide por el chat." },
  { tema: "delivery", k: ["delivery", "deliverys", "repartidor", "repartidores", "motor", "motorista", "domicilio", "envio", "ruta", "rutas", "llevar"],
    texto: "Para el **delivery**: cada repartidor entra a su portal desde el teléfono con su número y un código. Ve sus pedidos, la dirección en el mapa, la ruta y cuánto cobrar. Si no puede entregar, lo marca y lo devuelve al colmado. Tú ves en todo momento quién lleva qué." },
  { tema: "cuadre", k: ["cuadre", "cuadrar", "efectivo", "devuelta", "vuelto", "cambio", "caja", "cierre"],
    texto: "Al final del día el delivery **cuadra el efectivo** desde su teléfono: lo cobrado, las devueltas que dio y lo que trae de vuelta. Tú lo confirmas en el panel y la diferencia queda anotada en su saldo. También cuadras la caja del día en Ventas." },
  { tema: "pagos", k: ["pago", "pagos", "transferencia", "tarjeta", "efectivo", "comprobante", "banco", "cobrar"],
    texto: "Tus clientes pagan en **efectivo** (el bot pregunta con cuánto, para la devuelta), con **tarjeta** en tu propio terminal o por **transferencia**: el bot les manda tus cuentas y ellos envían la foto del comprobante, que tú apruebas en el panel antes de entregar." },
  { tema: "equipo", k: ["que necesito", "instalar", "aplicacion", "app", "computadora", "celular", "telefono", "tablet", "impresora", "equipo", "descargar"],
    texto: "No tienes que instalar nada: Delywa funciona en el **navegador** de tu celular o computadora. Tus repartidores usan su propio teléfono. Puedes imprimir la factura del pedido en la impresora que tengas." },
  { tema: "sucursales", k: ["sucursal", "sucursales", "varios colmados", "dos colmados", "otro local", "otra tienda"],
    texto: "Si tienes más de un colmado, creas **sucursales**: cada una tiene su chat, sus pedidos y sus repartidores, y heredan tu configuración. En Reportes comparas cuánto vende cada una." },
  { tema: "usuarios", k: ["usuario", "usuarios", "empleado", "empleados", "colmadero", "despachador", "encargado", "permisos", "roles", "nomina", "asistencia"],
    texto: "Creas usuarios para tu equipo con su rol: **Colmadero** (el encargado, casi como el dueño) y **Despachador** (atiende a la gente, sin ver dinero ni configuración). También llevas tus empleados: marcan entrada y salida con un código y Delywa calcula la nómina." },
  { tema: "reportes", k: ["reporte", "reportes", "ventas", "cuanto vendi", "estadisticas", "numeros", "ganancia"],
    texto: "Ves lo que vendes **hoy, en la semana o en el mes**, día por día, el promedio por pedido y cuánto vende cada sucursal. Solo cuenta lo que ya se entregó." },
  { tema: "fiscal", k: ["factura", "factura electronica", "dgii", "ncf", "e-cf", "ecf", "comprobante fiscal", "rnc", "itbis", "impuestos"],
    texto: "Delywa tiene una **guía paso a paso** para que la DGII autorice tu colmado como emisor de factura electrónica (e-CF): datos fiscales, certificado digital y los pasos en la Oficina Virtual. La emisión de facturas electrónicas desde Delywa viene pronto. Ante dudas fiscales, consulta a tu contador." },
  { tema: "seguridad", k: ["seguridad", "seguro", "mis datos", "privacidad", "respaldo", "hackeo", "confiable"],
    texto: "Tus datos están en **Cloudflare**, con conexión cifrada, contraseñas protegidas, llaves cifradas y respaldo diario. Cada negocio ve solo su información, y cada persona del equipo solo lo que su rol permite.", acciones: ["legal"] },
  { tema: "registro", k: ["registrarme", "registrar", "crear cuenta", "crear mi negocio", "empezar", "comenzar", "abrir cuenta", "como empiezo", "quiero empezar", "me interesa", "inscribirme", "afiliarme"],
    texto: "¡Perfecto! Crear tu negocio toma 2 minutos: pones el nombre del colmado, tu nombre, dirección, WhatsApp, correo y una contraseña. **Revisamos tu negocio y te avisamos por correo cuando esté aprobado**; ahí entras y empiezas tu prueba de {DIAS}.", acciones: ["registro"] },
  { tema: "cancelar", k: ["cancelar", "contrato", "permanencia", "salirme", "dar de baja", "reembolso"],
    texto: "**Sin contrato ni permanencia.** Cancelas cuando quieras: escríbenos a soporte@delywa.com y lo hacemos.", acciones: ["soporte"] },
  { tema: "manual", k: ["manual", "tutorial", "guia", "como se usa", "aprender", "ayuda de uso", "video"],
    texto: "Delywa tiene un **manual interactivo** con capturas reales de cada pantalla, recorrido guiado y preguntas frecuentes, para el negocio, el delivery y el cliente.", acciones: ["manual"] },
  { tema: "pais", k: ["republica dominicana", "dominicana", "santo domingo", "santiago", "otro pais", "pais", "fuera de rd", "estados unidos", "puerto rico"],
    texto: "Delywa está hecho para **colmados de República Dominicana** 🇩🇴: precios en RD$, direcciones por sector y la jerga dominicana en el bot. Si estás en otro país, escríbenos y te decimos si te sirve.", acciones: ["soporte"] },
  { tema: "humano", soporte: true, k: ["soporte", "humano", "persona", "agente", "hablar con alguien", "llamar", "contacto", "contactar", "correo", "email", "ventas", "asesor", "que me llamen", "que me escriban"],
    texto: "Claro. Déjame tus datos y lo que necesitas, y el equipo de Delywa te escribe. También puedes escribir directo a **soporte@delywa.com**." },
];

export const TITULOS: Record<string, string> = {
  saludo: "Saludo", gracias: "Gracias", precio: "¿Cuánto cuesta?", prueba: "Prueba gratis", comision: "Comisión", como_funciona: "¿Cómo funciona?",
  pedir_cliente: "Cómo pide el cliente", whatsapp: "WhatsApp", delivery: "Delivery", cuadre: "Cuadre y devuelta", pagos: "Formas de pago",
  equipo: "¿Qué necesito?", sucursales: "Sucursales", usuarios: "Usuarios y empleados", reportes: "Reportes", fiscal: "Factura electrónica",
  seguridad: "Seguridad", registro: "Crear mi negocio", cancelar: "Cancelar", manual: "Manual", pais: "País", humano: "Hablar con soporte",
  aprendida: "Respuesta enseñada", soporte: "Pidió que le escriban",
};

const SIN_RESPUESTA = `Esa no la sé con seguridad y no quiero inventarte nada. ¿Quieres que el equipo de Delywa te escriba? Déjame tus datos, o escribe a **${SOPORTE}**.`;

export type Respuesta = {
  tema: string | null; texto: string; acciones: Accion[]; soporte: boolean;
  planes?: PlanPublico[]; sugerir?: { tema: string; titulo: string }; aprendidaId?: number;
};

/** Cuánto se parece la pregunta a un tema: frases enteras valen más que palabras sueltas. */
function puntuar(t: string, palabras: string[]): number {
  let p = 0;
  for (const k of palabras) {
    const re = new RegExp(`(^|\\s)${k.replace(/[$]/g, "\\$")}(\\s|$)`);
    if (re.test(t)) p += k.includes(" ") ? 3 : 2;
    else if (k.length >= 5 && t.includes(k)) p += 1;
  }
  return p;
}
const palabrasDe = (t: string) => normal(t).split(" ").filter((w) => w.length > 2);

const textoDias = (dias: number) => (dias % 30 === 0 && dias >= 30 ? (dias === 30 ? "1 mes" : `${dias / 30} meses`) : `${dias} días`);

/** Respuesta del asistente para un texto escrito. */
export function responder(texto: string, opciones: { planes?: PlanPublico[]; aprendidas?: Array<{ id: number; pregunta: string; respuesta: string }> } = {}): Respuesta | null {
  const t = normal(texto);
  if (!t) return null;
  // 1) Lo que la plataforma le enseñó (se parece mucho a una pregunta guardada).
  const pw = new Set(palabrasDe(texto));
  let mejor: { id: number; respuesta: string } | null = null, sim = 0;
  for (const a of opciones.aprendidas ?? []) {
    const aw = palabrasDe(a.pregunta);
    if (!aw.length) continue;
    const comun = aw.filter((w) => pw.has(w)).length;
    const s = comun / Math.max(aw.length, Math.min(pw.size, 8));
    if (s > sim) { sim = s; mejor = a; }
  }
  if (mejor && sim >= 0.6) return { tema: "aprendida", aprendidaId: mejor.id, texto: mejor.respuesta, acciones: [], soporte: false };

  // 2) Los temas que ya sabe.
  const res = TEMAS.map((x) => ({ x, p: puntuar(t, x.k) })).filter((r) => r.p > 0).sort((a, b) => b.p - a.p);
  if (!res.length) return { tema: null, texto: SIN_RESPUESTA, acciones: ["soporte"], soporte: true };
  // El saludo y las gracias solo cuando la frase es solo eso.
  let el = res.find((r) => !r.x.solo) ?? res[0];
  const h = res.find((r) => r.x.tema === "humano");
  if (h && h !== el && h.p >= el.p - 1) el = h; // pedir una persona gana
  if (el.x.solo && t.split(" ").length > 6 && res.length === 1) return { tema: null, texto: SIN_RESPUESTA, acciones: ["soporte"], soporte: true };
  const otro = res.find((r) => r !== el && !r.x.solo && r.p >= 2);
  return armar(el.x, opciones.planes ?? [], otro ? otro.x.tema : undefined);
}

/** Respuesta cuando la persona toca un botón de tema. */
export function respuestaDeTema(tema: string, planes: PlanPublico[] = []): Respuesta | null {
  const x = TEMAS.find((y) => y.tema === tema);
  return x ? armar(x, planes) : null;
}

function armar(x: Tema, planes: PlanPublico[], sugerir?: string): Respuesta {
  const prueba = planes.find((p) => p.trial);
  const dias = textoDias(prueba?.dias ?? 30);
  return {
    tema: x.tema,
    texto: x.texto.replaceAll("{DIAS}", dias),
    acciones: [...(x.acciones ?? [])],
    soporte: Boolean(x.soporte),
    planes: x.planes ? planes.filter((p) => !p.trial) : undefined,
    sugerir: sugerir ? { tema: sugerir, titulo: TITULOS[sugerir] ?? sugerir } : undefined,
  };
}

export const TEMAS_RAPIDOS = ["precio", "como_funciona", "pedir_cliente", "delivery", "prueba", "humano"] as const;
