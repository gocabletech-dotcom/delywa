// Reduce las imágenes en el navegador antes de subirlas: las fotos de un
// teléfono pesan varios MB y el servidor (Cloudflare Workers) no las procesa.

type Opciones = {
  /** Lado máximo en píxeles. */
  max: number;
  tipo: "image/jpeg" | "image/png";
  /** Lienzo cuadrado con la imagen centrada sobre fondo blanco (logos). */
  cuadrado?: boolean;
};

/** La foto no se pudo leer (por ejemplo, HEIC en un navegador que no lo abre, o un archivo que no es imagen). */
export class FotoIlegible extends Error {
  constructor() { super("No pudimos leer esa foto. Toma una captura de pantalla del comprobante y envía esa."); }
}

const TIPOS_QUE_ACEPTA_EL_SERVIDOR = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Abre la imagen: primero con createImageBitmap y, si el navegador no puede, con <img> (Safari abre HEIC así). */
async function abrir(file: File): Promise<{ fuente: CanvasImageSource; ancho: number; alto: number; cerrar: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar: () => bitmap.close() };
  } catch { /* se intenta con <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, mal) => {
      const espera = setTimeout(() => mal(new Error("tiempo")), 15_000);
      img.onload = () => { clearTimeout(espera); ok(); };
      img.onerror = () => { clearTimeout(espera); mal(new Error("no se pudo abrir")); };
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("vacía");
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, cerrar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function reducirImagen(file: File, { max, tipo, cuadrado = false }: Opciones): Promise<File> {
  // Los GIF se dejan como están para no perder la animación.
  if (file.type === "image/gif") return file;
  let imagen: Awaited<ReturnType<typeof abrir>>;
  try {
    imagen = await abrir(file);
  } catch {
    // No se pudo abrir: solo sirve tal cual si ya es un tipo que el servidor acepta.
    if (TIPOS_QUE_ACEPTA_EL_SERVIDOR.includes(file.type)) return file;
    throw new FotoIlegible();
  }
  try {
    const escala = Math.min(1, max / Math.max(imagen.ancho, imagen.alto));
    const ancho = Math.max(1, Math.round(imagen.ancho * escala));
    const alto = Math.max(1, Math.round(imagen.alto * escala));
    const canvas = document.createElement("canvas");
    canvas.width = cuadrado ? max : ancho;
    canvas.height = cuadrado ? max : alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin lienzo");
    if (cuadrado || tipo === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(imagen.fuente, (canvas.width - ancho) / 2, (canvas.height - alto) / 2, ancho, alto);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, 0.85));
    if (!blob) throw new Error("sin conversión");
    // Si la imagen ya era pequeña, de un tipo aceptado y pesa menos que la convertida, se sube la original.
    if (!cuadrado && escala === 1 && TIPOS_QUE_ACEPTA_EL_SERVIDOR.includes(file.type) && blob.size >= file.size) return file;
    const nombre = (file.name || "foto").replace(/\.[^.]*$/, "") + (tipo === "image/png" ? ".png" : ".jpg");
    return new File([blob], nombre, { type: tipo });
  } catch {
    if (TIPOS_QUE_ACEPTA_EL_SERVIDOR.includes(file.type)) return file;
    throw new FotoIlegible();
  } finally {
    imagen.cerrar();
  }
}

/** Logo: 512 × 512 PNG con fondo blanco, igual que hacía el servidor original. */
export const prepararLogo = (file: File) => reducirImagen(file, { max: 512, tipo: "image/png", cuadrado: true });
/** Foto de producto o comprobante: JPEG de hasta 1600 px por lado. */
export const prepararFoto = (file: File) => reducirImagen(file, { max: 1600, tipo: "image/jpeg" });
