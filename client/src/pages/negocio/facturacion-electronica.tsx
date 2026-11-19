import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Circle, Clock, Copy, ExternalLink, FileKey2, Loader2, Plus, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  ENTIDADES_CERTIFICADO, ETAPAS, GUIA_DGII_URL, PASOS_CERTIFICACION, TIPOS_CONTRIBUYENTE, TIPOS_ENCF,
  revisarIdentificacion, type ClavePaso, type DefinicionPaso, type ProveedorFE,
} from "@shared/certificacion";

// Guía para que el negocio quede autorizado por la DGII como emisor electrónico (e-CF).

type Estado = "pendiente" | "en_curso" | "listo";
type Vista = {
  colmadoId: number;
  datos: Record<string, string>;
  identificacion: "ok" | "revisar" | "largo" | null;
  dgii: { estado: string; estadoTexto: string | null; actividad: string | null; regimen: string | null; padronFecha: string | null; consultadoAt: string | null; mensaje: string; bloquea: boolean } | null;
  verificacion?: { resultado: string; mensaje: string };
  certificado: { estado: string; entidad: string; titular: string; vence: string; subido: boolean; diasParaVencer: number | null };
  pasos: Record<ClavePaso, { estado: Estado; fecha?: string | null; nota?: string | null }>;
  avance: { listos: number; total: number; porcentaje: number; siguiente: ClavePaso | null };
  secuencias: Array<{ tipo: string; desde: string; hasta: string; vence?: string | null }>;
  autorizadoAt: string | null;
  plazo: { obligado: boolean; desde: string | null };
  proveedor: ProveedorFE;
};

const ESTADO_UI: Record<Estado, { texto: string; clase: string; Icono: typeof Circle }> = {
  pendiente: { texto: "Pendiente", clase: "bg-slate-100 text-slate-600", Icono: Circle },
  en_curso: { texto: "En curso", clase: "bg-amber-100 text-amber-800", Icono: Clock },
  listo: { texto: "Listo", clase: "bg-green-100 text-green-800", Icono: CheckCircle2 },
};

const campo = "w-full h-11 rounded-xl border border-slate-300 bg-white px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#17804F]/40";
const boton = "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold text-[15px] disabled:opacity-50";
const fechaBonita = (iso?: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" }) : "");

async function pedir(url: string, metodo: string, cuerpo?: unknown): Promise<Vista> {
  const r = await fetch(url, { method: metodo, credentials: "include", headers: cuerpo ? { "Content-Type": "application/json" } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo guardar.");
  return j as Vista;
}

export default function FacturacionElectronicaPage() {
  const { isAuthenticated, isLoading: cargandoSesion } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rol } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => { const r = await fetch("/api/user/role"); return r.ok ? r.json() : null; },
    enabled: isAuthenticated,
  });
  const colmadoId = rol?.colmadoId as number | undefined;
  const esDueno = rol?.role === "colmado_owner" || rol?.role === "platform_admin";
  const base = `/api/colmados/${colmadoId}/facturacion-electronica`;

  useEffect(() => { if (!cargandoSesion && !isAuthenticated) window.location.href = "/login"; }, [cargandoSesion, isAuthenticated]);

  const { data: v, isLoading, error } = useQuery<Vista>({
    queryKey: ["fe-certificacion", colmadoId],
    queryFn: () => pedir(base, "GET"),
    enabled: !!colmadoId,
  });
  const [abierto, setAbierto] = useState<ClavePaso | null>(null);
  const inicial = useRef(false);
  useEffect(() => {
    if (v && !inicial.current) { inicial.current = true; setAbierto(v.avance.siguiente ?? "datos"); }
  }, [v]);

  const guardar = async (url: string, metodo: string, cuerpo?: unknown, aviso = "Guardado") => {
    try {
      const nueva = await pedir(url, metodo, cuerpo);
      qc.setQueryData(["fe-certificacion", colmadoId], nueva);
      toast({ title: aviso });
      return nueva;
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e instanceof Error ? e.message : "", variant: "destructive" });
      return null;
    }
  };

  const etapas = useMemo(() => ([1, 2, 3, 4] as const).map((n) => ({ n, nombre: ETAPAS[n], pasos: PASOS_CERTIFICACION.filter((p) => p.etapa === n) })), []);

  return (
    <NegocioLayout title="Factura electrónica" activeNav="facturacion">
      <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-4">
          {(isLoading || !v) && !error && <div className="flex items-center gap-2 text-slate-500 p-6"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>}
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800" role="alert">{(error as Error).message}</div>}
          {v && (
            <>
              {/* Resumen y avance */}
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Avance de la certificación">
                <div className="flex flex-wrap items-start gap-4 justify-between">
                  <div className="min-w-0 flex-1 basis-72">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Certificación como emisor electrónico</h2>
                    <p className="mt-1 text-slate-600 text-[15px]">Antes de emitir facturas electrónicas (e-CF), la DGII tiene que autorizar a tu negocio. Sigue estos pasos en orden; los que se hacen en la DGII los marcas aquí cuando los termines.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-[#17804F]" data-testid="fe-porcentaje">{v.avance.porcentaje}%</p>
                    <p className="text-sm text-slate-500">{v.avance.listos} de {v.avance.total} pasos</p>
                  </div>
                </div>
                <div className="mt-4 h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={v.avance.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
                  <div className="h-full bg-[#17804F] transition-all" style={{ width: `${v.avance.porcentaje}%` }} />
                </div>
                {v.avance.siguiente ? (
                  <button type="button" onClick={() => { setAbierto(v.avance.siguiente); document.getElementById(`paso-${v.avance.siguiente}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="mt-4 text-left text-[15px] text-slate-700">
                    Siguiente paso: <b className="text-[#17804F] underline">{PASOS_CERTIFICACION.find((p) => p.clave === v.avance.siguiente)?.titulo}</b>
                  </button>
                ) : (
                  <p className="mt-4 flex items-center gap-2 text-green-800 font-semibold"><ShieldCheck className="w-5 h-5" /> Tu negocio está autorizado y tiene secuencias. Ya puede emitir facturas electrónicas.</p>
                )}
                {v.dgii?.bloquea && (
                  <div className="mt-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[15px] text-red-900" role="alert" data-testid="fe-aviso-dgii">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-red-700" aria-hidden="true" />
                    <div><b>Tu {v.datos.rnc.length === 11 ? "cédula" : "RNC"} no está activo en la DGII{v.dgii.estadoTexto ? ` (${v.dgii.estadoTexto})` : ""}.</b> {v.dgii.mensaje}</div>
                  </div>
                )}
                {v.plazo.obligado && !v.autorizadoAt && (
                  <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="note">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700" aria-hidden="true" />
                    <p>La Ley 32-23 ya obliga a {v.datos.tipoContribuyente && ["pequeno", "micro", "no_clasificado"].includes(v.datos.tipoContribuyente) ? "los negocios pequeños, micro y no clasificados" : "tu negocio"} a facturar de forma electrónica{v.plazo.desde ? ` desde el ${fechaBonita(v.plazo.desde)}` : ""}. La DGII dijo que dará facilidades a quien esté en proceso: avanza estos pasos lo antes posible. Ante cualquier duda, consulta a tu contador.</p>
                  </div>
                )}
                <a href={GUIA_DGII_URL} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-fit items-center gap-1.5 text-sm text-[#17804F] underline">Guía oficial de la DGII <ExternalLink className="w-3.5 h-3.5" /></a>
              </section>

              {etapas.map((et) => (
                <section key={et.n} aria-label={et.nombre}>
                  <h3 className="px-1 pt-2 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Etapa {et.n} · {et.nombre}</h3>
                  <div className="space-y-2.5">
                    {et.pasos.map((p) => (
                      <Paso key={p.clave} def={p} n={PASOS_CERTIFICACION.indexOf(p) + 1} v={v} abierto={abierto === p.clave}
                        alternar={() => setAbierto(abierto === p.clave ? null : p.clave)} base={base} guardar={guardar} esDueno={esDueno} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </main>
    </NegocioLayout>
  );
}

type PropsPaso = {
  def: DefinicionPaso; n: number; v: Vista; abierto: boolean; alternar: () => void; base: string; esDueno: boolean;
  guardar: (url: string, metodo: string, cuerpo?: unknown, aviso?: string) => Promise<Vista | null>;
};

function Paso({ def, n, v, abierto, alternar, base, guardar, esDueno }: PropsPaso) {
  const estado = v.pasos[def.clave]?.estado ?? "pendiente";
  const ui = ESTADO_UI[estado];
  return (
    <article id={`paso-${def.clave}`} className={`rounded-2xl border bg-white scroll-mt-20 ${abierto ? "border-[#17804F]/50 shadow-sm" : "border-slate-200"}`} data-testid={`fe-paso-${def.clave}`}>
      <button type="button" onClick={alternar} aria-expanded={abierto} className="w-full flex items-center gap-3 p-4 text-left">
        <span className={`flex-none w-9 h-9 rounded-full grid place-items-center font-bold ${estado === "listo" ? "bg-[#17804F] text-white" : "bg-slate-100 text-slate-600"}`}>
          {estado === "listo" ? <CheckCircle2 className="w-5 h-5" /> : n}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-slate-900 text-[16px]">{def.titulo}</span>
          {!abierto && <span className="block text-sm text-slate-500 truncate">{def.explicacion}</span>}
        </span>
        <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ui.clase}`}><ui.Icono className="w-3.5 h-3.5" />{ui.texto}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="px-4 pb-5 pt-1 border-t border-slate-100">
          <span className={`sm:hidden mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ui.clase}`}><ui.Icono className="w-3.5 h-3.5" />{ui.texto}</span>
          <p className="mt-3 text-[15px] text-slate-700">{def.explicacion}</p>
          <ol className="mt-3 space-y-2 list-none p-0">
            {def.instrucciones.map((t, i) => (
              <li key={i} className="flex gap-3 text-[15px] text-slate-700">
                <span className="flex-none w-6 h-6 rounded-full bg-[#E7F2EC] text-[#0F5C39] text-xs font-bold grid place-items-center mt-0.5">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          {def.enlace && (
            <a href={def.enlace.url} target="_blank" rel="noopener noreferrer" className={`${boton} mt-4 border border-slate-300 text-slate-800 hover:bg-slate-50`}>
              {def.enlace.texto} <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <div className="mt-5">
            {def.clave === "datos" && <FormDatos v={v} base={base} guardar={guardar} />}
            {def.clave === "certificado" && <FormCertificado v={v} base={base} guardar={guardar} esDueno={esDueno} />}
            {(def.clave === "postulacion" || def.clave === "urls") && <DatosProveedor p={v.proveedor} soloUrls={def.clave === "urls"} />}
            {def.clave === "secuencias" && <FormSecuencias v={v} base={base} guardar={guardar} />}
            {!def.automatico && <MarcarPaso clave={def.clave} v={v} base={base} guardar={guardar} conFecha={def.clave === "autorizado"} />}
          </div>
        </div>
      )}
    </article>
  );
}

function Campo({ id, etiqueta, children, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; ayuda?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{etiqueta}</label>
      {children}
      {ayuda && <p className="text-xs text-slate-500">{ayuda}</p>}
    </div>
  );
}

function FormDatos({ v, base, guardar }: { v: Vista; base: string; guardar: PropsPaso["guardar"] }) {
  const [d, setD] = useState(v.datos);
  const [ocupado, setOcupado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [aviso, setAviso] = useState<{ resultado: string; mensaje: string } | null>(null);
  const cambia = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });
  const revision = d.rnc ? revisarIdentificacion(d.rnc) : null;
  const soloNumeros = (x: string) => x.replace(/\D/g, "");
  const mismoRnc = soloNumeros(d.rnc) === soloNumeros(v.datos.rnc);
  // Verificado en la DGII (y es el mismo número): la razón social es la de la DGII.
  const razonFija = mismoRnc && !!v.dgii && v.dgii.estado !== "no_existe";
  const despues = (nueva: Vista | null) => {
    if (!nueva) return;
    setD((x) => ({ ...x, rnc: nueva.datos.rnc, razonSocial: nueva.datos.razonSocial, nombreComercial: nueva.datos.nombreComercial || x.nombreComercial }));
    if (nueva.verificacion) setAviso(nueva.verificacion);
  };
  const verificar = async () => {
    setVerificando(true); setAviso(null);
    despues(await guardar(`${base}/verificar-rnc`, "POST", { rnc: d.rnc }, "Consulta hecha en la DGII"));
    setVerificando(false);
  };
  const estado = aviso?.resultado ?? (mismoRnc ? v.dgii?.estado : undefined);
  const mensaje = aviso?.mensaje ?? (mismoRnc ? v.dgii?.mensaje : undefined);
  const colorAviso = estado === "activo" ? "border-green-200 bg-green-50 text-green-900" : estado === "no_disponible" ? "border-slate-200 bg-slate-50 text-slate-800" : "border-red-200 bg-red-50 text-red-900";
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setOcupado(true); setAviso(null); despues(await guardar(`${base}/datos`, "PUT", { ...v.datos, ...d }, "Datos fiscales guardados")); setOcupado(false); }}>
      <div className="sm:col-span-2">
        <Campo id="fe-rnc" etiqueta="RNC o cédula" ayuda={revision === "revisar" ? <span className="text-amber-700">El número no pasa la verificación de la DGII. Revísalo.</span> : revision === "largo" ? "El RNC tiene 9 números y la cédula 11." : "Escríbelo y toca «Verificar con la DGII»: miramos si está activo y llenamos la razón social."}>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="fe-rnc" className={`${campo} sm:max-w-xs`} inputMode="numeric" value={d.rnc} onChange={(e) => { cambia("rnc")(e); setAviso(null); }} placeholder="1-01-23456-7" data-testid="fe-input-rnc" />
            <button type="button" onClick={verificar} disabled={verificando || (revision !== "ok" && revision !== "revisar")} className={`${boton} border border-[#17804F] text-[#17804F] hover:bg-[#E7F2EC]`} data-testid="fe-verificar-rnc">
              {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}Verificar con la DGII
            </button>
          </div>
        </Campo>
        {estado && mensaje && (
          <div className={`mt-2 flex gap-2.5 rounded-xl border p-3 text-[15px] ${colorAviso}`} role={estado === "activo" ? "status" : "alert"} data-testid="fe-resultado-dgii">
            {estado === "activo" ? <CheckCircle2 className="w-5 h-5 shrink-0 text-green-700" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
            <div>
              {estado === "activo" && <b>✓ Activo en la DGII. </b>}
              {estado !== "activo" && v.dgii?.estadoTexto && mismoRnc && <b>Estado en la DGII: {v.dgii.estadoTexto}. </b>}
              {estado === "activo" ? "Llenamos la razón social tal como aparece en la DGII." : mensaje}
              {estado === "activo" && mismoRnc && v.dgii?.actividad && <div className="text-sm mt-0.5">Actividad: {v.dgii.actividad}{v.dgii.padronFecha ? ` · padrón del ${fechaBonita(v.dgii.padronFecha)}` : ""}</div>}
            </div>
          </div>
        )}
      </div>
      <Campo id="fe-tipo" etiqueta="Tipo de contribuyente">
        <select id="fe-tipo" className={campo} value={d.tipoContribuyente} onChange={cambia("tipoContribuyente")} data-testid="fe-select-tipo">
          <option value="">Elige uno</option>
          {Object.entries(TIPOS_CONTRIBUYENTE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>
      </Campo>
      <Campo id="fe-razon" etiqueta="Razón social (como en la DGII)" ayuda={razonFija ? "Tomada de la DGII. Si está mal, corrígela en la DGII." : undefined}>
        <input id="fe-razon" className={`${campo} ${razonFija ? "bg-slate-50 text-slate-700" : ""}`} value={d.razonSocial} onChange={cambia("razonSocial")} readOnly={razonFija} data-testid="fe-input-razon" />
      </Campo>
      <Campo id="fe-comercial" etiqueta="Nombre comercial (opcional)">
        <input id="fe-comercial" className={campo} value={d.nombreComercial} onChange={cambia("nombreComercial")} />
      </Campo>
      <div className="sm:col-span-2">
        <Campo id="fe-dir" etiqueta="Dirección fiscal">
          <input id="fe-dir" className={campo} value={d.direccionFiscal} onChange={cambia("direccionFiscal")} data-testid="fe-input-direccion" />
        </Campo>
      </div>
      <Campo id="fe-correo" etiqueta="Correo para asuntos fiscales (opcional)">
        <input id="fe-correo" type="email" className={campo} value={d.correoFiscal} onChange={cambia("correoFiscal")} />
      </Campo>
      <div className="sm:col-span-2">
        <button type="submit" disabled={ocupado} className={`${boton} bg-[#17804F] text-white hover:bg-[#0F5C39] w-full sm:w-auto`} data-testid="fe-guardar-datos">{ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Guardar datos fiscales</button>
      </div>
    </form>
  );
}

function FormCertificado({ v, base, guardar, esDueno }: { v: Vista; base: string; guardar: PropsPaso["guardar"]; esDueno: boolean }) {
  const [rep, setRep] = useState({ repNombre: v.datos.repNombre, repCedula: v.datos.repCedula, repCargo: v.datos.repCargo, repCorreo: v.datos.repCorreo });
  const [archivo, setArchivo] = useState<{ nombre: string; base64: string } | null>(null);
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const c = v.certificado;
  const leerArchivo = (f: File | undefined) => {
    if (!f) return setArchivo(null);
    const lector = new FileReader();
    lector.onload = () => setArchivo({ nombre: f.name, base64: String(lector.result).replace(/^data:[^,]*,/, "") });
    lector.readAsDataURL(f);
  };
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-50 p-4">
        <p className="font-semibold text-slate-800 mb-3">Persona que firmará (dueña del certificado)</p>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setOcupado(true); await guardar(`${base}/datos`, "PUT", { ...v.datos, ...rep }, "Firmante guardado"); setOcupado(false); }}>
          <Campo id="fe-rep-nombre" etiqueta="Nombre completo"><input id="fe-rep-nombre" className={campo} value={rep.repNombre} onChange={(e) => setRep({ ...rep, repNombre: e.target.value })} data-testid="fe-input-rep-nombre" /></Campo>
          <Campo id="fe-rep-cedula" etiqueta="Cédula"><input id="fe-rep-cedula" className={campo} inputMode="numeric" value={rep.repCedula} onChange={(e) => setRep({ ...rep, repCedula: e.target.value })} placeholder="001-0000000-0" data-testid="fe-input-rep-cedula" /></Campo>
          <Campo id="fe-rep-cargo" etiqueta="Cargo"><input id="fe-rep-cargo" className={campo} value={rep.repCargo} onChange={(e) => setRep({ ...rep, repCargo: e.target.value })} placeholder="Dueño, gerente…" /></Campo>
          <Campo id="fe-rep-correo" etiqueta="Correo"><input id="fe-rep-correo" type="email" className={campo} value={rep.repCorreo} onChange={(e) => setRep({ ...rep, repCorreo: e.target.value })} /></Campo>
          <div className="sm:col-span-2"><button type="submit" disabled={ocupado} className={`${boton} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 w-full sm:w-auto`}>Guardar firmante</button></div>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="fe-cert-estado" etiqueta="¿Tienes el certificado digital?">
          <select id="fe-cert-estado" className={campo} value={c.estado} onChange={(e) => guardar(`${base}/certificado`, "PUT", { estado: e.target.value })} data-testid="fe-select-cert-estado">
            <option value="no_tiene">Todavía no</option>
            <option value="en_tramite">Lo estoy sacando</option>
            <option value="listo">Ya lo tengo</option>
          </select>
        </Campo>
        <Campo id="fe-cert-entidad" etiqueta="Entidad que lo emite">
          <select id="fe-cert-entidad" className={campo} value={c.entidad} onChange={(e) => guardar(`${base}/certificado`, "PUT", { entidad: e.target.value })}>
            <option value="">Elige una</option>
            {Object.entries(ENTIDADES_CERTIFICADO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </Campo>
      </div>

      {c.subido ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex flex-wrap items-center gap-3" data-testid="fe-cert-subido">
          <FileKey2 className="w-6 h-6 text-green-700" aria-hidden="true" />
          <div className="flex-1 min-w-0 text-[15px]">
            <p className="font-semibold text-green-900">Certificado guardado (cifrado)</p>
            <p className="text-green-900">{c.titular} · vence el {fechaBonita(c.vence)}</p>
            {c.diasParaVencer !== null && c.diasParaVencer <= 30 && <p className="text-amber-800 font-semibold">Vence en {c.diasParaVencer} días: renuévalo para no dejar de facturar.</p>}
          </div>
          {esDueno && (
            <button type="button" className={`${boton} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
              onClick={() => { if (window.confirm("¿Quitar el certificado guardado? Tendrás que subirlo de nuevo para facturar.")) guardar(`${base}/certificado`, "DELETE", undefined, "Certificado quitado"); }}>
              <Trash2 className="w-4 h-4" /> Quitar
            </button>
          )}
        </div>
      ) : esDueno ? (
        <form className="rounded-xl border border-dashed border-slate-300 p-4 space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!archivo) return;
          setOcupado(true);
          const ok = await guardar(`${base}/certificado`, "PUT", { archivo: archivo.base64, clave }, "Certificado guardado");
          setOcupado(false);
          if (ok) { setArchivo(null); setClave(""); }
        }}>
          <p className="font-semibold text-slate-800">Subir el certificado (.p12 o .pfx)</p>
          <label className="flex flex-wrap items-center gap-3 cursor-pointer">
            <span className={`${boton} bg-[#E7F2EC] text-[#0F5C39]`}>Elegir archivo</span>
            <span className="text-sm text-slate-600 break-all">{archivo?.nombre ?? "Ningún archivo elegido"}</span>
            <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => leerArchivo(e.target.files?.[0])} className="sr-only" aria-label="Archivo del certificado" data-testid="fe-input-cert-archivo" />
          </label>
          <Campo id="fe-cert-clave" etiqueta="Contraseña del certificado">
            <input id="fe-cert-clave" type="password" autoComplete="off" className={campo} value={clave} onChange={(e) => setClave(e.target.value)} data-testid="fe-input-cert-clave" />
          </Campo>
          <p className="text-xs text-slate-500">Se revisa que abra con esa contraseña y que no esté vencido. Se guarda cifrado; nadie puede verlo ni descargarlo.</p>
          <button type="submit" disabled={!archivo || !clave || ocupado} className={`${boton} bg-[#17804F] text-white hover:bg-[#0F5C39] w-full sm:w-auto`} data-testid="fe-subir-cert">{ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Subir certificado</button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">El certificado lo sube el dueño del negocio.</p>
      )}
    </div>
  );
}

function Copiable({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const { toast } = useToast();
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-500">{etiqueta}</p>
        <p className="text-[15px] text-slate-900 break-all">{valor || <span className="text-slate-400">Por definir</span>}</p>
      </div>
      {valor && (
        <button type="button" className="flex-none w-10 h-10 grid place-items-center rounded-lg border border-slate-200 hover:bg-slate-50" aria-label={`Copiar ${etiqueta}`}
          onClick={async () => { await navigator.clipboard.writeText(valor); toast({ title: "Copiado" }); }}>
          <Copy className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function DatosProveedor({ p, soloUrls }: { p: ProveedorFE; soloUrls: boolean }) {
  const listo = Boolean(p.nombre && p.urlRecepcion);
  return (
    <div className="rounded-xl bg-slate-50 p-4 mb-4">
      <p className="font-semibold text-slate-800">{soloUrls ? "Direcciones (URL) para copiar" : "Datos para copiar en la postulación"}</p>
      {!listo && <p className="mt-2 text-sm text-amber-800">Delywa todavía está completando estos datos con el proveedor certificado. Puedes avanzar los otros pasos mientras tanto.</p>}
      <div className="mt-2">
        {!soloUrls && (
          <>
            <Copiable etiqueta="Tipo de registro" valor="Emisor Electrónico" />
            <Copiable etiqueta="Tipo de software" valor="Adquirido de un proveedor externo" />
            <Copiable etiqueta="Nombre del software" valor={p.software} />
            <Copiable etiqueta="Versión del software" valor={p.version} />
          </>
        )}
        <Copiable etiqueta="URL de Recepción" valor={p.urlRecepcion} />
        <Copiable etiqueta="URL de Aprobación Comercial" valor={p.urlAprobacion} />
        <Copiable etiqueta="URL de Autenticación" valor={p.urlAutenticacion} />
        {!soloUrls && (
          <>
            <Copiable etiqueta="Proveedor" valor={p.nombre} />
            <Copiable etiqueta="RNC del proveedor" valor={p.rnc} />
            {p.contacto && <Copiable etiqueta="Contacto del proveedor" valor={p.contacto} />}
          </>
        )}
      </div>
    </div>
  );
}

function MarcarPaso({ clave, v, base, guardar, conFecha }: { clave: ClavePaso; v: Vista; base: string; guardar: PropsPaso["guardar"]; conFecha: boolean }) {
  const actual = v.pasos[clave];
  const [nota, setNota] = useState(actual?.nota ?? "");
  const [fecha, setFecha] = useState(actual?.fecha ?? new Date().toISOString().slice(0, 10));
  const marcar = (estado: Estado) => guardar(`${base}/pasos/${clave}`, "PUT", { estado, nota, fecha: conFecha ? fecha : undefined }, estado === "listo" ? "Paso marcado como listo" : "Guardado");
  return (
    <div className="space-y-3">
      {conFecha && (
        <Campo id={`fe-fecha-${clave}`} etiqueta="Fecha de la autorización">
          <input id={`fe-fecha-${clave}`} type="date" className={`${campo} sm:max-w-xs`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      )}
      <Campo id={`fe-nota-${clave}`} etiqueta="Nota (opcional)">
        <textarea id={`fe-nota-${clave}`} rows={2} className={`${campo} h-auto py-2`} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: enviada el lunes, número de solicitud…" />
      </Campo>
      <div className="flex flex-wrap gap-2">
        {actual?.estado !== "listo" ? (
          <>
            <button type="button" className={`${boton} bg-[#17804F] text-white hover:bg-[#0F5C39]`} onClick={() => marcar("listo")} data-testid={`fe-listo-${clave}`}><CheckCircle2 className="w-4 h-4" /> Ya lo hice</button>
            {actual?.estado !== "en_curso" && <button type="button" className={`${boton} border border-slate-300 text-slate-800 hover:bg-slate-50`} onClick={() => marcar("en_curso")}>Lo estoy haciendo</button>}
            {actual?.estado === "en_curso" && <button type="button" className={`${boton} border border-slate-300 text-slate-800 hover:bg-slate-50`} onClick={() => marcar("en_curso")}>Guardar nota</button>}
          </>
        ) : (
          <>
            <p className="w-full text-sm text-green-800">Marcado como listo{actual.fecha ? ` el ${fechaBonita(actual.fecha)}` : ""}.</p>
            <button type="button" className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50`} onClick={() => marcar("en_curso")}>Volver a «en curso»</button>
          </>
        )}
      </div>
    </div>
  );
}

function FormSecuencias({ v, base, guardar }: { v: Vista; base: string; guardar: PropsPaso["guardar"] }) {
  const [filas, setFilas] = useState(v.secuencias.length ? v.secuencias.map((s) => ({ ...s, vence: s.vence ?? "" })) : [{ tipo: "32", desde: "", hasta: "", vence: "" }]);
  const [ocupado, setOcupado] = useState(false);
  const cambia = (i: number, k: string, valor: string) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: k === "desde" || k === "hasta" ? valor.toUpperCase() : valor } : f)));
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setOcupado(true);
      await guardar(`${base}/secuencias`, "PUT", { secuencias: filas.filter((f) => f.desde || f.hasta).map((f) => ({ ...f, vence: f.vence || null })) }, "Secuencias guardadas");
      setOcupado(false);
    }}>
      {filas.map((f, i) => (
        <fieldset key={i} className="rounded-xl border border-slate-200 p-3 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <legend className="sr-only">Rango {i + 1}</legend>
          <Campo id={`fe-sec-tipo-${i}`} etiqueta="Tipo">
            <select id={`fe-sec-tipo-${i}`} className={campo} value={f.tipo} onChange={(e) => cambia(i, "tipo", e.target.value)}>
              {Object.entries(TIPOS_ENCF).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </Campo>
          <Campo id={`fe-sec-desde-${i}`} etiqueta="Desde"><input id={`fe-sec-desde-${i}`} className={campo} value={f.desde} onChange={(e) => cambia(i, "desde", e.target.value)} placeholder={`E${f.tipo}0000000001`} maxLength={13} data-testid={`fe-sec-desde-${i}`} /></Campo>
          <Campo id={`fe-sec-hasta-${i}`} etiqueta="Hasta"><input id={`fe-sec-hasta-${i}`} className={campo} value={f.hasta} onChange={(e) => cambia(i, "hasta", e.target.value)} placeholder={`E${f.tipo}0000000500`} maxLength={13} data-testid={`fe-sec-hasta-${i}`} /></Campo>
          <Campo id={`fe-sec-vence-${i}`} etiqueta="Vence"><input id={`fe-sec-vence-${i}`} type="date" className={campo} value={f.vence ?? ""} onChange={(e) => cambia(i, "vence", e.target.value)} /></Campo>
          <button type="button" className="h-11 w-11 grid place-items-center rounded-xl border border-slate-200 text-red-700 hover:bg-red-50 justify-self-end" aria-label={`Quitar rango ${i + 1}`} onClick={() => setFilas(filas.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${boton} border border-slate-300 text-slate-800 hover:bg-slate-50`} onClick={() => setFilas([...filas, { tipo: "31", desde: "", hasta: "", vence: "" }])}><Plus className="w-4 h-4" /> Agregar rango</button>
        <button type="submit" disabled={ocupado} className={`${boton} bg-[#17804F] text-white hover:bg-[#0F5C39]`} data-testid="fe-guardar-secuencias">{ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Guardar secuencias</button>
      </div>
    </form>
  );
}
