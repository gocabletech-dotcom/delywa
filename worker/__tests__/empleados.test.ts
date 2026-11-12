// @vitest-environment node
// Pruebas con D1 local en memoria y datos inventados: nunca tocan la base real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asistencias, colmados, empleados, empleadoSucursales, paises } from "@shared/schema";
import { createTestApp } from "./helpers";
import { createUser, setUserSucursalIds } from "../storage/users";
import { calcularDetalle, esFechaReal, getPoliticaNomina, validarReglas, REGLAS_POR_DEFECTO } from "../lib/nomina";

let t: Awaited<ReturnType<typeof createTestApp>>;
type Client = ReturnType<Awaited<ReturnType<typeof createTestApp>>["client"]>;
let dueno: Client, admin: Client, operador: Client, ajeno: Client;
let principal: any, sucursal: any, otro: any;

async function login(email: string, password: string) {
  const c = t.client();
  expect((await c.request("POST", "/api/auth/login", { username: email, password })).status).toBe(200);
  return c;
}
const portal = (c: Client, body: unknown, ip = "10.1.1.1") => c.request("POST", "/api/empleado/portal/login", body, { "CF-Connecting-IP": ip });

beforeAll(async () => {
  t = await createTestApp();
  const [rd] = await t.db.select().from(paises).where(eq(paises.codigo, "DO"));
  [principal] = await t.db.insert(colmados).values({ nombre: "Negocio Prueba", slug: "negocio-prueba", whatsappNumero: "18091110001", direccion: "A", planId: 1, paisId: rd.id }).returning();
  [sucursal] = await t.db.insert(colmados).values({ nombre: "Sucursal Norte", slug: "sucursal-norte", whatsappNumero: "18091110002", direccion: "B", planId: 1, paisId: rd.id, negocioPrincipalId: principal.id }).returning();
  [otro] = await t.db.insert(colmados).values({ nombre: "Otro", slug: "otro-negocio", whatsappNumero: "18091110003", direccion: "C", planId: 1 }).returning();
  const d = await createUser(t.db, { idPrefix: "owner", email: "dueno@delywa.test", password: "dueno1234", firstName: "Dora", role: "colmado_owner", colmadoId: principal.id });
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, principal.id));
  await t.db.update(colmados).set({ ownerUserId: d.id }).where(eq(colmados.id, sucursal.id));
  const ad = await createUser(t.db, { idPrefix: "staff", email: "admin@delywa.test", password: "admin1234", firstName: "Ana", role: "admin_pedidos", colmadoId: principal.id });
  await setUserSucursalIds(t.db, ad.id, [principal.id]);
  const op = await createUser(t.db, { idPrefix: "staff", email: "op@delywa.test", password: "op123456", firstName: "Omar", role: "operador_sucursal", colmadoId: principal.id });
  await setUserSucursalIds(t.db, op.id, [principal.id]);
  const aj = await createUser(t.db, { idPrefix: "owner", email: "ajeno@delywa.test", password: "ajeno123", firstName: "Abel", role: "colmado_owner", colmadoId: otro.id });
  await t.db.update(colmados).set({ ownerUserId: aj.id }).where(eq(colmados.id, otro.id));
  dueno = await login("dueno@delywa.test", "dueno1234");
  admin = await login("admin@delywa.test", "admin1234");
  operador = await login("op@delywa.test", "op123456");
  ajeno = await login("ajeno@delywa.test", "ajeno123");
}, 60_000);
afterAll(async () => { await t?.dispose(); });

let porHora: any, asalariado: any;

describe("empleados", () => {
  it("solo dueño y administrador gestionan personal, y solo en sus sucursales", async () => {
    const base = { nombres: "Pedro", tipoPago: "por_hora", tarifaHora: 100, sucursalIds: [principal.id] };
    expect((await operador.request("GET", "/api/negocio/empleados")).status).toBe(403);
    expect((await operador.request("POST", "/api/negocio/empleados", base)).status).toBe(403);
    expect((await dueno.request("POST", "/api/negocio/empleados", { ...base, sucursalIds: [otro.id] })).status).toBe(403);
    expect((await admin.request("POST", "/api/negocio/empleados", { ...base, sucursalIds: [sucursal.id] })).status).toBe(403);
    expect((await dueno.request("POST", "/api/negocio/empleados", { ...base, nombres: " " })).status).toBe(400);
    expect((await dueno.request("POST", "/api/negocio/empleados", { ...base, tipoPago: "gratis" })).json.error).toBe("Tipo de pago inválido");
    expect((await dueno.request("POST", "/api/negocio/empleados", { ...base, tarifaHora: -1 })).status).toBe(400);

    const res = await dueno.request("POST", "/api/negocio/empleados", { ...base, apellidos: "Pérez", sucursalIds: [principal.id, sucursal.id], negocioId: otro.id, codigoAcceso: "HACKED" });
    expect(res.status).toBe(201);
    porHora = res.json;
    expect(porHora).toMatchObject({ negocioId: principal.id, tarifaHora: "100.00", estado: "activo", sucursalIds: [principal.id, sucursal.id] });
    expect(porHora.codigoAcceso).toMatch(/^[A-Z2-9]{6}$/);
    asalariado = (await dueno.request("POST", "/api/negocio/empleados", { nombres: "Sofía", tipoPago: "salario", salarioFijo: "16000", sucursalIds: [principal.id] })).json;
  });

  it("al editar no se puede cambiar de negocio ni de código, y se conservan sucursales ajenas al editor", async () => {
    expect((await ajeno.request("PATCH", `/api/negocio/empleados/${porHora.id}`, { nombres: "X", sucursalIds: [otro.id] })).status).toBe(403);
    // La administradora solo ve la sucursal principal: al guardar no le quita la Norte.
    const res = await admin.request("PATCH", `/api/negocio/empleados/${porHora.id}`, { puesto: "Cajero", sucursalIds: [principal.id], negocioId: otro.id, codigoAcceso: "AAAAAA" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ puesto: "Cajero", negocioId: principal.id, codigoAcceso: porHora.codigoAcceso, sucursalIds: [principal.id] });
    expect(await t.db.select().from(empleadoSucursales).where(eq(empleadoSucursales.empleadoId, porHora.id))).toHaveLength(2);
    expect((await admin.request("GET", "/api/negocio/empleados")).json).toHaveLength(2);
    expect((await ajeno.request("GET", "/api/negocio/empleados")).json).toHaveLength(0);
  });
});

describe("portal del empleado", () => {
  let p: Client;

  it("pide sucursal si hay varias, y limita los intentos por IP", async () => {
    p = t.client();
    expect((await portal(p, {})).status).toBe(400);
    const varias = await portal(p, { codigoAcceso: porHora.codigoAcceso.toLowerCase() });
    expect(varias.status).toBe(400);
    expect(varias.json.sucursales).toHaveLength(2);
    expect((await portal(p, { codigoAcceso: porHora.codigoAcceso, sucursalId: principal.id })).json).toMatchObject({ sucursalId: principal.id, employee: { nombres: "Pedro" } });

    const intruso = t.client();
    for (let i = 0; i < 5; i++) expect((await portal(intruso, { codigoAcceso: "ZZZZZ" + i }, "10.9.9.9")).status).toBe(401);
    expect((await portal(intruso, { codigoAcceso: porHora.codigoAcceso, sucursalId: principal.id }, "10.9.9.9")).status).toBe(429);
  });

  it("marca entrada una sola vez y luego salida", async () => {
    expect((await t.client().request("POST", "/api/empleado/portal/entrada")).status).toBe(401);
    const [a, b] = await Promise.all([p.request("POST", "/api/empleado/portal/entrada"), p.request("POST", "/api/empleado/portal/entrada")]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await t.db.select().from(asistencias).where(eq(asistencias.empleadoId, porHora.id))).toHaveLength(1);
    expect((await p.request("GET", "/api/empleado/portal/session")).json.asistencia).toBeTruthy();
    expect((await dueno.request("POST", "/api/negocio/asistencias/entrada", { empleadoId: porHora.id, sucursalId: principal.id })).json.error).toContain("jornada abierta");
    const salida = await p.request("POST", "/api/empleado/portal/salida");
    expect(salida.status).toBe(200);
    expect(salida.json.salida).toBeTruthy();
    expect((await p.request("POST", "/api/empleado/portal/salida")).status).toBe(400);
  });

  it("un empleado inactivo pierde la sesión", async () => {
    await dueno.request("PATCH", `/api/negocio/empleados/${porHora.id}`, { estado: "inactivo", sucursalIds: [principal.id, sucursal.id] });
    expect((await p.request("GET", "/api/empleado/portal/session")).status).toBe(401);
    expect((await p.request("POST", "/api/empleado/portal/entrada")).status).toBe(403);
    await dueno.request("PATCH", `/api/negocio/empleados/${porHora.id}`, { estado: "activo", sucursalIds: [principal.id, sucursal.id] });
  });
});

describe("asistencia y nómina", () => {
  // Hora local de Santo Domingo (UTC-4).
  const rd = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-04:00`).toISOString();

  it("corrige la asistencia con validaciones y sin borrar las notas", async () => {
    const [fila] = await t.db.select().from(asistencias).where(eq(asistencias.empleadoId, porHora.id));
    expect((await ajeno.request("PATCH", `/api/negocio/asistencias/${fila.id}`, { entrada: rd("2026-11-02", "08:00"), salida: rd("2026-11-02", "18:00") })).status).toBe(403);
    expect((await dueno.request("PATCH", `/api/negocio/asistencias/${fila.id}`, { entrada: rd("2026-11-02", "18:00"), salida: rd("2026-11-02", "08:00") })).status).toBe(400);
    expect((await dueno.request("PATCH", `/api/negocio/asistencias/${fila.id}`, { entrada: rd("2026-11-02", "08:00"), salida: rd("2026-11-04", "08:00") })).status).toBe(400);
    await dueno.request("PATCH", `/api/negocio/asistencias/${fila.id}`, { entrada: rd("2026-11-02", "08:00"), salida: rd("2026-11-02", "14:00"), notas: "Olvidó marcar" });
    const ok = await dueno.request("PATCH", `/api/negocio/asistencias/${fila.id}`, { entrada: rd("2026-11-02", "08:00"), salida: rd("2026-11-02", "14:00") });
    expect(ok.json).toMatchObject({ horasTrabajadas: "6.00", notas: "Olvidó marcar" });
  });

  it("calcula por día local: suma turnos del mismo día, separa extras y feriados", async () => {
    // Mismo lunes 2: 6 h + 4 h = 10 h → 8 ordinarias + 2 extra. Viernes 6 (feriado en RD): 5 h.
    // La entrada de las 22:00 del domingo 1 local es día 2 en UTC: debe contar el domingo 1.
    await t.db.insert(asistencias).values([
      { empleadoId: porHora.id, sucursalId: principal.id, entrada: new Date(rd("2026-11-02", "15:00")), salida: new Date(rd("2026-11-02", "19:00")), horasTrabajadas: "4" },
      { empleadoId: porHora.id, sucursalId: principal.id, entrada: new Date(rd("2026-11-06", "08:00")), salida: new Date(rd("2026-11-06", "13:00")), horasTrabajadas: "5" },
      { empleadoId: porHora.id, sucursalId: principal.id, entrada: new Date(rd("2026-11-01", "22:00")), salida: new Date(rd("2026-11-01", "23:00")), horasTrabajadas: "1" },
      { empleadoId: porHora.id, sucursalId: principal.id, entrada: new Date(rd("2026-11-08", "08:00")), salida: new Date(rd("2026-11-08", "10:00")), horasTrabajadas: "2" },
    ]);
    expect((await dueno.request("GET", "/api/negocio/asistencias?desde=2026-11-01&hasta=2026-11-07")).json).toHaveLength(4);
    expect((await admin.request("GET", "/api/negocio/asistencias?desde=2026-13-01")).status).toBe(400);

    expect((await operador.request("POST", "/api/negocio/nominas/calcular", { periodoInicio: "2026-11-01", periodoFin: "2026-11-07" })).status).toBe(403);
    expect((await dueno.request("POST", "/api/negocio/nominas/calcular", { periodoInicio: "2026-11-07", periodoFin: "2026-11-01" })).status).toBe(400);
    const res = await dueno.request("POST", "/api/negocio/nominas/calcular", { periodoInicio: "2026-11-01", periodoFin: "2026-11-07" });
    expect(res.status).toBe(201);
    const d = res.json.detalles.find((x: any) => x.empleadoId === porHora.id);
    // RD: extra ×1.35, feriado ×2, recargo nocturno 15 %.
    // base 9×100=900; extra 2×100×1.35=270; feriado 5×100×2=1000; recargo 15 % de 2170 = 325.50
    expect(d).toMatchObject({ horasOrdinarias: "9.00", horasExtra: "2.00", horasFeriado: "5.00", horasTrabajadas: "16.00", salarioBase: "900.00", ajustes: "325.50", bruto: "2495.50", total: "2495.50" });
    const s = res.json.detalles.find((x: any) => x.empleadoId === asalariado.id);
    expect(s).toMatchObject({ tipoPago: "salario", salarioBase: "16000.00", tarifaHora: "100.00", bruto: "18400.00" });
    expect(res.json).toMatchObject({ estado: "borrador", totalHoras: "16.00", totalBruto: "20895.50", totalNeto: "20895.50" });
    expect(res.json.reglasAplicadas.paisCodigo).toBe("DO");
  });

  it("cierra y paga la nómina; una pagada ya no cambia", async () => {
    const [n] = (await dueno.request("GET", "/api/negocio/nominas")).json;
    expect(n.detalles).toHaveLength(2);
    expect((await ajeno.request("PATCH", `/api/negocio/nominas/${n.id}/estado`, { estado: "pagada" })).status).toBe(404);
    expect((await dueno.request("PATCH", `/api/negocio/nominas/${n.id}/estado`, { estado: "borrador" })).status).toBe(400);
    expect((await dueno.request("PATCH", `/api/negocio/nominas/${n.id}/estado`, { estado: "cerrada" })).json.estado).toBe("cerrada");
    expect((await dueno.request("PATCH", `/api/negocio/nominas/${n.id}/estado`, { estado: "pagada" })).json).toMatchObject({ estado: "pagada" });
    expect((await dueno.request("PATCH", `/api/negocio/nominas/${n.id}/estado`, { estado: "cerrada" })).json.error).toBe("La nómina ya fue pagada");
  });

  it("guarda la configuración con auditoría y respeta los límites del país", async () => {
    const actual = (await dueno.request("GET", "/api/negocio/nominas/configuracion")).json;
    expect(actual).toMatchObject({ paisCodigo: "DO", multiplicadorHoraExtra: 1.35, origenConfiguracion: "plantilla_pais" });
    expect((await dueno.request("GET", "/api/negocio/nominas/politicas")).json.politicas.map((p: any) => p.codigo)).toEqual(["DO", "AR", "US"]);
    const reglas = { ...actual, retencionPorcentaje: 5, feriados: ["2026-12-25"] };
    expect((await dueno.request("PATCH", "/api/negocio/nominas/configuracion", { ...reglas, multiplicadorHoraExtra: 1 })).json.error).toContain("al menos 1.35");
    expect((await dueno.request("PATCH", "/api/negocio/nominas/configuracion", { ...reglas, feriados: ["2026-02-30"] })).status).toBe(400);
    expect((await dueno.request("PATCH", "/api/negocio/nominas/configuracion", { ...reglas, retencionPorcentaje: 150 })).status).toBe(400);
    const [us] = await t.db.select().from(paises).where(eq(paises.codigo, "US"));
    if (us) expect((await admin.request("PATCH", "/api/negocio/nominas/configuracion", { ...reglas, paisId: us.id })).status).toBe(403);
    const ok = await admin.request("PATCH", "/api/negocio/nominas/configuracion", reglas);
    expect(ok.json).toMatchObject({ retencionPorcentaje: 5, feriados: ["2026-12-25"], origenConfiguracion: "plantilla_pais" });
    const auditoria = (await dueno.request("GET", "/api/negocio/nominas/configuracion/auditoria")).json;
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({ reglasAnteriores: null, reglasNuevas: { retencionPorcentaje: 5 } });
  });
});

describe("cálculo puro", () => {
  it("valida fechas y reglas", () => {
    expect(esFechaReal("2026-02-28")).toBe(true);
    expect(esFechaReal("2026-02-30")).toBe(false);
    expect(() => validarReglas({ ...REGLAS_POR_DEFECTO, horasPeriodoSalario: 0 })).toThrow();
    expect(() => validarReglas({ ...REGLAS_POR_DEFECTO }, getPoliticaNomina("ar"))).not.toThrow();
  });

  it("la retención nunca supera el bruto ni se cobra sin ingresos", () => {
    const reglas = { ...REGLAS_POR_DEFECTO, retencionFija: 500, retencionPorcentaje: 10 };
    const emp = { tipoPago: "por_hora", tarifaHora: "100", salarioFijo: "0" };
    expect(calcularDetalle(emp, [], reglas)).toMatchObject({ bruto: "0.00", descuentos: "0.00", total: "0.00" });
    expect(calcularDetalle(emp, [{ dia: "2026-11-03", horas: 2 }], reglas)).toMatchObject({ bruto: "200.00", descuentos: "200.00", total: "0.00" });
    expect(calcularDetalle(emp, [{ dia: "2026-11-03", horas: 10 }], reglas)).toMatchObject({ bruto: "1100.00", descuentos: "610.00", total: "490.00" });
  });
});
