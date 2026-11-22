import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Banknote, CheckCircle2, CreditCard, Landmark, Loader2, Minus, Plus, Printer, Search, ShoppingCart, Trash2, X } from "lucide-react";
import NegocioLayout from "@/components/negocio/NegocioLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { imprimirTicket } from "@/lib/ticket";

// Venta de mostrador: cobrar lo que se vende en el colmado. Toca un producto para agregarlo,
// cambia la cantidad, elige cómo pagó y «Cobrar». Queda en Ventas y descuenta el inventario.

type Producto = { id: number; nombre: string; precio: string; categoria: string; disponible: boolean; inventario: number | null; inventarioMinimo?: number | null; emoji?: string | null };
type Linea = { clave: string; menuProductoId?: number; nombre: string; precio: number; cantidad: number; maximo?: number | null };
type Metodo = "efectivo" | "tarjeta" | "transferencia" | "fiado";
type Resultado = { pedidoId: number; total: number; recibido: number | null; devuelta: number; lineas: Array<{ nombre: string; cantidad: number; monto: number }>; avisos: string[]; fecha: string };
type Hoy = { ventas: number; total: number; porMetodo: Record<string, number> };

const agotado = (p: Producto) => !p.disponible || (p.inventario != null && p.inventario <= 0);
const dinero = (n: number, m: string) => `${m}${n.toLocaleString("es-DO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const BILLETES = [100, 200, 500, 1000, 2000];

export default function MostradorPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAuthenticated, isLoading: cargandoSesion } = useAuth();
  useEffect(() => { if (!cargandoSesion && !isAuthenticated) window.location.href = "/login"; }, [cargandoSesion, isAuthenticated]);
  const { data: rol } = useQuery({ queryKey: ["user-role"], queryFn: async () => { const r = await fetch("/api/user/role"); return r.ok ? r.json() : null; }, enabled: isAuthenticated });
  const colmadoId = rol?.colmadoId as number | undefined;
  const { data: negocio } = useQuery<{ nombre: string; direccion?: string; whatsappNumero?: string; telefonoAlternativo?: string | null; simboloMoneda?: string }>({
    queryKey: ["colmado", colmadoId], queryFn: async () => (await fetch(`/api/colmados/${colmadoId}`)).json(), enabled: !!colmadoId,
  });
  const m = negocio?.simboloMoneda || "RD$";
  const { data: productos = [], isLoading } = useQuery<Producto[]>({
    queryKey: ["menu-productos", colmadoId],
    queryFn: async () => { const r = await fetch(`/api/colmados/${colmadoId}/menu`); return r.ok ? r.json() : []; },
    enabled: !!colmadoId,
  });
  const { data: hoy } = useQuery<Hoy>({
    queryKey: ["mostrador-hoy", colmadoId],
    queryFn: async () => { const r = await fetch(`/api/colmados/${colmadoId}/mostrador/hoy`); return r.ok ? r.json() : { ventas: 0, total: 0, porMetodo: {} }; },
    enabled: !!colmadoId,
  });

  const [buscar, setBuscar] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [recibido, setRecibido] = useState("");
  const [cliente, setCliente] = useState<{ id?: number; nombre: string; telefono?: string } | null>(null);
  const [suelto, setSuelto] = useState({ nombre: "", precio: "" });
  const [verCarrito, setVerCarrito] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [listo, setListo] = useState<Resultado | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const categorias = useMemo(() => ["Todas", ...Array.from(new Set(productos.map((p) => p.categoria)))], [productos]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return productos.filter((p) => (categoria === "Todas" || p.categoria === categoria)
      && (!q || p.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q)));
  }, [productos, buscar, categoria]);
  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const devuelta = metodo === "efectivo" && recibido ? Number(recibido) - total : 0;

  const agregar = (p: Producto) => {
    if (agotado(p)) return;
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.menuProductoId === p.id);
      if (i >= 0) {
        const l = ls[i];
        if (l.maximo != null && l.cantidad + 1 > l.maximo) { toast({ title: `Solo quedan ${l.maximo} de ${p.nombre}` }); return ls; }
        return ls.map((x, j) => (j === i ? { ...x, cantidad: x.cantidad + 1 } : x));
      }
      return [...ls, { clave: `m${p.id}`, menuProductoId: p.id, nombre: p.nombre, precio: Number(p.precio) || 0, cantidad: 1, maximo: p.inventario }];
    });
  };
  const cambiar = (clave: string, delta: number) => setLineas((ls) => ls.flatMap((l) => {
    if (l.clave !== clave) return [l];
    const n = Math.round((l.cantidad + delta) * 100) / 100;
    if (n <= 0) return [];
    if (l.maximo != null && n > l.maximo) return [l];
    return [{ ...l, cantidad: n }];
  }));
  const ponerCantidad = (clave: string, valor: string) => setLineas((ls) => ls.map((l) => {
    if (l.clave !== clave) return l;
    const n = Number(valor.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? { ...l, cantidad: l.maximo != null ? Math.min(n, l.maximo) : n } : l;
  }));
  const agregarSuelto = () => {
    const precio = Number(suelto.precio.replace(",", "."));
    if (!suelto.nombre.trim() || !Number.isFinite(precio) || precio < 0) return;
    setLineas((ls) => [...ls, { clave: `s${Date.now()}`, nombre: suelto.nombre.trim(), precio, cantidad: 1 }]);
    setSuelto({ nombre: "", precio: "" });
  };
  const limpiar = () => { setLineas([]); setRecibido(""); setMetodo("efectivo"); setCliente(null); setVerCarrito(false); buscador.current?.focus(); };

  const cobrar = async () => {
    if (!colmadoId || !lineas.length) return;
    if (metodo === "efectivo" && recibido && Number(recibido) < total) { toast({ title: "Lo recibido es menos que el total", variant: "destructive" }); return; }
    if (metodo === "fiado" && !cliente?.id) { toast({ title: "Elige el cliente al que se le fía", variant: "destructive" }); return; }
    setCobrando(true);
    const r = await fetch(`/api/colmados/${colmadoId}/mostrador`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metodoPago: metodo, recibido: metodo === "efectivo" && recibido ? Number(recibido) : null,
        clienteId: cliente?.id, clienteNombre: cliente?.nombre, clienteTelefono: cliente?.telefono,
        items: lineas.map((l) => (l.menuProductoId ? { menuProductoId: l.menuProductoId, cantidad: l.cantidad } : { nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
      }),
    });
    const j = await r.json().catch(() => ({}));
    setCobrando(false);
    if (!r.ok) { toast({ title: "No se pudo cobrar", description: j.error, variant: "destructive" }); return; }
    setListo(j);
    for (const a of j.avisos ?? []) toast({ title: a });
    qc.invalidateQueries({ queryKey: ["menu-productos", colmadoId] });
    qc.invalidateQueries({ queryKey: ["mostrador-hoy", colmadoId] });
    qc.invalidateQueries({ queryKey: ["ventas-hoy"] });
    qc.invalidateQueries({ queryKey: ["fiado", colmadoId] });
  };
  const imprimir = (r: Resultado) => imprimirTicket({
    negocio: { nombre: negocio?.nombre || "Mi negocio", direccion: negocio?.direccion, telefono: negocio?.telefonoAlternativo || negocio?.whatsappNumero },
    titulo: `Venta #${r.pedidoId}`, fecha: new Date(r.fecha), cliente: cliente ? { nombre: cliente.nombre } : undefined,
    lineas: r.lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.monto })), total: r.total,
    pago: { metodo, recibido: r.recibido, devuelta: r.devuelta || null }, moneda: m,
  });

  const carrito = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="font-bold text-slate-900 flex items-center gap-2"><ShoppingCart className="w-5 h-5" />Venta ({unidades})</h2>
        {lineas.length > 0 && <button type="button" className="text-sm text-red-700 font-medium" onClick={limpiar} data-testid="vaciar">Vaciar</button>}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {!lineas.length && <p className="p-4 text-sm text-slate-500">Toca un producto para agregarlo. Si no está en la lista, agrégalo abajo como producto suelto.</p>}
        {lineas.map((l) => (
          <div key={l.clave} className="px-4 py-2.5 flex items-center gap-2" data-testid={`linea-${l.clave}`}>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium text-slate-900 truncate">{l.nombre}</p>
              <p className="text-xs text-slate-500">{dinero(l.precio, m)} c/u · {dinero(l.precio * l.cantidad, m)}</p>
            </div>
            <button type="button" aria-label={`Quitar uno de ${l.nombre}`} className="w-9 h-9 grid place-items-center rounded-lg border border-slate-300" onClick={() => cambiar(l.clave, -1)}><Minus className="w-4 h-4" /></button>
            <input aria-label={`Cantidad de ${l.nombre}`} inputMode="decimal" className="w-12 h-9 text-center rounded-lg border border-slate-300" value={l.cantidad} onChange={(e) => ponerCantidad(l.clave, e.target.value)} />
            <button type="button" aria-label={`Agregar uno de ${l.nombre}`} className="w-9 h-9 grid place-items-center rounded-lg border border-slate-300" onClick={() => cambiar(l.clave, 1)}><Plus className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 p-4 space-y-3">
        <div className="flex gap-2">
          <input className="flex-1 min-w-0 h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Producto suelto" value={suelto.nombre} onChange={(e) => setSuelto({ ...suelto, nombre: e.target.value })} data-testid="suelto-nombre" />
          <input className="w-24 h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Precio" inputMode="decimal" value={suelto.precio} onChange={(e) => setSuelto({ ...suelto, precio: e.target.value })} onKeyDown={(e) => e.key === "Enter" && agregarSuelto()} data-testid="suelto-precio" />
          <button type="button" className="h-10 px-3 rounded-lg border border-slate-300 font-semibold" onClick={agregarSuelto} aria-label="Agregar producto suelto" data-testid="suelto-agregar"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Cómo pagó">
          {([["efectivo", "Efectivo", Banknote], ["tarjeta", "Tarjeta", CreditCard], ["transferencia", "Transf.", Landmark], ["fiado", "Fiado", ShoppingCart]] as const).map(([id, texto, Icono]) => (
            <button key={id} type="button" role="radio" aria-checked={metodo === id} onClick={() => setMetodo(id)} data-testid={`metodo-${id}`}
              className={`min-h-[52px] rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-0.5 ${metodo === id ? "border-[#17804F] bg-[#E7F2EC] text-[#0F5C39]" : "border-slate-300 text-slate-700"}`}>
              <Icono className="w-4 h-4" />{texto}
            </button>
          ))}
        </div>
        {metodo === "efectivo" && (
          <div className="space-y-2">
            <input className="w-full h-11 rounded-lg border border-slate-300 px-3 text-[15px]" inputMode="decimal" placeholder="¿Con cuánto paga? (opcional)" value={recibido} onChange={(e) => setRecibido(e.target.value.replace(/[^\d.]/g, ""))} data-testid="recibido" />
            <div className="flex flex-wrap gap-1.5">
              {BILLETES.filter((b) => b >= total).slice(0, 4).map((b) => (
                <button key={b} type="button" className="px-3 h-8 rounded-lg bg-slate-100 text-sm font-medium" onClick={() => setRecibido(String(b))}>{dinero(b, m)}</button>
              ))}
            </div>
            {devuelta > 0 && <p className="text-lg font-bold text-[#0F5C39]" data-testid="devuelta">Devuelta: {dinero(devuelta, m)}</p>}
          </div>
        )}
        {metodo === "fiado" && colmadoId && <ElegirCliente colmadoId={colmadoId} cliente={cliente} onElegir={setCliente} />}
        <button type="button" disabled={!lineas.length || cobrando} onClick={cobrar} data-testid="cobrar"
          className="w-full min-h-[56px] rounded-xl bg-[#17804F] hover:bg-[#0F5C39] disabled:opacity-50 text-white text-lg font-bold flex items-center justify-center gap-2">
          {cobrando ? <Loader2 className="w-5 h-5 animate-spin" /> : null}Cobrar {dinero(total, m)}
        </button>
      </div>
    </div>
  );

  return (
    <NegocioLayout title="Venta de mostrador" activeNav="mostrador">
      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
        <section className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="p-3 sm:p-4 space-y-3 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>Hoy en mostrador: <b className="text-slate-900">{hoy?.ventas ?? 0}</b> ventas · <b className="text-slate-900">{dinero(hoy?.total ?? 0, m)}</b></span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={buscador} autoFocus className="w-full h-11 rounded-xl border border-slate-300 pl-9 pr-3 text-[15px]" placeholder="Buscar producto…" value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && visibles.length === 1) { agregar(visibles[0]); setBuscar(""); } }} data-testid="buscar-producto" />
            </div>
            {categorias.length > 2 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {categorias.map((cat) => (
                  <button key={cat} type="button" onClick={() => setCategoria(cat)} className={`shrink-0 px-3 h-8 rounded-full text-sm font-medium border ${categoria === cat ? "bg-[#17804F] border-[#17804F] text-white" : "border-slate-300 text-slate-700 bg-white"}`}>{cat}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-28 lg:pb-4">
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-[#17804F]" /> : !productos.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-2">
                <p className="font-semibold text-slate-900">Todavía no tienes productos con precio.</p>
                <p className="text-sm text-slate-600">Agrégalos en Productos e inventario. Mientras tanto puedes vender con «Producto suelto».</p>
                <Link href="/negocio/menu" className="inline-flex min-h-[44px] items-center px-4 rounded-xl bg-[#17804F] text-white font-semibold">Ir a Productos</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {visibles.map((p) => {
                  const sinStock = agotado(p);
                  const bajo = !sinStock && p.inventario != null && p.inventarioMinimo != null && p.inventario <= p.inventarioMinimo;
                  const enVenta = lineas.find((l) => l.menuProductoId === p.id)?.cantidad;
                  return (
                    <button key={p.id} type="button" disabled={sinStock} onClick={() => agregar(p)} data-testid={`producto-${p.id}`}
                      className={`relative text-left rounded-xl border p-3 min-h-[88px] bg-white ${sinStock ? "opacity-50 border-slate-200" : "border-slate-200 hover:border-[#17804F] active:bg-[#E7F2EC]"}`}>
                      {enVenta ? <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-[#17804F] text-white text-xs font-bold grid place-items-center">{enVenta}</span> : null}
                      <p className="text-[15px] font-semibold text-slate-900 leading-tight pr-6">{p.emoji ? `${p.emoji} ` : ""}{p.nombre}</p>
                      <p className="mt-1 text-[#0F5C39] font-bold">{dinero(Number(p.precio) || 0, m)}</p>
                      <p className={`text-xs ${sinStock ? "text-red-700" : bajo ? "text-amber-700" : "text-slate-500"}`}>
                        {sinStock ? "Agotado" : p.inventario != null ? `Quedan ${p.inventario}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        <aside className="hidden lg:flex w-[380px] shrink-0 border-l border-slate-200 bg-white flex-col min-h-0">{carrito}</aside>
      </main>

      {/* En el celular, el carrito abajo */}
      <div className="lg:hidden fixed bottom-16 inset-x-3 z-30">
        {lineas.length > 0 && !verCarrito && (
          <button type="button" onClick={() => setVerCarrito(true)} className="w-full min-h-[56px] rounded-2xl bg-[#17804F] text-white font-bold shadow-lg flex items-center justify-between px-4" data-testid="ver-carrito">
            <span className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" />{unidades} en la venta</span><span>{dinero(total, m)}</span>
          </button>
        )}
      </div>
      {verCarrito && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setVerCarrito(false)}>
          <div className="absolute inset-x-0 bottom-0 top-16 rounded-t-2xl bg-white flex flex-col" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Cerrar" className="absolute right-3 top-2 w-10 h-10 grid place-items-center" onClick={() => setVerCarrito(false)}><X className="w-5 h-5" /></button>
            {carrito}
          </div>
        </div>
      )}

      {listo && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="venta-lista">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center space-y-3" data-testid="venta-lista">
            <CheckCircle2 className="w-12 h-12 text-[#17804F] mx-auto" />
            <h2 id="venta-lista" className="text-xl font-bold text-slate-900">Venta #{listo.pedidoId} cobrada</h2>
            <p className="text-3xl font-bold text-slate-900">{dinero(listo.total, m)}</p>
            {listo.devuelta > 0 && <p className="text-lg font-semibold text-[#0F5C39]">Devuelta: {dinero(listo.devuelta, m)}</p>}
            {metodo === "fiado" && cliente && <p className="text-sm text-slate-600">Se anotó en la cuenta de {cliente.nombre}.</p>}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button type="button" className="min-h-[48px] rounded-xl border border-slate-300 font-semibold flex items-center justify-center gap-2" onClick={() => imprimir(listo)} data-testid="imprimir-venta"><Printer className="w-4 h-4" />Imprimir</button>
              <button type="button" className="min-h-[48px] rounded-xl bg-[#17804F] text-white font-semibold" onClick={() => { setListo(null); limpiar(); }} data-testid="nueva-venta">Nueva venta</button>
            </div>
          </div>
        </div>
      )}
    </NegocioLayout>
  );
}

/** Para fiar hay que saber a quién: se busca en los clientes del fiado (o se crea uno). */
function ElegirCliente({ colmadoId, cliente, onElegir }: { colmadoId: number; cliente: { id?: number; nombre: string } | null; onElegir: (c: { id: number; nombre: string; telefono?: string } | null) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery<{ cuentas: Array<{ id: number; nombre: string; telefono: string | null; saldo: number; limite: number | null }> }>({
    queryKey: ["fiado", colmadoId, "buscar", q],
    queryFn: async () => { const r = await fetch(`/api/colmados/${colmadoId}/fiado?buscar=${encodeURIComponent(q)}`); return r.ok ? r.json() : { cuentas: [] }; },
  });
  if (cliente?.id) return (
    <div className="flex items-center justify-between rounded-lg bg-[#E7F2EC] px-3 py-2 text-sm">
      <span>Fiado a <b>{cliente.nombre}</b></span>
      <button type="button" className="text-[#0F5C39] font-semibold" onClick={() => onElegir(null)}>Cambiar</button>
    </div>
  );
  return (
    <div className="space-y-2" data-testid="elegir-cliente-fiado">
      <input className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm" placeholder="Buscar cliente del fiado…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-36 overflow-y-auto divide-y rounded-lg border border-slate-200">
        {(data?.cuentas ?? []).slice(0, 8).map((c) => (
          <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50" onClick={() => onElegir({ id: c.id, nombre: c.nombre, telefono: c.telefono ?? undefined })}>
            {c.nombre} <span className="text-slate-500">· debe RD${c.saldo.toLocaleString("es-DO")}</span>
          </button>
        ))}
        {!data?.cuentas?.length && <p className="px-3 py-2 text-sm text-slate-500">No hay clientes con ese nombre. Créalo en Fiado.</p>}
      </div>
      <Link href="/negocio/fiado" className="text-sm text-[#0F5C39] font-semibold">+ Nuevo cliente de fiado</Link>
    </div>
  );
}
