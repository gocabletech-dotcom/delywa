import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { buildMapUrl } from "@/lib/mapUtils";
import { formatearDuracionMinutos } from "@/lib/formatDuration";
import MapaRuta, { type ParadaMapa } from "./MapaRuta";
import {
  MapPin,
  Navigation,
  CheckCircle2,
  XCircle,
  Loader2,
  Route as RouteIcon,
  Phone,
  RotateCcw,
} from "lucide-react";

interface PedidoParada {
  id: number;
  clienteNombre: string;
  clienteWhatsapp: string;
  clienteUbicacion: string;
  clienteLatitud?: string | null;
  clienteLongitud?: string | null;
  total: string;
  totalConfirmado: string | null;
}

interface PedidoConEstado {
  id: number;
  estado: string;
}

interface Parada {
  id: number;
  rutaId: number;
  pedidoId: number;
  orden: number;
  distanciaDesdeAnteriorKm: string | null;
  tiempoDesdeAnteriorMinutos: number | null;
  horaEstimadaLlegada: string | null;
  estado: "pendiente" | "entregado" | "no_entregado";
  motivoNoEntregado: string | null;
  pedido: PedidoParada;
}

interface Ruta {
  id: number;
  deliveryId: number;
  inicioLatitud: string | null;
  inicioLongitud: string | null;
  distanciaTotal: string | null;
  tiempoEstimadoMinutos: number | null;
  estado: string;
  fuenteDistancias?: "vial" | "gps";
  trafico?: boolean;
}

interface RutaActivaResponse {
  ruta: Ruta | null;
  paradas: Parada[];
  providerName?: string | null;
  trafficEnabled?: boolean;
  unidadDistancia?: "mi" | "km";
}

function extraerCoordsDeUbicacion(ubicacion: string): { lat: number; lon: number } | null {
  const match = ubicacion?.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
}

function extraerCoordsDePedido(pedido: PedidoParada): { lat: number; lon: number } | null {
  const lat = Number(pedido.clienteLatitud);
  const lon = Number(pedido.clienteLongitud);
  if (
    pedido.clienteLatitud !== null
    && pedido.clienteLatitud !== undefined
    && pedido.clienteLongitud !== null
    && pedido.clienteLongitud !== undefined
    && Number.isFinite(lat)
    && Number.isFinite(lon)
    && Math.abs(lat) <= 90
    && Math.abs(lon) <= 180
  ) {
    return { lat, lon };
  }
  return extraerCoordsDeUbicacion(pedido.clienteUbicacion);
}

export default function RutaEntrega({
  deliveryId,
  pedidosDisponibles,
  pedidosConEstado = [],
  moneda,
  onUpdateEstado,
  onAbrirRetorno,
}: {
  deliveryId: number;
  pedidosDisponibles: PedidoParada[];
  pedidosConEstado?: PedidoConEstado[];
  moneda: string;
  onUpdateEstado?: (pedidoId: number, estado: string, opts?: { motivoRetorno?: string }) => void;
  onAbrirRetorno?: (pedidoId: number) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [motivoModal, setMotivoModal] = useState<{ paradaId: number } | null>(null);
  const [motivoTexto, setMotivoTexto] = useState("");

  const { data, isLoading } = useQuery<RutaActivaResponse>({
    queryKey: ["ruta-activa", deliveryId],
    queryFn: async () => {
      const res = await fetch(`/api/deliveries/${deliveryId}/rutas/activa`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar la ruta");
      return res.json();
    },
    enabled: !!deliveryId,
    refetchInterval: 15000,
  });

  const optimizar = useMutation({
    mutationFn: async () => {
      const pedidosIds = pedidosDisponibles.map((p) => p.id);
      const res = await fetch(`/api/deliveries/${deliveryId}/rutas/optimizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pedidosIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al optimizar la ruta");
      return json as {
        ruta: Ruta;
        paradas: Parada[];
        sinUbicacion: number[];
        providerName?: string | null;
        trafficEnabled?: boolean;
        unidadDistancia?: "mi" | "km";
      };
    },
    onSuccess: (resultado) => {
      queryClient.setQueryData(["ruta-activa", deliveryId], resultado);
      const faltantes = resultado.sinUbicacion?.length || 0;
      toast({
        title: "Ruta optimizada",
        description:
          faltantes > 0
            ? `${resultado.paradas.length} paradas ordenadas. ${faltantes} pedido(s) sin GPS quedaron fuera.`
            : `${resultado.paradas.length} paradas ordenadas por ${resultado.ruta?.fuenteDistancias === "vial" ? "tiempos viales reales" : "distancia GPS (estimada)"}.`,
      });
    },
    onError: (err: Error) => toast({ title: "No se pudo optimizar", description: err.message, variant: "destructive" }),
  });

  const marcarParada = useMutation({
    mutationFn: async ({ paradaId, estado, motivo }: { paradaId: number; estado: "entregado" | "no_entregado"; motivo?: string }) => {
      const res = await fetch(`/api/paradas-ruta/${paradaId}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ estado, motivo }),
      });
      if (!res.ok) throw new Error("Error al actualizar la parada");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ruta-activa", deliveryId] });
      setMotivoModal(null);
      setMotivoTexto("");
    },
    onError: () => toast({ title: "Error", description: "No se pudo marcar la parada", variant: "destructive" }),
  });

  const ruta = data?.ruta;
  const paradas = data?.paradas || [];
  const unidadDistancia = data?.unidadDistancia || "km";
  const mostrarDistancia = (distanciaKm: number) =>
    `${(unidadDistancia === "mi" ? distanciaKm / 1.609344 : distanciaKm).toFixed(1)} ${unidadDistancia}`;

  const inicio =
    ruta?.inicioLatitud && ruta?.inicioLongitud
      ? { lat: parseFloat(ruta.inicioLatitud), lon: parseFloat(ruta.inicioLongitud) }
      : null;

  // Solo lo que falta por entregar: lo entregado pasa al Historial y lo no entregado a "Devolver al colmado".
  const estadoDeParada = (p: Parada): "pendiente" | "entregado" | "no_entregado" => {
    const estadoPedido = pedidosConEstado.find((pe) => pe.id === p.pedidoId)?.estado ?? "";
    if (p.estado === "entregado" || estadoPedido === "entregado") return "entregado";
    if (p.estado === "no_entregado" || ["retorno", "cancelado", "fusionado"].includes(estadoPedido)) return "no_entregado";
    return "pendiente";
  };
  const pendientes = paradas.filter((p) => estadoDeParada(p) === "pendiente");
  const enRuta = new Set(paradas.map((p) => p.pedidoId));
  const nuevosFueraDeRuta = pedidosDisponibles.filter((p) => !enRuta.has(p.id)).length;

  const paradasParaMapa: ParadaMapa[] = pendientes
    .map((p) => {
      const coords = extraerCoordsDePedido(p.pedido);
      if (!coords) return null;
      return {
        id: p.id,
        orden: p.orden,
        lat: coords.lat,
        lon: coords.lon,
        clienteNombre: p.pedido.clienteNombre,
        direccion: p.pedido.clienteUbicacion,
        estado: p.estado,
      };
    })
    .filter((p): p is ParadaMapa => p !== null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!ruta || pendientes.length === 0) {
    const terminoRuta = !!ruta && paradas.length > 0;
    return (
      <div className="text-center py-10 px-4" data-testid={terminoRuta ? "ruta-terminada" : "ruta-vacia"}>
        <RouteIcon size={44} className="mx-auto mb-3 text-slate-300" />
        {terminoRuta && <p className="font-bold text-slate-900 mb-1">Terminaste esta ruta</p>}
        <p className="text-sm text-slate-600 mb-4">
          {pedidosDisponibles.length === 0
            ? (terminoRuta ? "Las entregas hechas están en Historial." : "No tienes pedidos por entregar.")
            : `Tienes ${pedidosDisponibles.length} pedido${pedidosDisponibles.length === 1 ? "" : "s"} por entregar. Arma la ruta para verlos en el orden más corto.`}
        </p>
        {pedidosDisponibles.length > 0 && (
          <Button
            onClick={() => optimizar.mutate()}
            disabled={optimizar.isPending}
            className="bg-primary"
            data-testid="button-optimizar-ruta"
          >
            {optimizar.isPending ? <Loader2 className="animate-spin mr-2" size={16} /> : <RouteIcon size={16} className="mr-2" />}
            Optimizar ruta de entrega
          </Button>
        )}
      </div>
    );
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-gray-800">{pendientes.length}</span> por entregar ·{" "}
          {ruta.distanciaTotal ? mostrarDistancia(parseFloat(ruta.distanciaTotal)) : ""}{" "}
          {ruta.tiempoEstimadoMinutos ? `· ~${formatearDuracionMinutos(ruta.tiempoEstimadoMinutos)}` : ""}
          <span className={`ml-1 font-medium ${ruta.fuenteDistancias === "vial" ? "text-green-600" : "text-orange-600"}`}>
            · {ruta.fuenteDistancias === "vial" ? (ruta.trafico ? "vial con tráfico" : "vial sin tráfico") : "aproximada por GPS"}
          </span>
        </div>
        <div className="text-[11px] text-sky-700">
          Ruta vial{data?.trafficEnabled ? " · tráfico" : ""}{data?.providerName ? ` · ${data.providerName}` : ""}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => optimizar.mutate()}
          disabled={optimizar.isPending}
          data-testid="button-reoptimizar-ruta"
        >
          {optimizar.isPending ? <Loader2 className="animate-spin mr-1.5" size={14} /> : <RouteIcon size={14} className="mr-1.5" />}
          Recalcular
        </Button>
      </div>

      {nuevosFueraDeRuta > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-center justify-between gap-2" data-testid="pedidos-fuera-de-ruta">
          <p className="text-sm text-amber-900">Te asignaron {nuevosFueraDeRuta} pedido{nuevosFueraDeRuta === 1 ? "" : "s"} nuevo{nuevosFueraDeRuta === 1 ? "" : "s"} que no está{nuevosFueraDeRuta === 1 ? "" : "n"} en esta ruta.</p>
          <Button size="sm" variant="outline" className="h-9 rounded-lg border-amber-400 bg-white text-amber-900 shrink-0" onClick={() => optimizar.mutate()} disabled={optimizar.isPending}>Recalcular</Button>
        </div>
      )}

      {inicio && paradasParaMapa.length > 0 && <MapaRuta inicio={inicio} paradas={paradasParaMapa} />}

      <div className="space-y-3">
        {pendientes.map((p) => {
          const mapUrl = buildMapUrl(p.pedido.clienteUbicacion, {
            latitud: p.pedido.clienteLatitud,
            longitud: p.pedido.clienteLongitud,
          });
          const total = parseFloat(p.pedido.totalConfirmado ?? p.pedido.total) || 0;
          // Sync with live pedido estado from parent
          const pedidoActual = pedidosConEstado.find(pe => pe.id === p.pedidoId);
          const estadoPedido = pedidoActual?.estado ?? "";
          const estaEntregado = p.estado === "entregado" || estadoPedido === "entregado";
          const estaNoEntregado = p.estado === "no_entregado" || estadoPedido === "retorno" || estadoPedido === "cancelado";
          const estadoEfectivo = estaEntregado ? "entregado" : estaNoEntregado ? "no_entregado" : "pendiente";
          const isEnCamino = estadoPedido === "en_camino";
          const isLlegando = estadoPedido === "llegando";
          const isPending = estadoEfectivo === "pendiente";
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-3 ${
                estadoEfectivo === "entregado"
                  ? "bg-green-50 border-green-200"
                  : estadoEfectivo === "no_entregado"
                  ? "bg-red-50 border-red-200"
                  : "bg-white border-gray-200"
              }`}
              data-testid={`parada-${p.id}`}
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    estadoEfectivo === "entregado" ? "bg-green-500 text-white" :
                    estadoEfectivo === "no_entregado" ? "bg-red-500 text-white" :
                    isLlegando ? "bg-indigo-500 text-white" :
                    "bg-blue-500 text-white"
                  }`}
                >
                  {p.orden}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-800 text-sm">{p.pedido.clienteNombre}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      estadoEfectivo === "entregado" ? "bg-green-100 text-green-700" :
                      estadoEfectivo === "no_entregado" ? "bg-red-100 text-red-700" :
                      isLlegando ? "bg-indigo-100 text-indigo-700" :
                      isEnCamino ? "bg-blue-100 text-blue-700" :
                      "bg-orange-100 text-orange-700"
                    }`}>
                      {estadoEfectivo === "entregado" ? "Entregado" :
                       estadoEfectivo === "no_entregado" ? "No entregado" :
                       isLlegando ? "Llegando" :
                       isEnCamino ? "En camino" : "Pendiente"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.pedido.clienteUbicacion || "Dirección por confirmar"}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {p.distanciaDesdeAnteriorKm && <span>{mostrarDistancia(parseFloat(p.distanciaDesdeAnteriorKm))}</span>}
                    {p.horaEstimadaLlegada && <span>llega ~{p.horaEstimadaLlegada}</span>}
                    <span className="font-medium text-gray-600">{moneda}{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Navigate + Call */}
              <div className="flex items-center gap-2 mt-3">
                {mapUrl && (
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-8 text-xs" data-testid={`button-navegar-${p.id}`}>
                      <Navigation size={13} className="mr-1" /> Abrir mapa
                    </Button>
                  </a>
                )}
                <a href={`tel:${p.pedido.clienteWhatsapp}`}>
                  <Button size="sm" variant="outline" className="h-8 text-xs" data-testid={`button-llamar-${p.id}`}>
                    <Phone size={13} className="mr-1" /> Llamar
                  </Button>
                </a>
              </div>

              {/* Action buttons — same set as Pedidos Asignados */}
              {isPending && (
                <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
                  <Button
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-5 rounded-xl text-base"
                    onClick={() => {
                      marcarParada.mutate({ paradaId: p.id, estado: "entregado" });
                      onUpdateEstado?.(p.pedidoId, "entregado");
                    }}
                    disabled={marcarParada.isPending}
                    data-testid={`button-entregado-${p.id}`}
                  >
                    <CheckCircle2 size={16} className="mr-2" /> Marcar como entregado
                  </Button>
                  {isEnCamino && (
                    <Button
                      className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 rounded-xl text-sm"
                      onClick={() => onUpdateEstado?.(p.pedidoId, "llegando")}
                      disabled={marcarParada.isPending}
                      data-testid={`button-llegando-${p.id}`}
                    >
                      🏠 Ya estoy llegando
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {!isEnCamino && !isLlegando && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl py-4 font-semibold"
                        onClick={() => onUpdateEstado?.(p.pedidoId, "en_camino")}
                        disabled={marcarParada.isPending}
                        data-testid={`button-en-camino-${p.id}`}
                      >
                        <Navigation size={14} className="mr-1.5" /> En camino
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={`text-orange-600 border-orange-200 hover:bg-orange-50 rounded-xl py-4 font-semibold ${(isEnCamino || isLlegando) ? "col-span-2" : ""}`}
                      onClick={() => onAbrirRetorno?.(p.pedidoId)}
                      disabled={marcarParada.isPending}
                      data-testid={`button-retorno-${p.id}`}
                    >
                      <RotateCcw size={14} className="mr-1.5" /> Retorno
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-red-400 border-red-100 hover:bg-red-50 rounded-xl py-3 text-xs"
                    onClick={() => {
                      marcarParada.mutate({ paradaId: p.id, estado: "no_entregado", motivo: "Cancelado" });
                      onUpdateEstado?.(p.pedidoId, "cancelado");
                    }}
                    disabled={marcarParada.isPending}
                    data-testid={`button-cancelar-${p.id}`}
                  >
                    <XCircle size={13} className="mr-1.5" /> Cancelar pedido
                  </Button>
                </div>
              )}
              {estadoEfectivo === "entregado" && (
                <div className="mt-2 pt-2 border-t border-green-100 flex items-center gap-1 text-xs font-medium text-green-600">
                  <CheckCircle2 size={13} /> Entregado
                </div>
              )}
              {estadoEfectivo === "no_entregado" && (
                <div className="mt-2 pt-2 border-t border-red-100 text-xs font-medium text-red-600">
                  ✗ {p.motivoNoEntregado || (estadoPedido === "retorno" ? "Retorno" : estadoPedido === "cancelado" ? "Cancelado" : "No entregado")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {motivoModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMotivoModal(null)}>
          <div className="bg-white rounded-xl p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium text-gray-800 mb-2">¿Por qué no se pudo entregar?</p>
            <Label className="text-xs text-gray-500">Motivo</Label>
            <Input
              value={motivoTexto}
              onChange={(e) => setMotivoTexto(e.target.value)}
              placeholder="Ej: Cliente no contestó"
              className="mb-3"
              data-testid="input-motivo-no-entregado"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMotivoModal(null)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() =>
                  marcarParada.mutate({ paradaId: motivoModal.paradaId, estado: "no_entregado", motivo: motivoTexto || "Sin especificar" })
                }
                disabled={marcarParada.isPending}
                data-testid="button-confirmar-no-entregado"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
