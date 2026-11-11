import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DrawnText = {
  page: number;
  value: string | string[];
  y: number;
};

let currentPage = 1;
const drawnText: DrawnText[] = [];
const drawnLines: Array<{ page: number; y1: number; y2: number }> = [];

function wrapTextForPdfMock(text: string, maxWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth));
  const lines: string[] = [];
  let currentLine = "";

  const addChunk = (chunk: string) => {
    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = chunk;
  };

  for (const word of text.split(/\s+/)) {
    if (!word) continue;

    if (word.length > maxChars) {
      addChunk(word.slice(0, maxChars));
      let remaining = word.slice(maxChars);
      while (remaining.length > maxChars) {
        lines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
      }
      currentLine = remaining;
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
    } else {
      addChunk(word);
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

const pdf = {
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setDrawColor: vi.fn(),
  line: vi.fn((_x1: number, y1: number, _x2: number, y2: number) => {
    drawnLines.push({ page: currentPage, y1, y2 });
  }),
  text: vi.fn((value: string | string[], _x: number, y: number) => {
    drawnText.push({ page: currentPage, value, y });
  }),
  splitTextToSize: vi.fn((text: string, maxWidth: number) => wrapTextForPdfMock(text, maxWidth)),
  addPage: vi.fn(() => {
    currentPage += 1;
  }),
  save: vi.fn(),
  setTextColor: vi.fn(),
};

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(function MockJsPdf() {
    return pdf;
  }),
}));

import { generateOrderPdf, printOrderTicket, printOrderWindow } from "../PrinterService";

const colmado = {
  id: 1,
  nombre: "Colmado Central",
  direccion: "Av. Principal 10",
  whatsappNumero: "18095550123",
  costoDelivery: "99",
};
const toast = vi.fn();
const pedidoBase = {
  id: 41,
  clienteNombre: "Ana",
  clienteWhatsapp: "18095550124",
  clienteUbicacion: "Calle 1",
  productos: JSON.stringify([{ nombre: "Arroz", cantidad: 1, monto: 100 }]),
  total: "125",
  estado: "pendiente",
  creadoEn: "2026-08-24T12:00:00.000Z",
};

describe("PrinterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    currentPage = 1;
    drawnText.length = 0;
    drawnLines.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("iframe").forEach((iframe) => iframe.remove());
  });

  it("prints pickup tickets with no delivery charge even when the store now charges one", () => {
    printOrderTicket(
      { ...pedidoBase, tipoEntrega: "pickup", costoDeliveryAplicado: "99", clienteUbicacion: "Recoger en Av. Principal 10" },
      colmado,
      toast
    );

    const printedMarkup = document.querySelector("iframe")?.contentDocument?.body.innerHTML || "";
    expect(printedMarkup).toContain("Pickup:");
    expect(printedMarkup).toContain("RD$0");
    expect(printedMarkup).not.toContain("Delivery:");
  });

  it("uses the applied delivery charge in window tickets and PDFs, not the current store charge", () => {
    const written: string[] = [];
    vi.spyOn(window, "open").mockReturnValue({
      document: { write: (html: string) => written.push(html), close: vi.fn() },
      print: vi.fn(),
      close: vi.fn(),
      onafterprint: null,
    } as unknown as Window);
    const pedido = { ...pedidoBase, tipoEntrega: "delivery" as const, costoDeliveryAplicado: "25" };

    printOrderWindow(pedido, colmado, toast);
    generateOrderPdf(pedido, colmado, toast);

    expect(written[0]).toContain("Delivery:</span><span>RD$25");
    expect(written[0]).not.toContain("RD$99");
    expect(pdf.text).toHaveBeenCalledWith(
      "Delivery: RD$25",
      75,
      expect.any(Number),
      { align: "right" }
    );
  });

  it("wraps long addresses and product names in browser print tickets while keeping totals and footer", () => {
    const written: string[] = [];
    vi.spyOn(window, "open").mockReturnValue({
      document: { write: (html: string) => written.push(html), close: vi.fn() },
      print: vi.fn(),
      close: vi.fn(),
      onafterprint: null,
    } as unknown as Window);
    const longProductName =
      "Caja familiar de pollo arroz habichuela y ensalada para compartir";
    const longDeliveryAddress =
      "Calle Principal número 123, Residencial Las Palmas, edificio 4, apartamento 8B, " +
      "cerca de la avenida Independencia, Santo Domingo, República Dominicana";

    printOrderWindow(
      {
        ...pedidoBase,
        clienteUbicacion: longDeliveryAddress,
        productos: JSON.stringify([{ nombre: longProductName, cantidad: 1, monto: 100 }]),
        total: "125",
        tipoEntrega: "delivery",
        costoDeliveryAplicado: "25",
      },
      colmado,
      toast
    );

    expect(written).toHaveLength(1);
    const printedMarkup = written[0];
    expect(printedMarkup).toContain(longDeliveryAddress);
    expect(printedMarkup).toContain(longProductName);
    expect(printedMarkup).toContain("table-layout: fixed");
    expect(printedMarkup).toContain("overflow-wrap: anywhere");
    expect(printedMarkup).toContain("word-break: break-word");
    expect(printedMarkup).toContain("TOTAL:</span>");
    expect(printedMarkup).toContain("¡Gracias por su compra!</p>");
    expect(printedMarkup).toContain("Delywa, la forma más fácil de ordenar por WhatsApp");
  });

  it("wraps long store header details while keeping totals and footer in browser print tickets", () => {
    const written: string[] = [];
    vi.spyOn(window, "open").mockReturnValue({
      document: { write: (html: string) => written.push(html), close: vi.fn() },
      print: vi.fn(),
      close: vi.fn(),
      onafterprint: null,
    } as unknown as Window);
    const longStoreName =
      "Supermercado Familiar Las Palmas y Servicios del Vecindario";
    const longStoreAddress =
      "Avenida Independencia número 245, Plaza Comercial Los Jardines, local 12, " +
      "Santo Domingo Este, República Dominicana";
    const longStorePhone = "180955501234567890";

    printOrderWindow(
      {
        ...pedidoBase,
        productos: JSON.stringify([{ nombre: "Arroz", cantidad: 1, monto: 100 }]),
        total: "125",
      },
      {
        ...colmado,
        nombre: longStoreName,
        direccion: longStoreAddress,
        whatsappNumero: longStorePhone,
      },
      toast
    );

    expect(written).toHaveLength(1);
    const printedMarkup = written[0];
    expect(printedMarkup).toContain(`<h1>${longStoreName}</h1>`);
    expect(printedMarkup).toContain(`<p>${longStoreAddress}</p>`);
    expect(printedMarkup).toContain(`<p>Tel: ${longStorePhone}</p>`);
    expect(printedMarkup).toContain(
      ".header { text-align: center; border-bottom: 2px dashed #333; padding-bottom: 8px; margin-bottom: 8px; overflow-wrap: anywhere; word-break: break-word; }"
    );
    expect(printedMarkup).toContain("TOTAL:</span>");
    expect(printedMarkup).toContain("¡Gracias por su compra!</p>");
    expect(printedMarkup).toContain("Delywa, la forma más fácil de ordenar por WhatsApp");
  });

  it("repeats the store, order, and product columns on PDF continuation pages", () => {
    const productosLargos = Array.from({ length: 55 }, (_, index) => ({
      nombre: `Producto largo ${index + 1}`,
      cantidad: 1,
      monto: 10,
    }));

    generateOrderPdf(
      {
        ...pedidoBase,
        productos: JSON.stringify(productosLargos),
        total: "550",
        tipoEntrega: "delivery",
        costoDeliveryAplicado: "25",
      },
      colmado,
      toast
    );

    expect(pdf.addPage).toHaveBeenCalled();
    expect(pdf.text).toHaveBeenCalledWith("Colmado Central", 40, 8, { align: "center" });
    expect(pdf.text).toHaveBeenCalledWith("PEDIDO #41 (cont.)", 40, 12, { align: "center" });
    expect(
      pdf.text.mock.calls.filter(([text]) => text === "Producto")
    ).toHaveLength(2);
  });

  it("keeps all product rows and receipt totals inside page boundaries for many products", () => {
    const productos = Array.from({ length: 60 }, (_, index) => ({
      nombre: `Producto ${index + 1}`,
      cantidad: (index % 3) + 1,
      monto: 10,
    }));

    generateOrderPdf(
      {
        ...pedidoBase,
        productos: JSON.stringify(productos),
        total: "600",
        tipoEntrega: "delivery",
        costoDeliveryAplicado: "25",
      },
      colmado,
      toast
    );

    const safeBottom = 297 - 15;
    const overflowingText = drawnText.filter(({ value, y }) => {
      const lineCount = Array.isArray(value) ? value.length : 1;
      return y + Math.max(0, lineCount - 1) * 4 > safeBottom;
    });
    const overflowingLines = drawnLines.filter(
      ({ y1, y2 }) => y1 > safeBottom || y2 > safeBottom
    );

    expect(overflowingText).toEqual([]);
    expect(overflowingLines).toEqual([]);

    const renderedProducts = drawnText.filter(({ value }) => {
      const lines = Array.isArray(value) ? value : [value];
      return lines.some((line) => /^Producto \d+$/.test(line));
    });

    expect(renderedProducts).toHaveLength(productos.length);
    expect(new Set(renderedProducts.map(({ page }) => page)).size).toBeGreaterThan(1);
    expect(
      drawnText.some(({ value }) => {
        const lines = Array.isArray(value) ? value : [value];
        return lines.some((line) => line.startsWith("TOTAL:"));
      })
    ).toBe(true);
  });

  it("wraps long product names and delivery addresses without pushing totals or footer past the page", () => {
    const longProductName =
      "Caja familiar de pollo arroz habichuela y ensalada para compartir";
    const productos = Array.from({ length: 16 }, (_, index) => ({
      nombre: `${longProductName} ${index + 1}`,
      cantidad: 1,
      monto: 100,
    }));
    const longDeliveryAddress =
      "Calle Principal número 123, Residencial Las Palmas, edificio 4, apartamento 8B, " +
      "cerca de la avenida Independencia, Santo Domingo, República Dominicana";

    generateOrderPdf(
      {
        ...pedidoBase,
        clienteUbicacion: longDeliveryAddress,
        productos: JSON.stringify(productos),
        total: "1625",
        tipoEntrega: "delivery",
        costoDeliveryAplicado: "25",
      },
      colmado,
      toast
    );

    const safeBottom = 297 - 15;
    const overflowingText = drawnText.filter(({ value, y }) => {
      const lineCount = Array.isArray(value) ? value.length : 1;
      return y + Math.max(0, lineCount - 1) * 4 > safeBottom;
    });
    const overflowingLines = drawnLines.filter(
      ({ y1, y2 }) => y1 > safeBottom || y2 > safeBottom
    );

    const addressCall = pdf.splitTextToSize.mock.calls.find(([text]) =>
      String(text).startsWith("Dir: ")
    );
    const productCalls = pdf.splitTextToSize.mock.calls.filter(([text]) =>
      String(text).startsWith(longProductName)
    );
    const addressLines = addressCall
      ? wrapTextForPdfMock(String(addressCall[0]), Number(addressCall[1]))
      : [];
    const wrappedProductRows = drawnText.filter(
      ({ value }) =>
        Array.isArray(value) &&
        value.length > 1 &&
        value.some((line) => line.startsWith("Caja familiar"))
    );

    expect(addressCall).toBeDefined();
    expect(addressLines.length).toBeGreaterThan(1);
    expect(productCalls).toHaveLength(productos.length);
    expect(wrappedProductRows).toHaveLength(productos.length);
    expect(overflowingText).toEqual([]);
    expect(overflowingLines).toEqual([]);
    expect(
      drawnText.some(({ value }) => value === "¡Gracias por su compra!")
    ).toBe(true);
    expect(
      drawnText.some(({ value }) =>
        Array.isArray(value)
          ? value.some((line) => line.startsWith("Delywa, la forma más fácil"))
          : value.startsWith("Delywa, la forma más fácil")
      )
    ).toBe(true);
    expect(
      drawnText.some(({ value }) => {
        const lines = Array.isArray(value) ? value : [value];
        return lines.some((line) => line.startsWith("TOTAL:"));
      })
    ).toBe(true);
  });
});
