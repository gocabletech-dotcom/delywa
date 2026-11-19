import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, RotateCcw, Send, X } from "lucide-react";

// Asistente del chat de la página principal (como el de FoodPOS): contesta al instante, sin IA.
// La conversación se guarda en esta pestaña y se olvida 2 minutos después de cerrar el chat.

type Accion = "registro" | "precio" | "soporte" | "manual" | "legal" | "chat_demo";
type Plan = { nombre: string; precio: number; descripcion: string | null; caracteristicas: string[] };
type Respuesta = { tema: string | null; texto: string; acciones: Accion[]; soporte: boolean; planes?: Plan[]; sugerir?: { tema: string; titulo: string } };
type Mensaje = { de: "persona" | "asistente"; texto: string; r?: Respuesta; formulario?: boolean };

const RAPIDOS: Array<[string, string]> = [
  ["precio", "¿Cuánto cuesta?"], ["como_funciona", "¿Cómo funciona?"], ["pedir_cliente", "¿Cómo piden mis clientes?"],
  ["delivery", "Delivery"], ["prueba", "Prueba gratis"], ["humano", "Hablar con soporte"],
];
const BIENVENIDA: Mensaje = { de: "asistente", texto: "¡Hola! 👋 Soy el asistente de **Delywa**. Pregúntame lo que quieras sobre la app para tu colmado, o toca un tema:" };
const CLAVE = "delywa-asistente";
const TIP = "delywa-asistente-tip";
const OLVIDAR_MS = 2 * 60 * 1000;

const ETIQUETA: Record<Accion, string> = {
  registro: "Crear mi negocio gratis", precio: "Ver los precios", soporte: "Que me escriban",
  manual: "Abrir el manual", legal: "Términos y privacidad", chat_demo: "Ver cómo pide el cliente",
};

/** **negrita** y saltos de línea, sin HTML. */
function conFormato(t: string): ReactNode {
  return t.split("\n").map((linea, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {linea.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <b key={j}>{p.slice(2, -2)}</b> : <Fragment key={j}>{p}</Fragment>))}
    </Fragment>
  ));
}
const pesos = (n: number) => `RD$${Math.round(n).toLocaleString("es-DO")}`;

function leer(): { conv: string | null; mensajes: Mensaje[] } {
  try {
    const g = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
    if (g && (!g.cerrado || Date.now() - g.cerrado < OLVIDAR_MS) && Array.isArray(g.mensajes)) return { conv: g.conv ?? null, mensajes: g.mensajes };
  } catch { /* sin almacenamiento */ }
  return { conv: null, mensajes: [BIENVENIDA] };
}

export default function AsistentePagina() {
  const inicial = useRef(leer());
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>(inicial.current.mensajes);
  const [conv, setConv] = useState<string | null>(inicial.current.conv);
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [tip, setTip] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(CLAVE, JSON.stringify({ conv, mensajes: mensajes.slice(-40), cerrado: abierto ? null : Date.now() })); } catch { /* nada */ }
  }, [conv, mensajes, abierto]);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [mensajes, escribiendo, abierto]);
  useEffect(() => {
    // La burbuja de ayuda sale una vez al día.
    let visto = "";
    try { visto = localStorage.getItem(TIP) || ""; } catch { /* nada */ }
    if (visto === new Date().toDateString()) return;
    const t = setTimeout(() => setTip(true), 4500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (abierto) { setTip(false); setTimeout(() => entrada.current?.focus(), 50); } }, [abierto]);

  const cerrarTip = () => { setTip(false); try { localStorage.setItem(TIP, new Date().toDateString()); } catch { /* nada */ } };

  async function preguntar(cuerpo: { texto?: string; tema?: string }, visible: string) {
    if (escribiendo) return;
    setMensajes((m) => [...m, { de: "persona", texto: visible }]);
    setEscribiendo(true);
    const empezo = Date.now();
    let r: Respuesta;
    try {
      const res = await fetch("/api/asistente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, conv }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No pude contestar.");
      if (data.conv) setConv(data.conv);
      r = data.respuesta;
    } catch (e: any) {
      r = { tema: null, texto: e?.message || "No pude conectarme. Revisa tu internet o escribe a **soporte@delywa.com**.", acciones: [], soporte: false };
    }
    // Una pausa corta para que se lea como una conversación.
    await new Promise((ok) => setTimeout(ok, Math.max(0, 550 - (Date.now() - empezo))));
    setEscribiendo(false);
    setMensajes((m) => [...m, { de: "asistente", texto: r.texto, r, formulario: r.soporte && r.tema === "humano" }]);
  }

  function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    void preguntar({ texto: t }, t);
  }

  function accion(a: Accion) {
    if (a === "soporte") { setMensajes((m) => [...m, { de: "asistente", texto: "Déjame tus datos y el equipo de Delywa te escribe:", formulario: true }]); return; }
    if (a === "manual") { window.location.href = "/manual"; return; }
    if (a === "legal") { window.location.href = "/legal"; return; }
    if (a === "registro") void fetch("/api/asistente/evento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conv }) }).catch(() => undefined);
    const destino = a === "registro" ? "crear-negocio" : a === "precio" ? "precio" : "cliente";
    if (window.matchMedia("(max-width: 640px)").matches) setAbierto(false);
    document.getElementById(destino)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function nuevaConversacion() {
    setConv(null);
    setMensajes([BIENVENIDA]);
    try { sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
  }

  const ultima = mensajes.length - 1;

  return createPortal(
    <div className="font-['Nunito',sans-serif]">
      {!abierto && tip && (
        <div className="fixed z-[60] right-4 bottom-[92px] max-w-[250px] rounded-2xl rounded-br-md bg-white border border-[#F0E2CC] shadow-[0_12px_30px_rgba(31,36,32,0.16)] p-3.5 pr-8 text-[15px] text-[#1F2420]" data-testid="asistente-tip">
          <button onClick={cerrarTip} aria-label="Cerrar" className="absolute top-1.5 right-1.5 w-7 h-7 grid place-items-center rounded-full text-[#6B736F] hover:bg-[#F4F6F5]"><X className="w-4 h-4" /></button>
          <button onClick={() => { cerrarTip(); setAbierto(true); }} className="text-left">¿Tienes un colmado? <b>Pregúntame</b> cuánto cuesta o cómo funciona 👋</button>
        </div>
      )}

      {!abierto && (
        <button onClick={() => { cerrarTip(); setAbierto(true); }} aria-label="Abrir el chat de ayuda"
          className="fixed z-[60] right-4 bottom-4 w-[64px] h-[64px] rounded-full bg-[#17804F] hover:bg-[#0F5C39] text-white grid place-items-center shadow-[0_10px_26px_rgba(23,128,79,0.38)]" data-testid="button-asistente">
          <MessageCircle className="w-7 h-7" />
          <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#F28C28] border-2 border-white animate-pulse" />
        </button>
      )}

      {abierto && (
        <section role="dialog" aria-label="Chat de ayuda de Delywa"
          className="fixed z-[70] inset-0 sm:inset-auto sm:right-4 sm:bottom-4 sm:w-[390px] sm:h-[min(640px,calc(100vh-32px))] bg-[#FFFBF5] sm:rounded-3xl shadow-[0_24px_60px_rgba(31,36,32,0.25)] border border-[#F0E2CC] flex flex-col overflow-hidden" data-testid="panel-asistente">
          <header className="bg-[#17804F] text-white px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/15 grid place-items-center font-['Fredoka',sans-serif] font-bold text-lg">D</div>
            <div className="flex-1 min-w-0">
              <div className="font-['Fredoka',sans-serif] font-semibold text-[18px] leading-tight">Asistente de Delywa</div>
              <div className="text-[13px] text-white/80 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#7CE0A8]" />Contesta al instante</div>
            </div>
            <button onClick={nuevaConversacion} aria-label="Empezar de nuevo" title="Empezar de nuevo" className="w-10 h-10 grid place-items-center rounded-full hover:bg-white/15" data-testid="button-asistente-nuevo"><RotateCcw className="w-5 h-5" /></button>
            <button onClick={() => setAbierto(false)} aria-label="Cerrar el chat" className="w-10 h-10 grid place-items-center rounded-full hover:bg-white/15" data-testid="button-asistente-cerrar"><X className="w-6 h-6" /></button>
          </header>

          <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3" aria-live="polite">
            {mensajes.map((m, i) => (
              <div key={i} className={m.de === "persona" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.de === "persona" ? "max-w-[82%] rounded-2xl rounded-br-md bg-[#17804F] text-white px-3.5 py-2.5 text-[15.5px]" : "max-w-[90%] space-y-2"}>
                  {m.de === "persona" ? m.texto : (
                    <>
                      <div className="rounded-2xl rounded-bl-md bg-white border border-[#F0E2CC] px-3.5 py-2.5 text-[15.5px] text-[#1F2420] leading-snug" data-testid="asistente-respuesta">{conFormato(m.texto)}</div>
                      {m.r?.planes?.length ? (
                        <div className="space-y-2">
                          {m.r.planes.map((p) => (
                            <div key={p.nombre} className="rounded-2xl bg-white border-2 border-[#E7F2EC] px-3.5 py-3" data-testid="asistente-plan">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-['Fredoka',sans-serif] font-semibold text-[17px] text-[#0F5C39]">{p.nombre}</span>
                                <span className="font-extrabold text-[#1F2420]">{pesos(p.precio)}<span className="text-[13px] font-semibold text-[#6B736F]">/mes</span></span>
                              </div>
                              {p.descripcion && <div className="text-[14px] text-[#4A524E] mt-0.5">{p.descripcion}</div>}
                              {p.caracteristicas.length > 0 && <ul className="mt-1.5 text-[14px] text-[#1F2420] space-y-0.5">{p.caracteristicas.map((c) => <li key={c}>✓ {c}</li>)}</ul>}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {m.formulario && <FormSoporte conv={conv} alListo={(t) => setMensajes((x) => [...x, { de: "asistente", texto: t }])} />}
                      {i === ultima && (m.r?.acciones?.length || m.r?.sugerir) ? (
                        <div className="flex flex-wrap gap-2">
                          {m.r!.acciones.filter((a) => !(a === "soporte" && m.formulario)).map((a) => (
                            <button key={a} onClick={() => accion(a)} className={a === "registro" ? "min-h-[40px] px-4 rounded-full bg-[#F28C28] hover:bg-[#E07B17] text-[#1F2420] font-extrabold text-[14.5px]" : "min-h-[40px] px-4 rounded-full bg-[#E7F2EC] hover:bg-[#D5EADF] text-[#0F5C39] font-bold text-[14.5px]"} data-testid={`asistente-accion-${a}`}>{ETIQUETA[a]}</button>
                          ))}
                          {m.r!.sugerir && <button onClick={() => preguntar({ tema: m.r!.sugerir!.tema }, m.r!.sugerir!.titulo)} className="min-h-[40px] px-4 rounded-full border border-[#CFE3D7] text-[#0F5C39] font-bold text-[14.5px]">También: {m.r!.sugerir.titulo}</button>}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
            {escribiendo && (
              <div className="flex"><div className="rounded-2xl rounded-bl-md bg-white border border-[#F0E2CC] px-4 py-3 flex gap-1.5" aria-label="Escribiendo">
                {[0, 1, 2].map((k) => <span key={k} className="w-2 h-2 rounded-full bg-[#8FB8A1] animate-bounce" style={{ animationDelay: `${k * 0.15}s` }} />)}
              </div></div>
            )}
            {mensajes.length <= 1 && !escribiendo && (
              <div className="flex flex-wrap gap-2 pt-1" data-testid="asistente-rapidos">
                {RAPIDOS.map(([tema, titulo]) => (
                  <button key={tema} onClick={() => preguntar({ tema }, titulo)} className="min-h-[42px] px-4 rounded-full bg-white border border-[#CFE3D7] hover:border-[#17804F] text-[#0F5C39] font-bold text-[15px]">{titulo}</button>
                ))}
              </div>
            )}
            <div ref={fin} />
          </div>

          <form onSubmit={enviar} className="border-t border-[#F0E2CC] bg-white p-2.5 flex gap-2 pb-[max(10px,env(safe-area-inset-bottom))]">
            <input ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"
              className="flex-1 min-h-[48px] rounded-full bg-[#F7F4EE] px-4 text-[16px] outline-none focus:ring-2 focus:ring-[#17804F]/40" data-testid="input-asistente" />
            <button type="submit" disabled={!texto.trim() || escribiendo} aria-label="Enviar" className="w-12 h-12 rounded-full bg-[#17804F] disabled:bg-[#B8CFC2] text-white grid place-items-center" data-testid="button-asistente-enviar"><Send className="w-5 h-5" /></button>
          </form>
        </section>
      )}
    </div>,
    document.body,
  );
}

function FormSoporte({ conv, alListo }: { conv: string | null; alListo: (texto: string) => void }) {
  const [f, setF] = useState({ nombre: "", correo: "", whatsapp: "", negocio: "", necesita: "" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }) });
  const clase = "w-full min-h-[44px] rounded-xl border border-[#E3D9C8] bg-white px-3 text-[15.5px] outline-none focus:border-[#17804F]";

  if (listo) return null;
  async function mandar(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setEnviando(true);
    try {
      const res = await fetch("/api/asistente/soporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, conv }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar.");
      setListo(true);
      if (data.enviado) alListo(`¡Listo, ${f.nombre.split(" ")[0]}! El equipo de Delywa te va a escribir pronto${f.correo ? ". Te mandamos una copia a tu correo" : " por WhatsApp"}.`);
      else { alListo("Se abrió tu correo con el mensaje ya escrito: solo toca **Enviar**. Si no se abrió, escribe a **soporte@delywa.com**."); if (data.mailto) window.location.href = data.mailto; }
    } catch (err: any) { setError(err.message); } finally { setEnviando(false); }
  }
  return (
    <form onSubmit={mandar} className="rounded-2xl bg-white border border-[#F0E2CC] p-3 space-y-2" data-testid="form-asistente-soporte">
      <input {...campo("nombre")} placeholder="Tu nombre *" maxLength={80} className={clase} data-testid="input-soporte-nombre" />
      <input {...campo("correo")} type="email" placeholder="Tu correo" maxLength={120} className={clase} data-testid="input-soporte-correo" />
      <input {...campo("whatsapp")} type="tel" placeholder="Tu WhatsApp" maxLength={25} className={clase} data-testid="input-soporte-whatsapp" />
      <input {...campo("negocio")} placeholder="Nombre del colmado" maxLength={80} className={clase} />
      <textarea {...campo("necesita")} placeholder="¿En qué te ayudamos? *" maxLength={1500} rows={3} className={`${clase} py-2.5`} data-testid="input-soporte-necesita" />
      <div className="text-[13px] text-[#6B736F]">Déjanos tu correo o tu WhatsApp para contestarte.</div>
      {error && <div className="text-[14px] font-semibold text-[#B3261E]" role="alert">{error}</div>}
      <button type="submit" disabled={enviando} className="w-full min-h-[46px] rounded-full bg-[#17804F] hover:bg-[#0F5C39] disabled:opacity-60 text-white font-extrabold" data-testid="button-soporte-enviar">{enviando ? "Enviando…" : "Enviar"}</button>
    </form>
  );
}
