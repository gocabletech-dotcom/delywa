import { afterEach, describe, expect, it, vi } from "vitest";
import { calcularTrayectoEstimado, calcularTrayectoPorCarretera, obtenerMatrizRutaVial } from "../lib/routeOptimizer";
import { calcularMetricasDistanciaPedido, calcularMetricasDistanciaPedidoConRutas, parseCoordinatePair } from "../lib/orderDistance";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("calcularTrayectoEstimado", () => {
  it("converts the GPS distance to miles and returns a delivery time estimate", () => {
    const trayecto = calcularTrayectoEstimado(0, 0, 0, 1);

    expect(trayecto.distanciaKm).toBeCloseTo(111.19, 1);
    expect(trayecto.distanciaMillas).toBeCloseTo(69.09, 1);
    expect(trayecto.minutosEstimados).toBe(169);
  });
});

describe("calcularMetricasDistanciaPedido", () => {
  const destino = { latitud: 40.758, longitud: -73.9855 };
  const sucursales = [
    { id: 1, nombre: "Sucursal origen", latitud: "40.7128", longitud: "-74.0060" },
    { id: 2, nombre: "Sucursal cercana", latitud: "40.7536", longitud: "-73.9832" },
    { id: 3, nombre: "Sucursal sin GPS", latitud: null, longitud: null },
  ];

  it("keeps the origin first, compares sibling branches, and marks the closest one", () => {
    const metricas = calcularMetricasDistanciaPedido({
      tipoEntrega: "delivery",
      sucursalOrigenId: 1,
      destino,
      sucursales,
    });

    expect(metricas.estado).toBe("disponible");
    expect(metricas.sucursales).toHaveLength(2);
    expect(metricas.sucursales[0]).toMatchObject({
      sucursalId: 1,
      esSucursalOrigen: true,
      esMasCercana: false,
    });
    expect(metricas.sucursales[1]).toMatchObject({
      sucursalId: 2,
      esSucursalOrigen: false,
      esMasCercana: true,
    });
    expect(metricas.sucursales[0].distanciaMillas).toBeGreaterThan(metricas.sucursales[1].distanciaMillas);
    expect(metricas.sucursalesSinUbicacion).toBe(1);
  });

  it("does not calculate delivery data for pickup or missing GPS", () => {
    expect(calcularMetricasDistanciaPedido({
      tipoEntrega: "pickup",
      sucursalOrigenId: 1,
      destino,
      sucursales,
    }).estado).toBe("pickup");

    expect(calcularMetricasDistanciaPedido({
      tipoEntrega: "delivery",
      sucursalOrigenId: 1,
      destino: null,
      sucursales,
    }).estado).toBe("ubicacion_cliente_incompleta");
  });

  it("keeps showing the distance in miles even when it is large", () => {
    const metricas = calcularMetricasDistanciaPedido({
      tipoEntrega: "delivery",
      sucursalOrigenId: 1,
      destino: { latitud: 0, longitud: 4 },
      sucursales: [{ id: 1, nombre: "Origen", latitud: 0, longitud: 0, radioEntrega: 5 }],
    });

    expect(metricas.estado).toBe("disponible");
    expect(metricas.sucursales).toHaveLength(1);
    expect(metricas.sucursales[0].distanciaMillas).toBeCloseTo(276.2, 0);
  });
});

describe("calcularTrayectoPorCarretera", () => {
  it("uses the configured provider and converts meters/seconds", async () => {
    vi.stubEnv("ROUTING_PROVIDER_URL", "https://routing.example/route/v1/driving");
    vi.stubEnv("ROUTING_PROVIDER_API_KEY", "secret-that-must-not-leak");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "Ok",
      routes: [{ distance: 3210, duration: 845 }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(calcularTrayectoPorCarretera(18.48, -69.9, 18.5, -69.88))
      .resolves.toMatchObject({ distanciaKm: 3.21, minutosEstimados: 14, fuente: "ruta" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.stringContaining("route/v1/driving/-69.9,18.48;-69.88,18.5") }),
      expect.objectContaining({ headers: { Accept: "application/json", Authorization: "Bearer secret-that-must-not-leak" } }),
    );
  });

  it("returns null when the provider fails or is not configured", async () => {
    vi.stubEnv("ROUTING_PROVIDER_URL", "https://routing.example/route/v1/driving");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    await expect(calcularTrayectoPorCarretera(0, 0, 0, 1)).resolves.toBeNull();

    vi.stubEnv("ROUTING_PROVIDER_URL", "");
    await expect(calcularTrayectoPorCarretera(0, 0, 0, 1)).resolves.toBeNull();
  });
});

describe("obtenerMatrizRutaVial", () => {
  it("requests the full driving matrix and preserves provider seconds as minutes", async () => {
    vi.stubEnv("ROUTING_PROVIDER_URL", "https://routing.example/route/v1/driving");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "Ok",
      distances: [
        [0, 1609, 3218],
        [1609, 0, 804],
        [3218, 804, 0],
      ],
      durations: [
        [0, 600, 1200],
        [600, 0, 300],
        [1200, 300, 0],
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const matriz = await obtenerMatrizRutaVial(
      { lat: 40.7, lon: -74 },
      [
        { pedidoId: 1, lat: 40.71, lon: -74.01 },
        { pedidoId: 2, lat: 40.72, lon: -74.02 },
      ],
    );

    expect(matriz?.distanciasKm[0][1]).toBeCloseTo(1.609, 2);
    expect(matriz?.tiemposMinutos[0][1]).toBe(10);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.stringContaining("/table/v1/driving/") }),
      expect.anything(),
    );
  });
});

describe("calcularMetricasDistanciaPedidoConRutas", () => {
  it("does not replace failed route calls with a fixed-speed GPS ETA", async () => {
    vi.stubEnv("ROUTING_PROVIDER_URL", "https://routing.example/route/v1/driving");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: "Ok", routes: [{ distance: 1000, duration: 120 }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("timeout", { status: 504 })));
    const metricas = await calcularMetricasDistanciaPedidoConRutas({
      tipoEntrega: "delivery",
      sucursalOrigenId: 1,
      destino: { latitud: 40.758, longitud: -73.9855 },
      sucursales: [
        { id: 1, nombre: "Origen", latitud: 40.7128, longitud: -74.006 },
        { id: 2, nombre: "Alterna", latitud: 40.7536, longitud: -73.9832 },
        { id: 3, nombre: "Otra", latitud: 40.75, longitud: -73.98 },
      ],
      maxConsultas: 2,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(metricas.sucursales[0]).toMatchObject({ fuente: "ruta", distanciaMillas: 0.62, tiempoEstimadoMinutos: 2 });
    expect(metricas.sucursales.find((sucursal) => sucursal.sucursalId === 2)).toBeUndefined();
    expect(metricas.sucursales.find((sucursal) => sucursal.sucursalId === 3)).toBeUndefined();
  });
});

describe("parseCoordinatePair", () => {
  it("rejects incomplete and invalid coordinates", () => {
    expect(parseCoordinatePair("40.7", "-74")).toEqual({ latitud: 40.7, longitud: -74 });
    expect(parseCoordinatePair("91", "-74")).toBeNull();
    expect(parseCoordinatePair(null, "-74")).toBeNull();
  });
});