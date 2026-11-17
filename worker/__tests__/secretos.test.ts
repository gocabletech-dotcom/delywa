import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados } from "@shared/schema";
import { createTestApp, type TestApp } from "./helpers";
import { createUser } from "../storage/users";
import { cifrarSecretosPendientes, instalarSecretos } from "../lib/secretos";

// Los tokens de WhatsApp (Meta) y la llave de Evolution de cada negocio se guardan cifrados.
let t: TestApp;
let negocioId: number;
const crudo = async (id: number) => (await t.env.DB.prepare("SELECT whatsapp_access_token AS meta, evolution_api_key AS evo FROM colmados WHERE id = ?").bind(id).first<{ meta: string | null; evo: string | null }>())!;

beforeAll(async () => {
  t = await createTestApp();
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
  instalarSecretos("clave-maestra-de-prueba");
  await createUser(t.db, { idPrefix: "admin", email: "admin-sec@delywa.test", password: "clave-admin-secretos-1", firstName: "Ada", role: "platform_admin" });
  const [n] = await t.db.insert(colmados).values({ nombre: "Colmado Secreto", slug: "colmado-secreto", whatsappNumero: "18096660001", direccion: "Calle 1", planId: 1,
    whatsappPhoneNumberId: "PN-1", whatsappAccessToken: "EAA-token-de-meta-1234", evolutionApiKey: "llave-evolution-9876" }).returning();
  negocioId = n.id;
});
afterAll(async () => { instalarSecretos(undefined); await t.dispose(); });

describe("columnas secretas", () => {
  it("en la base quedan cifradas y el código las lee como texto normal", async () => {
    const guardado = await crudo(negocioId);
    expect(guardado.meta).toMatch(/^c1:/);
    expect(guardado.evo).toMatch(/^c1:/);
    expect(guardado.meta).not.toContain("EAA-token");
    const [leido] = await t.db.select().from(colmados).where(eq(colmados.id, negocioId));
    expect(leido).toMatchObject({ whatsappAccessToken: "EAA-token-de-meta-1234", evolutionApiKey: "llave-evolution-9876" });
    // Dos cifrados del mismo texto no se parecen (cada uno lleva su propio inicio al azar).
    await t.db.update(colmados).set({ evolutionApiKey: "llave-evolution-9876" }).where(eq(colmados.id, negocioId));
    expect((await crudo(negocioId)).evo).not.toBe(guardado.evo);
  });

  it("cifra solos los tokens guardados antes de esta versión", async () => {
    await t.env.DB.prepare("UPDATE colmados SET whatsapp_access_token = ?, evolution_api_key = NULL WHERE id = ?").bind("token-viejo-sin-cifrar", negocioId).run();
    // Mientras tanto se sigue leyendo bien.
    expect((await t.db.select().from(colmados).where(eq(colmados.id, negocioId)))[0].whatsappAccessToken).toBe("token-viejo-sin-cifrar");
    expect(await cifrarSecretosPendientes(t.env)).toBe(1);
    expect((await crudo(negocioId)).meta).toMatch(/^c1:/);
    expect((await crudo(negocioId)).evo).toBeNull();
    expect((await t.db.select().from(colmados).where(eq(colmados.id, negocioId)))[0].whatsappAccessToken).toBe("token-viejo-sin-cifrar");
    expect(await cifrarSecretosPendientes(t.env)).toBe(0);
  });

  it("con otra clave maestra no se puede leer, y no rompe la petición", async () => {
    instalarSecretos("otra-clave");
    expect((await t.db.select().from(colmados).where(eq(colmados.id, negocioId)))[0].whatsappAccessToken).toBe("");
    instalarSecretos("clave-maestra-de-prueba");
  });

  it("la plataforma nunca recibe los tokens completos", async () => {
    const admin = t.client();
    expect((await admin.request("POST", "/api/auth/login", { username: "admin-sec@delywa.test", password: "clave-admin-secretos-1" })).status).toBe(200);
    const lista = (await admin.request("GET", "/api/admin/colmados")).json as any[];
    const n = lista.find((x) => x.id === negocioId);
    expect(n.whatsappAccessToken).toBe("••••frar");
    expect(JSON.stringify(lista)).not.toContain("token-viejo");
  });
});
