import { normalizar } from "../lib/jerga";

// Reconocer lo que pide un cliente de colmado dominicano SIN inteligencia artificial:
// cantidades ("2", "dos", "media", "un chin"), unidades ("libras", "funda", "pote") y productos,
// con sus sinónimos y errores de escritura comunes ("arros", "cerbesa").
// Lo que no esté en la lista igual se anota tal cual: el colmado lo verifica.

export type Item = { nombre: string; cantidad: number; unidad: string | null; conocido: boolean; original: string };

/** Productos típicos del colmado (nombre que ve el colmado → formas en que lo escribe el cliente). */
export const CATALOGO: Array<[string, string[]]> = [
  ["Arroz", ["arroz", "arros", "aroz"]],
  ["Habichuelas", ["habichuela", "habichuelas", "abichuela", "abichuelas", "frijol", "frijoles", "habichuela roja", "habichuela negra"]],
  ["Aceite", ["aceite", "aseite", "aceite de cocina", "aceite crisol", "aceite mazola"]],
  ["Azúcar", ["azucar", "asucar", "azucar crema", "azucar blanca"]],
  ["Sal", ["sal"]],
  ["Café", ["cafe", "cafe santo domingo", "cafecito"]],
  ["Leche", ["leche", "leche liquida", "leche entera", "leche en polvo", "leche evaporada", "carnation"]],
  ["Huevos", ["huevo", "huevos", "guevo", "guevos", "webo", "webos"]],
  ["Pan", ["pan", "panes", "pan sobao", "pan de agua", "pan de sal", "pan bimbo", "pan de molde"]],
  ["Salami", ["salami", "salchichon", "induveca", "salami induveca", "salami super especial"]],
  ["Queso", ["queso", "queso de freir", "queso blanco", "queso amarillo", "queso de hoja", "queso geo"]],
  ["Jamón", ["jamon", "jamon picado"]],
  ["Mantequilla", ["mantequilla", "mantequilla manicera", "margarina"]],
  ["Plátanos", ["platano", "platanos", "platano verde", "platano maduro", "platanito"]],
  ["Guineos", ["guineo", "guineos", "guineito", "guineo verde", "guineo maduro"]],
  ["Yuca", ["yuca"]],
  ["Batata", ["batata"]],
  ["Papas", ["papa", "papas"]],
  ["Cebolla", ["cebolla", "cebollas", "sebolla"]],
  ["Ajo", ["ajo", "ajos", "cabeza de ajo"]],
  ["Ají", ["aji", "ajies", "aji morron", "aji cubanela"]],
  ["Tomate", ["tomate", "tomates"]],
  ["Pasta de tomate", ["pasta de tomate", "salsa de tomate", "pastica", "sopita de tomate"]],
  ["Sazón", ["sazon", "sazon completo", "sopita", "sopita maggi", "maggi", "caldo de pollo", "cubito", "cubitos"]],
  ["Orégano", ["oregano"]],
  ["Vinagre", ["vinagre"]],
  ["Espaguetis", ["espagueti", "espaguetis", "espaguetti", "spaghetti", "pasta", "fideo", "fideos", "coditos"]],
  ["Avena", ["avena", "quaker"]],
  ["Harina", ["harina", "harina de trigo", "harina de maiz", "maicena"]],
  ["Galletas", ["galleta", "galletas", "galleticas", "club social", "galleta de soda"]],
  ["Sardinas", ["sardina", "sardinas"]],
  ["Atún", ["atun", "atun en lata"]],
  ["Pollo", ["pollo", "pollo entero", "pechuga", "muslo", "alitas"]],
  ["Carne", ["carne", "carne de res", "carne molida", "res"]],
  ["Cerdo", ["cerdo", "chuleta", "chuletas", "carne de cerdo"]],
  ["Longaniza", ["longaniza"]],
  ["Salchichas", ["salchicha", "salchichas", "hot dog", "jot dog"]],
  ["Agua", ["agua", "botellita de agua", "agua planeta azul", "agua crystal"]],
  ["Botellón de agua", ["botellon", "botellon de agua", "galon de agua", "garrafon"]],
  ["Hielo", ["hielo", "funda de hielo", "fundita de hielo"]],
  ["Cerveza Presidente", ["presidente", "cerveza", "cerbeza", "cerveza presidente", "una fria", "una vestida de novia", "fria", "frias", "pecho frio"]],
  ["Cerveza Bohemia", ["bohemia"]],
  ["Cerveza Corona", ["corona"]],
  ["Ron Brugal", ["brugal", "ron brugal", "ron"]],
  ["Ron Barceló", ["barcelo", "ron barcelo"]],
  ["Ron Bermúdez", ["bermudez", "ron bermudez"]],
  ["Refresco", ["refresco", "soda", "coca cola", "coca", "cocacola", "pepsi", "sprite", "seven up", "7up", "country club", "red rock", "merengon", "kola real", "frescolita"]],
  ["Jugo", ["jugo", "jugo de naranja", "jugo rica", "jugo goya", "jugito", "tampico"]],
  ["Malta", ["malta", "malta morena", "malta india"]],
  ["Energizante", ["red bull", "monster", "energizante", "bebida energetica", "vive 100"]],
  ["Cigarrillos", ["cigarrillo", "cigarrillos", "cigarro", "cigarros", "malboro", "marlboro", "nacional", "cajetilla"]],
  ["Detergente", ["detergente", "ace", "ariel", "fab", "detergente en polvo"]],
  ["Cloro", ["cloro", "clorox", "blanqueador"]],
  ["Jabón de cuaba", ["cuaba", "jabon de cuaba", "jabon de fregar", "jabon de lavar"]],
  ["Jabón de baño", ["jabon", "jabon de baño", "jabon de bano", "jabon protex", "jabon palmolive"]],
  ["Papel de baño", ["papel de baño", "papel de bano", "papel higienico", "papel sanitario", "papel"]],
  ["Servilletas", ["servilleta", "servilletas"]],
  ["Pañales", ["pañal", "panal", "pañales", "panales", "huggies", "pampers"]],
  ["Pasta de dientes", ["pasta de dientes", "colgate", "crema dental"]],
  ["Desodorante", ["desodorante"]],
  ["Toallas sanitarias", ["toalla sanitaria", "toallas sanitarias", "kotex", "always"]],
  ["Shampoo", ["shampoo", "champu", "champoo"]],
  ["Fósforos", ["fosforo", "fosforos", "cerillos", "encendedor", "lighter"]],
  ["Velas", ["vela", "velas"]],
  ["Funda de basura", ["funda de basura", "fundas de basura"]],
  ["Gas", ["gas", "tanque de gas", "cilindro"]],
  ["Recarga", ["recarga", "recarga claro", "recarga altice", "tarjeta de recarga", "minutos"]],
  ["Pastillas para el dolor", ["acetaminofen", "panadol", "dolofen", "ibuprofeno", "pastilla", "pastillas", "aspirina"]],
  ["Chocolate", ["chocolate", "chocolate embajador", "chocolate de taza", "chocolatico"]],
  ["Dulces", ["dulce", "dulces", "caramelo", "caramelos", "chicle", "chicles", "bombon"]],
  ["Picaderas", ["doritos", "papitas", "platanitos", "chicharron", "picadera", "picaderas", "lays", "cheetos"]],
  ["Yogur", ["yogur", "yogurt", "yogurt yoka"]],
  ["Habas", ["habas"]],
  ["Maíz", ["maiz", "maiz dulce", "lata de maiz"]],
  ["Guandules", ["guandul", "guandules", "gandules"]],
  ["Aguacate", ["aguacate", "aguacates"]],
  ["Limones", ["limon", "limones"]],
  ["Naranjas", ["naranja", "naranjas", "naranja agria"]],
  ["Cilantro", ["cilantro", "cilantrico", "verdura", "verduritas"]],
  ["Chinola", ["chinola", "maracuya"]],
  ["Mayonesa", ["mayonesa", "mayo"]],
  ["Ketchup", ["ketchup", "catchup", "salsa ketchup"]],
  ["Mostaza", ["mostaza"]],
  ["Cereal", ["cereal", "corn flakes", "zucaritas"]],
  ["Pan de hot dog", ["pan de hot dog", "pan de hamburguesa"]],
  ["Hojas de afeitar", ["gillette", "hoja de afeitar", "navaja", "maquinita"]],
];

/** Unidades y su nombre para mostrar (singular, plural). */
const UNIDADES: Array<[RegExp, string, string]> = [
  [/^(libras?|lbs?|lb\.?)$/, "libra", "libras"],
  [/^(onzas?|oz)$/, "onza", "onzas"],
  [/^(litros?|lts?)$/, "litro", "litros"],
  [/^(galon(es)?|galones)$/, "galón", "galones"],
  [/^(fundas?|funditas?)$/, "funda", "fundas"],
  [/^(paquetes?|paq|paqueticos?)$/, "paquete", "paquetes"],
  [/^(cajas?|cajitas?)$/, "caja", "cajas"],
  [/^(latas?|latitas?)$/, "lata", "latas"],
  [/^(botellas?|botellitas?)$/, "botella", "botellas"],
  [/^(potes?|poteci?tos?)$/, "pote", "potes"],
  [/^(sobres?|sobrecitos?)$/, "sobre", "sobres"],
  [/^(docenas?)$/, "docena", "docenas"],
  [/^(cartones?|carton)$/, "cartón", "cartones"],
  [/^(pedazos?|pedacitos?)$/, "pedazo", "pedazos"],
  [/^(unidad(es)?)$/, "unidad", "unidades"],
  [/^(cabezas?)$/, "cabeza", "cabezas"],
  [/^(chin|chinchin|chin chin|poquito|poquitico)$/, "chin", "chin"],
];

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, media: 0.5, medio: 0.5, cuarto: 0.25, par: 2, docena: 12,
};

/** Palabras de relleno que se quitan antes de buscar el producto. */
const RELLENO = new Set([
  "dame", "damelo", "mandame", "manda", "mandeme", "envia", "enviame", "envieme", "quiero", "queria", "quisiera", "necesito", "ocupo",
  "me", "das", "da", "mandas", "traes", "trae", "traeme", "ponme", "pon", "agregame", "agrega", "agregar", "anade", "anademe", "tambien",
  "ademas", "y", "e", "por", "favor", "porfa", "porfavor", "xfa", "pls", "hola", "buenas", "buenos", "dias", "tardes", "noches",
  "saludos", "klk", "oye", "mira", "vecino", "vecina", "jefe", "mi", "amor", "mami", "papi", "loco", "manito", "manin", "tigre",
  "de", "del", "la", "el", "los", "las", "lo", "unos", "unas", "algo", "para", "pa", "que", "q", "si", "puedes", "podrias", "me", "lleva", "llevar",
]);

/** Distancia de Levenshtein (cuántas letras hay que cambiar) para errores de escritura. */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = tmp;
    }
  }
  return fila[b.length];
}

const INDICE = CATALOGO.flatMap(([nombre, sinonimos]) => sinonimos.map((s) => ({ nombre, s: normalizar(s) })))
  .sort((a, b) => b.s.length - a.s.length);

/** Busca el producto del catálogo en un texto ya normalizado. */
export function buscarEnCatalogo(texto: string): string | null {
  const t = ` ${texto} `;
  // 1. Frase completa del catálogo dentro del texto (las más largas primero).
  for (const { nombre, s } of INDICE) if (t.includes(` ${s} `)) return nombre;
  // 2. Errores de escritura palabra por palabra.
  const palabras = texto.split(" ").filter((p) => p.length >= 4);
  for (const p of palabras) {
    for (const { nombre, s } of INDICE) {
      if (s.includes(" ")) continue;
      const tope = s.length >= 7 ? 2 : 1;
      if (Math.abs(s.length - p.length) <= tope && distancia(p, s) <= tope) return nombre;
    }
  }
  return null;
}

function leerNumero(palabra: string): number | null {
  if (/^\d+([.,]\d+)?$/.test(palabra)) return Number(palabra.replace(",", "."));
  if (/^\d+\/\d+$/.test(palabra)) { const [a, b] = palabra.split("/").map(Number); return b ? a / b : null; }
  return NUMEROS[palabra] ?? null;
}

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Un pedazo del mensaje ("2 libras de arroz") → producto con cantidad y unidad. */
export function leerItem(pedazo: string, jerga: Map<string, string>): Item | null {
  const original = pedazo.trim();
  let t = normalizar(original).replace(/[^a-z0-9ñ/.,\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  // La jerga primero, con la frase entera ("una fria", "un pote").
  for (const [frase, producto] of jerga) {
    if (` ${t} `.includes(` ${frase} `)) {
      const resto = t.replace(frase, " ").trim().split(" ");
      const n = resto.map(leerNumero).find((x) => x !== null && x > 0 && x <= 100);
      const cantidadEnFrase = leerNumero(frase.split(" ")[0]);
      return { nombre: producto, cantidad: n ?? (cantidadEnFrase && cantidadEnFrase >= 1 ? cantidadEnFrase : 1), unidad: null, conocido: true, original };
    }
  }
  const palabras = t.split(" ");
  // Quitar relleno al principio ("dame", "quiero", "por favor"...), pero no los números.
  while (palabras.length && RELLENO.has(palabras[0]) && leerNumero(palabras[0]) === null) palabras.shift();
  let cantidad: number | null = null;
  let unidad: string | null = null;
  if (palabras.length && leerNumero(palabras[0]) !== null) {
    cantidad = leerNumero(palabras.shift()!);
    if (palabras[0] === "par" || palabras[0] === "docena") cantidad = (cantidad ?? 1) * (palabras.shift() === "par" ? 2 : 12);
    if (palabras[0] === "y" && palabras[1] === "media") { palabras.splice(0, 2); cantidad = (cantidad ?? 0) + 0.5; }
  }
  if (palabras.length) {
    const unidadDe = (p: string) => UNIDADES.find(([re]) => re.test(p));
    let u = unidadDe(palabras[0]);
    if (!u && palabras.length > 1 && unidadDe(`${palabras[0]} ${palabras[1]}`)) { u = unidadDe(`${palabras[0]} ${palabras[1]}`); palabras.shift(); }
    if (u) {
      palabras.shift();
      unidad = (cantidad ?? 1) > 1 ? u[2] : u[1];
      if (u[1] === "chin") cantidad = cantidad ?? 1;
    }
  }
  // Quitar "de" y relleno que quede.
  while (palabras.length && (palabras[0] === "de" || palabras[0] === "del")) palabras.shift();
  while (palabras.length && RELLENO.has(palabras[palabras.length - 1])) palabras.pop();
  const resto = palabras.join(" ").trim();
  if (!resto || resto.length < 2 || /^\d+$/.test(resto)) return null;
  if (palabras.every((p) => RELLENO.has(p))) return null;
  const delCatalogo = buscarEnCatalogo(resto);
  return {
    nombre: delCatalogo ?? capitalizar(resto.slice(0, 60)),
    cantidad: cantidad && cantidad > 0 ? cantidad : 1,
    unidad,
    conocido: Boolean(delCatalogo),
    original,
  };
}

/** Un mensaje completo ("dame 2 libras de arroz, un aceite y una fría") → lista de productos. */
export function leerPedido(mensaje: string, jerga: Map<string, string>): Item[] {
  const pedazos = mensaje
    .replace(/\s+(y|e|mas|más|tambien|también|ademas|además|con|\+)\s+(?=(\d|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|media|medio|[a-záéíóúñ]))/gi, "|")
    .split(/[|,;\n]+/);
  return pedazos.map((p) => leerItem(p, jerga)).filter((x): x is Item => x !== null);
}

/** Cómo se muestra un producto anotado: "2 libras de Arroz", "1 Aceite", "Un chin de Sal". */
export function textoItem(item: { nombre: string; cantidad?: number | null; unidad?: string | null }): string {
  const n = item.cantidad ?? 1;
  const cantidad = Number.isInteger(n) ? String(n) : n === 0.5 ? "½" : n === 0.25 ? "¼" : String(n);
  if (item.unidad === "chin") return `Un chin de ${item.nombre}`;
  return item.unidad ? `${cantidad} ${item.unidad} de ${item.nombre}` : `${cantidad} ${item.nombre}`;
}
