import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  businessTheme,
  COLOR_PRIMARIO_FALLBACK,
  normalizeBusinessColor,
} from "../temaNegocio";

const clientSrc = path.resolve(__dirname, "../..");

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(clientSrc, relativePath), "utf8");
}

describe("tema de negocio", () => {
  it("expone el color configurado en todas las variables consumidas por controles y encabezados", () => {
    const theme = businessTheme("#7c3aed") as Record<string, string>;

    expect(normalizeBusinessColor("#7c3aed")).toBe("#7c3aed");
    expect(theme["--primary"]).toBe("262 83% 58%");
    expect(theme["--accent"]).toBe(theme["--primary"]);
    expect(theme["--ring"]).toBe(theme["--primary"]);
    expect(theme["--primary-foreground"]).toBe("0 0% 100%");
  });

  it.each([null, undefined, "", "#7c3ae", "#GGGGGG", "green"])(
    "usa verde de fallback para un color inválido (%s)",
    (color) => {
      expect(normalizeBusinessColor(color)).toBe(COLOR_PRIMARIO_FALLBACK);
      expect(businessTheme(color)["--primary"]).toBe("152 70% 30%");
    },
  );

  it("el verde brillante con el que se creaban los negocios cuenta como sin color propio", () => {
    expect(normalizeBusinessColor("#25D366")).toBe(COLOR_PRIMARIO_FALLBACK);
    expect(normalizeBusinessColor("#25d366")).toBe(COLOR_PRIMARIO_FALLBACK);
    expect(normalizeBusinessColor("#7c3aed")).toBe("#7c3aed");
  });

  it("elige texto oscuro para colores claros", () => {
    expect(businessTheme("#fef08a")["--primary-foreground"]).toBe("0 0% 7%");
  });
});

describe("contrato visual de los cuatro portales", () => {
  it("aplica el tema al panel del negocio, incluida la pantalla de configuración", () => {
    const layout = sourceOf("components/negocio/NegocioLayout.tsx");
    const settings = sourceOf("pages/negocio/settings.tsx");

    expect(layout).toContain("style={businessTheme(colmadoData?.colorPrimario)}");
    expect(layout).toContain("bg-primary text-primary-foreground");
    expect(layout).toContain("bg-primary/10");
    expect(settings).toContain("<NegocioLayout");
  });

  it.each([
    [
      "menú público",
      "pages/menu-grafico.tsx",
      "style={businessTheme(colmado.colorPrimario)}",
    ],
    [
      "portal de pedidos",
      "pages/pedir.tsx",
      "...businessTheme(colmado?.colorPrimario)",
    ],
    [
      "seguimiento",
      "pages/seguimiento.tsx",
      "style={businessTheme(data.colorPrimario)}",
    ],
    [
      "portal de delivery",
      "pages/repartidor.tsx",
      "style={businessTheme(session?.colmado?.colorPrimario)}",
    ],
  ])("mantiene el color configurado en %s", (_portal, file, themeUsage) => {
    const source = sourceOf(file);

    expect(source).toContain("import { businessTheme }");
    expect(source).toContain(themeUsage);
    expect(source).toMatch(/bg-primary|hsl\(var\(--primary\)\)/);
  });
});