// Guía para que un negocio quede autorizado por la DGII como emisor electrónico (e-CF).
// Pasos según «Proceso de Certificación para ser Emisor Electrónico con Proveedor de Servicios
// de Facturación Electrónica Certificado» de la DGII (Ley 32-23, Decreto 587-24, Norma 01-2020).
// La usan el servidor (para calcular el avance) y las pantallas (para mostrarla).

export type ClavePaso =
  | "datos" | "ofv" | "certificado" | "solicitud" | "postulacion"
  | "pruebas" | "urls" | "declaracion" | "autorizado" | "secuencias";

export type DefinicionPaso = {
  clave: ClavePaso;
  etapa: 1 | 2 | 3 | 4;
  titulo: string;
  explicacion: string;
  /** Lo que la persona tiene que hacer, en orden. */
  instrucciones: string[];
  /** Se marca solo a partir de los datos (no hay botón «Listo»). */
  automatico?: boolean;
  enlace?: { texto: string; url: string };
};

export const ETAPAS: Record<1 | 2 | 3 | 4, string> = {
  1: "Antes de empezar",
  2: "Solicitud a la DGII",
  3: "Pruebas y declaración",
  4: "Autorización y secuencias",
};

export const OFV_URL = "https://dgii.gov.do/OFV/home.aspx";
export const GUIA_DGII_URL = "https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/facturacion/Documents/Facturaci%C3%B3n%20Electr%C3%B3nica/Guia-Basica-para-ser-Emisor-Electronico.pdf";

export const PASOS_CERTIFICACION: DefinicionPaso[] = [
  {
    clave: "datos", etapa: 1, automatico: true,
    titulo: "Datos fiscales del negocio",
    explicacion: "Los datos tal como están registrados en la DGII. Se usan en cada factura electrónica.",
    instrucciones: [
      "Escribe el RNC (9 números) o la cédula (11 números) con que el negocio está inscrito en la DGII.",
      "Escribe la razón social exactamente como aparece en la DGII y la dirección fiscal.",
      "Elige el tipo de contribuyente. Si no lo sabes, entra a la Oficina Virtual (OFV) o pregúntale a tu contador.",
    ],
  },
  {
    clave: "ofv", etapa: 1,
    titulo: "Oficina Virtual (OFV) y autorización de NCF",
    explicacion: "La DGII exige que el negocio y la persona que lo representa tengan clave de la OFV, y que el negocio esté autorizado para emitir comprobantes fiscales («Alta NCF»).",
    instrucciones: [
      "Entra a la OFV con el RNC o la cédula y la clave del negocio. Si no tienes clave, solicítala en la DGII.",
      "Confirma que la persona que firmará (dueño o representante) también tiene acceso a la OFV.",
      "Confirma que el negocio ya está autorizado para emitir NCF. Si no, solicítalo en la OFV.",
    ],
    enlace: { texto: "Abrir la Oficina Virtual", url: OFV_URL },
  },
  {
    clave: "certificado", etapa: 1, automatico: true,
    titulo: "Certificado digital del firmante",
    explicacion: "Un certificado digital para procesos tributarios a nombre de la persona que firmará las facturas. Siempre es de una persona, aunque el negocio sea una empresa.",
    instrucciones: [
      "Solicítalo en una entidad autorizada por INDOTEL: Cámara de Comercio y Producción de Santo Domingo (Digifirma), AVANSI (Viafirma) u OGTIC.",
      "Pide el certificado «para procesos tributarios / facturación electrónica», en archivo .p12 o .pfx con su contraseña.",
      "Cuando lo tengas, súbelo aquí. Se guarda cifrado; nadie puede verlo ni descargarlo.",
      "Anota la fecha de vencimiento: si se vence, la DGII rechaza las facturas.",
    ],
  },
  {
    clave: "solicitud", etapa: 2,
    titulo: "Solicitud para ser emisor electrónico",
    explicacion: "Se hace en la OFV con el formulario FI-GDF-016. Si la aprueban, la DGII te da usuario y clave del Portal de Certificación de Facturación Electrónica.",
    instrucciones: [
      "En la OFV, entra a «Solicitudes» y llena el «Formulario de Solicitud para ser Emisor Electrónico» (FI-GDF-016).",
      "Espera la respuesta de la DGII. Si la rechazan, corrige lo que indiquen y vuelve a enviarla.",
      "Cuando la aprueben, guarda el usuario y la clave del Portal de Certificación.",
    ],
    enlace: { texto: "Abrir la Oficina Virtual", url: OFV_URL },
  },
  {
    clave: "postulacion", etapa: 2,
    titulo: "Postulación en el Portal de Certificación",
    explicacion: "En el Portal de Certificación se registra el sistema con el que vas a facturar. Abajo tienes los datos que debes copiar.",
    instrucciones: [
      "Entra al Portal de Certificación con el usuario y la clave que te dio la DGII.",
      "Toca «Crear Postulación» en «Emisor Electrónico».",
      "Tipo de Registro: Emisor Electrónico. Tipo de Software: adquirido de un proveedor externo.",
      "Copia el nombre del software, la versión, las 3 direcciones (URL) y los datos del proveedor que aparecen abajo.",
      "Toca «Generar archivo», firma el XML con tu certificado digital (puedes usar la App Firma Digital de la DGII) y súbelo.",
      "La DGII revisa que el RNC esté al día y que el firmante y el certificado coincidan.",
    ],
  },
  {
    clave: "pruebas", etapa: 3,
    titulo: "Set de pruebas (simulación)",
    explicacion: "Se envían facturas de prueba con datos parecidos a tus ventas reales para demostrar que el sistema funciona. El proveedor te acompaña en este paso.",
    instrucciones: [
      "Coordina con el proveedor el envío de las facturas de prueba (consumo, crédito fiscal y notas de crédito).",
      "Las facturas de consumo menores de RD$250,000 se prueban primero con su resumen y luego se sube el XML completo en «Facturas de consumo < 250Mil».",
      "Revisa en el portal que cada prueba quede «Aceptado».",
    ],
  },
  {
    clave: "urls", etapa: 3,
    titulo: "Direcciones de producción",
    explicacion: "Al pasar las pruebas, se completan en el formulario las direcciones (URL) de producción de Autenticación, Recepción y Aprobación Comercial.",
    instrucciones: [
      "En el Portal de Certificación, completa las URL de producción que aparecen abajo.",
      "La DGII las guarda en su directorio de emisores.",
    ],
  },
  {
    clave: "declaracion", etapa: 3,
    titulo: "Declaración jurada",
    explicacion: "Una declaración electrónica de que la certificación se hizo de forma íntegra, sin fraude ni irregularidades.",
    instrucciones: [
      "Completa la declaración jurada en el Portal de Certificación.",
      "Toca «Generar Archivo» y fírmala con el certificado digital del representante.",
      "Súbela con «Enviar Archivo». La DGII vuelve a revisar que estés al día.",
    ],
  },
  {
    clave: "autorizado", etapa: 4,
    titulo: "Autorización como emisor electrónico",
    explicacion: "Cuando la DGII acepta las pruebas y la declaración, el negocio queda autorizado y en la OFV aparece el menú «Facturación Electrónica».",
    instrucciones: [
      "Entra a la OFV y confirma que aparece el menú «Facturación Electrónica».",
      "En «Mantenimiento de directorio», sube las URL de producción de recepción, aprobación comercial y autenticación.",
      "Anota aquí la fecha en que quedaste autorizado.",
    ],
    enlace: { texto: "Abrir la Oficina Virtual", url: OFV_URL },
  },
  {
    clave: "secuencias", etapa: 4, automatico: true,
    titulo: "Secuencias e-NCF",
    explicacion: "Los números de comprobante fiscal electrónico que la DGII autoriza al negocio. Sin ellos no se puede emitir.",
    instrucciones: [
      "En la OFV, solicita secuencias e-NCF de tipo 32 (Factura de Consumo). Si le vendes a negocios con RNC, también de tipo 31 (Crédito Fiscal), y de tipo 34 (Nota de Crédito) para devoluciones.",
      "Escribe aquí cada rango autorizado (desde, hasta y vencimiento).",
    ],
  },
];

export const TIPOS_CONTRIBUYENTE: Record<string, string> = {
  micro: "Micro",
  pequeno: "Pequeño",
  no_clasificado: "No clasificado",
  mediano: "Mediano",
  grande_local: "Grande local",
  grande_nacional: "Grande nacional",
  no_se: "No lo sé",
};

export const ENTIDADES_CERTIFICADO: Record<string, string> = {
  camara_sd: "Cámara de Comercio y Producción de Santo Domingo (Digifirma)",
  avansi: "AVANSI (Viafirma)",
  ogtic: "OGTIC",
  otra: "Otra entidad autorizada por INDOTEL",
};

export const TIPOS_ENCF: Record<string, string> = {
  "31": "31 · Factura de Crédito Fiscal",
  "32": "32 · Factura de Consumo",
  "33": "33 · Nota de Débito",
  "34": "34 · Nota de Crédito",
};

/** Fecha límite de la Ley 32-23 para Pequeños, Micro y No Clasificados (prórroga del Aviso DGII 06-26). */
export const FECHA_LIMITE_PEQUENOS = "2026-11-15";

/** Datos del proveedor que la plataforma configura y el negocio copia en el Portal de Certificación. */
export type ProveedorFE = {
  nombre: string;
  rnc: string;
  software: string;
  version: string;
  urlRecepcion: string;
  urlAprobacion: string;
  urlAutenticacion: string;
  contacto: string;
};

export const PROVEEDOR_VACIO: ProveedorFE = {
  nombre: "", rnc: "", software: "", version: "", urlRecepcion: "", urlAprobacion: "", urlAutenticacion: "", contacto: "",
};

// ---------- Validaciones (las usan servidor y pantallas) ----------

export const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** RNC de 9 dígitos: dígito verificador módulo 11 de la DGII. */
export function rncValido(rnc: string): boolean {
  if (!/^\d{9}$/.test(rnc)) return false;
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((s, p, i) => s + p * Number(rnc[i]), 0);
  const r = suma % 11;
  const dv = r === 0 ? 2 : r === 1 ? 1 : 11 - r;
  return dv === Number(rnc[8]);
}

/** Cédula de 11 dígitos: dígito verificador de Luhn. */
export function cedulaValida(cedula: string): boolean {
  if (!/^\d{11}$/.test(cedula)) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(cedula[i]) * (i % 2 === 0 ? 1 : 2);
    if (n > 9) n -= 9;
    suma += n;
  }
  return (10 - (suma % 10)) % 10 === Number(cedula[10]);
}

/** «ok» si el número parece válido; «revisar» si tiene el largo correcto pero el dígito verificador no cuadra. */
export function revisarIdentificacion(valor: string): "ok" | "revisar" | "largo" {
  const d = soloDigitos(valor);
  if (d.length === 9) return rncValido(d) ? "ok" : "revisar";
  if (d.length === 11) return cedulaValida(d) ? "ok" : "revisar";
  return "largo";
}

/** e-NCF: E + tipo (2) + 10 dígitos. */
export const encfValido = (v: string, tipo?: string) => /^E\d{12}$/.test(v) && (!tipo || v.slice(1, 3) === tipo);
