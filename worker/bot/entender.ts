import { leerPedido, normalizarHabla, type Item } from "./productos";
import * as I from "./intenciones";

// Qué quiere el cliente con un mensaje, como lo entendería el colmadero: un pedido, una pregunta de precio,
// fiado, pago, algo del envío, quitar o cambiar lo que ya pidió, esperar… Sin inteligencia artificial.
// Se mide con el banco de frases (worker/__tests__/banco-frases.test.ts).

export type Pago = "efectivo" | "tarjeta" | "transferencia";
export type Entendido =
  | { tipo: "pedido"; items: Item[] }
  | { tipo: "quitar"; items: Item[] }
  | { tipo: "cambiarCantidad"; nueva: number; anterior: number | null }
  | { tipo: "pago"; forma: Pago | null; monto: number | null; pregunta: "cuenta" | "acepta" | null; hecho: boolean }
  | { tipo: "precio" | "fiado" | "envio" | "cambiar" | "cancelar" | "repetir" | "espera" | "aclarar" | "queja" | "confirmar" | "pregunta" | "otro" };

const prueba = (t: string, re: RegExp) => re.test(t);
const numero = (x: string | undefined) => (x && /^\d+([.,]\d+)?$/.test(x) ? Number(x.replace(",", ".")) : null);

export function entender(texto: string, jerga: Map<string, string>): Entendido {
  // Sin «espérate,», «mira,», «oye,» al principio: no cambian lo que pide.
  const t = normalizarHabla(texto).replace(/[¿?¡!]/g, " ").replace(/[.,;:]+(?=\s|$)/g, (m, i, todo) => (i + m.length >= todo.length ? "" : ",")).replace(/\s+/g, " ").trim()
    .replace(/^(esperate|espera|aguanta|mira|oye|oiga|bueno|ok|dale|vecino|vecina|jefe)\s*[,.]?\s+(?=\S)/, "");
  if (!t) return { tipo: "otro" };

  // Cancelar todo.
  if (I.esCancelar(t) || prueba(t, /\b(mejor\s+)?no\s+me\s+(mandes|traigas|envies)\s+nada\b/)) return { tipo: "cancelar" };

  // Fiado y cuentas: lo resuelve el colmado.
  if (prueba(t, /\b(apunta|apuntame|apuntamelo|apuntalo|apuntes|anotame\s+eso|anotalo\s+en|fiado|fiao|en\s+la\s+cuenta|a\s+mi\s+cuenta|en\s+mi\s+cuenta|la\s+cuenta\s+para|te\s+debo|abonar|abonarte|abono|saldar|acumulado|despues\s+paso\s+y\s+te\s+pago|te\s+pague|lo\s+que\s+te\s+pague|cargame|cargalo|junto\s+con\s+lo\s+anterior|lo\s+de\s+hoy\s+junto)\b/)) {
    return { tipo: "fiado" };
  }

  // Pago.
  const forma: Pago | null = /\b(transferencia|transferir|transferi|deposito)\b/.test(t) ? "transferencia" : /\btarjeta\b/.test(t) ? "tarjeta" : /\befectivo\b/.test(t) ? "efectivo" : null;
  if (prueba(t, /\b(numero\s+de\s+cuenta|cual\s+es\s+la\s+cuenta|a\s+que\s+cuenta|donde\s+te\s+(transfiero|deposito)|dame\s+la\s+cuenta)\b/)) return { tipo: "pago", forma: null, monto: null, pregunta: "cuenta", hecho: false };
  if (prueba(t, /\b(ya\s+)?(hice|mande|envie|te\s+mande|te\s+envie|te\s+hice)\s+(la\s+|el\s+)?(transferencia|dinero|pago|deposito)\b|\bconfirmame\s+si\s+(te\s+)?llego\b|\bte\s+llego\s+(el|la)\b/)) {
    return { tipo: "pago", forma: "transferencia", monto: null, pregunta: null, hecho: true };
  }
  if (forma && prueba(t, /^(aceptas|aceptan|acepta|reciben|recibes|coges|cogen|se\s+puede\s+pagar|puedo\s+pagar|tienen)\b/)) return { tipo: "pago", forma, monto: null, pregunta: "acepta", hecho: false };
  const conCuanto = t.match(/\b(?:cambio|devuelta|vuelto)\s+de\s+(\d+)\b|\bpagar(?:te)?\s+con\s+(\d+)\b|\bpago\s+con\s+(\d+)\b/);
  if (conCuanto) return { tipo: "pago", forma: "efectivo", monto: numero(conCuanto[1] ?? conCuanto[2] ?? conCuanto[3]), pregunta: null, hecho: false };
  if (forma && prueba(t, /\b(voy\s+a\s+pagar|te\s+voy\s+a\s+pagar|voy\s+a\s+pagarte|pago|pagare|te\s+pago|pagar)\b/)) return { tipo: "pago", forma, monto: null, pregunta: null, hecho: false };

  // Esperar: «déjame revisar», «no me acuerdo», «te voy a pedir varias cositas».
  if (prueba(t, /^(dejame\s+(revisar|ver|pensar|buscar|chequear)|no\s+me\s+acuerdo|que\s+no\s+me\s+acuerdo|ahora\s+te\s+digo|ya\s+te\s+digo|un\s+momento|un\s+momentico|que\s+voy\s+a\s+agregar|voy\s+a\s+agregar|te\s+voy\s+a\s+pedir)/)) {
    return { tipo: "espera" };
  }

  // Queja.
  if (prueba(t, /\bno\s+(fue|es)\s+lo\s+que\s+(yo\s+)?(pedi|ped[ií])\b|\bme\s+(mandaron|trajeron)\s+(mal|otra\s+cosa)\b|\bvino\s+(mal|incompleto)\b/)) return { tipo: "queja" };

  // Repetir.
  if (I.esRepetir(t) || prueba(t, /\blo\s+mismo\s+que\s+te\s+pedi\b/)) return { tipo: "repetir" };

  // Corregir la cantidad: «te dije dos, no tres», «son dos, no tres».
  const dije = t.match(/^(?:no\s*,?\s*)?(?:te\s+dije|dije|son|eran|era)\s+(\d+(?:[.,]\d+)?)\s*,?\s*(?:no\s+(\d+(?:[.,]\d+)?))?\s*$/);
  if (dije) return { tipo: "cambiarCantidad", nueva: numero(dije[1])!, anterior: numero(dije[2]) };

  // Quitar: «quítame el queso», «quítame una libra de arroz».
  const quita = t.match(/^(?:quitame|quita|quitale|sacame|saca|elimina|eliminame|borra|borrame|no\s+me\s+(?:pongas|traigas|mandes))\s+(.+)$/);
  if (quita && !/\b(mandame|dame|ponme|traeme)\b/.test(quita[1])) {
    const items = leerPedido(quita[1], jerga).map((i) => ({ ...i, sinCantidad: undefined }));
    if (items.length) return { tipo: "quitar", items };
  }

  // Cambiar un producto por otro: se le pregunta cuál (o lo ve el colmado).
  if (prueba(t, /^(no\s*,?\s*)?mejor\s+(dame|ponme|mandame|traeme)?\s*(el|la|los|las|uno|una)\b|^cambiame\b|^cambia\b|\bno\s+quiero\b.+\b(mandame|dame|ponme|traeme)\b|\bno\s+me\s+mandes\b.+\b(mandame|dame|ponme|traeme)\b/)) {
    return { tipo: "cambiar" };
  }

  // Envío: dirección, a qué hora, que llame al llegar…
  if (prueba(t, /\b(cuanto\s+(cuesta|cobran|sale)\s+(llevarlo|el\s+delivery|el\s+envio|mandarlo|llevar)|puedes\s+mandarlo|lo\s+puedes\s+mandar|mandarlo\s+ahora|con\s+el\s+delivery|mandar\s+la\s+ubicacion|te\s+mando\s+la\s+ubicacion|la\s+ubicacion|es\s+en\s+(la|el)\b|de\s+la\s+esquina|dile\s+que\s+me\s+llame|que\s+me\s+llame|cuando\s+llegue|antes\s+de\s+las|despues\s+de\s+las|todo\s+junto|para\s+el\s+barrio|para\s+la\s+casa|para\s+mi\s+casa|enviamelo\s+para|mandamelo\s+para)\b/)
    && !leerPedido(t, jerga).some((i) => i.conocido)) {
    return { tipo: "envio" };
  }
  if (prueba(t, /^(mandamelo|enviamelo|traemelo|llevamelo|mandalo|envialo)\b|^(mandame|enviame|traeme|llevame)\s+(eso|esto|todo|lo)$/) && !leerPedido(t, jerga).length) return { tipo: "envio" };

  // Precio: no se anota nada, se le pregunta al colmado.
  if (prueba(t, /\b(a\s+como|cuanto\s+(es\s+que\s+)?(cuesta|vale|cobras|me\s+sale|sale|es\s+la|es\s+el)|que\s+precio|el\s+precio|mas\s+barato|lo\s+mas\s+barato|dejas\s+mas\s+barato|me\s+lo\s+dejas)\b/)) {
    return { tipo: "precio" };
  }

  // Preguntas del colmado (horario, quién atiende…).
  if (I.esPreguntaHorario(t) || I.esPreguntaUbicacionColmado(t) || prueba(t, /^(quien\s+(esta|me)\s+(atendiendo|atiende)|quien\s+es|estan\s+abiertos|esta\s+abierto)/)) return { tipo: "pregunta" };

  // «Dame dos de veinte», «uno de esos que están ahí», «¿tú tienes de eso?»: no dice qué producto.
  if (prueba(t, /^(?:\S+\s+)?\d+\s+de\s+\d+\s*$|\buno\s+de\s+(esos|esas|los\s+que)\b|^(uno|una)\s+(que\s+estan|de\s+ahi)\b|\btienes\s+de\s+eso\b|\bdame\s+de\s+eso\b|^\s*(dame|ponme)?\s*(uno|una)\s+(que\s+esta|ahi)/)) {
    return { tipo: "aclarar" };
  }

  // «Está bien, déjalo así»: terminó.
  if (prueba(t, /^(esta\s+bien|ta\s+bien|asi\s+esta\s+bien)?\s*,?\s*(dejalo\s+asi|asi\s+esta\s+bien|asi\s+mismo)$/) || I.esFinDelPedido(t)) return { tipo: "confirmar" };

  const items = leerPedido(t, jerga);
  if (items.length) return { tipo: "pedido", items };
  // «Ponme otra funda»: dijo cuánto pero no de qué.
  if (prueba(t, /^(dame|ponme|mandame|echame|traeme|agregame)?\s*(otra|otro|un|una|\d+)\s+(funda|fundita|botella|caja|lata|libra|paquete|pote)s?$/)) return { tipo: "aclarar" };
  if (t.split(" ").length <= 6 && (texto.includes("?") || /^(quien|que|como|cuando|donde|cual)\b/.test(t))) return { tipo: "pregunta" };
  return { tipo: "otro" };
}
