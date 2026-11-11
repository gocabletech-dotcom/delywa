import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Calculator, CheckCircle2, ChevronDown, ChevronUp, Truck } from "lucide-react";

interface Delivery {
  id: number;
  nombre: string;
  modeloPago: "salario" | "comision" | "mixto";
  salarioMonto: string;
  comisionFija: string;
  comisionPorcentaje: string;
  periodoPago: string;
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
                  {historial.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="font-medium text-gray-700">
                          {new Date(p.periodoInicio).toLocaleDateString("es-DO")} — {new Date(p.periodoFin).toLocaleDateString("es-DO")}
                        </p>
                        <p className="text-xs text-gray-400">{p.totalPedidos} entregas · RD${parseFloat(p.totalVentas).toFixed(2)} vendidos</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">RD${parseFloat(p.montoTotal).toFixed(2)}</span>
                        {p.estado === "pagado" ? (
                          <Badge className="bg-green-500 text-white flex items-center gap-1">
                            <CheckCircle2 size={12} /> Pagado
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => marcarPagado.mutate(p.id)}
                            disabled={marcarPagado.isPending}
                            data-testid={`button-marcar-pagado-${p.id}`}
                          >
                            Marcar pagado
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConfiguracionPagoTab({ deliveries }: { deliveries: Delivery[] }) {
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
      {deliveries.map((d) => (
        <DeliveryConfigCard key={d.id} delivery={d} />
      ))}
    </div>
  );
}
