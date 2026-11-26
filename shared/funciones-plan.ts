// Funciones que cada plan puede incluir o no. Lo básico (pedidos por la tienda web y su bot, menú e
// inventario, clientes, tickets, avisos al celular, mapa del delivery y reportes) va en todos los planes
// y no se bloquea nunca, para no romper la venta.

export type FuncionPlan = {
  clave: string;
  nombre: string;
  /** Todavía no se puede usar: sale en los planes como «En proceso». */
  enProceso?: boolean;
};

export const FUNCIONES_PLAN = [
  { clave: "ia", nombre: "Inteligencia artificial: notas de voz y entender mejor" },
  { clave: "mostrador", nombre: "Mostrador (ventas en el colmado)" },
  { clave: "fiado", nombre: "Fiado (cuentas de clientes)" },
  { clave: "compras", nombre: "Compras con foto de factura y costos" },
  { clave: "nomina_delivery", nombre: "Nómina, ganancias y adelantos de los repartidores" },
  { clave: "ofertas", nombre: "Ofertas a los clientes" },
  { clave: "empleados", nombre: "Empleados, asistencia y nómina" },
  { clave: "facturacion_electronica", nombre: "Facturación electrónica", enProceso: true },
] as const satisfies readonly FuncionPlan[];

export type ClaveFuncion = (typeof FUNCIONES_PLAN)[number]["clave"];
export const CLAVES_FUNCIONES: ClaveFuncion[] = FUNCIONES_PLAN.map((f) => f.clave);
export const esClaveFuncion = (v: unknown): v is ClaveFuncion => typeof v === "string" && (CLAVES_FUNCIONES as string[]).includes(v);
export const nombreFuncion = (clave: string) => FUNCIONES_PLAN.find((f) => f.clave === clave)?.nombre ?? clave;

/** Lo que traen todos los planes (no se puede quitar). */
export const INCLUIDO_SIEMPRE = [
  "Pedidos por la tienda web y su bot",
  "Menú e inventario",
  "Clientes",
  "Impresora de tickets",
  "Avisos al celular",
  "Mapa del delivery",
  "Reportes",
];

/** Precio de un plan para mostrarlo: «US$9.99». */
export function precioPlan(monto: string | number | null | undefined, moneda = "USD"): string {
  const n = Number(monto ?? 0);
  const simbolo = moneda === "USD" ? "US$" : moneda === "DOP" ? "RD$" : `${moneda} `;
  return `${simbolo}${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
