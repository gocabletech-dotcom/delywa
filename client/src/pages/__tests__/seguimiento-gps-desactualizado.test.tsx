import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import React from "react";

import SeguimientoPage, {
  ubicacionDesactualizada as ubicacionDesactualizadaEnSeguimiento,
} from "../seguimiento";
import MapaFlotaTab from "@/components/negocio/delivery/MapaFlotaTab";
import {
  crearIconoMoto,
  ubicacionDesactualizada as ubicacionDesactualizadaEnFlota,
} from "@/components/negocio/delivery/MapaFlotaTab";

vi.mock("wouter", () => ({
  useRoute: () => [true, { pedidoId: "123" }],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
}));

vi.mock("leaflet/dist/leaflet.css", () => ({}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Polyline: () => null,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
}));

describe("GPS desactualizado en seguimiento y mapa de flota", () => {
  const ahora = new Date("2026-08-24T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(ahora);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each([
    ["ubicación reciente", 19 * 60 + 59, false],
    ["exactamente en el umbral de 20 minutos", 20 * 60, false],
    ["ubicación con más de 20 minutos", 20 * 60 + 1, true],
  ])("clasifica correctamente una %s", (_caso, segundosTranscurridos, esperado) => {
    const fecha = new Date(ahora.getTime() - segundosTranscurridos * 1000).toISOString();

    expect(ubicacionDesactualizadaEnSeguimiento(fecha)).toBe(esperado);
    expect(ubicacionDesactualizadaEnFlota(fecha)).toBe(esperado);
  });

  it.each([
    ["reciente", 19 * 60 + 59, false],
    ["exactamente de 20 minutos", 20 * 60, false],
    ["más vieja que 20 minutos", 20 * 60 + 1, true],
  ])("muestra la ETA aproximada y el aviso solo para GPS %s", (_caso, segundosTranscurridos, desactualizado) => {
    const fecha = new Date(ahora.getTime() - segundosTranscurridos * 1000).toISOString();
    const useQueryMock = vi.mocked(useQuery);

    useQueryMock.mockReturnValue({
      data: {
        pedidoId: 123,
        clienteNombre: "Cliente de prueba",
        estado: "en_camino",
        tipoEntrega: "delivery",
        delivery: {
          nombre: "Repartidor de prueba",
          lat: null,
          lon: null,
          ultimaUbicacionAt: fecha,
        },
        destino: {
          lat: null,
          lon: null,
          direccion: "Calle de prueba",
        },
        eta: {
          distanciaKm: 2.4,
          minutosEstimados: 12,
          horaEstimadaLlegada: "12:12",
        },
      },
      isLoading: false,
      error: null,
      dataUpdatedAt: 1,
    } as ReturnType<typeof useQuery>);

    render(<SeguimientoPage />);

    if (desactualizado) {
      const alerta = screen.getByRole("alert");
      const eta = screen.getByTestId("seguimiento-eta");

      expect(alerta).toHaveTextContent("Ubicación desactualizada");
      expect(alerta).toHaveTextContent("ETA es un estimado aproximado");
      expect(screen.getByText("Estimado aproximado ·")).toBeInTheDocument();
      expect(alerta.compareDocumentPosition(eta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(eta).toHaveClass("mt-3");
      expect(eta).not.toHaveClass("-mt-4");
    } else {
      expect(screen.getByTestId("seguimiento-eta")).toHaveClass("-mt-4");
      expect(screen.queryByTestId("seguimiento-alerta-gps-desactualizado")).not.toBeInTheDocument();
      expect(screen.getByText("Llega aprox. a las")).toBeInTheDocument();
      expect(screen.queryByText("Estimado aproximado ·")).not.toBeInTheDocument();
    }
  });

  it("agrega el distintivo de advertencia al marcador de flota con GPS viejo", () => {
    const iconoNormal = crearIconoMoto("#22c55e", false);
    const iconoDesactualizado = crearIconoMoto("#22c55e", true);

    expect(iconoNormal.options.html).not.toContain("background:#f97316");
    expect(iconoDesactualizado.options.html).toContain("background:#f97316");
    expect(iconoDesactualizado.options.html).toContain(">!</span>");
  });

  it.each([
    ["reciente", 19 * 60 + 59, false],
    ["exactamente de 20 minutos", 20 * 60, false],
    ["más vieja que 20 minutos", 20 * 60 + 1, true],
  ])("identifica una ETA asociada a una ubicación %s", (_caso, segundosTranscurridos, desactualizado) => {
    const fecha = new Date(ahora.getTime() - segundosTranscurridos * 1000).toISOString();
    vi.mocked(useQuery).mockReturnValue({
      data: [{
        id: 7,
        nombre: "Repartidor de prueba",
        estado: "activo",
        ultimaLatitud: "18.48",
        ultimaLongitud: "-69.93",
        ultimaUbicacionAt: fecha,
        paradasPendientes: 1,
        paradasTotal: 1,
        paradas: [],
        pedidosPendientes: [{
          id: 123,
          clienteNombre: "Cliente de prueba",
          clienteUbicacion: "18.49, -69.92",
          clienteLatitud: null,
          clienteLongitud: null,
          estado: "en_camino",
          eta: {
            distanciaKm: 2.4,
            minutosEstimados: 12,
            horaEstimadaLlegada: "12:12",
          },
        }],
      }],
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    render(<MapaFlotaTab colmadoId={1} colmadoLat={18.47} colmadoLon={-69.94} />);

    const alerta = screen.queryByTestId("alerta-gps-desactualizado-123");
    if (desactualizado) {
      expect(alerta).toBeInTheDocument();
      expect(alerta).toHaveTextContent("Ubicación desactualizada");
      expect(screen.getByText(/Estimado aproximado · 12:12/)).toBeInTheDocument();
      expect(screen.getByText("⚠️ ETA aproximada · GPS desactualizado")).toBeInTheDocument();
    } else {
      expect(alerta).not.toBeInTheDocument();
      expect(screen.getByText(/12:12 · 2.4 km/)).toBeInTheDocument();
      expect(screen.queryByText(/Estimado aproximado · 12:12/)).not.toBeInTheDocument();
      expect(screen.queryByText("⚠️ ETA aproximada · GPS desactualizado")).not.toBeInTheDocument();
    }
  });
});
