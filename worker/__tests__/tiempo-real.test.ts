import { describe, expect, it } from "vitest";
import { temasDeRuta } from "../lib/tiempo-real";

describe("tiempo real: qué rutas avisan a los paneles", () => {
  it("los cambios de pedidos avisan", () => {
    expect(temasDeRuta("/api/pedidos/5/estado")).toEqual(["pedidos"]);
    expect(temasDeRuta("/api/pedidos/5/recibir-retorno")).toEqual(["pedidos"]);
    expect(temasDeRuta("/api/pedidos/5/reenviar")).toEqual(["pedidos"]);
  });

  it("los cálculos que no guardan nada no avisan (evita recargas sin fin)", () => {
    expect(temasDeRuta("/api/colmados/1/pedidos/distancias-ruta")).toEqual([]);
    expect(temasDeRuta("/api/deliveries/3/pagos/calcular")).toEqual([]);
  });
});
