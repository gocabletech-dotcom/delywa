// Delywa · Manual interactivo (mismo modelo que el de FoodPOS): capturas reales con puntos,
// recorrido guiado, paso a paso, consejos, preguntas, progreso por aparato y buscador.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Bike, BookOpen, Building2, Check, ChefHat, ClipboardList, Contact, CreditCard, DollarSign, Eye, History,
  Home, KeyRound, Lightbulb, Link2, ListChecks, LogIn, Map as MapIcon, MapPin, MessageCircle, Package, PauseCircle, Phone,
  Play, Route, Search, Settings, ShoppingCart, Smartphone, Store, Truck, Undo2, Users, BarChart3, HelpCircle, ZoomIn, ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { GUIA, type ClaveManual, type Icono, type Manual, type Modulo } from "@/manual/guia";
import capturasJson from "@/manual/capturas.json";

type Punto = { x: number; y: number; bx: number; by: number; bw: number; bh: number } | null;
type Captura = { img: string; w: number; h: number; spots: Punto[] };
const CAP = capturasJson as Record<string, Captura>;

const ICONOS: Record<Icono, LucideIcon> = {
  map: MapIcon, home: Home, package: Package, check: Check, chef: ChefHat, truck: Truck, undo: Undo2, history: History,
  chat: MessageCircle, bike: Bike, phone: Phone, clipboard: ClipboardList, money: DollarSign, chart: BarChart3, users: Users,
  contact: Contact, gear: Settings, link: Link2, whatsapp: Smartphone, building: Building2, key: KeyRound, login: LogIn,
  route: Route, pause: PauseCircle, store: Store, cart: ShoppingCart, pin: MapPin, card: CreditCard, eye: Eye,
};
const Ic = ({ n, className = "w-5 h-5" }: { n: Icono; className?: string }) => {
  const C = ICONOS[n] ?? HelpCircle;
  return <C className={className} aria-hidden="true" />;
};

// ---------- progreso guardado en este aparato ----------
const LS = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem("delywa_man_" + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem("delywa_man_" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

const CLAVES = Object.keys(GUIA) as ClaveManual[];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const sinNumero = (t: string) => t.replace(/^\d+\.\s*/, "");

function leerHash(solo: ClaveManual | null, porDefecto: ClaveManual): { man: ClaveManual; id: string | null } {
  const [m, id] = window.location.hash.replace(/^#\/?/, "").split("/");
  let man = (CLAVES.includes(m as ClaveManual) ? m : porDefecto) as ClaveManual;
  if (solo && man !== solo) man = solo;
  return { man, id: id || null };
}

export interface ManualInteractivoProps {
  /** Dentro del panel del negocio: sin encabezado propio y con "Abrir esta pantalla". */
  embebido?: boolean;
  porDefecto?: ClaveManual;
}

export default function ManualInteractivo({ embebido = false, porDefecto = "negocio" }: ManualInteractivoProps) {
  const solo = useMemo(() => {
    const s = new URLSearchParams(window.location.search).get("solo");
    return CLAVES.includes(s as ClaveManual) ? (s as ClaveManual) : null;
  }, []);
  const [{ man, id }, setRuta] = useState(() => leerHash(solo, porDefecto));
  const [, refrescar] = useState(0);
  useEffect(() => {
    const cambio = () => setRuta(leerHash(solo, porDefecto));
    window.addEventListener("hashchange", cambio);
    return () => window.removeEventListener("hashchange", cambio);
  }, [solo, porDefecto]);

  const M = GUIA[man];
  useEffect(() => {
    const anterior = document.title;
    document.title = `${M.titulo} · Delywa`;
    return () => { document.title = anterior; };
  }, [M.titulo]);
  useEffect(() => { window.scrollTo(0, 0); }, [man, id]);

  const modulo = id ? M.modulos.find((m) => m.id === id) : undefined;
  const estilo = { "--c": M.color } as CSSProperties;

  return (
    <div className="min-h-full bg-slate-50 text-slate-900" style={estilo} data-testid="manual">
      <Barra man={man} solo={solo} embebido={embebido} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        {modulo ? <VistaModulo man={man} M={M} m={modulo} embebido={embebido} alCambiar={() => refrescar((x) => x + 1)} /> : <VistaInicio man={man} M={M} />}
      </main>
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 text-center text-sm text-slate-500">
        ¿No encuentras lo que buscas? Escríbenos a <a className="font-medium underline" href="mailto:soporte@delywa.com">soporte@delywa.com</a>
      </footer>
    </div>
  );
}

// ---------- barra superior: manuales y buscador ----------
function Barra({ man, solo, embebido }: { man: ClaveManual; solo: ClaveManual | null; embebido: boolean }) {
  const lista = solo ? [] : CLAVES;
  return (
    <header className={`${embebido ? "" : "sticky top-0"} z-20 bg-white/95 backdrop-blur border-b border-slate-200`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
        {!embebido && (
          <a href={solo ? `#${solo}` : "/"} className="flex items-center gap-2 font-bold text-lg mr-2" data-testid="manual-logo">
            <span className="w-9 h-9 rounded-xl bg-[#17804F] text-white flex items-center justify-center"><BookOpen className="w-5 h-5" /></span>
            Delywa <small className="text-slate-500 font-medium text-sm">Manual</small>
          </a>
        )}
        {lista.length > 0 && (
          <nav className="flex gap-1.5 overflow-x-auto" aria-label="Manuales" data-testid="manual-switch">
            {lista.map((k) => {
              const on = k === man;
              return (
                <a
                  key={k}
                  href={`#${k}`}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 h-10 text-sm font-semibold whitespace-nowrap border transition-colors ${on ? "text-white border-transparent" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"}`}
                  style={on ? { background: GUIA[k].color } : undefined}
                  aria-current={on ? "page" : undefined}
                  data-testid={`manual-tab-${k}`}
                >
                  <Ic n={GUIA[k].icono} className="w-4 h-4" /> {GUIA[k].corto}
                </a>
              );
            })}
          </nav>
        )}
        <Buscador solo={solo} />
      </div>
    </header>
  );
}

function Buscador({ solo }: { solo: ClaveManual | null }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const indice = useMemo(() => CLAVES.filter((k) => !solo || k === solo).flatMap((man) => GUIA[man].modulos.map((m) => ({
    man, m, txt: [m.titulo, m.que, ...m.spots.map((s) => s[1]), ...(m.pasos ?? []), ...(m.tips ?? []), ...(m.faq ?? []).flat()].join(" "),
  }))), [solo]);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener("click", fuera);
    return () => document.removeEventListener("click", fuera);
  }, []);
  const termino = q.trim();
  const resultados = termino.length < 2 ? [] : indice.filter((x) => norm(x.txt).includes(norm(termino))).slice(0, 12);
  const fragmento = (x: (typeof indice)[number]) => {
    const frases = [x.m.que, ...x.m.spots.map((s) => s[1]), ...(x.m.pasos ?? []), ...(x.m.tips ?? []), ...(x.m.faq ?? []).flat()];
    const t = frases.find((f) => norm(f).includes(norm(termino))) ?? x.m.que;
    const i = norm(t).indexOf(norm(termino));
    if (i < 0) return <>{t.slice(0, 110)}{t.length > 110 ? "…" : ""}</>;
    const a = Math.max(0, i - 40);
    return <>{a ? "…" : ""}{t.slice(a, i)}<mark className="bg-yellow-200 rounded px-0.5">{t.slice(i, i + termino.length)}</mark>{t.slice(i + termino.length, i + termino.length + 60)}…</>;
  };
  const ir = (href: string) => { window.location.hash = href; setAbierto(false); setQ(""); };
  return (
    <div className="relative ml-auto w-full sm:w-80" ref={caja}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && resultados[0]) ir(`${resultados[0].man}/${resultados[0].m.id}`);
          if (e.key === "Escape") { setAbierto(false); (e.target as HTMLInputElement).blur(); }
        }}
        placeholder="Buscar en el manual…"
        aria-label="Buscar en el manual"
        className="w-full h-10 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[color:var(--c)]"
        data-testid="manual-buscar"
      />
      {abierto && termino.length >= 2 && (
        <div className="absolute right-0 left-0 sm:left-auto sm:w-[26rem] mt-2 max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl z-30" data-testid="manual-resultados">
          {resultados.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No encontramos nada. Prueba con otra palabra, por ejemplo «devuelta», «ruta» o «QR».</p>
          ) : resultados.map((x) => (
            <button key={`${x.man}.${x.m.id}`} type="button" onClick={() => ir(`${x.man}/${x.m.id}`)} className="block w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GUIA[x.man].color }}>{GUIA[x.man].corto}</span>
              <b className="block text-[15px]">{x.m.titulo}</b>
              <small className="block text-slate-600 leading-snug">{fragmento(x)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- inicio de un manual ----------
function VistaInicio({ man, M }: { man: ClaveManual; M: Manual }) {
  const ok = LS.get<string[]>("ok_" + man, []).filter((x) => M.modulos.some((m) => m.id === x));
  const pct = Math.round((ok.length / M.modulos.length) * 100);
  const mod = (id: string) => M.modulos.find((m) => m.id === id);
  return (
    <div data-testid={`manual-inicio-${man}`}>
      <section className="flex flex-col sm:flex-row sm:items-center gap-6 py-8">
        <div className="flex-1">
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: M.color }}>{M.corto}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">{M.titulo}</h1>
          <p className="text-lg text-slate-600 mt-3 max-w-2xl">{M.intro}</p>
        </div>
        <div className="w-32 h-32 rounded-full grid place-items-center shrink-0" style={{ background: `conic-gradient(${M.color} ${pct * 3.6}deg, #e2e8f0 0)` }} data-testid="manual-progreso">
          <div className="w-24 h-24 rounded-full bg-white grid place-items-center text-center">
            <div><b className="text-2xl">{ok.length}/{M.modulos.length}</b><small className="block text-xs text-slate-500">aprendidos</small></div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-6">
        <h2 className="font-bold text-lg flex items-center gap-2"><Play className="w-5 h-5" style={{ color: M.color }} /> Empieza aquí</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {M.empieza.map((id, i) => {
            const m = mod(id); if (!m) return null;
            const hecho = ok.includes(id);
            return (
              <span key={id} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-300" aria-hidden="true">→</span>}
                <a href={`#${man}/${id}`} className={`flex items-center gap-2 rounded-full border px-3 h-10 text-sm font-semibold ${hecho ? "bg-[color:var(--c)] text-white border-transparent" : "bg-white border-slate-300 hover:bg-slate-50"}`}>
                  <i className={`not-italic w-6 h-6 rounded-full grid place-items-center text-xs ${hecho ? "bg-white/25" : "bg-slate-100"}`}>{hecho ? "✓" : i + 1}</i>
                  {sinNumero(m.titulo)}
                </a>
              </span>
            );
          })}
        </div>
      </section>

      {M.grupos.map(([g, ids]) => (
        <section key={g} className="mt-8">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{g}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ids.map((mid) => {
              const m = mod(mid); if (!m) return null;
              return (
                <a key={mid} href={`#${man}/${mid}`} className="relative rounded-2xl bg-white border border-slate-200 p-4 hover:border-[color:var(--c)] hover:shadow-md transition" data-testid={`manual-tarjeta-${mid}`}>
                  <span className="w-10 h-10 rounded-xl grid place-items-center text-white mb-3" style={{ background: M.color }}><Ic n={m.icono} /></span>
                  <b className="block text-[16px] leading-tight">{m.titulo}</b>
                  <p className="text-sm text-slate-600 mt-1.5 line-clamp-3">{m.que}</p>
                  {ok.includes(mid) && <span className="absolute top-3 right-3 w-6 h-6 rounded-full grid place-items-center text-white text-xs" style={{ background: M.color }} aria-label="Aprendido">✓</span>}
                </a>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-sm text-slate-500 mt-8">Toca un tema para ver la pantalla real con sus puntos explicados, el paso a paso y los consejos. Tu progreso se guarda en este aparato.</p>
    </div>
  );
}

// ---------- un tema ----------
function VistaModulo({ man, M, m, embebido, alCambiar }: { man: ClaveManual; M: Manual; m: Modulo; embebido: boolean; alCambiar: () => void }) {
  const i = M.modulos.findIndex((x) => x.id === m.id);
  const prev = M.modulos[i - 1], next = M.modulos[i + 1];
  const cap = m.cap ? CAP[`${man}.${m.id}`] : undefined;
  const movil = !!cap && cap.w < 600;
  const spots = m.spots.map(([, t], k) => ({ t, s: cap?.spots[k] ?? null })).filter((x): x is { t: string; s: NonNullable<Punto> } => !!x.s);
  const [ok, setOk] = useState<string[]>(() => LS.get("ok_" + man, []));
  const [pasos, setPasos] = useState<number[]>(() => LS.get(`pasos_${man}.${m.id}`, []));
  const [actual, setActual] = useState(-1);
  const [ancho, setAncho] = useState<boolean>(() => LS.get("ancho", false));
  useEffect(() => { setActual(-1); setPasos(LS.get(`pasos_${man}.${m.id}`, [])); setOk(LS.get("ok_" + man, [])); }, [man, m.id]);

  const aprendido = ok.includes(m.id);
  const marcar = (on: boolean) => {
    const lista = on ? Array.from(new Set([...LS.get<string[]>("ok_" + man, []), m.id])) : LS.get<string[]>("ok_" + man, []).filter((x) => x !== m.id);
    LS.set("ok_" + man, lista); setOk(lista); alCambiar();
  };
  const tocarPaso = (k: number) => {
    const lista = pasos.includes(k) ? pasos.filter((x) => x !== k) : [...pasos, k];
    LS.set(`pasos_${man}.${m.id}`, lista); setPasos(lista);
    if (m.pasos && lista.length === m.pasos.length && !aprendido) marcar(true);
  };
  const enfocar = (k: number) => {
    setActual(k);
    if (k >= 0 && (movil || window.innerWidth < 1024)) {
      requestAnimationFrame(() => {
        const b = document.querySelector(`[data-spot="${k}"]`)?.getBoundingClientRect();
        if (b && (b.top < 80 || b.bottom > window.innerHeight - 160)) window.scrollBy({ top: b.top - window.innerHeight / 2, behavior: "smooth" });
      });
    }
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!spots.length || /input|textarea|select/i.test((document.activeElement?.tagName ?? ""))) return;
      if (e.key === "ArrowRight") enfocar(Math.min(spots.length - 1, actual + 1));
      if (e.key === "ArrowLeft") enfocar(Math.max(-1, actual - 1));
      if (e.key === "Escape") enfocar(-1);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  });

  const foco = actual >= 0 ? spots[actual] : null;
  return (
    <div className="grid lg:grid-cols-[230px_1fr] gap-6 pt-6" data-testid={`manual-modulo-${m.id}`}>
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <a href={`#${man}`} className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: M.color }}><ArrowLeft className="w-4 h-4" /> {M.titulo}</a>
          {M.grupos.map(([g, ids]) => (
            <div key={g} className="mb-3">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{g}</h4>
              {ids.map((x) => {
                const mm = M.modulos.find((y) => y.id === x); if (!mm) return null;
                const on = x === m.id;
                return (
                  <a key={x} href={`#${man}/${x}`} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${on ? "font-semibold bg-white shadow-sm" : "text-slate-600 hover:bg-white"}`} style={on ? { color: M.color } : undefined}>
                    <Ic n={mm.icono} className="w-4 h-4 shrink-0" /><span className="flex-1 leading-tight">{mm.titulo}</span>
                    {ok.includes(x) && <span className="text-xs" style={{ color: M.color }}>✓</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      <article className="min-w-0">
        <nav className="text-sm text-slate-500 mb-3"><a href={`#${man}`} className="hover:underline">{M.titulo}</a> › {m.titulo}</nav>
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-2xl grid place-items-center text-white shrink-0" style={{ background: M.color }}><Ic n={m.icono} className="w-6 h-6" /></span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">{m.titulo}</h1>
            <p className="text-slate-600 text-[17px] mt-1.5 max-w-3xl">{m.que}</p>
            {embebido && man === "negocio" && m.ruta && (
              <Link href={`/negocio/${m.ruta}`} className="inline-flex items-center gap-2 mt-3 h-10 px-4 rounded-xl text-white text-sm font-semibold" style={{ background: M.color }} data-testid="manual-abrir-pantalla">
                <Play className="w-4 h-4" /> Abrir esta pantalla
              </Link>
            )}
          </div>
        </div>

        {cap && (
          <div className={`mt-6 grid gap-5 ${ancho || movil ? "" : "xl:grid-cols-[1fr_300px]"} ${movil ? "md:grid-cols-[minmax(0,360px)_1fr] md:items-start" : ""}`} data-testid="manual-visual">
            <div>
              <div className={movil ? "mx-auto max-w-[360px] rounded-[2.2rem] border-[10px] border-slate-900 bg-slate-900 shadow-xl overflow-hidden" : "rounded-2xl border border-slate-300 bg-white shadow-lg overflow-hidden"}>
                {!movil && (
                  <div className="flex items-center gap-1.5 px-3 h-8 bg-slate-100 border-b border-slate-200">
                    <i className="w-2.5 h-2.5 rounded-full bg-red-300" /><i className="w-2.5 h-2.5 rounded-full bg-amber-300" /><i className="w-2.5 h-2.5 rounded-full bg-green-300" />
                    <span className="ml-3 text-xs text-slate-500 truncate">{M.url}</span>
                  </div>
                )}
                <div className="relative" data-testid="manual-captura">
                  <img src={`/manual/img/${cap.img}`} alt={`Pantalla: ${m.titulo}`} className="block w-full h-auto" loading="lazy" />
                  {foco && (
                    <div
                      className="absolute rounded-lg pointer-events-none transition-all duration-300"
                      style={{ left: `calc(${foco.s.bx}% - 4px)`, top: `calc(${foco.s.by}% - 4px)`, width: `calc(${foco.s.bw}% + 8px)`, height: `calc(${foco.s.bh}% + 8px)`, boxShadow: `0 0 0 3px ${M.color}, 0 0 0 9999px rgba(15,23,42,.45)` }}
                    />
                  )}
                  {spots.map((x, k) => (
                    <button
                      key={k}
                      type="button"
                      data-spot={k}
                      onClick={() => enfocar(k === actual ? -1 : k)}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-white text-sm font-bold grid place-items-center shadow-lg ring-2 ring-white transition-transform ${k === actual ? "scale-125" : "hover:scale-110"} ${actual < 0 ? "animate-[pulse_2.4s_ease-in-out_infinite]" : ""}`}
                      style={{ left: `${x.s.x}%`, top: `${x.s.y}%`, background: M.color }}
                      aria-label={`Punto ${k + 1}: ${x.t}`}
                      data-testid={`manual-punto-${k + 1}`}
                    >
                      {k + 1}
                    </button>
                  ))}
                </div>
              </div>
              {spots.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white border border-slate-200 p-2.5 sticky bottom-3 shadow-sm" data-testid="manual-recorrido">
                  <span className="text-xs font-bold px-2 py-1 rounded-lg text-white shrink-0" style={{ background: M.color }}>{actual >= 0 ? `${actual + 1} de ${spots.length}` : "Recorrido"}</span>
                  <p className="flex-1 basis-48 text-sm leading-snug min-w-0">{foco ? foco.t : "Toca los números de la pantalla, o inicia el recorrido guiado."}</p>
                  <span className="ml-auto flex gap-2 shrink-0">
                  <button type="button" onClick={() => enfocar(Math.max(-1, actual - 1))} className="w-10 h-10 rounded-xl border border-slate-300 shrink-0" aria-label="Anterior">‹</button>
                  <button type="button" onClick={() => enfocar(actual >= spots.length - 1 ? -1 : actual + 1)} className="h-10 px-3 rounded-xl text-white text-sm font-semibold shrink-0 flex items-center gap-1.5" style={{ background: M.color }} data-testid="manual-siguiente">
                    {actual < 0 ? <><Play className="w-4 h-4" /> Iniciar</> : actual === spots.length - 1 ? "Terminar" : "Siguiente ›"}
                  </button>
                  </span>
                </div>
              )}
            </div>
            <div>
              <h3 className="flex items-center justify-between font-bold mb-2">
                <span>Qué hay en esta pantalla</span>
                {!movil && (
                  <button type="button" className="hidden xl:flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900" onClick={() => { LS.set("ancho", !ancho); setAncho(!ancho); }}>
                    {ancho ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />} {ancho ? "Reducir" : "Ampliar"}
                  </button>
                )}
              </h3>
              <div className="space-y-1.5">
                {spots.map((x, k) => (
                  <button key={k} type="button" onClick={() => enfocar(k === actual ? -1 : k)} className={`w-full text-left flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-snug ${k === actual ? "bg-white shadow-sm" : "bg-white/60 border-slate-200 hover:bg-white"}`} style={k === actual ? { borderColor: M.color } : undefined}>
                    <i className="not-italic w-6 h-6 rounded-full grid place-items-center text-white text-xs font-bold shrink-0" style={{ background: M.color }}>{k + 1}</i>
                    <span>{x.t}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {m.pasos && m.pasos.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-bold text-xl mb-3"><ListChecks className="w-5 h-5" style={{ color: M.color }} /> Paso a paso</h2>
            <div className="space-y-2" data-testid="manual-pasos">
              {m.pasos.map((p, k) => {
                const hecho = pasos.includes(k);
                return (
                  <button key={k} type="button" onClick={() => tocarPaso(k)} className="w-full text-left flex items-start gap-3 rounded-xl bg-white border border-slate-200 px-4 py-3 hover:border-slate-300" aria-pressed={hecho}>
                    <span className={`w-7 h-7 rounded-lg grid place-items-center text-sm font-bold shrink-0 ${hecho ? "text-white" : "bg-slate-100 text-slate-600"}`} style={hecho ? { background: M.color } : undefined}>{hecho ? "✓" : k + 1}</span>
                    <span className={`text-[15px] leading-snug pt-0.5 ${hecho ? "text-slate-500 line-through" : ""}`}>{p}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {m.tips && m.tips.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-bold text-xl mb-3"><Lightbulb className="w-5 h-5" style={{ color: M.color }} /> Consejos</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {m.tips.map((t, k) => (
                <div key={k} className="flex gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[15px] leading-snug"><b className="text-amber-500">★</b><span>{t}</span></div>
              ))}
            </div>
          </section>
        )}

        {m.faq && m.faq.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 font-bold text-xl mb-3"><HelpCircle className="w-5 h-5" style={{ color: M.color }} /> Preguntas frecuentes</h2>
            {m.faq.map(([q, a], k) => (
              <details key={k} className="rounded-xl bg-white border border-slate-200 px-4 py-3 mb-2 group">
                <summary className="font-semibold cursor-pointer">{q}</summary>
                <p className="text-slate-600 mt-2 text-[15px]">{a}</p>
              </details>
            ))}
          </section>
        )}

        <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-slate-200 pt-5">
          {prev ? <a href={`#${man}/${prev.id}`} className="text-sm"><small className="block text-slate-500">‹ Anterior</small><b>{prev.titulo}</b></a> : <span />}
          <button type="button" onClick={() => marcar(!aprendido)} className={`h-11 px-5 rounded-xl font-semibold text-sm border ${aprendido ? "text-white border-transparent" : "bg-white border-slate-300"}`} style={aprendido ? { background: M.color } : undefined} data-testid="manual-aprendido">
            {aprendido ? "✓ Aprendido" : "Marcar como aprendido"}
          </button>
          {next ? <a href={`#${man}/${next.id}`} className="text-sm text-right"><small className="block text-slate-500">Siguiente ›</small><b>{next.titulo}</b></a> : <span />}
        </div>
      </article>
    </div>
  );
}
