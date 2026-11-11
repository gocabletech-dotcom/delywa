import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("wouter", () => ({
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
    user: { id: 1 },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/negocio/NegocioLayout", () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/services/PrinterService", () => ({
  printOrderWindow: vi.fn(),
  generateOrderPdf: vi.fn(),
}));
vi.mock("@/lib/mapUtils", () => ({ buildMapUrl: vi.fn(() => "#") }));

const PEDIDO = {
  id: 44,
  clienteNombre: "Ana Pérez",
  clienteWhatsapp: "18095550123",
  clienteUbicacion: "Calle Principal 1",
  productos: JSON.stringify([{ nombre: "Arroz", cantidad: 1, monto: 100 }]),
  total: "100.00",
  totalConfirmado: null,
  montoPago: "100.00",
  necesitaDevuelta: false,
  vueltoEntregado: null,
  vueltoEntregadoAlDelivery: false,
  vueltoEntregadoAt: null,
  vueltoEntregadoPor: null,
  estado: "pendiente_confirmacion",
  metodoPago: "efectivo",
  fechaCreacion: new Date().toISOString(),
  motivoRetorno: null,
  cuadreId: null,
  deliveryId: 8,
};

const COLMADO = {
  id: 1,
  nombre: "Colmado Test",
  logo: null,
  direccion: "Av. Principal",
  whatsappNumero: "18090000000",
  telefonoAlternativo: null,
  impuesto: "0",
  costoDelivery: "0",
  estado: "activo",
  tipoNegocio: "colmado",
  simboloMoneda: "RD$",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildFetchMock(confirmResponse: Record<string, unknown>, colmado: Record<string, unknown> = COLMADO) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (init?.method === "POST" && path.includes(`/api/pedidos/${PEDIDO.id}/confirmar`)) {
      return jsonResponse(confirmResponse);
    }
    if (path.includes("/api/user/role")) return jsonResponse({ colmadoId: 1, role: "admin" });
    if (path === "/api/colmados/1/pedidos") return jsonResponse([PEDIDO]);
    if (path === "/api/colmados/1/deliveries") return jsonResponse([]);
    if (path === "/api/colmados/1") return jsonResponse(colmado);
    if (path.includes("conversaciones/unread")) return jsonResponse({ count: 0 });
    if (path.includes("suscripcion")) return jsonResponse({ plan: { nombre: "Pro" } });
    return jsonResponse({});
  });
}

async function renderPedidos(confirmResponse: Record<string, unknown>, colmado: Record<string, unknown> = COLMADO) {
  const fetchMock = buildFetchMock(confirmResponse, colmado);
  vi.stubGlobal("fetch", fetchMock);
  const { default: PedidosPage } = await import("@/pages/negocio/pedidos");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <PedidosPage />
    </QueryClientProvider>
  );

  await screen.findByTestId(`confirmar-pedido-${PEDIDO.id}`);
  return fetchMock;
}

describe("Confirmación de pedido por WhatsApp", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("confirms through the integrated channel without leaving an extra WhatsApp tab open", async () => {
    const user = userEvent.setup();
    const openSpy = vi.fn();
    const whatsappWindow = { closed: false, location: { href: "" }, close: vi.fn() };
    openSpy.mockReturnValue(whatsappWindow);
    vi.stubGlobal("open", openSpy);
    const fetchMock = await renderPedidos({
      success: true,
      necesitaEnvioManual: false,
      envioWhatsApp: true,
      canalEnvio: "integrado",
    });

    await user.click(screen.getByTestId(`confirmar-pedido-${PEDIDO.id}`));
    await user.click(await screen.findByTestId("button-enviar-confirmacion"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/pedidos/${PEDIDO.id}/confirmar`,
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.queryByTestId("button-enviar-confirmacion")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Abrir WhatsApp")).not.toBeInTheDocument();
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank");
    expect(whatsappWindow.close).toHaveBeenCalled();
  });

  it("opens manual WhatsApp automatically when no integrated channel can deliver", async () => {
    const user = userEvent.setup();
    const openSpy = vi.fn();
    const whatsappWindow = { closed: false, location: { href: "" }, close: vi.fn() };
    openSpy.mockReturnValue(whatsappWindow);
    vi.stubGlobal("open", openSpy);
    await renderPedidos({
      success: true,
      necesitaEnvioManual: true,
      motivoEnvioManual: "No hay un canal integrado disponible.",
      whatsappNumero: PEDIDO.clienteWhatsapp,
      mensajeParaEnviar: "Tu pedido está confirmado.",
    });

    await user.click(screen.getByTestId(`confirmar-pedido-${PEDIDO.id}`));
    await user.click(await screen.findByTestId("button-enviar-confirmacion"));

    await waitFor(() => {
      expect(screen.queryByTestId("button-enviar-confirmacion")).not.toBeInTheDocument();
    });
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank");
    expect(whatsappWindow.location.href).toBe(
      `https://wa.me/${PEDIDO.clienteWhatsapp}?text=${encodeURIComponent("Tu pedido está confirmado.")}`
    );
  });

  it("opens the native share panel with the tracking URL when available", async () => {
    const user = userEvent.setup();
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: shareMock,
    });
    await renderPedidos({ success: true });

    await user.click(screen.getByTestId(`compartir-seguimiento-nativo-${PEDIDO.id}`));

    expect(shareMock).toHaveBeenCalledWith({
      title: `Seguimiento del pedido #${PEDIDO.id}`,
      text: "Consulta el estado de tu pedido",
      url: `${window.location.origin}/compartir/seguimiento/${PEDIDO.id}`,
    });
  });

  it("keeps copying the tracking URL when native sharing is unavailable", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderPedidos({ success: true });

    await user.click(screen.getByTestId(`compartir-seguimiento-nativo-${PEDIDO.id}`));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/compartir/seguimiento/${PEDIDO.id}`
    );
  });

  it("previews the same tracking link with the fallback business image", async () => {
    const user = userEvent.setup();
    await renderPedidos({ success: true });

    await user.click(screen.getByTestId(`vista-previa-seguimiento-${PEDIDO.id}`));

    expect(screen.getByTestId("vista-previa-tarjeta")).toHaveTextContent(
      "Seguimiento de pedido · Colmado Test"
    );
    expect(screen.getByTestId("vista-previa-tarjeta")).toHaveTextContent(
      `Sigue el estado del pedido #${PEDIDO.id} de Colmado Test.`
    );
    expect(screen.getByTestId("vista-previa-url")).toHaveTextContent(
      `${window.location.origin}/compartir/seguimiento/${PEDIDO.id}`
    );
    expect(screen.getByAltText("Logo de Colmado Test")).toHaveAttribute(
      "src",
      `${window.location.origin}/delywa-logo.png`
    );
  });

  it("previews the configured title and description used by the public share link", async () => {
    const user = userEvent.setup();
    await renderPedidos({
      success: true,
    }, {
      ...COLMADO,
      tituloCompartirPedido: "¡Tu pedido va en camino!",
      descripcionCompartirPedido: "Consulta el estado de tu pedido en tiempo real.",
    });

    await user.click(screen.getByTestId(`vista-previa-seguimiento-${PEDIDO.id}`));

    expect(screen.getByTestId("vista-previa-tarjeta")).toHaveTextContent(
      "¡Tu pedido va en camino!"
    );
    expect(screen.getByTestId("vista-previa-tarjeta")).toHaveTextContent(
      "Consulta el estado de tu pedido en tiempo real."
    );
  });
});
