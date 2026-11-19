import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Verificación en dos pasos con una app de códigos (Google Authenticator, Microsoft Authenticator,
// 1Password…): códigos de 6 números que cambian cada 30 segundos (TOTP, RFC 6238, SHA-1).
// Solo para la cuenta de plataforma (decisión del 2026-11-18).

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASO_S = 30;

export function base32(bytes: Uint8Array): string {
  let bits = 0, valor = 0, salida = "";
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { salida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function deBase32(texto: string): Buffer {
  const limpio = texto.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, valor = 0;
  const salida: number[] = [];
  for (const ch of limpio) {
    valor = (valor << 5) | ALFABETO.indexOf(ch); bits += 5;
    if (bits >= 8) { salida.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(salida);
}

export const nuevoSecreto = () => base32(randomBytes(20));

export function codigoEn(secreto: string, paso: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac("sha1", deBase32(secreto)).update(contador).digest();
  const i = h[h.length - 1] & 15;
  const n = ((h[i] & 127) << 24) | (h[i + 1] << 16) | (h[i + 2] << 8) | h[i + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const pasoActual = (ahora = Date.now()) => Math.floor(ahora / 1000 / PASO_S);

/**
 * ¿El código es válido? Acepta el paso actual y el de antes y después (relojes desfasados).
 * Devuelve el paso usado, para que no se pueda usar dos veces el mismo código.
 */
export function verificarCodigo(secreto: string, codigo: string, ultimoPaso: number | null, ahora = Date.now()): number | null {
  const limpio = codigo.replace(/\s/g, "");
  if (!/^\d{6}$/.test(limpio)) return null;
  const actual = pasoActual(ahora);
  for (const p of [actual - 1, actual, actual + 1]) {
    if (ultimoPaso !== null && p <= ultimoPaso) continue;
    if (timingSafeEqual(Buffer.from(codigoEn(secreto, p)), Buffer.from(limpio))) return p;
  }
  return null;
}

/** Dirección que la app de códigos lee del QR. */
export function enlaceApp(secreto: string, cuenta: string): string {
  const etiqueta = encodeURIComponent(`DelyWa:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=DelyWa&algorithm=SHA1&digits=6&period=${PASO_S}`;
}

// ---------- Códigos de respaldo (por si se pierde el teléfono) ----------

const huella = (codigo: string) => createHash("sha256").update(`delywa-respaldo:${codigo.toUpperCase().replace(/[^A-Z0-9]/g, "")}`).digest("hex");

/** 8 códigos de un solo uso, como "K7P2-9XQM". Se guardan solo sus huellas. */
export function codigosDeRespaldo(): { codigos: string[]; huellas: string[] } {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codigos = Array.from({ length: 8 }, () => {
    const b = randomBytes(8);
    const t = [...b].map((x) => letras[x % letras.length]).join("");
    return `${t.slice(0, 4)}-${t.slice(4)}`;
  });
  return { codigos, huellas: codigos.map(huella) };
}

/** Si el código de respaldo es uno de los guardados, devuelve la lista sin él. */
export function usarRespaldo(huellas: string[] | null | undefined, codigo: string): string[] | null {
  if (!huellas?.length) return null;
  const h = huella(codigo);
  return huellas.includes(h) ? huellas.filter((x) => x !== h) : null;
}
