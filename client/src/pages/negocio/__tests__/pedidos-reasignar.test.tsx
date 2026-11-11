/**
 * Tests: devuelta step when reassigning a cash order that is en_camino
 *
 * Scenario A — cash (efectivo) order:
 *   Click "Reasignar" → dialog opens (select step) → select a delivery →
 *   dialog should advance to the devuelta (vuelto) step.
 *
 * Scenario B — non-cash order:
 *   Click "Reasignar" → dialog opens → select a delivery →
 *   dialog should close immediately (no devuelta step).
 *
 * Scenario C — cash order reassigned a SECOND time (vueltoEntregadoAlDelivery already true):
 *   Click "Reasignar" → dialog opens → select a delivery →
 *   dialog should close immediately (no second devuelta step).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
  useLocation: () => ["/negocio/pedidos", vi.fn()],
  useRoute: () => [false, {}],
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
    user: { id: 1, username: "test" },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/negocio/NegocioLayout", () => ({
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/services/PrinterService", () => ({
  printOrderWindow: vi.fn(),
  generateOrderPdf: vi.fn(),
}));

vi.mock("@/lib/mapUtils", () => ({
  buildMapUrl: vi.fn(() => "#"),
}));

// ── Fixture data ──────────────────────────────────────────────────────────────

const COLMADO_ID = 1;
const DELIVERY_ID = 10;

type PedidoFixture = {
  id: number;
  clienteNombre: string;
  clienteWhatsapp: string;
  clienteUbicacion: string;
  productos: string;
  total: string;
  totalConfirmado: string | null;
  montoPago: string;
  necesitaDevuelta: boolean;
  vueltoEntregado: string | null;
  vueltoEntregadoAlDelivery: boolean;
  vueltoEntregadoAt: string | null;
  vueltoEntregadoPor: string | null;
  estado: string;
  metodoPago: string | null;
  fechaCreacion: string;
  motivoRetorno: string | null;
  cuadreId: number | null;
  deliveryId: number | null;
  tipoEntrega?: "delivery" | "pickup";
  metricasDistancia?: {
    estado: "disponible" | "pickup" | "ubicacion_cliente_incompleta" | "no_se_pudo_calcular" | "sucursales_sin_ubicacion" | "fuera_de_radio";
    sucursales: Array<{
      sucursalId: number;
      nombreSucursal: string;
      esSucursalOrigen: boolean;
      esMasCercana: boolean;
      distanciaMillas: number;
      tiempoEstimadoMinutos: number;
    }>;
    sucursalesSinUbicacion: number;
    sucursalesFueraDeRadio: number;
  };
};

const cashOrder: PedidoFixture = {
  id: 1,
  clienteNombre: "Ana Pérez",
  clienteWhatsapp: "18091111111",
  clienteUbicacion: "Calle 1",
  productos: JSON.stringify([{ nombre: "Arroz", cantidad: 1, precio: "100" }]),
  total: "100.00",
  totalConfirmado: null,
  montoPago: "200.00",
  necesitaDevuelta: true,
  vueltoEntregado: null,
  vueltoEntregadoAlDelivery: false,
  vueltoEntregadoAt: null,
  vueltoEntregadoPor: null,
  estado: "en_camino",
  metodoPago: "efectivo",
  fechaCreacion: new Date().toISOString(),
  motivoRetorno: null,
  cuadreId: null,
  deliveryId: DELIVERY_ID,
};

const nonCashOrder: PedidoFixture = {
  id: 2,
  clienteNombre: "Luis García",
  clienteWhatsapp: "18092222222",
  clienteUbicacion: "Calle 2",
  productos: JSON.stringify([{ nombre: "Leche", cantidad: 2, precio: "50" }]),
  total: "100.00",
  totalConfirmado: null,
  montoPago: "100.00",
  necesitaDevuelta: false,
  vueltoEntregado: null,
  vueltoEntregadoAlDelivery: false,
  vueltoEntregadoAt: null,
  vueltoEntregadoPor: null,
  estado: "en_camino",
  metodoPago: "transferencia",
  fechaCreacion: new Date().toISOString(),
  motivoRetorno: null,
  cuadreId: null,
  deliveryId: DELIVERY_ID,
};

/**
 * Cash order that has already been reassigned once — the devuelta was
 * handed to the first delivery, so vueltoEntregadoAlDelivery is true.
 * A second reassignment must NOT show the devuelta step again.
 */
const cashOrderAlreadyDevuelta: PedidoFixture = {
  id: 3,
  clienteNombre: "Carmen Ruiz",
  clienteWhatsapp: "18093333333",
  clienteUbicacion: "Calle 3",
  productos: JSON.stringify([{ nombre: "Pan", cantidad: 2, precio: "50" }]),
  total: "100.00",
  totalConfirmado: null,
  montoPago: "200.00",
  necesitaDevuelta: true,
  vueltoEntregado: "100.00",
  vueltoEntregadoAlDelivery: true,
  vueltoEntregadoAt: new Date().toISOString(),
  vueltoEntregadoPor: "colmado",
  estado: "en_camino",
  metodoPago: "efectivo",
  fechaCreacion: new Date().toISOString(),
  motivoRetorno: null,
  cuadreId: null,
  deliveryId: DELIVERY_ID,
};

const delivery = {
  id: DELIVERY_ID,
  nombre: "Juan Delivery",
  whatsappNumero: "18095555555",
  estado: "activo",
};

const colmado = {
  id: COLMADO_ID,
  nombre: "Colmado Test",
  logo: null,
  direccion: "Av. Principal",
  whatsappNumero: "18090000000",
  telefonoAlternativo: null,
  impuesto: "0",
  costoDelivery: "50",
  estado: "activo",
  tipoNegocio: "colmado",
  codigoPais: "US",
  simboloMoneda: "RD$",
};

// ── Fetch mock factory ────────────────────────────────────────────────────────

function buildFetchMock(orders: PedidoFixture[] = [cashOrder, nonCashOrder]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method?.toUpperCase() ?? "GET";
    const path = typeof url === "string" ? url : String(url);

    // Mutations — return empty success
    if (method === "PATCH" || method === "POST") {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Auth
    if (path.includes("/api/auth/session")) {
      return new Response(
        JSON.stringify({ isAuthenticated: true, user: { id: 1 } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (path.includes("/api/user/role")) {
      return new Response(
        JSON.stringify({ colmadoId: COLMADO_ID, role: "admin" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Colmado data
    if (path.match(new RegExp(`/api/colmados/${COLMADO_ID}$`))) {
      return new Response(JSON.stringify(colmado), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pedidos
    if (path.includes(`/api/colmados/${COLMADO_ID}/pedidos`)) {
      return new Response(JSON.stringify(orders), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Deliveries
    if (path.includes(`/api/colmados/${COLMADO_ID}/deliveries`)) {
      return new Response(JSON.stringify([delivery]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Unread messages
    if (path.includes("conversaciones/unread")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Suscripcion
    if (path.includes("suscripcion")) {
      return new Response(JSON.stringify({ plan: { nombre: "Pro" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fallback
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// ── Helper: render page ───────────────────────────────────────────────────────

async function renderPedidosPage(
  orders: PedidoFixture[] = [cashOrder, nonCashOrder],
  waitForOrderId = cashOrder.id
) {
  vi.stubGlobal("fetch", buildFetchMock(orders));

  const { default: PedidosPage } = await import(
    "@/pages/negocio/pedidos"
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <PedidosPage />
    </QueryClientProvider>
  );

  // Wait for the target order's reasignar button to appear
  await waitFor(
    () => {
      expect(
        screen.getByTestId(`reasignar-delivery-${waitForOrderId}`)
      ).toBeInTheDocument();
    },
    { timeout: 5000 }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Reasignar dialog — devuelta step", () => {
  beforeEach(() => {
    // Reset module registry so each test gets a fresh component instance.
    // The actual fetch stub is applied inside renderPedidosPage.
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows devuelta step after selecting a delivery for a cash (efectivo) en_camino order", async () => {
    const user = userEvent.setup();
    await renderPedidosPage();

    // Open the reassign dialog for the cash order
    await user.click(
      screen.getByTestId(`reasignar-delivery-${cashOrder.id}`)
    );

    // The "select" step should be visible — delivery button present
    await waitFor(() => {
      expect(
        screen.getByTestId(`select-delivery-${DELIVERY_ID}`)
      ).toBeInTheDocument();
    });

    // Click the delivery to trigger assignment
    await user.click(screen.getByTestId(`select-delivery-${DELIVERY_ID}`));

    // The dialog should advance to the devuelta (vuelto) step
    await waitFor(() => {
      expect(
        screen.getByTestId(`asignar-entregar-vuelto-${cashOrder.id}`)
      ).toBeInTheDocument();
    });

    // The devuelta input should also be present
    expect(
      screen.getByTestId(`asignar-input-vuelto-${cashOrder.id}`)
    ).toBeInTheDocument();
  });

  it("closes the dialog immediately (no devuelta step) for a non-cash en_camino order", async () => {
    const user = userEvent.setup();
    await renderPedidosPage();

    // Open the reassign dialog for the non-cash order
    await user.click(
      screen.getByTestId(`reasignar-delivery-${nonCashOrder.id}`)
    );

    // Wait for the delivery list to appear
    await waitFor(() => {
      expect(
        screen.getByTestId(`select-delivery-${DELIVERY_ID}`)
      ).toBeInTheDocument();
    });

    // Click the delivery
    await user.click(screen.getByTestId(`select-delivery-${DELIVERY_ID}`));

    // The devuelta step button must NOT appear
    await waitFor(() => {
      expect(
        screen.queryByTestId(`asignar-entregar-vuelto-${nonCashOrder.id}`)
      ).not.toBeInTheDocument();
    });

    // The delivery selection button itself should also be gone (dialog closed)
    expect(
      screen.queryByTestId(`select-delivery-${DELIVERY_ID}`)
    ).not.toBeInTheDocument();
  });

  /**
   * Scenario C — second reassignment of a cash order that already had its
   * devuelta handed over to the first delivery (vueltoEntregadoAlDelivery: true).
   *
   * Expected behaviour: the dialog closes immediately after selecting the new
   * delivery — the devuelta step must NOT appear a second time.
   *
   * Why: the condition in pedidos.tsx checks
   *   `metodoPago === "efectivo" && !vueltoEntregadoAlDelivery`
   * before advancing to the vuelto step.  When the flag is already true the
   * cash has already been accounted for and asking again would double-count.
   */
  it("skips the devuelta step when reassigning a cash order that already had vueltoEntregadoAlDelivery set to true", async () => {
    const user = userEvent.setup();

    // Render with only the already-devuelta cash order so the reasignar button
    // is unambiguously present
    await renderPedidosPage(
      [cashOrderAlreadyDevuelta],
      cashOrderAlreadyDevuelta.id
    );

    // Open the reassign dialog
    await user.click(
      screen.getByTestId(`reasignar-delivery-${cashOrderAlreadyDevuelta.id}`)
    );

    // Delivery list should appear (select step)
    await waitFor(() => {
      expect(
        screen.getByTestId(`select-delivery-${DELIVERY_ID}`)
      ).toBeInTheDocument();
    });

    // Select the delivery — this is the second reassignment
    await user.click(screen.getByTestId(`select-delivery-${DELIVERY_ID}`));

    // The devuelta step must NOT appear — dialog should have closed
    await waitFor(() => {
      expect(
        screen.queryByTestId(
          `asignar-entregar-vuelto-${cashOrderAlreadyDevuelta.id}`
        )
      ).not.toBeInTheDocument();
    });

    // The delivery list itself should also be gone (dialog closed)
    expect(
      screen.queryByTestId(`select-delivery-${DELIVERY_ID}`)
    ).not.toBeInTheDocument();

    // The devuelta input must not be present either
    expect(
      screen.queryByTestId(
        `asignar-input-vuelto-${cashOrderAlreadyDevuelta.id}`
      )
    ).not.toBeInTheDocument();
  });

  it("shows the origin distance and the closest sibling branch without changing the order", async () => {
    const pedidoConDistancias: PedidoFixture = {
      ...cashOrder,
      metricasDistancia: {
        estado: "disponible",
        sucursalesSinUbicacion: 0,
        sucursalesFueraDeRadio: 0,
        sucursales: [
          {
            sucursalId: COLMADO_ID,
            nombreSucursal: "Sucursal origen",
            esSucursalOrigen: true,
            esMasCercana: false,
            distanciaMillas: 2.4,
            tiempoEstimadoMinutos: 11,
          },
          {
            sucursalId: 2,
            nombreSucursal: "Sucursal Centro",
            esSucursalOrigen: false,
            esMasCercana: true,
            distanciaMillas: 1.1,
            tiempoEstimadoMinutos: 6,
          },
        ],
      },
    };

    await renderPedidosPage([pedidoConDistancias], pedidoConDistancias.id);

    const metricas = screen.getByTestId(`pedido-distancia-${pedidoConDistancias.id}`);
    expect(metricas).toHaveTextContent(/Desde Sucursal origen:\s*2\.4 mi/);
    expect(metricas).toHaveTextContent(/Sucursal Centro:\s*1\.1 mi/);
    expect(metricas).toHaveTextContent("Más cercana");
  });
});
