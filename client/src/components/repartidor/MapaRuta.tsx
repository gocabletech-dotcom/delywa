import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const COLOR_PENDIENTE = "#3b82f6";
const COLOR_ENTREGADO = "#22c55e";
const COLOR_NO_ENTREGADO = "#ef4444";
const COLOR_INICIO = "#1e40af";

function crearIconoParada(numero: number, color: string): L.DivIcon {
  const html = `
    <div style="position:relative;">
      <svg width="36" height="46" viewBox="0 0 40 50" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));">
        <path d="M20 0C11.716 0 5 6.716 5 15c0 8.284 15 35 15 35s15-26.716 15-35c0-8.284-6.716-15-15-15z" fill="${color}"/>
        <circle cx="20" cy="15" r="8" fill="white"/>
        <text x="20" y="20" text-anchor="middle" font-size="13" font-weight="bold" fill="${color}">${numero}</text>
      </svg>
    </div>`;
  return L.divIcon({ html, className: "parada-marker", iconSize: [36, 46], iconAnchor: [18, 46] });
}

function crearIconoInicio(): L.DivIcon {
  const html = `
    <div style="position:relative;">
      <svg width="36" height="46" viewBox="0 0 40 50" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));">
        <path d="M20 0C11.716 0 5 6.716 5 15c0 8.284 15 35 15 35s15-26.716 15-35c0-8.284-6.716-15-15-15z" fill="${COLOR_INICIO}"/>
        <circle cx="20" cy="15" r="8" fill="white"/>
        <text x="20" y="20" text-anchor="middle" font-size="13" font-weight="bold" fill="${COLOR_INICIO}">🏪</text>
      </svg>
    </div>`;
  return L.divIcon({ html, className: "inicio-marker", iconSize: [36, 46], iconAnchor: [18, 46] });
}

export interface ParadaMapa {
  id: number;
  orden: number;
  lat: number;
  lon: number;
  clienteNombre: string;
  direccion: string;
  estado: "pendiente" | "entregado" | "no_entregado";
}

interface MapaRutaProps {
  inicio: { lat: number; lon: number };
  paradas: ParadaMapa[];
  height?: string;
}

function AjustarVista({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView(puntos[0], 15);
    } else {
      map.fitBounds(L.latLngBounds(puntos), { padding: [40, 40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos.length]);
  return null;
}

export default function MapaRuta({ inicio, paradas, height = "320px" }: MapaRutaProps) {
  const colorPorEstado = (estado: ParadaMapa["estado"]) =>
    estado === "entregado" ? COLOR_ENTREGADO : estado === "no_entregado" ? COLOR_NO_ENTREGADO : COLOR_PENDIENTE;

  const puntosRuta: [number, number][] = useMemo(() => {
    return [[inicio.lat, inicio.lon], ...paradas.map((p): [number, number] => [p.lat, p.lon])];
  }, [inicio, paradas]);

  const todosLosPuntos: [number, number][] = useMemo(
    () => [[inicio.lat, inicio.lon], ...paradas.map((p): [number, number] => [p.lat, p.lon])],
    [inicio, paradas]
  );

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height }} data-testid="mapa-ruta">
      <MapContainer center={[inicio.lat, inicio.lon]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[inicio.lat, inicio.lon]} icon={crearIconoInicio()}>
          <Popup><strong>Salida del colmado</strong></Popup>
        </Marker>

        {paradas.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lon]} icon={crearIconoParada(p.orden, colorPorEstado(p.estado))}>
            <Popup>
              <strong>Parada {p.orden}: {p.clienteNombre}</strong>
              <br />{p.direccion}
              {p.estado === "entregado" && <div style={{ color: COLOR_ENTREGADO, fontWeight: 600, marginTop: 4 }}>✓ Entregado</div>}
              {p.estado === "no_entregado" && <div style={{ color: COLOR_NO_ENTREGADO, fontWeight: 600, marginTop: 4 }}>✗ No entregado</div>}
            </Popup>
          </Marker>
        ))}

        {puntosRuta.length > 1 && (
          <Polyline positions={puntosRuta} pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.75 }} />
        )}

        <AjustarVista puntos={todosLosPuntos} />
      </MapContainer>
    </div>
  );
}
