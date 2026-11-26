import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@shared/schema";
import type { ClaveFuncion } from "@shared/funciones-plan";

export type PlanPublico = Omit<Plan, "stripeProducto" | "stripePrecio" | "stripePrecioAnual" | "stripeProductoReal" | "stripePrecioReal" | "stripePrecioAnualReal"> & {
  /** Lo que de verdad se cobra (con la comisión de Stripe si la plataforma la suma). */
  precioCobro?: string;
  precioCobroAnual?: string | null;
};

export const cobroMensual = (p: PlanPublico) => p.precioCobro ?? p.precioMensual;
export const cobroAnual = (p: PlanPublico) => (p.precioAnual ? p.precioCobroAnual ?? p.precioAnual : null);

export type DatosPago = {
  activo: boolean;
  modo: "prueba" | "real" | null;
  puedePagar: boolean;
  esSucursal: boolean;
  suscripcion: { planId: number; estado: string; periodo: "mes" | "anio" | string; cancelaAlFinal: boolean; fechaFin: string; conTarjeta: boolean } | null;
};

export type DatosSuscripcion = {
  pago?: DatosPago;
  plan: PlanPublico | null;
  vigente: { nombre: string; funciones: ClaveFuncion[]; todo: boolean; cortesia: boolean } | null;
  planes: PlanPublico[];
  diasRestantes: number;
  proximoAVencer: boolean;
  expirado: boolean;
  estadoSuscripcion: string;
  fechaVencimiento: string | null;
};

/** Plan del negocio (comparte la caché con el resto del panel). */
export function useSuscripcion(colmadoId: number | null | undefined) {
  return useQuery<DatosSuscripcion>({
    queryKey: ["suscripcion", colmadoId],
    queryFn: async () => {
      const res = await fetch(`/api/colmados/${colmadoId}/suscripcion`);
      if (!res.ok) throw new Error("Error al cargar suscripción");
      return res.json();
    },
    enabled: !!colmadoId,
  });
}

/** ¿El plan incluye esta función? Mientras carga se da por sí para no mostrar candados de más. */
export function tiene(datos: DatosSuscripcion | undefined, funcion: ClaveFuncion): boolean {
  if (!datos?.vigente) return true;
  return datos.vigente.funciones.includes(funcion);
}

/** El plan más barato (pagado) que trae la función. */
export function planQueLaTrae(datos: DatosSuscripcion | undefined, funcion: ClaveFuncion): PlanPublico | undefined {
  return (datos?.planes ?? [])
    .filter((p) => !p.esTrial && (p.funciones ?? []).includes(funcion))
    .sort((a, b) => Number(a.precioMensual) - Number(b.precioMensual))[0];
}
