/**
 * Tests: ZIP validation in the chat-web address helper form (pedir.tsx)
 *
 * Covers the scenario where requiereCodigoPostal = true:
 *   A — street filled, ZIP blank → error message appears, address NOT sent
 *   B — street filled, ZIP filled after failed attempt → error clears, address IS sent
 *   C — requiereCodigoPostal = false, ZIP blank → address IS sent without error
 *
 * Key elements under test (data-testid):
 *   input-name, input-phone, button-start-chat
 *   button-address-helper, input-addr-calle, input-addr-cp
 *   button-send-address, error-addr-cp
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  useParams: () => ({ codigo: "test-store" }),
  useSearch: () => "",
  useLocation: () => ["/pedir/test-store", vi.fn()],
}));

// jsdom does not implement scrollIntoView — stub it globally so useEffect
// that calls messagesEndRef.current?.scrollIntoView() does not throw.
Element.prototype.scrollIntoView = vi.fn();

// ── Colmado fixtures ──────────────────────────────────────────────────────────

const COLMADO_ZIP_REQUIRED = {
  id: 1,
  nombre: "Test Store",
  logo: null,
  whatsappNumero: "18091234567",
  tipoNegocio: "colmado",
  codigoPais: "US",
  etiquetaEstado: "State",
  etiquetaCodigoPostal: "ZIP Code",
  requiereCodigoPostal: true,
  ejemploDireccion: "123 Main St",
  ejemploCiudad: "New York",
  ejemploEstado: "NY",
  ejemploCodigoPostal: "10001",
};

const COLMADO_ZIP_OPTIONAL = {
  ...COLMADO_ZIP_REQUIRED,
  requiereCodigoPostal: false,
};

const MENU_DATA = {
  usaMenu: false,
  tieneMenu: false,
  simboloMoneda: "$",
  categorias: [],
  productosPorCategoria: {},
};

const SESSION_RESPONSE = {
  sessionId: "sess-test-123",
  historialMensajes: [],
};

// ── Fetch mock factory ────────────────────────────────────────────────────────

function setupFetchMock(
  colmadoOverride = COLMADO_ZIP_REQUIRED,
  sessionResponse = SESSION_RESPONSE
) {
  return vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);

    if (u.includes("/api/chat-web/colmado/")) {
      return { ok: true, json: async () => colmadoOverride };
    }
    if (u.includes("/api/chat-web/menu/")) {
      return { ok: true, json: async () => MENU_DATA };
    }
    if (u.includes("/api/chat-web/check-pedido")) {
      return { ok: true, json: async () => ({ pedido: null }) };
    }
    if (u.includes("/api/chat-web/session")) {
      return { ok: true, json: async () => sessionResponse };
    }
    if (u.includes("/api/chat-web/message")) {
      return {
        ok: true,
        json: async () => ({
          message: {
            id: 99,
            rol: "assistant",
            contenido: "Recibido",
            fechaCreacion: new Date().toISOString(),
          },
        }),
      };
    }
    return { ok: false, json: async () => ({}) };
  });
}

// ── Helper: render page and advance through onboarding to the chat view ───────

async function renderAndReachChat(
  colmado = COLMADO_ZIP_REQUIRED,
  sessionResponse = SESSION_RESPONSE
) {
  const fetchMock = setupFetchMock(colmado, sessionResponse);
  global.fetch = fetchMock;

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Dynamic import so each test gets a fresh module instance with fresh state
  const { default: PedirPage } = await import("../pedir");

  render(
    <QueryClientProvider client={qc}>
      <PedirPage />
    </QueryClientProvider>
  );

  // Wait for onboarding form
  await waitFor(() => screen.getByTestId("input-name"), { timeout: 5000 });

  // Fill name and phone
  await userEvent.type(screen.getByTestId("input-name"), "Ana");
  await userEvent.type(screen.getByTestId("input-phone"), "8091234567");

  // Submit onboarding
  await userEvent.click(screen.getByTestId("button-start-chat"));

  // Wait until initSession was called (session POST fired)
  await waitFor(
    () =>
      fetchMock.mock.calls.some(([u]) =>
        String(u).includes("/api/chat-web/session")
      ),
    { timeout: 5000 }
  );

  // Wait for the address helper toggle button (only rendered in chat view)
  await waitFor(() => screen.getByTestId("button-address-helper"), {
    timeout: 5000,
  });

  return { fetchMock, qc };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("pedir.tsx — address form ZIP validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any stored session so onboarding always shows
    localStorage.clear();
    // Reset module registry so each test gets fresh component state
    vi.resetModules();
  });

  it("A: shows ZIP error and blocks submission when requiereCodigoPostal=true and ZIP is blank", async () => {
    /**
     * Exercises the guard in handleSendAddress:
     *   if (colmado.requiereCodigoPostal && etiquetaCP && !addrCP.trim()) {
     *     setAddrCPError(true); return;
     *   }
     *
     * Expected outcome:
     * - [data-testid="error-addr-cp"] becomes visible after clicking send
     * - No POST to /api/chat-web/messages is made
     */
    const { fetchMock } = await renderAndReachChat(COLMADO_ZIP_REQUIRED);

    // Open address helper panel
    await userEvent.click(screen.getByTestId("button-address-helper"));

    // Address panel must be visible
    await waitFor(() => screen.getByTestId("input-addr-calle"), {
      timeout: 3000,
    });

    // Fill street, leave ZIP blank
    await userEvent.type(screen.getByTestId("input-addr-calle"), "123 Main St");

    // No error yet
    expect(screen.queryByTestId("error-addr-cp")).toBeNull();

    // Click send
    await userEvent.click(screen.getByTestId("button-send-address"));

    // Error must appear, referencing the ZIP label from the colmado
    const errorEl = screen.getByTestId("error-addr-cp");
    expect(errorEl).toBeTruthy();
    expect(errorEl.textContent).toContain("ZIP Code");

    // Message API must NOT have been called
    const messageCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("/api/chat-web/message")
    );
    expect(messageCalls).toHaveLength(0);
  });

  it("B: clears ZIP error and sends address once the ZIP field is filled", async () => {
    /**
     * After a failed attempt (error showing), filling the ZIP field should:
     * - Clear the error immediately (onChange handler: if value => setAddrCPError(false))
     * - Allow submission on the next click
     * - POST the formatted address to /api/chat-web/messages
     */
    const { fetchMock } = await renderAndReachChat(COLMADO_ZIP_REQUIRED);

    await userEvent.click(screen.getByTestId("button-address-helper"));
    await waitFor(() => screen.getByTestId("input-addr-calle"), { timeout: 3000 });

    // First attempt — no ZIP → error
    await userEvent.type(screen.getByTestId("input-addr-calle"), "123 Main St");
    await userEvent.click(screen.getByTestId("button-send-address"));
    expect(screen.getByTestId("error-addr-cp")).toBeTruthy();

    // Fill ZIP → error clears immediately via onChange
    await userEvent.type(screen.getByTestId("input-addr-cp"), "10001");
    expect(screen.queryByTestId("error-addr-cp")).toBeNull();

    // Second attempt — ZIP present → address sent
    await userEvent.click(screen.getByTestId("button-send-address"));

    await waitFor(
      () => {
        const calls = fetchMock.mock.calls.filter(([u]) =>
          String(u).includes("/api/chat-web/message")
        );
        expect(calls.length).toBeGreaterThan(0);
        // Verify the message body includes both the street and ZIP
        // sendMessage POSTs { sessionId, mensaje } — check the `mensaje` field
        const body = JSON.parse(calls[0][1]?.body || "{}");
        expect(body.mensaje).toContain("123 Main St");
        expect(body.mensaje).toContain("ZIP Code: 10001");
      },
      { timeout: 3000 }
    );
  });

  it("C: sends address without ZIP when requiereCodigoPostal is false", async () => {
    /**
     * When the business does not require a postal code, the form should
     * submit with only the street filled — no error, address sent immediately.
     */
    const { fetchMock } = await renderAndReachChat(COLMADO_ZIP_OPTIONAL);

    await userEvent.click(screen.getByTestId("button-address-helper"));
    await waitFor(() => screen.getByTestId("input-addr-calle"), { timeout: 3000 });

    // Fill street only
    await userEvent.type(screen.getByTestId("input-addr-calle"), "456 Oak Ave");
    await userEvent.click(screen.getByTestId("button-send-address"));

    // No error
    expect(screen.queryByTestId("error-addr-cp")).toBeNull();

    // Message sent
    await waitFor(
      () => {
        const calls = fetchMock.mock.calls.filter(([u]) =>
          String(u).includes("/api/chat-web/message")
        );
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );
  });

  it("D: restores the saved ZIP and lets the customer complete it without losing the other address fields", async () => {
    const savedSession = {
      ...SESSION_RESPONSE,
      isReturningClient: true,
      direccionGuardada: "Street Address: 123 Main St, City: New York, State: NY, ZIP Code: 10001",
    };
    const { fetchMock } = await renderAndReachChat(COLMADO_ZIP_REQUIRED, savedSession);

    // Returning customers see the saved address ready for review.
    await waitFor(() => screen.getByTestId("saved-address-notice"), { timeout: 3000 });
    expect((screen.getByTestId("input-addr-calle") as HTMLInputElement).value).toBe("123 Main St");
    expect((screen.getByTestId("input-addr-ciudad") as HTMLInputElement).value).toBe("New York");
    expect((screen.getByTestId("input-addr-estado") as HTMLInputElement).value).toBe("NY");
    expect((screen.getByTestId("input-addr-cp") as HTMLInputElement).value).toBe("10001");

    // A missing required ZIP blocks the reused address, but keeps the rest editable.
    await userEvent.clear(screen.getByTestId("input-addr-cp"));
    await userEvent.click(screen.getByTestId("button-send-address"));
    expect(screen.getByTestId("error-addr-cp").textContent).toContain("ZIP Code");
    expect((screen.getByTestId("input-addr-calle") as HTMLInputElement).value).toBe("123 Main St");
    expect((screen.getByTestId("input-addr-ciudad") as HTMLInputElement).value).toBe("New York");
    expect((screen.getByTestId("input-addr-estado") as HTMLInputElement).value).toBe("NY");

    // Completing the ZIP sends the complete structured address.
    await userEvent.type(screen.getByTestId("input-addr-cp"), "10001");
    await userEvent.click(screen.getByTestId("button-send-address"));
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([u]) =>
        String(u).includes("/api/chat-web/message")
      );
      expect(calls).toHaveLength(1);
      const body = JSON.parse(calls[0][1]?.body || "{}");
      expect(body.mensaje).toContain("Street Address: 123 Main St");
      expect(body.mensaje).toContain("City: New York");
      expect(body.mensaje).toContain("State: NY");
      expect(body.mensaje).toContain("ZIP Code: 10001");
    });
  });
});
