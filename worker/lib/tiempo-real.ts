import type { Env } from "../env";

// Avisos de "algo cambió" a los paneles abiertos de un negocio (ver sala-negocio.ts).
// Si la sala no existe (pruebas, o Cloudflare sin Durable Objects) no pasa nada:
// el panel sigue recargándose cada pocos segundos como antes.

export type Tema = "pedidos" | "conversaciones" | "deliveries" | "todo";

export async function avisarNegocio(env: Env, colmadoId: number | null | undefined, temas: Tema[]): Promise<void> {
  if (!env.SALAS || !colmadoId || !Number.isInteger(colmadoId) || temas.length === 0) return;
  try {
    const sala = env.SALAS.get(env.SALAS.idFromName(`negocio:${colmadoId}`));
    await sala.fetch("https://sala/avisar", { method: "POST", body: JSON.stringify({ tipo: "cambio", temas: [...new Set(temas)] }) });
  } catch (err) {
    console.error("[tiempo-real] No se pudo avisar:", err instanceof Error ? err.message : err);
  }
}

/** Qué partes del panel cambian según la ruta de la API que se llamó. */
export function temasDeRuta(ruta: string): Tema[] {
  if (/^\/api\/portal-repartidor\/heartbeat/.test(ruta) || /^\/api\/deliveries\/\d+\/ubicacion/.test(ruta)) return [];
  // Solo calculan (no guardan nada): si avisaran, el panel recargaría pedidos, volvería a
  // calcular y se quedaría en un ciclo sin fin que no deja ver los cambios.
  if (/\/pedidos\/distancias-ruta$/.test(ruta) || /^\/api\/deliveries\/\d+\/pagos\/calcular$/.test(ruta)) return [];
  if (/^\/api\/conversaciones\//.test(ruta)) return ["conversaciones"];
  if (/^\/api\/pedidos\//.test(ruta) || /\/pedidos(\/|$)/.test(ruta)) return ["pedidos"];
  if (/^\/api\/(deliveries|portal-repartidor|pagos-delivery|saldos-delivery|paradas-ruta)/.test(ruta) || /\/deliveries(\/|$)/.test(ruta)) return ["deliveries", "pedidos"];
  return [];
}
