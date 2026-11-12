import { normalizar } from "../lib/jerga";

// Qué quiere decir el cliente, sin inteligencia artificial: sí, no, saludo, pago, monto, estado...

const limpio = (t: string) => normalizar(t).replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
const es = (t: string, lista: string[]) => lista.includes(limpio(t));
const empieza = (t: string, lista: string[]) => { const x = limpio(t); return lista.some((p) => x === p || x.startsWith(`${p} `)); };
const contiene = (t: string, lista: string[]) => { const x = ` ${limpio(t)} `; return lista.some((p) => x.includes(` ${p} `)); };

export function esSaludo(t: string): boolean {
  return es(t, ["hola", "holaa", "holi", "buenas", "buenos dias", "buen dia", "buenas tardes", "buenas noches", "saludos", "klk", "que lo que", "q lo q",
    "dime", "hey", "epa", "alo", "hola buenas", "hola buenos dias", "hola buenas tardes", "hola buenas noches", "buenas como esta", "buenas como estan", "saludos buenas"]);
}

export function esAfirmativo(t: string): boolean {
  return es(t, ["si", "sii", "siii", "sip", "claro", "dale", "ok", "okay", "okey", "oki", "correcto", "exacto", "asi es", "asi esta bien", "perfecto", "listo",
    "de acuerdo", "esta bien", "ta bien", "ta to", "ta bien asi", "va", "bien", "eso", "eso mismo", "si eso es todo", "si es todo", "si señor", "si senor", "afirmativo",
    "claro que si", "si por favor", "si porfa", "seguro", "confirmo", "confirmado", "si gracias"]);
}

const CIERRE = new Set(["no", "nada", "mas", "gracias", "eso", "es", "todo", "solo", "ya", "por", "ahora", "seria", "esta", "asi", "bien", "ok", "de", "momento", "con"]);
/** "no", "no, nada más", "nada más gracias"... */
function soloPalabrasDeCierre(t: string, primera: string[]): boolean {
  const p = limpio(t).split(" ").filter(Boolean);
  return p.length > 0 && p.length <= 6 && primera.includes(p[0]) && p.every((x) => CIERRE.has(x));
}

export function esNegativo(t: string): boolean {
  if (soloPalabrasDeCierre(t, ["no", "nada"])) return true;
  return es(t, ["no", "nop", "nope", "nah", "no gracias", "no nada", "no mas", "no mas nada", "nada", "nada mas", "nada mas gracias", "no gracias nada mas", "negativo", "ninguna", "ninguno"]);
}

/** "Eso es todo": termina de pedir. */
export function esFinDelPedido(t: string): boolean {
  if (soloPalabrasDeCierre(t, ["no", "nada", "eso", "es", "solo", "ya", "con"]) && /todo|solo eso|nada mas|es todo/.test(limpio(t))) return true;
  return es(t, ["eso es todo", "es todo", "eso seria todo", "seria todo", "solo eso", "nada mas", "nada mas gracias", "eso nada mas", "ya", "ya esta", "ya eso es todo",
    "listo eso es todo", "no eso es todo", "no es todo", "no solo eso", "eso", "nada mas eso", "por ahora es todo", "todo eso", "con eso"]);
}

export function esAgregarMas(t: string): boolean {
  return empieza(t, ["agregar mas", "agregar", "quiero agregar", "algo mas", "otra cosa", "falta algo", "me falta", "espera", "no espera", "no falta", "tambien quiero", "agrega", "anade"]);
}

export function esGracias(t: string): boolean {
  return contiene(t, ["gracias", "grasias", "muchas gracias", "mil gracias", "thank you", "thanks", "bendiciones", "dios te bendiga"]) && limpio(t).split(" ").length <= 6;
}

export function esCancelar(t: string): boolean {
  return contiene(t, ["cancelar", "cancela", "cancelalo", "cancelen", "ya no lo quiero", "ya no quiero", "anular", "anulalo"]);
}

export function esEstado(t: string): boolean {
  return contiene(t, ["mi pedido", "como va", "donde viene", "donde esta", "cuanto falta", "ya salio", "ya viene", "por donde va", "lo enviaron", "llega", "tarda", "demora", "cuanto tarda"]);
}

export function esPreguntaHorario(t: string): boolean {
  return contiene(t, ["a que hora", "que hora", "horario", "abren", "cierran", "estan abiertos", "esta abierto", "abierto"]);
}

export function esPreguntaDelivery(t: string): boolean {
  return contiene(t, ["delivery", "envio", "cuanto cobran", "cobran el envio", "costo del envio", "llevan", "hacen entregas"]) && !contiene(t, ["mi pedido"]);
}

export function esPreguntaUbicacionColmado(t: string): boolean {
  return contiene(t, ["donde estan", "donde queda", "donde queda el colmado", "su direccion", "la direccion del colmado", "donde se encuentran"]);
}

export type Pago = "efectivo" | "tarjeta" | "transferencia";
export function leerPago(t: string): Pago | null {
  const x = limpio(t);
  if (/^1$/.test(x) || /\b(efectivo|cash|en mano|contado|billete|chele|cheles)\b/.test(x)) return "efectivo";
  if (/^2$/.test(x) || /\b(tarjeta|credito|debito|visa|mastercard|datafono|pos)\b/.test(x)) return "tarjeta";
  if (/^3$/.test(x) || /\b(transferencia|transfer|transferir|deposito|depositar|banco|transfiero)\b/.test(x)) return "transferencia";
  return null;
}

const MONTOS: Record<string, number> = { cien: 100, doscientos: 200, quinientos: 500, mil: 1000, "dos mil": 2000, "tres mil": 3000, "cinco mil": 5000, "un mil": 1000 };

/** Con cuánto paga en efectivo. 0 = "exacto" (no necesita devuelta). null = no se entendió. */
export function leerMonto(t: string): number | null {
  const x = limpio(t).replace(/(\d)\s+(\d{3})\b/g, "$1$2");
  if (/\b(exacto|completo|justo|cabal|sin devuelta|no necesito devuelta|no hace falta)\b/.test(x)) return 0;
  const digitos = normalizar(t).replace(/[^\d.,]/g, " ").trim().split(/\s+/).map((d) => Number(d.replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  if (digitos.length) return Math.max(...digitos);
  for (const [palabra, valor] of Object.entries(MONTOS).sort((a, b) => b[0].length - a[0].length)) if (` ${x} `.includes(` ${palabra} `)) return valor;
  return null;
}

/** Pregunta tipo "¿tienen gas?" → "gas" (se anota para que el colmado confirme). */
export function preguntaPorProducto(t: string): string | null {
  const m = limpio(t).match(/^(tienen|tiene|tienes|hay|venden|vende|vendes|habra|tendran|tendras)\s+(.+?)(\s+(hoy|ahora|todavia|aun))?$/);
  return m ? m[2] : null;
}

/** El mensaje parece una pregunta o conversación, no un pedido. */
export function pareceConversacion(t: string): boolean {
  const x = limpio(t);
  return t.includes("?") || /^(como|cuando|donde|por que|porque|cual|quien|puedo|puede|pueden|se puede|ustedes|usted|me pueden|me puede)\b/.test(x);
}

/** Saludo según la hora en la zona horaria del colmado. */
export function saludoPorHora(timezone: string, ahora = new Date()): string {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(ahora));
  if (hora >= 5 && hora < 12) return "Buenos días";
  if (hora >= 12 && hora < 19) return "Buenas tardes";
  return "Buenas noches";
}
