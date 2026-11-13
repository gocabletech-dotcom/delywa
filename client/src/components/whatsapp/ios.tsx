import { useEffect, useState, type ReactNode } from "react";

// Piezas para que los chats de DelyWa se vean como WhatsApp en un iPhone:
// el marco del teléfono (solo en pantallas grandes), la barra de estado, el fondo con dibujitos,
// las burbujas con su colita, la hora con los dos checks azules y los separadores de fecha.

export const IOS = {
  azul: "#007AFF",
  verde: "#25D366",
  verdeOscuro: "#1DAA61",
  burbujaMia: "#D9FDD3",
  burbujaOtro: "#FFFFFF",
  barra: "#F6F6F6",
  gris: "#8E8E93",
  separador: "#E5E5EA",
  fuente: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif",
};

// Dibujitos suaves del fondo de WhatsApp (SVG en línea, sin pedir archivos).
const DIBUJOS = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><g fill='none' stroke='#d6cfc4' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' opacity='.75'>
<path d='M18 22h20a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-9l-7 6v-6h-4a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z'/>
<circle cx='108' cy='30' r='9'/><path d='M104 30h8M108 26v8'/>
<path d='M60 70l6-12 6 12-6 4z'/><path d='M130 78c0-7 10-7 10 0s-10 10-10 10-10-3-10-10 10-7 10 0'/>
<path d='M24 104h16l-2 18H26z'/><path d='M28 104v-4h8v4'/>
<path d='M86 112c8-10 22-10 30 0'/><circle cx='92' cy='120' r='2'/><circle cx='110' cy='120' r='2'/>
<path d='M140 128l8 8M148 128l-8 8'/><path d='M62 140h14M69 133v14'/><circle cx='150' cy='14' r='3'/><circle cx='70' cy='16' r='2'/>
</g></svg>`);
export const fondoWhatsApp = { backgroundColor: "#EFEAE2", backgroundImage: `url("data:image/svg+xml,${DIBUJOS}")`, backgroundSize: "160px 160px" };

function Hora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30_000); return () => clearInterval(t); }, []);
  return <>{ahora.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit", hour12: false })}</>;
}

/** Barra de estado del iPhone: hora, señal, wifi y batería. */
export function BarraDeEstado({ oscura = false }: { oscura?: boolean }) {
  const color = oscura ? "#fff" : "#000";
  return (
    <div className="relative flex items-center justify-between px-7 pt-3 pb-1 text-[15px] font-semibold select-none shrink-0" style={{ color, fontFamily: IOS.fuente }} aria-hidden>
      <span className="w-14"><Hora /></span>
      <span className="absolute left-1/2 -translate-x-1/2 top-2 h-[30px] w-[110px] rounded-full bg-black" />
      <span className="flex items-center gap-1.5">
        <svg width="18" height="11" viewBox="0 0 18 11" fill={color}><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="6" rx="1"/><rect x="10" y="2.5" width="3" height="8.5" rx="1"/><rect x="15" y="0" width="3" height="11" rx="1"/></svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill={color}><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.1-1.1A10 10 0 0 0 8 .6 10 10 0 0 0 .9 3.5L2 4.6a8.5 8.5 0 0 1 6-2.4zm0 3.2c1.4 0 2.7.5 3.7 1.4l1.1-1.1A7 7 0 0 0 8 3.8a7 7 0 0 0-4.8 1.9l1.1 1.1A5.4 5.4 0 0 1 8 5.4zm0 3.1c.6 0 1.1.2 1.5.6L8 10.6 6.5 9.1c.4-.4.9-.6 1.5-.6z"/></svg>
        <svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke={color} opacity=".4"/><rect x="2" y="2" width="17" height="8" rx="2" fill={color}/><path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4z" fill={color} opacity=".4"/></svg>
      </span>
    </div>
  );
}

/**
 * En computadora muestra un iPhone con el chat adentro; en el teléfono ocupa toda la pantalla
 * (ya es un teléfono, no hace falta el marco).
 */
function usarPantallaGrande() {
  const consulta = "(min-width: 768px)";
  const [grande, setGrande] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(consulta).matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(consulta);
    const cambio = () => setGrande(mq.matches);
    cambio();
    mq.addEventListener?.("change", cambio);
    return () => mq.removeEventListener?.("change", cambio);
  }, []);
  return grande;
}

/** Marco de iPhone en pantallas grandes; pantalla completa en el teléfono. Los hijos se montan una sola vez. */
export function IPhone({ children, alto = "calc(100dvh - 2rem)", arriba = false, altoMovil }: { children: ReactNode; alto?: string; arriba?: boolean; altoMovil?: string }) {
  const grande = usarPantallaGrande();
  if (!grande) {
    return <div className="h-full w-full flex flex-col overflow-hidden" style={{ fontFamily: IOS.fuente, ...(altoMovil ? { height: altoMovil } : {}) }}>{children}</div>;
  }
  return (
    <div className={`flex w-full justify-center p-4 ${arriba ? "items-start" : "h-full items-center"}`}>
      <div
        className="relative bg-black rounded-[56px] p-[12px] shadow-2xl ring-1 ring-black/40"
        style={{ height: `min(860px, ${alto})`, aspectRatio: "393 / 852", fontFamily: IOS.fuente }}
        data-testid="marco-iphone"
      >
        <span className="absolute -left-[3px] top-[120px] h-8 w-[3px] rounded-l bg-neutral-800" />
        <span className="absolute -left-[3px] top-[170px] h-14 w-[3px] rounded-l bg-neutral-800" />
        <span className="absolute -left-[3px] top-[235px] h-14 w-[3px] rounded-l bg-neutral-800" />
        <span className="absolute -right-[3px] top-[190px] h-20 w-[3px] rounded-r bg-neutral-800" />
        <div className="relative h-full w-full overflow-hidden rounded-[44px] bg-white flex flex-col">
          <BarraDeEstado />
          <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          <div className="h-6 shrink-0 flex items-center justify-center pointer-events-none absolute bottom-0 inset-x-0">
            <span className="h-[5px] w-32 rounded-full bg-black/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Los dos checks (azules = leído). */
export function Checks({ leido = true }: { leido?: boolean }) {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden className="inline-block" fill={leido ? "#53BDEB" : "#8E8E93"}>
      <path d="M11.07.65 4.98 7.4 2.1 4.53.9 5.72l4.13 4.13L12.3 1.85zM15.1.65 9 7.4l-.73-.73-1.2 1.2 1.98 1.98L16.3 1.85z" />
    </svg>
  );
}

/** Burbuja de WhatsApp con la colita en la primera de cada grupo. */
export function Burbuja({ mia, cola, hora, children, leido = true, testId }: {
  mia: boolean; cola: boolean; hora: string; children: ReactNode; leido?: boolean; testId?: string;
}) {
  const fondo = mia ? IOS.burbujaMia : IOS.burbujaOtro;
  return (
    <div className={`flex ${mia ? "justify-end" : "justify-start"} px-3 ${cola ? "mt-2" : "mt-0.5"}`}>
      <div
        className={`relative max-w-[80%] px-2.5 pt-1.5 pb-1 text-[15.5px] leading-[1.32] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] ${
          mia ? (cola ? "rounded-[10px] rounded-tr-none" : "rounded-[10px]") : (cola ? "rounded-[10px] rounded-tl-none" : "rounded-[10px]")
        }`}
        style={{ background: fondo, wordBreak: "break-word" }}
        data-testid={testId}
      >
        {cola && (
          <svg viewBox="0 0 8 13" width="8" height="13" className={`absolute top-0 ${mia ? "-right-[8px]" : "-left-[8px] scale-x-[-1]"}`} aria-hidden>
            <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" fill={fondo} />
          </svg>
        )}
        {children}
        {/* Espacio para que la hora no tape el texto, como en WhatsApp */}
        <span className={`inline-block h-px align-bottom ${mia ? "w-[92px]" : "w-[70px]"}`} aria-hidden />
        <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px] text-[#667781] whitespace-nowrap">
          {hora}
          {mia && <Checks leido={leido} />}
        </span>
      </div>
    </div>
  );
}

/** Píldora de fecha en el centro ("Hoy", "Ayer", "12 nov"). */
export function SeparadorFecha({ texto }: { texto: string }) {
  return (
    <div className="flex justify-center my-2">
      <span className="rounded-lg bg-white/90 px-3 py-1 text-[12.5px] font-medium text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,.13)]">{texto}</span>
    </div>
  );
}

export function textoFecha(fecha: Date): string {
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === hoy.toDateString()) return "Hoy";
  if (fecha.toDateString() === ayer.toDateString()) return "Ayer";
  return fecha.toLocaleDateString("es-DO", { weekday: fecha.getTime() > Date.now() - 6 * 86400e3 ? "long" : undefined, day: "numeric", month: "short" });
}

export const horaCorta = (f: Date) => f.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });

/** Avatar redondo con la inicial (o la foto). */
export function Avatar({ nombre, foto, tamano = 36, color = "#DFE5E7" }: { nombre: string; foto?: string | null; tamano?: number; color?: string }) {
  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center shrink-0 font-semibold text-white"
      style={{ width: tamano, height: tamano, background: foto ? "#fff" : color, fontSize: tamano * 0.42 }}>
      {foto ? <img src={foto} alt="" className="w-full h-full object-cover" /> : (nombre.trim().charAt(0).toUpperCase() || "?")}
    </div>
  );
}

/** Iconos de iOS que WhatsApp usa en la cabecera y la barra de escribir. */
export const IconoIOS = {
  atras: (color = IOS.azul) => <svg width="13" height="21" viewBox="0 0 13 21" aria-hidden><path d="M11 1.5 2 10.5l9 9" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  video: (color = IOS.azul) => <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden><rect x="1" y="2" width="16" height="14" rx="4" fill="none" stroke={color} strokeWidth="1.9" /><path d="M18.5 7.2 24 3.8v10.4l-5.5-3.4z" fill="none" stroke={color} strokeWidth="1.9" strokeLinejoin="round" /></svg>,
  telefono: (color = IOS.azul) => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M6.6 2.5 9 2l2 5-2.2 1.6a12 12 0 0 0 6.6 6.6L17 13l5 2-.5 2.4A3 3 0 0 1 18.6 20 16.6 16.6 0 0 1 4 5.4a3 3 0 0 1 2.6-2.9z" fill="none" stroke={color} strokeWidth="1.9" strokeLinejoin="round" /></svg>,
  mas: (color = IOS.azul) => <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden><path d="M11 3v16M3 11h16" stroke={color} strokeWidth="2.2" strokeLinecap="round" /></svg>,
  camara: (color = IOS.azul) => <svg width="25" height="22" viewBox="0 0 25 22" aria-hidden><path d="M3 6.5h3.6l1.8-3h8.2l1.8 3H22a1.6 1.6 0 0 1 1.6 1.6v10.3A1.6 1.6 0 0 1 22 20H3a1.6 1.6 0 0 1-1.6-1.6V8.1A1.6 1.6 0 0 1 3 6.5z" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12.5" cy="12.8" r="4" fill="none" stroke={color} strokeWidth="1.8" /></svg>,
  microfono: (color = IOS.azul) => <svg width="18" height="24" viewBox="0 0 18 24" aria-hidden><rect x="5" y="1.5" width="8" height="13.5" rx="4" fill="none" stroke={color} strokeWidth="1.9" /><path d="M1.8 11a7.2 7.2 0 0 0 14.4 0M9 18.3V22" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" /></svg>,
  enviar: () => <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill="#fff" /></svg>,
  sticker: () => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M20 12.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h5.5zM20 12.5 12.5 20M20 12.5h-4.5a3 3 0 0 0-3 3V20" fill="none" stroke="#8E8E93" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="9.5" cy="10" r="1" fill="#8E8E93" /><circle cx="14.5" cy="10" r="1" fill="#8E8E93" /></svg>,
  ubicacion: (color = IOS.azul) => <svg width="20" height="22" viewBox="0 0 20 24" aria-hidden><path d="M10 22s7-6.6 7-12.3A7 7 0 0 0 3 9.7C3 15.4 10 22 10 22z" fill="none" stroke={color} strokeWidth="1.9" /><circle cx="10" cy="9.6" r="2.6" fill="none" stroke={color} strokeWidth="1.9" /></svg>,
};
