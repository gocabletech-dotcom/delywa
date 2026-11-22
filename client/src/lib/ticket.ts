// Ticket para impresora térmica (58 u 80 mm) o cualquier impresora: se arma en un iframe oculto y se
// usa la ventana de imprimir del navegador. Sirve para pedidos y para ventas de mostrador.
// El ancho se guarda en este aparato (cada caja puede tener su impresora).

export type AnchoTicket = 58 | 80;
const CLAVE = "delywa-ticket-ancho";

export function anchoGuardado(): AnchoTicket {
  try { return localStorage.getItem(CLAVE) === "58" ? 58 : 80; } catch { return 80; }
}
export function guardarAncho(a: AnchoTicket) {
  try { localStorage.setItem(CLAVE, String(a)); } catch { /* sin almacenamiento */ }
}

export type DatosTicket = {
  negocio: { nombre: string; direccion?: string | null; telefono?: string | null; rnc?: string | null };
  titulo: string; // «Pedido #123», «Venta #45»
  fecha: Date;
  cliente?: { nombre?: string | null; telefono?: string | null; direccion?: string | null };
  lineas: Array<{ nombre: string; cantidad: number; precio?: number | null }>;
  delivery?: number;
  total: number;
  pago?: { metodo?: string | null; recibido?: number | null; devuelta?: number | null };
  nota?: string | null;
  pie?: string;
  moneda?: string;
};

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const dinero = (n: number, m: string) => `${m}${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METODOS: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", fiado: "Fiado (a cuenta)" };

export function htmlTicket(d: DatosTicket, ancho: AnchoTicket = anchoGuardado()): string {
  const m = d.moneda || "RD$";
  const mm = ancho === 58 ? 48 : 72; // área imprimible real
  const letra = ancho === 58 ? 11 : 12.5;
  const subtotal = d.lineas.reduce((s, l) => s + (l.precio ?? 0) * l.cantidad, 0);
  const filas = d.lineas.map((l) => `
    <tr><td class="c">${esc(l.cantidad)}</td><td>${esc(l.nombre)}</td><td class="r">${l.precio ? esc(dinero(l.precio * l.cantidad, m)) : ""}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(d.titulo)}</title><style>
    @page { size: ${ancho}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 3mm; width: ${mm + 6}mm; font: ${letra}px/1.35 "Courier New", ui-monospace, monospace; color: #000; }
    h1 { font-size: ${letra + 4}px; margin: 0 0 1mm; text-align: center; }
    .centro { text-align: center; } .r { text-align: right; white-space: nowrap; } .c { text-align: center; width: 7mm; vertical-align: top; }
    hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: 0.4mm 0; vertical-align: top; }
    .grande { font-size: ${letra + 3}px; font-weight: bold; } .b { font-weight: bold; }
  </style></head><body>
    <h1>${esc(d.negocio.nombre)}</h1>
    ${d.negocio.direccion ? `<div class="centro">${esc(d.negocio.direccion)}</div>` : ""}
    ${d.negocio.telefono ? `<div class="centro">Tel. ${esc(d.negocio.telefono)}</div>` : ""}
    ${d.negocio.rnc ? `<div class="centro">RNC ${esc(d.negocio.rnc)}</div>` : ""}
    <hr>
    <div class="b">${esc(d.titulo)}</div>
    <div>${esc(d.fecha.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }))}</div>
    ${d.cliente?.nombre ? `<div>Cliente: ${esc(d.cliente.nombre)}</div>` : ""}
    ${d.cliente?.telefono ? `<div>Tel.: ${esc(d.cliente.telefono)}</div>` : ""}
    ${d.cliente?.direccion ? `<div>Dirección: ${esc(d.cliente.direccion)}</div>` : ""}
    <hr>
    <table>${filas}</table>
    <hr>
    <table>
      ${d.delivery ? `<tr><td>Subtotal</td><td class="r">${esc(dinero(subtotal, m))}</td></tr><tr><td>Delivery</td><td class="r">${esc(dinero(d.delivery, m))}</td></tr>` : ""}
      <tr class="grande"><td>TOTAL</td><td class="r">${esc(dinero(d.total, m))}</td></tr>
      ${d.pago?.metodo ? `<tr><td>Pago</td><td class="r">${esc(METODOS[d.pago.metodo] ?? d.pago.metodo)}</td></tr>` : ""}
      ${d.pago?.recibido ? `<tr><td>Recibido</td><td class="r">${esc(dinero(d.pago.recibido, m))}</td></tr>` : ""}
      ${d.pago?.devuelta ? `<tr class="b"><td>Devuelta</td><td class="r">${esc(dinero(d.pago.devuelta, m))}</td></tr>` : ""}
    </table>
    ${d.nota ? `<hr><div>Nota: ${esc(d.nota)}</div>` : ""}
    <hr>
    <div class="centro">${esc(d.pie ?? "¡Gracias por su compra!")}</div>
    <div class="centro" style="font-size:${letra - 2}px;margin-top:1mm">Delywa.com</div>
  </body></html>`;
}

/** Abre la ventana de imprimir del navegador con el ticket. */
export function imprimirTicket(d: DatosTicket, ancho: AnchoTicket = anchoGuardado()) {
  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  Object.assign(marco.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(marco);
  const doc = marco.contentWindow?.document;
  if (!doc) { marco.remove(); return; }
  doc.open(); doc.write(htmlTicket(d, ancho)); doc.close();
  const quitar = () => setTimeout(() => marco.remove(), 1000);
  marco.contentWindow!.onafterprint = quitar;
  setTimeout(() => { marco.contentWindow?.focus(); marco.contentWindow?.print(); quitar(); }, 250);
}
