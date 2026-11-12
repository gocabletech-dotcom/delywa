export type DeliveryAddressSource = {
  direccionTexto?: string | null;
  latitud?: string | number | null;
  longitud?: string | number | null;
};

export type DeliveryAddressInput = {
  pedidoUbicacion?: string | null;
  pedidoLatitud?: string | number | null;
  pedidoLongitud?: string | number | null;
  conversacion?: DeliveryAddressSource | null;
  cliente?: DeliveryAddressSource | null;
};

export type ResolvedDeliveryAddress = {
  direccion: string;
  latitud: string | null;
  longitud: string | null;
};

function cleanAddress(value?: string | null): string {
  return value?.trim() ?? "";
}

function isMapLink(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Legacy orders can retain just "ZIP Code: 12345" after a customer reuses a
 * saved address. Those values are useful as a postal reference, but are not
 * enough to navigate to the customer's door.
 */
export function needsSavedAddress(value?: string | null): boolean {
  const address = cleanAddress(value);
  if (!address || isMapLink(address)) return true;

  const zipOnly = /^(?:(?:zip(?:\s*code)?|c[oó]digo\s+postal)\s*[:#-]?\s*)?[A-Z0-9]{3,10}(?:-[A-Z0-9]{2,6})?$/i;
  return zipOnly.test(address);
}

function hasUsableCoordinates(source?: DeliveryAddressSource | null): source is DeliveryAddressSource & {
  latitud: string | number;
  longitud: string | number;
} {
  if (source?.latitud === null || source?.latitud === undefined || source?.longitud === null || source?.longitud === undefined) {
    return false;
  }

  const latitude = Number(source.latitud);
  const longitude = Number(source.longitud);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180;
}

function addressDetailScore(address: string): number {
  const segments = address.split(/[,\n;]/).filter(Boolean).length;
  const hasStreetNumber = /\d/.test(address) ? 2 : 0;
  const hasPostalLabel = /zip|c[oó]digo\s+postal/i.test(address) ? 1 : 0;
  return address.length + segments * 16 + hasStreetNumber + hasPostalLabel;
}

/**
 * Keeps a real delivery address written on the order. When an old order only
 * has a ZIP code, fall back to the most detailed address stored for that exact
 * customer in the conversation or permanent customer profile.
 */
export function resolveDeliveryAddress(input: DeliveryAddressInput): ResolvedDeliveryAddress {
  const orderAddress = cleanAddress(input.pedidoUbicacion);
  const savedAddresses = [input.conversacion?.direccionTexto, input.cliente?.direccionTexto]
    .map(cleanAddress)
    .filter((address) => address && !needsSavedAddress(address))
    .sort((left, right) => addressDetailScore(right) - addressDetailScore(left));

  const direccion = needsSavedAddress(orderAddress)
    ? (savedAddresses[0] || orderAddress)
    : orderAddress;

  const coordinateSources: DeliveryAddressSource[] = [
    { latitud: input.pedidoLatitud, longitud: input.pedidoLongitud },
    input.conversacion ?? {},
    input.cliente ?? {},
  ];
  const coordinates = coordinateSources.find(hasUsableCoordinates);

  return {
    direccion,
    latitud: coordinates ? String(coordinates.latitud) : null,
    longitud: coordinates ? String(coordinates.longitud) : null,
  };
}