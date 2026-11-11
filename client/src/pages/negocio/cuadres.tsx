import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  MessageCircle,
  Truck,
  Package,
  DollarSign,
  TrendingUp,
  Users,
  Settings,
  UtensilsCrossed,
  RefreshCw,
  BookOpen,
  LogOut,
  Menu,
  X,
  ClipboardList,
  CheckCircle2,
  Smartphone,
  AlertTriangle,
  BadgeCheck,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NegocioLayout from "@/components/negocio/NegocioLayout";

interface PedidoBasico {
  id: number;
  estado: string;
  clienteNombre: string;
  vueltoEntregado: string | null;
  motivoRetorno: string | null;
  cuadreId: number | null;
}

interface CuadreEnriquecido {
  id: number;
  deliveryId: number;
  colmadoId: number;
  fechaCuadre: string;
  pedidosIds: number[];
  totalEfectivoCobrado: string;
  totalDevueltaEntregada: string;
  totalVueltoRetornado: string | null;
  totalEfectivoRecibidoNegocio: string | null;
  netoAEntregar: string;
  montoRecibido: string | null;
  diferencia: string | null;
  estado: string;
  notasRepartidor: string | null;
  notasNegocio: string | null;
  fechaCreacion: string;
  fechaConfirmacion: string | null;
  repartidorNombre: string;
}

interface SaldoDelivery {
  id: number;
  deliveryId: number;
  colmadoId: number;
  saldoPendiente: string;
  estado: string;
  fechaCreacion: string;
  fechaSaldado: string | null;
  deliveryNombre: string;
}

interface VueltoLogItem {
  pedidoId: number;
  clienteNombre: string;
  deliveryNombre: string;
  monto: string;
  entregadoPor: string;
  entregadoAt: string;
}

export default function CuadresPage() {
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendiente" | "confirmado">("todos");
  const [montosRecibidos, setMontosRecibidos] = useState<Record<number, string>>({});
  const [cuadreVer, setCuadreVer] = useState<CuadreEnriquecido | null>(null);
  const [cuadrePedidosVer, setCuadrePedidosVer] = useState<CuadreEnriquecido | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, logout } = useAuth();

  const { data: roleData } = useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const res = await fetch("/api/user/role");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const colmadoId = roleData?.colmadoId;

  const { data: colmadoData } = useQuery<{
    id: number;
    nombre: string;
    logo: string | null;
    tipoNegocio: string;
    simboloMoneda?: string;
  }>({
    queryKey: ["colmado", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}`);
      if (!res.ok) throw new Error("Error al cargar negocio");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: suscripcionData } = useQuery<{ plan: { nombre: string } }>({
    queryKey: ["suscripcion", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/suscripcion`);
      if (!res.ok) throw new Error("Error al cargar suscripción");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: unreadData } = useQuery({
    queryKey: ["unread-messages", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/conversaciones/unread`);
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 30000,
  });

  const { data: pedidosData } = useQuery<PedidoBasico[]>({
    queryKey: ["pedidos", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/pedidos`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!colmadoId,
  });
  // Pedidos entregados o retornados que aún no tienen cuadre
  const pedidosSinCuadre = (pedidosData ?? []).filter(
    (p) => ["entregado", "retorno"].includes(p.estado) && p.cuadreId === null
  );

  const { data: allCuadres = [], isLoading, refetch } = useQuery<CuadreEnriquecido[]>({
    queryKey: ["negocio-cuadres", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/cuadres`);
      if (!res.ok) throw new Error("Error al cargar cuadres");
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: saldos = [] } = useQuery<SaldoDelivery[]>({
    queryKey: ["saldos-delivery", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/saldos-delivery`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const { data: vueltosLog = [] } = useQuery<VueltoLogItem[]>({
    queryKey: ["vueltos-log", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/vueltos-log`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!colmadoId,
  });

  const saldosPendientes = saldos.filter(s => s.estado === "pendiente" && parseFloat(s.saldoPendiente) < 0);
  const saldosCredito = saldos.filter(s => s.estado === "pendiente" && parseFloat(s.saldoPendiente) > 0);

  const cuadres = filtroEstado === "todos"
    ? allCuadres
    : allCuadres.filter(c => c.estado === filtroEstado);

  const confirmarCuadreMutation = useMutation({
    mutationFn: async ({ cuadreId, montoRecibido }: { cuadreId: number; montoRecibido?: string }) => {
      const body: { montoRecibido?: number } = {};
      if (montoRecibido !== undefined && montoRecibido.trim() !== "") {
        body.montoRecibido = parseFloat(montoRecibido);
      }
      const res = await fetch(`/api/colmados/${colmadoId}/cuadres/${cuadreId}/confirmar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al confirmar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["negocio-cuadres", colmadoId] });
      queryClient.invalidateQueries({ queryKey: ["saldos-delivery", colmadoId] });
      toast({ title: "Cuadre confirmado", description: "El cuadre fue marcado como confirmado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saldarMutation = useMutation({
    mutationFn: async (saldoId: number) => {
      const res = await fetch(`/api/saldos-delivery/${saldoId}/saldar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Error al marcar como saldado");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saldos-delivery", colmadoId] });
      toast({ title: "Saldo saldado", description: "El saldo fue marcado como saldado" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const moneda = colmadoData?.simboloMoneda || "RD$";

  const countAll = allCuadres.length;
  const countPendiente = allCuadres.filter(c => c.estado === "pendiente").length;
  const countConfirmado = allCuadres.filter(c => c.estado === "confirmado").length;

  const cuadresHeaderRight = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 sm:h-10 sm:w-10 text-white/80 hover:text-white hover:bg-white/10"
      onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["saldos-delivery", colmadoId] }); }}
      title="Refrescar"
      data-testid="button-refresh-cuadres"
    >
      <RefreshCw size={18} className="sm:hidden" />
      <RefreshCw size={20} className="hidden sm:block" />
    </Button>
  );

  return (
    <NegocioLayout title="Cuadres de Delivery" activeNav="cuadres" headerRight={cuadresHeaderRight}>
      {/* Sidebar */}

      {/* Main Content */}

        {/* Filter Chips */}
        <div className="bg-white border-b sticky top-14 sm:top-16 z-10">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto items-center px-3 sm:px-4 lg:px-6 py-2 sm:py-3 scrollbar-none">
            {pedidosSinCuadre.length > 0 && (
              <div className="flex items-center gap-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 whitespace-nowrap" data-testid="chip-sin-cuadre">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                {pedidosSinCuadre.length} sin cuadre
              </div>
            )}
            {[
              { value: "todos" as const, label: "Todos", count: countAll, color: "bg-gray-100 text-gray-700 border-gray-300" },
              { value: "pendiente" as const, label: "Pendientes", count: countPendiente, color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
              { value: "confirmado" as const, label: "Confirmados", count: countConfirmado, color: "bg-green-100 text-green-700 border-green-300" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltroEstado(f.value)}
                data-testid={`filter-cuadre-${f.value}`}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap shrink-0 ${filtroEstado === f.value ? `${f.color} ring-2 ring-offset-1 ring-primary/50 shadow-sm border-2` : `${f.color} opacity-70 hover:opacity-100`}`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-auto space-y-6">

          {/* ── Pedidos sin cuadre ── */}
          {pedidosSinCuadre.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3" data-testid="banner-pedidos-sin-cuadre">
              <ClipboardList size={20} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">
                  {pedidosSinCuadre.length} pedido{pedidosSinCuadre.length !== 1 ? "s" : ""} entregado{pedidosSinCuadre.length !== 1 ? "s" : ""} sin cuadre
                </p>
                <p className="text-xs text-amber-600 mt-0.5">El repartidor aún no ha registrado el cuadre de estos pedidos.</p>
              </div>
            </div>
          )}

          {/* ── Saldos pendientes section ── */}
          {(saldosPendientes.length > 0 || saldosCredito.length > 0) && (
            <div>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                Saldos de Repartidores
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {saldosPendientes.map(s => (
                  <div
                    key={s.id}
                    className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between"
                    data-testid={`saldo-pendiente-${s.id}`}
                  >
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{s.deliveryNombre}</p>
                      <p className="text-xs text-red-600 mt-0.5 flex items-center gap-1">
                        <ArrowDown size={12} />
                        Debe {moneda}{Math.abs(parseFloat(s.saldoPendiente)).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-red-300 text-red-700 hover:bg-red-100"
                      onClick={() => saldarMutation.mutate(s.id)}
                      disabled={saldarMutation.isPending}
                      data-testid={`button-saldar-${s.id}`}
                    >
                      <BadgeCheck size={14} className="mr-1" />
                      Saldado
                    </Button>
                  </div>
                ))}
                {saldosCredito.map(s => (
                  <div
                    key={s.id}
                    className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between"
                    data-testid={`saldo-credito-${s.id}`}
                  >
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{s.deliveryNombre}</p>
                      <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1">
                        <ArrowUp size={12} />
                        Crédito {moneda}{parseFloat(s.saldoPendiente).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-green-300 text-green-700 hover:bg-green-100"
                      onClick={() => saldarMutation.mutate(s.id)}
                      disabled={saldarMutation.isPending}
                      data-testid={`button-saldar-credito-${s.id}`}
                    >
                      <BadgeCheck size={14} className="mr-1" />
                      Cerrar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Cuadres list ── */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : cuadres.length === 0 ? (
            <div className="text-center py-20" data-testid="no-cuadres-negocio">
              <ClipboardList size={56} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">No hay cuadres</h3>
              <p className="text-gray-500 text-sm">Los cuadres aparecerán aquí cuando los repartidores los registren</p>
            </div>
          ) : (
            <>
            {/* ── Mobile cards (< sm) ── */}
            <div className="sm:hidden space-y-2">
              {cuadres.map((c) => {
                const dif = c.diferencia ? parseFloat(c.diferencia) : null;
                const tieneDeuda = dif !== null && dif < 0;
                const tieneCredito = dif !== null && dif > 0;
                const confirmado = c.estado === "confirmado";
                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-xl border shadow-sm px-4 py-3 space-y-2"
                    data-testid={`cuadre-card-${c.id}`}
                  >
                    {/* Top row: dot + name + estado badge */}
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${confirmado ? "bg-green-400" : "bg-yellow-400"}`} />
                      <p className="font-semibold text-sm text-gray-900 flex-1 truncate" data-testid={`cuadre-repartidor-${c.id}`}>
                        {c.repartidorNombre}
                      </p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${confirmado ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`} data-testid={`cuadre-estado-${c.id}`}>
                        {confirmado ? "Confirmado" : "Pendiente"}
                      </span>
                    </div>

                    {/* Middle row: fecha · pedidos · neto */}
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <span className="tabular-nums">
                        {new Date(c.fechaCuadre + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>{c.pedidosIds.length} pedido{c.pedidosIds.length !== 1 ? "s" : ""}</span>
                      <span className="text-gray-300">·</span>
                      <span className="font-bold text-primary tabular-nums" data-testid={`cuadre-neto-${c.id}`}>
                        {moneda}{parseFloat(c.netoAEntregar).toLocaleString()}
                      </span>
                    </div>

                    {/* Deuda / crédito badges */}
                    {(tieneDeuda || tieneCredito) && (
                      <div className="flex gap-1 flex-wrap">
                        {tieneDeuda && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 flex items-center gap-0.5" data-testid={`cuadre-deuda-badge-${c.id}`}>
                            <ArrowDown size={10} /> Debe {moneda}{Math.abs(dif!).toLocaleString()}
                          </span>
                        )}
                        {tieneCredito && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 flex items-center gap-0.5" data-testid={`cuadre-credito-badge-${c.id}`}>
                            <ArrowUp size={10} /> Crédito {moneda}{dif!.toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setCuadreVer(c)} data-testid={`ver-cuadre-${c.id}`}>
                        Ver detalle
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setCuadrePedidosVer(c)} data-testid={`ver-pedidos-cuadre-${c.id}`}>
                        Ver pedidos
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop table (≥ sm) ── */}
            <div className="hidden sm:block bg-white rounded-lg border shadow-sm overflow-hidden">
              {/* Column header */}
              <div className="grid grid-cols-[10px_1fr_90px_72px_80px_auto] gap-2 items-center px-4 py-2 bg-gray-50 border-b text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <span />
                <span>Repartidor</span>
                <span className="text-center">Fecha</span>
                <span className="text-center">Pedidos</span>
                <span className="text-right">Neto</span>
                <span />
              </div>
              {/* Rows */}
              <div className="divide-y">
                {cuadres.map((c) => {
                  const dif = c.diferencia ? parseFloat(c.diferencia) : null;
                  const tieneDeuda = dif !== null && dif < 0;
                  const tieneCredito = dif !== null && dif > 0;
                  const confirmado = c.estado === "confirmado";
                  return (
                    <div
                      key={c.id}
                      className="grid grid-cols-[10px_1fr_90px_72px_80px_auto] gap-2 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                      data-testid={`cuadre-card-${c.id}`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${confirmado ? "bg-green-400" : "bg-yellow-400"}`} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate" data-testid={`cuadre-repartidor-${c.id}`}>{c.repartidorNombre}</p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${confirmado ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`} data-testid={`cuadre-estado-${c.id}`}>
                            {confirmado ? "Confirmado" : "Pendiente"}
                          </span>
                          {tieneDeuda && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700 flex items-center gap-0.5" data-testid={`cuadre-deuda-badge-${c.id}`}>
                              <ArrowDown size={9} /> Debe {moneda}{Math.abs(dif!).toLocaleString()}
                            </span>
                          )}
                          {tieneCredito && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 flex items-center gap-0.5" data-testid={`cuadre-credito-badge-${c.id}`}>
                              <ArrowUp size={9} /> Crédito {moneda}{dif!.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-center text-xs text-gray-500 tabular-nums">
                        {new Date(c.fechaCuadre + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short" })}
                      </div>
                      <div className="text-center text-sm text-gray-700 tabular-nums">{c.pedidosIds.length}</div>
                      <div className="text-right font-bold text-sm text-primary tabular-nums" data-testid={`cuadre-neto-${c.id}`}>
                        {moneda}{parseFloat(c.netoAEntregar).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setCuadreVer(c)} data-testid={`ver-cuadre-${c.id}`}>Ver</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setCuadrePedidosVer(c)} data-testid={`ver-pedidos-cuadre-${c.id}`}>Pedidos</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          )}

          {/* ── Modal: detalle del cuadre ── */}
          <Dialog open={!!cuadreVer} onOpenChange={(open) => { if (!open) setCuadreVer(null); }}>
            <DialogContent className="max-w-sm mx-4 sm:mx-auto max-h-[90dvh] overflow-y-auto">
              {cuadreVer && (() => {
                const c = cuadreVer;
                const dif = c.diferencia ? parseFloat(c.diferencia) : null;
                const tieneDeuda = dif !== null && dif < 0;
                const devuelta = parseFloat(c.totalDevueltaEntregada) || 0;
                const recibidoNegocio = parseFloat(c.totalEfectivoRecibidoNegocio ?? "0") || 0;
                const vueltoRet = parseFloat(c.totalVueltoRetornado ?? "0") || 0;
                const confirmado = c.estado === "confirmado";
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="truncate pr-6">{c.repartidorNombre}</DialogTitle>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${confirmado ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {confirmado ? "Confirmado" : "Pendiente"}
                        </span>
                        <p className="text-xs text-gray-500">
                          {new Date(c.fechaCuadre + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" })}
                          {" · "}{c.pedidosIds.length} pedido{c.pedidosIds.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </DialogHeader>

                    <div className="border rounded-lg divide-y text-sm mt-1">
                      <div className="flex justify-between px-3 py-2 text-gray-700">
                        <span>Cobrado del cliente</span>
                        <span className="font-medium tabular-nums" data-testid={`cuadre-cobrado-${c.id}`}>{moneda}{parseFloat(c.totalEfectivoCobrado).toLocaleString()}</span>
                      </div>
                      {devuelta > 0 && (
                        <div className="flex justify-between px-3 py-2 text-xs text-gray-500">
                          <span>Devuelta enviada al cliente</span>
                          <span className="tabular-nums" data-testid={`cuadre-devuelta-${c.id}`}>{moneda}{devuelta.toLocaleString()}</span>
                        </div>
                      )}
                      {recibidoNegocio > 0 && (
                        <div className="flex justify-between px-3 py-2 text-xs text-amber-700">
                          <span>Recibido del negocio</span>
                          <span className="font-medium tabular-nums" data-testid={`cuadre-efectivo-negocio-${c.id}`}>+{moneda}{recibidoNegocio.toLocaleString()}</span>
                        </div>
                      )}
                      {vueltoRet > 0 && (
                        <div className="flex justify-between px-3 py-2 text-xs text-orange-700">
                          <span>Devuelta retornada</span>
                          <span className="font-medium tabular-nums" data-testid={`cuadre-vuelto-retornado-${c.id}`}>+{moneda}{vueltoRet.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between px-3 py-2.5 bg-gray-50 font-bold text-gray-900">
                        <span>Neto a entregar</span>
                        <span className="tabular-nums text-primary" data-testid={`cuadre-neto-modal-${c.id}`}>{moneda}{parseFloat(c.netoAEntregar).toLocaleString()}</span>
                      </div>
                      {confirmado && c.montoRecibido !== null && (
                        <div className="flex justify-between px-3 py-2 text-xs text-gray-500">
                          <span>Monto recibido</span>
                          <span className="flex items-center gap-1.5 tabular-nums">
                            <span data-testid={`cuadre-monto-recibido-${c.id}`}>{moneda}{parseFloat(c.montoRecibido).toLocaleString()}</span>
                            {dif !== null && dif !== 0 && (
                              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${tieneDeuda ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`} data-testid={`cuadre-diferencia-${c.id}`}>
                                {tieneDeuda ? `Faltó ${moneda}${Math.abs(dif).toLocaleString()}` : `Sobró ${moneda}${dif.toLocaleString()}`}
                              </span>
                            )}
                            {dif === 0 && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Exacto</span>}
                          </span>
                        </div>
                      )}
                    </div>

                    {(c.notasRepartidor || c.notasNegocio) && (
                      <div className="text-xs text-gray-400 space-y-0.5 mt-1">
                        {c.notasRepartidor && <p className="italic">Repartidor: {c.notasRepartidor}</p>}
                        {c.notasNegocio && <p className="italic text-blue-500">Negocio: {c.notasNegocio}</p>}
                      </div>
                    )}
                    {c.fechaConfirmacion && (
                      <p className="text-xs text-green-600 mt-1">
                        Confirmado el {new Date(c.fechaConfirmacion).toLocaleDateString("es-DO", { day: "2-digit", month: "long", year: "numeric" })}
                      </p>
                    )}

                    {c.estado === "pendiente" && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          type="number"
                          placeholder={`Monto recibido (${moneda}${parseFloat(c.netoAEntregar).toLocaleString()})`}
                          value={montosRecibidos[c.id] ?? ""}
                          onChange={(e) => setMontosRecibidos(prev => ({ ...prev, [c.id]: e.target.value }))}
                          className="text-sm h-9 flex-1"
                          data-testid={`input-monto-recibido-${c.id}`}
                        />
                        <Button
                          className="bg-primary h-9 text-xs shrink-0"
                          disabled={confirmarCuadreMutation.isPending}
                          onClick={() => {
                            confirmarCuadreMutation.mutate({ cuadreId: c.id, montoRecibido: montosRecibidos[c.id] });
                            setCuadreVer(null);
                          }}
                          data-testid={`button-confirmar-cuadre-${c.id}`}
                        >
                          <CheckCircle2 size={14} className="mr-1" /> Confirmar
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

          {/* ── Modal: pedidos del cuadre ── */}
          <Dialog open={!!cuadrePedidosVer} onOpenChange={(open) => { if (!open) setCuadrePedidosVer(null); }}>
            <DialogContent className="max-w-sm mx-4 sm:mx-auto max-h-[90dvh] overflow-y-auto">
              {cuadrePedidosVer && (() => {
                const c = cuadrePedidosVer;
                const pedidosDelCuadre = (pedidosData ?? []).filter(p => c.pedidosIds.includes(p.id));
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>Pedidos del cuadre</DialogTitle>
                      <p className="text-xs text-gray-500">
                        {c.repartidorNombre} · {new Date(c.fechaCuadre + "T00:00:00").toLocaleDateString("es-DO", { day: "2-digit", month: "long" })}
                      </p>
                    </DialogHeader>
                    {pedidosDelCuadre.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4 italic">No se encontraron pedidos</p>
                    ) : (
                      <div className="border rounded-lg divide-y text-sm mt-1">
                        {pedidosDelCuadre.map(p => (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2.5 gap-2" data-testid={`pedido-en-cuadre-${p.id}`}>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900">#{p.id} — {p.clienteNombre}</p>
                              {p.motivoRetorno && <p className="text-[11px] text-gray-400 italic">{p.motivoRetorno}</p>}
                            </div>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                              p.estado === "entregado" ? "bg-green-100 text-green-700"
                              : p.estado === "retorno" ? "bg-gray-100 text-gray-600"
                              : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {p.estado === "entregado" ? "Entregado" : p.estado === "retorno" ? "Retorno" : p.estado}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        {/* Historial de devueltas entregadas al delivery */}
        {vueltosLog.length > 0 && (
          <section className="max-w-3xl mx-auto px-4 pb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
              <DollarSign size={14} className="text-amber-500" />
              Historial de devueltas entregadas al delivery
            </h2>
            <Card>
              <CardContent className="p-0 divide-y divide-gray-100">
                {vueltosLog.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap" data-testid={`vuelto-log-${item.pedidoId}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        Pedido #{item.pedidoId} — {item.clienteNombre}
                      </p>
                      <p className="text-xs text-gray-500">
                        Entregado a <span className="font-medium">{item.deliveryNombre}</span>
                        {item.entregadoPor && ` · por ${item.entregadoPor}`}
                        {" · "}
                        {new Date(item.entregadoAt).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-amber-700 shrink-0">{moneda}{parseFloat(item.monto).toLocaleString()}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}
        </main>
    </NegocioLayout>
  );
}
