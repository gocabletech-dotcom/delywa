import forge from "node-forge";
import { eq } from "drizzle-orm";
import { colmados, configuracionSistema, feCertificacion, type FeCertificacion, type PasoCertificacion } from "@shared/schema";
import {
  FECHA_LIMITE_PEQUENOS, PASOS_CERTIFICACION, PROVEEDOR_VACIO, type ClavePaso, type ProveedorFE,
} from "@shared/certificacion";
import type { Db } from "../db";

// Guía de certificación como emisor electrónico ante la DGII: avance de cada negocio,
// lectura del certificado digital (.p12) y datos del proveedor que configura la plataforma.

export const CLAVE_PROVEEDOR = "fe_proveedor";

/** Las sucursales comparten el RNC del negocio principal: la certificación es del principal. */
export async function negocioPrincipalId(db: Db, colmadoId: number): Promise<number | null> {
  const [c] = await db.select({ id: colmados.id, principal: colmados.negocioPrincipalId }).from(colmados).where(eq(colmados.id, colmadoId));
  return c ? c.principal || c.id : null;
}

export async function leerCertificacion(db: Db, colmadoId: number): Promise<FeCertificacion | undefined> {
  const [fila] = await db.select().from(feCertificacion).where(eq(feCertificacion.colmadoId, colmadoId));
  return fila;
}

export async function leerProveedor(db: Db): Promise<ProveedorFE> {
  const [fila] = await db.select({ valor: configuracionSistema.valor }).from(configuracionSistema).where(eq(configuracionSistema.clave, CLAVE_PROVEEDOR));
  try { return { ...PROVEEDOR_VACIO, ...(fila?.valor ? JSON.parse(fila.valor) : {}) }; } catch { return { ...PROVEEDOR_VACIO }; }
}

/** Estado de cada paso: los automáticos salen de los datos; los demás, de lo que marcó el negocio. */
export function estadoPasos(f: FeCertificacion | undefined): Record<ClavePaso, PasoCertificacion> {
  const guardados = f?.pasos ?? {};
  const r = {} as Record<ClavePaso, PasoCertificacion>;
  for (const p of PASOS_CERTIFICACION) {
    const g = guardados[p.clave] ?? { estado: "pendiente" };
    if (p.clave === "datos") {
      // Listo solo si la DGII dice que el RNC o la cédula está activo.
      const completo = Boolean(f?.rnc && f.razonSocial && f.direccionFiscal && f.tipoContribuyente && f.dgiiEstado === "activo");
      const empezado = Boolean(f?.rnc || f?.razonSocial || f?.direccionFiscal);
      r.datos = { estado: completo ? "listo" : empezado ? "en_curso" : "pendiente" };
    } else if (p.clave === "certificado") {
      const listo = f?.certEstado === "listo" && Boolean(f.repNombre && f.repCedula);
      r.certificado = { estado: listo ? "listo" : f?.certEstado === "en_tramite" || f?.certEstado === "listo" ? "en_curso" : "pendiente" };
    } else if (p.clave === "secuencias") {
      const tipos = new Set((f?.secuencias ?? []).map((s) => s.tipo));
      r.secuencias = { estado: tipos.has("32") ? "listo" : tipos.size ? "en_curso" : "pendiente" };
    } else {
      r[p.clave] = { estado: g.estado, fecha: g.fecha ?? null, nota: g.nota ?? null };
    }
  }
  return r;
}

export function resumenAvance(pasos: Record<ClavePaso, PasoCertificacion>) {
  const listos = PASOS_CERTIFICACION.filter((p) => pasos[p.clave].estado === "listo").length;
  const siguiente = PASOS_CERTIFICACION.find((p) => pasos[p.clave].estado !== "listo")?.clave ?? null;
  return { listos, total: PASOS_CERTIFICACION.length, porcentaje: Math.round((listos / PASOS_CERTIFICACION.length) * 100), siguiente };
}

/** Días que faltan para que venza el certificado (negativo si ya venció). */
export function diasParaVencer(vence: string | null | undefined, hoy = new Date()): number | null {
  if (!vence || !/^\d{4}-\d{2}-\d{2}$/.test(vence)) return null;
  return Math.ceil((Date.parse(`${vence}T23:59:59Z`) - hoy.getTime()) / 86_400_000);
}

/** ¿Está obligado ya? Pequeños, Micro y No Clasificados desde el 15-nov-2026; el resto ya venció antes. */
export function obligado(tipo: string | null | undefined, hoy = new Date()): { obligado: boolean; desde: string | null } {
  if (!tipo || tipo === "no_se") return { obligado: hoy.toISOString().slice(0, 10) >= FECHA_LIMITE_PEQUENOS, desde: FECHA_LIMITE_PEQUENOS };
  if (["pequeno", "micro", "no_clasificado"].includes(tipo)) return { obligado: hoy.toISOString().slice(0, 10) >= FECHA_LIMITE_PEQUENOS, desde: FECHA_LIMITE_PEQUENOS };
  return { obligado: true, desde: null };
}

// ---------- Certificado digital (.p12 / .pfx) ----------

export type DatosCertificado = { titular: string; cedula: string | null; vence: string; emisor: string; tieneLlave: boolean };

export class CertificadoInvalido extends Error {}

/** Abre el .p12 con su contraseña y lee titular, vencimiento y emisor. No guarda nada. */
export function leerP12(archivoBase64: string, clave: string): DatosCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.decode64(archivoBase64);
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, clave);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/mac|password|invalid/i.test(msg)) throw new CertificadoInvalido("La contraseña no abre ese certificado. Revísala y vuelve a intentarlo.");
    throw new CertificadoInvalido("Ese archivo no es un certificado digital .p12 o .pfx válido.");
  }
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const llaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  // El certificado del firmante es el que no es de una autoridad (no es CA).
  const cert = certs.map((b) => b.cert).find((c) => c && !c.extensions.some((e) => e.name === "basicConstraints" && e.cA)) ?? certs[0]?.cert;
  if (!cert) throw new CertificadoInvalido("El archivo no trae ningún certificado.");
  const campo = (attrs: forge.pki.CertificateField[], nombre: string) => attrs.find((a) => a.shortName === nombre || a.name === nombre)?.value as string | undefined;
  const titular = campo(cert.subject.attributes, "CN") ?? "";
  const serial = campo(cert.subject.attributes, "serialNumber") ?? "";
  const cedula = serial.replace(/\D/g, "").length === 11 ? serial.replace(/\D/g, "") : null;
  return {
    titular,
    cedula,
    vence: cert.validity.notAfter.toISOString().slice(0, 10),
    emisor: campo(cert.issuer.attributes, "O") ?? campo(cert.issuer.attributes, "CN") ?? "",
    tieneLlave: llaves.length > 0,
  };
}
