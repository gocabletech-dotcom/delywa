import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Check, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { RegistroNegocioForm } from "@/components/RegistroNegocioForm";
import { CasaCliente, ColmadoDentro, ColmadoFrente, DeliveryMotor, IconoMoto } from "@/components/landing/Ilustraciones";

// Página principal de delywa.com. Diseño aprobado por el dueño (2026-11-14): fondo claro y cálido,
// letra redonda como el logo (Fredoka en títulos, Nunito en el texto), verde Delywa y naranja del delivery.

const WA_VENTAS = "https://wa.me/19193436706?text=Quiero%20registrar%20mi%20negocio%20en%20DelyWa";
const TITULO = { fontFamily: "Fredoka, 'Poppins', sans-serif" } as const;

const ENLACES = [
  { href: "#recorrido", texto: "Cómo funciona" },
  { href: "#colmado", texto: "Para tu colmado" },
  { href: "#delivery", texto: "Para tu delivery" },
  { href: "#precio", texto: "Precio" },
];

function Punto({ children, naranja = false }: { children: React.ReactNode; naranja?: boolean }) {
  return (
    <li className="flex gap-3.5 items-start">
      <span aria-hidden="true" className={`flex-none mt-0.5 w-[26px] h-[26px] rounded-full grid place-items-center ${naranja ? "bg-[#FFE8CC] text-[#A3520A]" : "bg-[#E3F3EA] text-[#17804F]"}`}>
        <Check className="w-3.5 h-3.5" strokeWidth={3.2} />
      </span>
      <span>{children}</span>
    </li>
  );
}

function Paso({ n, titulo, texto, naranja = false }: { n: number; titulo: string; texto: string; naranja?: boolean }) {
  return (
    <li className="bg-white rounded-3xl p-6 flex gap-4 items-start">
      <span style={TITULO} className={`flex-none w-[46px] h-[46px] rounded-full grid place-items-center font-bold text-[22px] ${naranja ? "bg-[#FFE8CC] text-[#A3520A]" : "bg-[#E3F3EA] text-[#17804F]"}`}>{n}</span>
      <span>
        <b style={TITULO} className="block font-semibold text-[22px] leading-snug">{titulo}</b>
        <span className="text-[#4A524E]">{texto}</span>
      </span>
    </li>
  );
}

export default function Home() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) setLocation("/admin");
  }, [isLoading, isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen bg-[#FFFDF8] text-[#1F2420] overflow-x-hidden text-[17px] md:text-lg leading-relaxed" style={{ fontFamily: "Nunito, 'Inter', sans-serif" }}>
      <style>{`
        @keyframes dw-ruta{0%{left:4%}100%{left:calc(96% - 150px)}}
        @keyframes dw-rueda{to{transform:rotate(360deg)}}
        @keyframes dw-flota{50%{transform:translateY(-6px)}}
        @media (prefers-reduced-motion: reduce){.dw-anima,.dw-anima *{animation:none !important}}
      `}</style>

      {/* ── Barra de arriba ── */}
      <header className="sticky top-0 z-50 bg-[#FFFDF8]/95 backdrop-blur border-b border-[#F0E6D6]">
        <nav aria-label="Principal" className="max-w-[1200px] mx-auto px-4 md:px-6 py-2 flex items-center gap-6">
          <a href="#inicio" className="shrink-0" aria-label="Delywa, inicio">
            <img src="/delywa-logo.png" alt="Delywa" className="w-16 h-16 object-contain" />
          </a>
          <div className="hidden lg:flex gap-6 flex-1 font-bold text-base">
            {ENLACES.map((e) => <a key={e.href} href={e.href} className="text-[#3D4642] hover:text-[#17804F] py-2.5">{e.texto}</a>)}
          </div>
          <div className="hidden md:flex gap-2.5 ml-auto">
            <button type="button" onClick={() => setLocation("/login")} className="min-h-[46px] px-5 rounded-full border-2 border-[#E6DCCB] font-extrabold text-base hover:bg-white" data-testid="button-login">Entrar</button>
            <a href="#crear-negocio" className="inline-flex items-center min-h-[46px] px-[22px] rounded-full bg-[#17804F] hover:bg-[#0F5C39] text-white font-extrabold text-base" data-testid="link-crear-negocio">Crear mi negocio</a>
          </div>
          <button type="button" className="md:hidden ml-auto w-11 h-11 grid place-items-center rounded-full border-2 border-[#E6DCCB]" onClick={() => setMenuAbierto(!menuAbierto)} aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuAbierto}>
            {menuAbierto ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>
        {menuAbierto && (
          <div className="md:hidden border-t border-[#F0E6D6] bg-[#FFFDF8] px-4 py-3 flex flex-col gap-1 font-bold">
            {ENLACES.map((e) => <a key={e.href} href={e.href} className="py-3 text-[#3D4642]" onClick={() => setMenuAbierto(false)}>{e.texto}</a>)}
            <button type="button" onClick={() => { setMenuAbierto(false); setLocation("/login"); }} className="mt-2 min-h-[48px] rounded-full border-2 border-[#E6DCCB] font-extrabold">Entrar</button>
            <a href="#crear-negocio" onClick={() => setMenuAbierto(false)} className="mt-2 min-h-[48px] rounded-full bg-[#17804F] text-white font-extrabold grid place-items-center">Crear mi negocio</a>
          </div>
        )}
      </header>

      {/* ── Hero con la foto del delivery ── */}
      <section id="inicio" className="max-w-[1200px] mx-auto px-4 md:px-6 pt-10 md:pt-14 pb-16 md:pb-[72px] flex flex-wrap gap-12 items-center">
        <div className="flex-[1_1_440px] min-w-0">
          <p className="mb-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF0DC] text-[#8A4B08] font-extrabold text-[15px]">
            <IconoMoto size={18} /> Delivery en motor para colmados
          </p>
          <h1 style={TITULO} className="m-0 font-bold text-[44px] sm:text-[56px] lg:text-[72px] leading-[1.02]">
            Tu colmado,<br />hasta la puerta<br /><span className="text-[#17804F]">de tu cliente.</span>
          </h1>
          <p className="mt-5 max-w-[520px] text-[19px] md:text-xl text-[#4A524E]">
            El cliente te escribe como en WhatsApp, tú despachas desde el mostrador y tu delivery sale con la dirección, lo que tiene que cobrar y la devuelta.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#crear-negocio" className="inline-flex items-center gap-2.5 min-h-[56px] px-7 rounded-full bg-[#17804F] hover:bg-[#0F5C39] text-white font-extrabold text-lg">
              Empezar gratis <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.6} />
            </a>
            <a href="#recorrido" className="inline-flex items-center min-h-[56px] px-6 rounded-full bg-white border-2 border-[#E6DCCB] font-extrabold text-lg">Ver cómo funciona</a>
          </div>
          <p className="mt-5 text-[15px] text-[#6B736F]">Sin descargar apps · Funciona en cualquier celular · Sin tarjeta para empezar</p>
        </div>

        <figure className="flex-[1_1_460px] min-w-0 m-0 relative dw-anima">
          <picture>
            <source srcSet="/landing/delivery-motor.webp" type="image/webp" />
            <img src="/landing/delivery-motor.jpg" alt="Delivery en motor en una calle colonial de República Dominicana" width={1200} height={1200} className="block w-full aspect-square object-cover rounded-[32px]" />
          </picture>
          <div className="absolute left-2 sm:-left-3.5 top-6 max-w-[240px] px-4 py-3 rounded-[20px_20px_20px_6px] bg-white shadow-[0_14px_34px_rgba(60,40,10,0.18)] text-[15px]" style={{ animation: "dw-flota 4s ease-in-out infinite" }}>
            <div className="text-xs font-extrabold text-[#17804F]">Cliente</div>
            Mándame 2 frías, un salami y una funda de hielo
          </div>
          <div className="absolute right-3 sm:right-4 bottom-4 px-4 py-3 rounded-[18px] bg-white shadow-[0_14px_34px_rgba(60,40,10,0.18)] flex items-center gap-3">
            <span aria-hidden="true" className="w-[42px] h-[42px] rounded-full bg-[#FFE8CC] grid place-items-center"><IconoMoto color="#C2610C" size={24} /></span>
            <span>
              <span className="block text-[13px] text-[#6B736F] font-bold">Pedido #128 en camino</span>
              <span style={TITULO} className="block font-semibold text-xl">Llega en ~8 min</span>
            </span>
          </div>
        </figure>
      </section>

      {/* ── El recorrido: colmado → moto → casa ── */}
      <section id="recorrido" className="bg-[#FFF4E4] border-y border-[#F0E2CC] scroll-mt-20">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-[88px]">
          <div className="text-center max-w-[760px] mx-auto">
            <h2 style={TITULO} className="m-0 font-bold text-[34px] md:text-[52px] leading-[1.08]">Del mostrador a la puerta, sin una sola llamada</h2>
            <p className="mt-4 text-[#4A524E]">Así llega un pedido con Delywa.</p>
          </div>

          <div role="img" aria-label="Ilustración: el delivery sale del colmado en su motor y llega a la casa del cliente" className="dw-anima relative mt-11 h-[220px] sm:h-[300px] rounded-[28px] overflow-hidden bg-[#DDF1FB]">
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[74px] bg-[#4B5350]" />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-[34px] h-1" style={{ background: "repeating-linear-gradient(90deg, #FFE08A 0 34px, transparent 34px 64px)" }} />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-[74px] h-3.5 bg-[#E8DCC6]" />
            <ColmadoFrente className="absolute left-[2%] bottom-[84px] w-[300px] max-w-[42%] h-auto" />
            <CasaCliente className="absolute right-[2%] bottom-[84px] w-[200px] max-w-[28%] h-auto" />
            <div aria-hidden="true" className="absolute bottom-[30px] w-[110px] sm:w-[150px]" style={{ animation: "dw-ruta 6s ease-in-out infinite alternate" }}>
              <DeliveryMotor girando className="block w-full h-auto" />
            </div>
          </div>

          <ol className="list-none p-0 mt-9 grid gap-[18px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            <Paso n={1} titulo="El cliente pide" texto="Abre tu enlace y escribe con sus palabras. El bot anota, pide la ubicación y cómo va a pagar." />
            <Paso n={2} titulo="Tú despachas" texto="Confirmas el precio, preparas la funda y le asignas el pedido a tu delivery con un toque." />
            <Paso n={3} naranja titulo="El delivery lo lleva" texto="Sale con la ruta, cobra, entrega la devuelta y el cliente lo ve llegar desde su celular." />
          </ol>
        </div>
      </section>

      {/* ── Para el colmado ── */}
      <section id="colmado" className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-24 flex flex-wrap gap-14 items-center scroll-mt-20">
        <div className="flex-[1_1_440px] min-w-0">
          <div className="bg-[#FFF4E4] rounded-[32px] px-7 pt-7 overflow-hidden">
            <ColmadoDentro titulo="Ilustración de un colmado dominicano con su toldo y sus estantes" className="block w-full h-auto" />
          </div>
        </div>
        <div className="flex-[1_1_420px] min-w-0">
          <p className="m-0 font-extrabold text-[#17804F] text-base">PARA EL COLMADERO</p>
          <h2 style={TITULO} className="mt-2 font-bold text-[34px] md:text-[50px] leading-[1.08]">Todo el despacho del día en tu celular o en la caja</h2>
          <p className="mt-4 text-[#4A524E]">Los pedidos te llegan ordenados: por confirmar, preparando, en camino y entregados. Cada uno tiene un solo botón con lo que toca hacer.</p>
          <ul className="mt-6 p-0 list-none grid gap-3.5">
            <Punto>Confirmas el precio y el cliente lo recibe al momento.</Punto>
            <Punto>Transferencias: ves la foto del comprobante y la apruebas antes de entregar.</Punto>
            <Punto>Cuadre de caja y del delivery sin papelitos.</Punto>
            <Punto>Dueño, colmadero y despachador, cada uno con lo suyo.</Punto>
          </ul>
        </div>
      </section>

      {/* ── Para el delivery ── */}
      <section id="delivery" className="bg-[#FFF4E4] border-y border-[#F0E2CC] scroll-mt-20">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-24 flex flex-wrap-reverse gap-14 items-center">
          <div className="flex-[1_1_420px] min-w-0">
            <p className="m-0 font-extrabold text-[#A3520A] text-base">PARA EL DELIVERY</p>
            <h2 style={TITULO} className="mt-2 font-bold text-[34px] md:text-[50px] leading-[1.08]">Sale con la ruta, el cobro y la devuelta</h2>
            <p className="mt-4 text-[#4A524E]">Entra desde su celular con su número y un código. No tiene que descargar nada.</p>
            <ul className="mt-6 p-0 list-none grid gap-3.5">
              <Punto naranja>Las entregas en orden, con el mapa para llegar.</Punto>
              <Punto naranja>Llama al cliente o al colmado con un toque.</Punto>
              <Punto naranja>Si el cliente no aparece, devuelve el pedido con su motivo.</Punto>
              <Punto naranja>Al final del turno cuadra el efectivo con el colmado.</Punto>
            </ul>
          </div>
          <div className="flex-[1_1_440px] min-w-0 flex flex-wrap gap-[18px] items-end justify-center">
            <DeliveryMotor titulo="Ilustración de un delivery en su motor con la caja de pedidos" className="w-[230px] max-w-[46%] h-auto" />
            <div className="w-[280px] max-w-full rounded-[34px] border-8 border-[#1F2420] bg-white p-4 grid gap-2.5 shadow-[0_20px_40px_rgba(60,40,10,0.16)]">
              <div className="text-[13px] font-extrabold text-[#6B736F]">Mis entregas · José</div>
              <div className="rounded-[18px] bg-[#FFF4E4] p-3.5">
                <div className="font-extrabold">#128 · Pedro Gómez</div>
                <div className="text-[15px] text-[#4A524E]">Calle 5 #10, Los Mina</div>
                <div className="mt-2 flex justify-between text-[15px]"><span>Cobra</span><b>RD$580</b></div>
                <div className="flex justify-between text-[15px]"><span>Devuelta</span><b className="text-[#17804F]">RD$420</b></div>
              </div>
              <div className="grid grid-cols-2 gap-2" aria-hidden="true">
                <span className="min-h-[44px] grid place-items-center rounded-full border-2 border-[#E6DCCB] font-extrabold text-[15px]">Llamar</span>
                <span className="min-h-[44px] grid place-items-center rounded-full bg-[#F28C28] font-extrabold text-[15px]">Entregado</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Para el cliente ── */}
      <section id="cliente" className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-24 flex flex-wrap gap-14 items-center">
        <div className="flex-[1_1_380px] min-w-0 flex justify-center">
          <div className="w-[320px] max-w-full rounded-[38px] border-[9px] border-[#1F2420] bg-[#EFE7DB] overflow-hidden shadow-[0_20px_40px_rgba(60,40,10,0.16)]" role="img" aria-label="Ejemplo de conversación de un cliente pidiendo al colmado">
            <div className="bg-[#17804F] text-white px-4 py-3.5 flex items-center gap-2.5">
              <span aria-hidden="true" style={TITULO} className="w-[34px] h-[34px] rounded-full bg-white text-[#17804F] grid place-items-center font-bold">S</span>
              <span><b className="block text-[15px]">Colmado El Sol</b><span className="text-xs opacity-90">en línea</span></span>
            </div>
            <div className="p-3.5 flex flex-col gap-2 text-[15px]">
              <div className="self-end max-w-[82%] bg-[#D9FDD3] px-3 py-2 rounded-[14px_14px_4px_14px]">Buenas, quiero una libra de arroz, 2 libras de pollo y una fría</div>
              <div className="self-start max-w-[86%] bg-white px-3 py-2 rounded-[14px_14px_14px_4px]">Anotado:<br />1 libra de arroz<br />2 libras de pollo<br />1 fría<br /><b>¿Algo más?</b></div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-3 py-1.5 rounded-full bg-white text-[#17804F] font-extrabold text-sm">Eso es todo</span>
                <span className="px-3 py-1.5 rounded-full bg-white text-[#17804F] font-extrabold text-sm">Agregar más</span>
              </div>
              <div className="self-end max-w-[82%] bg-[#D9FDD3] px-3 py-2 rounded-[14px_14px_4px_14px]">Llévamelo a mi casa, pago con 1000</div>
              <div className="self-start max-w-[86%] bg-white px-3 py-2 rounded-[14px_14px_14px_4px]">Perfecto. El colmado está verificando tu pedido y te aviso cuando salga el delivery.</div>
            </div>
          </div>
        </div>
        <div className="flex-[1_1_420px] min-w-0">
          <p className="m-0 font-extrabold text-[#17804F] text-base">PARA TU CLIENTE</p>
          <h2 style={TITULO} className="mt-2 font-bold text-[34px] md:text-[50px] leading-[1.08]">Pide como siempre le ha pedido al colmado</h2>
          <p className="mt-4 text-[#4A524E]">Escribe "una fría", "50 pesos de ajo" o manda una nota de voz. El bot lo anota tal cual, sin cambiarle las palabras. Si algo no entiende, te pasa el mensaje a ti.</p>
          <p className="mt-4 text-[#4A524E]">Comparte tu enlace en tu estado de WhatsApp, en Instagram o con un letrero en el mostrador:</p>
          <p className="mt-2.5 inline-block px-4 py-2.5 rounded-[14px] bg-[#FFF4E4] font-extrabold break-all">delywa.com/pedir/tu-colmado</p>
        </div>
      </section>

      {/* ── Precio ── */}
      <section id="precio" className="bg-[#17804F] text-white scroll-mt-20">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-16 md:py-[88px] flex flex-wrap gap-10 items-center">
          <div className="flex-[1_1_440px] min-w-0">
            <h2 style={TITULO} className="m-0 font-bold text-[34px] md:text-[52px] leading-[1.08]">1 mes gratis.<br />Pruébalo con tus clientes de verdad.</h2>
            <p className="mt-4 text-[19px] text-[#E3F3EA] max-w-[520px]">Usa todo Delywa durante el primer mes: el chat de pedidos, el panel, el portal del delivery y los cuadres. Después eliges el plan que te conviene.</p>
          </div>
          <div className="flex-[1_1_300px] min-w-0 bg-white text-[#1F2420] rounded-[28px] p-7 text-center grid gap-1.5">
            <span className="font-extrabold text-[#6B736F] text-[15px]">Prueba gratis</span>
            <span style={TITULO} className="font-bold text-[60px] leading-[1.1] text-[#17804F]">1 mes</span>
            <span className="text-[15px] text-[#4A524E]">Sin tarjeta · Sin contrato · Cancela cuando quieras</span>
            <a href="#crear-negocio" className="mt-3 inline-flex justify-center items-center min-h-[54px] rounded-full bg-[#F28C28] hover:bg-[#E07B17] text-[#1F2420] font-extrabold text-lg">Empezar gratis</a>
          </div>
        </div>
      </section>

      {/* ── Crear mi negocio ── */}
      <section id="crear-negocio" className="max-w-[1000px] mx-auto px-4 md:px-6 py-16 md:py-24 scroll-mt-20">
        <div className="text-center">
          <h2 style={TITULO} className="m-0 font-bold text-[36px] md:text-[60px] leading-[1.05]">Pon tu colmado a vender por delivery <span className="text-[#17804F]">hoy mismo</span></h2>
          <p className="mt-4 mx-auto max-w-[580px] text-[#4A524E] text-[19px]">Te registras en minutos, confirmas tu correo con un código y vas preparando tu menú mientras revisamos tu negocio.</p>
        </div>
        <div className="mt-10 max-w-xl mx-auto bg-white border border-[#F0E6D6] rounded-[28px] p-6 md:p-8 shadow-[0_14px_34px_rgba(60,40,10,0.08)]">
          <RegistroNegocioForm />
        </div>
        <p className="mt-6 text-center text-[#4A524E]">
          ¿Prefieres que te ayudemos? <a href={WA_VENTAS} target="_blank" rel="noopener noreferrer" className="font-extrabold text-[#17804F] underline">Escríbenos por WhatsApp</a> · <a href="/manual" className="font-extrabold text-[#17804F] underline">Ver el manual</a>
        </p>
      </section>

      {/* ── Pie ── */}
      <footer className="border-t border-[#F0E6D6] bg-[#FFF9EF]">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-7 flex flex-wrap gap-x-7 gap-y-3.5 justify-between items-center text-[15px] text-[#5B6460]">
          <span className="flex items-center gap-2.5"><img src="/delywa-logo.png" alt="" className="w-10 h-10 object-contain" />Delywa · WRMA Developer · República Dominicana</span>
          <span className="flex flex-wrap gap-[18px]">
            <a href="/legal#terminos" className="text-[#17804F] hover:underline">Términos</a>
            <a href="/legal#privacidad" className="text-[#17804F] hover:underline">Privacidad</a>
            <a href="/legal#dpa" className="text-[#17804F] hover:underline">DPA</a>
            <a href="/contact" className="text-[#17804F] hover:underline">Contacto</a>
            <a href="mailto:soporte@delywa.com" className="text-[#17804F] hover:underline">soporte@delywa.com</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
