// @vitest-environment node
// Banco de pruebas del dueño (2026-11-19): 130 frases reales de colmado (capitaleño y cibaeño),
// cada una con lo que el bot debe entender. Se corre con cada versión: si el bot empeora, se ve aquí.
// El texto original está en datos/banco-frases-colmado.txt.
import { describe, expect, it } from "vitest";
import { entender, type Entendido } from "../bot/entender";
import { textoItem } from "../bot/productos";
import { quitarCasa } from "../bot/intenciones";

const jerga = new Map<string, string>();

/** Lo que entiende el bot, en corto: el tipo y, si es pedido o quitar, los productos como los ve el colmado. */
function resumen(frase: string): string {
  const e: Entendido = entender(quitarCasa(frase).texto, jerga);
  if (e.tipo === "pedido" || e.tipo === "quitar") return `${e.tipo}: ${e.items.map(textoItem).join(" | ")}`;
  if (e.tipo === "cambiarCantidad") return `cambiarCantidad: ${e.anterior ?? "?"}→${e.nueva}`;
  if (e.tipo === "pago") return `pago: ${[e.forma, e.monto, e.pregunta, e.hecho ? "hecho" : ""].filter(Boolean).join(" ")}`;
  return e.tipo;
}

const CASOS: Array<[string, string]> = [
  // 1. Pedidos cotidianos
  ["Dame un pan y una leche.", "pedido: 1 Pan | 1 Leche"],
  ["Ponme dos huevos.", "pedido: 2 Huevos"],
  ["Dame una libra de arroz.", "pedido: 1 libra de Arroz"],
  ["Échame medio pollo.", "pedido: ½ Pollo"],
  ["Mándame una funda de hielo.", "pedido: 1 funda de Hielo"],
  ["Dame un salami pequeño.", "pedido: 1 Salami pequeño"],
  ["Ponme un queso de cien.", "pedido: RD$100 de Queso"],
  ["Dame una lata de sardina.", "pedido: 1 lata de Sardina"],
  ["Mándame un refresco grande.", "pedido: 1 Refresco grande"],
  ["Dame dos jugos de esos pequeños.", "pedido: 2 Jugos pequeños"],
  ["Ponme una mantequilla.", "pedido: 1 Mantequilla"],
  ["Dame un paquetico de café.", "pedido: 1 paquete de Café"],
  ["Échame una libra de azúcar.", "pedido: 1 libra de Azúcar"],
  ["Dame una botella de aceite.", "pedido: 1 botella de Aceite"],
  ["Ponme una funda de espaguetis.", "pedido: 1 funda de Espaguetis"],
  // 2. Expresiones populares del Cibao
  ["Dame un chin de arroz.", "pedido: Un chin de Arroz"],
  ["Ponme un poquito de habichuela.", "pedido: Un chin de Habichuela"],
  ["Dame dos panes de agua.", "pedido: 2 Panes de agua"],
  ["Véndeme una fría.", "pedido: 1 Fría"],
  ["Dame una malta bien fría.", "pedido: 1 Malta bien fría"],
  ["Ponme un refresquito.", "pedido: 1 Refresquito"],
  ["Dame un botellón de agua.", "pedido: 1 Botellón de agua"],
  ["Mándame una funda de hielo pa' la casa.", "pedido: 1 funda de Hielo"],
  ["Dame un paquetico de galletas.", "pedido: 1 paquete de Galletas"],
  ["Ponme un salami de esos baraticos.", "pedido: 1 Salami barato"],
  ["Dame un chin de queso.", "pedido: Un chin de Queso"],
  ["Échame dos pesitos de cilantro.", "pedido: RD$2 de Cilantro"],
  ["Dame una libra de habichuela colorá.", "pedido: 1 libra de Habichuela colorada"],
  ["Ponme una funda de víveres.", "pedido: 1 funda de Víveres"],
  ["Dame un dulce de leche.", "pedido: 1 Dulce de leche"],
  // 3. Cantidades y dinero
  ["Dame cien pesos de arroz.", "pedido: RD$100 de Arroz"],
  ["Ponme cincuenta de queso.", "pedido: RD$50 de Queso"],
  ["Dame doscientos de salami.", "pedido: RD$200 de Salami"],
  ["Ponme tres panes de diez.", "pedido: 3 Panes de 10"],
  ["Dame cinco huevos por favor.", "pedido: 5 Huevos"],
  ["Quiero tres libras de arroz.", "pedido: 3 libras de Arroz"],
  ["Dame medio galón de aceite.", "pedido: ½ galón de Aceite"],
  ["Ponme dos fundas de azúcar.", "pedido: 2 fundas de Azúcar"],
  ["Dame una caja de cerveza.", "pedido: 1 caja de Cerveza"],
  ["Mándame tres refrescos de dos litros.", "pedido: 3 Refrescos de 2 litros"],
  ["Dame doscientos pesos de pollo.", "pedido: RD$200 de Pollo"],
  ["Ponme cien de jamoneta.", "pedido: RD$100 de Jamoneta"],
  ["Dame cuatro sopitas.", "pedido: 4 Sopitas"],
  ["Échame cincuenta pesos de hielo.", "pedido: RD$50 de Hielo"],
  ["Ponme un paquete de agua.", "pedido: 1 paquete de Agua"],
  // 4. Preguntas de precios: no se anota nada, se le pregunta al colmado
  ["¿A cómo tú tienes el arroz?", "precio"],
  ["¿Cuánto cuesta la libra de pollo?", "precio"],
  ["¿A cómo está el huevo?", "precio"],
  ["¿Cuánto vale ese queso?", "precio"],
  ["¿Qué precio tiene el botellón?", "precio"],
  ["¿Y la cerveza cuánto cuesta?", "precio"],
  ["¿A cómo me sale la funda?", "precio"],
  ["¿Cuánto es que cuesta el salami?", "precio"],
  ["¿No lo tienes más barato?", "precio"],
  ["¿Cuánto me sale todo eso?", "precio"],
  ["¿Y si llevo dos, me lo dejas más barato?", "precio"],
  ["¿Cuánto cuesta el paquete completo?", "precio"],
  ["¿A cómo está el aceite hoy?", "precio"],
  ["¿Cuánto vale la leche grande?", "precio"],
  ["¿Qué es lo más barato que tienes?", "precio"],
  // 5. Domicilio
  ["Mándame eso para la casa.", "envio"],
  ["Envíame dos panes y una leche.", "pedido: 2 Panes | 1 Leche"],
  ["Mándame una funda de comida.", "pedido: 1 funda de Comida"],
  ["¿Tú puedes mandarlo ahora?", "envio"],
  ["Mándamelo con el delivery.", "envio"],
  ["Te voy a mandar la ubicación.", "envio"],
  ["Es en la casa de la esquina.", "envio"],
  ["Dile que me llame cuando llegue.", "envio"],
  ["Mándame también una Coca-Cola.", "pedido: 1 Coca cola"],
  ["Espérate, que voy a agregar otra cosa.", "espera"],
  ["Mándame todo junto.", "envio"],
  ["No me mandes el refresco pequeño, mándame el grande.", "cambiar"],
  ["Envíamelo para el barrio.", "envio"],
  ["¿Cuánto cuesta llevarlo?", "envio"],
  ["Mándame eso antes de las seis.", "envio"],
  // 6. Fiado y cuentas: lo maneja el colmado
  ["Apúntamelo ahí.", "fiado"],
  ["Ponlo en la cuenta.", "fiado"],
  ["Después paso y te pago.", "fiado"],
  ["Déjame eso fiado.", "fiado"],
  ["¿Cuánto te debo de la otra vez?", "fiado"],
  ["Voy a abonarte cien pesos.", "fiado"],
  ["Quítame lo que te pagué ayer.", "fiado"],
  ["Anótame eso en mi cuenta.", "fiado"],
  ["Déjame la cuenta para mañana.", "fiado"],
  ["Ya yo te pagué eso.", "fiado"],
  ["¿Cuánto tengo acumulado?", "fiado"],
  ["Cárgame eso a mi cuenta.", "fiado"],
  ["No me apuntes más nada.", "fiado"],
  ["Voy a saldar la cuenta.", "fiado"],
  ["Ponme lo de hoy junto con lo anterior.", "fiado"],
  // 7. Formas de pago
  ["Te voy a pagar en efectivo.", "pago: efectivo"],
  ["¿Aceptas transferencia?", "pago: transferencia acepta"],
  ["Te mandé el dinero por transferencia.", "pago: transferencia hecho"],
  ["¿Cuál es el número de cuenta?", "pago: cuenta"],
  ["Voy a pagarte con tarjeta.", "pago: tarjeta"],
  ["Dame el cambio de quinientos.", "pago: efectivo 500"],
  ["Te voy a pagar con mil.", "pago: efectivo 1000"],
  ["Déjame revisar el dinero.", "espera"],
  ["Ya hice la transferencia.", "pago: transferencia hecho"],
  ["Confírmame si te llegó.", "pago: transferencia hecho"],
  // 8. Cambios, correcciones y cancelaciones
  ["Espérate, quítame el queso.", "quitar: 1 Queso"],
  ["Agrégame dos huevos más.", "pedido: 2 Huevos"],
  ["No, mejor dame el grande.", "cambiar"],
  ["Cámbiame ese refresco.", "cambiar"],
  ["Te dije dos, no tres.", "cambiarCantidad: 3→2"],
  ["Quítame una libra de arroz.", "quitar: 1 libra de Arroz"],
  ["Ponme otra funda.", "aclarar"],
  ["Cancélame ese pedido.", "cancelar"],
  ["Mejor no me mandes nada de eso.", "cancelar"],
  ["Agrégame un paquetico de café.", "pedido: 1 paquete de Café"],
  // 9. Frases espontáneas
  ["Buenas, ¿está abierto?", "pregunta"],
  ["¿Quién está atendiendo?", "pregunta"],
  ["Dame lo mismo que te pedí ahorita.", "repetir"],
  ["Mándame lo de siempre.", "repetir"],
  ["¿Tú tienes de eso?", "aclarar"],
  ["Dame uno de esos que están ahí.", "aclarar"],
  ["Espérate, que no me acuerdo qué más era.", "espera"],
  ["Mira, te voy a pedir varias cositas.", "espera"],
  ["Eso no fue lo que yo pedí.", "queja"],
  ["Está bien, déjalo así.", "confirmar"],
  // 10. Pruebas especiales de notas de voz
  ["Dame dos panes, una leche, tres huevos, un salami y una Coca-Cola grande.", "pedido: 2 Panes | 1 Leche | 3 Huevos | 1 Salami | 1 Coca cola grande"],
  ["Ponme tres refrescos, no, mejor cuatro.", "pedido: 4 Refrescos"],
  ["Dame una libra de arroz y medio kilo de azúcar.", "pedido: 1 libra de Arroz | ½ kilo de Azúcar"],
  ["Oye, mándame dos de esos panes y una fría pa' acá.", "pedido: 2 Panes | 1 Fría"],
  ["Dame dos libras de arroz y un... espérate, ahora te digo.", "pedido: 2 libras de Arroz"],
  ["Ponme de arroz cien pesos y de queso cincuenta.", "pedido: RD$100 de Arroz | RD$50 de Queso"],
  ["Dame dos de veinte.", "aclarar"],
  ["Ponme lo mío, lo de mi mujer y agrega dos jugos.", "pedido: 2 Jugos"],
  ["No quiero leche entera, mándame la descremada.", "cambiar"],
  ["Dame dos panes, dos panes, que son cuatro en total.", "pedido: 4 Panes"],
  // Reportes del dueño (notas de voz) y habla del Cibao
  ["Quiero hacer un nuevo pedido, 2 cervezas jumbo y 4 libras de arroz.", "pedido: 2 Cervezas jumbo | 4 libras de Arroz"],
  ["quiero hacer un nuevo pedido dos cerveza jumbo y cuatro libra de arroz", "pedido: 2 Cerveza jumbo | 4 libras de Arroz"],
  ["Pedir tres cervezas jumbo y presidente.", "pedido: 3 Cervezas jumbo Presidente"],
  ["dame do libra de arroi y una funda de pan pa la mujei", "pedido: 2 libras de Arroz | 1 funda de Pan"],
  ["ponme tre huevo y un poquito de caine", "pedido: 3 Huevo | Un chin de Carne"],
  ["mandame doh refresco grande poique tengo visita", "pedido: 2 Refresco grande"],
  ["dame una sebolla y un yelo", "pedido: 1 Cebolla | 1 Hielo"],
  ["ponme dos libras de abichuela y un aseite", "pedido: 2 libras de Habichuela | 1 Aceite"],
];

describe("banco de frases de colmado", () => {
  for (const [frase, esperado] of CASOS) {
    it(frase, () => expect(resumen(frase)).toBe(esperado));
  }
});
