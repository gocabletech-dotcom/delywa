// Emojis para productos — compartido entre la pantalla de pedido (pedir.tsx)
// y el editor de menú (negocio/menu.tsx).
//
// Idea: los emojis mantienen la app liviana (no son imágenes, no pesan, cargan
// al instante). La app sugiere un emoji según el nombre del producto, y el dueño
// puede cambiarlo si quiere.

// Productos típicos de colmado que se muestran como "Pedir rápido" aunque no
// haya historial de pedidos.
export const PRODUCTOS_DEFAULT: Array<{ nombre: string; emoji: string }> = [
  { nombre: "Plátano", emoji: "🍌" },
  { nombre: "Huevo", emoji: "🥚" },
  { nombre: "Aceite", emoji: "🫒" },
  { nombre: "Arroz", emoji: "🍚" },
  { nombre: "Salami", emoji: "🌭" },
  { nombre: "Cerveza", emoji: "🍺" },
  { nombre: "Queso", emoji: "🧀" },
  { nombre: "Azúcar", emoji: "🍬" },
  { nombre: "Pan", emoji: "🍞" },
  { nombre: "Leche", emoji: "🥛" },
  { nombre: "Habichuela", emoji: "🫘" },
  { nombre: "Pollo", emoji: "🍗" },
];

// Diccionario de palabra clave → emoji, para ponerle figurita a cualquier
// producto a partir de su nombre.
const EMOJI_POR_PALABRA: Array<[RegExp, string]> = [
  [/pl[áa]tano|guineo|verde/i, "🍌"],
  [/huevo/i, "🥚"],
  [/aceite/i, "🫒"],
  [/arroz/i, "🍚"],
  [/salami|salchich|embutido/i, "🌭"],
  [/cerveza|presidente|corona|brahma|six/i, "🍺"],
  [/queso/i, "🧀"],
  [/az[úu]car/i, "🍬"],
  [/pan\b|pancito/i, "🍞"],
  [/leche/i, "🥛"],
  [/habichuela|frijol|guandul/i, "🫘"],
  [/pollo|pica pollo/i, "🍗"],
  [/carne|res|bistec|churrasco|bandera/i, "🥩"],
  [/cerdo|puerco|chuleta/i, "🥓"],
  [/hamburgues|chimi/i, "🍔"],
  [/yaroa|papa frita|papas fritas|fritura/i, "🍟"],
  [/empanada|pastelito|quipe/i, "🥟"],
  [/mang[úu]|mofongo|maduro/i, "🍳"],
  [/sandwich|s[áa]ndwich|club/i, "🥪"],
  [/pizza/i, "🍕"],
  [/taco/i, "🌮"],
  [/sopa|sancocho|asopao|caldo/i, "🍲"],
  [/espagueti|spaghetti|pasta|fideo/i, "🍝"],
  [/ensalada/i, "🥗"],
  [/agua/i, "💧"],
  [/refresco|soda|malta|coca|pepsi/i, "🥤"],
  [/jugo|morir so[ñn]ando|batida|licuado/i, "🧃"],
  [/caf[ée]/i, "☕"],
  [/t[ée]\b/i, "🍵"],
  [/cigarr|malboro|marlboro|nacional|tabaco/i, "🚬"],
  [/yuca|batata|[ñn]ame|v[íi]veres/i, "🥔"],
  [/tomate/i, "🍅"],
  [/cebolla|ajo|saz[óo]n|condimento/i, "🧅"],
  [/lim[óo]n|naranja|china/i, "🍋"],
  [/manzana/i, "🍎"],
  [/mantequilla|margarina/i, "🧈"],
  [/helado|mantecado/i, "🍨"],
  [/flan|dulce|postre|bizcocho|cake|pastel/i, "🍮"],
  [/jab[óo]n|detergente|cloro|limpieza|desinfect/i, "🧼"],
  [/papel|servilleta/i, "🧻"],
  [/dulce|caramelo|chocolate/i, "🍬"],
];

// Devuelve el emoji sugerido para un producto según su nombre.
// Si no reconoce nada, devuelve una figurita genérica de compra.
export function emojiParaProducto(nombre: string): string {
  const n = (nombre || "").trim();
  for (const [regex, emoji] of EMOJI_POR_PALABRA) {
    if (regex.test(n)) return emoji;
  }
  return "🛒";
}

// Emoji final a mostrar para un producto del menú:
// 1) el que el dueño eligió, 2) si no, el sugerido por el nombre.
export function emojiDeProducto(producto: { emoji?: string | null; nombre: string }): string {
  const elegido = (producto.emoji || "").trim();
  if (elegido) return elegido;
  return emojiParaProducto(producto.nombre);
}
