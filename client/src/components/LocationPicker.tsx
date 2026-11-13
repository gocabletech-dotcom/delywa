import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation } from "lucide-react";

import marcadorRetina from "leaflet/dist/images/marker-icon-2x.png";
import marcador from "leaflet/dist/images/marker-icon.png";
import sombraMarcador from "leaflet/dist/images/marker-shadow.png";

// Íconos del marcador incluidos en la app (antes venían de cdnjs).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: marcadorRetina, iconUrl: marcador, shadowUrl: sombraMarcador });

/**
 * El mapa puede crearse dentro de una sección oculta (Configuración monta todas y
 * muestra una). Leaflet mide 0 px y dibuja solo un pedazo: al cambiar de tamaño
 * o hacerse visible, se vuelve a medir y se centra en el punto.
 */
function AjustarTamano({ position }: { position: L.LatLng }) {
  const map = useMap();
  useEffect(() => {
    const contenedor = map.getContainer();
    let ancho = contenedor.clientWidth;
    let alto = contenedor.clientHeight;
    const observador = new ResizeObserver(() => {
      if (contenedor.clientWidth === ancho && contenedor.clientHeight === alto) return;
      ancho = contenedor.clientWidth;
      alto = contenedor.clientHeight;
      if (ancho > 0 && alto > 0) {
        map.invalidateSize();
        map.setView(position, map.getZoom(), { animate: false });
      }
    });
    observador.observe(contenedor);
    return () => observador.disconnect();
  }, [map, position]);
  return null;
}

interface LocationPickerProps {
  latitude: string;
  longitude: string;
  onLocationChange: (lat: string, lng: string) => void;
  /** Full address used to keep the map synchronized while the user types. */
  address?: string;
  countryCode?: string;
}

function DraggableMarker({ 
  position, 
  onPositionChange 
}: { 
  position: L.LatLng; 
  onPositionChange: (lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const { lat, lng } = marker.getLatLng();
        onPositionChange(lat, lng);
      }
    },
  };

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  );
}

function MapClickHandler({ 
  onLocationChange 
}: { 
  onLocationChange: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ position }: { position: L.LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom());
  }, [position, map]);
  return null;
}

export default function LocationPicker({ latitude, longitude, onLocationChange, address, countryCode }: LocationPickerProps) {
  const defaultLat = 18.4861;
  const defaultLng = -69.9312;
  
  const lat = latitude ? parseFloat(latitude) : defaultLat;
  const lng = longitude ? parseFloat(longitude) : defaultLng;
  
  const [position, setPosition] = useState<L.LatLng>(new L.LatLng(lat, lng));
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressSearchMessage, setAddressSearchMessage] = useState("");

  useEffect(() => {
    if (latitude && longitude) {
      const newLat = parseFloat(latitude);
      const newLng = parseFloat(longitude);
      if (!isNaN(newLat) && !isNaN(newLng)) {
        setPosition(new L.LatLng(newLat, newLng));
      }
    }
  }, [latitude, longitude]);

  // Geocode the typed address after a short pause so the map follows the form
  // without sending a request for every keystroke.
  useEffect(() => {
    const query = address?.trim();
    if (!query || query.length < 6) {
      setAddressSearchMessage("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearchingAddress(true);
      setAddressSearchMessage("");
      try {
        const params = new URLSearchParams({
          q: query,
          format: "jsonv2",
          limit: "1",
          addressdetails: "1",
        });
        if (countryCode) params.set("countrycodes", countryCode.toLowerCase());
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("geocoding failed");
        const results = await response.json() as Array<{ lat: string; lon: string }>;
        if (results[0]) {
          handlePositionChange(parseFloat(results[0].lat), parseFloat(results[0].lon));
          setAddressSearchMessage("Mapa actualizado según la dirección");
        } else {
          setAddressSearchMessage("No encontramos esa dirección; puedes marcar el punto manualmente.");
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setAddressSearchMessage("No se pudo ubicar la dirección; puedes marcar el punto manualmente.");
        }
      } finally {
        if (!controller.signal.aborted) setIsSearchingAddress(false);
      }
    }, 800);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, countryCode]);

  const handlePositionChange = (newLat: number, newLng: number) => {
    setPosition(new L.LatLng(newLat, newLng));
    onLocationChange(newLat.toFixed(6), newLng.toFixed(6));
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: newLat, longitude: newLng } = pos.coords;
        handlePositionChange(newLat, newLng);
        setIsLocating(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("No pudimos obtener tu ubicación. Intenta marcar manualmente en el mapa.");
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const hasLocation = latitude && longitude && latitude !== "" && longitude !== "";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          data-testid="button-get-location"
        >
          <Navigation className={`w-4 h-4 mr-2 ${isLocating ? 'animate-pulse' : ''}`} />
          {isLocating ? "Obteniendo..." : "Usar mi ubicación"}
        </Button>
        {hasLocation && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            Ubicación guardada
          </span>
        )}
      </div>
      
      <div className="relative rounded-lg overflow-hidden border border-gray-200" style={{ height: "250px" }}>
        <MapContainer
          center={position}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <DraggableMarker position={position} onPositionChange={handlePositionChange} />
          <MapClickHandler onLocationChange={handlePositionChange} />
          <RecenterMap position={position} />
          <AjustarTamano position={position} />
        </MapContainer>
      </div>
      
      <p className="text-xs text-gray-500">
        {isSearchingAddress ? "Buscando la dirección en el mapa..." : "Haz clic en el mapa o arrastra el marcador para seleccionar la ubicación exacta de tu negocio"}
      </p>
      {addressSearchMessage && <p className="text-xs text-blue-600" role="status">{addressSearchMessage}</p>}

      {hasLocation && (
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
          <div>
            <span className="font-medium">Latitud:</span> {latitude}
          </div>
          <div>
            <span className="font-medium">Longitud:</span> {longitude}
          </div>
        </div>
      )}
    </div>
  );
}
