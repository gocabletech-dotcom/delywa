/**
 * Regression test for returning to a new chat session with a saved cart.
 *
 * A customer may have rejected a saved cart in an earlier session. When they
 * open a new link with the same customer parameters, the new session must
 * still show its own saved-cart welcome message and enter the chat view.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("wouter", () => ({
  useParams: () => ({ codigo: "test-store" }),
  useSearch: () => "?tel=555&nombre=Juan",
  useLocation: () => ["/pedir/test-store?tel=555&nombre=Juan", vi.fn()],
}));

Element.prototype.scrollIntoView = vi.fn();

const COLMADO = {
  id: 1,
  nombre: "Test Store",
  logo: null,
  whatsappNumero: "18091234567",
  tipoNegocio: "colmado",
  codigoPais: "DO",
  etiquetaEstado: null,
  etiquetaCodigoPostal: null,
  requiereCodigoPostal: false,
  ejemploDireccion: null,
  ejemploCiudad: null,
  ejemploEstado: null,
  ejemploCodigoPostal: null,
  patronCodigoPostal: null,
};

const MENU_DATA = {
  usaMenu: false,
  tieneMenu: false,
  simboloMoneda: "$",
  categorias: [],
  productosPorCategoria: {},
};

const SAVED_CART_SESSION = {
  sessionId: "new-session-123",
  historialMensajes: [],
  carritoGuardado: true,
  mensajeBienvenida: "Encontramos tu carrito guardado. ¿Deseas continuar con tu pedido?",
};

function setupFetchMock() {
  return vi.fn().mockImplementation(async (url: string) => {
    const requestUrl = String(url);

    if (requestUrl.includes("/api/chat-web/colmado/")) {
      return { ok: true, json: async () => COLMADO };
    }
    if (requestUrl.includes("/api/chat-web/menu/")) {
      return { ok: true, json: async () => MENU_DATA };
    }
    if (requestUrl.includes("/api/chat-web/check-pedido")) {
      return { ok: true, json: async () => ({ pedido: null }) };
    }
    if (requestUrl === "/api/chat-web/session") {
      return { ok: true, json: async () => SAVED_CART_SESSION };
    }
    if (requestUrl.includes("/api/chat-web/session/new-session-123")) {
      return { ok: true, json: async () => ({ mensajes: [] }) };
    }

    return { ok: false, json: async () => ({}) };
  });
}

describe("pedir.tsx — auto-register with a saved cart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it("shows the saved-cart banner again in the new chat session", async () => {
    const fetchMock = setupFetchMock();
    global.fetch = fetchMock;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { default: PedirPage } = await import("../pedir");

    render(
      <QueryClientProvider client={queryClient}>
        <PedirPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-container")).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getByText(SAVED_CART_SESSION.mensajeBienvenida, { exact: true }))
      .toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-container")).toBeNull();
    expect(screen.queryByTestId("empty-chat")).toBeNull();
  });
});