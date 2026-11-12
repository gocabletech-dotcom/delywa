// Reduce las imágenes en el navegador antes de subirlas: las fotos de un
// teléfono pesan varios MB y el servidor (Cloudflare Workers) no las procesa.

type Opciones = {
  /** Lado máximo en píxeles. */
  max: number;
  tipo: "image/jpeg" | "image/png";
  /** Lienzo cuadrado con la imagen centrada sobre fondo blanco (logos). */
  cuadrado?: boolean;
};

export async function reducirImagen(file: File, { max, tipo, cuadrado = false }: Opciones): Promise<File> {
  // Los GIF se dejan como están para no perder la animación; lo que no sea imagen, tampoco se toca.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = cuadrado ? max : ancho;
    canvas.height = cuadrado ? max : alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    if (cuadrado || tipo === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, (canvas.width - ancho) / 2, (canvas.height - alto) / 2, ancho, alto);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, 0.85));
    // Si no se pudo convertir, o la imagen ya era pequeña y válida, se sube la original.
    if (!blob || (!cuadrado && escala === 1 && blob.size >= file.size)) return file;
    const nombre = file.name.replace(/\.[^.]*$/, "") + (tipo === "image/png" ? ".png" : ".jpg");
    return new File([blob], nombre, { type: tipo });
  } catch {
    return file;
  }
}

/** Logo: 512 × 512 PNG con fondo blanco, igual que hacía el servidor original. */
export const prepararLogo = (file: File) => reducirImagen(file, { max: 512, tipo: "image/png", cuadrado: true });
/** Foto de producto o comprobante: JPEG de hasta 1600 px por lado. */
export const prepararFoto = (file: File) => reducirImagen(file, { max: 1600, tipo: "image/jpeg" });
