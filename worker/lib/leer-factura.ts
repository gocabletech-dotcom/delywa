import type { Env } from "../env";
import type { Db } from "../db";
import type { MenuProducto, Suplidor } from "@shared/schema";
import { CupoAgotado, iaDisponible, workersAI } from "../bot/ia";
import { gastarFactura, hayCupoFactura, neuronasFactura } from "./cupo-ia";
import { normalizar } from "./jerga";
import { claveDescripcion } from "./compras";

// Compras, fase B: la foto de la factura → la IA de Cloudflare (Llama 4 Scout, con visión) la lee →
// borrador para la pantalla de «Nueva compra». Nada se guarda sin que el colmadero lo revise.

export const MODELO_FACTURA = "@cf/meta/llama-4-scout-17b-16e-instruct";
export class FacturaIlegible extends Error {}

const ESQUEMA = {
  type: "object",
  properties: {
    esFactura: { type: "boolean" },
    suplidor: { type: "object", properties: { nombre: { type: ["string", "null"] }, rnc: { type: ["string", "null"] }, telefono: { type: ["string", "null"] } } },
    factura: { type: ["string", "null"] },
    ncf: { type: ["string", "null"] },
    fecha: { type: ["string", "null"] },
    lineas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          descripcion: { type: "string" }, cantidad: { type: ["number", "null"] }, unidadesPorPaquete: { type: ["number", "null"] },
          costo: { type: ["number", "null"] }, total: { type: ["number", "null"] },
        },
        required: ["descripcion"],
      },
    },
    subtotal: { type: ["number", "null"] }, itbis: { type: ["number", "null"] }, descuento: { type: ["number", "null"] }, total: { type: ["number", "null"] },
    formaPago: { type: ["string", "null"], enum: ["contado", "credito", null] },
  },
  required: ["esFactura", "lineas"],
};

const SISTEMA = `Lees facturas de compra de colmados de República Dominicana (suplidores, distribuidoras, almacenes).
Devuelve SOLO JSON con lo que está escrito en la foto; no inventes nada. Si un dato no se ve, null.
- esFactura: false si la foto no es una factura, conduce o recibo de compra.
- suplidor: quien vende (nombre o razón social, RNC de 9 u 11 dígitos, teléfono).
- factura: número de la factura. ncf: comprobante fiscal (empieza por B o E, ej. B0100000123).
- fecha: AAAA-MM-DD.
- lineas: una por producto, en el orden de la factura. descripcion: copiada tal cual. cantidad: la que se compró.
  unidadesPorPaquete: si la descripción dice cuántas trae (ej. "24/650", "CJ 12", "X24", "SACO 20LB" → 20), si no null.
  costo: precio de cada una (sin ITBIS si la factura lo separa). total: importe de la línea.
- subtotal, itbis, descuento, total: los de la factura.
- formaPago: "credito" si dice crédito o tiene condiciones/días de pago; "contado" si dice contado o efectivo.
Usa punto para decimales y quita las comas de miles (1,250.50 → 1250.5).`;

export type LineaLeida = { descripcion: string; cantidad: number; unidadesPorPaquete: number; costo: number; total: number | null; menuProductoId: number | null; como: "aprendido" | "parecido" | null };
export type Borrador = {
  suplidor: { nombre: string | null; rnc: string | null; telefono: string | null; id: number | null };
  factura: string | null; ncf: string | null; fecha: string | null; formaPago: "credito" | "contado" | null;
  subtotal: number | null; itbis: number | null; descuento: number | null; total: number | null;
  lineas: LineaLeida[];
  /** La suma de las líneas no da el subtotal o el total que leyó: hay que revisar. */
  revisar: boolean;
};

const numero = (v: unknown, max = 10_000_000) => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};
const textoCorto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** «PRES GDE 24/650», «ACEITE CJ 12», «X24», «SACO 20LB» → unidades por paquete. */
export function unidadesDe(descripcion: string): number | null {
  const t = descripcion.toLowerCase();
  const m = t.match(/\b(\d{1,3})\s*\/\s*\d{2,4}\b/) || t.match(/\b(?:x|cj|caja|cja|paq|pqt|paquete|fardo|bulto|saco|sco|dz|docena)\.?\s*(?:de\s*)?(\d{1,3})(?:\s*(?:lb|lbs|libras?|u|und|unid|uds))?\b/) || t.match(/\b(\d{1,3})\s*(?:un|und|unid|uds|pzas?)\b/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 2 && n <= 500 ? n : null;
}

/** Producto de la lista que se parece a lo que dice la factura (todas sus palabras aparecen, aunque abreviadas). */
export function productoParecido(descripcion: string, menu: Array<Pick<MenuProducto, "id" | "nombre">>): number | null {
  const fichas = claveDescripcion(descripcion).split(" ").filter((f) => f.length >= 3 && !/^\d/.test(f));
  let mejor: { id: number; n: number } | null = null;
  for (const p of menu) {
    const palabras = normalizar(p.nombre.replace(/\([^)]*\)/g, " ")).replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !["con", "del", "las", "los", "para"].includes(w));
    if (!palabras.length) continue;
    const todas = palabras.every((w) => fichas.some((f) => (f.length >= 4 && w.startsWith(f.slice(0, 4))) || (w.length >= 4 && f.startsWith(w.slice(0, 4))) || f === w));
    if (todas && (!mejor || palabras.length > mejor.n)) mejor = { id: p.id, n: palabras.length };
  }
  return mejor?.id ?? null;
}

export async function leerFactura(env: Env, db: Db, fotosBase64: string[]): Promise<Omit<Borrador, "suplidor" | "lineas"> & { suplidor: Omit<Borrador["suplidor"], "id">; lineas: Array<Omit<LineaLeida, "menuProductoId" | "como">> }> {
  if (!iaDisponible(env)) throw new FacturaIlegible("La lectura de facturas no está disponible ahora. Escríbela a mano.");
  const estimado = neuronasFactura(fotosBase64.length);
  if (!(await hayCupoFactura(db, estimado))) throw new CupoAgotado();
  let r: any;
  try {
    r = await workersAI.run(env, MODELO_FACTURA, {
      messages: [
        { role: "system", content: SISTEMA },
        { role: "user", content: [{ type: "text", text: "Lee esta factura de compra." }, ...fotosBase64.map((f) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${f}` } }))] },
      ],
      response_format: { type: "json_schema", json_schema: ESQUEMA },
      max_tokens: 3000,
      temperature: 0,
    });
  } catch (err) {
    console.error("[compras] La IA no pudo leer la factura:", err instanceof Error ? err.message : err);
    throw new FacturaIlegible("No pude leer la factura ahora. Intenta otra foto o escríbela a mano.");
  }
  const u = r?.usage;
  await gastarFactura(db, neuronasFactura(fotosBase64.length, typeof u?.prompt_tokens === "number" ? u.prompt_tokens : undefined, typeof u?.completion_tokens === "number" ? u.completion_tokens : undefined));
  let crudo: any;
  try { crudo = typeof r?.response === "string" ? JSON.parse(r.response) : r?.response; } catch { crudo = null; }
  if (!crudo || typeof crudo !== "object") throw new FacturaIlegible("No pude leer la factura. Toma la foto de frente, con buena luz y que se vea completa.");
  if (crudo.esFactura === false) throw new FacturaIlegible("Esa foto no parece una factura de compra.");
  const lineas = (Array.isArray(crudo.lineas) ? crudo.lineas : []).slice(0, 150).map((l: any) => {
    const descripcion = textoCorto(l?.descripcion, 120);
    if (!descripcion) return null;
    const cantidad = numero(l?.cantidad, 100000) || 1;
    const total = numero(l?.total);
    const costo = numero(l?.costo) ?? (total != null ? Math.round((total / cantidad) * 100) / 100 : 0);
    const paquete = numero(l?.unidadesPorPaquete, 1000);
    return { descripcion, cantidad, unidadesPorPaquete: paquete && paquete >= 1 ? Math.round(paquete) : unidadesDe(descripcion) ?? 1, costo, total };
  }).filter(Boolean) as Array<Omit<LineaLeida, "menuProductoId" | "como">>;
  if (!lineas.length) throw new FacturaIlegible("No encontré productos en la foto. Toma la foto de frente, con buena luz y que se vea completa.");
  const fecha = typeof crudo.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(crudo.fecha) && !Number.isNaN(Date.parse(crudo.fecha)) ? crudo.fecha : null;
  const subtotal = numero(crudo.subtotal), itbis = numero(crudo.itbis), descuento = numero(crudo.descuento), total = numero(crudo.total);
  const suma = lineas.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const revisar = (subtotal != null && Math.abs(suma - subtotal) > 1) || (total != null && Math.abs(suma + (itbis ?? 0) - (descuento ?? 0) - total) > 1);
  const s = crudo.suplidor ?? {};
  return {
    suplidor: { nombre: textoCorto(s.nombre, 100), rnc: typeof s.rnc === "string" ? s.rnc.replace(/\D/g, "").slice(0, 11) || null : null, telefono: typeof s.telefono === "string" ? s.telefono.replace(/[^\d+]/g, "").slice(0, 16) || null : null },
    factura: textoCorto(crudo.factura, 40), ncf: typeof crudo.ncf === "string" ? crudo.ncf.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 13) || null : null,
    fecha, formaPago: crudo.formaPago === "credito" || crudo.formaPago === "contado" ? crudo.formaPago : null,
    subtotal, itbis, descuento, total, lineas, revisar,
  };
}

/** Suplidor que ya existe: mismo RNC, o mismo nombre (sin S.R.L., tildes ni mayúsculas). */
export function suplidorParecido(leido: { nombre: string | null; rnc: string | null }, suplidores: Suplidor[]): number | null {
  if (leido.rnc) { const s = suplidores.find((x) => x.rnc && x.rnc === leido.rnc); if (s) return s.id; }
  const limpio = (t: string) => normalizar(t).replace(/\b(s\.?\s?r\.?\s?l|s\.?\s?a|eirl|c\.?\s?por\s?a)\.?\b/g, " ").replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!leido.nombre) return null;
  const k = limpio(leido.nombre);
  const s = suplidores.find((x) => { const n = limpio(x.nombre); return n === k || (n.length >= 6 && (k.includes(n) || n.includes(k))); });
  return s?.id ?? null;
}
