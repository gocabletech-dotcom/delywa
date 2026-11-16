import { describe, expect, it } from "vitest";
import { esc } from "../PrinterService";

describe("impresión del pedido", () => {
  it("muestra lo que escribe el cliente como texto, nunca como HTML", () => {
    expect(esc(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(esc("Doña Ana & Hijos")).toBe("Doña Ana &amp; Hijos");
    expect(esc(null)).toBe("");
  });
});
