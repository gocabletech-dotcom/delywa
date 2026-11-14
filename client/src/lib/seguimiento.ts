/** Enlace de seguimiento con su código privado (sin el código el enlace no muestra el pedido). */
export type PedidoConCodigo = { id: number; codigoSeguimiento?: string | null };

export function enlaceSeguimiento(pedido: PedidoConCodigo, compartir = false): string {
  const ruta = `${window.location.origin}${compartir ? "/compartir" : ""}/seguimiento/${pedido.id}`;
  return pedido.codigoSeguimiento ? `${ruta}?t=${encodeURIComponent(pedido.codigoSeguimiento)}` : ruta;
}
