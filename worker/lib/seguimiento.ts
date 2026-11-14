// Enlace de seguimiento del pedido. Lleva un código al azar (pedidos.codigo_seguimiento)
// para que nadie pueda ver el nombre, la dirección y el GPS del repartidor de otros
// pedidos con solo cambiar el número del enlace.

type ConCodigo = { id: number; codigoSeguimiento?: string | null };

export function enlaceSeguimiento(base: string, pedido: ConCodigo, compartir = false): string {
  const ruta = `${base}${compartir ? "/compartir" : ""}/seguimiento/${pedido.id}`;
  return pedido.codigoSeguimiento ? `${ruta}?t=${encodeURIComponent(pedido.codigoSeguimiento)}` : ruta;
}

/** ¿El código del enlace es el de este pedido? Los pedidos de antes de v2.33.0 no tienen código y se aceptan sin él. */
export function codigoSeguimientoValido(pedido: ConCodigo, t: string | undefined | null): boolean {
  if (!pedido.codigoSeguimiento) return true;
  const a = new TextEncoder().encode(pedido.codigoSeguimiento), b = new TextEncoder().encode(String(t ?? ""));
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}
