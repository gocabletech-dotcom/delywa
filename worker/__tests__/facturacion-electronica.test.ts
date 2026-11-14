// @vitest-environment node
// Guía de certificación como emisor electrónico. D1 local en memoria, datos inventados y un
// certificado de prueba creado aquí mismo: nunca se usa un certificado ni datos reales.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import forge from "node-forge";
import { eq } from "drizzle-orm";
import { colmados, feCertificacion } from "@shared/schema";
import { cedulaValida, encfValido, rncValido, revisarIdentificacion } from "@shared/certificacion";
import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { leerP12 } from "../lib/certificacion";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, colmadero: Client, despachador: Client, ajeno: Client, admin: Client;
let negocio: any, sucursal: any, otro: any;

/** Certificado .p12 de prueba (autofirmado), en base64. */
function p12DePrueba(opciones: { clave?: string; vence?: Date; conLlave?: boolean } = {}) {
  const llaves = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = opciones.vence ?? new Date(Date.now() + 365 * 86_400_000);
  const sujeto = [{ name: "commonName", value: "JUANA PEREZ DE PRUEBA" }, { type: "2.5.4.5", value: "IDCDO-00100000009" }];
  cert.setSubject(sujeto);
  cert.setIssuer([{ name: "commonName", value: "CA DE PRUEBA" }, { name: "organizationName", value: "Entidad de Prueba" }]);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(opciones.conLlave === false ? null : llaves.privateKey, [cert], opciones.clave ?? "clave-de-prueba", { algorithm: "3des" });
  return forge.util.encode64(forge.asn1.toDer(asn1).getBytes());
}

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}

beforeAll(async () => {
  t = await createTestApp();
  (t.env as any).DELYWA_CLAVE_MAESTRA = "clave-maestra-de-prueba";
  [negocio] = await t.db.insert(colmados).values({ nombre: "Colmado Fiscal", slug: "colmado-fiscal", whatsappNumero: "18093330101", direccion: "Calle 1", planId: 1 }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Colmado Fiscal 2", slug: "colmado-fiscal-2", whatsappNumero: "18093330102", direccion: "Calle 2", planId: 1, negocioPrincipalId: negocio.id }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro Colmado", slug: "otro-colmado", whatsappNumero: "18093330103", direccion: "Calle 3", planId: 1 }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@fe.test", password: "clave-dueno-123", firstName: "Dora", role: "colmado_owner", colmadoId: negocio.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, negocio.id));
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, sucursal.id));
  const cm = await createUser(t.db, { idPrefix: "staff", email: "colmadero@fe.test", password: "clave-colmadero-1", firstName: "Cari", role: "admin_pedidos", colmadoId: negocio.id });
  await setUserSucursalIds(t.db, cm.id, [negocio.id, sucursal.id]);
  const dp = await createUser(t.db, { idPrefix: "staff", email: "despacho@fe.test", password: "clave-despacho-1", firstName: "Dani", role: "operador_sucursal", colmadoId: negocio.id });
  await setUserSucursalIds(t.db, dp.id, [negocio.id]);
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@fe.test", password: "clave-ajeno-123", firstName: "Ali", role: "colmado_owner", colmadoId: otro.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otro.id));
  await createUser(t.db, { idPrefix: "admin", email: "admin@fe.test", password: "clave-admin-123", firstName: "Ada", role: "platform_admin" });
  dueno = await login("dueno@fe.test", "clave-dueno-123");
  colmadero = await login("colmadero@fe.test", "clave-colmadero-1");
  despachador = await login("despacho@fe.test", "clave-despacho-1");
  ajeno = await login("ajeno@fe.test", "clave-ajeno-123");
  admin = await login("admin@fe.test", "clave-admin-123");
}, 120_000);
afterAll(async () => { await t?.dispose(); });

const ruta = (id = negocio.id) => `/api/colmados/${id}/facturacion-electronica`;

describe("validaciones de RNC, cédula y e-NCF", () => {
  it("revisa el dígito verificador", () => {
    expect(rncValido("401506254")).toBe(true); // RNC de la DGII
    expect(rncValido("401506255")).toBe(false);
    expect(cedulaValida("00100000009")).toBe(true);
    expect(cedulaValida("00100000008")).toBe(false);
    expect(revisarIdentificacion("401-50625-4")).toBe("ok");
    expect(revisarIdentificacion("12345")).toBe("largo");
    expect(encfValido("E320000000001", "32")).toBe(true);
    expect(encfValido("E310000000001", "32")).toBe(false);
    expect(encfValido("B0100000001")).toBe(false);
  });
});

describe("quién puede ver y llenar la guía", () => {
  it("dueño y colmadero sí; despachador y otro negocio no", async () => {
    expect((await dueno.request("GET", ruta())).status).toBe(200);
    expect((await colmadero.request("GET", ruta())).status).toBe(200);
    expect((await despachador.request("GET", ruta())).status).toBe(403);
    expect((await ajeno.request("GET", ruta())).status).toBe(403);
    expect((await t.client().request("GET", ruta())).status).toBe(401);
  });

  it("empieza vacía con 10 pasos y el primero es datos fiscales", async () => {
    const r = (await dueno.request("GET", ruta())).json;
    expect(r.avance).toMatchObject({ listos: 0, total: 10, siguiente: "datos" });
    expect(r.certificado).toMatchObject({ estado: "no_tiene", subido: false });
  });
});

describe("datos fiscales", () => {
  it("valida y guarda; la sucursal ve lo mismo que el principal", async () => {
    expect((await dueno.request("PUT", `${ruta()}/datos`, { rnc: "1234" })).json.campo).toBe("rnc");
    expect((await dueno.request("PUT", `${ruta()}/datos`, { rnc: "401506254", tipoContribuyente: "gigante" })).status).toBe(400);
    expect((await dueno.request("PUT", `${ruta()}/datos`, { rnc: "401506254", correoFiscal: "malo" })).json.campo).toBe("correoFiscal");
    const r = await colmadero.request("PUT", `${ruta()}/datos`, {
      rnc: "401-50625-4", razonSocial: "Colmado Fiscal SRL", direccionFiscal: "Calle 1, Santo Domingo", tipoContribuyente: "pequeno",
      correoFiscal: "fiscal@fe.test", repNombre: "Juana Pérez", repCedula: "001-0000000-9", repCargo: "Dueña",
    });
    expect(r.status).toBe(200);
    expect(r.json.datos).toMatchObject({ rnc: "401506254", repCedula: "00100000009" });
    expect(r.json.identificacion).toBe("ok");
    expect(r.json.pasos.datos.estado).toBe("listo");
    expect(r.json.plazo.desde).toBe("2026-11-15");
    // Desde la sucursal se ve la misma guía (la del negocio principal).
    expect((await colmadero.request("GET", ruta(sucursal.id))).json).toMatchObject({ colmadoId: negocio.id, datos: { rnc: "401506254" } });
  });
});

describe("certificado digital", () => {
  it("lee titular y vencimiento del .p12 de prueba", () => {
    const d = leerP12(p12DePrueba(), "clave-de-prueba");
    expect(d).toMatchObject({ titular: "JUANA PEREZ DE PRUEBA", tieneLlave: true, emisor: "Entidad de Prueba" });
    expect(d.vence).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rechaza clave mala, archivo vencido o sin llave; solo el dueño lo sube; se guarda cifrado", async () => {
    const archivo = p12DePrueba();
    expect((await dueno.request("PUT", `${ruta()}/certificado`, { archivo, clave: "otra" })).json.error).toContain("contraseña");
    expect((await dueno.request("PUT", `${ruta()}/certificado`, { archivo: "bm8tZXMtdW4tY2VydA==", clave: "x" })).status).toBe(400);
    expect((await dueno.request("PUT", `${ruta()}/certificado`, { archivo: p12DePrueba({ vence: new Date(Date.now() - 86_400_000 * 2) }), clave: "clave-de-prueba" })).json.error).toContain("venció");
    expect((await dueno.request("PUT", `${ruta()}/certificado`, { archivo: p12DePrueba({ conLlave: false }), clave: "clave-de-prueba" })).json.error).toContain("llave privada");
    expect((await colmadero.request("PUT", `${ruta()}/certificado`, { archivo, clave: "clave-de-prueba" })).status).toBe(403);

    const r = await dueno.request("PUT", `${ruta()}/certificado`, { archivo, clave: "clave-de-prueba", entidad: "camara_sd" });
    expect(r.status).toBe(200);
    expect(r.json.certificado).toMatchObject({ estado: "listo", subido: true, titular: "JUANA PEREZ DE PRUEBA", entidad: "camara_sd" });
    expect(r.json.pasos.certificado.estado).toBe("listo");
    // La respuesta nunca trae el archivo ni la contraseña; en la base están cifrados.
    expect(JSON.stringify(r.json)).not.toContain(archivo.slice(0, 40));
    expect(JSON.stringify(r.json)).not.toContain("clave-de-prueba");
    const [fila] = await t.db.select().from(feCertificacion).where(eq(feCertificacion.colmadoId, negocio.id));
    expect(fila.certArchivo).toMatch(/^v1:/);
    expect(fila.certClave).toMatch(/^v1:/);
    expect(fila.certClave).not.toContain("clave-de-prueba");
  });

  it("el colmadero puede anotar que está en trámite, pero no quitarlo; el dueño sí", async () => {
    expect((await colmadero.request("DELETE", `${ruta()}/certificado`)).status).toBe(403);
    const quitado = await dueno.request("DELETE", `${ruta()}/certificado`);
    expect(quitado.json.certificado).toMatchObject({ estado: "no_tiene", subido: false });
    const tramite = await colmadero.request("PUT", `${ruta()}/certificado`, { estado: "en_tramite", entidad: "avansi" });
    expect(tramite.json.certificado.estado).toBe("en_tramite");
    expect(tramite.json.pasos.certificado.estado).toBe("en_curso");
    await dueno.request("PUT", `${ruta()}/certificado`, { archivo: p12DePrueba(), clave: "clave-de-prueba" });
  });
});

describe("pasos ante la DGII y secuencias", () => {
  it("marca pasos manuales, no los automáticos, y registra la autorización", async () => {
    expect((await dueno.request("PUT", `${ruta()}/pasos/datos`, { estado: "listo" })).status).toBe(400);
    expect((await dueno.request("PUT", `${ruta()}/pasos/ofv`, { estado: "terminado" })).status).toBe(400);
    for (const paso of ["ofv", "solicitud", "postulacion", "pruebas", "urls", "declaracion"]) {
      expect((await dueno.request("PUT", `${ruta()}/pasos/${paso}`, { estado: "listo" })).status).toBe(200);
    }
    const r = await dueno.request("PUT", `${ruta()}/pasos/autorizado`, { estado: "listo", fecha: "2026-11-20", nota: "Aprobado por la DGII" });
    expect(r.json.pasos.autorizado).toMatchObject({ estado: "listo", fecha: "2026-11-20", nota: "Aprobado por la DGII" });
    expect(r.json.autorizadoAt).toBeTruthy();
    expect(r.json.avance).toMatchObject({ listos: 9, siguiente: "secuencias" });
  });

  it("valida los rangos de e-NCF y con el tipo 32 completa la guía", async () => {
    expect((await dueno.request("PUT", `${ruta()}/secuencias`, { secuencias: [{ tipo: "32", desde: "E310000000001", hasta: "E310000000100" }] })).status).toBe(400);
    expect((await dueno.request("PUT", `${ruta()}/secuencias`, { secuencias: [{ tipo: "32", desde: "E320000000100", hasta: "E320000000001" }] })).status).toBe(400);
    const r = await dueno.request("PUT", `${ruta()}/secuencias`, { secuencias: [
      { tipo: "32", desde: "e320000000001", hasta: "E320000000500", vence: "2027-12-31" },
      { tipo: "34", desde: "E340000000001", hasta: "E340000000050" },
    ] });
    expect(r.status).toBe(200);
    expect(r.json.secuencias[0]).toMatchObject({ desde: "E320000000001" });
    expect(r.json.avance).toMatchObject({ listos: 10, porcentaje: 100, siguiente: null });
  });
});

describe("plataforma", () => {
  it("configura el proveedor y ve el avance de cada negocio", async () => {
    expect((await dueno.request("GET", "/api/admin/facturacion-electronica/negocios")).status).toBe(403);
    expect((await admin.request("PUT", "/api/admin/facturacion-electronica/proveedor", { nombre: "Proveedor X", urlRecepcion: "http://inseguro" })).status).toBe(400);
    const p = await admin.request("PUT", "/api/admin/facturacion-electronica/proveedor", {
      nombre: "Proveedor de Prueba SRL", rnc: "130-22250-9", software: "Delywa e-CF", version: "1.0",
      urlRecepcion: "https://proveedor.test/fe/recepcion/api/ecf", urlAprobacion: "https://proveedor.test/fe/aprobacioncomercial/api/ecf",
      urlAutenticacion: "https://proveedor.test/fe/autenticacion/api", contacto: "soporte@proveedor.test",
    });
    expect(p.json).toMatchObject({ rnc: "130222509", software: "Delywa e-CF" });
    // El negocio ve los datos que tiene que copiar en el Portal de Certificación.
    expect((await dueno.request("GET", ruta())).json.proveedor).toMatchObject({ nombre: "Proveedor de Prueba SRL", urlRecepcion: "https://proveedor.test/fe/recepcion/api/ecf" });

    const lista = (await admin.request("GET", "/api/admin/facturacion-electronica/negocios")).json;
    expect(lista.find((x: any) => x.colmadoId === sucursal.id)).toBeUndefined(); // solo principales
    expect(lista.find((x: any) => x.colmadoId === negocio.id)).toMatchObject({ rnc: "401506254", avance: { porcentaje: 100 }, certificado: { subido: true } });
    expect(lista.find((x: any) => x.colmadoId === otro.id)).toMatchObject({ avance: { listos: 0 } });
  });
});
