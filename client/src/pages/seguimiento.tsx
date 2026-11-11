import { useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Clock, Truck, Store, AlertTriangle, RefreshCw } from "lucide-react";
import { businessTheme } from "@/lib/temaNegocio";
import { formatearDuracionMinutos } from "@/lib/formatDuration";

interface EtaInfo {
  distanciaKm: number;
  minutosEstimados: number;
  horaEstimadaLlegada: string;
}

interface SeguimientoData {
  pedidoId: number;
  clienteNombre: string;
  estado: string;
  tipoEntrega: "delivery" | "pickup";
  delivery: {
    nombre: string;
    lat: number | null;
    lon: number | null;
    ultimaUbicacionAt: string | null;
  } | null;
  destino: {
    lat: number | null;
    lon: number | null;
    direccion: string | null;
  };
  eta: EtaInfo | null;
  colorPrimario?: string | null;
}

function tiempoDesde(fecha: string | null): string {
  if (!fecha) return "sin datos";
  const seg = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000);
  if (seg < 60) return `hace ${seg}s`;
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  return `hace ${Math.floor(seg / 3600)} h`;
}

export function ubicacionDesactualizada(fecha: string | null): boolean {
  if (!fecha) return false;
  const timestamp = new Date(fecha).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp > 20 * 60 * 1000;
}

const ESTADOS: Record<string, { label: string; color: string }> = {
  pendiente_confirmacion: { label: "Esperando confirmación del negocio", color: "text-yellow-600" },
  pendiente: { label: "Confirmado", color: "text-blue-600" },
  en_preparacion: { label: "En preparación", color: "text-blue-600" },
  listo: { label: "Listo para despacho", color: "text-purple-600" },
  en_camino: { label: "En camino 🛵", color: "text-green-600" },
  llegando: { label: "¡Llegando a tu puerta!", color: "text-green-700" },
  entregado: { label: "Entregado ✓", color: "text-green-700" },
  cancelado: { label: "Cancelado", color: "text-red-500" },
  retorno: { label: "Pedido devuelto", color: "text-orange-500" },
};

export default function SeguimientoPage() {
  const [, params] = useRoute("/seguimiento/:pedidoId");
  const pedidoId = params?.pedidoId ? parseInt(params.pedidoId) : null;
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destinoMarkerRef = useRef<any>(null);
  const lineaRef = useRef<any>(null);

  const { data, isLoading, error, dataUpdatedAt } = useQuery<SeguimientoData>({
    queryKey: ["seguimiento", pedidoId],
    queryFn: async () => {
      const res = await fetch(`/api/seguimiento/${pedidoId}`);
      if (!res.ok) throw new Error("No se pudo obtener el seguimiento");
      return res.json();
    },
    enabled: !!pedidoId,
    refetchInterval: (query) => {
      // Stop polling once the order reaches a terminal state
      const estado = (query.state.data as SeguimientoData | undefined)?.estado;
      if (estado === "entregado" || estado === "cancelado" || estado === "retorno") return false;
      return 15_000; // 15 seconds
    },
    refetchIntervalInBackground: true, // keep polling even when tab is backgrounded (mobile)
  });

  // Init Leaflet map once
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    import("leaflet").then((L) => {
      import("leaflet/dist/leaflet.css");
      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
      L.control.attribution({ prefix: '© <a href="https://www.openstreetmap.org">OSM</a>' }).addTo(map);
      map.setView([18.5, -69.9], 13);
      leafletMapRef.current = map;
    });
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !data) return;

    import("leaflet").then((L) => {
      const driverPos = data.delivery?.lat && data.delivery?.lon
        ? [data.delivery.lat, data.delivery.lon] as [number, number]
        : null;
      const destinoPos = data.destino?.lat && data.destino?.lon
        ? [data.destino.lat, data.destino.lon] as [number, number]
        : null;

      const iconMoto = L.divIcon({
        html: `<div style="width:38px;height:38px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>`,
        className: "",
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });
      const iconDestino = L.divIcon({
        html: `<div style="width:36px;height:36px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:18px;">📍</div>`,
        className: "",
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      // Driver marker
      if (driverPos) {
        if (driverMarkerRef.current) {
          driverMarkerRef.current.setLatLng(driverPos);
        } else {
          driverMarkerRef.current = L.marker(driverPos, { icon: iconMoto })
            .addTo(map)
            .bindPopup(`<b>🛵 ${data.delivery?.nombre ?? "Repartidor"}</b>`);
        }
      }

      // Destination marker
      if (destinoPos) {
        if (destinoMarkerRef.current) {
          destinoMarkerRef.current.setLatLng(destinoPos);
        } else {
          destinoMarkerRef.current = L.marker(destinoPos, { icon: iconDestino })
            .addTo(map)
            .bindPopup(`<b>📍 Tu dirección</b>`);
        }
      }

      // Route line
      if (driverPos && destinoPos) {
        if (lineaRef.current) map.removeLayer(lineaRef.current);
        lineaRef.current = L.polyline([driverPos, destinoPos], {
          color: "#22c55e",
          weight: 3,
          dashArray: "8 6",
          opacity: 0.8,
        }).addTo(map);
        map.fitBounds(L.latLngBounds([driverPos, destinoPos]), { padding: [60, 60] });
      } else if (driverPos) {
        map.setView(driverPos, 14);
      } else if (destinoPos) {
        map.setView(destinoPos, 14);
      }
    });
  }, [data, dataUpdatedAt]);

  if (!pedidoId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center text-gray-400">
          <AlertTriangle size={40} className="mx-auto mb-3" />
          <p>Enlace de seguimiento inválido</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-green-500" size={36} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center text-gray-400">
          <AlertTriangle size={40} className="mx-auto mb-3 text-red-400" />
          <p className="font-medium text-gray-600">No se encontró el pedido</p>
          <p className="text-sm mt-1">Verifica el enlace o contacta al negocio</p>
        </div>
      </div>
    );
  }

  const estadoBase = ESTADOS[data.estado] ?? { label: data.estado, color: "text-gray-600" };
  const estado = data.estado === "listo" && data.tipoEntrega === "pickup"
    ? { ...estadoBase, label: "Listo para recoger" }
    : estadoBase;
  const entregado = data.estado === "entregado" || data.estado === "cancelado" || data.estado === "retorno";
  const esPickup = data.tipoEntrega === "pickup";
  const tieneUbicacion = !!data.delivery?.lat && !!data.delivery?.lon;
  const gpsDesactualizado = ubicacionDesactualizada(data.delivery?.ultimaUbicacionAt ?? null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" style={businessTheme(data.colorPrimario)}>
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 pt-10 pb-6">
        <div className="flex items-center gap-3 mb-1">
          {esPickup ? <Store size={22} /> : <Truck size={22} />}
          <span className="text-lg font-bold">Seguimiento de pedido</span>
        </div>
        <p className="text-green-100 text-sm">#{data.pedidoId} · {data.clienteNombre}</p>
      </div>

      {entregado && (
        <div className="mx-4 -mt-4 bg-white rounded-2xl shadow-lg p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center shrink-0 text-3xl">✅</div>
          <div>
            <p className="font-bold text-gray-900 text-lg">{estado.label}</p>
            <p className="text-sm text-gray-400">Pedido #{data.pedidoId}</p>
          </div>
        </div>
      )}

      {gpsDesactualizado && !esPickup && !entregado && (
        <div className="mx-4 mt-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-2.5 text-orange-800" role="alert" data-testid="seguimiento-alerta-gps-desactualizado">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-orange-500" />
          <div>
            <p className="text-sm font-semibold">Ubicación desactualizada — el repartidor puede no tener señal</p>
            <p className="text-xs mt-0.5">La ETA es un estimado aproximado.</p>
          </div>
        </div>
      )}

      {/* ETA card */}
      {!esPickup && !entregado && data.eta && (
        <div className={`mx-4 ${gpsDesactualizado ? "mt-3" : "-mt-4"} bg-white rounded-2xl shadow-lg p-5 flex items-center gap-4`} data-testid="seguimiento-eta">
          <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <Clock size={28} className="text-green-600" />
          </div>
          <div className="flex-1">
            <p className="text-2xl font-bold text-gray-900">~{formatearDuracionMinutos(data.eta.minutosEstimados)}</p>
            <p className="text-sm text-gray-500">{gpsDesactualizado ? "Estimado aproximado · " : "Llega aprox. a las "}<span className="font-semibold text-gray-700">{data.eta.horaEstimadaLlegada}</span></p>
            <p className="text-xs text-gray-400 mt-0.5">{data.eta.distanciaKm} km de distancia</p>
          </div>
        </div>
      )}

      {esPickup ? (
        <div className="mx-4 mt-4 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900">
          <div className="flex gap-3">
            <Store className="shrink-0 text-green-600" size={24} />
            <div>
              <p className="font-semibold">Recoger en el negocio</p>
              <p className="mt-1 text-sm text-green-800">{data.destino.direccion || "El negocio te confirmará el punto de recogida."}</p>
            </div>
          </div>
        </div>
      ) : (
      <div className="mx-4 mt-4 rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 320 }}>
        {!tieneUbicacion && !entregado ? (
          <div className="h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 gap-2">
            <MapPin size={32} className="opacity-50" />
            <p className="text-sm">El repartidor aún no ha compartido su ubicación</p>
          </div>
        ) : (
          <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
        )}
      </div>
      )}

      {/* Status + driver */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Estado</span>
          <span className={`text-sm font-semibold ${estado.color}`}>{estado.label}</span>
        </div>
        {esPickup ? (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Modalidad</span>
            <span className="text-sm font-semibold text-green-700">🏪 Pickup</span>
          </div>
        ) : data.delivery && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Repartidor</span>
            <span className="text-sm font-semibold text-gray-700">🛵 {data.delivery.nombre}</span>
          </div>
        )}
        {data.delivery?.ultimaUbicacionAt && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Última ubicación</span>
            <span className={`text-xs ${gpsDesactualizado ? "text-orange-600 font-semibold" : "text-gray-500"}`}>
              {tiempoDesde(data.delivery.ultimaUbicacionAt)}
            </span>
          </div>
        )}
      </div>

      {/* Auto-refresh note */}
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-4 mb-8">
        <RefreshCw size={11} />
        Se actualiza cada 15 segundos automáticamente
      </div>
    </div>
  );
}
