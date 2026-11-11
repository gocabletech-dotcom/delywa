CREATE TABLE `asistencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`empleado_id` integer NOT NULL,
	`sucursal_id` integer NOT NULL,
	`entrada` integer NOT NULL,
	`salida` integer,
	`horas_trabajadas` numeric,
	`notas` text,
	`corregida_por` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sucursal_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asistencias_empleado_fecha_idx` ON `asistencias` (`empleado_id`,`entrada`);--> statement-breakpoint
CREATE TABLE `bot_intenciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`nombre` text NOT NULL,
	`icono` text,
	`palabras_clave` text DEFAULT '[]' NOT NULL,
	`respuesta` text NOT NULL,
	`accion` text,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_modificacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_intenciones_codigo_unique` ON `bot_intenciones` (`codigo`);--> statement-breakpoint
CREATE TABLE `chat_web_mensajes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`rol` text NOT NULL,
	`contenido` text NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_web_mensajes_session_idx` ON `chat_web_mensajes` (`session_id`);--> statement-breakpoint
CREATE TABLE `chat_web_sesiones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`colmado_id` integer NOT NULL,
	`cliente_nombre` text,
	`cliente_whatsapp` text,
	`cliente_direccion` text,
	`cliente_latitud` text,
	`cliente_longitud` text,
	`estado` text DEFAULT 'activa' NOT NULL,
	`estado_conversacion` text DEFAULT 'inicial' NOT NULL,
	`productos_capturados` text DEFAULT '[]',
	`pedido_id` integer,
	`conversacion_id` integer,
	`metodo_pago_seleccionado` text,
	`monto_pago_cliente` text,
	`devuelta_calculada` text,
	`total_estimado` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_ultima_actividad` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversacion_id`) REFERENCES `whatsapp_conversaciones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_web_sesiones_session_id_unique` ON `chat_web_sesiones` (`session_id`);--> statement-breakpoint
CREATE INDEX `chat_web_sesiones_colmado_idx` ON `chat_web_sesiones` (`colmado_id`);--> statement-breakpoint
CREATE INDEX `chat_web_sesiones_pedido_idx` ON `chat_web_sesiones` (`pedido_id`);--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`whatsapp_numero` text NOT NULL,
	`nombre` text,
	`direccion_texto` text,
	`latitud` text,
	`longitud` text,
	`edad_verificada` integer DEFAULT false NOT NULL,
	`fecha_registro` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ultima_actualizacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_colmado_whatsapp_uniq` ON `clientes` (`colmado_id`,`whatsapp_numero`);--> statement-breakpoint
CREATE TABLE `colmados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`slug` text,
	`whatsapp_numero` text NOT NULL,
	`direccion` text NOT NULL,
	`ciudad` text,
	`provincia` text,
	`plan_id` integer NOT NULL,
	`estado` text DEFAULT 'activo' NOT NULL,
	`owner_user_id` text,
	`whatsapp_phone_number_id` text,
	`whatsapp_access_token` text,
	`fecha_suscripcion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`tipo_negocio` text DEFAULT 'colmado' NOT NULL,
	`impuesto` numeric DEFAULT '0',
	`fecha_inicio_plan` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)),
	`fecha_vencimiento` integer,
	`estado_suscripcion` text DEFAULT 'activa' NOT NULL,
	`dia_corte` integer DEFAULT 28 NOT NULL,
	`dias_gracia` integer DEFAULT 6 NOT NULL,
	`logo` text,
	`color_primario` text DEFAULT '#25D366' NOT NULL,
	`descripcion` text,
	`encargado_nombre` text,
	`telefono_alternativo` text,
	`latitud` text,
	`longitud` text,
	`costo_delivery` numeric DEFAULT '50',
	`radio_entrega` numeric DEFAULT '5',
	`tiempo_estimado` text DEFAULT '20-30 min',
	`pedido_minimo` numeric DEFAULT '0',
	`hora_apertura` text DEFAULT '08:00',
	`hora_cierre` text DEFAULT '22:00',
	`dias_servicio` text DEFAULT '["lunes","martes","miercoles","jueves","viernes","sabado","domingo"]',
	`esta_abierto_manual` integer DEFAULT true,
	`mensaje_cerrado` text DEFAULT 'Estamos cerrados. Abrimos pronto.',
	`mensaje_bienvenida` text,
	`mensaje_confirmacion` text,
	`titulo_compartir_pedido` text,
	`descripcion_compartir_pedido` text,
	`evolution_api_url` text,
	`evolution_api_key` text,
	`evolution_instance_name` text,
	`whatsapp_provider` text DEFAULT 'meta',
	`pais_id` integer,
	`codigo_postal` text,
	`tecnologias_habilitadas` text DEFAULT '{}',
	`bot_prompt_custom` text,
	`negocio_principal_id` integer,
	FOREIGN KEY (`pais_id`) REFERENCES `paises`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `colmados_slug_unique` ON `colmados` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `colmados_whatsapp_numero_unique` ON `colmados` (`whatsapp_numero`);--> statement-breakpoint
CREATE INDEX `colmados_negocio_principal_idx` ON `colmados` (`negocio_principal_id`);--> statement-breakpoint
CREATE INDEX `colmados_owner_idx` ON `colmados` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `colmados_wa_phone_id_idx` ON `colmados` (`whatsapp_phone_number_id`);--> statement-breakpoint
CREATE INDEX `colmados_evolution_instance_idx` ON `colmados` (`evolution_instance_name`);--> statement-breakpoint
CREATE TABLE `configuracion_sistema` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clave` text NOT NULL,
	`valor` text,
	`descripcion` text,
	`tipo` text DEFAULT 'texto' NOT NULL,
	`fecha_modificacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `configuracion_sistema_clave_unique` ON `configuracion_sistema` (`clave`);--> statement-breakpoint
CREATE TABLE `conocimiento_archivos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo_negocio` text NOT NULL,
	`nombre` text NOT NULL,
	`contenido` text NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cuadres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`colmado_id` integer NOT NULL,
	`fecha_cuadre` text NOT NULL,
	`pedidos_ids` text DEFAULT '[]' NOT NULL,
	`total_efectivo_cobrado` numeric DEFAULT '0' NOT NULL,
	`total_devuelta_entregada` numeric DEFAULT '0' NOT NULL,
	`total_vuelto_retornado` numeric DEFAULT '0' NOT NULL,
	`total_efectivo_recibido_negocio` numeric DEFAULT '0' NOT NULL,
	`neto_a_entregar` numeric DEFAULT '0' NOT NULL,
	`monto_recibido` numeric,
	`diferencia` numeric,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`notas_repartidor` text,
	`notas_negocio` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_confirmacion` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cuadres_colmado_fecha_idx` ON `cuadres` (`colmado_id`,`fecha_cuadre`);--> statement-breakpoint
CREATE INDEX `cuadres_delivery_idx` ON `cuadres` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`nombre` text NOT NULL,
	`whatsapp_numero` text NOT NULL,
	`estado` text DEFAULT 'inactivo' NOT NULL,
	`ultima_activacion` integer,
	`ultima_activacion_origen` text,
	`codigo_acceso` text,
	`fecha_registro` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`modelo_pago` text DEFAULT 'comision' NOT NULL,
	`salario_monto` numeric DEFAULT '0' NOT NULL,
	`comision_fija` numeric DEFAULT '0' NOT NULL,
	`comision_porcentaje` numeric DEFAULT '0' NOT NULL,
	`periodo_pago` text DEFAULT 'semanal' NOT NULL,
	`ultima_latitud` numeric,
	`ultima_longitud` numeric,
	`ultima_ubicacion_at` integer,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deliveries_colmado_idx` ON `deliveries` (`colmado_id`);--> statement-breakpoint
CREATE INDEX `deliveries_whatsapp_idx` ON `deliveries` (`whatsapp_numero`);--> statement-breakpoint
CREATE TABLE `diccionario_jerga` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`jerga` text NOT NULL,
	`producto_identificado` text NOT NULL,
	`precio_sugerido` numeric,
	`veces_usado` integer DEFAULT 1 NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ultimo_uso` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `diccionario_jerga_colmado_idx` ON `diccionario_jerga` (`colmado_id`);--> statement-breakpoint
CREATE TABLE `empleado_sucursales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`empleado_id` integer NOT NULL,
	`sucursal_id` integer NOT NULL,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sucursal_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `empleado_sucursal_unico` ON `empleado_sucursales` (`empleado_id`,`sucursal_id`);--> statement-breakpoint
CREATE TABLE `empleados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negocio_id` integer NOT NULL,
	`nombres` text NOT NULL,
	`apellidos` text,
	`cedula` text,
	`email` text,
	`telefono` text,
	`direccion` text,
	`puesto` text,
	`fecha_ingreso` text,
	`estado` text DEFAULT 'activo' NOT NULL,
	`tipo_pago` text DEFAULT 'por_hora' NOT NULL,
	`tarifa_hora` numeric DEFAULT '0',
	`salario_fijo` numeric DEFAULT '0',
	`periodo_pago` text DEFAULT 'quincenal' NOT NULL,
	`moneda` text DEFAULT 'USD' NOT NULL,
	`notas` text,
	`codigo_acceso` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_actualizacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`negocio_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `empleados_codigo_acceso_unique` ON `empleados` (`codigo_acceso`);--> statement-breakpoint
CREATE INDEX `empleados_negocio_idx` ON `empleados` (`negocio_id`);--> statement-breakpoint
CREATE TABLE `mensajes_sistema` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clave` text NOT NULL,
	`categoria` text NOT NULL,
	`titulo` text NOT NULL,
	`contenido` text NOT NULL,
	`descripcion` text,
	`activo` integer DEFAULT true NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_modificacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mensajes_sistema_clave_unique` ON `mensajes_sistema` (`clave`);--> statement-breakpoint
CREATE TABLE `menu_plantilla_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plantilla_id` integer NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`precio_sugerido` numeric NOT NULL,
	`orden` integer DEFAULT 0,
	`activo` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`plantilla_id`) REFERENCES `menu_plantillas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_plantilla_items_plantilla_idx` ON `menu_plantilla_items` (`plantilla_id`);--> statement-breakpoint
CREATE TABLE `menu_plantillas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo_negocio` text NOT NULL,
	`categoria` text NOT NULL,
	`orden` integer DEFAULT 0,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `menu_producto_sucursales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`menu_producto_id` integer NOT NULL,
	`sucursal_id` integer NOT NULL,
	`precio` numeric,
	`disponible` integer,
	`inventario` integer,
	`fecha_modificacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`menu_producto_id`) REFERENCES `menu_productos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sucursal_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_producto_sucursales_sucursal_idx` ON `menu_producto_sucursales` (`sucursal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `menu_producto_sucursal_unico` ON `menu_producto_sucursales` (`menu_producto_id`,`sucursal_id`);--> statement-breakpoint
CREATE TABLE `menu_productos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`precio` numeric NOT NULL,
	`categoria` text DEFAULT 'General' NOT NULL,
	`imagen` text,
	`disponible` integer DEFAULT true NOT NULL,
	`inventario` integer,
	`orden` integer DEFAULT 0,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `menu_productos_colmado_idx` ON `menu_productos` (`colmado_id`);--> statement-breakpoint
CREATE TABLE `meta_webhook_eventos` (
	`event_id` text PRIMARY KEY NOT NULL,
	`fecha_recepcion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metodos_pago` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`efectivo` integer DEFAULT true NOT NULL,
	`transferencia` integer DEFAULT false NOT NULL,
	`tarjeta` integer DEFAULT false NOT NULL,
	`bancos` text DEFAULT '[]',
	`fecha_modificacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metodos_pago_colmado_id_unique` ON `metodos_pago` (`colmado_id`);--> statement-breakpoint
CREATE TABLE `nomina_configuracion_auditorias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negocio_id` integer NOT NULL,
	`pais_id` integer,
	`actor_id` text NOT NULL,
	`reglas_anteriores` text,
	`reglas_nuevas` text NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`negocio_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pais_id`) REFERENCES `paises`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `nomina_configuracion_auditorias_negocio_fecha_idx` ON `nomina_configuracion_auditorias` (`negocio_id`,`fecha_creacion`);--> statement-breakpoint
CREATE TABLE `nomina_configuraciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negocio_id` integer NOT NULL,
	`reglas` text NOT NULL,
	`fecha_actualizacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`negocio_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nomina_configuraciones_negocio_id_unique` ON `nomina_configuraciones` (`negocio_id`);--> statement-breakpoint
CREATE TABLE `nomina_detalles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nomina_id` integer NOT NULL,
	`empleado_id` integer NOT NULL,
	`horas_trabajadas` numeric DEFAULT '0' NOT NULL,
	`tipo_pago` text NOT NULL,
	`tarifa_hora` numeric DEFAULT '0' NOT NULL,
	`salario_base` numeric DEFAULT '0' NOT NULL,
	`horas_ordinarias` numeric DEFAULT '0' NOT NULL,
	`horas_extra` numeric DEFAULT '0' NOT NULL,
	`horas_feriado` numeric DEFAULT '0' NOT NULL,
	`bruto` numeric DEFAULT '0' NOT NULL,
	`descuentos` numeric DEFAULT '0' NOT NULL,
	`ajustes` numeric DEFAULT '0' NOT NULL,
	`total` numeric DEFAULT '0' NOT NULL,
	`notas` text,
	FOREIGN KEY (`nomina_id`) REFERENCES `nominas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`empleado_id`) REFERENCES `empleados`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `nomina_detalles_nomina_idx` ON `nomina_detalles` (`nomina_id`);--> statement-breakpoint
CREATE TABLE `nominas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`negocio_id` integer NOT NULL,
	`periodo_inicio` text NOT NULL,
	`periodo_fin` text NOT NULL,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`total_horas` numeric DEFAULT '0' NOT NULL,
	`total_monto` numeric DEFAULT '0' NOT NULL,
	`total_bruto` numeric DEFAULT '0' NOT NULL,
	`total_descuentos` numeric DEFAULT '0' NOT NULL,
	`total_neto` numeric DEFAULT '0' NOT NULL,
	`reglas_aplicadas` text,
	`cerrado_por` text,
	`pagado_por` text,
	`fecha_cierre` integer,
	`fecha_pago` integer,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`negocio_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nominas_negocio_periodo_idx` ON `nominas` (`negocio_id`,`periodo_inicio`,`periodo_fin`);--> statement-breakpoint
CREATE TABLE `pagos_delivery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`colmado_id` integer NOT NULL,
	`periodo_inicio` integer NOT NULL,
	`periodo_fin` integer NOT NULL,
	`total_pedidos` integer DEFAULT 0 NOT NULL,
	`total_ventas` numeric DEFAULT '0' NOT NULL,
	`modelo_pago` text NOT NULL,
	`salario_calculado` numeric DEFAULT '0' NOT NULL,
	`comision_calculada` numeric DEFAULT '0' NOT NULL,
	`monto_total` numeric NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`fecha_pago` integer,
	`pagado_por` text,
	`notas` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pagos_delivery_colmado_delivery_idx` ON `pagos_delivery` (`colmado_id`,`delivery_id`);--> statement-breakpoint
CREATE TABLE `paises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`nombre` text NOT NULL,
	`bandera` text,
	`prefijo_celular` text NOT NULL,
	`moneda` text NOT NULL,
	`simbolo_moneda` text NOT NULL,
	`zona_horaria` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`etiqueta_estado` text,
	`etiqueta_codigo_postal` text,
	`requiere_codigo_postal` integer DEFAULT false NOT NULL,
	`ejemplo_direccion` text,
	`ejemplo_ciudad` text,
	`ejemplo_estado` text,
	`ejemplo_codigo_postal` text,
	`patron_codigo_postal` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `paises_codigo_unique` ON `paises` (`codigo`);--> statement-breakpoint
CREATE TABLE `paradas_ruta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ruta_id` integer NOT NULL,
	`pedido_id` integer NOT NULL,
	`orden` integer NOT NULL,
	`distancia_desde_anterior_km` numeric,
	`tiempo_desde_anterior_minutos` integer,
	`hora_estimada_llegada` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`motivo_no_entregado` text,
	`fecha_completado` integer,
	FOREIGN KEY (`ruta_id`) REFERENCES `rutas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `paradas_ruta_ruta_idx` ON `paradas_ruta` (`ruta_id`);--> statement-breakpoint
CREATE INDEX `paradas_ruta_pedido_idx` ON `paradas_ruta` (`pedido_id`);--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`delivery_id` integer,
	`cliente_nombre` text NOT NULL,
	`cliente_whatsapp` text NOT NULL,
	`cliente_ubicacion` text NOT NULL,
	`cliente_latitud` numeric,
	`cliente_longitud` numeric,
	`productos` text NOT NULL,
	`sustituciones` text DEFAULT '[]',
	`total` numeric NOT NULL,
	`total_confirmado` numeric,
	`tipo_entrega` text DEFAULT 'delivery' NOT NULL,
	`costo_delivery_aplicado` numeric DEFAULT '0' NOT NULL,
	`costo_delivery_aplicado_fijado` integer DEFAULT false NOT NULL,
	`monto_pago` numeric NOT NULL,
	`necesita_devuelta` integer DEFAULT false NOT NULL,
	`vuelto_entregado` numeric,
	`vuelto_entregado_al_delivery` integer DEFAULT false NOT NULL,
	`vuelto_entregado_at` integer,
	`vuelto_entregado_por` text,
	`motivo_retorno` text,
	`estado` text DEFAULT 'pendiente_confirmacion' NOT NULL,
	`fusionado_en_pedido_id` integer,
	`metodo_pago` text DEFAULT 'efectivo',
	`comprobante_url` text,
	`comprobante_confirmado` integer DEFAULT false,
	`notas` text,
	`ultimo_recordatorio_cobro` integer,
	`cuadre_id` integer,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_entrega` integer,
	`cocina_iniciada_at` integer,
	`cocina_iniciada_por` text,
	`cocina_lista_at` integer,
	`cocina_lista_por` text,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cuadre_id`) REFERENCES `cuadres`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pedidos_colmado_estado_fecha_idx` ON `pedidos` (`colmado_id`,`estado`,`fecha_creacion`);--> statement-breakpoint
CREATE INDEX `pedidos_colmado_fecha_idx` ON `pedidos` (`colmado_id`,`fecha_creacion`);--> statement-breakpoint
CREATE INDEX `pedidos_colmado_cliente_idx` ON `pedidos` (`colmado_id`,`cliente_whatsapp`);--> statement-breakpoint
CREATE INDEX `pedidos_delivery_estado_idx` ON `pedidos` (`delivery_id`,`estado`);--> statement-breakpoint
CREATE INDEX `pedidos_cuadre_idx` ON `pedidos` (`cuadre_id`);--> statement-breakpoint
CREATE TABLE `planes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`slug` text NOT NULL,
	`precio_mensual` numeric NOT NULL,
	`duracion_dias` integer DEFAULT 30 NOT NULL,
	`es_trial` integer DEFAULT false NOT NULL,
	`descripcion_corta` text,
	`caracteristicas` text DEFAULT '[]',
	`limite_deliveries` integer,
	`limite_pedidos_diarios` integer,
	`soporte_prioritario` integer DEFAULT false NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planes_slug_unique` ON `planes` (`slug`);--> statement-breakpoint
CREATE TABLE `plantillas_jerga` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo_negocio` text NOT NULL,
	`jerga` text NOT NULL,
	`producto_identificado` text NOT NULL,
	`precio_sugerido` numeric,
	`descripcion` text,
	`activo` integer DEFAULT true NOT NULL,
	`pais_id` integer,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`pais_id`) REFERENCES `paises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `productos_restringidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`palabra_clave` text NOT NULL,
	`categoria` text DEFAULT 'alcohol' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rutas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`inicio_latitud` numeric,
	`inicio_longitud` numeric,
	`distancia_total` numeric,
	`tiempo_estimado_minutos` integer,
	`fuente_distancias` text DEFAULT 'gps' NOT NULL,
	`trafico` integer DEFAULT false NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_inicio` integer,
	`fecha_completada` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rutas_delivery_idx` ON `rutas` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `saldos_delivery` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`colmado_id` integer NOT NULL,
	`saldo_pendiente` numeric DEFAULT '0' NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_saldado` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saldos_delivery_delivery_idx` ON `saldos_delivery` (`delivery_id`);--> statement-breakpoint
CREATE TABLE `solicitudes_eliminacion` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`confirmation_code` text NOT NULL,
	`user_id` text NOT NULL,
	`estado` text DEFAULT 'pending' NOT NULL,
	`datos_eliminados` text,
	`fecha_solicitud` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_completado` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `solicitudes_eliminacion_confirmation_code_unique` ON `solicitudes_eliminacion` (`confirmation_code`);--> statement-breakpoint
CREATE TABLE `suscripciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`plan_id` integer NOT NULL,
	`fecha_inicio` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fecha_fin` integer NOT NULL,
	`estado` text DEFAULT 'activa' NOT NULL,
	`renovacion_automatica` integer DEFAULT false NOT NULL,
	`ultima_facturacion` integer,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suscripciones_colmado_idx` ON `suscripciones` (`colmado_id`);--> statement-breakpoint
CREATE TABLE `tipos_negocio_catalogo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`icono` text,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tipos_negocio_catalogo_slug_unique` ON `tipos_negocio_catalogo` (`slug`);--> statement-breakpoint
CREATE TABLE `ventas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`total_ventas` numeric DEFAULT '0' NOT NULL,
	`pedidos_entregados` integer DEFAULT 0 NOT NULL,
	`pedidos_cancelados` integer DEFAULT 0 NOT NULL,
	`cuadrado` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ventas_colmado_fecha_idx` ON `ventas` (`colmado_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `whatsapp_conversaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`cliente_whatsapp` text NOT NULL,
	`cliente_nombre` text,
	`direccion_texto` text,
	`latitud` text,
	`longitud` text,
	`no_leidos_colmado` integer DEFAULT 0 NOT NULL,
	`ultimo_pedido_estado` text,
	`ultimo_mensaje` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ultimo_mensaje_cliente` integer,
	`sesion_activa` integer DEFAULT true NOT NULL,
	`es_delivery` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wa_conv_colmado_cliente_idx` ON `whatsapp_conversaciones` (`colmado_id`,`cliente_whatsapp`);--> statement-breakpoint
CREATE INDEX `wa_conv_colmado_ultimo_idx` ON `whatsapp_conversaciones` (`colmado_id`,`ultimo_mensaje`);--> statement-breakpoint
CREATE TABLE `whatsapp_mensajes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversacion_id` integer NOT NULL,
	`rol` text NOT NULL,
	`contenido` text NOT NULL,
	`fecha_envio` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conversacion_id`) REFERENCES `whatsapp_conversaciones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wa_msg_conversacion_fecha_idx` ON `whatsapp_mensajes` (`conversacion_id`,`fecha_envio`);--> statement-breakpoint
CREATE TABLE `zip_alerta_eventos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`canal` text NOT NULL,
	`cliente_identificador` text,
	`direccion_recibida` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `zip_alerta_colmado_fecha_idx` ON `zip_alerta_eventos` (`colmado_id`,`fecha_creacion`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `IDX_session_expire` ON `sessions` (`expire`);--> statement-breakpoint
CREATE TABLE `user_sucursales` (
	`user_id` text NOT NULL,
	`colmado_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `colmado_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_sucursales_colmado_idx` ON `user_sucursales` (`colmado_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`first_name` text,
	`last_name` text,
	`profile_image_url` text,
	`whatsapp_numero` text,
	`password` text,
	`role` text DEFAULT 'pending',
	`colmado_id` integer,
	`delivery_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)),
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);