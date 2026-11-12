// ────────────────────────────────────────────────────────────────────────────
// OPTIMIZADOR DE RUTA DE ENTREGA
// ────────────────────────────────────────────────────────────────────────────
// Nearest-neighbor + 2-opt usando distancias Haversine (sin API paga).
// Sale del colmado, visita N clientes en el orden más corto y regresa.
// ────────────────────────────────────────────────────────────────────────────

export interface PuntoEntrega {
  pedidoId: number;
  lat: number;
  lon: number;
}

export interface ParadaOptimizada {
  pedidoId: number;
  orden: number; // 1-based
  lat: number;
  lon: number;
  distanciaDesdeAnteriorKm: number;
  tiempoDesdeAnteriorMinutos: number;
  horaEstimadaLlegada: string; // "HH:MM"
}

export interface RutaOptimizada {
  paradas: ParadaOptimizada[];
  distanciaTotalKm: number;
  tiempoEstimadoMinutos: number;
  fuenteDistancias: "vial" | "gps";
  trafico: boolean;
}

type MatrizRutaVial = {
  distanciasKm: number[][];
  tiemposMinutos: number[][];
};

const VELOCIDAD_PROMEDIO_MPH = 25;
const KILOMETROS_POR_MILLA = 1.609344;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function tiempoMinutos(distanciaKm: number): number {
  const distanciaMillas = distanciaKm / KILOMETROS_POR_MILLA;
  return Math.round((distanciaMillas / VELOCIDAD_PROMEDIO_MPH) * 60);
}

function minutosAHora(minutosDesdeMedianoche: number): string {
  const h = Math.floor(minutosDesdeMedianoche / 60) % 24;
  const m = Math.floor(minutosDesdeMedianoche % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function construirMatrizDistancias(inicio: { lat: number; lon: number }, puntos: PuntoEntrega[]): number[][] {
  const coords = [{ lat: inicio.lat, lon: inicio.lon }, ...puntos.map((p) => ({ lat: p.lat, lon: p.lon }))];
  const n = coords.length;
  const matriz: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      matriz[i][j] = haversineKm(coords[i].lat, coords[i].lon, coords[j].lat, coords[j].lon);
    }
  }
  return matriz;
}

function rutaInicialVecinoMasCercano(n: number, distancias: number[][]): number[] {
  const secuencia = [0];
  const visitados = new Set([0]);
  let actual = 0;
  while (visitados.size < n) {
    let mejorSiguiente = -1;
    let mejorDistancia = Infinity;
    for (let j = 1; j < n; j++) {
      if (visitados.has(j)) continue;
      if (distancias[actual][j] < mejorDistancia) {
        mejorDistancia = distancias[actual][j];
        mejorSiguiente = j;
      }
    }
    if (mejorSiguiente === -1) break;
    secuencia.push(mejorSiguiente);
    visitados.add(mejorSiguiente);
    actual = mejorSiguiente;
  }
  return secuencia;
}

function distanciaTotalSecuencia(secuencia: number[], distancias: number[][]): number {
  let total = 0;
  for (let i = 0; i < secuencia.length - 1; i++) {
    total += distancias[secuencia[i]][secuencia[i + 1]];
  }
  return total;
}

function aplicar2Opt(secuenciaInicial: number[], distancias: number[][]): number[] {
  if (secuenciaInicial.length < 4) return secuenciaInicial;
  let mejor = [...secuenciaInicial];
  let mejorDistancia = distanciaTotalSecuencia(mejor, distancias);
  let mejorado = true;
  let iteraciones = 0;
  const maxIteraciones = 200;

  while (mejorado && iteraciones < maxIteraciones) {
    mejorado = false;
    iteraciones++;
    for (let i = 1; i < mejor.length - 2; i++) {
      for (let j = i + 1; j < mejor.length - 1; j++) {
        const nueva = [...mejor.slice(0, i), ...mejor.slice(i, j + 1).reverse(), ...mejor.slice(j + 1)];
        const nuevaDistancia = distanciaTotalSecuencia(nueva, distancias);
        if (nuevaDistancia < mejorDistancia - 0.001) {
          mejor = nueva;
          mejorDistancia = nuevaDistancia;
          mejorado = true;
          break;
        }
      }
      if (mejorado) break;
    }
  }
  return mejor;
}

export function optimizarRutaEntrega(
  inicio: { lat: number; lon: number },
  puntos: PuntoEntrega[],
  horaSalida: string = new Date().toTimeString().slice(0, 5)
): RutaOptimizada {
  if (puntos.length === 0) {
    return { paradas: [], distanciaTotalKm: 0, tiempoEstimadoMinutos: 0, fuenteDistancias: "gps", trafico: false };
  }

  const distancias = construirMatrizDistancias(inicio, puntos);
  let secuencia = rutaInicialVecinoMasCercano(puntos.length + 1, distancias);
  secuencia = aplicar2Opt(secuencia, distancias);

  const [h, m] = horaSalida.split(":").map(Number);
  let minutosActuales = (h || 0) * 60 + (m || 0);

  const paradas: ParadaOptimizada[] = [];
  let distanciaTotal = 0;

  for (let i = 1; i < secuencia.length; i++) {
    const idxAnterior = secuencia[i - 1];
    const idxActual = secuencia[i];
    const punto = puntos[idxActual - 1];
    const distancia = distancias[idxAnterior][idxActual];
    const tiempo = tiempoMinutos(distancia);

    minutosActuales += tiempo;
    distanciaTotal += distancia;

    paradas.push({
      pedidoId: punto.pedidoId,
      orden: i,
      lat: punto.lat,
      lon: punto.lon,
      distanciaDesdeAnteriorKm: Math.round(distancia * 100) / 100,
      tiempoDesdeAnteriorMinutos: tiempo,
      horaEstimadaLlegada: minutosAHora(minutosActuales),
    });
  }

  return {
    paradas,
    distanciaTotalKm: Math.round(distanciaTotal * 100) / 100,
    tiempoEstimadoMinutos: paradas.reduce((s, p) => s + p.tiempoDesdeAnteriorMinutos, 0),
    fuenteDistancias: "gps",
    trafico: false,
  };
}

function construirUrlProveedor(
  providerUrl: string,
  tipo: "route" | "table",
  coordenadas: Array<{ lat: number; lon: number }>,
): URL | null {
  try {
    const url = new URL(providerUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const ruta = url.pathname.replace(/\/$/, "");
    const rutaTabla = ruta.replace(/\/route\/v1\/driving$/, "/table/v1/driving");
    const rutaBase = tipo === "table" ? rutaTabla : ruta;
    url.pathname = `${rutaBase}/${coordenadas.map((punto) => `${punto.lon},${punto.lat}`).join(";")}`;
    return url;
  } catch {
    return null;
  }
}

/**
 * Obtiene una matriz de distancias y tiempos reales entre la sucursal y las
 * paradas. El proveedor debe implementar una respuesta compatible con OSRM
 * Table API (distances en metros y durations en segundos).
 */
export async function obtenerMatrizRutaVial(
  inicio: { lat: number; lon: number },
  puntos: PuntoEntrega[],
  options: { timeoutMs?: number } = {},
): Promise<MatrizRutaVial | null> {
  const providerUrl = process.env.ROUTING_PROVIDER_URL?.trim();
  if (!providerUrl || puntos.length === 0 || puntos.length > 25) return null;

  const coordenadas = [inicio, ...puntos.map((punto) => ({ lat: punto.lat, lon: punto.lon }))];
  const url = construirUrlProveedor(providerUrl, "table", coordenadas);
  if (!url) return null;
  url.searchParams.set("annotations", "duration,distance");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.ROUTING_PROVIDER_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const respuesta = await fetch(url, { headers, signal: controller.signal });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json() as {
      code?: string;
      distances?: unknown;
      durations?: unknown;
    };
    if (datos.code && datos.code !== "Ok") return null;
    if (!Array.isArray(datos.distances) || !Array.isArray(datos.durations)) return null;

    const distancias = datos.distances as unknown[];
    const duraciones = datos.durations as unknown[];
    const matrizDistancias = Array.from({ length: coordenadas.length }, () => Array(coordenadas.length).fill(0));
    const matrizTiempos = Array.from({ length: coordenadas.length }, () => Array(coordenadas.length).fill(0));
    for (let origen = 0; origen < coordenadas.length; origen++) {
      for (let destino = 0; destino < coordenadas.length; destino++) {
        const distancia = Number((distancias[origen] as unknown[])?.[destino]);
        const segundos = Number((duraciones[origen] as unknown[])?.[destino]);
        if (!Number.isFinite(distancia) || distancia < 0 || !Number.isFinite(segundos) || segundos < 0) return null;
        matrizDistancias[origen][destino] = distancia / 1000;
        matrizTiempos[origen][destino] = Math.max(1, Math.round(segundos / 60));
      }
    }
    return { distanciasKm: matrizDistancias, tiemposMinutos: matrizTiempos };
  } catch (error) {
    if ((error as { name?: string })?.name !== "AbortError") {
      console.warn("No se pudo consultar la matriz vial:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function optimizarRutaEntregaPorCarretera(
  inicio: { lat: number; lon: number },
  puntos: PuntoEntrega[],
  horaSalida: string = new Date().toTimeString().slice(0, 5),
): Promise<RutaOptimizada> {
  const matriz = await obtenerMatrizRutaVial(inicio, puntos);
  if (!matriz) return optimizarRutaEntrega(inicio, puntos, horaSalida);

  let secuencia = rutaInicialVecinoMasCercano(puntos.length + 1, matriz.tiemposMinutos);
  secuencia = aplicar2Opt(secuencia, matriz.tiemposMinutos);
  const [h, m] = horaSalida.split(":").map(Number);
  let minutosActuales = (h || 0) * 60 + (m || 0);
  const paradas: ParadaOptimizada[] = [];
  let distanciaTotal = 0;

  for (let i = 1; i < secuencia.length; i++) {
    const idxAnterior = secuencia[i - 1];
    const idxActual = secuencia[i];
    const punto = puntos[idxActual - 1];
    const distancia = matriz.distanciasKm[idxAnterior][idxActual];
    const tiempo = matriz.tiemposMinutos[idxAnterior][idxActual];
    minutosActuales += tiempo;
    distanciaTotal += distancia;
    paradas.push({
      pedidoId: punto.pedidoId,
      orden: i,
      lat: punto.lat,
      lon: punto.lon,
      distanciaDesdeAnteriorKm: Math.round(distancia * 100) / 100,
      tiempoDesdeAnteriorMinutos: tiempo,
      horaEstimadaLlegada: minutosAHora(minutosActuales),
    });
  }

  return {
    paradas,
    distanciaTotalKm: Math.round(distanciaTotal * 100) / 100,
    tiempoEstimadoMinutos: paradas.reduce((total, parada) => total + parada.tiempoDesdeAnteriorMinutos, 0),
    fuenteDistancias: "vial",
    trafico: process.env.ROUTING_PROVIDER_TRAFFIC === "true",
  };
}

export function extraerCoordenadas(ubicacion: string): { lat: number; lon: number } | null {
  if (!ubicacion) return null;
  const match = ubicacion.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

// ─── ETA para un pedido suelto (sin ruta optimizada) ─────────────────────────
export function calcularEtaSencilla(
  driverLat: number,
  driverLon: number,
  destinoLat: number,
  destinoLon: number,
): { distanciaKm: number; minutosEstimados: number; horaEstimadaLlegada: string } {
  const trayecto = calcularTrayectoEstimado(driverLat, driverLon, destinoLat, destinoLon);
  const ahora = new Date();
  const minutosDesdeMedianoche = ahora.getHours() * 60 + ahora.getMinutes() + trayecto.minutosEstimados;
  return {
    distanciaKm: trayecto.distanciaKm,
    minutosEstimados: trayecto.minutosEstimados,
    horaEstimadaLlegada: minutosAHora(minutosDesdeMedianoche),
  };
}

/**
 * Estimated point-to-point travel data based on GPS coordinates. The distance
 * is geodesic (not turn-by-turn road routing), and the duration uses the
 * delivery fleet's configured average speed plus a short preparation buffer.
 */
export function calcularTrayectoEstimado(
  origenLatitud: number,
  origenLongitud: number,
  destinoLatitud: number,
  destinoLongitud: number,
): { distanciaKm: number; distanciaMillas: number; minutosEstimados: number } {
  const distanciaKm = haversineKm(origenLatitud, origenLongitud, destinoLatitud, destinoLongitud);
  const minutosViaje = tiempoMinutos(distanciaKm);
  return {
    distanciaKm: Math.round(distanciaKm * 100) / 100,
    distanciaMillas: Math.round((distanciaKm / KILOMETROS_POR_MILLA) * 100) / 100,
    minutosEstimados: Math.max(3, minutosViaje + 3),
  };
}

export type FuenteTrayecto = "ruta" | "gps";

export type Trayecto = {
  distanciaKm: number;
  distanciaMillas: number;
  minutosEstimados: number;
  fuente: FuenteTrayecto;
};

/**
 * Obtiene una ruta OSRM-compatible sin bloquear el flujo principal.
 * ROUTING_PROVIDER_URL debe ser una URL de endpoint route/v1/driving; la
 * clave, si el proveedor la requiere, solo se lee en el servidor.
 */
export async function calcularTrayectoPorCarretera(
  origenLatitud: number,
  origenLongitud: number,
  destinoLatitud: number,
  destinoLongitud: number,
  options: { timeoutMs?: number } = {},
): Promise<Trayecto | null> {
  const providerUrl = process.env.ROUTING_PROVIDER_URL?.trim();
  if (!providerUrl) return null;

  let url: URL;
  try {
    url = new URL(providerUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${origenLongitud},${origenLatitud};${destinoLongitud},${destinoLatitud}`;
    url.searchParams.set("overview", "false");
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1800);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const apiKey = process.env.ROUTING_PROVIDER_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const respuesta = await fetch(url, { headers, signal: controller.signal });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json() as {
      code?: string;
      routes?: Array<{ distance?: unknown; duration?: unknown }>;
    };
    const ruta = datos.routes?.[0];
    const distanciaMetros = Number(ruta?.distance);
    const duracionSegundos = Number(ruta?.duration);
    if (datos.code && datos.code !== "Ok") return null;
    if (!Number.isFinite(distanciaMetros) || distanciaMetros < 0
      || !Number.isFinite(duracionSegundos) || duracionSegundos < 0) return null;
    const distanciaKm = distanciaMetros / 1000;
    return {
      distanciaKm: Math.round(distanciaKm * 100) / 100,
      distanciaMillas: Math.round((distanciaKm / KILOMETROS_POR_MILLA) * 100) / 100,
      minutosEstimados: Math.max(1, Math.round(duracionSegundos / 60)),
      fuente: "ruta",
    };
  } catch (error) {
    if ((error as { name?: string })?.name !== "AbortError") {
      console.warn("No se pudo consultar el proveedor de rutas:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodificarDireccion(direccion: string, paisHint?: string): Promise<{ lat: number; lon: number } | null> {
  const texto = (direccion || "").trim();
  if (!texto || texto.length < 5) return null;
  try {
    const query = paisHint ? `${texto}, ${paisHint}` : texto;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const respuesta = await fetch(url, {
      headers: { "User-Agent": "Delywa/2.0 (https://delywa.com; planificacion de rutas)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (!respuesta.ok) return null;
    const resultados = await respuesta.json();
    if (!Array.isArray(resultados) || resultados.length === 0) return null;
    const lat = parseFloat(resultados[0].lat);
    const lon = parseFloat(resultados[0].lon);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon };
  } catch (err) {
    console.error("Error geocodificando dirección con Nominatim:", err);
    return null;
  }
}
