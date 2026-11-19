// @vitest-environment node
// Reglas del bot sin IA: cómo lee pedidos e intenciones (no necesita base de datos).
import { describe, expect, it } from "vitest";
import { emojiDe, leerCantidades, leerPedido, textoItem } from "../bot/productos";
import * as I from "../bot/intenciones";

const jerga = new Map([["un pote", "Ron Brugal 700 ml"], ["la verde", "Cerveza Heineken"]]);
const leer = (t: string) => leerPedido(t, jerga).map(textoItem);

describe("productos sin cantidad", () => {
  it("marca lo que llegó sin cantidad ni monto", () => {
    const items = leerPedido("arroz, habichuela y aceite", jerga);
    expect(items.map((i) => [i.nombre, Boolean(i.sinCantidad)])).toEqual([["Arroz", true], ["Habichuela", true], ["Aceite", true]]);
    expect(leerPedido("2 libras de arroz, un aceite, 50 pesos de queso, una libra de azúcar, la verde", jerga).some((i) => i.sinCantidad)).toBe(false);
  });

  it("nota de voz: la cantidad va después del verbo y la marca después del producto", () => {
    expect(leer("Pedir tres cervezas jumbo y presidente.")).toEqual(["3 Cervezas jumbo Presidente"]);
    expect(leer("Dame 3 cervezas jumbo, Presidente.")).toEqual(["3 Cervezas jumbo Presidente"]);
    expect(leer("Quiero pedir 2 libras de arroz")).toEqual(["2 libras de Arroz"]);
    expect(leer("Me puedes mandar tres cervezas")).toEqual(["3 Cervezas"]);
    expect(leerPedido("Pedir tres cervezas jumbo y presidente.", jerga).some((i) => i.sinCantidad)).toBe(false);
  });

  it("lee las cantidades en orden: números, montos y unidades", () => {
    expect(leerCantidades("15, 25, 30")).toEqual([{ cantidad: 1, unidad: null, monto: 15 }, { cantidad: 1, unidad: null, monto: 25 }, { cantidad: 1, unidad: null, monto: 30 }]);
    expect(leerCantidades("15 25 30").map((x) => x.monto)).toEqual([15, 25, 30]);
    expect(leerCantidades("2 libras, 50 pesos y 1")).toEqual([{ cantidad: 2, unidad: "libras", monto: null }, { cantidad: 1, unidad: null, monto: 50 }, { cantidad: 1, unidad: null, monto: null }]);
    expect(leerCantidades("dos")).toEqual([{ cantidad: 2, unidad: null, monto: null }]);
    expect(leerCantidades("eso es todo")).toEqual([]);
  });
});

describe("lee pedidos de colmado sin IA", () => {
  it("cantidades, unidades y productos", () => {
    expect(leer("dame 2 libras de arroz y un aceite")).toEqual(["2 libras de Arroz", "1 Aceite"]);
    expect(leer("Hola, mándame media libra de salami, 3 huevos y un chin de sal por favor")).toEqual(["½ libra de Salami", "3 Huevos", "Un chin de Sal"]);
    expect(leer("una fría y un pote")).toEqual(["1 Fría", "1 Ron Brugal 700 ml"]);
    expect(leer("dos fundas de pan, una coca cola")).toEqual(["2 fundas de Pan", "1 Coca cola"]);
  });

  it("pedido por dinero: el número es lo que quiere gastar, no la cantidad", () => {
    expect(leer("dame 10 pesos de ajo")).toEqual(["RD$10 de Ajo"]);
    expect(leer("dame 10 de ajo")).toEqual(["RD$10 de Ajo"]);
    expect(leer("RD$50 de salami y 2 libras de arroz")).toEqual(["RD$50 de Salami", "2 libras de Arroz"]);
    expect(leer("25 pesos de queso, un pan")).toEqual(["RD$25 de Queso", "1 Pan"]);
    expect(leer("cincuenta pesos de salami")).toEqual(["RD$50 de Salami"]);
    expect(leer("ajo de a 10")).toEqual(["RD$10 de Ajo"]);
    expect(leer("100 pesos de la verde")).toEqual(["RD$100 de Cerveza Heineken"]);
    const [ajo] = leerPedido("dame 10 pesos de ajo", jerga);
    expect(ajo).toMatchObject({ nombre: "Ajo", cantidad: 1, monto: 10 });
    // Con unidad sigue siendo cantidad.
    expect(leer("10 libras de arroz")).toEqual(["10 libras de Arroz"]);
    expect(leer("3 panes")).toEqual(["3 Panes"]);
    expect(leer("un refresco de 2 litros")).toEqual(["1 Refresco de 2 litros"]);
  });

  it("entiende errores de escritura", () => {
    expect(leer("quiero arros y cerbeza")).toEqual(["1 Arroz", "1 Cerveza"]);
    expect(leer("4 guevos")).toEqual(["4 Huevos"]);
  });

  it("anota tal cual lo que no conoce (el colmado lo verifica)", () => {
    const [x] = leerPedido("un paquete de galletas de limón marca nueva", jerga);
    expect(x).toMatchObject({ nombre: "Galletas de limón marca nueva", unidad: "paquete", conocido: true });
    const [y] = leerPedido("2 tostones congelados", jerga);
    expect(y).toMatchObject({ nombre: "Tostones congelados", cantidad: 2, conocido: false });
  });

  it("los saludos y el relleno no son productos", () => {
    expect(leer("hola buenas")).toEqual([]);
    expect(leer("por favor")).toEqual([]);
    expect(leer("hey")).toEqual([]);
  });

  it("respeta las palabras del cliente: solo corrige la ortografía", () => {
    // El caso del dueño (2026-11-13): antes salía "1 Sazón, 1 Cilantro" y se perdían el arroz y el pollo.
    expect(leer("hey quiero una libra de arroz, 2 libras de pollo. sopita, verdura"))
      .toEqual(["1 libra de Arroz", "2 libras de Pollo", "1 Sopita", "1 Verdura"]);
    expect(leer("Hey! quiero 3 frias. y un pote")).toEqual(["3 Frías", "1 Ron Brugal 700 ml"]);
    expect(leer("una cajetilla de malboro y dos aseite")).toEqual(["1 Cajetilla de marlboro", "2 Aceite"]);
    expect(leer("medio litro de jugo de chinola")).toEqual(["½ litro de Jugo de chinola"]);
  });

  it("cada producto lleva su emoji", () => {
    expect(emojiDe("Arroz")).toBe("🍚");
    expect(emojiDe("Fría")).toBe("🍺");
    expect(emojiDe("Cerveza Presidente")).toBe("🍺");
    expect(emojiDe("Aceite")).toBe("🫒");
    expect(emojiDe("Verdura")).toBe("🥬");
    expect(emojiDe("Sopita")).toBe("🍲");
    expect(emojiDe("Tostones congelados")).toBe("🛒");
  });
});

describe("intenciones", () => {
  it("sí, no, eso es todo, gracias", () => {
    expect(I.esAfirmativo("Sí")).toBe(true);
    expect(I.esAfirmativo("dale")).toBe(true);
    expect(I.esNegativo("no, nada más")).toBe(true);
    expect(I.esFinDelPedido("eso es todo")).toBe(true);
    expect(I.esGracias("muchas gracias!!")).toBe(true);
    expect(I.esSaludo("Buenas noches")).toBe(true);
  });

  it("forma de pago y monto", () => {
    expect(I.leerPago("💵 Efectivo")).toBe("efectivo");
    expect(I.leerPago("con tarjeta")).toBe("tarjeta");
    expect(I.leerPago("te hago una transferencia")).toBe("transferencia");
    expect(I.leerPago("no sé")).toBeNull();
    expect(I.leerMonto("1000")).toBe(1000);
    expect(I.leerMonto("con 1,000")).toBe(1000);
    expect(I.leerMonto("un billete de mil")).toBe(1000);
    expect(I.leerMonto("exacto")).toBe(0);
    expect(I.leerMonto("no sé")).toBeNull();
  });

  it("saluda según la hora del colmado", () => {
    const rd = "America/Santo_Domingo"; // UTC-4
    expect(I.saludoPorHora(rd, new Date("2026-11-12T12:00:00Z"))).toBe("Buenos días"); // 8:00 a. m.
    expect(I.saludoPorHora(rd, new Date("2026-11-12T19:00:00Z"))).toBe("Buenas tardes"); // 3:00 p. m.
    expect(I.saludoPorHora(rd, new Date("2026-11-13T01:00:00Z"))).toBe("Buenas noches"); // 9:00 p. m.
  });

  it("pregunta por un producto", () => {
    expect(I.preguntaPorProducto("¿Tienen gas?")).toBe("gas");
    expect(I.preguntaPorProducto("hay pan hoy")).toBe("pan");
  });
});
