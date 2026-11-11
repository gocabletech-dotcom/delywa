import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, Truck, Clock, MapPin, Share2, Clipboard } from "lucide-react";
import { formatearDuracionMinutos } from "@/lib/formatDuration";

const COLORES_DELIVERY = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#ec4899", "#06b6d4", "#eab308", "#ef4444"];

interface EtaInfo {
  distanciaKm: number;
  minutosEstimados: number;
  horaEstimadaLlegada: string;
  fuente?: "vial" | "gps";
  trafico?: boolean;
}

interface PedidoPendiente {
  id: number;
  clienteNombre: string;
  clienteUbicacion: string | null;
  clienteLatitud: string | null;
  clienteLongitud: string | null;
  estado: string;
  eta: EtaInfo | null;
}

interface ParadaConPedido {
  id: number;
  orden: number;
  estado: "pendiente" | "entregado" | "no_entregado";
  horaEstimadaLlegada?: string | null;
  pedido: { clienteNombre: string; clienteUbicacion: string };
}

interface DeliveryConUbicacion {
  id: number;
  nombre: string;
  estado: string;
  ultimaLatitud: string | null;
  ultimaLongitud: string | null;
  ultimaUbicacionAt: string | null;
  paradasPendientes: number;
  paradasTotal: number;
  paradas: ParadaConPedido[];
  pedidosPendientes: PedidoPendiente[];
  ruta?: { fuenteDistancias?: "vial" | "gps"; trafico?: boolean } | null;
}

function extraerCoords(ubicacion: string): { lat: number; lon: number } | null {
  const match = ubicacion?.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
}

export function crearIconoMoto(color: string, desactualizado = false): L.DivIcon {
  const badge = desactualizado
    ? `<span style="position:absolute;right:-7px;top:-7px;width:18px;height:18px;border-radius:50%;background:#f97316;border:2px solid white;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;line-height:1;">!</span>`
    : "";
  const html = `<div style="position:relative;width:34px;height:34px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵${badge}</div>`;
  return L.divIcon({ html, className: "delivery-marker", iconSize: [34, 34], iconAnchor: [17, 17] });
}

function crearIconoColmado(): L.DivIcon {
  const html = `<div style="width:36px;height:36px;border-radius:50%;background:#1e40af;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:18px;">🏪</div>`;
  return L.divIcon({ html, className: "colmado-marker", iconSize: [36, 36], iconAnchor: [18, 18] });
}

function crearIconoPedido(color: string): L.DivIcon {
  const html = `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:13px;opacity:0.85;">📦</div>`;
  return L.divIcon({ html, className: "pedido-marker", iconSize: [26, 26], iconAnchor: [13, 13] });
}

function AjustarVista({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) map.setView(puntos[0], 14);
    else map.fitBounds(L.latLngBounds(puntos), { padding: [50, 50] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos.length]);
  return null;
}

function tiempoDesde(fecha: string | null): string {
  if (!fecha) return "sin datos";
  const seg = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000);
  if (seg < 60) return `hace ${seg}s`;
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  return `hace ${Math.floor(seg / 3600)} h`;
}

function AvisoEtaGpsDesactualizado({ fecha }: { fecha: string | null }) {
  if (!ubicacionDesactualizada(fecha)) return null;

  return (
    <>
      <br />
      <span style={{ color: "#c2410c", fontSize: 11, fontWeight: 600 }}>
        ⚠️ ETA aproximada · GPS desactualizado
      </span>
    </>
  );
}

export function ubicacionDesactualizada(fecha: string | null): boolean {
  if (!fecha) return false;
  const timestamp = new Date(fecha).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp > 20 * 60 * 1000;
}

function copiarLinkSeguimiento(pedidoId: number) {
  const url = `${window.location.origin}/seguimiento/${pedidoId}`;
  navigator.clipboard.writeText(url);
}

async function compartirLinkSeguimiento(pedidoId: number) {
  const url = `${window.location.origin}/seguimiento/${pedidoId}`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: `Seguimiento del pedido #${pedidoId}`,
        text: "Consulta el estado de tu pedido",
        url,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    return;
  }
  await copiarLinkSeguimiento(pedidoId);
}

export default function MapaFlotaTab({
  colmadoId,
  colmadoLat,
  colmadoLon,
}: {
  colmadoId: number;
  colmadoLat: number | null;
  colmadoLon: number | null;
}) {
  const { data: deliveries, isLoading } = useQuery<DeliveryConUbicacion[]>({
    queryKey: ["deliveries-ubicaciones", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/deliveries/ubicaciones`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar ubicaciones");
      return res.json();
    },
    enabled: !!colmadoId,
    refetchInterval: 120_000, // 2 minutos
  });

  const activosConUbicacion = (deliveries || []).filter(
    (d) => d.estado === "activo" && d.ultimaLatitud && d.ultimaLongitud
  );

  // All pending pedidos across all active deliveries (for ETA cards)
  const pedidosConEta = activosConUbicacion.flatMap((d) =>
    (d.pedidosPendientes || []).filter((p) => p.eta !== null).map((p) => ({
      ...p,
      deliveryNombre: d.nombre,
      deliveryColor: COLORES_DELIVERY[activosConUbicacion.indexOf(d) % COLORES_DELIVERY.length],
      gpsDesactualizado: ubicacionDesactualizada(d.ultimaUbicacionAt),
    }))
  );

  const puntosParaAjustar: [number, number][] = useMemo(() => {
    const pts: [number, number][] = [];
    if (colmadoLat && colmadoLon) pts.push([colmadoLat, colmadoLon]);
    activosConUbicacion.forEach((d) => pts.push([parseFloat(d.ultimaLatitud!), parseFloat(d.ultimaLongitud!)]));
    return pts;
  }, [activosConUbicacion, colmadoLat, colmadoLon]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!colmadoLat || !colmadoLon) {
    return (
      <div className="text-center py-14 text-gray-400">
        <Truck size={44} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">Configura la ubicación GPS de tu negocio en el perfil para ver el mapa de flota</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-800">{activosConUbicacion.length}</span> repartidor(es) en el mapa
        </p>
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> actualiza cada 2 min
        </span>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: "400px" }} data-testid="mapa-flota">
        <MapContainer center={[colmadoLat, colmadoLon]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Colmado */}
          <Marker position={[colmadoLat, colmadoLon]} icon={crearIconoColmado()}>
            <Popup><strong>Tu negocio</strong></Popup>
          </Marker>

          {activosConUbicacion.map((d, i) => {
            const color = COLORES_DELIVERY[i % COLORES_DELIVERY.length];
            const pos: [number, number] = [parseFloat(d.ultimaLatitud!), parseFloat(d.ultimaLongitud!)];

            // Build route line: driver → pending paradas (optimized) OR pending pedidos
            const lineaRuta: [number, number][] = [pos];
            const paradasPend = d.paradas.filter((p) => p.estado === "pendiente");
            for (const p of paradasPend) {
              const c = extraerCoords(p.pedido.clienteUbicacion);
              if (c) lineaRuta.push([c.lat, c.lon]);
            }
            // If no optimized route, use direct pedidos
            if (paradasPend.length === 0) {
              for (const p of (d.pedidosPendientes || [])) {
                const lat = p.clienteLatitud ? parseFloat(p.clienteLatitud) : null;
                const lon = p.clienteLongitud ? parseFloat(p.clienteLongitud) : null;
                if (lat && lon) lineaRuta.push([lat, lon]);
                else if (p.clienteUbicacion) {
                  const c = extraerCoords(p.clienteUbicacion);
                  if (c) lineaRuta.push([c.lat, c.lon]);
                }
              }
            }

            return (
              <div key={d.id}>
                {/* Driver marker */}
                <Marker position={pos} icon={crearIconoMoto(color, ubicacionDesactualizada(d.ultimaUbicacionAt))}>
                  <Popup>
                    <strong>🛵 {d.nombre}</strong><br />
                    {d.paradasTotal > 0
                      ? `${d.paradasTotal - d.paradasPendientes}/${d.paradasTotal} entregas completadas`
                      : (d.pedidosPendientes?.length ?? 0) > 0
                        ? `${d.pedidosPendientes.length} pedido(s) pendiente(s)`
                        : "Sin pedidos activos"}
                    <br />
                    {ubicacionDesactualizada(d.ultimaUbicacionAt) && (
                      <span style={{ color: "#c2410c", fontSize: 11, fontWeight: 600 }}>
                        ⚠️ Ubicación desactualizada
                        <br />
                      </span>
                    )}
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>
                      GPS {tiempoDesde(d.ultimaUbicacionAt)}
                    </span>
                  </Popup>
                </Marker>

                {/* Destination markers */}
                {(d.pedidosPendientes || []).map((p) => {
                  const lat = p.clienteLatitud ? parseFloat(p.clienteLatitud) : null;
                  const lon = p.clienteLongitud ? parseFloat(p.clienteLongitud) : null;
                  if (!lat || !lon) {
                    const c = extraerCoords(p.clienteUbicacion || "");
                    if (!c) return null;
                    return (
                      <Marker key={p.id} position={[c.lat, c.lon]} icon={crearIconoPedido(color)}>
                        <Popup>
                          <strong>📦 #{p.id} {p.clienteNombre}</strong><br />
                          {p.eta ? `~${formatearDuracionMinutos(p.eta.minutosEstimados)} · llega ${p.eta.horaEstimadaLlegada} · ${p.eta.fuente === "vial" ? (p.eta.trafico ? "vial con tráfico" : "vial sin tráfico") : "aprox. GPS"}` : "Sin ETA"}
                          <AvisoEtaGpsDesactualizado fecha={d.ultimaUbicacionAt} />
                        </Popup>
                      </Marker>
                    );
                  }
                  return (
                    <Marker key={p.id} position={[lat, lon]} icon={crearIconoPedido(color)}>
                      <Popup>
                        <strong>📦 #{p.id} {p.clienteNombre}</strong><br />
                          {p.eta ? `~${formatearDuracionMinutos(p.eta.minutosEstimados)} · llega ${p.eta.horaEstimadaLlegada} · ${p.eta.fuente === "vial" ? (p.eta.trafico ? "vial con tráfico" : "vial sin tráfico") : "aprox. GPS"}` : "Sin ETA"}
                        <AvisoEtaGpsDesactualizado fecha={d.ultimaUbicacionAt} />
                      </Popup>
                    </Marker>
                  );
                })}

                {lineaRuta.length > 1 && (
                  <Polyline positions={lineaRuta} pathOptions={{ color, weight: 3, opacity: 0.75, dashArray: "7 6" }} />
                )}
              </div>
            );
          })}

          <AjustarVista puntos={puntosParaAjustar} />
        </MapContainer>
      </div>

      {/* ETA Cards */}
      {pedidosConEta.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">ETAs en tiempo real</p>
          {pedidosConEta.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className="w-2 h-10 rounded-full shrink-0" style={{ background: p.deliveryColor }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  #{p.id} · {p.clienteNombre}
                </p>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <MapPin size={10} /> 🛵 {p.deliveryNombre}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-base font-bold flex items-center gap-1 justify-end ${p.gpsDesactualizado ? "text-orange-600" : "text-green-600"}`}>
                  <Clock size={14} /> ~{formatearDuracionMinutos(p.eta!.minutosEstimados)}
                </p>
                <p className="text-xs text-gray-400">
                  {p.gpsDesactualizado ? "Estimado aproximado · " : ""}
                  {p.eta!.horaEstimadaLlegada}
                  {" · "}{p.eta!.distanciaKm} km
                  {" · "}
                  {p.eta!.fuente === "vial" ? (p.eta!.trafico ? "Vial con tráfico" : "Vial sin tráfico") : "GPS aproximado"}
                </p>
                {p.gpsDesactualizado && (
                  <p className="mt-1 text-xs font-semibold text-orange-700" role="alert" data-testid={`alerta-gps-desactualizado-${p.id}`}>
                    ⚠️ Ubicación desactualizada
                  </p>
                )}
              </div>
              <button
                onClick={() => copiarLinkSeguimiento(p.id)}
                title="Copiar link de seguimiento para el cliente"
                aria-label="Copiar link de seguimiento para el cliente"
                data-testid={`copiar-seguimiento-${p.id}`}
                className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              >
                <Clipboard size={14} />
              </button>
              <button
                onClick={() => compartirLinkSeguimiento(p.id)}
                title="Compartir link de seguimiento"
                aria-label="Compartir link de seguimiento"
                data-testid={`compartir-seguimiento-nativo-${p.id}`}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
              >
                <Share2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {activosConUbicacion.length === 0 && (
        <div className="text-center py-6">
          <Truck size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">
            Ningún repartidor activo ha compartido su ubicación
          </p>
          <p className="text-xs text-gray-300 mt-1">
            El GPS se actualiza desde el portal del repartidor
          </p>
        </div>
      )}
    </div>
  );
}
