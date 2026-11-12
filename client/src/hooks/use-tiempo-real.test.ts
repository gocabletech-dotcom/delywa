import { describe, expect, it } from "vitest";
import { consultaAfectada } from "./use-tiempo-real";

describe("qué recarga cada aviso de tiempo real", () => {
  const q = (...queryKey: unknown[]) => ({ queryKey });
  it("un aviso de pedidos recarga pedidos y no mensajes", () => {
    expect(consultaAfectada(q("pedidos", 5), ["pedidos"])).toBe(true);
    expect(consultaAfectada(q(`/api/colmados/5/pedidos`), ["pedidos"])).toBe(true);
    expect(consultaAfectada(q("mensajes", 9), ["pedidos"])).toBe(false);
  });
  it("un aviso general recarga pedidos, conversaciones y repartidores, pero no el resto", () => {
    expect(consultaAfectada(q("conversaciones", 5, "todas"), ["todo"])).toBe(true);
    expect(consultaAfectada(q("unread-messages", 5), ["todo"])).toBe(true);
    expect(consultaAfectada(q("deliveries", 5), ["todo"])).toBe(true);
    expect(consultaAfectada(q("colmado", 5), ["todo"])).toBe(false);
  });
});
