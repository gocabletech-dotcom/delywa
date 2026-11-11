const INTERNAL_ADDRESS_CONTEXT_PATTERN =
  /\s*\[Contexto de direcci[oó]n para IA[^\]]*\]\s*Formato:[\s\S]*?men[uú] gr[aá]fico\./gi;

/**
 * Removes legacy AI-only address instructions from conversation text before it
 * reaches a business-facing surface. Address data itself remains in the order
 * and conversation records, where delivery and future AI prompts can use it.
 */
export function stripInternalAddressContext(contenido: string): string {
  return contenido
    .replace(INTERNAL_ADDRESS_CONTEXT_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}