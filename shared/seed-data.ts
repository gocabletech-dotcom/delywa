import type { InsertTipoNegocioCatalogo, InsertPlan, InsertConfiguracionSistema, InsertMenuPlantilla, InsertMenuPlantillaItem } from "./schema";
import type { NominaReglas } from "./schema";

export type PoliticaNominaPais = {
  codigo: string;
  nombre: string;
  descripcion: string;
  limites: { horasOrdinariasDiariasMax: number; multiplicadorHoraExtraMin: number; multiplicadorFeriadoMin: number; recargoNocturnoMax: number };
  reglas: NominaReglas;
};

// Valores de referencia editables: sirven como punto de partida y no sustituyen asesoría laboral.
// Las fechas se mantienen explícitas por año para que una nómina calculada sea reproducible.
export const politicasNominaSeed: PoliticaNominaPais[] = [
  {
    codigo: "DO", nombre: "República Dominicana",
    descripcion: "Referencia general del Código de Trabajo dominicano.",
    limites: { horasOrdinariasDiariasMax: 8, multiplicadorHoraExtraMin: 1.35, multiplicadorFeriadoMin: 2, recargoNocturnoMax: 100 },
    reglas: { horasOrdinariasDiarias: 8, multiplicadorHoraExtra: 1.35, multiplicadorFeriado: 2, recargoNocturnoPorcentaje: 15, retencionPorcentaje: 0, retencionFija: 0, feriados: ["2026-01-01", "2026-01-06", "2026-01-21", "2026-02-27", "2026-04-03", "2026-05-01", "2026-06-04", "2026-08-16", "2026-09-24", "2026-11-06", "2026-12-25"], horasPeriodoSalario: 160 },
  },
  {
    codigo: "AR", nombre: "Argentina",
    descripcion: "Referencia general de jornada y recargos laborales argentinos.",
    limites: { horasOrdinariasDiariasMax: 8, multiplicadorHoraExtraMin: 1.5, multiplicadorFeriadoMin: 2, recargoNocturnoMax: 100 },
    reglas: { horasOrdinariasDiarias: 8, multiplicadorHoraExtra: 1.5, multiplicadorFeriado: 2, recargoNocturnoPorcentaje: 0, retencionPorcentaje: 0, retencionFija: 0, feriados: ["2026-01-01", "2026-02-16", "2026-02-17", "2026-03-24", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25", "2026-06-15", "2026-06-20", "2026-07-09", "2026-08-17", "2026-10-12", "2026-11-20", "2026-12-08", "2026-12-25"], horasPeriodoSalario: 192 },
  },
  {
    codigo: "US", nombre: "Estados Unidos",
    descripcion: "Referencia federal; algunos estados y contratos pueden exigir reglas distintas.",
    limites: { horasOrdinariasDiariasMax: 8, multiplicadorHoraExtraMin: 1.5, multiplicadorFeriadoMin: 1, recargoNocturnoMax: 100 },
    reglas: { horasOrdinariasDiarias: 8, multiplicadorHoraExtra: 1.5, multiplicadorFeriado: 1, recargoNocturnoPorcentaje: 0, retencionPorcentaje: 0, retencionFija: 0, feriados: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-04", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"], horasPeriodoSalario: 160 },
  },
];

export const tiposNegocioSeed: InsertTipoNegocioCatalogo[] = [
  {
    slug: "colmado",
    nombre: "Colmado",
    descripcion: "Tienda de barrio con productos básicos y abarrotes",
    icono: "Store",
    activo: true,
    orden: 1,
  },
  {
    slug: "colmadon",
    nombre: "Colmadón",
    descripcion: "Colmado grande con más variedad de productos",
    icono: "Warehouse",
    activo: true,
    orden: 2,
  },
  {
    slug: "cafeteria",
    nombre: "Cafetería",
    descripcion: "Establecimiento con café, bebidas y comida ligera",
    icono: "Coffee",
    activo: true,
    orden: 3,
  },
  {
    slug: "restaurant",
    nombre: "Restaurante",
    descripcion: "Establecimiento de comida con menú completo",
    icono: "UtensilsCrossed",
    activo: true,
    orden: 4,
  },
  {
    slug: "fast_food",
    nombre: "Comida Rápida",
    descripcion: "Establecimiento de comida rápida y servicio express",
    icono: "Sandwich",
    activo: true,
    orden: 5,
  },
  {
    slug: "farmacia",
    nombre: "Farmacia",
    descripcion: "Farmacia con medicamentos y productos de salud",
    icono: "Pill",
    activo: true,
    orden: 6,
  },
  {
    slug: "pizzeria",
    nombre: "Pizzería",
    descripcion: "Establecimiento especializado en pizzas",
    icono: "Pizza",
    activo: true,
    orden: 7,
  },
];

export const planesSeed: InsertPlan[] = [
  {
    nombre: "Trial",
    slug: "trial",
    precioMensual: "0",
    duracionDias: 15,
    esTrial: true,
    descripcionCorta: "Prueba gratis por 15 días",
    caracteristicas: [
      "15 días de prueba gratis",
      "1 delivery incluido",
      "Hasta 20 pedidos diarios",
      "Soporte por WhatsApp",
    ],
    limiteDeliveries: 1,
    limitePedidosDiarios: 20,
    soportePrioritario: false,
    activo: true,
    orden: 1,
  },
  {
    nombre: "Básico",
    slug: "basico",
    precioMensual: "999",
    duracionDias: 30,
    esTrial: false,
    descripcionCorta: "RD$999/mes - Ideal para empezar",
    caracteristicas: [
      "Hasta 2 deliveries",
      "Hasta 50 pedidos diarios",
      "Reportes básicos",
      "Soporte por WhatsApp",
    ],
    limiteDeliveries: 2,
    limitePedidosDiarios: 50,
    soportePrioritario: false,
    activo: true,
    orden: 2,
  },
  {
    nombre: "Profesional",
    slug: "profesional",
    precioMensual: "1999",
    duracionDias: 30,
    esTrial: false,
    descripcionCorta: "RD$1999/mes - Para negocios en crecimiento",
    caracteristicas: [
      "Deliveries ilimitados",
      "Pedidos ilimitados",
      "Reportes avanzados",
      "Soporte prioritario",
      "Rutas optimizadas",
    ],
    limiteDeliveries: null,
    limitePedidosDiarios: null,
    soportePrioritario: true,
    activo: true,
    orden: 3,
  },
];

export const configuracionSistemaSeed: InsertConfiguracionSistema[] = [
  {
    clave: "platform_logo",
    valor: "/delywa-logo.png",
    descripcion: "Logo principal de la plataforma DelyWa",
    tipo: "url",
  },
  {
    clave: "platform_name",
    valor: "DelyWa",
    descripcion: "Nombre de la plataforma",
    tipo: "texto",
  },
  {
    clave: "whatsapp_soporte",
    valor: "+19193436706",
    descripcion: "Número de WhatsApp para soporte y suscripciones",
    tipo: "texto",
  },
  {
    clave: "moneda",
    valor: "RD$",
    descripcion: "Símbolo de moneda a usar en la plataforma",
    tipo: "texto",
  },
  {
    clave: "dias_gracia_default",
    valor: "6",
    descripcion: "Días de gracia por defecto antes de suspender suscripción",
    tipo: "numero",
  },
];

// Plantillas de menú por tipo de negocio
export const menuPlantillasSeed: { plantilla: InsertMenuPlantilla; items: Omit<InsertMenuPlantillaItem, "plantillaId">[] }[] = [
  // ============ COLMADO ============
  {
    plantilla: { tipoNegocio: "colmado", categoria: "Abarrotes", orden: 1 },
    items: [
      { nombre: "Arroz (libra)", precioSugerido: "45", orden: 1 },
      { nombre: "Habichuelas (libra)", precioSugerido: "55", orden: 2 },
      { nombre: "Aceite (botella)", precioSugerido: "180", orden: 3 },
      { nombre: "Azúcar (libra)", precioSugerido: "40", orden: 4 },
      { nombre: "Sal (paquete)", precioSugerido: "25", orden: 5 },
      { nombre: "Café (paquete)", precioSugerido: "150", orden: 6 },
    ],
  },
  {
    plantilla: { tipoNegocio: "colmado", categoria: "Bebidas", orden: 2 },
    items: [
      { nombre: "Refresco grande", precioSugerido: "80", orden: 1 },
      { nombre: "Refresco pequeño", precioSugerido: "50", orden: 2 },
      { nombre: "Agua (botella)", precioSugerido: "25", orden: 3 },
      { nombre: "Jugo (cartón)", precioSugerido: "60", orden: 4 },
      { nombre: "Cerveza", precioSugerido: "100", orden: 5 },
    ],
  },
  {
    plantilla: { tipoNegocio: "colmado", categoria: "Lácteos", orden: 3 },
    items: [
      { nombre: "Leche (cartón)", precioSugerido: "75", orden: 1 },
      { nombre: "Queso (libra)", precioSugerido: "180", orden: 2 },
      { nombre: "Mantequilla", precioSugerido: "90", orden: 3 },
      { nombre: "Huevos (unidad)", precioSugerido: "12", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "colmado", categoria: "Carnes", orden: 4 },
    items: [
      { nombre: "Pollo (libra)", precioSugerido: "95", orden: 1 },
      { nombre: "Carne de res (libra)", precioSugerido: "180", orden: 2 },
      { nombre: "Salami", precioSugerido: "60", orden: 3 },
      { nombre: "Salchichón", precioSugerido: "50", orden: 4 },
    ],
  },

  // ============ COLMADÓN ============
  {
    plantilla: { tipoNegocio: "colmadon", categoria: "Abarrotes", orden: 1 },
    items: [
      { nombre: "Arroz (saco 25lb)", precioSugerido: "950", orden: 1 },
      { nombre: "Arroz (libra)", precioSugerido: "42", orden: 2 },
      { nombre: "Habichuelas (lata grande)", precioSugerido: "120", orden: 3 },
      { nombre: "Aceite (galón)", precioSugerido: "650", orden: 4 },
      { nombre: "Aceite (botella)", precioSugerido: "175", orden: 5 },
      { nombre: "Azúcar (saco 5lb)", precioSugerido: "180", orden: 6 },
    ],
  },
  {
    plantilla: { tipoNegocio: "colmadon", categoria: "Bebidas al por mayor", orden: 2 },
    items: [
      { nombre: "Caja de refrescos (24)", precioSugerido: "1100", orden: 1 },
      { nombre: "Fardo de agua", precioSugerido: "280", orden: 2 },
      { nombre: "Caja de cerveza", precioSugerido: "1800", orden: 3 },
    ],
  },
  {
    plantilla: { tipoNegocio: "colmadon", categoria: "Productos de limpieza", orden: 3 },
    items: [
      { nombre: "Detergente (bolsa grande)", precioSugerido: "180", orden: 1 },
      { nombre: "Cloro (galón)", precioSugerido: "120", orden: 2 },
      { nombre: "Suavizante", precioSugerido: "95", orden: 3 },
      { nombre: "Jabón de cuaba", precioSugerido: "45", orden: 4 },
    ],
  },

  // ============ CAFETERÍA ============
  {
    plantilla: { tipoNegocio: "cafeteria", categoria: "Bebidas Calientes", orden: 1 },
    items: [
      { nombre: "Café negro", precioSugerido: "50", orden: 1 },
      { nombre: "Café con leche", precioSugerido: "75", orden: 2 },
      { nombre: "Cappuccino", precioSugerido: "120", orden: 3 },
      { nombre: "Chocolate caliente", precioSugerido: "90", orden: 4 },
      { nombre: "Té", precioSugerido: "60", orden: 5 },
    ],
  },
  {
    plantilla: { tipoNegocio: "cafeteria", categoria: "Bebidas Frías", orden: 2 },
    items: [
      { nombre: "Frappé", precioSugerido: "180", orden: 1 },
      { nombre: "Smoothie de frutas", precioSugerido: "150", orden: 2 },
      { nombre: "Jugo natural", precioSugerido: "100", orden: 3 },
      { nombre: "Limonada", precioSugerido: "80", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "cafeteria", categoria: "Desayunos", orden: 3 },
    items: [
      { nombre: "Mangú con huevos", precioSugerido: "200", orden: 1 },
      { nombre: "Sandwich de jamón y queso", precioSugerido: "150", orden: 2 },
      { nombre: "Tostadas con mantequilla", precioSugerido: "80", orden: 3 },
      { nombre: "Arepa", precioSugerido: "120", orden: 4 },
      { nombre: "Empanada", precioSugerido: "60", orden: 5 },
    ],
  },
  {
    plantilla: { tipoNegocio: "cafeteria", categoria: "Postres", orden: 4 },
    items: [
      { nombre: "Bizcocho", precioSugerido: "80", orden: 1 },
      { nombre: "Donas", precioSugerido: "50", orden: 2 },
      { nombre: "Croissant", precioSugerido: "75", orden: 3 },
      { nombre: "Flan", precioSugerido: "90", orden: 4 },
    ],
  },

  // ============ RESTAURANT ============
  {
    plantilla: { tipoNegocio: "restaurant", categoria: "Platos del Día", orden: 1 },
    items: [
      { nombre: "Bandera dominicana", descripcion: "Arroz, habichuelas y carne", precioSugerido: "250", orden: 1 },
      { nombre: "Pollo guisado", descripcion: "Con arroz y ensalada", precioSugerido: "220", orden: 2 },
      { nombre: "Chuleta frita", descripcion: "Con tostones y ensalada", precioSugerido: "280", orden: 3 },
      { nombre: "Pescado frito", descripcion: "Con arroz y ensalada", precioSugerido: "350", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "restaurant", categoria: "Carnes", orden: 2 },
    items: [
      { nombre: "Bistec encebollado", precioSugerido: "320", orden: 1 },
      { nombre: "Carne guisada", precioSugerido: "280", orden: 2 },
      { nombre: "Chivo guisado", precioSugerido: "380", orden: 3 },
      { nombre: "Costillas BBQ", precioSugerido: "450", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "restaurant", categoria: "Acompañantes", orden: 3 },
    items: [
      { nombre: "Arroz blanco", precioSugerido: "80", orden: 1 },
      { nombre: "Arroz moro", precioSugerido: "100", orden: 2 },
      { nombre: "Tostones", precioSugerido: "70", orden: 3 },
      { nombre: "Ensalada", precioSugerido: "60", orden: 4 },
      { nombre: "Yuca frita", precioSugerido: "80", orden: 5 },
    ],
  },
  {
    plantilla: { tipoNegocio: "restaurant", categoria: "Bebidas", orden: 4 },
    items: [
      { nombre: "Jugo natural", precioSugerido: "100", orden: 1 },
      { nombre: "Refresco", precioSugerido: "80", orden: 2 },
      { nombre: "Morir soñando", precioSugerido: "120", orden: 3 },
      { nombre: "Cerveza", precioSugerido: "150", orden: 4 },
    ],
  },

  // ============ FAST FOOD ============
  {
    plantilla: { tipoNegocio: "fast_food", categoria: "Hamburguesas", orden: 1 },
    items: [
      { nombre: "Hamburguesa sencilla", precioSugerido: "180", orden: 1 },
      { nombre: "Hamburguesa doble", precioSugerido: "280", orden: 2 },
      { nombre: "Hamburguesa con queso", precioSugerido: "220", orden: 3 },
      { nombre: "Hamburguesa especial", descripcion: "Con tocineta y huevo", precioSugerido: "350", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "fast_food", categoria: "Hot Dogs", orden: 2 },
    items: [
      { nombre: "Hot dog sencillo", precioSugerido: "100", orden: 1 },
      { nombre: "Hot dog con queso", precioSugerido: "130", orden: 2 },
      { nombre: "Hot dog especial", precioSugerido: "180", orden: 3 },
    ],
  },
  {
    plantilla: { tipoNegocio: "fast_food", categoria: "Pollo Frito", orden: 3 },
    items: [
      { nombre: "Pechuga frita", precioSugerido: "180", orden: 1 },
      { nombre: "Muslo frito", precioSugerido: "120", orden: 2 },
      { nombre: "Combo familiar (8 piezas)", precioSugerido: "850", orden: 3 },
    ],
  },
  {
    plantilla: { tipoNegocio: "fast_food", categoria: "Acompañantes", orden: 4 },
    items: [
      { nombre: "Papas fritas", precioSugerido: "100", orden: 1 },
      { nombre: "Aros de cebolla", precioSugerido: "120", orden: 2 },
      { nombre: "Nuggets (6)", precioSugerido: "150", orden: 3 },
    ],
  },

  // ============ FARMACIA ============
  {
    plantilla: { tipoNegocio: "farmacia", categoria: "Medicamentos Comunes", orden: 1 },
    items: [
      { nombre: "Paracetamol", precioSugerido: "50", orden: 1 },
      { nombre: "Ibuprofeno", precioSugerido: "60", orden: 2 },
      { nombre: "Antigripal", precioSugerido: "120", orden: 3 },
      { nombre: "Aspirina", precioSugerido: "45", orden: 4 },
      { nombre: "Antialérgico", precioSugerido: "85", orden: 5 },
    ],
  },
  {
    plantilla: { tipoNegocio: "farmacia", categoria: "Digestivos", orden: 2 },
    items: [
      { nombre: "Antiácido", precioSugerido: "90", orden: 1 },
      { nombre: "Sal de fruta", precioSugerido: "75", orden: 2 },
      { nombre: "Laxante", precioSugerido: "110", orden: 3 },
      { nombre: "Suero oral", precioSugerido: "65", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "farmacia", categoria: "Cuidado Personal", orden: 3 },
    items: [
      { nombre: "Curitas", precioSugerido: "40", orden: 1 },
      { nombre: "Alcohol", precioSugerido: "55", orden: 2 },
      { nombre: "Algodón", precioSugerido: "35", orden: 3 },
      { nombre: "Gasas", precioSugerido: "45", orden: 4 },
      { nombre: "Vendas", precioSugerido: "80", orden: 5 },
    ],
  },
  {
    plantilla: { tipoNegocio: "farmacia", categoria: "Vitaminas", orden: 4 },
    items: [
      { nombre: "Vitamina C", precioSugerido: "150", orden: 1 },
      { nombre: "Multivitamínico", precioSugerido: "280", orden: 2 },
      { nombre: "Hierro", precioSugerido: "180", orden: 3 },
      { nombre: "Calcio", precioSugerido: "200", orden: 4 },
    ],
  },

  // ============ PIZZERÍA ============
  {
    plantilla: { tipoNegocio: "pizzeria", categoria: "Pizzas Clásicas", orden: 1 },
    items: [
      { nombre: "Pizza de queso", descripcion: "8 porciones", precioSugerido: "450", orden: 1 },
      { nombre: "Pizza de pepperoni", descripcion: "8 porciones", precioSugerido: "550", orden: 2 },
      { nombre: "Pizza hawaiana", descripcion: "Jamón y piña", precioSugerido: "580", orden: 3 },
      { nombre: "Pizza suprema", descripcion: "Todo incluido", precioSugerido: "680", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "pizzeria", categoria: "Pizzas Especiales", orden: 2 },
    items: [
      { nombre: "Pizza BBQ chicken", precioSugerido: "650", orden: 1 },
      { nombre: "Pizza 4 quesos", precioSugerido: "620", orden: 2 },
      { nombre: "Pizza vegetariana", precioSugerido: "550", orden: 3 },
      { nombre: "Pizza mexicana", descripcion: "Con jalapeños", precioSugerido: "600", orden: 4 },
    ],
  },
  {
    plantilla: { tipoNegocio: "pizzeria", categoria: "Porciones", orden: 3 },
    items: [
      { nombre: "Porción de pizza", precioSugerido: "80", orden: 1 },
      { nombre: "Porción especial", precioSugerido: "100", orden: 2 },
    ],
  },
  {
    plantilla: { tipoNegocio: "pizzeria", categoria: "Complementos", orden: 4 },
    items: [
      { nombre: "Pan de ajo", precioSugerido: "120", orden: 1 },
      { nombre: "Alitas BBQ (6)", precioSugerido: "280", orden: 2 },
      { nombre: "Palitos de queso", precioSugerido: "180", orden: 3 },
    ],
  },
  {
    plantilla: { tipoNegocio: "pizzeria", categoria: "Bebidas", orden: 5 },
    items: [
      { nombre: "Refresco 2 litros", precioSugerido: "120", orden: 1 },
      { nombre: "Refresco lata", precioSugerido: "60", orden: 2 },
      { nombre: "Agua", precioSugerido: "35", orden: 3 },
    ],
  },
];
