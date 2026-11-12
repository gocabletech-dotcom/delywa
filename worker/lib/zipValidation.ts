/**
 * ZIP / postal-code format validation.
 *
 * This module exports the pure `checkZipFormat` function that takes a country
 * configuration object and an address string and returns whether the address
 * contains a properly-formatted postal code.  The async wrapper that fetches
 * the country record from the DB lives in routes.ts as `validarZipEnDireccion`.
 *
 * Keeping the pure logic here allows unit tests to exercise it directly without
 * a database or running server.
 */

export interface ZipPaisInfo {
  requiereCodigoPostal: boolean;
  etiquetaCodigoPostal: string | null;
  ejemploCodigoPostal: string | null;
  patronCodigoPostal: string | null;
}

export interface ZipCheckResult {
  zipOk: boolean;
  etiquetaCP?: string;
  ejemploCP?: string;
  patronCP?: string;
}

/**
 * Return whether a configured postal-code pattern is a valid JavaScript regex.
 *
 * Country configurations are stored as text, so this check belongs at the
 * write boundary rather than only when an address is validated.
 */
export function isValidZipPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether `direccionTexto` contains a postal code that satisfies the
 * country's requirements.
 *
 * Detection strategy (in order):
 *  1. Explicit label match — "ZIP Code: 10001" produced by the address form.
 *     When `patronCodigoPostal` is set the captured value is validated against
 *     the full anchored pattern; a mismatch rejects immediately.
 *  2. Token scan (only when `patronCodigoPostal` is configured) — the address
 *     is split into whitespace/comma-delimited tokens and each is tested against
 *     the full anchored pattern.  This prevents partial-match false positives
 *     (e.g. "12345-999" matching a 5-digit prefix of a longer string).
 *     When `patronCodigoPostal` IS set, the digit-length fallback is NOT used.
 *  3. Digit-length fallback (only when `patronCodigoPostal` is NOT configured)
 *     — a standalone digit group of exactly the length of `ejemploCodigoPostal`
 *     must appear on a word boundary.
 */
export function checkZipFormat(
  pais: ZipPaisInfo | null | undefined,
  direccionTexto: string
): ZipCheckResult {
  if (!pais) return { zipOk: true };
  if (!pais.requiereCodigoPostal || !pais.etiquetaCodigoPostal) return { zipOk: true };

  const etiquetaCP = pais.etiquetaCodigoPostal;
  const ejemploCP = pais.ejemploCodigoPostal || "10001";
  const patronCP = pais.patronCodigoPostal || undefined;

  // Helper: test a single token against the full anchored format pattern.
  const matchesFullPattern = (token: string): boolean => {
    if (!patronCP) return true;
    try {
      return new RegExp(`^(?:${patronCP})$`, "i").test(token);
    } catch {
      return true; // malformed regex in DB — skip format check
    }
  };

  // 1. Explicit label match: "ZIP Code: 10001" or "ZIP Code 10001"
  const escapedLabel = etiquetaCP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = new RegExp(`${escapedLabel}[:\\s]+(\\S+)`, "i");
  const labelMatch = labelPattern.exec(direccionTexto);
  if (labelMatch) {
    if (patronCP) {
      if (matchesFullPattern(labelMatch[1])) return { zipOk: true, patronCP };
      return { zipOk: false, etiquetaCP, ejemploCP, patronCP };
    }
    return { zipOk: true };
  }

  // 2. Token scan — authoritative when patronCP is configured.
  if (patronCP) {
    const tokens = direccionTexto.split(/[\s,]+/).filter(Boolean);
    for (const token of tokens) {
      if (matchesFullPattern(token)) return { zipOk: true, patronCP };
    }
    return { zipOk: false, etiquetaCP, ejemploCP, patronCP };
  }

  // 3. Digit-length fallback (no format pattern configured).
  const zipDigits = ejemploCP.replace(/\D/g, "");
  if (zipDigits.length >= 4) {
    const exactLenPattern = new RegExp(`\\b\\d{${zipDigits.length}}\\b`);
    if (exactLenPattern.test(direccionTexto)) return { zipOk: true };
  }

  return { zipOk: false, etiquetaCP, ejemploCP };
}
