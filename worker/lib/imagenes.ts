// Solo se aceptan imágenes de mapa de bits. SVG queda fuera porque puede llevar scripts.
export const TIPOS_IMAGEN: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
};

const empieza = (b: Uint8Array, firma: number[], desde = 0) => firma.every((v, i) => b[desde + i] === v);

/** Tipo real del archivo según sus primeros bytes; no se confía en el Content-Type que envía el navegador. */
export function tipoPorFirma(bytes: Uint8Array): string | null {
  if (empieza(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (empieza(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (empieza(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (empieza(bytes, [0x52, 0x49, 0x46, 0x46]) && empieza(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}
