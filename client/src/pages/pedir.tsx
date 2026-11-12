import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { Camera, Loader2, MapPin, Mic, Send, Square } from "lucide-react";
import { prepararFoto } from "@/lib/imagen";
import { businessTheme } from "@/lib/temaNegocio";

// Chat del colmado (delywa.com/pedir/<colmado>).
// Es lo mismo que escribirle al colmado por WhatsApp: el mismo bot atiende, pide la dirección,
// toma el pedido y el colmado ve la conversación en su panel. No hay menú: se pide hablando.

type Info = { id: number; nombre: string; logo: string | null; colorPrimario: string | null; direccion: string; estaAbierto: boolean; mensajeCerrado: string | null; codigoPais: string };
type Mensaje = { id: number; rol: string; contenido: string; fecha: string | number };
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

  const leer = useCallback(async () => {
    if (!sesion) return;
    const r = await fetch(`/api/chat-colmado/sesion/${sesion.sessionId}/mensajes?despues=${ultimoId.current}`).catch(() => null);
    if (!r) return;
    if (r.status === 404) { guardar(codigo, null); setSesion(null); setMensajes([]); ultimoId.current = 0; return; }
    if (!r.ok) return;
    const data = (await r.json()) as { mensajes: Mensaje[]; pedido: Pedido };
    setPedido(data.pedido);
    if (data.mensajes.length) {
      ultimoId.current = data.mensajes[data.mensajes.length - 1].id;
      setMensajes((m) => [...m, ...data.mensajes.filter((x) => !m.some((y) => y.id === x.id))]);
      if (data.mensajes.some((x) => x.rol !== "user" && x.id > desde.current)) setEsperando(false);
    }
  }, [sesion, codigo]);

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

  useEffect(() => { abajo.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes.length, esperando]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      const r = await fetch(`/api/chat-colmado/${encodeURIComponent(codigo)}/sesion`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, telefono }),
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

  const cabecera = (
    <header className="flex items-center gap-3 px-4 py-3 text-white shadow bg-primary">
      <div className="w-10 h-10 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0">
        {info.logo ? <img src={info.logo} alt="" className="w-full h-full object-cover" /> : <span className="font-bold">{info.nombre.charAt(0)}</span>}
      </div>
      <div className="min-w-0">
        <h1 className="font-semibold truncate" data-testid="text-nombre-colmado">{info.nombre}</h1>
        <p className="text-xs text-white/80 truncate">{esperando ? "escribiendo…" : info.estaAbierto ? "En línea" : info.mensajeCerrado || "Cerrado ahora"}</p>
      </div>
    </header>
  );

  if (!sesion) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#efeae2]" style={tema}>
        {cabecera}
        <main className="flex-1 flex items-center justify-center p-4">
          <form onSubmit={entrar} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4" data-testid="form-entrar-chat">
            <div className="text-center">
              <h2 className="text-xl font-bold">Escríbele a {info.nombre}</h2>
              <p className="text-sm text-gray-500 mt-1">Pide lo que necesites como si fuera por WhatsApp. Te responden aquí mismo.</p>
            </div>
            <label className="block text-sm font-medium">Tu nombre
              <input className="mt-1 w-full h-11 rounded-lg border px-3" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} autoComplete="name" required data-testid="input-nombre-chat" />
            </label>
            <label className="block text-sm font-medium">Tu teléfono
              <input className="mt-1 w-full h-11 rounded-lg border px-3" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="809 555 1234" autoComplete="tel" required data-testid="input-telefono-chat" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={entrando} className="w-full h-12 rounded-full text-white font-semibold disabled:opacity-60 bg-primary" data-testid="button-entrar-chat">
              {entrando ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Empezar a chatear"}
            </button>
            <p className="text-xs text-gray-400 text-center">Usamos tu número solo para tu pedido y la entrega. <a className="underline" href="/legal#privacidad" target="_blank" rel="noopener">Privacidad</a></p>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-[#efeae2]" style={tema}>
      {cabecera}
      {pedido && (
        <div className="bg-white/90 border-b px-4 py-2 text-sm flex justify-between" data-testid="estado-pedido">
          <span>Pedido #{pedido.id}: <b>{ESTADOS[pedido.estado] ?? pedido.estado}</b></span>
          {pedido.total && <span className="text-gray-500">RD${Number(pedido.total).toLocaleString("es-DO")}</span>}
        </div>
      )}
      <main className="flex-1 overflow-y-auto px-3 py-4 space-y-2" data-testid="lista-mensajes">
        {mensajes.length === 0 && !esperando && (
          <div className="mx-auto max-w-xs text-center text-sm bg-[#fff5c4] rounded-lg px-3 py-2 text-gray-700">
            Hola {sesion.nombre.split(" ")[0]} 👋 Escribe tu pedido, por ejemplo: «una funda de pan y un litro de leche».
          </div>
        )}
        {mensajes.map((m) => {
          const mio = m.rol === "user";
          return (
            <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-[15px] shadow-sm ${mio ? "bg-[#d9fdd3]" : "bg-white"}`}>
                <Texto t={m.contenido} />
                <span className="block text-right text-[11px] text-gray-400 mt-1">{hora(m.fecha)}</span>
              </div>
            </div>
          );
        })}
        {esperando && (
          <div className="flex justify-start"><div className="bg-white rounded-lg px-4 py-3 shadow-sm"><span className="inline-flex gap-1"><i className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" /><i className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" /><i className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" /></span></div></div>
        )}
        <div ref={abajo} />
      </main>
      {error && <p className="px-4 py-1 text-sm text-red-600 bg-white">{error}</p>}
      <form onSubmit={enviarTexto} className="flex items-end gap-2 p-2 bg-[#f0f2f5]">
        <button type="button" onClick={enviarUbicacion} className="p-2 text-gray-600" title="Enviar mi ubicación" aria-label="Enviar mi ubicación"><MapPin /></button>
        <button type="button" onClick={() => foto.current?.click()} disabled={subiendo} className="p-2 text-gray-600" title="Enviar comprobante de pago" aria-label="Enviar comprobante de pago">
          {subiendo ? <Loader2 className="animate-spin" /> : <Camera />}
        </button>
        <input ref={foto} type="file" accept="image/*" className="hidden" onChange={subirComprobante} data-testid="input-comprobante" />
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarTexto(); } }}
          rows={1}
          maxLength={1500}
          placeholder="Escribe un mensaje"
          className="flex-1 resize-none rounded-2xl px-4 py-2.5 bg-white outline-none max-h-32"
          data-testid="input-mensaje"
        />
        {texto.trim() ? (
          <button type="submit" className="p-3 rounded-full text-white bg-primary" aria-label="Enviar" data-testid="button-enviar"><Send size={20} /></button>
        ) : (
          <button type="button" onClick={alternarVoz} className={`p-3 rounded-full text-white ${grabando ? "bg-red-500 animate-pulse" : "bg-primary"}`} aria-label={grabando ? "Detener y enviar" : "Grabar nota de voz"}>
            {grabando ? <Square size={20} /> : <Mic size={20} />}
          </button>
        )}
      </form>
    </div>
  );
}
