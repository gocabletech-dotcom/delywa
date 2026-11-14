// @vitest-environment node
// Datos públicos del negocio para la página de la sucursal y el portal del repartidor.
// D1 local en memoria con datos inventados; no toca la base real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { colmados } from "@shared/schema";
import { createTestApp } from "./helpers";

let t: Awaited<ReturnType<typeof createTestApp>>;
let negocio: any;

beforeAll(async () => {
  t = await createTestApp();
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado IA", slug: "colmado-ia", whatsappNumero: "18093330001", direccion: "Av. 1", planId: 1 }).returning();
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("datos públicos del negocio", () => {
  it("entrega el negocio y su formato de dirección, sin datos secretos", async () => {
    const c = t.client();
    expect((await c.request("GET", "/api/chat-web/colmado/no-existe")).status).toBe(404);
    const n = (await c.request("GET", "/api/chat-web/colmado/colmado-ia")).json;
    expect(n).toMatchObject({ id: negocio.id, nombre: "Colmado IA", codigoPais: "DO", etiquetaEstado: "Provincia" });
    expect(n.whatsappAccessToken).toBeUndefined();
  });

  it("el chat con IA heredado ya no existe", async () => {
    const c = t.client();
    for (const ruta of ["/api/chat-web/session", "/api/chat-web/message", "/api/chat-web/voice-message", "/api/chat-web/location", "/api/chat-web/comprobante"]) {
      expect((await c.request("POST", ruta, {})).status).toBe(501);
    }
    expect((await c.request("GET", "/api/chat-web/menu/colmado-ia")).status).toBe(501);
  });
});
