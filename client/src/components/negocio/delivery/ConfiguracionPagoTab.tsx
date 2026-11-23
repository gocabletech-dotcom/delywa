import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Calculator, CheckCircle2, ChevronDown, ChevronUp, Truck, Loader2 } from "lucide-react";
import { reducirImagen } from "@/lib/imagen";

interface Delivery {
  id: number;
  nombre: string;
  modeloPago: "salario" | "comision" | "mixto";
  salarioMonto: string;
  comisionFija: string;
  comisionPorcentaje: string;
  periodoPago: string;
  envioEsDelDelivery?: boolean;
}

interface PagoDelivery {
  id: number;
  periodoInicio: string;
  periodoFin: string;
  totalPedidos: number;
  totalVentas: string;
  modeloPago: string;
  salarioCalculado: string;
  comisionCalculada: string;
  montoTotal: string;
  estado: "pendiente" | "pagado";
  fechaPago: string | null;
  envioCalculado?: string;
  ajustesTotal?: string;
  metodoPago?: string | null;
  comprobanteUrl?: string | null;
  recibidoAt?: string | null;
  pagadoPor?: string | null;
}

function rangoSugerido(periodo: string): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  const dias = periodo === "semanal" ? 7 : periodo === "quincenal" ? 15 : periodo === "mensual" ? 30 : 7;
  const desdeDate = new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000);
  return { desde: desdeDate.toISOString().slice(0, 10), hasta };
}

function DeliveryConfigCard({ delivery }: { delivery: Delivery }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandido, setExpandido] = useState(false);
  const [form, setForm] = useState({
    modeloPago: delivery.modeloPago,
    salarioMonto: delivery.salarioMonto,
    comisionFija: delivery.comisionFija,
    comisionPorcentaje: delivery.comisionPorcentaje,
    periodoPago: delivery.periodoPago,
    envioEsDelDelivery: Boolean(delivery.envioEsDelDelivery),
  });
  const [rango, setRango] = useState(rangoSugerido(delivery.periodoPago));

  const guardarConfig = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deliveries/${delivery.id}/config-pago`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Error al guardar");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuración guardada", description: `Se actualizó el pago de ${delivery.nombre}` });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: () => toast({ title: "Error", description: "No se pudo guardar la configuración", variant: "destructive" }),
  });

  const { data: historial } = useQuery<PagoDelivery[]>({
    queryKey: ["pagos-delivery", delivery.id],
    queryFn: async () => {
      const res = await fetch(`/api/deliveries/${delivery.id}/pagos`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: expandido,
  });

  const calcularPago = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deliveries/${delivery.id}/pagos/calcular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          periodoInicio: new Date(rango.desde + "T00:00:00").toISOString(),
          periodoFin: new Date(rango.hasta + "T23:59:59").toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Error al calcular");
      return res.json();
    },
    onSuccess: (pago: PagoDelivery) => {
      toast({ title: "Pago calculado", description: `RD$${parseFloat(pago.montoTotal).toFixed(2)} a pagar a ${delivery.nombre}` });
      queryClient.invalidateQueries({ queryKey: ["pagos-delivery", delivery.id] });
    },
    onError: () => toast({ title: "Error", description: "No se pudo calcular el pago", variant: "destructive" }),
  });

  const marcarPagado = useMutation({
    mutationFn: async (pagoId: number) => {
      const res = await fetch(`/api/pagos-delivery/${pagoId}/marcar-pagado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Marcado como pagado" });
      queryClient.invalidateQueries({ queryKey: ["pagos-delivery", delivery.id] });
    },
  });

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Truck size={18} className="text-primary" />
            </div>
            <span className="font-semibold text-gray-800">{delivery.nombre}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpandido(!expandido)} data-testid={`toggle-config-${delivery.id}`}>
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Label className="text-xs text-gray-500">Modelo de pago</Label>
            <Select value={form.modeloPago} onValueChange={(v: any) => setForm({ ...form, modeloPago: v })}>
              <SelectTrigger data-testid={`select-modelo-pago-${delivery.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salario">Salario fijo</SelectItem>
                <SelectItem value="comision">Comisión por entrega</SelectItem>
                <SelectItem value="mixto">Mixto (salario + comisión)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Período de pago</Label>
            <Select value={form.periodoPago} onValueChange={(v) => { setForm({ ...form, periodoPago: v }); setRango(rangoSugerido(v)); }}>
              <SelectTrigger data-testid={`select-periodo-${delivery.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="quincenal">Quincenal</SelectItem>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {(form.modeloPago === "salario" || form.modeloPago === "mixto") && (
          <div className="mb-3">
            <Label className="text-xs text-gray-500">Salario por período (RD$)</Label>
            <Input
              type="number"
              value={form.salarioMonto}
              onChange={(e) => setForm({ ...form, salarioMonto: e.target.value })}
              data-testid={`input-salario-${delivery.id}`}
            />
          </div>
        )}

        {(form.modeloPago === "comision" || form.modeloPago === "mixto") && (
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <div>
              <Label className="text-xs text-gray-500">Comisión fija por entrega (RD$)</Label>
              <Input
                type="number"
                value={form.comisionFija}
                onChange={(e) => setForm({ ...form, comisionFija: e.target.value })}
                data-testid={`input-comision-fija-${delivery.id}`}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Comisión % del pedido</Label>
              <Input
                type="number"
                value={form.comisionPorcentaje}
                onChange={(e) => setForm({ ...form, comisionPorcentaje: e.target.value })}
                data-testid={`input-comision-pct-${delivery.id}`}
              />
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm text-gray-700 my-3">
          <input type="checkbox" className="mt-1" checked={form.envioEsDelDelivery} onChange={(e) => setForm({ ...form, envioEsDelDelivery: e.target.checked })} data-testid={`envio-del-delivery-${delivery.id}`} />
          <span><b>El envío es del delivery:</b> el costo de envío de cada entrega se le suma a su pago.</span>
        </label>

        <Button
          size="sm"
          className="bg-primary w-full sm:w-auto"
          onClick={() => guardarConfig.mutate()}
          disabled={guardarConfig.isPending}
          data-testid={`button-guardar-config-${delivery.id}`}
        >
          Guardar configuración
        </Button>

        {expandido && (
          <div className="mt-5 pt-4 border-t space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Calculator size={13} /> Calcular pago de un período
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label className="text-xs text-gray-400">Desde</Label>
                  <Input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs text-gray-400">Hasta</Label>
                  <Input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} className="h-9" />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => calcularPago.mutate()}
                  disabled={calcularPago.isPending}
                  data-testid={`button-calcular-pago-${delivery.id}`}
                >
                  Calcular
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Wallet size={13} /> Historial de pagos
              </p>
              {!historial || historial.length === 0 ? (
                <p className="text-xs text-gray-400">Todavía no hay pagos calculados</p>
              ) : (
                <div className="space-y-2">
                  {historial.map((p) => <PagoFila key={p.id} pago={p} deliveryId={delivery.id} />)}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConfiguracionPagoTab({ deliveries, colmadoId }: { deliveries: Delivery[]; colmadoId?: number }) {
  if (!deliveries || deliveries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Wallet size={48} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">Agrega un repartidor primero para configurar su pago</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {colmadoId && <AdelantosPendientes colmadoId={colmadoId} />}
      {deliveries.map((d) => (
        <DeliveryConfigCard key={d.id} delivery={d} />
      ))}
    </div>
  );
}

type Ajuste = { id: number; tipo: string; monto: string; motivo: string | null; usuario: string | null };
const ETIQUETA: Record<string, string> = { bono: "Bono", descuento: "Descuento", cuadre: "Cuadres", adelanto: "Adelanto" };
const rd = (n: number) => `${n < 0 ? "−" : ""}RD$${Math.abs(n).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function pedir(url: string, metodo: string, cuerpo?: unknown) {
  const r = await fetch(url, { method: metodo, credentials: "include", headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No se pudo");
  return j;
}

/** Un pago del historial: bonos, descuentos, saldo de cuadres y marcar pagado con forma y foto. */
function PagoFila({ pago, deliveryId }: { pago: PagoDelivery; deliveryId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const { data, refetch } = useQuery<{ pago: PagoDelivery; ajustes: Ajuste[]; saldoCuadres: number; propinas: number }>({
    queryKey: ["pago-delivery", pago.id], queryFn: () => pedir(`/api/pagos-delivery/${pago.id}`, "GET"), enabled: abierto,
  });
  const [nuevo, setNuevo] = useState({ tipo: "bono", monto: "", motivo: "" });
  const [metodo, setMetodo] = useState("efectivo");
  const [ocupado, setOcupado] = useState(false);
  const hacer = async (f: () => Promise<unknown>, aviso: string) => {
    setOcupado(true);
    try { await f(); toast({ title: aviso }); await refetch(); qc.invalidateQueries({ queryKey: ["pagos-delivery", deliveryId] }); }
    catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); }
    setOcupado(false);
  };
  const p = data?.pago ?? pago;
  const pendiente = p.estado === "pendiente";
  return (
    <div className="bg-gray-50 rounded-lg text-sm" data-testid={`pago-fila-${p.id}`}>
      <button type="button" className="w-full flex items-center justify-between px-3 py-2 text-left" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <div>
          <p className="font-medium text-gray-700">{new Date(p.periodoInicio).toLocaleDateString("es-DO")} — {new Date(p.periodoFin).toLocaleDateString("es-DO")}</p>
          <p className="text-xs text-gray-400">{p.totalPedidos} entregas · {rd(parseFloat(p.totalVentas))} vendidos{p.recibidoAt ? " · ✓ el repartidor confirmó que lo recibió" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{rd(parseFloat(p.montoTotal))}</span>
          {pendiente ? <Badge variant="outline" className="text-amber-700 border-amber-300">Pendiente</Badge> : <Badge className="bg-green-500 text-white flex items-center gap-1"><CheckCircle2 size={12} /> Pagado</Badge>}
        </div>
      </button>
      {abierto && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-200 pt-2">
          {!data ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              <div className="space-y-0.5 text-gray-600">
                {parseFloat(p.salarioCalculado) > 0 && <p className="flex justify-between"><span>Salario</span><span>{rd(parseFloat(p.salarioCalculado))}</span></p>}
                {parseFloat(p.comisionCalculada) > 0 && <p className="flex justify-between"><span>Comisiones</span><span>{rd(parseFloat(p.comisionCalculada))}</span></p>}
                {parseFloat(p.envioCalculado ?? "0") > 0 && <p className="flex justify-between"><span>Envíos</span><span>{rd(parseFloat(p.envioCalculado!))}</span></p>}
                {data.ajustes.map((a) => (
                  <p key={a.id} className={`flex justify-between items-center ${parseFloat(a.monto) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    <span>{ETIQUETA[a.tipo] ?? a.tipo}{a.motivo ? ` · ${a.motivo}` : ""}</span>
                    <span className="flex items-center gap-2">{rd(parseFloat(a.monto))}{pendiente && <button type="button" className="text-xs text-gray-500 underline" disabled={ocupado} onClick={() => hacer(() => pedir(`/api/pagos-delivery/${p.id}/ajustes/${a.id}`, "DELETE"), "Ajuste quitado")}>quitar</button>}</span>
                  </p>
                ))}
                <p className="flex justify-between font-semibold text-gray-900"><span>Total a pagar</span><span>{rd(parseFloat(p.montoTotal))}</span></p>
                {data.propinas > 0 && <p className="text-xs text-gray-500">Propinas del período (son del repartidor, no se pagan): {rd(data.propinas)}</p>}
              </div>
              {pendiente && (
                <>
                  {Math.abs(data.saldoCuadres) >= 0.01 && (
                    <div className={`rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${data.saldoCuadres < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
                      <span className="text-xs">{data.saldoCuadres < 0 ? `Le faltaron ${rd(-data.saldoCuadres)} en sus cuadres.` : `Le sobraron ${rd(data.saldoCuadres)} en sus cuadres.`}</span>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={ocupado} onClick={() => hacer(() => pedir(`/api/pagos-delivery/${p.id}/ajustes`, "POST", { tipo: "cuadre" }), data.saldoCuadres < 0 ? "Faltante descontado" : "Sobrante sumado")} data-testid={`aplicar-cuadre-${p.id}`}>
                        {data.saldoCuadres < 0 ? "Descontar" : "Sumar al pago"}
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <select className="h-8 rounded-md border border-gray-300 text-xs px-2" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })} aria-label="Tipo de ajuste">
                      <option value="bono">Bono (+)</option><option value="descuento">Descuento (−)</option>
                    </select>
                    <Input className="h-8 w-24 text-xs" inputMode="decimal" placeholder="Monto" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })} data-testid={`monto-ajuste-${p.id}`} />
                    <Input className="h-8 flex-1 min-w-[120px] text-xs" placeholder="Motivo (sale en el recibo)" value={nuevo.motivo} onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })} />
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado || !(Number(nuevo.monto) > 0)} onClick={() => hacer(async () => { await pedir(`/api/pagos-delivery/${p.id}/ajustes`, "POST", { tipo: nuevo.tipo, monto: Number(nuevo.monto), motivo: nuevo.motivo }); setNuevo({ tipo: "bono", monto: "", motivo: "" }); }, "Ajuste agregado")} data-testid={`agregar-ajuste-${p.id}`}>Agregar</Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 items-center pt-1">
                    <select className="h-8 rounded-md border border-gray-300 text-xs px-2" value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Cómo le pagaste">
                      <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="cheque">Cheque</option>
                    </select>
                    <label className="h-8 inline-flex items-center px-2 rounded-md border border-gray-300 text-xs cursor-pointer">
                      {p.comprobanteUrl ? "📎 Foto lista" : "Foto (opcional)"}
                      <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                        const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
                        await hacer(async () => {
                          const chica = await reducirImagen(f, { max: 1600, tipo: "image/jpeg" });
                          const foto = await new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(chica); });
                          await pedir(`/api/pagos-delivery/${p.id}/foto`, "POST", { foto });
                        }, "Foto guardada");
                      }} />
                    </label>
                    <Button size="sm" className="h-8 text-xs bg-primary" disabled={ocupado} onClick={() => hacer(() => pedir(`/api/pagos-delivery/${p.id}/marcar-pagado`, "PATCH", { metodo }), "Marcado como pagado. Le avisamos al repartidor.")} data-testid={`button-marcar-pagado-${p.id}`}>Marcar pagado</Button>
                  </div>
                </>
              )}
              {!pendiente && (
                <p className="text-xs text-gray-500">Pagado{p.fechaPago ? ` el ${new Date(p.fechaPago).toLocaleDateString("es-DO")}` : ""}{p.pagadoPor ? ` por ${p.pagadoPor}` : ""}{p.metodoPago ? ` · ${p.metodoPago}` : ""}
                  {p.comprobanteUrl && <> · <a className="underline" href={p.comprobanteUrl} target="_blank" rel="noreferrer">ver foto</a></>}
                  {p.recibidoAt ? ` · el repartidor confirmó que lo recibió el ${new Date(p.recibidoAt).toLocaleDateString("es-DO")}` : " · el repartidor todavía no confirma que lo recibió"}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Adelanto = { id: number; repartidor: string; monto: number; motivo: string | null; estado: string; fecha: string; resueltoPor: string | null; respuesta: string | null };

/** Adelantos que pidieron los repartidores desde su portal: aprobar (le das el dinero) o rechazar. */
export function AdelantosPendientes({ colmadoId }: { colmadoId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery<{ adelantos: Adelanto[] }>({ queryKey: ["adelantos", colmadoId], queryFn: () => pedir(`/api/colmados/${colmadoId}/adelantos`, "GET") });
  const [metodo, setMetodo] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState<number | null>(null);
  const pendientes = (data?.adelantos ?? []).filter((a) => a.estado === "pendiente");
  if (!pendientes.length) return null;
  const responder = async (a: Adelanto, accion: "aprobar" | "rechazar") => {
    let respuesta: string | null = null;
    if (accion === "rechazar") { respuesta = window.prompt(`¿Por qué no le das el adelanto a ${a.repartidor}? (opcional)`) ; if (respuesta === null) return; }
    setOcupado(a.id);
    try {
      await pedir(`/api/adelantos/${a.id}/${accion}`, "POST", accion === "aprobar" ? { metodo: metodo[a.id] ?? "efectivo" } : { respuesta });
      toast({ title: accion === "aprobar" ? "Adelanto aprobado: se descuenta de su próximo pago" : "Adelanto rechazado" });
      qc.invalidateQueries({ queryKey: ["adelantos", colmadoId] });
    } catch (e: any) { toast({ title: "No se pudo", description: e.message, variant: "destructive" }); }
    setOcupado(null);
  };
  return (
    <Card className="border-amber-300 bg-amber-50 shadow-sm" data-testid="adelantos-pendientes">
      <CardContent className="p-4 space-y-2">
        <p className="font-semibold text-amber-900">Adelantos pedidos ({pendientes.length})</p>
        {pendientes.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 bg-white rounded-lg px-3 py-2 text-sm">
            <div className="flex-1 min-w-[160px]">
              <p className="font-medium text-gray-900">{a.repartidor} · {rd(a.monto)}</p>
              <p className="text-xs text-gray-500">{new Date(a.fecha).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" })}{a.motivo ? ` · ${a.motivo}` : ""}</p>
            </div>
            <select className="h-8 rounded-md border border-gray-300 text-xs px-2" value={metodo[a.id] ?? "efectivo"} onChange={(e) => setMetodo({ ...metodo, [a.id]: e.target.value })} aria-label="Cómo se lo das">
              <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option>
            </select>
            <Button size="sm" className="h-8 text-xs bg-primary" disabled={ocupado === a.id} onClick={() => responder(a, "aprobar")} data-testid={`aprobar-adelanto-${a.id}`}>Aprobar</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={ocupado === a.id} onClick={() => responder(a, "rechazar")} data-testid={`rechazar-adelanto-${a.id}`}>Rechazar</Button>
          </div>
        ))}
        <p className="text-xs text-amber-900">Al aprobarlo, dale el dinero. Se descuenta solo del pago de su período.</p>
      </CardContent>
    </Card>
  );
}
