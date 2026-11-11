// D1 acepta como máximo 100 parámetros por sentencia: las inserciones de varias
// filas y los IN (...) largos deben partirse en trozos.
export const D1_MAX_PARAMS = 100;

export function chunkRows<T>(rows: T[], columnsPerRow: number): T[][] {
  const size = Math.max(1, Math.floor(D1_MAX_PARAMS / Math.max(1, columnsPerRow)));
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

export function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { message?: string } } | null)?.cause?.message ?? "";
  const message = error instanceof Error ? `${error.message} ${cause}` : String(error);
  return message.includes("UNIQUE constraint failed");
}

export function isValidZipPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
