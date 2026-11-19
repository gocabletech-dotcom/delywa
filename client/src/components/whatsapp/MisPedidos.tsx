import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { IOS, IconoIOS } from "./ios";

// «Mis pedidos» del chat del cliente: el pedido de ahora con sus pasos y los anteriores (hechos desde
// este mismo teléfono). Se ve dentro del mismo iPhone, con «Volver al chat».

type Producto = { nombre: string; cantidad: number; unidad: string | null; monto: number | null };
export type PedidoCliente = {
  id: number; estado: string; total: string | null; metodoPago: string | null; tipoEntrega: string | null;
  fecha: string; productos: Producto[]; pagoAprobado: boolean; motivoRetorno: string | null; actual: boolean;
};

const ESPERANDO = ["pendiente_confirmacion", "esperando_pago", "esperando_confirmacion_pago", "esperando_comprobante", "esperando_confirmacion_sustituciones"];

/** Los pasos del pedido, como en el seguimiento de antes. */
function pasosDe(p: PedidoCliente) {
  const recoger = p.tipoEntrega === "pickup";
  const pasos = [
    { titulo: "Pedido enviado", detalle: "El colmado lo está revisando", estados: ESPERANDO },
    { titulo: "Confirmado", detalle: "El colmado aceptó tu pedido", estados: ["pendiente"] },
    { titulo: "Preparando", detalle: "Están preparando tu pedido", estados: ["en_preparacion", "listo"] },
    recoger
      ? { titulo: "Listo para recoger", detalle: "Pasa por el colmado", estados: ["listo_para_recoger"] }
      : { titulo: "En camino", detalle: "El delivery va para allá", estados: ["en_camino", "llegando"] },
    { titulo: "Entregado", detalle: "¡Gracias por tu compra!", estados: ["entregado"] },
  ];
  const actual = pasos.findIndex((x) => x.estados.includes(p.estado));
  return { pasos, actual: actual < 0 ? (p.estado === "listo" ? 2 : 0) : actual };
}

const ETIQUETA: Record<string, { texto: string; color: string; fondo: string }> = {
  entregado: { texto: "Entregado", color: "#1F7A3D", fondo: "#E3F4E8" },
  cancelado: { texto: "Cancelado", color: "#B3261E", fondo: "#FCE8E6" },
  retorno: { texto: "No se pudo entregar", color: "#B3261E", fondo: "#FCE8E6" },
  en_camino: { texto: "En camino", color: "#0B57D0", fondo: "#E5EDFF" },
  llegando: { texto: "Llegando", color: "#0B57D0", fondo: "#E5EDFF" },
};
const etiqueta = (estado: string) => ETIQUETA[estado] ?? (ESPERANDO.includes(estado)
  ? { texto: "Por confirmar", color: "#8A4A07", fondo: "#FFF1DD" }
  : { texto: "En proceso", color: "#0F5C39", fondo: "#E7F2EC" });

const dinero = (v: string | null) => (v && Number(v) > 0 ? `RD$${Number(v).toLocaleString("es-DO")}` : "");
const fechaCorta = (f: string) => new Date(f).toLocaleString("es-DO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const textoProducto = (x: Producto) => (x.monto ? `RD$${x.monto} de ${x.nombre}` : x.unidad ? `${x.cantidad} ${x.unidad} de ${x.nombre}` : `${x.cantidad} ${x.nombre}`);
const PAGO: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia" };

export default function MisPedidos({ sessionId, abrir, alVolver }: { sessionId: string; abrir?: number | null; alVolver: () => void }) {
  const [lista, setLista] = useState<PedidoCliente[] | null>(null);
  const [error, setError] = useState(false);
  const [elegido, setElegido] = useState<number | null>(abrir ?? null);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const r = await fetch(`/api/chat-colmado/sesion/${sessionId}/pedidos`).catch(() => null);
      if (!vivo) return;
      if (!r || !r.ok) { setError(true); return; }
      const d = await r.json();
      setError(false);
      setLista(d.pedidos ?? []);
    };
    void cargar();
    const t = setInterval(cargar, 15_000); // los pasos se actualizan solos
    return () => { vivo = false; clearInterval(t); };
  }, [sessionId]);

  const detalle = lista?.find((p) => p.id === elegido) ?? null;
  const volver = () => (detalle ? setElegido(null) : alVolver());

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F2F2F7]" data-testid="mis-pedidos">
      <header className="shrink-0 flex items-center gap-1 px-2 h-[54px] bg-[#F6F6F6]/95 backdrop-blur border-b border-[#D1D1D6]">
        <button type="button" onClick={volver} className="flex items-center gap-0.5 h-11 px-1 text-[17px]" style={{ color: IOS.azul }} data-testid="button-volver-mis-pedidos">
          {IconoIOS.atras()} {detalle ? "Mis pedidos" : "Chat"}
        </button>
        <h2 className="flex-1 text-center text-[17px] font-semibold text-black pr-16">{detalle ? `Pedido #${detalle.id}` : "Mis pedidos"}</h2>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto p-3">
        {!lista && !error && <div className="flex justify-center py-12"><Loader2 className="animate-spin" color={IOS.gris} /></div>}
        {error && !lista && <p className="text-center text-[15px] text-[#6B6B70] py-10">No pudimos cargar tus pedidos. Revisa tu internet.</p>}

        {lista && !detalle && (
          lista.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-[17px] font-semibold text-black">Todavía no tienes pedidos</p>
              <p className="mt-1 text-[15px] text-[#6B6B70]">Vuelve al chat y escribe lo que necesitas.</p>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none rounded-xl bg-white overflow-hidden divide-y divide-[#E5E5EA]">
              {lista.map((p) => {
                const e = etiqueta(p.estado);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => setElegido(p.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 min-h-[64px] active:bg-[#F2F2F7]" data-testid={`mi-pedido-${p.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-black flex items-center gap-2">
                          Pedido #{p.id}
                          {p.actual && <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: IOS.verdeOscuro }}>Ahora</span>}
                        </p>
                        <p className="text-[13.5px] text-[#6B6B70] truncate">{p.productos.map(textoProducto).join(", ")}</p>
                        <p className="text-[12.5px] text-[#8E8E93]">{fechaCorta(p.fecha)}{dinero(p.total) ? ` · ${dinero(p.total)}` : ""}</p>
                      </div>
                      <span className="shrink-0 text-[12px] font-semibold rounded-full px-2.5 py-1" style={{ color: e.color, background: e.fondo }}>{e.texto}</span>
                      <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="#C7C7CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {detalle && <Detalle p={detalle} />}
      </main>

      <div className="shrink-0 bg-[#F6F6F6] border-t border-[#D1D1D6] px-3 pt-2 pb-3 md:pb-8">
        <button type="button" onClick={alVolver} className="w-full min-h-[46px] rounded-xl text-white text-[16px] font-semibold" style={{ background: IOS.verdeOscuro }} data-testid="button-volver-al-chat">
          Volver al chat
        </button>
      </div>
    </div>
  );
}

function Detalle({ p }: { p: PedidoCliente }) {
  const terminado = p.estado === "cancelado" || p.estado === "retorno";
  const { pasos, actual } = pasosDe(p);
  return (
    <div className="flex flex-col gap-3" data-testid={`detalle-pedido-${p.id}`}>
      <section className="rounded-xl bg-white p-4">
        {terminado ? (
          <div className="text-center py-2">
            <p className="text-[18px] font-semibold text-[#B3261E]">{p.estado === "cancelado" ? "Pedido cancelado" : "No se pudo entregar"}</p>
            {p.motivoRetorno && <p className="mt-1 text-[14px] text-[#6B6B70]">{p.motivoRetorno}</p>}
            <p className="mt-2 text-[14px] text-[#6B6B70]">Escríbele al colmado en el chat si tienes dudas.</p>
          </div>
        ) : (
          <ol className="m-0 p-0 list-none" aria-label="Cómo va tu pedido">
            {pasos.map((paso, i) => {
              const hecho = i < actual || (i === actual && p.estado === "entregado");
              const ahora = i === actual && p.estado !== "entregado";
              const color = hecho || ahora ? IOS.verdeOscuro : "#C7C7CC";
              return (
                <li key={paso.titulo} className="flex gap-3" data-testid={`paso-${i}`} aria-current={ahora ? "step" : undefined}>
                  <div className="flex flex-col items-center">
                    <span className="w-7 h-7 rounded-full grid place-items-center shrink-0" style={{ background: hecho ? color : "#fff", border: `2px solid ${color}` }}>
                      {hecho
                        ? <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        : ahora ? <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: color }} /> : null}
                    </span>
                    {i < pasos.length - 1 && <span className="w-[2px] flex-1 min-h-[22px]" style={{ background: i < actual ? IOS.verdeOscuro : "#E5E5EA" }} />}
                  </div>
                  <div className="pb-4 -mt-0.5">
                    <p className={`text-[16px] ${ahora ? "font-bold text-black" : hecho ? "font-semibold text-black" : "text-[#8E8E93]"}`}>{paso.titulo}</p>
                    {ahora && <p className="text-[13.5px] text-[#6B6B70]">{paso.detalle}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {p.metodoPago === "transferencia" && !p.pagoAprobado && !terminado && p.estado !== "entregado" && (
          <p className="mt-1 rounded-lg bg-[#FFF1DD] px-3 py-2 text-[13.5px] text-[#7A4306]">🏦 El colmado todavía está revisando tu transferencia.</p>
        )}
      </section>

      <section className="rounded-xl bg-white p-4">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-[#8E8E93]">Tu pedido</p>
        <ul className="mt-2 mb-0 p-0 list-none flex flex-col gap-1.5">
          {p.productos.map((x, i) => <li key={i} className="text-[15.5px] text-black">• {textoProducto(x)}</li>)}
        </ul>
        <div className="mt-3 pt-3 border-t border-[#E5E5EA] flex flex-col gap-1 text-[14.5px]">
          {dinero(p.total) && <p className="flex justify-between"><span className="text-[#6B6B70]">Total</span><b>{dinero(p.total)}</b></p>}
          {p.metodoPago && <p className="flex justify-between"><span className="text-[#6B6B70]">Pago</span><span>{PAGO[p.metodoPago] ?? p.metodoPago}{p.metodoPago === "transferencia" && p.pagoAprobado ? " · aprobado ✓" : ""}</span></p>}
          <p className="flex justify-between"><span className="text-[#6B6B70]">Fecha</span><span>{fechaCorta(p.fecha)}</span></p>
          <p className="flex justify-between"><span className="text-[#6B6B70]">Entrega</span><span>{p.tipoEntrega === "pickup" ? "Lo recoges en el colmado" : "Delivery"}</span></p>
        </div>
      </section>
    </div>
  );
}
