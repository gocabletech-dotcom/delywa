type MapCoordinates = {
  latitud?: string | number | null;
  longitud?: string | number | null;
};

export function buildMapUrl(ubicacion: string, coordinates?: MapCoordinates): string {
  const latitude = Number(coordinates?.latitud);
  const longitude = Number(coordinates?.longitud);
  if (
    coordinates?.latitud !== null
    && coordinates?.latitud !== undefined
    && coordinates?.longitud !== null
    && coordinates?.longitud !== undefined
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180
  ) {
    return `https://maps.google.com/?q=${latitude},${longitude}`;
  }

  const trimmed = (ubicacion || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (coordMatch) return `https://maps.google.com/?q=${coordMatch[1]},${coordMatch[2]}`;
  return `https://maps.google.com/search?q=${encodeURIComponent(trimmed)}`;
}
