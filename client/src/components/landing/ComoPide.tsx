import { useEffect, useRef, useState } from "react";

// "Así pide tu cliente": las imágenes del dueño (cuadros de sus animaciones) en secuencia,
// agrupadas en 3 partes: el cliente pide → tú despachas → el delivery lo lleva.
// Avanza sola, se puede tocar una parte para ir a ella, se detiene con el mouse o el dedo encima,
// solo corre cuando se ve en pantalla y no se mueve sola si el aparato pide menos movimiento.

const TITULO = { fontFamily: "Fredoka, 'Poppins', sans-serif" } as const;
const MS_POR_CUADRO = 3200;

const FASES = ["El cliente pide", "Tú despachas", "El delivery lo lleva"] as const;

const CUADROS: Array<{ fase: 0 | 1 | 2; titulo: string; texto: string; alt: string }> = [
  { fase: 0, titulo: "Abre el chat de tu colmado", texto: "Toca tu enlace y el chat la saluda: «Hola, ¿qué deseas comprar?». No descarga nada.", alt: "Clienta con su celular; el chat de Delywa le pregunta qué desea comprar" },
  { fase: 0, titulo: "Pide con sus palabras", texto: "Escribe como siempre le ha pedido al colmado, o manda una nota de voz.", alt: "Clienta escribiendo: 2 manzanas, 1 leche, 1 pan" },
  { fase: 0, titulo: "Envía su ubicación", texto: "Manda su ubicación o elige su casa guardada.", alt: "El chat le pregunta su ubicación y muestra un mapa" },
  { fase: 0, titulo: "Elige cómo pagar", texto: "Tarjeta, efectivo o transferencia. Si es efectivo, dice con cuánto paga.", alt: "El chat le pregunta cómo va a pagar: tarjeta, efectivo o transferencia" },
  { fase: 1, titulo: "Te llega el pedido", texto: "Aparece en tu panel al instante. Confirmas el precio y el cliente lo recibe.", alt: "El colmadero recibe el pedido en su celular" },
  { fase: 1, titulo: "Preparas la funda", texto: "Despachas desde el mostrador, como siempre.", alt: "El colmadero prepara la funda del pedido" },
  { fase: 1, titulo: "Se la das al delivery", texto: "Lo asignas con un toque y sale con lo que tiene que cobrar y la devuelta.", alt: "El colmadero le entrega la funda al delivery" },
  { fase: 2, titulo: "Sale en su motor", texto: "Lleva la dirección en su celular. El cliente lo ve en camino.", alt: "El delivery va en su motor con la caja de pedidos" },
  { fase: 2, titulo: "Lo entrega en la puerta", texto: "Cobra, entrega la devuelta y listo.", alt: "El delivery le entrega la funda a la clienta en su puerta" },
  { fase: 2, titulo: "¡Pedido entregado!", texto: "Sin llamadas para preguntar dónde viene el pedido.", alt: "Clienta feliz con el aviso de pedido entregado" },
];

const img = (i: number) => `/landing/pide/${String(i + 1).padStart(2, "0")}.webp`;

export default function ComoPide() {
  const [actual, setActual] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [quieto, setQuieto] = useState(false);
  const [visible, setVisible] = useState(false);
  const raiz = useRef<HTMLElement>(null);

  useEffect(() => {
    setQuieto(Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
    const el = raiz.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const corre = !pausa && !quieto && visible;
  useEffect(() => {
    if (!corre) return;
    const t = window.setTimeout(() => setActual((a) => (a + 1) % CUADROS.length), MS_POR_CUADRO);
    return () => window.clearTimeout(t);
  }, [actual, corre]);

  const c = CUADROS[actual];
  const irAFase = (f: number) => setActual(CUADROS.findIndex((x) => x.fase === f));

  return (
    <section ref={raiz} id="como-pide" className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-24 scroll-mt-20" aria-label="Así pide tu cliente">
      <style>{`@keyframes dw-barra{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      <div className="text-center max-w-[760px] mx-auto">
        <p className="m-0 font-extrabold text-[#C2610C] text-base">PASO A PASO</p>
        <h2 style={TITULO} className="mt-2 font-bold text-[34px] md:text-[52px] leading-[1.08]">Así pide tu cliente</h2>
        <p className="mt-4 text-[#4A524E]">De su celular a su puerta, sin una sola llamada.</p>
      </div>

      <div
        className="mt-10 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-8 items-center"
        onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
        onTouchStart={() => setPausa(true)} onTouchEnd={() => setPausa(false)}
      >
        {/* Escena: los cuadros uno encima del otro, se cruzan suave */}
        <div className="relative w-full rounded-[32px] bg-white border border-[#F0E6D6] shadow-[0_20px_44px_rgba(60,40,10,0.10)] overflow-hidden aspect-[3/2]">
          {CUADROS.map((x, i) => (
            <img
              key={i}
              src={img(i)}
              alt={i === actual ? x.alt : ""}
              aria-hidden={i !== actual}
              loading={i < 2 ? "eager" : "lazy"}
              width={504} height={334}
              className="absolute inset-0 w-full h-full object-contain transition-[opacity,transform] duration-700 ease-out"
              style={{ opacity: i === actual ? 1 : 0, transform: i === actual ? "scale(1)" : "scale(1.035)" }}
            />
          ))}
          <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-[#F6EBDD]" aria-hidden="true">
            {!quieto && (
              <div key={actual} className="h-full bg-[#F28C28] origin-left" style={{ animation: `dw-barra ${MS_POR_CUADRO}ms linear forwards`, animationPlayState: corre ? "running" : "paused" }} />
            )}
          </div>
        </div>

        {/* Texto del cuadro y las 3 partes */}
        <div className="min-w-0">
          <ol className="list-none p-0 m-0 grid grid-cols-3 lg:grid-cols-1 gap-2 lg:gap-3">
            {FASES.map((nombre, f) => {
              const on = c.fase === f;
              const cuadros = CUADROS.map((x, i) => ({ ...x, i })).filter((x) => x.fase === f);
              return (
                <li key={nombre}>
                  <button
                    type="button" onClick={() => irAFase(f)} aria-current={on ? "step" : undefined}
                    className={`w-full h-full text-left rounded-2xl border-2 px-3 py-3 lg:px-5 lg:py-4 transition-colors ${on ? "bg-[#FFF4E4] border-[#F28C28]" : "bg-white border-[#F0E6D6] hover:border-[#E6DCCB]"}`}
                    data-testid={`fase-cliente-${f + 1}`}
                  >
                    <span className="flex flex-col lg:flex-row lg:items-center gap-1.5 lg:gap-3.5">
                      <span style={TITULO} className={`flex-none w-9 h-9 lg:w-11 lg:h-11 rounded-full grid place-items-center font-bold text-lg lg:text-xl ${on ? "bg-[#F28C28] text-white" : "bg-[#F3ECE1] text-[#6B736F]"}`}>{f + 1}</span>
                      <b style={TITULO} className={`block font-semibold text-[15px] leading-tight lg:text-[22px] ${on ? "text-[#1F2420]" : "text-[#5B6460]"}`}>{nombre}</b>
                    </span>
                    <span className="mt-2.5 lg:mt-3 lg:ml-[58px] flex gap-1.5" aria-hidden="true">
                      {cuadros.map((x) => (
                        <span key={x.i} className={`h-1.5 rounded-full transition-all ${x.i === actual ? "w-6 bg-[#F28C28]" : x.i < actual && on ? "w-3 bg-[#F6C08A]" : "w-3 bg-[#E6DCCB]"}`} />
                      ))}
                    </span>
                    {on && (
                      <span className="hidden lg:block mt-3 ml-[58px]">
                        <span style={TITULO} className="block font-semibold text-lg text-[#1F2420]">{c.titulo}</span>
                        <span className="block mt-1 text-[16px] text-[#4A524E]">{c.texto}</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          {/* En el celular el texto va debajo de las 3 partes */}
          <div className="lg:hidden mt-5 text-center" aria-live="polite">
            <b style={TITULO} className="block font-semibold text-[24px] leading-tight">{c.titulo}</b>
            <p className="mt-2 text-[#4A524E]">{c.texto}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
