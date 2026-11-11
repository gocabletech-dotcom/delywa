import { describe, expect, it } from "vitest";
import { stripInternalAddressContext } from "@shared/visible-message";

describe("stripInternalAddressContext", () => {
  it("removes legacy AI address context while preserving the visible order", () => {
    const visibleOrder =
      "🛒 *Nuevo pedido desde Menú Gráfico #42*\n\n📍 *Dirección:* Calle 1, New York, NY, ZIP Code: 10001";
    const legacyContext =
      "\n\n[Contexto de dirección para IA — país: Estados Unidos] Formato: Dirección (ej: 123 Main St), Ciudad (ej: New York), State (ej: NY), ZIP Code (ej: 10001). La dirección fue capturada con campos estructurados por país desde el menú gráfico.";

    expect(stripInternalAddressContext(visibleOrder + legacyContext)).toBe(visibleOrder);
  });

  it("does not change ordinary business messages", () => {
    const message = "📦 Tu pedido fue recibido y está pendiente de confirmación.";

    expect(stripInternalAddressContext(message)).toBe(message);
  });
});