/**
 * Tests: ZIP validation in the visual menu checkout form (menu-grafico.tsx)
 *
 * Covers the guards in handleSubmitPedido() (lines 334–351):
 *   A — ZIP required + blank → error "required" → shows "[label] es requerido"
 *   B — error clears when ZIP is filled; second attempt sends order
 *   C — ZIP filled but wrong format → error "format" → shows "Formato inválido"
 *   D — patronCodigoPostal is null → any ZIP (even arbitrary text) passes format check
 *   E — requiereCodigoPostal = false + blank ZIP → no error, order is sent
 *
 * Key testids under test:
 *   input-auth-nombre, input-auth-whatsapp, button-continuar-menu
 *   card-producto-42, button-ver-carrito
 *   input-nombre, input-whatsapp, input-addr-calle, input-addr-cp
 *   button-enviar-pedido
 *   error-addr-cp-required, error-addr-cp-format
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  useParams: () => ({ codigo: "test-store" }),
  useSearch: () => "",
  useLocation: () => ["/menu/test-store", vi.fn()],
}));

Element.prototype.scrollIntoView = vi.fn();

// ── Fixtures ───────────────────────────────────────────────────────────────────

const BASE_COLMADO = {
  id: 1,
  nombre: "Test Store",
  logo: null,
  whatsappNumero: "18091234567",
  tipoNegocio: "colmado",
  codigoPais: "US",
  simboloMoneda: "$",
  costoDelivery: "0",
  tiempoEstimado: "30 min",
  etiquetaEstado: "State",
  etiquetaCodigoPostal: "ZIP Code",
  patronCodigoPostal: null as string | null, // no regex by default
  requiereCodigoPostal: false,       // optional by default
  ejemploDireccion: "123 Main St",
  ejemploCiudad: "New York",
  ejemploEstado: "NY",
  ejemploCodigoPostal: "10001",
};

const PRODUCT = {
  id: 42,
  nombre: "Producto Test",
  descripcion: null,
  precio: "100",
  categoria: "General",
  imagen: null,
  emoji: null,
  disponible: true,
};

type TestPedidoReciente = {
  id: number;
  estado: string;
  total: string;
  fecha: string;
  productos: string;
};

type TestClienteBusqueda = {
  encontrado: boolean;
  cliente: { nombre: string | null; direccion: string | null } | null;
  pedidosRecientes: TestPedidoReciente[];
};

// ── Fetch mock factory ─────────────────────────────────────────────────────────

function setupFetch(
  colmadoOverride: Partial<typeof BASE_COLMADO> = {},
  clienteResponse: TestClienteBusqueda = { encontrado: false, cliente: null, pedidosRecientes: [] }
) {
  const colmado = { ...BASE_COLMADO, ...colmadoOverride };
  return vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);

    if (u.includes("/api/menu-grafico/colmado/")) {
      return { ok: true, json: async () => colmado };
    }
    if (u.includes("/api/menu-grafico/buscar-cliente")) {
      return {
        ok: true,
        json: async () => clienteResponse,
      };
    }
    if (u.includes("/api/menu-grafico/pedidos-cliente")) {
      return {
        ok: true,
        json: async () => ({ pedidos: clienteResponse.pedidosRecientes }),
      };
    }
    if (u.includes("/api/menu-grafico/pedido")) {
      return {
        ok: true,
        json: async () => ({ id: 99, estado: "pendiente_confirmacion" }),
      };
    }
    // /api/colmados/:id/menu/categorias must come before /menu
    if (u.includes("/menu/categorias")) {
      return { ok: true, json: async () => ["General"] };
    }
    if (u.includes("/menu")) {
      return { ok: true, json: async () => [PRODUCT] };
    }
    return { ok: false, json: async () => ({}) };
  });
}

async function renderAndReachTracking(pedidosRecientes: TestPedidoReciente[]) {
  const clienteResponse: TestClienteBusqueda = {
    encontrado: true,
    cliente: { nombre: "Test User", direccion: null },
    pedidosRecientes,
  };
  const fetchMock = setupFetch({}, clienteResponse);
  global.fetch = fetchMock;

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const { default: MenuGrafico } = await import("../menu-grafico");

  render(
    <QueryClientProvider client={qc}>
      <MenuGrafico />
    </QueryClientProvider>
  );

  await waitFor(() => screen.getByTestId("input-auth-nombre"), { timeout: 5000 });
  await userEvent.type(screen.getByTestId("input-auth-nombre"), "Test User");
  await userEvent.clear(screen.getByTestId("input-auth-whatsapp"));
  await userEvent.type(screen.getByTestId("input-auth-whatsapp"), "+18091234567");
  await userEvent.click(screen.getByTestId("button-continuar-menu"));

  await waitFor(() => screen.getByTestId("button-mis-pedidos-flotante"), { timeout: 5000 });
  await userEvent.click(screen.getByTestId("button-mis-pedidos-flotante"));
  await waitFor(() => screen.getByTestId(`pedido-activo-${pedidosRecientes[0].id}`), { timeout: 3000 });
  await userEvent.click(screen.getByTestId(`pedido-activo-${pedidosRecientes[0].id}`));
  await waitFor(() => screen.getByTestId("tracking-pedidos"), { timeout: 3000 });

  return { fetchMock };
}

// ── Helper: render and navigate all the way to the checkout view ───────────────

async function renderAndReachCheckout(
  colmadoOverride: Partial<typeof BASE_COLMADO> = {}
) {
  const fetchMock = setupFetch(colmadoOverride);
  global.fetch = fetchMock;

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Dynamic import gives each test a fresh module + fresh React state
  const { default: MenuGrafico } = await import("../menu-grafico");

  render(
    <QueryClientProvider client={qc}>
      <MenuGrafico />
    </QueryClientProvider>
  );

  // 1. Auth view ─────────────────────────────────────────────────────────────
  await waitFor(() => screen.getByTestId("input-auth-nombre"), { timeout: 5000 });

  await userEvent.type(screen.getByTestId("input-auth-nombre"), "Test User");

  // The whatsapp field starts with "+1"; clear it then type a full valid number
  await userEvent.clear(screen.getByTestId("input-auth-whatsapp"));
  await userEvent.type(screen.getByTestId("input-auth-whatsapp"), "+18091234567");

  await userEvent.click(screen.getByTestId("button-continuar-menu"));

  // 2. Menu view ─────────────────────────────────────────────────────────────
  // Wait for the product card to appear (queries have fired and resolved)
  await waitFor(() => screen.getByTestId("card-producto-42"), { timeout: 5000 });

  // Add the product to cart
  await userEvent.click(screen.getByTestId("card-producto-42"));

  // Click "Ver carrito" sticky bar → navigates directly to checkout
  await waitFor(() => screen.getByTestId("button-ver-carrito"), { timeout: 3000 });
  await userEvent.click(screen.getByTestId("button-ver-carrito"));

  // 3. Checkout view ─────────────────────────────────────────────────────────
  await waitFor(() => screen.getByTestId("button-enviar-pedido"), { timeout: 3000 });

  // Fill the street field so buildDireccionTexto() returns a non-empty string.
  // Without an address the form bails early with a "dirección" error before
  // the ZIP checks are ever reached.
  await userEvent.type(screen.getByTestId("input-addr-calle"), "123 Main St");

  return { fetchMock };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("menu-grafico.tsx — checkout ZIP validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  // ─── A: required ZIP is blank ─────────────────────────────────────────────
  it("A: shows required-ZIP error and blocks submission when requiereCodigoPostal=true and ZIP is blank", async () => {
    /**
     * Guard at line 334:
     *   if (colmado.requiereCodigoPostal && colmado.etiquetaCodigoPostal && !addrCP.trim())
     *     → setAddrCPError("required"); return;
     *
     * Expected:
     *   [data-testid="error-addr-cp-required"] becomes visible
     *   POST to /api/menu-grafico/pedido is NOT called
     */
    const { fetchMock } = await renderAndReachCheckout({
      requiereCodigoPostal: true,
      patronCodigoPostal: null,
    });

    // No error yet
    expect(screen.queryByTestId("error-addr-cp-required")).toBeNull();

    await userEvent.click(screen.getByTestId("button-enviar-pedido"));

    const errorEl = await screen.findByTestId("error-addr-cp-required");
    expect(errorEl.textContent).toContain("ZIP Code");
    expect(errorEl.textContent).toContain("requerido");

    // Mutation must NOT have fired
    const pedidoCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("/api/menu-grafico/pedido")
    );
    expect(pedidoCalls).toHaveLength(0);
  });

  // ─── B: error clears → second attempt submits ─────────────────────────────
  it("B: clears required-ZIP error when ZIP is filled and allows submission", async () => {
    /**
     * After a failed attempt (error showing), typing in the ZIP field should:
     *   - Clear the error immediately (onChange: setAddrCPError(""))
     *   - Allow submission on the next click
     *   - POST to /api/menu-grafico/pedido
     */
    const { fetchMock } = await renderAndReachCheckout({
      requiereCodigoPostal: true,
      patronCodigoPostal: null,
    });

    // First attempt — blank ZIP → error
    await userEvent.click(screen.getByTestId("button-enviar-pedido"));
    await screen.findByTestId("error-addr-cp-required");

    // Fill ZIP → error clears (onChange fires)
    await userEvent.type(screen.getByTestId("input-addr-cp"), "10001");
    expect(screen.queryByTestId("error-addr-cp-required")).toBeNull();

    // Second attempt → order is sent
    await userEvent.click(screen.getByTestId("button-enviar-pedido"));

    await waitFor(
      () => {
        const calls = fetchMock.mock.calls.filter(([u]) =>
          String(u).includes("/api/menu-grafico/pedido")
        );
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  // ─── C: wrong format → format error ──────────────────────────────────────
  it("C: shows format-ZIP error when ZIP doesn't match patronCodigoPostal regex", async () => {
    /**
     * Guard at line 341:
     *   if (colmado.etiquetaCodigoPostal && addrCP.trim() && patronCP) {
     *     const formatRegex = new RegExp(`^(?:${patronCP})$`, "i");
     *     if (!formatRegex.test(addrCP.trim())) { setAddrCPError("format"); return; }
     *   }
     *
     * US ZIP pattern: \d{5}(-\d{4})?
     * "ABCDE" does not match → format error expected.
     *
     * Expected:
     *   [data-testid="error-addr-cp-format"] becomes visible with "Formato inválido"
     *   POST to /api/menu-grafico/pedido is NOT called
     */
    await renderAndReachCheckout({
      requiereCodigoPostal: false,        // required check won't fire
      patronCodigoPostal: "\\d{5}(-\\d{4})?",
    });

    // Type a ZIP that deliberately fails the regex
    await userEvent.type(screen.getByTestId("input-addr-cp"), "ABCDE");

    expect(screen.queryByTestId("error-addr-cp-format")).toBeNull();

    await userEvent.click(screen.getByTestId("button-enviar-pedido"));

    const errorEl = await screen.findByTestId("error-addr-cp-format");
    expect(errorEl.textContent).toContain("Formato inválido");
  });

  // ─── D: patronCodigoPostal is null → any ZIP passes format check ──────────
  it("D: accepts any non-empty ZIP when patronCodigoPostal is null (no regex to enforce)", async () => {
    /**
     * When patronCodigoPostal is null the format-check block is skipped entirely.
     * Even an arbitrary string should be accepted and the order should be submitted.
     */
    const { fetchMock } = await renderAndReachCheckout({
      requiereCodigoPostal: true,
      patronCodigoPostal: null,
    });

    await userEvent.type(screen.getByTestId("input-addr-cp"), "ANYTHING_GOES");

    await userEvent.click(screen.getByTestId("button-enviar-pedido"));

    await waitFor(
      () => {
        const calls = fetchMock.mock.calls.filter(([u]) =>
          String(u).includes("/api/menu-grafico/pedido")
        );
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    // No format error should appear
    expect(screen.queryByTestId("error-addr-cp-format")).toBeNull();
  });

  // ─── E: ZIP optional + blank → accepted ──────────────────────────────────
  it("E: sends order without error when requiereCodigoPostal=false and ZIP is blank", async () => {
    /**
     * When the colmado does not require a postal code:
     *   - The required check is skipped (requiereCodigoPostal is false)
     *   - The format check is skipped (addrCP is empty)
     *   → order is submitted without any ZIP error
     */
    const { fetchMock } = await renderAndReachCheckout({
      requiereCodigoPostal: false,
      patronCodigoPostal: "\\d{5}",   // pattern exists but ZIP is blank so check is skipped
    });

    // Leave input-addr-cp blank (do nothing)

    await userEvent.click(screen.getByTestId("button-enviar-pedido"));

    // No errors
    expect(screen.queryByTestId("error-addr-cp-required")).toBeNull();
    expect(screen.queryByTestId("error-addr-cp-format")).toBeNull();

    await waitFor(
      () => {
        const calls = fetchMock.mock.calls.filter(([u]) =>
          String(u).includes("/api/menu-grafico/pedido")
        );
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("shows and tracks two active orders independently, including each share link", async () => {
    const pedidosActivos: TestPedidoReciente[] = [
      {
        id: 201,
        estado: "pendiente",
        total: "120",
        fecha: "2026-08-24T14:00:00.000Z",
        productos: JSON.stringify([{ nombre: "Arroz", cantidad: 1 }]),
      },
      {
        id: 202,
        estado: "en_camino",
        total: "240",
        fecha: "2026-08-24T14:30:00.000Z",
        productos: JSON.stringify([{ nombre: "Pollo", cantidad: 2 }]),
      },
    ];
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: shareMock,
    });

    await renderAndReachTracking(pedidosActivos);

    expect(screen.getByText("Tus pedidos activos")).toBeInTheDocument();
    expect(screen.getByTestId("tracking-pedido-201")).toBeInTheDocument();
    expect(screen.getByTestId("tracking-pedido-202")).toBeInTheDocument();

    expect(screen.getByTestId("tracking-pedido-201")).toHaveClass("border-green-500");
    await userEvent.click(screen.getByTestId("button-compartir-seguimiento"));

    await userEvent.click(screen.getByTestId("tracking-pedido-202"));
    await waitFor(() => {
      expect(screen.getByTestId("tracking-pedido-202")).toHaveClass("border-green-500");
    });
    expect(screen.getAllByText("Pedido #202", { exact: true })).toHaveLength(2);
    await userEvent.click(screen.getByTestId("button-compartir-seguimiento"));

    expect(shareMock).toHaveBeenNthCalledWith(1, {
      title: "Seguimiento del pedido #201",
      text: "Mira el estado de mi pedido #201",
      url: `${window.location.origin}/compartir/seguimiento/201`,
    });
    expect(shareMock).toHaveBeenNthCalledWith(2, {
      title: "Seguimiento del pedido #202",
      text: "Mira el estado de mi pedido #202",
      url: `${window.location.origin}/compartir/seguimiento/202`,
    });
  });
});
