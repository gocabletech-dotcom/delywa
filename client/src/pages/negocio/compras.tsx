import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2, Truck, X } from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// Compras (cargo de mercancía): registrar la factura del suplidor, sumar al inventario, actualizar el
// costo y llevar lo que se le debe. Solo dueño y colmadero.

type Suplidor = { id: number; nombre: string; rnc: string | null; telefono: string | null; vendedor: string | null; diasCredito: number | null; debo: number; vencido: number };
type Producto = { id: number; nombre: string; precio: string; categoria: string; inventario: number | null };
type CompraFila = { id: number; suplidor: string; suplidorId: number; factura: string | null; ncf: string | null; fecha: string; total: number; saldo: number; formaPago: string; vence: string | null; estado: string };
type Linea = { clave: string; descripcion: string; cantidad: string; unidades: string; costo: string; productoId: string; nuevoNombre: string; nuevoPrecio: string; auto?: boolean };

const dinero = (n: number) => `RD$${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const campo = "w-full h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#17804F]/40";
const boton = "inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl font-semibold text-[15px] disabled:opacity-50";
const FORMAS = [["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["tarjeta", "Tarjeta"], ["cheque", "Cheque"], ["credito", "A crédito"]] as const;
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** Igual que en el servidor: así reconoce lo que ya aprendió de este suplidor. */
const claveDescripcion = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ/.\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
const lineaVacia = (): Linea => ({ clave: crypto.randomUUID(), descripcion: "", cantidad: "1", unidades: "1", costo: "", productoId: "", nuevoNombre: "", nuevoPrecio: "" });

async function pedir<T = any>(url: string, metodo = "GET", cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: metodo, credentials: "include", headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo");
  return j;
}

export default function ComprasPage() {
  const { isAuthenticated, isLoading: cargandoSesion } = useAuth();
  useEffect(() => { if (!cargandoSesion && !isAuthenticated) window.location.href = "/login"; }, [cargandoSesion, isAuthenticated]);
  const { data: rol } = useQuery({ queryKey: ["user-role"], queryFn: async () => { const r = await fetch("/api/user/role"); return r.ok ? r.json() : null; }, enabled: isAuthenticated });
  const colmadoId = rol?.colmadoId as number | undefined;
  const [tab, setTab] = useState<"nueva" | "lista" | "pagar" | "suplidores">("lista");
  const [abierta, setAbierta] = useState<number | null>(null);
  const TABS = [["lista", "Compras"], ["nueva", "+ Nueva compra"], ["pagar", "Por pagar"], ["suplidores", "Suplidores"]] as const;
  return (
    <NegocioLayout title="Compras" activeNav="compras">
      <main className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex gap-1.5 overflow-x-auto" role="tablist">
            {TABS.map(([id, t]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`tab-${id}`}
                className={`shrink-0 px-4 h-10 rounded-full text-sm font-semibold border ${tab === id ? "bg-[#17804F] border-[#17804F] text-white" : "border-slate-300 text-slate-700 bg-white"}`}>{t}</button>
            ))}
          </div>
          {colmadoId && tab === "nueva" && <NuevaCompra colmadoId={colmadoId} alGuardar={(id) => { setTab("lista"); setAbierta(id); }} />}
          {colmadoId && tab === "lista" && <ListaCompras colmadoId={colmadoId} porPagar={false} onAbrir={setAbierta} onNueva={() => setTab("nueva")} />}
          {colmadoId && tab === "pagar" && <ListaCompras colmadoId={colmadoId} porPagar onAbrir={setAbierta} onNueva={() => setTab("nueva")} />}
          {colmadoId && tab === "suplidores" && <Suplidores colmadoId={colmadoId} />}
        </div>
      </main>
      {colmadoId && abierta && <DetalleCompra colmadoId={colmadoId} id={abierta} onCerrar={() => setAbierta(null)} />}
    </NegocioLayout>
  );
}

function useSuplidores(colmadoId: number) {
  return useQuery<{ suplidores: Suplidor[] }>({ queryKey: ["suplidores", colmadoId], queryFn: () => pedir(`/api/colmados/${colmadoId}/suplidores`) });
}

function FormSuplidor({ colmadoId, onListo, onCancelar }: { colmadoId: number; onListo: (s: Suplidor) => void; onCancelar?: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState({ nombre: "", rnc: "", telefono: "", vendedor: "", diasCredito: "" });
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2" data-testid="form-suplidor">
      <div className="grid sm:grid-cols-2 gap-2">
        <input className={campo} placeholder="Nombre del suplidor" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} data-testid="suplidor-nombre" />
        <input className={campo} placeholder="RNC (opcional)" inputMode="numeric" value={f.rnc} onChange={(e) => setF({ ...f, rnc: e.target.value })} />
        <input className={campo} placeholder="Teléfono (opcional)" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={campo} placeholder="Vendedor (opcional)" value={f.vendedor} onChange={(e) => setF({ ...f, vendedor: e.target.value })} />
        <input className={campo} placeholder="Días de crédito (ej. 15)" inputMode="numeric" value={f.diasCredito} onChange={(e) => setF({ ...f, diasCredito: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={ocupado || !f.nombre.trim()} className={`${boton} bg-[#17804F] text-white`} data-testid="suplidor-guardar"
          onClick={async () => { setOcupado(true); try { onListo({ ...(await pedir(`/api/colmados/${colmadoId}/suplidores`, "POST", f)), debo: 0, vencido: 0 }); } catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); } setOcupado(false); }}>
          {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}Guardar suplidor
        </button>
        {onCancelar && <button type="button" className={`${boton} border border-slate-300`} onClick={onCancelar}>Cancelar</button>}
      </div>
    </div>
  );
}

function NuevaCompra({ colmadoId, alGuardar }: { colmadoId: number; alGuardar: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: sup } = useSuplidores(colmadoId);
  const { data: productos = [] } = useQuery<Producto[]>({ queryKey: ["menu-productos", colmadoId], queryFn: () => pedir(`/api/colmados/${colmadoId}/menu`) });
  const { data: costos } = useQuery<{ costos: Record<number, number> }>({ queryKey: ["costos", colmadoId], queryFn: () => pedir(`/api/colmados/${colmadoId}/compras/costos`) });
  const [suplidorId, setSuplidorId] = useState("");
  const [nuevoSuplidor, setNuevoSuplidor] = useState(false);
  const { data: memoria } = useQuery<{ equivalencias: Array<{ descripcion: string; menuProductoId: number; unidadesPorPaquete: number }> }>({
    queryKey: ["equivalencias", colmadoId, suplidorId], queryFn: () => pedir(`/api/colmados/${colmadoId}/suplidores/${suplidorId}/equivalencias`), enabled: !!suplidorId,
  });
  const [cab, setCab] = useState({ factura: "", ncf: "", fecha: hoy(), itbis: "", descuento: "", totalFactura: "", formaPago: "efectivo", vence: "", abonoInicial: "", notas: "" });
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ id: number; avisos: string[]; nuevos: string[] } | null>(null);
  const suplidor = sup?.suplidores.find((s) => String(s.id) === suplidorId);

  const cambiar = (clave: string, cambios: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  // Lo que ya sabe de este suplidor: al escribir la descripción, pone el producto y las unidades.
  const reconocer = (l: Linea) => {
    const k = claveDescripcion(l.descripcion);
    const m = memoria?.equivalencias.find((e) => e.descripcion === k);
    if (m && !l.productoId) cambiar(l.clave, { productoId: String(m.menuProductoId), unidades: String(m.unidadesPorPaquete), auto: true });
  };
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const subtotal = lineas.reduce((s, l) => s + num(l.cantidad) * num(l.costo), 0);
  const total = subtotal + num(cab.itbis) - num(cab.descuento);
  const factor = subtotal > 0 ? total / subtotal : 1;
  const descuadre = cab.totalFactura && Math.abs(num(cab.totalFactura) - total) > 1;
  const nombreProducto = useMemo(() => new Map(productos.map((p) => [String(p.id), p])), [productos]);

  const guardar = async () => {
    if (!suplidorId) { toast({ title: "Elige el suplidor", variant: "destructive" }); return; }
    setOcupado(true);
    try {
      const r = await pedir(`/api/colmados/${colmadoId}/compras`, "POST", {
        ...cab, suplidorId: Number(suplidorId),
        lineas: lineas.filter((l) => l.descripcion.trim() || l.costo).map((l) => ({
          descripcion: l.descripcion, cantidad: num(l.cantidad), unidadesPorPaquete: Math.round(num(l.unidades)) || 1, costo: num(l.costo),
          ...(l.productoId === "nuevo" ? { nuevo: { nombre: l.nuevoNombre || l.descripcion, precio: num(l.nuevoPrecio) } } : l.productoId ? { menuProductoId: Number(l.productoId) } : {}),
        })),
      });
      setResultado({ id: r.compra.id, avisos: r.avisos, nuevos: r.nuevos });
      for (const k of ["menu-productos", "costos", "suplidores", "compras", "inventario-alertas", "por-pagar"]) qc.invalidateQueries({ queryKey: [k] });
    } catch (e: any) { toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" }); }
    setOcupado(false);
  };

  if (resultado) return (
    <div className="rounded-2xl bg-white border border-slate-200 p-6 space-y-3 text-center" data-testid="compra-guardada">
      <p className="text-xl font-bold text-slate-900">✅ Compra #{resultado.id} registrada</p>
      <p className="text-slate-600">Las cantidades ya se sumaron a tu inventario.</p>
      {resultado.nuevos.length > 0 && <p className="text-sm text-slate-700">Productos nuevos: {resultado.nuevos.join(", ")}.</p>}
      {resultado.avisos.map((a) => <p key={a} className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex gap-2 text-left"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a} Cambia el precio en Productos e inventario si hace falta.</p>)}
      <div className="flex justify-center gap-2">
        <button type="button" className={`${boton} border border-slate-300`} onClick={() => alGuardar(resultado.id)}>Ver la compra</button>
        <button type="button" className={`${boton} bg-[#17804F] text-white`} onClick={() => { setResultado(null); setLineas([lineaVacia()]); setCab({ ...cab, factura: "", ncf: "", itbis: "", descuento: "", totalFactura: "", abonoInicial: "", notas: "" }); }}>Otra compra</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="nueva-compra">
      <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><Truck className="w-5 h-5 text-[#17804F]" />Suplidor y factura</h2>
        <div className="flex gap-2">
          <select className={campo} value={suplidorId} onChange={(e) => { setSuplidorId(e.target.value); const s = sup?.suplidores.find((x) => String(x.id) === e.target.value); if (s?.diasCredito) setCab((c0) => ({ ...c0, formaPago: "credito" })); }} data-testid="elegir-suplidor">
            <option value="">Elige el suplidor…</option>
            {sup?.suplidores.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.debo ? ` · le debes ${dinero(s.debo)}` : ""}</option>)}
          </select>
          <button type="button" className={`${boton} border border-slate-300 shrink-0`} onClick={() => setNuevoSuplidor(true)} data-testid="nuevo-suplidor"><Plus className="w-4 h-4" />Nuevo</button>
        </div>
        {nuevoSuplidor && <FormSuplidor colmadoId={colmadoId} onCancelar={() => setNuevoSuplidor(false)} onListo={(s) => { qc.invalidateQueries({ queryKey: ["suplidores", colmadoId] }); setSuplidorId(String(s.id)); setNuevoSuplidor(false); }} />}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className="text-xs font-semibold text-slate-600">Factura #<input className={campo} value={cab.factura} onChange={(e) => setCab({ ...cab, factura: e.target.value })} /></label>
          <label className="text-xs font-semibold text-slate-600">NCF (opcional)<input className={campo} value={cab.ncf} onChange={(e) => setCab({ ...cab, ncf: e.target.value.toUpperCase() })} placeholder="B0100000123" /></label>
          <label className="text-xs font-semibold text-slate-600">Fecha<input type="date" className={campo} value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} /></label>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
        <h2 className="font-bold text-slate-900">Productos de la factura</h2>
        <p className="text-sm text-slate-500">Escribe cada línea como viene en la factura. Si viene por caja o paquete, pon cuántas unidades trae: así el inventario suma unidades. {memoria?.equivalencias.length ? "Lo que ya conoces de este suplidor se llena solo." : ""}</p>
        <div className="space-y-3">
          {lineas.map((l, i) => {
            const p = nombreProducto.get(l.productoId);
            const costoUnidad = num(l.costo) * factor / (Math.round(num(l.unidades)) || 1);
            const costoAntes = p ? costos?.costos[p.id] : undefined;
            return (
              <div key={l.clave} className="rounded-xl border border-slate-200 p-3 space-y-2" data-testid={`linea-compra-${i}`}>
                <div className="grid grid-cols-12 gap-2">
                  <input className={`${campo} col-span-12 sm:col-span-5`} placeholder="Lo que dice la factura (ej. PRES GDE 24/650)" value={l.descripcion} onChange={(e) => cambiar(l.clave, { descripcion: e.target.value })} onBlur={() => reconocer(l)} aria-label={`Descripción línea ${i + 1}`} />
                  <label className="col-span-4 sm:col-span-2 text-[11px] text-slate-500">Cantidad<input className={campo} inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })} /></label>
                  <label className="col-span-4 sm:col-span-2 text-[11px] text-slate-500">Unidades c/u<input className={campo} inputMode="numeric" value={l.unidades} onChange={(e) => cambiar(l.clave, { unidades: e.target.value })} title="1 caja = 24 unidades" /></label>
                  <label className="col-span-4 sm:col-span-3 text-[11px] text-slate-500">Costo c/u (RD$)<input className={campo} inputMode="decimal" value={l.costo} onChange={(e) => cambiar(l.clave, { costo: e.target.value })} /></label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={`${campo} flex-1 min-w-[200px]`} value={l.productoId} onChange={(e) => cambiar(l.clave, { productoId: e.target.value, auto: false, nuevoNombre: e.target.value === "nuevo" && !l.nuevoNombre ? l.descripcion : l.nuevoNombre })} aria-label={`Producto línea ${i + 1}`} data-testid={`producto-linea-${i}`}>
                    <option value="">¿A qué producto va? (sin inventario)</option>
                    <option value="nuevo">➕ Crear producto nuevo</option>
                    {productos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                  </select>
                  {lineas.length > 1 && <button type="button" aria-label="Quitar línea" className="w-10 h-10 grid place-items-center rounded-lg border border-slate-300 text-red-700" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}><Trash2 className="w-4 h-4" /></button>}
                </div>
                {l.productoId === "nuevo" && (
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input className={campo} placeholder="Nombre para vender" value={l.nuevoNombre} onChange={(e) => cambiar(l.clave, { nuevoNombre: e.target.value })} />
                    <input className={campo} inputMode="decimal" placeholder={costoUnidad ? `Precio de venta (sugerido RD$${Math.ceil(costoUnidad * 1.25)})` : "Precio de venta"} value={l.nuevoPrecio} onChange={(e) => cambiar(l.clave, { nuevoPrecio: e.target.value })} />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {num(l.costo) > 0 && <>Total línea {dinero(num(l.cantidad) * num(l.costo))} · cada unidad te cuesta {dinero(costoUnidad)}</>}
                  {p && <> · entran {Math.round(num(l.cantidad) * (Math.round(num(l.unidades)) || 1))} a «{p.nombre}»{costoAntes != null ? ` (costaba ${dinero(costoAntes)})` : ""}</>}
                  {l.auto && <span className="text-[#0F5C39] font-semibold"> · reconocido de facturas anteriores</span>}
                </p>
              </div>
            );
          })}
        </div>
        <button type="button" className={`${boton} border border-slate-300`} onClick={() => setLineas((ls) => [...ls, lineaVacia()])} data-testid="agregar-linea"><Plus className="w-4 h-4" />Agregar línea</button>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
        <h2 className="font-bold text-slate-900">Totales y pago</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="text-xs font-semibold text-slate-600">ITBIS<input className={campo} inputMode="decimal" value={cab.itbis} onChange={(e) => setCab({ ...cab, itbis: e.target.value })} placeholder="0" data-testid="itbis" /></label>
          <label className="text-xs font-semibold text-slate-600">Descuento<input className={campo} inputMode="decimal" value={cab.descuento} onChange={(e) => setCab({ ...cab, descuento: e.target.value })} placeholder="0" /></label>
          <label className="text-xs font-semibold text-slate-600 col-span-2">Total que dice la factura (para comparar)<input className={campo} inputMode="decimal" value={cab.totalFactura} onChange={(e) => setCab({ ...cab, totalFactura: e.target.value })} /></label>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-[15px] flex flex-wrap gap-x-6 gap-y-1">
          <span>Subtotal: <b>{dinero(subtotal)}</b></span><span>Total: <b data-testid="total-compra">{dinero(total)}</b></span>
          {descuadre && <span className="text-red-700 font-semibold flex items-center gap-1"><AlertTriangle className="w-4 h-4" />No cuadra con la factura ({dinero(num(cab.totalFactura))}). Revisa las líneas.</span>}
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cómo se pagó">
          {FORMAS.map(([id, t]) => (
            <button key={id} type="button" role="radio" aria-checked={cab.formaPago === id} onClick={() => setCab({ ...cab, formaPago: id })} data-testid={`pago-${id}`}
              className={`min-h-[44px] px-4 rounded-xl border text-sm font-semibold ${cab.formaPago === id ? "border-[#17804F] bg-[#E7F2EC] text-[#0F5C39]" : "border-slate-300 text-slate-700"}`}>{t}</button>
          ))}
        </div>
        {cab.formaPago === "credito" && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Vence{suplidor?.diasCredito ? ` (${suplidor.diasCredito} días si lo dejas vacío)` : " (30 días si lo dejas vacío)"}<input type="date" className={campo} value={cab.vence} onChange={(e) => setCab({ ...cab, vence: e.target.value })} /></label>
            <label className="text-xs font-semibold text-slate-600">Abono al recibir (opcional)<input className={campo} inputMode="decimal" value={cab.abonoInicial} onChange={(e) => setCab({ ...cab, abonoInicial: e.target.value })} /></label>
          </div>
        )}
        <input className={campo} placeholder="Nota (opcional)" value={cab.notas} onChange={(e) => setCab({ ...cab, notas: e.target.value })} />
        <button type="button" disabled={ocupado || !suplidorId || subtotal <= 0} onClick={guardar} className={`${boton} w-full min-h-[52px] bg-[#17804F] text-white text-lg`} data-testid="guardar-compra">
          {ocupado && <Loader2 className="w-5 h-5 animate-spin" />}Guardar compra y sumar al inventario
        </button>
      </section>
    </div>
  );
}

function ListaCompras({ colmadoId, porPagar, onAbrir, onNueva }: { colmadoId: number; porPagar: boolean; onAbrir: (id: number) => void; onNueva: () => void }) {
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const { data, isLoading } = useQuery<{ compras: CompraFila[]; totalMes: number; debo: number }>({
    queryKey: ["compras", colmadoId, porPagar ? "pagar" : mes],
    queryFn: () => pedir(`/api/colmados/${colmadoId}/compras?${porPagar ? "porPagar=1" : `mes=${mes}`}`),
  });
  const vencida = (c: CompraFila) => c.saldo > 0 && c.vence && c.vence < hoy();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {!porPagar && <input type="month" className={`${campo} w-auto`} value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes" />}
        <span className="text-[15px] text-slate-700">{porPagar ? <>Le debes a suplidores: <b>{dinero(data?.debo ?? 0)}</b></> : <>Compraste en el mes: <b>{dinero(data?.totalMes ?? 0)}</b></>}</span>
      </div>
      <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
        {isLoading ? <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div> : !data?.compras.length ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-slate-600">{porPagar ? "No le debes nada a ningún suplidor. 👏" : "No hay compras en este mes."}</p>
            {!porPagar && <button type="button" className={`${boton} bg-[#17804F] text-white`} onClick={onNueva}>Registrar una compra</button>}
          </div>
        ) : data.compras.map((c) => (
          <button key={c.id} type="button" onClick={() => onAbrir(c.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50" data-testid={`compra-${c.id}`}>
            <div className="flex-1 min-w-0">
              <p className={`font-semibold truncate ${c.estado === "anulada" ? "text-slate-400 line-through" : "text-slate-900"}`}>{c.suplidor}{c.factura ? ` · ${c.factura}` : ""}</p>
              <p className="text-xs text-slate-500">{c.fecha} · {FORMAS.find((f) => f[0] === c.formaPago)?.[1]}{c.saldo > 0 ? ` · debe ${dinero(c.saldo)}${c.vence ? `, vence ${c.vence}` : ""}` : ""}</p>
            </div>
            {vencida(c) && <span className="text-xs font-semibold text-red-700 bg-red-50 rounded-full px-2 py-1">Vencida</span>}
            <span className="font-bold text-slate-900">{dinero(c.total)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Suplidores({ colmadoId }: { colmadoId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useSuplidores(colmadoId);
  const [nuevo, setNuevo] = useState(false);
  return (
    <div className="space-y-3">
      {nuevo ? <FormSuplidor colmadoId={colmadoId} onCancelar={() => setNuevo(false)} onListo={() => { setNuevo(false); qc.invalidateQueries({ queryKey: ["suplidores", colmadoId] }); }} />
        : <button type="button" className={`${boton} bg-[#17804F] text-white`} onClick={() => setNuevo(true)} data-testid="agregar-suplidor"><Plus className="w-4 h-4" />Nuevo suplidor</button>}
      <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
        {isLoading ? <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div> : !data?.suplidores.length ? <p className="p-4 text-slate-500">Todavía no tienes suplidores.</p> : data.suplidores.map((s) => (
          <div key={s.id} className="px-4 py-3 flex items-center gap-3" data-testid={`suplidor-${s.id}`}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 truncate">{s.nombre}</p>
              <p className="text-xs text-slate-500">{[s.rnc && `RNC ${s.rnc}`, s.vendedor, s.telefono, s.diasCredito != null && `${s.diasCredito} días de crédito`].filter(Boolean).join(" · ") || "Sin datos"}</p>
            </div>
            {s.debo > 0 && <span className={`font-semibold ${s.vencido > 0 ? "text-red-700" : "text-slate-900"}`}>Le debes {dinero(s.debo)}</span>}
            {s.telefono && <a className="text-sm font-semibold text-[#128C7E]" href={`https://wa.me/${s.telefono.replace(/\D/g, "").replace(/^(\d{10})$/, "1$1")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetalleCompra({ colmadoId, id, onCerrar }: { colmadoId: number; id: number; onCerrar: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const clave = ["compra", colmadoId, id];
  const { data } = useQuery<any>({ queryKey: clave, queryFn: () => pedir(`/api/colmados/${colmadoId}/compras/${id}`) });
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [ocupado, setOcupado] = useState(false);
  const recargar = () => { qc.invalidateQueries({ queryKey: clave }); for (const k of ["compras", "suplidores", "por-pagar", "menu-productos", "inventario-alertas"]) qc.invalidateQueries({ queryKey: [k] }); };
  const c = data?.compra;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={`Compra ${id}`} className="w-full sm:max-w-lg h-full bg-white overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-lg text-slate-900">Compra #{id}</h2>
          <button type="button" aria-label="Cerrar" className="w-10 h-10 grid place-items-center" onClick={onCerrar}><X className="w-5 h-5" /></button>
        </div>
        {!c ? <div className="p-4"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <div className="p-4 space-y-4">
            <div>
              <p className="font-semibold text-slate-900">{data.suplidor?.nombre}</p>
              <p className="text-sm text-slate-500">{c.fecha}{c.factura ? ` · factura ${c.factura}` : ""}{c.ncf ? ` · NCF ${c.ncf}` : ""} · registró {c.usuario}</p>
              {c.estado === "anulada" && <p className="mt-1 text-sm font-semibold text-red-700">Anulada</p>}
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {data.lineas.map((l: any) => (
                <li key={l.id} className="py-2 flex justify-between gap-3">
                  <div className="min-w-0"><p className="text-slate-900">{l.cantidad} × {l.descripcion}</p><p className="text-xs text-slate-500">{l.producto ? `→ ${l.producto} (+${l.unidadesSumadas})` : "Sin producto (no sumó inventario)"}</p></div>
                  <span className="font-semibold whitespace-nowrap">{dinero(l.total)}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-0.5">
              <p className="flex justify-between"><span>Subtotal</span><span>{dinero(Number(c.subtotal))}</span></p>
              {Number(c.itbis) > 0 && <p className="flex justify-between"><span>ITBIS</span><span>{dinero(Number(c.itbis))}</span></p>}
              {Number(c.descuento) > 0 && <p className="flex justify-between"><span>Descuento</span><span>−{dinero(Number(c.descuento))}</span></p>}
              <p className="flex justify-between font-bold text-base"><span>Total</span><span>{dinero(c.total)}</span></p>
              <p className="flex justify-between"><span>Pago</span><span>{FORMAS.find((f) => f[0] === c.formaPago)?.[1]}</span></p>
              {c.formaPago === "credito" && <p className="flex justify-between font-semibold"><span>Debes{c.vence ? ` (vence ${c.vence})` : ""}</span><span data-testid="saldo-compra">{dinero(c.saldo)}</span></p>}
            </div>
            {c.estado === "registrada" && c.saldo > 0 && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <p className="font-semibold text-slate-900">Registrar pago al suplidor</p>
                <div className="flex gap-2">
                  <input className={campo} inputMode="decimal" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} data-testid="monto-pago-suplidor" />
                  <select className={campo} value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo pagó">
                    <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="cheque">Cheque</option><option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="text-sm text-[#0F5C39] font-semibold" onClick={() => setMonto(String(c.saldo))}>Pagar todo</button>
                  <button type="button" disabled={ocupado || !(Number(monto) > 0)} className={`${boton} ml-auto bg-[#17804F] text-white`} data-testid="guardar-pago-suplidor"
                    onClick={async () => { setOcupado(true); try { await pedir(`/api/colmados/${colmadoId}/compras/${id}/pagos`, "POST", { monto: Number(monto), metodo }); toast({ title: "Pago registrado" }); setMonto(""); recargar(); } catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); } setOcupado(false); }}>Guardar pago</button>
                </div>
              </div>
            )}
            {data.pagos.length > 0 && (
              <div className="text-sm"><p className="font-semibold text-slate-900 mb-1">Pagos</p>
                {data.pagos.map((p: any) => <p key={p.id} className="flex justify-between text-slate-600"><span>{new Date(p.fecha).toLocaleDateString("es-DO")} · {p.metodo}{p.nota ? ` · ${p.nota}` : ""}</span><span>{dinero(p.monto)}</span></p>)}
              </div>
            )}
            {c.estado === "registrada" && (
              <button type="button" disabled={ocupado} className="text-sm font-semibold text-red-700" data-testid="anular-compra"
                onClick={async () => { if (!window.confirm("¿Anular esta compra? Se saca del inventario lo que entró con ella.")) return; setOcupado(true); try { await pedir(`/api/colmados/${colmadoId}/compras/${id}/anular`, "POST"); toast({ title: "Compra anulada" }); recargar(); } catch (e: any) { toast({ title: "No se pudo anular", description: e.message, variant: "destructive" }); } setOcupado(false); }}>Anular compra</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
