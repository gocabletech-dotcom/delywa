import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// «Mis pedidos» → mapa del delivery mientras el pedido va en camino (mejora 10). Se actualiza cada 15 s.

type Datos = {
  visible: boolean; estado?: string;
  delivery?: { nombre: string; lat: number | null; lon: number | null; actualizado: string | null };
  destino?: { lat: number | null; lon: number | null }; colmado?: { lat: number | null; lon: number | null };
};

const icono = (emoji: string, fondo: string) => L.divIcon({
  className: "", iconSize: [38, 38], iconAnchor: [19, 19],
  html: `<div style="width:38px;height:38px;border-radius:50%;background:${fondo};display:grid;place-items:center;font-size:20px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">${emoji}</div>`,
});

function Encuadre({ puntos }: { puntos: Array<[number, number]> }) {
  const mapa = useMap();
  const clave = puntos.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (puntos.length === 1) mapa.setView(puntos[0], 16);
    else if (puntos.length > 1) mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 16 });
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapaDelivery({ sessionId, pedidoId }: { sessionId: string; pedidoId: number }) {
  const [d, setD] = useState<Datos | null>(null);
  useEffect(() => {
    let vivo = true;
    const cargar = () => fetch(`/api/chat-colmado/sesion/${sessionId}/pedidos/${pedidoId}/delivery`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo) setD(j); }).catch(() => undefined);
    cargar();
    const t = setInterval(cargar, 15_000);
    return () => { vivo = false; clearInterval(t); };
  }, [sessionId, pedidoId]);
  if (!d?.visible) return null;
  const moto = d.delivery?.lat != null && d.delivery?.lon != null ? [d.delivery.lat, d.delivery.lon] as [number, number] : null;
  const casa = d.destino?.lat != null && d.destino?.lon != null ? [d.destino.lat, d.destino.lon] as [number, number] : null;
  const tienda = d.colmado?.lat != null && d.colmado?.lon != null ? [d.colmado.lat, d.colmado.lon] as [number, number] : null;
  const puntos = [moto, casa].filter(Boolean) as Array<[number, number]>;
  if (!puntos.length && tienda) puntos.push(tienda);
  const hace = d.delivery?.actualizado ? Math.max(0, Math.round((Date.now() - new Date(d.delivery.actualizado).getTime()) / 60000)) : null;
  return (
    <section className="rounded-xl bg-white overflow-hidden" data-testid="mapa-delivery">
      <div className="px-4 py-3">
        <p className="text-[16px] font-semibold text-[#1C1C1E]">🛵 {d.delivery?.nombre ?? "El delivery"} {d.estado === "llegando" ? "está llegando" : "va para allá"}</p>
        <p className="text-[13px] text-[#6B6B70]">{moto ? `Ubicación de hace ${hace === 0 ? "menos de 1" : hace} min · se actualiza sola` : "Todavía no vemos su ubicación. Aparece cuando la comparta."}</p>
      </div>
      {puntos.length > 0 && (
        <div style={{ height: 240 }}>
          <MapContainer center={puntos[0]} zoom={15} style={{ height: "100%", width: "100%" }} zoomControl={false} attributionControl={true}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {moto && <Marker position={moto} icon={icono("🛵", "#0B57D0")} />}
            {casa && <Marker position={casa} icon={icono("🏠", "#17804F")} />}
            {!moto && !casa && tienda && <Marker position={tienda} icon={icono("🏪", "#F59E0B")} />}
            <Encuadre puntos={puntos} />
          </MapContainer>
        </div>
      )}
    </section>
  );
}
