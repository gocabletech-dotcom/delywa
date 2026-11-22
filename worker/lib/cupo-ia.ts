import { eq, sql } from "drizzle-orm";
import { iaConsumo } from "@shared/schema";
import type { Db } from "../db";
import { getConfiguracion } from "../storage/catalogos";

// Cupo diario de la IA de Cloudflare (Workers AI) para que nunca cueste dinero.
// Plan gratis: 10,000 «neuronas» al día, se reinicia a las 00:00 UTC. Pasarse cuesta US$0.011
// por cada 1,000 en el plan de pago (en el gratis, Cloudflare corta). El bot se detiene antes:
//  - El texto (Llama) usa hasta el 80 % del cupo; el resto queda para las notas de voz (Whisper).
//  - Sin cupo, el mensaje le llega al colmado como siempre y el bot no llama a la IA.
// Los precios salen de https://developers.cloudflare.com/workers-ai/platform/pricing/ (nov-2026).

export const NEURONAS_GRATIS = 10_000;
export const CUPO_POR_DEFECTO = 9_000;
export const CLAVE_CUPO = "ia_neuronas_diarias";
const PARTE_TEXTO = 0.8;

const LLAMA = { entrada: 26_668 / 1_000_000, salida: 204_805 / 1_000_000 };
const WHISPER_POR_MINUTO = 46.63;

/** Neuronas de una llamada a Llama 3.3 70B (≈ 4 letras por token). */
export function neuronasTexto(letrasEntrada: number, tokensSalida: number): number {
  return (letrasEntrada / 4) * LLAMA.entrada + tokensSalida * LLAMA.salida;
}

/**
 * Neuronas de una nota de voz. Se calcula por el tamaño, a la baja de calidad (3 KB por segundo),
 * para que nunca se quede corto: una nota de 15 s en WebM pesa unos 50 KB → ~14 neuronas.
 */
export function neuronasVoz(largoBase64: number): number {
  const segundos = Math.max(1, (largoBase64 * 0.75) / 3_000);
  return (segundos / 60) * WHISPER_POR_MINUTO;
}

/** Día de Cloudflare (UTC). */
export const diaIa = (ahora = new Date()) => ahora.toISOString().slice(0, 10);

export async function cupoDiario(db: Db): Promise<number> {
  const crudo = (await getConfiguracion(db, CLAVE_CUPO).catch(() => undefined))?.valor;
  const v = crudo != null && crudo.trim() !== "" ? Number(crudo) : NaN;
  // Nunca más del plan gratis.
  return Number.isFinite(v) && v >= 0 ? Math.min(v, NEURONAS_GRATIS) : CUPO_POR_DEFECTO;
}

export async function consumoDeHoy(db: Db) {
  const [fila] = await db.select().from(iaConsumo).where(eq(iaConsumo.dia, diaIa()));
  return { dia: diaIa(), neuronas: fila?.neuronas ?? 0, llamadasTexto: fila?.llamadasTexto ?? 0, notasDeVoz: fila?.notasDeVoz ?? 0, sinCupo: fila?.sinCupo ?? 0 };
}

/** ¿Cabe esta llamada en el cupo de hoy? Si no cabe, lo anota (para verlo en Plataforma). */
export async function hayCupo(db: Db, tipo: "texto" | "voz", estimado: number): Promise<boolean> {
  const [cupo, hoy] = await Promise.all([cupoDiario(db), consumoDeHoy(db)]);
  const tope = tipo === "texto" ? cupo * PARTE_TEXTO : cupo;
  if (hoy.neuronas + estimado <= tope) return true;
  await db.insert(iaConsumo).values({ dia: hoy.dia, sinCupo: 1 })
    .onConflictDoUpdate({ target: iaConsumo.dia, set: { sinCupo: sql`${iaConsumo.sinCupo} + 1` } }).catch(() => undefined);
  return false;
}

export async function gastar(db: Db, tipo: "texto" | "voz", neuronas: number): Promise<void> {
  const n = Math.max(0, neuronas);
  await db.insert(iaConsumo).values({ dia: diaIa(), neuronas: n, llamadasTexto: tipo === "texto" ? 1 : 0, notasDeVoz: tipo === "voz" ? 1 : 0 })
    .onConflictDoUpdate({
      target: iaConsumo.dia,
      set: {
        neuronas: sql`${iaConsumo.neuronas} + ${n}`,
        llamadasTexto: sql`${iaConsumo.llamadasTexto} + ${tipo === "texto" ? 1 : 0}`,
        notasDeVoz: sql`${iaConsumo.notasDeVoz} + ${tipo === "voz" ? 1 : 0}`,
      },
    }).catch(() => undefined);
}
