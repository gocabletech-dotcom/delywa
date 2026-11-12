import { describe, expect, it } from "vitest";
import { needsSavedAddress, resolveDeliveryAddress } from "../lib/deliveryAddress";

describe("resolveDeliveryAddress", () => {
  it("replaces a ZIP-only legacy order address with the saved customer address and GPS", () => {
    const resolved = resolveDeliveryAddress({
      pedidoUbicacion: "ZIP Code: 27540",
      cliente: {
        direccionTexto: "123 Main Street, Cary, North Carolina 27513",
        latitud: "35.7915",
        longitud: "-78.7811",
      },
    });

    expect(resolved).toEqual({
      direccion: "123 Main Street, Cary, North Carolina 27513",
      latitud: "35.7915",
      longitud: "-78.7811",
    });
  });

  it("uses a complete saved conversation address even when no GPS was shared", () => {
    const resolved = resolveDeliveryAddress({
      pedidoUbicacion: "Código postal: 10101",
      conversacion: {
        direccionTexto: "Calle 8, Ensanche Naco, Santo Domingo, 10101",
      },
    });

    expect(resolved).toEqual({
      direccion: "Calle 8, Ensanche Naco, Santo Domingo, 10101",
      latitud: null,
      longitud: null,
    });
  });

  it("keeps a complete address written specifically on the order", () => {
    const resolved = resolveDeliveryAddress({
      pedidoUbicacion: "Apto. 4B, Calle 19 #42, Santiago, 51000",
      pedidoLatitud: "19.4517",
      pedidoLongitud: "-70.6970",
      cliente: {
        direccionTexto: "Calle Principal, Santiago, 51000",
        latitud: "19.4520",
        longitud: "-70.6980",
      },
    });

    expect(resolved).toEqual({
      direccion: "Apto. 4B, Calle 19 #42, Santiago, 51000",
      latitud: "19.4517",
      longitud: "-70.6970",
    });
  });
});

describe("needsSavedAddress", () => {
  it.each(["", "27540", "ZIP Code: 27540", "Código postal: 10101", "https://maps.google.com/?q=35,-78"])(
    "recognizes %j as an incomplete display address",
    (address) => {
      expect(needsSavedAddress(address)).toBe(true);
    }
  );

  it("does not replace a complete street address", () => {
    expect(needsSavedAddress("Av. Winston Churchill 12, Santo Domingo, 10127")).toBe(false);
  });
});