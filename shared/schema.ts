import "./columns";
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, numeric, unique, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ PAÍSES ============

export const paises = sqliteTable("paises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  codigo: text("codigo").notNull().unique(), // ISO 3166-1 alpha-2 (DO, AR, MX...)
  nombre: text("nombre").notNull(),
  bandera: text("bandera"), // emoji 🇩🇴 🇦🇷
  prefijoCelular: text("prefijo_celular").notNull(), // +1, +54
  moneda: text("moneda").notNull(), // Peso Dominicano, Peso Argentino
  simboloMoneda: text("simbolo_moneda").notNull(), // RD$, $
  zonaHoraria: text("zona_horaria").notNull(), // America/Santo_Domingo
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  // Address format metadata
  etiquetaEstado: text("etiqueta_estado"), // "Provincia" (DO/AR) or "State" (US)
  etiquetaCodigoPostal: text("etiqueta_codigo_postal"), // null = no ZIP field; "ZIP Code" for US
  requiereCodigoPostal: integer("requiere_codigo_postal", { mode: "boolean" }).notNull().default(false),
  ejemploDireccion: text("ejemplo_direccion"), // "Calle Principal #123" or "123 Main St"
  ejemploCiudad: text("ejemplo_ciudad"), // "Santo Domingo" or "New York"
  ejemploEstado: text("ejemplo_estado"), // "Distrito Nacional" or "NY"
  ejemploCodigoPostal: text("ejemplo_codigo_postal"), // null or "10001"
  patronCodigoPostal: text("patron_codigo_postal"), // regex pattern, e.g. \d{5}(-\d{4})? for US
});

export const insertPaisSchema = createInsertSchema(paises).omit({
  id: true,
  fechaCreacion: true,
});

export type Pais = typeof paises.$inferSelect;
export type InsertPais = z.infer<typeof insertPaisSchema>;

export const tiposNegocio = [
  "colmado",
  "colmadon", 
  "cafeteria",
  "restaurant",
  "fast_food",
  "farmacia",
  "pizzeria"
] as const;

export type TipoNegocio = typeof tiposNegocio[number];

// ============ CATÁLOGO DE TIPOS DE NEGOCIO ============

export const tiposNegocioCatalogo = sqliteTable("tipos_negocio_catalogo", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  icono: text("icono"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertTipoNegocioCatalogoSchema = createInsertSchema(tiposNegocioCatalogo).omit({
  id: true,
  fechaCreacion: true,
});

export type TipoNegocioCatalogo = typeof tiposNegocioCatalogo.$inferSelect;
export type InsertTipoNegocioCatalogo = z.infer<typeof insertTipoNegocioCatalogoSchema>;

// ============ CONFIGURACIÓN DEL SISTEMA ============

export const configuracionSistema = sqliteTable("configuracion_sistema", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clave: text("clave").notNull().unique(),
  valor: text("valor"),
  descripcion: text("descripcion"),
  tipo: text("tipo").notNull().default("texto"), // texto, url, numero, boolean, json
  fechaModificacion: integer("fecha_modificacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertConfiguracionSistemaSchema = createInsertSchema(configuracionSistema).omit({
  id: true,
  fechaModificacion: true,
});

export type ConfiguracionSistema = typeof configuracionSistema.$inferSelect;
export type InsertConfiguracionSistema = z.infer<typeof insertConfiguracionSistemaSchema>;

// ============ PLANES Y SUSCRIPCIONES ============

export const planes = sqliteTable("planes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  slug: text("slug").notNull().unique(),
  precioMensual: numeric("precio_mensual").notNull(),
  duracionDias: integer("duracion_dias").notNull().default(30),
  esTrial: integer("es_trial", { mode: "boolean" }).notNull().default(false),
  descripcionCorta: text("descripcion_corta"),
  caracteristicas: text("caracteristicas", { mode: "json" }).$type<string[]>().default([]),
  limiteDeliveries: integer("limite_deliveries"),
  limitePedidosDiarios: integer("limite_pedidos_diarios"),
  soportePrioritario: integer("soporte_prioritario", { mode: "boolean" }).notNull().default(false),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const suscripciones = sqliteTable("suscripciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull(),
  fechaInicio: integer("fecha_inicio", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaFin: integer("fecha_fin", { mode: "timestamp_ms" }).notNull(),
  estado: text("estado").notNull().default("activa"), // activa, expirada, cancelada
  renovacionAutomatica: integer("renovacion_automatica", { mode: "boolean" }).notNull().default(false),
  ultimaFacturacion: integer("ultima_facturacion", { mode: "timestamp_ms" }),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("suscripciones_colmado_idx").on(t.colmadoId),
]);

export const insertPlanSchema = createInsertSchema(planes).omit({
  id: true,
  fechaCreacion: true,
});

export const insertSuscripcionSchema = createInsertSchema(suscripciones).omit({
  id: true,
  fechaCreacion: true,
});

export type Plan = typeof planes.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Suscripcion = typeof suscripciones.$inferSelect;
export type InsertSuscripcion = z.infer<typeof insertSuscripcionSchema>;

// ============ NEGOCIOS ============

// Estados de suscripción
export const estadosSuscripcion = ["activa", "en_gracia", "suspendida"] as const;
export type EstadoSuscripcion = typeof estadosSuscripcion[number];

export const colmados = sqliteTable("colmados", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  slug: text("slug").unique(),
  whatsappNumero: text("whatsapp_numero").notNull().unique(),
  direccion: text("direccion").notNull(),
  ciudad: text("ciudad"),
  provincia: text("provincia"),
  planId: integer("plan_id").notNull(),
  estado: text("estado").notNull().default("activo"),
  ownerUserId: text("owner_user_id"),
  whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
  whatsappAccessToken: text("whatsapp_access_token"),
  fechaSuscripcion: integer("fecha_suscripcion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  tipoNegocio: text("tipo_negocio").notNull().default("colmado"),
  impuesto: numeric("impuesto").default("0"),
  // Subscription lifecycle fields
  fechaInicioPlan: integer("fecha_inicio_plan", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
  fechaVencimiento: integer("fecha_vencimiento", { mode: "timestamp_ms" }),
  estadoSuscripcion: text("estado_suscripcion").notNull().default("activa"), // activa, en_gracia, suspendida
  diaCorte: integer("dia_corte").notNull().default(28), // 1-28: día del mes que vence
  diasGracia: integer("dias_gracia").notNull().default(6), // días de gracia antes de suspender
  // New configuration fields
  logo: text("logo"),
  colorPrimario: text("color_primario").notNull().default("#25D366"),
  descripcion: text("descripcion"),
  encargadoNombre: text("encargado_nombre"),
  telefonoAlternativo: text("telefono_alternativo"),
  latitud: text("latitud"),
  longitud: text("longitud"),
  costoDelivery: numeric("costo_delivery").default("50"),
  radioEntrega: numeric("radio_entrega").default("5"),
  tiempoEstimado: text("tiempo_estimado").default("20-30 min"),
  pedidoMinimo: numeric("pedido_minimo").default("0"),
  horaApertura: text("hora_apertura").default("08:00"),
  horaCierre: text("hora_cierre").default("22:00"),
  diasServicio: text("dias_servicio", { mode: "json" }).$type<string[]>().default(["lunes","martes","miercoles","jueves","viernes","sabado","domingo"]),
  estaAbiertoManual: integer("esta_abierto_manual", { mode: "boolean" }).default(true),
  mensajeCerrado: text("mensaje_cerrado").default("Estamos cerrados. Abrimos pronto."),
  mensajeBienvenida: text("mensaje_bienvenida"),
  mensajeConfirmacion: text("mensaje_confirmacion"),
  // Optional title and description shown when a customer tracking link is shared.
  tituloCompartirPedido: text("titulo_compartir_pedido"),
  descripcionCompartirPedido: text("descripcion_compartir_pedido"),
  // Evolution API fields (alternative to Meta WhatsApp API)
  evolutionApiUrl: text("evolution_api_url"),
  evolutionApiKey: text("evolution_api_key"),
  evolutionInstanceName: text("evolution_instance_name"),
  whatsappProvider: text("whatsapp_provider").default("meta"), // "meta" or "evolution"
  // Multi-country support
  paisId: integer("pais_id").references(() => paises.id, { onDelete: "set null" }),
  // Address code postal for countries that require it (e.g. US ZIP Code)
  codigoPostal: text("codigo_postal"),
  // Technology flags: which channels/integrations are enabled for this colmado
  tecnologiasHabilitadas: text("tecnologias_habilitadas", { mode: "json" })
    .$type<{ api_evo?: boolean; meta?: boolean; link_pedido?: boolean }>()
    .default({}),
  // Custom system prompt set by the colmado owner (overrides global default when non-empty)
  botPromptCustom: text("bot_prompt_custom"),
  // Parent business for multi-branch accounts. NULL identifies the legacy/main branch.
  negocioPrincipalId: integer("negocio_principal_id"),
}, (t) => [
  index("colmados_negocio_principal_idx").on(t.negocioPrincipalId),
  index("colmados_owner_idx").on(t.ownerUserId),
  index("colmados_wa_phone_id_idx").on(t.whatsappPhoneNumberId),
  index("colmados_evolution_instance_idx").on(t.evolutionInstanceName),
]);

// Shared TypeScript type for the tecnologias_habilitadas JSON field
export type TecnologiasHabilitadas = {
  api_evo?: boolean;
  meta?: boolean;
  link_pedido?: boolean;
};

export const deliveries = sqliteTable("deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  whatsappNumero: text("whatsapp_numero").notNull(),
  estado: text("estado").notNull().default("inactivo"),
  ultimaActivacion: integer("ultima_activacion", { mode: "timestamp_ms" }),
  ultimaActivacionOrigen: text("ultima_activacion_origen"),
  codigoAcceso: text("codigo_acceso"),
  fechaRegistro: integer("fecha_registro", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  // ── Configuración de pago ──
  modeloPago: text("modelo_pago").notNull().default("comision"), // salario | comision | mixto
  salarioMonto: numeric("salario_monto").notNull().default("0"),
  comisionFija: numeric("comision_fija").notNull().default("0"),
  comisionPorcentaje: numeric("comision_porcentaje").notNull().default("0"),
  periodoPago: text("periodo_pago").notNull().default("semanal"), // semanal | quincenal | mensual | personalizado
  // ── GPS en tiempo real ──
  ultimaLatitud: numeric("ultima_latitud"),
  ultimaLongitud: numeric("ultima_longitud"),
  ultimaUbicacionAt: integer("ultima_ubicacion_at", { mode: "timestamp_ms" }),
}, (t) => [
  index("deliveries_colmado_idx").on(t.colmadoId),
  index("deliveries_whatsapp_idx").on(t.whatsappNumero),
]);

// ============ EMPLEADOS, ASISTENCIA Y NÓMINA ============
export const empleados = sqliteTable("empleados", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negocioId: integer("negocio_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  nombres: text("nombres").notNull(),
  apellidos: text("apellidos"),
  cedula: text("cedula"),
  email: text("email"),
  telefono: text("telefono"),
  direccion: text("direccion"),
  puesto: text("puesto"),
  fechaIngreso: text("fecha_ingreso"),
  estado: text("estado").notNull().default("activo"),
  tipoPago: text("tipo_pago").notNull().default("por_hora"),
  tarifaHora: numeric("tarifa_hora").default("0"),
  salarioFijo: numeric("salario_fijo").default("0"),
  periodoPago: text("periodo_pago").notNull().default("quincenal"),
  moneda: text("moneda").notNull().default("USD"),
  notas: text("notas"),
  codigoAcceso: text("codigo_acceso").unique(),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaActualizacion: integer("fecha_actualizacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("empleados_negocio_idx").on(t.negocioId),
]);

export const empleadoSucursales = sqliteTable("empleado_sucursales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  empleadoId: integer("empleado_id").notNull().references(() => empleados.id, { onDelete: "cascade" }),
  sucursalId: integer("sucursal_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
}, (t) => [unique("empleado_sucursal_unico").on(t.empleadoId, t.sucursalId)]);

export const asistencias = sqliteTable("asistencias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  empleadoId: integer("empleado_id").notNull().references(() => empleados.id, { onDelete: "cascade" }),
  sucursalId: integer("sucursal_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  entrada: integer("entrada", { mode: "timestamp_ms" }).notNull(),
  salida: integer("salida", { mode: "timestamp_ms" }),
  horasTrabajadas: numeric("horas_trabajadas"),
  notas: text("notas"),
  corregidaPor: text("corregida_por"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("asistencias_empleado_fecha_idx").on(t.empleadoId, t.entrada),
  // Una sola jornada abierta por empleado.
  uniqueIndex("asistencias_abierta_uq").on(t.empleadoId).where(sql`salida IS NULL`),
]);

export const nominas = sqliteTable("nominas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negocioId: integer("negocio_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  periodoInicio: text("periodo_inicio").notNull(),
  periodoFin: text("periodo_fin").notNull(),
  estado: text("estado").notNull().default("borrador"),
  totalHoras: numeric("total_horas").notNull().default("0"),
  totalMonto: numeric("total_monto").notNull().default("0"),
  totalBruto: numeric("total_bruto").notNull().default("0"),
  totalDescuentos: numeric("total_descuentos").notNull().default("0"),
  totalNeto: numeric("total_neto").notNull().default("0"),
  reglasAplicadas: text("reglas_aplicadas", { mode: "json" }).$type<NominaReglas>(),
  cerradoPor: text("cerrado_por"),
  pagadoPor: text("pagado_por"),
  fechaCierre: integer("fecha_cierre", { mode: "timestamp_ms" }),
  fechaPago: integer("fecha_pago", { mode: "timestamp_ms" }),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("nominas_negocio_periodo_idx").on(t.negocioId, t.periodoInicio, t.periodoFin),
]);

export type NominaReglas = {
  horasOrdinariasDiarias: number;
  multiplicadorHoraExtra: number;
  multiplicadorFeriado: number;
  recargoNocturnoPorcentaje: number;
  retencionPorcentaje: number;
  retencionFija: number;
  feriados: string[];
  horasPeriodoSalario: number;
  paisId?: number | null;
  paisCodigo?: string;
  origenConfiguracion?: "plantilla_pais" | "manual";
  fechaConfiguracion?: string;
};

export const nominaConfiguraciones = sqliteTable("nomina_configuraciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negocioId: integer("negocio_id").notNull().references(() => colmados.id, { onDelete: "cascade" }).unique(),
  reglas: text("reglas", { mode: "json" }).$type<NominaReglas>().notNull(),
  fechaActualizacion: integer("fecha_actualizacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const nominaConfiguracionAuditorias = sqliteTable("nomina_configuracion_auditorias", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  negocioId: integer("negocio_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  paisId: integer("pais_id").references(() => paises.id, { onDelete: "set null" }),
  actorId: text("actor_id").notNull(),
  reglasAnteriores: text("reglas_anteriores", { mode: "json" }).$type<NominaReglas | null>(),
  reglasNuevas: text("reglas_nuevas", { mode: "json" }).$type<NominaReglas>().notNull(),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("nomina_configuracion_auditorias_negocio_fecha_idx").on(t.negocioId, t.fechaCreacion),
]);

export const nominaDetalles = sqliteTable("nomina_detalles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nominaId: integer("nomina_id").notNull().references(() => nominas.id, { onDelete: "cascade" }),
  empleadoId: integer("empleado_id").notNull().references(() => empleados.id, { onDelete: "restrict" }),
  horasTrabajadas: numeric("horas_trabajadas").notNull().default("0"),
  tipoPago: text("tipo_pago").notNull(),
  tarifaHora: numeric("tarifa_hora").notNull().default("0"),
  salarioBase: numeric("salario_base").notNull().default("0"),
  horasOrdinarias: numeric("horas_ordinarias").notNull().default("0"),
  horasExtra: numeric("horas_extra").notNull().default("0"),
  horasFeriado: numeric("horas_feriado").notNull().default("0"),
  bruto: numeric("bruto").notNull().default("0"),
  descuentos: numeric("descuentos").notNull().default("0"),
  ajustes: numeric("ajustes").notNull().default("0"),
  total: numeric("total").notNull().default("0"),
  notas: text("notas"),
}, (t) => [
  index("nomina_detalles_nomina_idx").on(t.nominaId),
]);

export type Empleado = typeof empleados.$inferSelect;
export type InsertEmpleado = typeof empleados.$inferInsert;
export type Asistencia = typeof asistencias.$inferSelect;
export type Nomina = typeof nominas.$inferSelect;
export type NominaDetalle = typeof nominaDetalles.$inferSelect;
export type NominaConfiguracionAuditoria = typeof nominaConfiguracionAuditorias.$inferSelect;

export const pedidos = sqliteTable("pedidos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  deliveryId: integer("delivery_id"),
  clienteNombre: text("cliente_nombre").notNull(),
  clienteWhatsapp: text("cliente_whatsapp").notNull(),
  clienteUbicacion: text("cliente_ubicacion").notNull(),
  clienteLatitud: numeric("cliente_latitud"),
  clienteLongitud: numeric("cliente_longitud"),
  productos: text("productos").notNull(),
  // Sustituciones: array of {original, nuevo, monto, estado} for product substitutions
  // estado: "pendiente" | "aceptada" | "rechazada"
  sustituciones: text("sustituciones", { mode: "json" }).$type<Array<{ original: string; nuevo: string; monto?: number; estado: "pendiente" | "aceptada" | "rechazada" }>>().default([]),
  total: numeric("total").notNull(),
  totalConfirmado: numeric("total_confirmado"),
  // Delivery is the legacy-compatible default. The applied charge is captured
  // on every order so future configuration changes cannot alter its history.
  // Legacy orders lack this snapshot, so the flag distinguishes an unknown
  // historical zero from a deliberately free delivery.
  tipoEntrega: text("tipo_entrega").notNull().default("delivery"), // delivery | pickup
  costoDeliveryAplicado: numeric("costo_delivery_aplicado").notNull().default("0"),
  costoDeliveryAplicadoFijado: integer("costo_delivery_aplicado_fijado", { mode: "boolean" }).notNull().default(false),
  montoPago: numeric("monto_pago").notNull(),
  necesitaDevuelta: integer("necesita_devuelta", { mode: "boolean" }).notNull().default(false),
  vueltoEntregado: numeric("vuelto_entregado"),
  vueltoEntregadoAlDelivery: integer("vuelto_entregado_al_delivery", { mode: "boolean" }).notNull().default(false),
  vueltoEntregadoAt: integer("vuelto_entregado_at", { mode: "timestamp_ms" }),
  vueltoEntregadoPor: text("vuelto_entregado_por"),
  motivoRetorno: text("motivo_retorno"),
  /** DELYWA: el negocio confirmó que el repartidor trajo de vuelta los productos de un retorno. */
  retornoRecibidoAt: integer("retorno_recibido_at", { mode: "timestamp_ms" }),
  retornoRecibidoPor: text("retorno_recibido_por"),
  /** DELYWA: un retorno que se volvió a enviar apunta al pedido nuevo, y el nuevo al original. */
  reenviadoComoPedidoId: integer("reenviado_como_pedido_id"),
  reenvioDePedidoId: integer("reenvio_de_pedido_id"),
  // Estados: pendiente_confirmacion, esperando_confirmacion_sustituciones, esperando_pago, pendiente, en_camino, entregado, cancelado, retorno, fusionado
  estado: text("estado").notNull().default("pendiente_confirmacion"),
  // When this order is absorbed into another pending order, this points to the
  // single order that will be delivered and charged.
  fusionadoEnPedidoId: integer("fusionado_en_pedido_id"),
  metodoPago: text("metodo_pago").default("efectivo"),
  comprobanteUrl: text("comprobante_url"),
  comprobanteConfirmado: integer("comprobante_confirmado", { mode: "boolean" }).default(false),
  notas: text("notas"),
  ultimoRecordatorioCobro: integer("ultimo_recordatorio_cobro", { mode: "timestamp_ms" }),
  cuadreId: integer("cuadre_id").references(() => cuadres.id, { onDelete: "set null" }),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaEntrega: integer("fecha_entrega", { mode: "timestamp_ms" }),
  cocinaIniciadaAt: integer("cocina_iniciada_at", { mode: "timestamp_ms" }),
  cocinaIniciadaPor: text("cocina_iniciada_por"),
  cocinaListaAt: integer("cocina_lista_at", { mode: "timestamp_ms" }),
  cocinaListaPor: text("cocina_lista_por"),
}, (t) => [
  index("pedidos_colmado_estado_fecha_idx").on(t.colmadoId, t.estado, t.fechaCreacion),
  index("pedidos_colmado_fecha_idx").on(t.colmadoId, t.fechaCreacion),
  index("pedidos_colmado_cliente_idx").on(t.colmadoId, t.clienteWhatsapp),
  index("pedidos_delivery_estado_idx").on(t.deliveryId, t.estado),
  index("pedidos_cuadre_idx").on(t.cuadreId),
]);

export const rutas = sqliteTable("rutas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryId: integer("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  inicioLatitud: numeric("inicio_latitud"),
  inicioLongitud: numeric("inicio_longitud"),
  distanciaTotal: numeric("distancia_total"),
  tiempoEstimadoMinutos: integer("tiempo_estimado_minutos"),
  fuenteDistancias: text("fuente_distancias").notNull().default("gps"),
  trafico: integer("trafico", { mode: "boolean" }).notNull().default(false),
  estado: text("estado").notNull().default("pendiente"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaInicio: integer("fecha_inicio", { mode: "timestamp_ms" }),
  fechaCompletada: integer("fecha_completada", { mode: "timestamp_ms" }),
}, (t) => [
  index("rutas_delivery_idx").on(t.deliveryId),
]);

export const paradasRuta = sqliteTable("paradas_ruta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rutaId: integer("ruta_id").notNull().references(() => rutas.id, { onDelete: "cascade" }),
  pedidoId: integer("pedido_id").notNull().references(() => pedidos.id, { onDelete: "cascade" }),
  orden: integer("orden").notNull(),
  distanciaDesdeAnteriorKm: numeric("distancia_desde_anterior_km"),
  tiempoDesdeAnteriorMinutos: integer("tiempo_desde_anterior_minutos"),
  horaEstimadaLlegada: text("hora_estimada_llegada"),
  estado: text("estado").notNull().default("pendiente"),
  motivoNoEntregado: text("motivo_no_entregado"),
  fechaCompletado: integer("fecha_completado", { mode: "timestamp_ms" }),
}, (t) => [
  index("paradas_ruta_ruta_idx").on(t.rutaId),
  index("paradas_ruta_pedido_idx").on(t.pedidoId),
]);

// ============ CUADRES DE DELIVERY ============

export const cuadres = sqliteTable("cuadres", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryId: integer("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  fechaCuadre: text("fecha_cuadre").notNull(),
  pedidosIds: text("pedidos_ids", { mode: "json" }).$type<number[]>().notNull().default([]),
  totalEfectivoCobrado: numeric("total_efectivo_cobrado").notNull().default("0"),
  totalDevueltaEntregada: numeric("total_devuelta_entregada").notNull().default("0"),
  totalVueltoRetornado: numeric("total_vuelto_retornado").notNull().default("0"),
  totalEfectivoRecibidoNegocio: numeric("total_efectivo_recibido_negocio").notNull().default("0"),
  netoAEntregar: numeric("neto_a_entregar").notNull().default("0"),
  montoRecibido: numeric("monto_recibido"),
  diferencia: numeric("diferencia"),
  estado: text("estado").notNull().default("pendiente"),
  notasRepartidor: text("notas_repartidor"),
  notasNegocio: text("notas_negocio"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaConfirmacion: integer("fecha_confirmacion", { mode: "timestamp_ms" }),
}, (t) => [
  index("cuadres_colmado_fecha_idx").on(t.colmadoId, t.fechaCuadre),
  index("cuadres_delivery_idx").on(t.deliveryId),
]);

export const insertCuadreSchema = createInsertSchema(cuadres).omit({
  id: true,
  fechaCreacion: true,
  fechaConfirmacion: true,
  totalEfectivoCobrado: true,
  totalDevueltaEntregada: true,
  totalVueltoRetornado: true,
  totalEfectivoRecibidoNegocio: true,
  netoAEntregar: true,
  montoRecibido: true,
  diferencia: true,
  estado: true,
});

export type Cuadre = typeof cuadres.$inferSelect;
export type InsertCuadre = z.infer<typeof insertCuadreSchema>;

// ============ SALDOS DE DELIVERY ============

export const saldosDelivery = sqliteTable("saldos_delivery", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryId: integer("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  saldoPendiente: numeric("saldo_pendiente").notNull().default("0"),
  estado: text("estado").notNull().default("pendiente"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaSaldado: integer("fecha_saldado", { mode: "timestamp_ms" }),
}, (t) => [
  index("saldos_delivery_delivery_idx").on(t.deliveryId),
  // Un solo saldo abierto por repartidor y negocio: permite sumar diferencias con un upsert atómico.
  uniqueIndex("saldos_delivery_abierto_uq").on(t.deliveryId, t.colmadoId).where(sql`estado = 'pendiente'`),
]);

export const insertSaldoDeliverySchema = createInsertSchema(saldosDelivery).omit({
  id: true,
  fechaCreacion: true,
  fechaSaldado: true,
  estado: true,
});

export type SaldoDelivery = typeof saldosDelivery.$inferSelect;
export type InsertSaldoDelivery = z.infer<typeof insertSaldoDeliverySchema>;

// ============ PAGOS A DELIVERY (nómina por período) ============

export const pagosDelivery = sqliteTable("pagos_delivery", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deliveryId: integer("delivery_id").notNull().references(() => deliveries.id, { onDelete: "cascade" }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  periodoInicio: integer("periodo_inicio", { mode: "timestamp_ms" }).notNull(),
  periodoFin: integer("periodo_fin", { mode: "timestamp_ms" }).notNull(),
  totalPedidos: integer("total_pedidos").notNull().default(0),
  totalVentas: numeric("total_ventas").notNull().default("0"),
  modeloPago: text("modelo_pago").notNull(),
  salarioCalculado: numeric("salario_calculado").notNull().default("0"),
  comisionCalculada: numeric("comision_calculada").notNull().default("0"),
  montoTotal: numeric("monto_total").notNull(),
  estado: text("estado").notNull().default("pendiente"), // pendiente | pagado
  fechaPago: integer("fecha_pago", { mode: "timestamp_ms" }),
  pagadoPor: text("pagado_por"),
  notas: text("notas"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("pagos_delivery_colmado_delivery_idx").on(t.colmadoId, t.deliveryId),
]);

export const insertPagoDeliverySchema = createInsertSchema(pagosDelivery).omit({
  id: true,
  fechaCreacion: true,
  fechaPago: true,
  estado: true,
});

export type PagoDelivery = typeof pagosDelivery.$inferSelect;
export type InsertPagoDelivery = z.infer<typeof insertPagoDeliverySchema>;

export const ventas = sqliteTable("ventas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  fecha: integer("fecha", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  totalVentas: numeric("total_ventas").notNull().default("0"),
  pedidosEntregados: integer("pedidos_entregados").notNull().default(0),
  pedidosCancelados: integer("pedidos_cancelados").notNull().default(0),
  cuadrado: integer("cuadrado", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  index("ventas_colmado_fecha_idx").on(t.colmadoId, t.fecha),
]);

export const insertColmadoSchema = createInsertSchema(colmados).omit({
  id: true,
  fechaSuscripcion: true,
});

export const insertDeliverySchema = createInsertSchema(deliveries).omit({
  id: true,
  fechaRegistro: true,
});

export const insertPedidoSchema = createInsertSchema(pedidos).omit({
  id: true,
  fechaCreacion: true,
  fechaEntrega: true,
});

export const insertRutaSchema = createInsertSchema(rutas).omit({
  id: true,
  fechaCreacion: true,
  fechaInicio: true,
  fechaCompletada: true,
});

export const insertParadaRutaSchema = createInsertSchema(paradasRuta).omit({
  id: true,
  fechaCompletado: true,
});

export const insertVentaSchema = createInsertSchema(ventas).omit({
  id: true,
  fecha: true,
});

// Permanent client data - survives conversation deletion
export const clientes = sqliteTable("clientes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  whatsappNumero: text("whatsapp_numero").notNull(),
  nombre: text("nombre"),
  direccionTexto: text("direccion_texto"),
  latitud: text("latitud"),
  longitud: text("longitud"),
  edadVerificada: integer("edad_verificada", { mode: "boolean" }).notNull().default(false),
  fechaRegistro: integer("fecha_registro", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  ultimaActualizacion: integer("ultima_actualizacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  unique("clientes_colmado_whatsapp_uniq").on(t.colmadoId, t.whatsappNumero),
]);

/** DELYWA: direcciones guardadas del cliente con nombre ("Casa", "Trabajo"). */
export const clienteDirecciones = sqliteTable("cliente_direcciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clienteId: integer("cliente_id").notNull().references(() => clientes.id, { onDelete: "cascade" }),
  etiqueta: text("etiqueta").notNull(),
  direccionTexto: text("direccion_texto"),
  latitud: text("latitud"),
  longitud: text("longitud"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  ultimaActualizacion: integer("ultima_actualizacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  unique("cliente_direcciones_cliente_etiqueta_uniq").on(t.clienteId, t.etiqueta),
]);

export const whatsappConversaciones = sqliteTable("whatsapp_conversaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  clienteWhatsapp: text("cliente_whatsapp").notNull(),
  clienteNombre: text("cliente_nombre"),
  direccionTexto: text("direccion_texto"),
  latitud: text("latitud"),
  longitud: text("longitud"),
  noLeidosColmado: integer("no_leidos_colmado").notNull().default(0),
  ultimoPedidoEstado: text("ultimo_pedido_estado"),
  ultimoMensaje: integer("ultimo_mensaje", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  ultimoMensajeCliente: integer("ultimo_mensaje_cliente", { mode: "timestamp_ms" }),
  sesionActiva: integer("sesion_activa", { mode: "boolean" }).notNull().default(true),
  esDelivery: integer("es_delivery", { mode: "boolean" }).notNull().default(false),
}, (t) => [
  index("wa_conv_colmado_cliente_idx").on(t.colmadoId, t.clienteWhatsapp),
  index("wa_conv_colmado_ultimo_idx").on(t.colmadoId, t.ultimoMensaje),
]);

export const whatsappMensajes = sqliteTable("whatsapp_mensajes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversacionId: integer("conversacion_id").notNull().references(() => whatsappConversaciones.id, { onDelete: "cascade" }),
  rol: text("rol").notNull(),
  contenido: text("contenido").notNull(),
  fechaEnvio: integer("fecha_envio", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("wa_msg_conversacion_fecha_idx").on(t.conversacionId, t.fechaEnvio),
]);

export const metaWebhookEventos = sqliteTable("meta_webhook_eventos", {
  eventId: text("event_id").primaryKey(),
  fechaRecepcion: integer("fecha_recepcion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertWhatsappConversacionSchema = createInsertSchema(whatsappConversaciones).omit({
  id: true,
  noLeidosColmado: true,
  ultimoPedidoEstado: true,
  ultimoMensaje: true,
});

export const insertWhatsappMensajeSchema = createInsertSchema(whatsappMensajes).omit({
  id: true,
  fechaEnvio: true,
});

export const diccionarioJerga = sqliteTable("diccionario_jerga", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  jerga: text("jerga").notNull(),
  productoIdentificado: text("producto_identificado").notNull(),
  precioSugerido: numeric("precio_sugerido"),
  vecesUsado: integer("veces_usado").notNull().default(1),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  ultimoUso: integer("ultimo_uso", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("diccionario_jerga_colmado_idx").on(t.colmadoId),
]);

export const insertDiccionarioJergaSchema = createInsertSchema(diccionarioJerga).omit({
  id: true,
  fechaCreacion: true,
  ultimoUso: true,
});

export type DiccionarioJerga = typeof diccionarioJerga.$inferSelect;
export type InsertDiccionarioJerga = z.infer<typeof insertDiccionarioJergaSchema>;

// Plantillas de jerga por tipo de negocio - jerga base que se copia al crear un nuevo negocio
export const plantillasJerga = sqliteTable("plantillas_jerga", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipoNegocio: text("tipo_negocio").notNull(),
  jerga: text("jerga").notNull(),
  productoIdentificado: text("producto_identificado").notNull(),
  precioSugerido: numeric("precio_sugerido"),
  descripcion: text("descripcion"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  // Multi-country: null = global, non-null = country-specific (generated by AI)
  paisId: integer("pais_id").references(() => paises.id, { onDelete: "cascade" }),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  // DELYWA: diccionario compartido del país. "manual" (plataforma o IA), "aprendida" (de los colmados).
  origen: text("origen").notNull().default("manual"),
  /** Cuántos colmados distintos la usaron (solo las aprendidas). */
  colmadosAprendida: integer("colmados_aprendida").notNull().default(0),
  /** Veces que el bot la reconoció en un mensaje, en cualquier colmado. */
  vecesUsado: integer("veces_usado").notNull().default(0),
}, (t) => [
  index("plantillas_jerga_tipo_pais_idx").on(t.tipoNegocio, t.paisId),
]);

/**
 * DELYWA: lo que aprende el bot en cada colmado, para alimentar el diccionario compartido del país.
 * Una fila por (país, tipo, palabra, producto, colmado). Cuando suficientes colmados distintos
 * usan la misma palabra para el mismo producto, pasa a plantillas_jerga y la usan todos.
 */
export const jergaAprendizaje = sqliteTable("jerga_aprendizaje", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paisId: integer("pais_id").notNull().references(() => paises.id, { onDelete: "cascade" }),
  tipoNegocio: text("tipo_negocio").notNull(),
  jerga: text("jerga").notNull(),
  productoIdentificado: text("producto_identificado").notNull(),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  vecesUsado: integer("veces_usado").notNull().default(1),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  ultimoUso: integer("ultimo_uso", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  uniqueIndex("jerga_aprendizaje_uq").on(t.paisId, t.tipoNegocio, t.jerga, t.productoIdentificado, t.colmadoId),
  index("jerga_aprendizaje_grupo_idx").on(t.paisId, t.tipoNegocio, t.jerga),
]);

export const insertPlantillaJergaSchema = createInsertSchema(plantillasJerga).omit({
  id: true,
  fechaCreacion: true,
});

export type PlantillaJerga = typeof plantillasJerga.$inferSelect;
export type InsertPlantillaJerga = z.infer<typeof insertPlantillaJergaSchema>;

// System messages table - global messages used by the chatbot for all colmados
export const mensajesSistema = sqliteTable("mensajes_sistema", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clave: text("clave").notNull().unique(), // Unique key to identify the message (e.g., "saludo_nuevo_cliente")
  categoria: text("categoria").notNull(), // Category (saludo, pregunta, confirmacion, error)
  titulo: text("titulo").notNull(), // Human-readable title for admin panel
  contenido: text("contenido").notNull(), // The actual message template
  descripcion: text("descripcion"), // Description of when this message is used
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaModificacion: integer("fecha_modificacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertMensajeSistemaSchema = createInsertSchema(mensajesSistema).omit({
  id: true,
  fechaCreacion: true,
  fechaModificacion: true,
});

export type MensajeSistema = typeof mensajesSistema.$inferSelect;
export type InsertMensajeSistema = z.infer<typeof insertMensajeSistemaSchema>;

// Payment methods configuration per colmado
export const metodosPago = sqliteTable("metodos_pago", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }).unique(),
  efectivo: integer("efectivo", { mode: "boolean" }).notNull().default(true),
  transferencia: integer("transferencia", { mode: "boolean" }).notNull().default(false),
  tarjeta: integer("tarjeta", { mode: "boolean" }).notNull().default(false),
  bancos: text("bancos", { mode: "json" }).$type<Array<{ nombre: string; numeroCuenta: string; tipoCuenta?: string; titular?: string }>>().default([]),
  fechaModificacion: integer("fecha_modificacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertMetodosPagoSchema = createInsertSchema(metodosPago).omit({
  id: true,
  fechaModificacion: true,
});

export type MetodosPago = typeof metodosPago.$inferSelect;
export type InsertMetodosPago = z.infer<typeof insertMetodosPagoSchema>;

// Menu products table for businesses with menus
export const menuProductos = sqliteTable("menu_productos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  precio: numeric("precio").notNull(),
  categoria: text("categoria").notNull().default("General"),
  imagen: text("imagen"),
  disponible: integer("disponible", { mode: "boolean" }).notNull().default(true),
  inventario: integer("inventario"),
  orden: integer("orden").default(0),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("menu_productos_colmado_idx").on(t.colmadoId),
]);

// Per-branch overrides for shared catalog products. A missing override means
// the branch inherits the principal product's price, availability and stock.
export const menuProductoSucursales = sqliteTable("menu_producto_sucursales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  menuProductoId: integer("menu_producto_id").notNull().references(() => menuProductos.id, { onDelete: "cascade" }),
  sucursalId: integer("sucursal_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  precio: numeric("precio"),
  disponible: integer("disponible", { mode: "boolean" }),
  inventario: integer("inventario"),
  fechaModificacion: integer("fecha_modificacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  unique("menu_producto_sucursal_unico").on(t.menuProductoId, t.sucursalId),
  index("menu_producto_sucursales_sucursal_idx").on(t.sucursalId),
]);

export const insertMenuProductoSchema = createInsertSchema(menuProductos).omit({
  id: true,
  fechaCreacion: true,
});

export type MenuProducto = typeof menuProductos.$inferSelect;
export type InsertMenuProducto = z.infer<typeof insertMenuProductoSchema>;
export const insertMenuProductoSucursalSchema = createInsertSchema(menuProductoSucursales).omit({
  id: true,
  fechaModificacion: true,
});
export type MenuProductoSucursal = typeof menuProductoSucursales.$inferSelect;
export type InsertMenuProductoSucursal = z.infer<typeof insertMenuProductoSucursalSchema>;

// ============ PLANTILLAS DE MENÚ POR TIPO DE NEGOCIO ============

export const menuPlantillas = sqliteTable("menu_plantillas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipoNegocio: text("tipo_negocio").notNull(),
  categoria: text("categoria").notNull(),
  orden: integer("orden").default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

export const menuPlantillaItems = sqliteTable("menu_plantilla_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plantillaId: integer("plantilla_id").notNull().references(() => menuPlantillas.id, { onDelete: "cascade" }),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion"),
  precioSugerido: numeric("precio_sugerido").notNull(),
  orden: integer("orden").default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
}, (t) => [
  index("menu_plantilla_items_plantilla_idx").on(t.plantillaId),
]);

export const insertMenuPlantillaSchema = createInsertSchema(menuPlantillas).omit({
  id: true,
});

export const insertMenuPlantillaItemSchema = createInsertSchema(menuPlantillaItems).omit({
  id: true,
});

export type MenuPlantilla = typeof menuPlantillas.$inferSelect;
export type InsertMenuPlantilla = z.infer<typeof insertMenuPlantillaSchema>;
export type MenuPlantillaItem = typeof menuPlantillaItems.$inferSelect;
export type InsertMenuPlantillaItem = z.infer<typeof insertMenuPlantillaItemSchema>;

export type Colmado = typeof colmados.$inferSelect;
export type InsertColmado = z.infer<typeof insertColmadoSchema>;

export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;

export type Pedido = typeof pedidos.$inferSelect;
export type InsertPedido = z.infer<typeof insertPedidoSchema>;

export type Ruta = typeof rutas.$inferSelect;
export type InsertRuta = z.infer<typeof insertRutaSchema>;

export type ParadaRuta = typeof paradasRuta.$inferSelect;
export type InsertParadaRuta = z.infer<typeof insertParadaRutaSchema>;

export type Venta = typeof ventas.$inferSelect;
export type InsertVenta = z.infer<typeof insertVentaSchema>;

export type WhatsappConversacion = typeof whatsappConversaciones.$inferSelect;
export type InsertWhatsappConversacion = z.infer<typeof insertWhatsappConversacionSchema>;

export type WhatsappMensaje = typeof whatsappMensajes.$inferSelect;
export type InsertWhatsappMensaje = z.infer<typeof insertWhatsappMensajeSchema>;

export type Cliente = typeof clientes.$inferSelect;

// ============ CHAT WEB (Sin restricciones de Meta) ============

export const chatWebSesiones = sqliteTable("chat_web_sesiones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().unique(),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  clienteNombre: text("cliente_nombre"),
  clienteWhatsapp: text("cliente_whatsapp"),
  clienteDireccion: text("cliente_direccion"),
  clienteLatitud: text("cliente_latitud"),
  clienteLongitud: text("cliente_longitud"),
  estado: text("estado").notNull().default("activa"), // activa, pedido_creado, finalizada
  estadoConversacion: text("estado_conversacion").notNull().default("inicial"), // inicial, esperando_nombre, esperando_direccion, esperando_ubicacion, esperando_pago, esperando_monto
  productosCapturados: text("productos_capturados", { mode: "json" }).$type<Array<{ nombre: string; monto: number | null; cantidad: number | null }>>().default([]),
  pedidoId: integer("pedido_id").references(() => pedidos.id),
  conversacionId: integer("conversacion_id").references(() => whatsappConversaciones.id),
  metodoPagoSeleccionado: text("metodo_pago_seleccionado"),
  montoPagoCliente: text("monto_pago_cliente"),
  devueltaCalculada: text("devuelta_calculada"),
  totalEstimado: text("total_estimado"),
  /** DELYWA: identificador al azar del navegador del cliente; la conversación solo se reabre desde el mismo aparato. */
  aparato: text("aparato"),
  /** DELYWA: etiqueta de la dirección guardada elegida para este pedido ("Casa"). */
  destinoGuardado: text("destino_guardado"),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaUltimaActividad: integer("fecha_ultima_actividad", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("chat_web_sesiones_colmado_idx").on(t.colmadoId),
  index("chat_web_sesiones_pedido_idx").on(t.pedidoId),
]);

export const chatWebMensajes = sqliteTable("chat_web_mensajes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  rol: text("rol").notNull(), // user, assistant
  contenido: text("contenido").notNull(),
  /** DELYWA: botones de respuesta rápida que muestra el chat bajo este mensaje del bot. */
  opciones: text("opciones", { mode: "json" }).$type<Array<{ texto: string; accion?: "ubicacion" | "comprobante" }>>(),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("chat_web_mensajes_session_idx").on(t.sessionId),
]);

/** DELYWA: cuántos mensajes atendió el bot del chat cada día, cuántos necesitaron IA y cuántos no entendió. */
export const botRegistro = sqliteTable("bot_registro", {
  dia: text("dia").notNull(),
  colmadoId: integer("colmado_id").notNull(),
  mensajes: integer("mensajes").notNull().default(0),
  conIa: integer("con_ia").notNull().default(0),
  sinEntender: integer("sin_entender").notNull().default(0),
  notasDeVoz: integer("notas_de_voz").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.dia, t.colmadoId] })]);

/** DELYWA: frases que el bot no entendió (para mejorar la jerga y los productos). 60 días. */
export const botNoEntendidos = sqliteTable("bot_no_entendidos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull(),
  texto: text("texto").notNull(),
  resueltoConIa: integer("resuelto_con_ia", { mode: "boolean" }).notNull().default(false),
  fecha: integer("fecha", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [index("bot_no_entendidos_fecha_idx").on(t.fecha)]);

export const insertChatWebSesionSchema = createInsertSchema(chatWebSesiones).omit({
  id: true,
  fechaCreacion: true,
  fechaUltimaActividad: true,
});

export const insertChatWebMensajeSchema = createInsertSchema(chatWebMensajes).omit({
  id: true,
  fechaCreacion: true,
});

export type ChatWebSesion = typeof chatWebSesiones.$inferSelect;
export type InsertChatWebSesion = z.infer<typeof insertChatWebSesionSchema>;
export type ChatWebMensaje = typeof chatWebMensajes.$inferSelect;
export type InsertChatWebMensaje = z.infer<typeof insertChatWebMensajeSchema>;

// ============ DATOS DE CONOCIMIENTO (por tipo de negocio) ============

export const conocimientoArchivos = sqliteTable("conocimiento_archivos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tipoNegocio: text("tipo_negocio").notNull(),
  nombre: text("nombre").notNull(),
  contenido: text("contenido").notNull(),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertConocimientoArchivoSchema = createInsertSchema(conocimientoArchivos).omit({
  id: true,
  fechaCreacion: true,
});

export type ConocimientoArchivo = typeof conocimientoArchivos.$inferSelect;
export type InsertConocimientoArchivo = z.infer<typeof insertConocimientoArchivoSchema>;

// ============ INTENCIONES DEL BOT ============

export const botIntenciones = sqliteTable("bot_intenciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  codigo: text("codigo").notNull().unique(), // ver_menu, hacer_pedido, precios, ubicacion, horario, fallback
  nombre: text("nombre").notNull(), // Nombre amigable para mostrar en UI
  icono: text("icono"), // Emoji o icono
  palabrasClave: text("palabras_clave", { mode: "json" }).$type<string[]>().default([]).notNull(), // Array de palabras/frases que activan esta intención
  respuesta: text("respuesta").notNull(), // Plantilla de respuesta con variables {MENU}, {HORARIO}, etc.
  accion: text("accion"), // ver_menu, enviar_menu, enviar_horario, enviar_ubicacion, fallback
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaModificacion: integer("fecha_modificacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertBotIntencionSchema = createInsertSchema(botIntenciones).omit({
  id: true,
  fechaCreacion: true,
  fechaModificacion: true,
});

export type BotIntencion = typeof botIntenciones.$inferSelect;
export type InsertBotIntencion = z.infer<typeof insertBotIntencionSchema>;

// ============ SOLICITUDES DE ELIMINACIÓN DE DATOS (Meta Compliance) ============

export const solicitudesEliminacion = sqliteTable("solicitudes_eliminacion", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  confirmationCode: text("confirmation_code").notNull().unique(),
  userId: text("user_id").notNull(),
  estado: text("estado").notNull().default("pending"),
  datosEliminados: text("datos_eliminados", { mode: "json" }),
  fechaSolicitud: integer("fecha_solicitud", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
  fechaCompletado: integer("fecha_completado", { mode: "timestamp_ms" }),
});

export const insertSolicitudEliminacionSchema = createInsertSchema(solicitudesEliminacion).omit({
  id: true,
  fechaSolicitud: true,
  fechaCompletado: true,
});

export type SolicitudEliminacion = typeof solicitudesEliminacion.$inferSelect;
export type InsertSolicitudEliminacion = z.infer<typeof insertSolicitudEliminacionSchema>;

// ============ PRODUCTOS RESTRINGIDOS (Verificación de Edad) ============

export const productosRestringidos = sqliteTable("productos_restringidos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  palabraClave: text("palabra_clave").notNull(),
  categoria: text("categoria").notNull().default("alcohol"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
});

export const insertProductoRestringidoSchema = createInsertSchema(productosRestringidos).omit({
  id: true,
  fechaCreacion: true,
});

export type ProductoRestringido = typeof productosRestringidos.$inferSelect;
export type InsertProductoRestringido = z.infer<typeof insertProductoRestringidoSchema>;

// ============ ZIP ALERT EVENTS ============
// Logged whenever the server's ZIP guard fires (zipOk: false) and overrides the AI response.
// Used to detect AI prompt regressions that stop asking for postal codes.

export const zipAlertaEventos = sqliteTable("zip_alerta_eventos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  colmadoId: integer("colmado_id").notNull().references(() => colmados.id, { onDelete: "cascade" }),
  canal: text("canal").notNull(), // "meta" | "web" | "evolution"
  clienteIdentificador: text("cliente_identificador"), // phone (meta/evolution) or sessionId (web)
  direccionRecibida: text("direccion_recibida"), // the address text the AI accepted
  fechaCreacion: integer("fecha_creacion", { mode: "timestamp_ms" }).default(sql`(cast(unixepoch('subsec') * 1000 as integer))`).notNull(),
}, (t) => [
  index("zip_alerta_colmado_fecha_idx").on(t.colmadoId, t.fechaCreacion),
]);

export type ZipAlertaEvento = typeof zipAlertaEventos.$inferSelect;

export * from "./models/chat";
export * from "./models/auth";
