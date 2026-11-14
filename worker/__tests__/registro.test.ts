// @vitest-environment node
// Pruebas con D1 local en memoria y datos inventados: nunca se toca la base real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { aceptacionesLegales, colmados, paises, users } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser } from "../storage/users";
import { telefonoConPais } from "../routes/registro";

let t: Awaited<ReturnType<typeof createTestApp>>;
let rdId: number;
let ipContador = 0;

const nuevaIp = () => `10.0.0.${++ipContador}`;
const base = () => ({
  paisId: rdId, tipoNegocio: "colmado", nombreNegocio: "Colmado La Esquina", nombre: "Pedro Pérez",
  telefono: "809-555-0101", direccion: "Calle 5 #10, Los Mina", correo: "pedro@prueba.test", password: "clave-segura-123", aceptaTerminos: true,
});

beforeAll(async () => {
  t = await createTestApp();
  const [rd] = await t.db.select().from(paises).where(eq(paises.codigo, "DO"));
  rdId = rd.id;
  await createUser(t.db, { idPrefix: "admin", email: "admin@delywa.test", password: "admin1234", firstName: "Ada", role: "platform_admin" });
}, 60_000);
afterAll(async () => { await t?.dispose(); });

describe("teléfono con código de país", () => {
  it("agrega el código si falta y respeta el que ya trae", () => {
    expect(telefonoConPais("809-555-0101", "1809")).toBe("18095550101");
    expect(telefonoConPais("+1 (829) 555-0101", "1809")).toBe("18295550101");
    expect(telefonoConPais("555-0101", "1809")).toBe("18095550101");
    expect(telefonoConPais("11 2345 6789", "54")).toBe("541123456789");
    expect(telefonoConPais("123", "1809")).toBeNull();
  });
});

describe("registro público de negocio", () => {
  it("el formulario recibe los países y solo el tipo Colmado", async () => {
    const r = await t.client().request("GET", "/api/registro-negocio/opciones");
    expect(r.json.tipos).toEqual([{ slug: "colmado", nombre: "Colmado" }]);
    expect(r.json.paises.some((p: any) => p.codigo === "DO")).toBe(true);
  });

  it("valida los datos antes de crear nada", async () => {
    const c = t.client();
    const h = { "CF-Connecting-IP": nuevaIp() };
    expect((await c.request("POST", "/api/registro-negocio", { ...base(), password: "corta" }, h)).status).toBe(400);
    expect((await c.request("POST", "/api/registro-negocio", { ...base(), aceptaTerminos: false }, h)).status).toBe(400);
    expect((await c.request("POST", "/api/registro-negocio", { ...base(), tipoNegocio: "restaurant" }, h)).status).toBe(400);
    expect((await c.request("POST", "/api/registro-negocio", { ...base(), correo: "no-es-correo" }, h)).status).toBe(400);
    expect(await t.db.select().from(users).where(eq(users.email, "pedro@prueba.test"))).toHaveLength(0);
  });

  let colmadoId: number;
  it("crea el negocio APAGADO, con el dueño y la constancia de aceptación", async () => {
    const c = t.client();
    const r = await c.request("POST", "/api/registro-negocio", base(), { "CF-Connecting-IP": nuevaIp(), "User-Agent": "Prueba" });
    expect(r.status).toBe(201);
    expect(r.json.estado).toBe("pendiente_revision");
    colmadoId = r.json.colmadoId;
    const [negocio] = await t.db.select().from(colmados).where(eq(colmados.id, colmadoId));
    expect({ estado: negocio.estado, whatsappNumero: negocio.whatsappNumero, tipoNegocio: negocio.tipoNegocio, paisId: negocio.paisId }).toEqual({ estado: "pendiente_revision", whatsappNumero: "18095550101", tipoNegocio: "colmado", paisId: rdId });
    const [dueno] = await t.db.select().from(users).where(eq(users.email, "pedro@prueba.test"));
    expect(dueno).toMatchObject({ role: "colmado_owner", colmadoId });
    expect(negocio.ownerUserId).toBe(dueno.id);
    const acept = await t.db.select().from(aceptacionesLegales).where(eq(aceptacionesLegales.colmadoId, colmadoId));
    expect(acept.map((a) => a.documento).sort()).toEqual(["dpa", "privacidad", "terminos"]);
    // Quedó con sesión y ve su negocio con el estado en revisión.
    expect((await c.request("GET", `/api/colmados/${colmadoId}`)).json.estado).toBe("pendiente_revision");
  });

  it("no deja repetir correo ni teléfono", async () => {
    const h = { "CF-Connecting-IP": nuevaIp() };
    expect((await t.client().request("POST", "/api/registro-negocio", base(), h)).status).toBe(409);
    expect((await t.client().request("POST", "/api/registro-negocio", { ...base(), correo: "otro@prueba.test" }, h)).status).toBe(409);
  });

  it("mientras está apagado no recibe pedidos, ni chat web, ni el bot lo encuentra", async () => {
    const [n] = await t.db.select().from(colmados).where(eq(colmados.id, colmadoId));
    expect((await t.client().request("GET", `/api/chat-web/colmado/${n.slug}`)).status).toBe(404);
    expect((await t.client().request("GET", `/api/chat-colmado/${n.slug}/info`)).status).toBe(404);
  });

  it("limita los registros por conexión", async () => {
    const h = { "CF-Connecting-IP": "10.9.9.9" };
    for (let i = 0; i < 5; i++) await t.client().request("POST", "/api/registro-negocio", { ...base(), password: "x" }, h).catch(() => undefined);
    // Los intentos inválidos no cuentan; los válidos sí.
    let ultimo = 0;
    for (let i = 0; i < 6; i++) {
      ultimo = (await t.client().request("POST", "/api/registro-negocio", { ...base(), correo: `n${i}@prueba.test`, telefono: `809555${2000 + i}` }, h)).status;
    }
    expect(ultimo).toBe(429);
  });
});

describe("revisión por la plataforma", () => {
  it("solo el administrador ve y decide las solicitudes", async () => {
    const admin = t.client();
    await admin.request("POST", "/api/auth/login", { username: "admin@delywa.test", password: "admin1234" });
    const dueno = t.client();
    await dueno.request("POST", "/api/auth/login", { username: "pedro@prueba.test", password: "clave-segura-123" });
    expect((await dueno.request("GET", "/api/admin/solicitudes-negocio")).status).toBe(403);

    const lista = await admin.request("GET", "/api/admin/solicitudes-negocio");
    const s = lista.json.find((x: any) => x.duenoCorreo === "pedro@prueba.test");
    expect(s).toMatchObject({ nombre: "Colmado La Esquina", estado: "pendiente_revision", paisNombre: expect.any(String) });
    expect(s.aceptaciones).toHaveLength(3);

    expect((await dueno.request("POST", `/api/admin/solicitudes-negocio/${s.id}/activar`)).status).toBe(403);
    expect((await admin.request("POST", `/api/admin/solicitudes-negocio/${s.id}/rechazar`)).json.estado).toBe("rechazado");
    expect((await admin.request("POST", `/api/admin/solicitudes-negocio/${s.id}/activar`)).json.estado).toBe("activo");
    // Ya activo: sale de la lista y el chat web lo encuentra.
    expect((await admin.request("POST", `/api/admin/solicitudes-negocio/${s.id}/activar`)).status).toBe(404);
    const [n] = await t.db.select().from(colmados).where(eq(colmados.id, s.id));
    expect((await t.client().request("GET", `/api/chat-web/colmado/${n.slug}`)).status).toBe(200);
  });
});
