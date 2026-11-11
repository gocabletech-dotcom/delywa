import { describe, expect, it } from "vitest";
import { buildMapUrl } from "../mapUtils";

describe("buildMapUrl", () => {
  it("prefers stored GPS coordinates over a text address", () => {
    expect(
      buildMapUrl("123 Main Street, Cary, North Carolina 27513", {
        latitud: "35.7915",
        longitud: "-78.7811",
      })
    ).toBe("https://maps.google.com/?q=35.7915,-78.7811");
  });

  it("falls back to a Google Maps text search when GPS is unavailable", () => {
    expect(buildMapUrl("Calle 8, Santo Domingo, 10101"))
      .toBe("https://maps.google.com/search?q=Calle%208%2C%20Santo%20Domingo%2C%2010101");
  });
});