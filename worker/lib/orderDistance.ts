import { calcularTrayectoEstimado, calcularTrayectoPorCarretera, type Trayecto } from "./routeOptimizer";

export type CoordinatePair = {
  latitud: number;
  longitud: number;
};

export type SucursalConCoordenadas = {
  id: number;
  nombre: string;
  latitud?: string | number | null;
  longitud?: string | number | null;
  radioEntrega?: string | number | null;
};

export type MetricaSucursalPedido = {
  sucursalId: number;
  nombreSucursal: string;
  esSucursalOrigen: boolean;
  esMasCercana: boolean;
  distanciaMillas: number;
  tiempoEstimadoMinutos: number;
  fuente: "ruta" | "gps";
};

export type MetricasDistanciaPedido = {
  estado: "disponible" | "pickup" | "ubicacion_cliente_incompleta" | "no_se_pudo_calcular" | "sucursales_sin_ubicacion" | "fuera_de_radio" | "ruta_no_disponible";
  sucursales: MetricaSucursalPedido[];
  sucursalesSinUbicacion: number;
  sucursalesFueraDeRadio: number;
};

type EntradaMetrica = MetricaSucursalPedido;

export function parseCoordinatePair(
  latitud?: string | number | null,
  longitud?: string | number | null,
): CoordinatePair | null {
  if (latitud === null || latitud === undefined || longitud === null || longitud === undefined) return null;
  if (String(latitud).trim() === "" || String(longitud).trim() === "") return null;
  const latitudNumero = Number(latitud);
  const longitudNumero = Number(longitud);
  if (!Number.isFinite(latitudNumero) || !Number.isFinite(longitudNumero)) return null;
  if (Math.abs(latitudNumero) > 90 || Math.abs(longitudNumero) > 180) return null;
  return { latitud: latitudNumero, longitud: longitudNumero };
}

export function calcularMetricasDistanciaPedido(input: {
  tipoEntrega?: string | null;
  sucursalOrigenId: number;
  destino: CoordinatePair | null;
  sucursales: SucursalConCoordenadas[];
}): MetricasDistanciaPedido {
  if (input.tipoEntrega === "pickup") {
    return { estado: "pickup", sucursales: [], sucursalesSinUbicacion: 0, sucursalesFueraDeRadio: 0 };
  }
  if (!input.destino) {
    return { estado: "ubicacion_cliente_incompleta", sucursales: [], sucursalesSinUbicacion: 0, sucursalesFueraDeRadio: 0 };
  }

  const sucursalesConMetricas = input.sucursales.flatMap((sucursal) => {
    const origen = parseCoordinatePair(sucursal.latitud, sucursal.longitud);
    if (!origen) return [];
    const trayecto = calcularTrayectoEstimado(
      origen.latitud,
      origen.longitud,
      input.destino!.latitud,
      input.destino!.longitud,
    );
    return [{
      sucursalId: sucursal.id,
      nombreSucursal: sucursal.nombre,
      esSucursalOrigen: sucursal.id === input.sucursalOrigenId,
      esMasCercana: false,
      distanciaMillas: trayecto.distanciaMillas,
      tiempoEstimadoMinutos: trayecto.minutosEstimados,
      fuente: "gps" as const,
    }];
  });

  if (!sucursalesConMetricas.length) {
    return {
      estado: "sucursales_sin_ubicacion",
      sucursales: [],
      sucursalesSinUbicacion: input.sucursales.filter((sucursal) => !parseCoordinatePair(sucursal.latitud, sucursal.longitud)).length,
      sucursalesFueraDeRadio: 0,
    };
  }

  const masCercana = sucursalesConMetricas.reduce((actual, candidata) =>
    candidata.distanciaMillas < actual.distanciaMillas ? candidata : actual
  );
  const sucursales: MetricaSucursalPedido[] = sucursalesConMetricas
    .map((sucursal) => ({ ...sucursal, esMasCercana: sucursal.sucursalId === masCercana.sucursalId }))
    .sort((izquierda, derecha) => {
      if (izquierda.esSucursalOrigen !== derecha.esSucursalOrigen) return izquierda.esSucursalOrigen ? -1 : 1;
      return izquierda.distanciaMillas - derecha.distanciaMillas;
    });

  return {
    estado: "disponible",
    sucursales,
    sucursalesSinUbicacion: input.sucursales.filter((sucursal) => !parseCoordinatePair(sucursal.latitud, sucursal.longitud)).length,
    sucursalesFueraDeRadio: 0,
  };
}

/**
 * Reemplaza cada tramo GPS por una ruta vial cuando el proveedor responde.
 * Los fallos individuales conservan la métrica GPS para que el panel nunca
 * dependa de la disponibilidad del proveedor.
 */
export async function calcularMetricasDistanciaPedidoConRutas(input: {
  tipoEntrega?: string | null;
  sucursalOrigenId: number;
  destino: CoordinatePair | null;
  sucursales: SucursalConCoordenadas[];
  maxConsultas?: number;
}): Promise<MetricasDistanciaPedido> {
  const base = calcularMetricasDistanciaPedido(input);
  if (base.estado !== "disponible" || !input.destino || !process.env.ROUTING_PROVIDER_URL?.trim()) return base;

  const candidates = base.sucursales;
  const limit = Math.max(0, Math.min(input.maxConsultas ?? candidates.length, candidates.length));
  const rutas = await Promise.all(candidates.slice(0, limit).map(async (metrica): Promise<Trayecto | null> => {
    const sucursal = input.sucursales.find((item) => item.id === metrica.sucursalId);
    const origen = sucursal && parseCoordinatePair(sucursal.latitud, sucursal.longitud);
    if (!origen) return null;
    return calcularTrayectoPorCarretera(
      origen.latitud, origen.longitud, input.destino!.latitud, input.destino!.longitud,
    );
  }));

  const conRutas: EntradaMetrica[] = candidates.map((metrica, index) => {
    const ruta = rutas[index];
    return ruta ? {
      ...metrica,
      distanciaMillas: ruta.distanciaMillas,
      tiempoEstimadoMinutos: ruta.minutosEstimados,
      fuente: "ruta",
    } : null;
  }).filter((metrica): metrica is EntradaMetrica => Boolean(metrica));
  if (conRutas.length === 0) {
    return {
      ...base,
      estado: "ruta_no_disponible",
      sucursales: [],
    };
  }
  const masCercana = conRutas.reduce((actual, candidata) =>
    candidata.distanciaMillas < actual.distanciaMillas ? candidata : actual
  );
  return {
    ...base,
    sucursales: conRutas
      .map((sucursal) => ({ ...sucursal, esMasCercana: sucursal.sucursalId === masCercana.sucursalId }))
      .sort((izquierda, derecha) => {
        if (izquierda.esSucursalOrigen !== derecha.esSucursalOrigen) return izquierda.esSucursalOrigen ? -1 : 1;
        return izquierda.distanciaMillas - derecha.distanciaMillas;
      }),
  };
}