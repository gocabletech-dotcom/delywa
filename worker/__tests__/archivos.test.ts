// @vitest-environment node
// Pruebas con D1 y R2 locales en memoria: nunca se toca el bucket real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, menuProductos } from "@shared/schema";
import { createTestApp } from "./helpers";
import { archivosDelNegocio, borrarArchivosHuerfanos, borrarSiHuerfano } from "../lib/archivos";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => { t = await createTestApp(); }, 60_000);
afterAll(async () => { await t?.dispose(); });

const existe = async (url: string) => Boolean(await t.env.UPLOADS.head(url.slice("/uploads/".length)));

describe("fotos que ya nadie usa", () => {
  it("borra la foto solo cuando ningún producto la usa", async () => {
    const [n] = await t.db.insert(colmados).values({ nombre: "Resto", slug: "resto-fotos", whatsappNumero: "18096660001", direccion: "A", planId: 1, tipoNegocio: "restaurant" }).returning();
    const url = `/uploads/productos/${n.id}/foto-1.jpg`;
    await t.env.UPLOADS.put(url.slice(9), "imagen");
    const [a] = await t.db.insert(menuProductos).values({ colmadoId: n.id, nombre: "Pizza", precio: "100", categoria: "Comidas", imagen: url } as any).returning();
    const [b] = await t.db.insert(menuProductos).values({ colmadoId: n.id, nombre: "Pizza copia", precio: "100", categoria: "Comidas", imagen: url } as any).returning();
    await t.db.delete(menuProductos).where(eq(menuProductos.id, a.id));
    expect(await borrarSiHuerfano(t.env, url)).toBe(false);
    expect(await existe(url)).toBe(true);
    await t.db.delete(menuProductos).where(eq(menuProductos.id, b.id));
    expect(await borrarSiHuerfano(t.env, url)).toBe(true);
    expect(await existe(url)).toBe(false);
    // Nunca toca direcciones ajenas.
    expect(await borrarSiHuerfano(t.env, "https://otro.com/x.jpg")).toBe(false);
  });

  it("al borrar un negocio se van sus fotos y su logo", async () => {
    const logo = "/uploads/logos/77/logo.png";
    const [n] = await t.db.insert(colmados).values({ nombre: "Borrable", slug: "borrable", whatsappNumero: "18096660002", direccion: "A", planId: 1, logo }).returning();
    const foto = `/uploads/productos/${n.id}/foto-2.jpg`;
    await t.env.UPLOADS.put(logo.slice(9), "logo");
    await t.env.UPLOADS.put(foto.slice(9), "foto");
    await t.db.insert(menuProductos).values({ colmadoId: n.id, nombre: "Pan", precio: "10", categoria: "General", imagen: foto } as any);
    const archivos = await archivosDelNegocio(t.db, n.id);
    expect(archivos.sort()).toEqual([foto, logo].sort());
    await t.db.delete(colmados).where(eq(colmados.id, n.id));
    expect(await borrarArchivosHuerfanos(t.env, archivos)).toBe(2);
    expect(await existe(logo)).toBe(false);
    expect(await existe(foto)).toBe(false);
  });
});
