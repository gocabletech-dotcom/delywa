/**
 * Unit tests for the ZIP/postal-code format validation logic.
 * Tests exercise the exported `checkZipFormat` function from server/zipValidation.ts
 * — the same function used by every order-creation path in routes.ts.
 */

import { describe, it, expect } from "vitest";
import { checkZipFormat, isValidZipPattern, type ZipPaisInfo } from "../lib/zipValidation";

// ── Stubs ────────────────────────────────────────────────────────────────────

const US_PAIS: ZipPaisInfo = {
  requiereCodigoPostal: true,
  etiquetaCodigoPostal: "ZIP Code",
  ejemploCodigoPostal: "10001",
  patronCodigoPostal: String.raw`\d{5}(-\d{4})?`,
};

const NO_ZIP_PAIS: ZipPaisInfo = {
  requiereCodigoPostal: false,
  etiquetaCodigoPostal: null,
  ejemploCodigoPostal: null,
  patronCodigoPostal: null,
};

// Country requiring ZIP but with no format pattern configured
const ZIP_NO_PATTERN_PAIS: ZipPaisInfo = {
  requiereCodigoPostal: true,
  etiquetaCodigoPostal: "Código Postal",
  ejemploCodigoPostal: "12345",
  patronCodigoPostal: null,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("isValidZipPattern", () => {
  it("accepts a valid JavaScript regex pattern", () => {
    expect(isValidZipPattern(String.raw`\d{5}(-\d{4})?`)).toBe(true);
  });

  it("rejects an invalid JavaScript regex pattern", () => {
    expect(isValidZipPattern("[0-9{5}")).toBe(false);
  });
});

describe("checkZipFormat — no country / no ZIP requirement", () => {
  it("passes when pais is null (no country configured)", () => {
    expect(checkZipFormat(null, "Calle 1")).toEqual({ zipOk: true });
  });

  it("passes when country does not require ZIP", () => {
    expect(checkZipFormat(NO_ZIP_PAIS, "Calle 1, Santo Domingo")).toEqual({ zipOk: true });
  });
});

describe("checkZipFormat — US pattern (\\d{5}(-\\d{4})?), labeled addresses", () => {
  it("accepts a valid 5-digit ZIP after the label", () => {
    const result = checkZipFormat(US_PAIS, "Street Address: 123 Main St, ZIP Code: 10001");
    expect(result.zipOk).toBe(true);
  });

  it("accepts a valid ZIP+4 after the label", () => {
    const result = checkZipFormat(US_PAIS, "Street Address: 123 Main St, ZIP Code: 10001-1234");
    expect(result.zipOk).toBe(true);
  });

  it("rejects a malformed ZIP (too few digits) after the label", () => {
    const result = checkZipFormat(US_PAIS, "Street Address: 123 Main St, ZIP Code: 1234");
    expect(result.zipOk).toBe(false);
    expect(result.patronCP).toBeTruthy();
  });

  it("rejects an alphabetic value after the label", () => {
    const result = checkZipFormat(US_PAIS, "ZIP Code: abc");
    expect(result.zipOk).toBe(false);
  });

  it("rejects invalid ZIP+suffix: 12345-999 (only 3 suffix digits) after label", () => {
    const result = checkZipFormat(US_PAIS, "ZIP Code: 12345-999");
    expect(result.zipOk).toBe(false);
    expect(result.patronCP).toBeTruthy();
  });
});

describe("checkZipFormat — US pattern, unlabeled addresses (token scan)", () => {
  it("accepts a valid standalone 5-digit ZIP token", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St, New York, NY, 10001");
    expect(result.zipOk).toBe(true);
  });

  it("accepts a valid standalone ZIP+4 token", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St New York NY 10001-1234");
    expect(result.zipOk).toBe(true);
  });

  it("rejects when ZIP is completely absent", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St, New York, NY");
    expect(result.zipOk).toBe(false);
  });

  it("rejects 12345-999 as a standalone token — partial match must not pass", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St, New York, NY 12345-999");
    expect(result.zipOk).toBe(false);
    expect(result.patronCP).toBeTruthy();
  });

  it("rejects a 6-digit token that would match a 5-digit prefix", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St, New York, NY 123456");
    expect(result.zipOk).toBe(false);
  });

  it("rejects a 4-digit token", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St, New York, NY 1234");
    expect(result.zipOk).toBe(false);
  });

  it("does not fall back to digit-length check when pattern is configured", () => {
    const result = checkZipFormat(US_PAIS, "123 Main St, New York, NY, 10001");
    expect(result.zipOk).toBe(true);
    expect(result.patronCP).toBeTruthy();
  });
});

describe("checkZipFormat — no pattern configured (digit-length fallback)", () => {
  it("accepts when exact-length digit group is present", () => {
    const result = checkZipFormat(ZIP_NO_PATTERN_PAIS, "Calle 1, Ciudad, 12345");
    expect(result.zipOk).toBe(true);
  });

  it("rejects when no digit group of the expected length is present", () => {
    const result = checkZipFormat(ZIP_NO_PATTERN_PAIS, "Calle 1, Ciudad");
    expect(result.zipOk).toBe(false);
  });

  it("rejects when only a shorter digit group is present", () => {
    const result = checkZipFormat(ZIP_NO_PATTERN_PAIS, "Calle 123, Ciudad");
    expect(result.zipOk).toBe(false);
  });
});

describe("checkZipFormat — label present but value wrong format", () => {
  it("rejects when label is present but value is alphabetic with pattern configured", () => {
    const result = checkZipFormat(US_PAIS, "ZIP Code: ABCDE");
    expect(result.zipOk).toBe(false);
    expect(result.etiquetaCP).toBe("ZIP Code");
  });

  it("accepts when label is present and value matches, even if address has street numbers", () => {
    const result = checkZipFormat(US_PAIS, "Street Address: 123 Main St, City: New York, State: NY, ZIP Code: 10001");
    expect(result.zipOk).toBe(true);
  });
});
