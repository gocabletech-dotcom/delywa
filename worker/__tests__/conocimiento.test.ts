import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { colmados, conocimientoArchivos, paises } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { conocimientoRelevante, palabras } from "../lib/conocimiento";

// Conocimiento del bot por niveles y solo la parte que tiene que ver con el mensaje.
let t: Awaited<ReturnType<typeof createTestApp>>;
let negocio: any, sucursal: any, otro: any, rd: number, otroPais: number;

beforeAll(async () => {
  t = await createTestApp();
  [{ id: rd }] = await t.db.select({ id: paises.id }).from(paises).where(eq(paises.codigo, "DO"));
  const [p2] = await t.db.select({ id: paises.id }).from(paises).where(eq(paises.codigo, "US"));
  otroPais = p2?.id ?? (await t.db.insert(paises).values({ nombre: "Otro", codigo: "ZZ", codigoTelefono: "999", moneda: "X", simboloMoneda: "X", zonaHoraria: "UTC" } as any).returning())[0].id;
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Saber", slug: "colmado-saber", whatsappNumero: "18097771111", direccion: "C1", planId: 1, paisId: rd }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Colmado Saber 2", slug: "colmado-saber-2", whatsappNumero: "18097771112", direccion: "C2", planId: 1, paisId: rd, negocioPrincipalId: negocio.id }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro Colmado", slug: "otro-saber", whatsappNumero: "18097771113", direccion: "C3", planId: 1, paisId: rd }).returning();
  await t.db.insert(conocimientoArchivos).values([
    { tipoNegocio: "colmado", nombre: "Políticas generales", contenido: "Los pedidos se pagan al recibir.\n\nNo se venden bebidas alcohólicas a menores de edad." },
    { tipoNegocio: "colmado", paisId: rd, nombre: "Feriados RD", contenido: "El 27 de febrero muchos colmados cierran temprano por el Día de la Independencia." },
    { tipoNegocio: "colmado", paisId: otroPais, nombre: "Solo otro país", contenido: "Feriado de otro país: Thanksgiving." },
    { tipoNegocio: "colmado", colmadoId: negocio.id, nombre: "¿Venden gas?", contenido: "Sí, cambiamos tanques de gas de 25 libras." },
    { tipoNegocio: "colmado", colmadoId: otro.id, nombre: "¿Venden hielo?", contenido: "Sí, fundas de hielo." },
  ]);
});
afterAll(() => t.dispose());

describe("conocimiento relevante", () => {
  it("manda solo lo que tiene que ver con el mensaje, del negocio, de su país y general", async () => {
    const gas = await conocimientoRelevante(t.db, negocio, "¿ustedes venden gas?");
    expect(gas.map((g) => g.nombre)).toEqual(["¿Venden gas?"]);
    // Una sucursal usa las preguntas de su principal.
    expect((await conocimientoRelevante(t.db, sucursal, "tienen gas"))[0].nombre).toBe("¿Venden gas?");
    const feriado = await conocimientoRelevante(t.db, negocio, "abren el 27 de febrero?");
    expect(feriado.map((g) => g.nombre)).toContain("Feriados RD");
    expect(JSON.stringify(feriado)).not.toContain("Thanksgiving");
    // Lo de otro negocio nunca llega.
    expect(JSON.stringify(await conocimientoRelevante(t.db, negocio, "venden hielo?"))).not.toContain("fundas de hielo");
    // De un documento solo va el trozo que sirve.
    const menores = await conocimientoRelevante(t.db, negocio, "le venden alcohol a menores?");
    expect(menores[0].contenido).toContain("menores");
    expect(menores[0].contenido).not.toContain("pagan al recibir");
  });

  it("sin coincidencias manda solo las preguntas del negocio", async () => {
    const r = await conocimientoRelevante(t.db, negocio, "xyzzy");
    expect(r.map((x) => x.nombre)).toEqual(["¿Venden gas?"]);
    expect(palabras("¿Ustedes VENDEN gas a domicilio?")).toEqual(["gas", "domicilio"]);
  });
});

describe("preguntas frecuentes del negocio", () => {
  it("las maneja el dueño o el colmadero; el despachador no", async () => {
    const dueno = await createUser(t.db, { idPrefix: "owner", email: "saber@delywa.test", password: "duenio-saber-123", firstName: "Sara", role: "colmado_owner", colmadoId: negocio.id });
    await t.db.update(colmados).set({ ownerUserId: dueno.id }).where(eq(colmados.id, negocio.id));
    await createUser(t.db, { idPrefix: "staff", email: "desp-saber@delywa.test", password: "despachador-123x", firstName: "Dino", role: "operador_sucursal", colmadoId: negocio.id });
    const d = t.client();
    await d.request("POST", "/api/auth/login", { username: "saber@delywa.test", password: "duenio-saber-123" });
    const base = `/api/colmados/${negocio.id}/preguntas-frecuentes`;
    expect((await d.request("GET", base)).json.preguntas).toHaveLength(1);
    expect((await d.request("POST", base, { pregunta: "¿Fían?", respuesta: "" })).status).toBe(400);
    const creada = await d.request("POST", base, { pregunta: "¿Fían?", respuesta: "Solo a clientes conocidos." });
    expect(creada.status).toBe(201);
    const nueva = creada.json.preguntas.find((p: any) => p.pregunta === "¿Fían?");
    expect((await d.request("PUT", `${base}/${nueva.id}`, { pregunta: "¿Fían?", respuesta: "No fiamos." })).json.preguntas.find((p: any) => p.id === nueva.id).respuesta).toBe("No fiamos.");
    // Desde la sucursal se ven las mismas.
    expect((await d.request("GET", `/api/colmados/${sucursal.id}/preguntas-frecuentes`)).json.preguntas).toHaveLength(2);
    expect((await d.request("DELETE", `${base}/${nueva.id}`)).json.preguntas).toHaveLength(1);
    // Otro negocio no puede tocarlas.
    expect((await d.request("GET", `/api/colmados/${otro.id}/preguntas-frecuentes`)).status).toBe(403);
    const desp = t.client();
    await desp.request("POST", "/api/auth/login", { username: "desp-saber@delywa.test", password: "despachador-123x" });
    expect((await desp.request("GET", base)).status).toBe(403);
    // La plataforma no ve las preguntas de cada negocio en su lista.
    expect((await t.client().request("GET", "/api/admin/conocimiento-niveles/colmado")).status).toBe(401);
  });
});
