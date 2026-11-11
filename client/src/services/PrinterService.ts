import { formatDateRD } from "@/lib/date-utils";
import { jsPDF } from "jspdf";

interface Producto {
  nombre: string;
  cantidad?: number;
  precio?: number;
  monto?: number;
}

interface Pedido {
  id: number;
  clienteNombre: string;
  clienteWhatsapp: string;
  clienteUbicacion: string;
  productos: string;
  total: string;
  totalConfirmado?: string;
  montoPago?: string;
  necesitaDevuelta?: boolean;
  metodoPago?: string;
  fechaCreacion?: string;
  creadoEn?: string;
  estado: string;
  tipoEntrega?: "delivery" | "pickup";
  costoDeliveryAplicado?: string | null;
  sustituciones?: Array<{ original: string; nuevo: string; monto?: number; estado: string }>;
}

interface Colmado {
  id: number;
  nombre: string;
  direccion: string;
  whatsappNumero: string;
  telefonoAlternativo?: string | null;
  logo?: string | null;
  impuesto?: string;
  costoDelivery?: string;
  ciudad?: string;
  provincia?: string;
}

interface ToastFn {
  (opts: { title: string; description?: string; variant?: "default" | "destructive" }): void;
}

function formatUbicacion(ubicacion: string): string {
  const trimmed = (ubicacion || "").trim();
  if (!trimmed || trimmed === "Por confirmar") return "";
  if (/^https?:\/\//i.test(trimmed)) return "Ver mapa (GPS)";
  const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) return `Ubicación GPS: ${coordMatch[1]}, ${coordMatch[2]}`;
  return trimmed;
}

function getEntregaTicket(pedido: Pedido) {
  const esPickup = pedido.tipoEntrega === "pickup";
  return {
    etiqueta: esPickup ? "Pickup" : "Delivery",
    costo: esPickup ? 0 : Math.max(0, parseFloat(pedido.costoDeliveryAplicado ?? "0") || 0),
  };
}

export const printOrderTicket = (
  pedido: Pedido,
  colmado: Colmado,
  toast: ToastFn
) => {
  try {
    if (!pedido || !colmado) {
      throw new Error("Datos insuficientes para generar el ticket");
    }

    toast({
      title: "Generando ticket",
      description: "Preparando documento para impresión...",
    });

    let productos: Producto[] = [];
    try {
      productos = JSON.parse(pedido.productos);
    } catch {
      productos = [];
    }

    const tienePrecios = productos.some((p) => p.precio || p.monto);
    const entrega = getEntregaTicket(pedido);
    const costoDelivery = entrega.costo;
    const totalPedido = parseFloat(pedido.totalConfirmado || pedido.total) || 0;
    const subtotalProductos = totalPedido - costoDelivery;
    const montoPago = parseFloat(pedido.montoPago || "0") || 0;
    const devuelta = pedido.necesitaDevuelta ? (montoPago - totalPedido) : 0;

    let formattedDate = '';
    try {
      const fecha = pedido.fechaCreacion || pedido.creadoEn;
      formattedDate = formatDateRD(fecha, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        includeTime: true
      });
    } catch {
      formattedDate = 'Fecha no disponible';
    }

    const printContent = document.createElement('div');
    printContent.style.width = '80mm';
    printContent.style.boxSizing = 'border-box';
    printContent.style.padding = '5mm';
    printContent.style.margin = '0 auto';
    printContent.style.fontFamily = "'Courier New', monospace";
    printContent.style.fontSize = '10px';

    const colmadoNombre = colmado.nombre || 'Negocio';
    const direccion = colmado.direccion || '';
    const telefono = colmado.telefonoAlternativo || colmado.whatsappNumero || '';

    const header = document.createElement('div');
    header.style.textAlign = 'center';
    header.style.marginBottom = '10px';
    header.style.borderBottom = '2px dashed #333';
    header.style.paddingBottom = '10px';

    header.innerHTML = `
      <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px; text-transform: uppercase;">${colmadoNombre}</div>
      ${direccion ? `<div style="font-size: 11px; margin-bottom: 2px;">${direccion}</div>` : ''}
      ${telefono ? `<div style="font-size: 11px; margin-bottom: 2px;">Tel: ${telefono}</div>` : ''}
    `;
    printContent.appendChild(header);

    const orderInfo = document.createElement('div');
    orderInfo.style.marginBottom = '10px';
    orderInfo.style.fontSize = '11px';
    orderInfo.innerHTML = `
      <div style="text-align: center; font-weight: bold; font-size: 14px; margin-bottom: 5px;">PEDIDO #${pedido.id}</div>
      <div style="margin-bottom: 3px;"><strong>Fecha:</strong> ${formattedDate}</div>
    `;
    printContent.appendChild(orderInfo);

    const separator1 = document.createElement('div');
    separator1.style.borderBottom = '2px dashed #333';
    separator1.style.margin = '10px 0';
    printContent.appendChild(separator1);

    const clientInfo = document.createElement('div');
    clientInfo.style.marginBottom = '10px';
    clientInfo.style.fontSize = '11px';
    const ubicacionLabel = formatUbicacion(pedido.clienteUbicacion);
    clientInfo.innerHTML = `
      <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 5px;">Cliente:</div>
      <div style="margin-bottom: 2px;">${pedido.clienteNombre}</div>
      <div style="margin-bottom: 2px;">${pedido.clienteWhatsapp}</div>
      ${ubicacionLabel ? `<div style="margin-bottom: 2px;">${ubicacionLabel}</div><div style="margin-bottom: 2px; color: #555;">Plataforma WhatsApp</div>` : ''}
    `;
    printContent.appendChild(clientInfo);

    const separator2 = document.createElement('div');
    separator2.style.borderBottom = '2px dashed #333';
    separator2.style.margin = '10px 0';
    printContent.appendChild(separator2);

    const detailTitle = document.createElement('div');
    detailTitle.style.textAlign = 'center';
    detailTitle.style.fontWeight = 'bold';
    detailTitle.style.marginBottom = '5px';
    detailTitle.textContent = 'DETALLE DEL PEDIDO';
    printContent.appendChild(detailTitle);

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '10px';

    let tableHtml = '';
    if (tienePrecios) {
      tableHtml = `
        <thead>
          <tr style="border-bottom: 1px solid #333;">
            <th style="text-align: left; padding: 4px 0;">Producto</th>
            <th style="text-align: center; padding: 4px 0;">Cant.</th>
            <th style="text-align: right; padding: 4px 0;">Precio</th>
            <th style="text-align: right; padding: 4px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
      `;

      productos.forEach((p) => {
        const cantidad = p.cantidad || 1;
        const precio = p.precio || p.monto || 0;
        const subtotalProducto = p.precio ? precio * cantidad : (p.monto || 0);
        
        tableHtml += `
          <tr style="border-bottom: 1px dotted #ccc;">
            <td style="text-align: left; padding: 4px 0;">${p.nombre}</td>
            <td style="text-align: center; padding: 4px 0;">${cantidad}</td>
            <td style="text-align: right; padding: 4px 0;">${precio > 0 ? `$${precio}` : '-'}</td>
            <td style="text-align: right; padding: 4px 0;">${subtotalProducto > 0 ? `$${subtotalProducto}` : '-'}</td>
          </tr>
        `;
      });

      tableHtml += `</tbody>`;
    } else {
      tableHtml = `
        <thead>
          <tr style="border-bottom: 1px solid #333;">
            <th style="text-align: left; padding: 4px 0;">Producto</th>
          </tr>
        </thead>
        <tbody>
      `;

      productos.forEach((p) => {
        const cantidad = p.cantidad || 1;
        tableHtml += `
          <tr style="border-bottom: 1px dotted #ccc;">
            <td style="text-align: left; padding: 4px 0;">${cantidad > 1 ? `${cantidad}x ` : ''}${p.nombre}</td>
          </tr>
        `;
      });

      tableHtml += `</tbody>`;
    }

    table.innerHTML = tableHtml;
    printContent.appendChild(table);

    const separator3 = document.createElement('div');
    separator3.style.borderBottom = '2px dashed #333';
    separator3.style.margin = '10px 0';
    printContent.appendChild(separator3);

    const totalsDiv = document.createElement('div');
    totalsDiv.style.marginTop = '10px';
    totalsDiv.style.fontSize = '11px';

    let totalsHtml = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>Subtotal:</span>
        <span>RD$${subtotalProductos.toLocaleString()}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
        <span>${entrega.etiqueta}:</span>
        <span>RD$${costoDelivery.toLocaleString()}</span>
      </div>
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; padding-top: 5px; border-top: 2px double #333;">
        <span>TOTAL:</span>
        <span>RD$${totalPedido.toLocaleString()}</span>
      </div>
    `;
    if (montoPago > 0) {
      totalsHtml += `
        <div style="display: flex; justify-content: space-between; margin-top: 5px;">
          <span>Paga con:</span>
          <span>RD$${montoPago.toLocaleString()}</span>
        </div>
      `;
    }
    if (pedido.necesitaDevuelta && devuelta > 0) {
      totalsHtml += `
        <div style="display: flex; justify-content: space-between; margin-top: 3px; color: #d97706; font-weight: bold;">
          <span>Devuelta:</span>
          <span>RD$${devuelta.toLocaleString()}</span>
        </div>
      `;
    }
    totalsDiv.innerHTML = totalsHtml;
    printContent.appendChild(totalsDiv);

    const separator4 = document.createElement('div');
    separator4.style.borderBottom = '2px dashed #333';
    separator4.style.margin = '10px 0';
    printContent.appendChild(separator4);

    const thankYouMsg = document.createElement('div');
    thankYouMsg.style.textAlign = 'center';
    thankYouMsg.style.marginTop = '10px';
    thankYouMsg.style.fontSize = '11px';
    thankYouMsg.innerHTML = `
      <p style="margin: 5px 0;">¡Gracias por su compra!</p>
      <p style="color: #666; margin-top: 10px; font-size: 10px;">Delywa, la forma más fácil de ordenar por WhatsApp</p>
    `;
    printContent.appendChild(thankYouMsg);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    if (!iframe.contentWindow || !iframe.contentDocument) {
      throw new Error("No se pudo crear el área de impresión");
    }

    iframe.contentDocument.open();
    iframe.contentDocument.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pedido #${pedido.id} - ${colmadoNombre}</title>
          <meta charset="utf-8">
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', monospace;
              margin: 0;
              padding: 0;
              width: 80mm;
            }
            @media print {
              body {
                margin: 0;
                padding: 5mm;
              }
            }
          </style>
        </head>
        <body>
          ${printContent.outerHTML}
        </body>
      </html>
    `);
    iframe.contentDocument.close();

    setTimeout(() => {
      try {
        if (!iframe.contentWindow) {
          throw new Error("No se pudo acceder al área de impresión");
        }
        
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        
        toast({
          title: "Imprimiendo ticket",
          description: "El documento se ha enviado a la impresora",
        });
        
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      } catch (printError) {
        console.error('Error al imprimir:', printError);
        toast({
          variant: "destructive",
          title: "Error de impresión",
          description: "No se pudo enviar a la impresora: " + (printError instanceof Error ? printError.message : "Error desconocido"),
        });
        document.body.removeChild(iframe);
      }
    }, 500);

  } catch (error) {
    console.error('Error en printOrderTicket:', error);
    toast({
      variant: "destructive",
      title: "Error",
      description: error instanceof Error ? error.message : "Error al generar el ticket",
    });
  }
};

export const printOrderWindow = (
  pedido: Pedido,
  colmado: Colmado,
  toast: ToastFn
) => {
  try {
    if (!pedido || !colmado) {
      throw new Error("Datos insuficientes para generar el ticket");
    }

    let productos: Producto[] = [];
    try {
      productos = JSON.parse(pedido.productos);
    } catch {
      productos = [];
    }

    const tienePrecios = productos.some((p) => p.precio || p.monto);
    const entrega = getEntregaTicket(pedido);
    const costoDelivery = entrega.costo;
    const totalPedido = parseFloat(pedido.totalConfirmado || pedido.total) || 0;
    const subtotalProductos = totalPedido - costoDelivery;
    const montoPago = parseFloat(pedido.montoPago || "0") || 0;
    const devuelta = pedido.necesitaDevuelta ? (montoPago - totalPedido) : 0;

    const fecha = pedido.fechaCreacion || pedido.creadoEn || '';
    const fechaPedido = new Date(fecha).toLocaleDateString("es-DO", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const productosHTML = productos.map((p) => {
      const cantidad = p.cantidad || 1;
      const precio = p.precio || p.monto || 0;
      const subtotalProducto = p.precio ? precio * cantidad : (p.monto || 0);
      
      if (tienePrecios) {
        return `<tr style="border-bottom: 1px dotted #ccc;">
          <td style="padding: 4px 0;">${p.nombre}</td>
          <td style="text-align: center; padding: 4px 0;">${cantidad}</td>
          <td style="text-align: right; padding: 4px 0;">${precio > 0 ? `$${precio}` : "-"}</td>
          <td style="text-align: right; padding: 4px 0;">${subtotalProducto > 0 ? `$${subtotalProducto}` : "-"}</td>
        </tr>`;
      } else {
        return `<tr style="border-bottom: 1px dotted #ccc;">
          <td style="padding: 4px 0;">${cantidad > 1 ? `${cantidad}x ` : ''}${p.nombre}</td>
        </tr>`;
      }
    }).join("");

    const telefono = colmado.telefonoAlternativo || colmado.whatsappNumero;

    const ubicacionLabel = formatUbicacion(pedido.clienteUbicacion);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pedido #${pedido.id} - ${colmado.nombre}</title>
        <meta charset="UTF-8">
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            font-family: 'Courier New', monospace;
            width: 80mm;
            margin: 0 auto;
            padding: 5mm;
            font-size: 11px;
            box-sizing: border-box;
          }
          .header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 8px; margin-bottom: 8px; overflow-wrap: anywhere; word-break: break-word; }
          .header h1 { font-size: 14px; margin: 0 0 4px 0; text-transform: uppercase; }
          .header p { margin: 2px 0; font-size: 10px; }
          .sep { border-bottom: 2px dashed #333; margin: 8px 0; }
          .pedido-id { text-align: center; font-weight: bold; font-size: 13px; margin-bottom: 6px; }
          .cliente-info { margin-bottom: 8px; font-size: 10px; overflow-wrap: anywhere; word-break: break-word; }
          .cliente-info p { margin: 2px 0; }
          .section-title { text-align: center; font-weight: bold; font-size: 11px; margin-bottom: 5px; }
          table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 8px; font-size: 10px; }
          th { text-align: left; border-bottom: 1px solid #333; padding: 3px 0; overflow-wrap: anywhere; word-break: break-word; }
          td { padding: 3px 0; border-bottom: 1px dotted #ccc; overflow-wrap: anywhere; word-break: break-word; vertical-align: top; }
          .totales { border-top: 2px dashed #333; padding-top: 8px; font-size: 10px; }
          .totales .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
          .total-final { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 2px double #333; padding-top: 4px; margin-top: 4px; }
          .footer { text-align: center; margin-top: 14px; font-size: 10px; border-top: 2px dashed #333; padding-top: 8px; }
          @media print {
            body { margin: 0; padding: 5mm; }
          }
        </style>
      </head>
      <body>

        <div class="header">
          <h1>${colmado.nombre}</h1>
          ${colmado.direccion ? `<p>${colmado.direccion}</p>` : ""}
          ${telefono ? `<p>Tel: ${telefono}</p>` : ""}
        </div>

        <div class="pedido-id">PEDIDO #${pedido.id}</div>

        <div class="sep"></div>

        <div class="cliente-info">
          <p><strong>Fecha:</strong> ${fechaPedido}</p>
          <p><strong>Cliente:</strong> ${pedido.clienteNombre}</p>
          <p><strong>Tel:</strong> ${pedido.clienteWhatsapp}</p>
          ${ubicacionLabel ? `<p><strong>Dir:</strong> ${ubicacionLabel}</p><p style="color:#555;">Plataforma WhatsApp</p>` : ""}
        </div>

        <div class="sep"></div>

        <div class="section-title">DETALLE DEL PEDIDO</div>

        <table>
          <thead>
            <tr>
              <th>Producto</th>
              ${tienePrecios ? `<th style="text-align:center;">Cant</th><th style="text-align:right;">Precio</th><th style="text-align:right;">Subtotal</th>` : ""}
            </tr>
          </thead>
          <tbody>
            ${productosHTML}
          </tbody>
        </table>

        <div class="totales">
          <div class="row"><span>Subtotal:</span><span>RD$${subtotalProductos.toLocaleString()}</span></div>
          <div class="row"><span>${entrega.etiqueta}:</span><span>RD$${costoDelivery.toLocaleString()}</span></div>
          <div class="total-final">
            <span>TOTAL:</span>
            <span>RD$${totalPedido.toLocaleString()}</span>
          </div>
          ${montoPago > 0 ? `<div class="row" style="margin-top:4px;"><span>Paga con:</span><span>RD$${montoPago.toLocaleString()}</span></div>` : ""}
          ${pedido.necesitaDevuelta && devuelta > 0 ? `<div class="row" style="color:#d97706;font-weight:bold;margin-top:2px;"><span>Devuelta:</span><span>RD$${devuelta.toLocaleString()}</span></div>` : ""}
        </div>

        <div class="footer">
          <p>¡Gracias por su compra!</p>
          <p style="color:#666;margin-top:6px;">Delywa, la forma más fácil de ordenar por WhatsApp</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = () => printWindow.close();
      }, 250);
    }
  } catch (error) {
    console.error('Error en printOrderWindow:', error);
    toast({
      variant: "destructive",
      title: "Error",
      description: error instanceof Error ? error.message : "Error al generar el ticket",
    });
  }
};

export const generateOrderPdf = (
  pedido: Pedido,
  colmado: Colmado,
  toast: ToastFn
) => {
  try {
    if (!pedido || !colmado) {
      throw new Error("Faltan datos necesarios para generar el PDF");
    }
    
    toast({
      title: "Generando PDF",
      description: "Preparando documento...",
    });

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 297],
    });
    
    const colmadoNombre = colmado.nombre || 'Negocio';
    const direccion = colmado.direccion || '';
    const telefono = colmado.telefonoAlternativo || colmado.whatsappNumero || '';
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(colmadoNombre, 40, 10, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    if (direccion) doc.text(direccion, 40, 15, { align: 'center' });
    if (telefono) doc.text(`Tel: ${telefono}`, 40, 19, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(5, 23, 75, 23);
    
    const orderId = pedido.id || 'N/A';
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`PEDIDO #${orderId}`, 40, 28, { align: 'center' });
    
    let formattedDate = '';
    try {
      const fecha = pedido.fechaCreacion || pedido.creadoEn;
      formattedDate = formatDateRD(fecha, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        includeTime: true
      });
    } catch {
      formattedDate = 'Fecha no disponible';
    }
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    let clientY = 34;
    doc.text(`Fecha: ${formattedDate}`, 5, clientY); clientY += 4;
    doc.text(`Cliente: ${pedido.clienteNombre}`, 5, clientY); clientY += 4;
    doc.text(`Tel: ${pedido.clienteWhatsapp}`, 5, clientY); clientY += 4;
    const ubicacionPdf = formatUbicacion(pedido.clienteUbicacion);
    if (ubicacionPdf) {
      const dirLines = doc.splitTextToSize(`Dir: ${ubicacionPdf}`, 70);
      doc.text(dirLines, 5, clientY);
      clientY += dirLines.length * 4;
      doc.text("Plataforma WhatsApp", 5, clientY); clientY += 4;
    }

    let yPosition = clientY + 2;
    
    doc.setDrawColor(200);
    doc.line(5, yPosition, 75, yPosition);
    yPosition += 4;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text("DETALLE DEL PEDIDO", 40, yPosition, { align: 'center' });
    yPosition += 5;
    
    let productos: Producto[] = [];
    try {
      productos = JSON.parse(pedido.productos);
    } catch {
      productos = [];
    }

    const tienePrecios = productos.some((p) => p.precio || p.monto);
    const entrega = getEntregaTicket(pedido);
    const costoDelivery = entrega.costo;

    const drawProductHeaders = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      if (tienePrecios) {
        doc.text("Producto", 5, yPosition);
        doc.text("Cant.", 35, yPosition, { align: 'center' });
        doc.text("Precio", 55, yPosition, { align: 'right' });
        doc.text("Total", 75, yPosition, { align: 'right' });
      } else {
        doc.text("Producto", 5, yPosition);
      }
      yPosition += 2;
      doc.setDrawColor(200);
      doc.line(5, yPosition, 75, yPosition);
      yPosition += 5;
      doc.setFont('helvetica', 'normal');
    };

    drawProductHeaders();

    // Page dimensions (mm). The document format is [80, 297].
    const PDF_PAGE_HEIGHT = 297;
    // Reserve 15 mm at the bottom so content never touches the edge.
    const PDF_BOTTOM_MARGIN = PDF_PAGE_HEIGHT - 15;
    // Y position at the top of a continuation page (skip first 8 mm as a top margin).
    const PDF_NEW_PAGE_TOP = 8;

    /**
     * Ensure there is at least `needed` mm of vertical space remaining on the
     * current page. If not, insert a continuation page with enough context to
     * identify the ticket. Product continuations also repeat their columns.
     */
    const ensureSpace = (needed: number, repeatProductHeaders = false) => {
      if (yPosition + needed > PDF_BOTTOM_MARGIN) {
        doc.addPage([80, PDF_PAGE_HEIGHT]);
        yPosition = PDF_NEW_PAGE_TOP;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(colmadoNombre, 40, yPosition, { align: 'center' });
        yPosition += 4;
        doc.setFont('helvetica', 'bold');
        doc.text(`PEDIDO #${orderId} (cont.)`, 40, yPosition, { align: 'center' });
        yPosition += 3;
        doc.setDrawColor(200);
        doc.line(5, yPosition, 75, yPosition);
        yPosition += 4;
        if (repeatProductHeaders) {
          drawProductHeaders();
        }
      }
    };

    if (productos.length > 0) {
      productos.forEach((p) => {
        const cantidad = p.cantidad || 1;
        const precio = p.precio || p.monto || 0;
        const subtotalProducto = p.precio ? precio * cantidad : (p.monto || 0);
        
        if (tienePrecios) {
          const nameLines = doc.splitTextToSize(p.nombre, 28);
          const rowHeight = nameLines.length * 4 + 1;
          ensureSpace(rowHeight, true);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(nameLines, 5, yPosition);
          doc.text(`${cantidad}`, 35, yPosition, { align: 'center' });
          doc.text(`$${precio}`, 55, yPosition, { align: 'right' });
          doc.text(`$${subtotalProducto}`, 75, yPosition, { align: 'right' });
          yPosition += rowHeight;
        } else {
          const prefix = cantidad > 1 ? `${cantidad}x ` : '';
          const nameLines = doc.splitTextToSize(`${prefix}${p.nombre}`, 70);
          const rowHeight = nameLines.length * 4 + 1;
          ensureSpace(rowHeight, true);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.text(nameLines, 5, yPosition);
          yPosition += rowHeight;
        }
      });
    } else {
      ensureSpace(5);
      doc.text("No hay productos", 40, yPosition, { align: 'center' });
      yPosition += 5;
    }

    // Totals block: separator (5) + subtotal (4) + delivery (4) + total (5)
    // plus optional paga-con (4) and devuelta (5) and footer (15) = up to ~38 mm.
    // Check for all of that at once so the totals and footer always land together.
    const totalPedido = parseFloat(pedido.totalConfirmado || pedido.total) || 0;
    const subtotalProductos = totalPedido - costoDelivery;
    const montoPago = parseFloat(pedido.montoPago || "0") || 0;
    const devuelta = pedido.necesitaDevuelta ? (montoPago - totalPedido) : 0;

    const totalsBlockHeight =
      5 +   // separator line + gap
      4 +   // subtotal
      4 +   // delivery
      5 +   // total bold
      (montoPago > 0 ? 4 : 0) +
      (pedido.necesitaDevuelta && devuelta > 0 ? 5 : 0) +
      5 +   // breathing room before footer
      5 +   // "gracias" line
      10;   // branding (up to 2 lines)

    ensureSpace(totalsBlockHeight);

    doc.setDrawColor(200);
    doc.line(5, yPosition, 75, yPosition);
    yPosition += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Subtotal: RD$${subtotalProductos.toLocaleString()}`, 75, yPosition, { align: 'right' });
    yPosition += 4;
    doc.text(`${entrega.etiqueta}: RD$${costoDelivery.toLocaleString()}`, 75, yPosition, { align: 'right' });
    yPosition += 4;

    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: RD$${totalPedido.toLocaleString()}`, 75, yPosition, { align: 'right' });
    yPosition += 5;
    
    if (montoPago > 0) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Paga con: RD$${montoPago.toLocaleString()}`, 75, yPosition, { align: 'right' });
      yPosition += 4;
    }
    if (pedido.necesitaDevuelta && devuelta > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(217, 119, 6);
      doc.text(`Devuelta: RD$${devuelta.toLocaleString()}`, 75, yPosition, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      yPosition += 5;
    }
    yPosition += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("¡Gracias por su compra!", 40, yPosition, { align: 'center' });
    yPosition += 5;
    doc.setFontSize(7);
    const brandingLines = doc.splitTextToSize("Delywa, la forma más fácil de ordenar por WhatsApp", 65);
    doc.text(brandingLines, 40, yPosition, { align: 'center' });
    
    try {
      doc.save(`Pedido-${orderId}.pdf`);
    
      toast({
        title: "PDF generado",
        description: `El archivo "Pedido-${orderId}.pdf" se ha descargado.`,
      });
    } catch (saveError) {
      console.error("Error al guardar el PDF:", saveError);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el archivo PDF."
      });
    }
  } catch (error) {
    console.error("Error en generateOrderPdf:", error);
    toast({
      variant: "destructive",
      title: "Error",
      description: error instanceof Error ? error.message : "Error al generar el PDF",
    });
  }
};
