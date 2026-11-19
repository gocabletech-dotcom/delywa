import type { ReactNode } from "react";
// Página principal: «Sin invertir en equipos» (opción B del diseño aprobado por el dueño, 2026-11-19).
// Lo que otros sistemas obligan a comprar, tachado, y lo único que hace falta: el celular o la tablet.

const TITULO = { fontFamily: "Fredoka, 'Poppins', sans-serif" } as const;

const trazo = { fill: "none", stroke: "#8C918E", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const NO_NECESITAS: Array<{ texto: string; icono: ReactNode }> = [
  { texto: "Caja registradora", icono: <><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V5h10v6M9 15h6" /></> },
  { texto: "Computadora nueva", icono: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></> },
  { texto: "Impresora especial", icono: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></> },
  { texto: "Programas que instalar", icono: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 19h16" /></> },
  { texto: "Equipos para el delivery", icono: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 6h4" /></> },
  { texto: "Técnico que lo monte", icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
];

export default function SinEquipos() {
  return (
    <section id="sin-equipos" className="bg-white scroll-mt-20" data-testid="seccion-sin-equipos">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="text-center max-w-[780px] mx-auto">
          <h2 style={TITULO} className="m-0 font-bold text-[34px] md:text-[50px] leading-[1.08]">Sin invertir en equipos</h2>
          <p className="mt-4 mb-0 text-[18px] md:text-[20px] leading-relaxed text-[#4A524E]">
            Lo que otros sistemas te obligan a comprar, con Delywa no hace falta. Empiezas hoy con el celular o la tablet que tienes en el colmado.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:gap-8 md:grid-cols-2">
          <div className="min-w-0 rounded-[28px] bg-[#F6F4F1] p-6 md:p-9">
            <h3 style={TITULO} className="m-0 font-semibold text-[22px] md:text-[24px] text-[#5B615E]">Lo que NO necesitas</h3>
            <ul className="mt-5 mb-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-3">
              {NO_NECESITAS.map((x) => (
                <li key={x.texto} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 min-h-[60px]">
                  <svg width="28" height="28" viewBox="0 0 24 24" {...trazo} aria-hidden="true" className="shrink-0">{x.icono}</svg>
                  <span className="text-[17px] font-bold text-[#5B615E] line-through decoration-[#8C918E]">
                    <span className="sr-only">No necesitas: </span>{x.texto}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0 rounded-[28px] bg-[#17804F] text-white p-6 md:p-9 flex flex-col gap-5">
            <h3 style={TITULO} className="m-0 font-semibold text-[22px] md:text-[24px]">Lo que SÍ necesitas</h3>
            {/* Dibujo: una tablet con el panel de pedidos y un celular con el chat del cliente. */}
            <div className="flex items-end gap-5" aria-hidden="true">
              <div className="w-[210px] max-w-[60%] aspect-[7/5] p-[9px] rounded-[20px] bg-[#0B3D26]">
                <div className="w-full h-full rounded-xl bg-[#F7F8F7] grid grid-cols-3 gap-1.5 p-2">
                  <div className="rounded-md bg-[#FFF4E4]" />
                  <div className="rounded-md bg-[#E5EDFF]" />
                  <div className="rounded-md bg-[#E7F2EC]" />
                </div>
              </div>
              <div className="w-[92px] max-w-[28%] aspect-[1/2] p-1.5 rounded-[20px] bg-[#0B3D26] shrink-0">
                <div className="w-full h-full rounded-[15px] bg-[#EFEAE2] flex flex-col gap-[5px] px-1.5 py-2">
                  <span className="h-2.5 w-[70%] rounded bg-[#D9FDD3] self-end" />
                  <span className="h-2.5 w-[80%] rounded bg-white" />
                  <span className="h-2.5 w-[55%] rounded bg-[#D9FDD3] self-end" />
                  <span className="h-2.5 w-[65%] rounded bg-white" />
                </div>
              </div>
            </div>
            <p style={TITULO} className="m-0 font-bold text-[30px] md:text-[34px] leading-[1.15]">Tu celular o tu tablet.<br />Y nada más.</p>
            <p className="m-0 text-[17px] md:text-[18px] leading-relaxed text-[#D8EFE2]">
              Funciona en el navegador. Tus repartidores usan su propio teléfono y la factura sale en la impresora que ya tengas.
            </p>
            <a href="#crear-negocio" className="self-start inline-flex items-center min-h-[54px] px-7 rounded-full bg-[#F28C28] hover:bg-[#E07B17] text-[#1F2420] font-extrabold text-lg" data-testid="link-sin-equipos-empezar">
              Empezar gratis
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
