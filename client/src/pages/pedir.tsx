import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { Loader2, Square } from "lucide-react";
import { Avatar, Burbuja, IOS, IPhone, IconoIOS, SeparadorFecha, fondoWhatsApp, horaCorta, textoFecha } from "@/components/whatsapp/ios";
import { prepararFoto } from "@/lib/imagen";
import { businessTheme } from "@/lib/temaNegocio";

// Chat del colmado (delywa.com/pedir/<colmado>).
// Es lo mismo que escribirle al colmado por WhatsApp: el mismo bot atiende, pide la dirección,
// toma el pedido y el colmado ve la conversación en su panel. No hay menú: se pide hablando.

type Info = { id: number; nombre: string; logo: string | null; colorPrimario: string | null; direccion: string; estaAbierto: boolean; mensajeCerrado: string | null; codigoPais: string };
type Opcion = { texto: string; accion?: "ubicacion" | "comprobante" };
type Mensaje = { id: number; rol: string; contenido: string; fecha: string | number; opciones?: Opcion[] | null };
type Pedido = { id: number; estado: string; total: string | null; metodoPago: string | null } | null;
type Guardado = { sessionId: string; nombre: string; telefono: string };

const ESTADOS: Record<string, string> = {
  pendiente_confirmacion: "Esperando confirmación", esperando_pago: "Esperando pago", esperando_confirmacion_pago: "Revisando tu pago",
  pendiente: "Pedido recibido", en_preparacion: "Preparando tu pedido", listo: "Listo", en_camino: "En camino 🛵", llegando: "Llegando 📍",
  entregado: "Entregado ✅", cancelado: "Cancelado", retorno: "Devuelto",
};

const claveLocal = (codigo: string) => `delywa-chat:${codigo}`;
function leerGuardado(codigo: string): Guardado | null {
  try { return JSON.parse(localStorage.getItem(claveLocal(codigo)) || "null"); } catch { return null; }
}
function guardar(codigo: string, g: Guardado | null) {
  try { g ? localStorage.setItem(claveLocal(codigo), JSON.stringify(g)) : localStorage.removeItem(claveLocal(codigo)); } catch { /* navegador sin almacenamiento */ }
}
/** Identificador al azar de este navegador: la conversación solo se reabre desde el mismo aparato. */
function aparato(): string {
  try {
    let a = localStorage.getItem("delywa-aparato") || "";
    if (!/^[0-9a-f]{32}$/.test(a)) {
      a = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("delywa-aparato", a);
    }
    return a;
  } catch { return ""; }
}
const hora = (f: string | number) => new Date(f).toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });

/** Texto con *negritas* como en WhatsApp y saltos de línea. */
function Texto({ t }: { t: string }) {
  return <>{t.split("\n").map((linea, i) => (
    <span key={i}>{i > 0 && <br />}{linea.split(/(\*[^*\n]+\*)/g).map((p, j) => (p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={j}>{p.slice(1, -1)}</b> : p))}</span>
  ))}</>;
}

export default function PedirPage() {
  const { codigo = "" } = useParams<{ codigo: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [sesion, setSesion] = useState<Guardado | null>(() => leerGuardado(codigo));
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pedido, setPedido] = useState<Pedido>(null);
  const [texto, setTexto] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [menuAdjuntar, setMenuAdjuntar] = useState(false);
  const ultimoId = useRef(0);
  const desde = useRef(0);
  const abajo = useRef<HTMLDivElement>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const foto = useRef<HTMLInputElement>(null);
  const colmado = info;
  const tema = { ...businessTheme(colmado?.colorPrimario) };

  useEffect(() => {
    fetch(`/api/chat-colmado/${encodeURIComponent(codigo)}/info`)
      .then(async (r) => { if (!r.ok) throw new Error(); setInfo(await r.json()); })
      .catch(() => setNoExiste(true));
  }, [codigo]);

  /** 10 minutos sin actividad: vuelve a la pantalla de nombre y teléfono. */
  const cerrarPorInactividad = useCallback(() => {
    guardar(codigo, null); setSesion(null); setMensajes([]); setPedido(null); setEsperando(false); ultimoId.current = 0;
    setNombre(""); setTelefono("");
    setError("Por tu seguridad cerramos el chat tras 10 minutos sin actividad. Escribe tus datos para continuar donde lo dejaste.");
  }, [codigo]);

  const leer = useCallback(async () => {
    if (!sesion) return;
    const r = await fetch(`/api/chat-colmado/sesion/${sesion.sessionId}/mensajes?despues=${ultimoId.current}`).catch(() => null);
    if (!r) return;
    if (r.status === 404) { guardar(codigo, null); setSesion(null); setMensajes([]); ultimoId.current = 0; return; }
    if (r.status === 423) { cerrarPorInactividad(); return; }
    if (!r.ok) return;
    const data = (await r.json()) as { mensajes: Mensaje[]; pedido: Pedido };
    setPedido(data.pedido);
    if (data.mensajes.length) {
      ultimoId.current = data.mensajes[data.mensajes.length - 1].id;
      setMensajes((m) => [...m, ...data.mensajes.filter((x) => !m.some((y) => y.id === x.id))]);
      if (data.mensajes.some((x) => x.rol !== "user" && x.id > desde.current)) setEsperando(false);
    }
  }, [sesion, codigo, cerrarPorInactividad]);

  // Lee los mensajes nuevos: cada 2 s mientras espera respuesta, cada 6 s el resto del tiempo.
  useEffect(() => {
    if (!sesion) return;
    leer();
    const t = setInterval(() => { if (document.visibilityState === "visible") leer(); }, esperando ? 2000 : 6000);
    return () => clearInterval(t);
  }, [sesion, esperando, leer]);

  // Si en 45 s no llegó respuesta, se quita el "escribiendo".
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setEsperando(false), 45_000);
    return () => clearTimeout(t);
  }, [esperando]);

  useEffect(() => { const caja = abajo.current?.closest(".overflow-y-auto"); if (caja) caja.scrollTo({ top: caja.scrollHeight, behavior: "smooth" }); }, [mensajes.length, esperando]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      const r = await fetch(`/api/chat-colmado/${encodeURIComponent(codigo)}/sesion`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, telefono, aparato: aparato() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || "No se pudo abrir el chat."); return; }
      const g = { sessionId: data.sessionId, nombre: data.nombre, telefono: data.telefono };
      guardar(codigo, g);
      ultimoId.current = 0;
      setMensajes([]);
      setSesion(g);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setEntrando(false);
    }
  };

  const mandar = async (ruta: string, cuerpo: unknown, local?: string) => {
    if (!sesion) return;
    setError(null);
    const temporal = local ? { id: -Date.now(), rol: "user", contenido: local, fecha: Date.now() } : null;
    if (temporal) setMensajes((m) => [...m, temporal]);
    desde.current = ultimoId.current;
    setEsperando(true);
    try {
      const r = await fetch(`/api/chat-colmado/sesion/${sesion.sessionId}/${ruta}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
      });
      const data = await r.json().catch(() => ({}));
      if (temporal) setMensajes((m) => m.filter((x) => x.id !== temporal.id));
      if (r.status === 423) { cerrarPorInactividad(); return; }
      if (!r.ok) { setError(data.error || "No se pudo enviar."); setEsperando(false); return; }
      await leer();
    } catch {
      if (temporal) setMensajes((m) => m.filter((x) => x.id !== temporal.id));
      setError("Error de conexión. Intenta de nuevo.");
      setEsperando(false);
    }
  };

  const enviarTexto = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    mandar("mensaje", { texto: t }, t);
  };

  const enviarUbicacion = () => {
    if (!navigator.geolocation) { setError("Tu teléfono no permite compartir la ubicación."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => mandar("ubicacion", { latitude: p.coords.latitude, longitude: p.coords.longitude }, "📍 Ubicación compartida"),
      () => setError("No se pudo obtener tu ubicación. Revisa el permiso del navegador."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const alternarVoz = async () => {
    if (grabando) { grabadora.current?.stop(); return; }
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(flujo);
      const partes: Blob[] = [];
      rec.ondataavailable = (e) => partes.push(e.data);
      rec.onstop = () => {
        flujo.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        const blob = new Blob(partes, { type: rec.mimeType || "audio/webm" });
        const lector = new FileReader();
        lector.onload = () => mandar("voz", { audioData: lector.result }, "🎤 Nota de voz…");
        lector.readAsDataURL(blob);
      };
      grabadora.current = rec;
      rec.start();
      setGrabando(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 120_000);
    } catch {
      setError("No se pudo usar el micrófono. Revisa el permiso del navegador.");
    }
  };

  const subirComprobante = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const original = ev.target.files?.[0];
    ev.target.value = "";
    if (!original || !sesion) return;
    setSubiendo(true);
    setError(null);
    try {
      const file = await prepararFoto(original);
      const pre = await fetch("/api/uploads/request-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `comprobante.${file.type.split("/")[1] || "jpg"}`, size: file.size, contentType: file.type, uso: "comprobante" }),
      });
      if (!pre.ok) throw new Error();
      const { uploadURL, objectPath } = await pre.json();
      if (!(await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file })).ok) throw new Error();
      await mandar("comprobante", { comprobanteUrl: objectPath });
    } catch {
      setError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setSubiendo(false);
    }
  };

  if (noExiste) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-2xl font-bold">Colmado no encontrado</h1><p className="text-gray-500 mt-2">El enlace puede estar vencido o el colmado no está disponible.</p></div></div>;
  }
  if (!info) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  // Cabecera de chat de WhatsApp en iPhone.
  const cabecera = (
    <header className="shrink-0 flex items-center gap-2.5 px-3 h-[54px] bg-[#F6F6F6]/95 backdrop-blur border-b border-[#D1D1D6]">
      <Avatar nombre={info.nombre} foto={info.logo} tamano={38} color={IOS.verdeOscuro} />
      <div className="flex-1 min-w-0 leading-tight">
        <h1 className="text-[16px] font-semibold text-black truncate flex items-center gap-1" data-testid="text-nombre-colmado">
          {info.nombre}
          <svg width="15" height="15" viewBox="0 0 24 24" aria-label="Negocio verificado"><path d="M12 1.5l2.6 1.9 3.2-.2 1 3 2.7 1.8-1 3 1 3-2.7 1.8-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3-2.7-1.8 1-3-1-3 2.7-1.8 1-3 3.2.2z" fill="#25D366"/><path d="M8 12.3l2.6 2.6L16.3 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </h1>
        <p className={`text-[12.5px] truncate ${esperando ? "text-[#1DAA61]" : "text-[#8E8E93]"}`}>
          {esperando ? "escribiendo…" : info.estaAbierto ? "en línea" : info.mensajeCerrado || "cerrado ahora"}
        </p>
      </div>
    </header>
  );

  const pantalla = !sesion ? (
    // Bienvenida: como la tarjeta de "este negocio usa WhatsApp" pero para entrar al chat.
    <div className="flex-1 min-h-0 flex flex-col" style={{ ...tema, ...fondoWhatsApp }}>
      {cabecera}
      <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 gap-3">
        <div className="max-w-[300px] text-center text-[12.5px] text-[#54656F] bg-[#FFEECD] rounded-lg px-3 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]">
          🔒 Este es el chat oficial de {info.nombre} en DelyWa. Te atiende al instante.
        </div>
        <form onSubmit={entrar} className="w-full max-w-[320px] bg-white rounded-2xl shadow-[0_1px_3px_rgba(11,20,26,.2)] p-5 space-y-3" data-testid="form-entrar-chat">
          <div className="flex flex-col items-center text-center gap-2">
            <Avatar nombre={info.nombre} foto={info.logo} tamano={72} color={IOS.verdeOscuro} />
            <h2 className="text-[19px] font-semibold text-black">{info.nombre}</h2>
            <p className="text-[14px] text-[#667781]">Pide lo que necesites como por WhatsApp. Te responden aquí mismo.</p>
          </div>
          <input className="w-full h-11 rounded-xl bg-[#F0F2F5] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#25D366]" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="name" placeholder="Tu nombre" aria-label="Tu nombre" required data-testid="input-nombre-chat" />
          <input className="w-full h-11 rounded-xl bg-[#F0F2F5] px-3 text-[16px] outline-none focus:ring-2 focus:ring-[#25D366]" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Tu teléfono (809 555 1234)" aria-label="Tu teléfono" autoComplete="tel" required data-testid="input-telefono-chat" />
          {error && <p className="text-[13px] text-[#B42318]">{error}</p>}
          <button type="submit" disabled={entrando} className="w-full h-11 rounded-full text-white text-[16px] font-semibold disabled:opacity-60 bg-primary active:opacity-90" data-testid="button-entrar-chat">
            {entrando ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Empezar a chatear"}
          </button>
          <p className="text-[11.5px] text-[#8E8E93] text-center">Usamos tu número solo para tu pedido y la entrega. <a className="underline" href="/legal#privacidad" target="_blank" rel="noopener">Privacidad</a></p>
        </form>
      </main>
    </div>
  ) : (
    <div className="flex-1 min-h-0 flex flex-col" style={tema}>
      {cabecera}
      {pedido && (
        <div className="shrink-0 bg-white/95 border-b border-[#E5E5EA] px-4 py-2 text-[13.5px] flex justify-between items-center" data-testid="estado-pedido">
          <span className="flex items-center gap-1.5">📌 Pedido #{pedido.id}: <b>{ESTADOS[pedido.estado] ?? pedido.estado}</b></span>
          {pedido.total && Number(pedido.total) > 0 && <span className="text-[#667781]">RD${Number(pedido.total).toLocaleString("es-DO")}</span>}
        </div>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto py-2" style={fondoWhatsApp} data-testid="lista-mensajes">
        <div className="flex justify-center my-2 px-6">
          <span className="text-center text-[12px] text-[#54656F] bg-[#FFEECD] rounded-lg px-3 py-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]">🔒 Chat directo con {info.nombre}. Tus datos solo los ve el colmado.</span>
        </div>
        {mensajes.length === 0 && !esperando && (
          <Burbuja mia={false} cola hora={horaCorta(new Date())}>
            <span>Hola {sesion.nombre.split(" ")[0]} 👋 Escribe tu pedido, por ejemplo: «una funda de pan y un litro de leche».</span>
          </Burbuja>
        )}
        {mensajes.map((m, i) => {
          const fecha = new Date(m.fecha);
          const anterior = mensajes[i - 1];
          const nuevoDia = !anterior || new Date(anterior.fecha).toDateString() !== fecha.toDateString();
          const mio = m.rol === "user";
          const cola = nuevoDia || !anterior || (anterior.rol === "user") !== mio;
          return (
            <div key={m.id}>
              {nuevoDia && <SeparadorFecha texto={textoFecha(fecha)} />}
              <Burbuja mia={mio} cola={cola} hora={horaCorta(fecha)} leido={m.id > 0}>
                <Texto t={m.contenido} />
              </Burbuja>
            </div>
          );
        })}
        {/* Botones de respuesta rápida bajo el último mensaje del bot (como los botones de WhatsApp). */}
        {!esperando && (() => {
          const ultimo = mensajes[mensajes.length - 1];
          if (!ultimo || ultimo.rol === "user" || !ultimo.opciones?.length) return null;
          return (
            <div className="px-3 mt-1 flex flex-col gap-1 max-w-[80%]" data-testid="opciones-rapidas">
              {ultimo.opciones.map((o) => (
                <button
                  key={o.texto}
                  type="button"
                  onClick={() => (o.accion === "ubicacion" ? enviarUbicacion() : o.accion === "comprobante" ? foto.current?.click() : mandar("mensaje", { texto: o.texto }, o.texto))}
                  className="w-full rounded-[10px] bg-white py-2.5 text-[15px] font-medium text-[#027EB5] shadow-[0_1px_0.5px_rgba(11,20,26,.13)] active:bg-[#F0F2F5]"
                >
                  {o.texto}
                </button>
              ))}
            </div>
          );
        })()}
        {esperando && (
          <div className="flex justify-start px-3 mt-2">
            <div className="bg-white rounded-[10px] rounded-tl-none px-4 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,.13)]">
              <span className="inline-flex gap-1"><i className="w-2 h-2 bg-[#8E8E93] rounded-full animate-bounce" /><i className="w-2 h-2 bg-[#8E8E93] rounded-full animate-bounce [animation-delay:150ms]" /><i className="w-2 h-2 bg-[#8E8E93] rounded-full animate-bounce [animation-delay:300ms]" /></span>
            </div>
          </div>
        )}
        <div ref={abajo} className="h-2" />
      </main>
      {error && <p className="shrink-0 px-4 py-1.5 text-[13px] text-[#7A5B00] bg-[#FFF8E1] border-t border-[#FFE082]">{error}</p>}
      {menuAdjuntar && (
        <div className="shrink-0 bg-white border-t border-[#E5E5EA] grid grid-cols-2 gap-2 p-3" data-testid="menu-adjuntar">
          <button type="button" onClick={() => { setMenuAdjuntar(false); enviarUbicacion(); }} className="flex flex-col items-center gap-1.5 py-2 rounded-xl active:bg-[#F0F2F5]">
            <span className="w-12 h-12 rounded-full bg-[#1DAA61] flex items-center justify-center">{IconoIOS.ubicacion("#fff")}</span>
            <span className="text-[13px] text-black">Ubicación</span>
          </button>
          <button type="button" onClick={() => { setMenuAdjuntar(false); foto.current?.click(); }} className="flex flex-col items-center gap-1.5 py-2 rounded-xl active:bg-[#F0F2F5]">
            <span className="w-12 h-12 rounded-full bg-[#007AFF] flex items-center justify-center">{IconoIOS.camara("#fff")}</span>
            <span className="text-[13px] text-black">Comprobante de pago</span>
          </button>
        </div>
      )}
      <form onSubmit={enviarTexto} className="shrink-0 flex items-end gap-2 px-2 pt-1.5 pb-2 md:pb-7 bg-[#F6F6F6] border-t border-[#D1D1D6]">
        <button type="button" onClick={() => setMenuAdjuntar((v) => !v)} className="w-9 h-9 flex items-center justify-center shrink-0" title="Adjuntar ubicación o comprobante" aria-label="Adjuntar ubicación o comprobante">
          {IconoIOS.mas()}
        </button>
        <input ref={foto} type="file" accept="image/*" className="hidden" onChange={subirComprobante} data-testid="input-comprobante" />
        <div className="flex-1 min-w-0 flex items-end rounded-[18px] bg-white border border-[#D1D1D6] pl-3 pr-2 min-h-[36px]">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }}
            rows={1}
            maxLength={1500}
            placeholder=""
            aria-label="Mensaje"
            className="flex-1 min-w-0 w-full resize-none bg-transparent outline-none text-[16px] py-[7px] max-h-28"
            data-testid="input-mensaje"
          />
        </div>
        {texto.trim() ? (
          <button type="submit" className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center shrink-0" aria-label="Enviar" data-testid="button-enviar">{IconoIOS.enviar()}</button>
        ) : (
          <>
            <button type="button" onClick={() => foto.current?.click()} disabled={subiendo} className="w-9 h-9 flex items-center justify-center shrink-0" title="Enviar comprobante de pago" aria-label="Enviar comprobante de pago">
              {subiendo ? <Loader2 className="animate-spin" color={IOS.azul} /> : IconoIOS.camara()}
            </button>
            <button type="button" onClick={alternarVoz} className={`w-9 h-9 flex items-center justify-center shrink-0 rounded-full ${grabando ? "bg-[#FF3B30] animate-pulse" : ""}`} aria-label={grabando ? "Detener y enviar" : "Grabar nota de voz"}>
              {grabando ? <Square size={16} color="#fff" fill="#fff" /> : IconoIOS.microfono()}
            </button>
          </>
        )}
      </form>
    </div>
  );

  return (
    <div className="h-[100dvh] w-full flex bg-[#efeae2] md:bg-gradient-to-br md:from-[#dfe7e3] md:to-[#cfd8dc]" style={{ ...businessTheme(colmado?.colorPrimario) }}>
      <IPhone alto="calc(100dvh - 2rem)">{pantalla}</IPhone>
    </div>
  );
}
