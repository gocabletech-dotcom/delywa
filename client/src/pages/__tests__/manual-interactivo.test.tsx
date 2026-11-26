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

describe("manual en inglés", () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState(null, "", "/manual"); });
  afterEach(() => cleanup());

  it("cada tema tiene su traducción con los mismos puntos, pasos, consejos y preguntas", async () => {
    const { EN } = await import("@/manual/guia-en");
    for (const [clave, M] of Object.entries(GUIA) as Array<[keyof typeof EN, (typeof GUIA)[keyof typeof GUIA]]>) {
      expect(EN[clave].grupos).toHaveLength(M.grupos.length);
      for (const m of M.modulos) {
        const t = EN[clave].modulos[m.id];
        expect(t, `${clave}.${m.id}`).toBeTruthy();
        expect(t.spots, `${clave}.${m.id} spots`).toHaveLength(m.spots.length);
        expect(t.pasos?.length ?? 0, `${clave}.${m.id} pasos`).toBe(m.pasos?.length ?? 0);
        expect(t.tips?.length ?? 0, `${clave}.${m.id} tips`).toBe(m.tips?.length ?? 0);
        expect(t.faq?.length ?? 0, `${clave}.${m.id} faq`).toBe(m.faq?.length ?? 0);
      }
    }
  });

  it("el botón EN cambia el manual a inglés y se recuerda", async () => {
    render(<ManualInteractivo />);
    fireEvent.click(screen.getByTestId("manual-idioma-en"));
    expect(screen.getByText("Business manual")).toBeTruthy();
    expect(localStorage.getItem("delywa_man_idioma")).toBe("en");
    cleanup();
    render(<ManualInteractivo />);
    expect(screen.getByText("Business manual")).toBeTruthy();
    fireEvent.click(screen.getByTestId("manual-idioma-es"));
    expect(screen.getByText("Manual del negocio")).toBeTruthy();
  });

  it("?lang=en abre el manual en inglés", () => {
    window.history.replaceState(null, "", "/manual?solo=repartidor&lang=en");
    render(<ManualInteractivo />);
    expect(screen.getByText("Delivery manual")).toBeTruthy();
  });
});
