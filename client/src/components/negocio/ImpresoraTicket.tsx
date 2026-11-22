import { useState } from "react";
import { Printer } from "lucide-react";
import { anchoGuardado, guardarAncho, imprimirTicket, type AnchoTicket } from "@/lib/ticket";

// Configuración → Impresora: ancho del papel de la impresora térmica de este aparato y una prueba.

export function ImpresoraTicket({ nombre, direccion, telefono }: { nombre: string; direccion?: string | null; telefono?: string | null }) {
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado());
  const elegir = (a: AnchoTicket) => { setAncho(a); guardarAncho(a); };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 mb-6" data-testid="impresora-ticket">
      <h3 className="text-lg font-bold text-slate-900">Impresora de tickets</h3>
      <p className="mt-1 text-[15px] text-slate-600">
        Sirve cualquier impresora que tu computadora, tablet o celular ya tenga instalada, también las térmicas de 58 u 80 mm
        (USB o Bluetooth). Elige el ancho del papel: se guarda en este aparato.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Ancho del papel">
        {([58, 80] as AnchoTicket[]).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={ancho === a} onClick={() => elegir(a)}
            className={`min-h-[44px] px-4 rounded-xl border text-[15px] font-semibold ${ancho === a ? "border-[#17804F] bg-[#E7F2EC] text-[#0F5C39]" : "border-slate-300 text-slate-700"}`}
            data-testid={`ancho-${a}`}>
            {a} mm{a === 80 ? " (la más común)" : ""}
          </button>
        ))}
      </div>
      <button type="button" className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#17804F] text-white font-semibold hover:bg-[#0F5C39]"
        onClick={() => imprimirTicket({
          negocio: { nombre, direccion, telefono }, titulo: "Ticket de prueba", fecha: new Date(),
          lineas: [{ nombre: "Arroz (libra)", cantidad: 2, precio: 45 }, { nombre: "Presidente grande", cantidad: 1, precio: 200 }],
          total: 290, pago: { metodo: "efectivo", recibido: 500, devuelta: 210 }, pie: "Si se ve bien, ya está lista 👍",
        }, ancho)} data-testid="imprimir-prueba">
        <Printer className="w-4 h-4" />Imprimir prueba
      </button>
      <p className="mt-3 text-sm text-slate-500">En la ventana de imprimir, elige tu impresora, márgenes «Ninguno» y quita «Encabezados y pies de página».</p>
    </div>
  );
}
