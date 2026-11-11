import { forwardRef } from "react";

interface Producto {
  nombre: string;
  cantidad?: number;
  precio?: number;
  monto?: number;
}

interface PrintableInvoiceProps {
  pedido: {
    id: number;
    clienteNombre: string;
    clienteWhatsapp: string;
    clienteUbicacion: string;
    productos: string;
    total: string;
    creadoEn: string;
    tipoEntrega?: "delivery" | "pickup";
    costoDeliveryAplicado?: string | null;
  };
  negocio: {
    nombre: string;
    direccion?: string;
    telefono?: string;
    logo?: string | null;
    impuesto?: string;
    costoDelivery?: string;
  };
}

const PrintableInvoice = forwardRef<HTMLDivElement, PrintableInvoiceProps>(
  ({ pedido, negocio }, ref) => {
    let productos: Producto[] = [];
    try {
      productos = JSON.parse(pedido.productos);
    } catch {
      productos = [];
    }

    const tienePrecios = productos.some(p => p.precio || p.monto);
    const impuestoPorcentaje = parseFloat(negocio.impuesto || "0");
    const esPickup = pedido.tipoEntrega === "pickup";
    const etiquetaEntrega = esPickup ? "Pickup" : "Delivery";
    const costoDelivery = esPickup ? 0 : Math.max(0, parseFloat(pedido.costoDeliveryAplicado ?? "0") || 0);
    const totalPedido = parseFloat(pedido.total) || 0;

    const subtotal = tienePrecios ? productos.reduce((acc, p) => {
      const cantidad = p.cantidad || 1;
      if (p.precio) return acc + (p.precio * cantidad);
      if (p.monto) return acc + p.monto;
      return acc;
    }, 0) : 0;

    const impuestoMonto = subtotal * (impuestoPorcentaje / 100);

    const fechaPedido = new Date(pedido.creadoEn).toLocaleDateString("es-DO", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div ref={ref} className="print-invoice bg-white p-4 max-w-[80mm] mx-auto text-sm font-mono">
        <style>{`
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              width: 80mm !important;
              height: auto !important;
            }
            body * {
              visibility: hidden;
            }
            .print-invoice, .print-invoice * {
              visibility: visible;
            }
            .print-invoice {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm !important;
              max-width: 80mm !important;
              padding: 3mm !important;
              margin: 0 !important;
              font-size: 11px !important;
              page-break-inside: avoid !important;
              page-break-after: avoid !important;
              page-break-before: avoid !important;
            }
            @page {
              size: 80mm auto;
              margin: 0;
              padding: 0;
            }
          }
          
          /* Preview styles to match print */
          @media screen {
            .print-invoice {
              width: 80mm;
              max-width: 80mm;
              min-height: auto;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
          }
        `}</style>

        <div className="text-center mb-4 border-b border-dashed border-gray-400 pb-4">
          {negocio.logo && (
            <img 
              src={negocio.logo} 
              alt={negocio.nombre} 
              className="h-12 mx-auto mb-2 object-contain"
            />
          )}
          <h1 className="text-lg font-bold uppercase">{negocio.nombre}</h1>
          {negocio.direccion && <p className="text-xs">{negocio.direccion}</p>}
          {negocio.telefono && <p className="text-xs">Tel: {negocio.telefono}</p>}
        </div>

        <div className="mb-4 text-xs">
          <p><strong>Factura #:</strong> {pedido.id}</p>
          <p><strong>Fecha:</strong> {fechaPedido}</p>
        </div>

        <div className="mb-4 border-b border-dashed border-gray-400 pb-4">
          <p className="font-bold text-xs uppercase mb-1">Cliente:</p>
          <p>{pedido.clienteNombre}</p>
          <p className="text-xs">{pedido.clienteWhatsapp}</p>
          {pedido.clienteUbicacion && pedido.clienteUbicacion !== "Por confirmar" && (
            <p className="text-xs">{pedido.clienteUbicacion}</p>
          )}
        </div>

        <table className="w-full mb-4 text-xs">
          <thead>
            <tr className="border-b border-gray-400">
              <th className="text-left py-1">Producto</th>
              {tienePrecios && (
                <>
                  <th className="text-center py-1">Cant</th>
                  <th className="text-right py-1">Precio</th>
                  <th className="text-right py-1">Subtotal</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {productos.map((p, idx) => {
              const cantidad = p.cantidad || 1;
              const precio = p.precio || p.monto || 0;
              const subtotalProducto = p.precio ? precio * cantidad : (p.monto || 0);
              
              return (
                <tr key={idx} className="border-b border-dotted border-gray-300">
                  <td className="py-1">{p.nombre}</td>
                  {tienePrecios && (
                    <>
                      <td className="text-center py-1">{cantidad}</td>
                      <td className="text-right py-1">{precio > 0 ? `$${precio}` : "-"}</td>
                      <td className="text-right py-1">{subtotalProducto > 0 ? `$${subtotalProducto}` : "-"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="border-t border-dashed border-gray-400 pt-2 text-xs">
          {tienePrecios && subtotal > 0 && (
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>RD${subtotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
              <span>{etiquetaEntrega}:</span>
              <span>RD${costoDelivery.toFixed(2)}</span>
          </div>
          {tienePrecios && impuestoPorcentaje > 0 && (
            <div className="flex justify-between">
              <span>ITBIS ({impuestoPorcentaje}%):</span>
              <span>RD${impuestoMonto.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base mt-2 pt-2 border-t border-double border-gray-400">
            <span>TOTAL:</span>
            <span>RD${totalPedido.toFixed(2)}</span>
          </div>
        </div>

        <div className="text-center mt-6 text-xs">
          <p>¡Gracias por su compra!</p>
          <p className="text-gray-500 mt-2">Powered by ColmadonIA</p>
        </div>
      </div>
    );
  }
);

PrintableInvoice.displayName = "PrintableInvoice";

export default PrintableInvoice;
