import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { colmados } from "@shared/schema";
import { enlaceChat, subdominioDelHost, subdominioDeSlug } from "@shared/subdominio";
import { createTestApp } from "./helpers";
import { ensureUniqueSlug } from "../storage/colmados";

// Enlace amigable del chat: colmadolasombrita.delywa.com. Datos inventados, base local en memoria.
let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp();
  await t.db.insert(colmados).values({ nombre: "Colmado La Sombrita", slug: "colmado-la-sombrita", whatsappNumero: "18094440101", direccion: "Calle 1", planId: 1 });
});
afterAll(() => t.dispose());

describe("subdominio del colmado", () => {
  it("sale del slug sin guiones y se reconoce en la dirección", () => {
    expect(subdominioDeSlug("colmado-la-sombrita")).toBe("colmadolasombrita");
    expect(subdominioDelHost("colmadolasombrita.delywa.com")).toBe("colmadolasombrita");
    expect(subdominioDelHost("ColmadoLaSombrita.delywa.com:443")).toBe("colmadolasombrita");
    expect(subdominioDelHost("colmadolasombrita.localhost")).toBe("colmadolasombrita");
    expect(subdominioDelHost("delywa.com")).toBeNull();
    expect(subdominioDelHost("www.delywa.com")).toBeNull();
    expect(subdominioDelHost("api.delywa.com")).toBeNull();
    expect(subdominioDelHost("a.b.delywa.com")).toBeNull();
    expect(subdominioDelHost("colmado.otrodominio.com")).toBeNull();
  });

  it("el enlace es el subdominio en delywa.com y /pedir/ en otra dirección", () => {
    expect(enlaceChat("colmado-la-sombrita", "https://delywa.com")).toBe("https://colmadolasombrita.delywa.com");
    expect(enlaceChat("colmado-la-sombrita", "https://www.delywa.com")).toBe("https://colmadolasombrita.delywa.com");
    expect(enlaceChat("colmado-la-sombrita", "http://localhost:8799")).toBe("http://localhost:8799/pedir/colmado-la-sombrita");
    expect(enlaceChat(null, "https://delywa.com")).toBe("");
  });

  it("el chat abre con el subdominio y con el enlace viejo", async () => {
    const c = t.client();
    expect((await c.request("GET", "/api/chat-colmado/colmadolasombrita/info")).json.nombre).toBe("Colmado La Sombrita");
    expect((await c.request("GET", "/api/chat-colmado/colmado-la-sombrita/info")).json.nombre).toBe("Colmado La Sombrita");
    expect((await c.request("GET", "/api/chat-colmado/nadie/info")).status).toBe(404);
  });

  it("un negocio nuevo no puede quedar con el mismo subdominio ni con uno reservado", async () => {
    expect(await ensureUniqueSlug(t.db, "colmadola-sombrita")).toBe("colmadola-sombrita-1");
    expect(await ensureUniqueSlug(t.db, "colmado-la-sombrita")).toBe("colmado-la-sombrita-1");
    expect(await ensureUniqueSlug(t.db, "admin")).toBe("admin-colmado");
    expect(await ensureUniqueSlug(t.db, "colmado-nuevo")).toBe("colmado-nuevo");
  });
});
