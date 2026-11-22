import type { Env } from "../env";
import type { Db } from "../db";
import { gastar, hayCupo, neuronasTexto, neuronasVoz } from "../lib/cupo-ia";

/** Se acabó el cupo gratis de hoy de la IA de Cloudflare: no se llama para no generar costo. */
export class CupoAgotado extends Error {
  constructor() { super("Se acabó el cupo gratis de IA de hoy"); }
}

// Inteligencia artificial de Cloudflare (Workers AI), sin ChatGPT:
// - Whisper para pasar notas de voz a texto.
// - Llama, solo cuando el bot del chat no entiende un mensaje.
// Plan gratis: 10,000 "neuronas" al día (unos 200 minutos de notas de voz).

export const MODELO_VOZ = "@cf/openai/whisper-large-v3-turbo";
export const MODELO_TEXTO = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Las pruebas reemplazan esta función por una IA simulada: nunca se llama a Cloudflare desde una prueba. */
export const workersAI = {
  /** Lo pone en true una prueba que simula la IA. */
  simulada: false,
  run: (env: Env, modelo: string, entrada: unknown): Promise<any> => {
    if (!env.AI) throw new Error("Workers AI no está conectado (binding AI)");
    return (env.AI as any).run(modelo, entrada);
  },
};

export const iaDisponible = (env: Env) => Boolean(env.AI) || workersAI.simulada;

/** Contexto para que Whisper oiga mejor un pedido de colmado dominicano (palabras, marcas y números). */
export const PISTA_VOZ = "Pedido a un colmado en República Dominicana. Dame dos libras de arroz, una funda de pan, "
  + "tres cervezas Presidente jumbo, un chin de queso, cien pesos de salami, una fría, habichuela, aceite, plátanos, "
  + "huevos, botellón de agua, funda de hielo, refresco, malta, sopita, cuatro, cinco, diez, cincuenta, doscientos.";

/** Nota de voz (base64) → texto en español. `pista`: productos de ese colmado, para que los oiga bien. */
export async function transcribir(env: Env, base64: string, pista?: string, db?: Db): Promise<string> {
  const initial_prompt = `${PISTA_VOZ}${pista ? ` ${pista}` : ""}`.slice(0, 800);
  const estimado = neuronasVoz(base64.length);
  if (db && !(await hayCupo(db, "voz", estimado))) throw new CupoAgotado();
  const r = await workersAI.run(env, MODELO_VOZ, { audio: base64, language: "es", task: "transcribe", vad_filter: true, initial_prompt });
  if (db) await gastar(db, "voz", estimado);
  return String(r?.text ?? "").trim();
}

export type Interpretacion = {
  tipo: "productos" | "pregunta" | "otro";
  productos: Array<{ nombre: string; cantidad: number | null; unidad: string | null; jergaOriginal: string | null }>;
  respuesta: string | null;
};

const ESQUEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["productos", "pregunta", "otro"] },
    productos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string" }, cantidad: { type: ["number", "null"] }, unidad: { type: ["string", "null"] }, jergaOriginal: { type: ["string", "null"] },
        },
        required: ["nombre"],
      },
    },
    respuesta: { type: ["string", "null"] },
  },
  required: ["tipo", "productos"],
};

/**
 * Se usa solo cuando el bot no entendió. Devuelve los productos que pidió (con la palabra
 * exacta que usó, para enseñársela al diccionario) o una respuesta corta a su pregunta.
 */
export async function interpretar(env: Env, datos: {
  mensaje: string; colmado: { nombre: string; direccion: string; horario: string; costoDelivery: string; pagos: string }; paso: string;
  /** Solo la parte del conocimiento (del colmado, del país o general) que tiene que ver con el mensaje. */
  conocimiento?: string;
  /** Productos del menú del colmado: ayudan a entender marcas y nombres locales. */
  menu?: string[];
  /** Lo que ya lleva anotado el cliente (para entender «otra», «de esa misma»). */
  anotado?: string[];
}, db?: Db): Promise<Interpretacion | null> {
  const sistema = `Eres el asistente del chat de un colmado de República Dominicana llamado "${datos.colmado.nombre}".
Entiendes el español dominicano y su jerga (por ejemplo: "una fría" es una cerveza, "un chin" es un poquito, "un pote" es una botella de ron, "habichuela" son frijoles).
Datos del colmado: dirección ${datos.colmado.direccion}; horario ${datos.colmado.horario}; delivery RD$${datos.colmado.costoDelivery}; pagos: ${datos.colmado.pagos}.
No conoces precios ni inventario: el colmado los confirma.${datos.conocimiento ? `
Información del colmado para contestar preguntas (úsala solo si responde lo que preguntan, no la inventes ni la amplíes):
${datos.conocimiento.slice(0, 3500)}` : ""}
${datos.menu?.length ? `Productos que vende este colmado (te ayudan a entender lo que pide): ${datos.menu.slice(0, 80).join(", ")}.
` : ""}${datos.anotado?.length ? `Ya tiene anotado: ${datos.anotado.slice(0, 15).join(", ")}.
` : ""}El cliente está en este paso: ${datos.paso}.
Responde SOLO con JSON:
- Si pide productos: tipo "productos" y la lista con nombre claro del producto (si es uno de los productos del colmado, ese nombre), cantidad (número o null si no la dijo), unidad (libra, funda, lata... o null) y jergaOriginal (las palabras EXACTAS que usó el cliente para ese producto, copiadas de su mensaje).
- Nunca agregues productos que el cliente no nombró. Si no estás seguro de qué producto es, tipo "pregunta" y pregúntale cuál quiere.
- Si pregunta algo: tipo "pregunta" y una respuesta corta (máximo 2 oraciones), amable y en español dominicano neutro, sin inventar precios.
- Si no es ninguna de las dos: tipo "otro" y una respuesta corta que lo invite a decir qué necesita.`;
  if (!iaDisponible(env)) return null;
  const letras = sistema.length + Math.min(datos.mensaje.length, 600);
  if (db && !(await hayCupo(db, "texto", neuronasTexto(letras, 400)))) return null;
  try {
    const r = await workersAI.run(env, MODELO_TEXTO, {
      messages: [{ role: "system", content: sistema }, { role: "user", content: datos.mensaje.slice(0, 600) }],
      response_format: { type: "json_schema", json_schema: ESQUEMA },
      max_tokens: 400,
      temperature: 0.2,
    });
    if (db) {
      const u = r?.usage;
      await gastar(db, "texto", u && typeof u.prompt_tokens === "number"
        ? u.prompt_tokens * (26_668 / 1_000_000) + (u.completion_tokens ?? 0) * (204_805 / 1_000_000)
        : neuronasTexto(letras, 200));
    }
    const crudo = typeof r?.response === "string" ? JSON.parse(r.response) : r?.response;
    if (!crudo || typeof crudo !== "object") return null;
    const tipo = ["productos", "pregunta", "otro"].includes(crudo.tipo) ? crudo.tipo : "otro";
    const productos = Array.isArray(crudo.productos) ? crudo.productos
      .filter((p: any) => p && typeof p.nombre === "string" && p.nombre.trim())
      .slice(0, 20)
      .map((p: any) => ({
        nombre: String(p.nombre).trim().slice(0, 60),
        cantidad: typeof p.cantidad === "number" && p.cantidad > 0 && p.cantidad <= 100 ? p.cantidad : null,
        unidad: typeof p.unidad === "string" && p.unidad.trim() ? p.unidad.trim().slice(0, 20) : null,
        jergaOriginal: typeof p.jergaOriginal === "string" && p.jergaOriginal.trim() ? p.jergaOriginal.trim().slice(0, 60) : null,
      })) : [];
    const respuesta = typeof crudo.respuesta === "string" && crudo.respuesta.trim() ? crudo.respuesta.trim().slice(0, 400) : null;
    return { tipo, productos, respuesta };
  } catch (err) {
    console.error("[bot] La IA de respaldo no respondió:", err instanceof Error ? err.message : err);
    return null;
  }
}
