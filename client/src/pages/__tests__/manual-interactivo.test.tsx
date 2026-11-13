import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import ManualInteractivo from "@/components/manual/ManualInteractivo";
import { GUIA } from "@/manual/guia";
import CAPTURAS from "@/manual/capturas.json";

const irA = async (hash: string) => {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
};

describe("manual interactivo", () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/manual"); });
  afterEach(() => cleanup());

  it("cada tema usa ids únicos, sus grupos existen y su captura tiene un punto por selector", () => {
    for (const [clave, M] of Object.entries(GUIA)) {
      const ids = M.modulos.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [, lista] of M.grupos) for (const id of lista) expect(ids).toContain(id);
      for (const id of M.empieza) expect(ids).toContain(id);
      for (const m of M.modulos) {
        for (const sufijo of ["", "@cel"]) {
          const cap = (CAPTURAS as Record<string, { spots: unknown[] }>)[`${clave}.${m.id}${sufijo}`];
          if (m.cap && cap) expect(cap.spots).toHaveLength(m.spots.length);
        }
      }
    }
  });

  it("muestra los tres manuales, abre un tema y guarda lo aprendido", async () => {
    render(<ManualInteractivo />);
    expect(screen.getByTestId("manual-tab-negocio")).toBeTruthy();
    expect(screen.getByTestId("manual-tab-repartidor")).toBeTruthy();
    expect(screen.getByTestId("manual-tab-cliente")).toBeTruthy();
    expect(screen.getByText("0/" + GUIA.negocio.modulos.length)).toBeTruthy();

    await irA("#negocio/retorno");
    expect(screen.getByTestId("manual-modulo-retorno")).toBeTruthy();
    fireEvent.click(screen.getByTestId("manual-aprendido"));
    expect(JSON.parse(localStorage.getItem("delywa_man_ok_negocio")!)).toEqual(["retorno"]);

    await irA("#negocio");
    expect(screen.getByText("1/" + GUIA.negocio.modulos.length)).toBeTruthy();
  });

  it("el recorrido avanza por los puntos de la captura", async () => {
    render(<ManualInteractivo />);
    await irA("#negocio/pedidos");
    const cap = (CAPTURAS as Record<string, { spots: unknown[] }>)["negocio.pedidos"];
    if (!cap) return; // sin capturas generadas todavía
    fireEvent.click(screen.getByTestId("manual-siguiente"));
    expect(screen.getByTestId("manual-recorrido").textContent).toContain(`1 de ${cap.spots.filter(Boolean).length}`);
  });

  it("el buscador encuentra temas de los tres manuales y ?solo= deja uno", async () => {
    render(<ManualInteractivo />);
    fireEvent.change(screen.getByTestId("manual-buscar"), { target: { value: "devuelta" } });
    const res = screen.getByTestId("manual-resultados").textContent ?? "";
    expect(res).toContain("Negocio");
    expect(res).toContain("Repartidor");
    cleanup();

    window.history.replaceState(null, "", "/manual?solo=repartidor");
    render(<ManualInteractivo />);
    expect(screen.queryByTestId("manual-switch")).toBeNull();
    expect(screen.getByTestId("manual-inicio-repartidor")).toBeTruthy();
  });
});
