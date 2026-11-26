-- v2.62 · Planes en dólares y por funciones: Gratis (14 días, todo incluido), Colmado (US$9.99) y Full (US$29.99).
-- No borra datos. Se cambian los 3 planes que ya existen (nadie paga todavía).
-- Los colmados que ya están en prueba conservan su mes: se les guarda la fecha en que vence (inicio + 30 días).
UPDATE `colmados` SET `fecha_vencimiento` = `fecha_inicio_plan` + 30 * 86400000
  WHERE `fecha_vencimiento` IS NULL AND `fecha_inicio_plan` IS NOT NULL
    AND `plan_id` IN (SELECT `id` FROM `planes` WHERE `es_trial` = 1);
--> statement-breakpoint
UPDATE `planes` SET `nombre` = 'Gratis', `precio_mensual` = '0', `precio_anual` = NULL, `moneda` = 'USD', `duracion_dias` = 14,
  `descripcion_corta` = '14 días gratis con todo incluido, sin tarjeta',
  `caracteristicas` = '["14 días gratis","Todas las funciones","Repartidores sin límite","Pedidos sin límite"]',
  `funciones` = '["ia","mostrador","fiado","compras","nomina_delivery","ofertas","empleados","facturacion_electronica"]',
  `limite_deliveries` = NULL, `limite_pedidos_diarios` = NULL, `soporte_prioritario` = 0, `visible` = 1, `orden` = 1
  WHERE `slug` = 'trial';
--> statement-breakpoint
UPDATE `planes` SET `nombre` = 'Colmado', `precio_mensual` = '9.99', `precio_anual` = '109.89', `moneda` = 'USD', `duracion_dias` = 30,
  `descripcion_corta` = 'Lo del día a día del colmado, con inteligencia artificial',
  `caracteristicas` = '["Hasta 2 repartidores","Hasta 100 pedidos al día","Notas de voz y bot que entiende mejor","Mostrador y fiado"]',
  `funciones` = '["ia","mostrador","fiado"]',
  `limite_deliveries` = 2, `limite_pedidos_diarios` = 100, `soporte_prioritario` = 0, `visible` = 1, `orden` = 2
  WHERE `slug` = 'basico';
--> statement-breakpoint
UPDATE `planes` SET `nombre` = 'Full', `precio_mensual` = '29.99', `precio_anual` = '329.89', `moneda` = 'USD', `duracion_dias` = 30,
  `descripcion_corta` = 'Todo Delywa: compras, nómina de repartidores, ofertas y empleados',
  `caracteristicas` = '["Repartidores sin límite","Pedidos sin límite","Compras con foto de factura","Soporte prioritario"]',
  `funciones` = '["ia","mostrador","fiado","compras","nomina_delivery","ofertas","empleados","facturacion_electronica"]',
  `limite_deliveries` = NULL, `limite_pedidos_diarios` = NULL, `soporte_prioritario` = 1, `visible` = 1, `orden` = 3
  WHERE `slug` = 'profesional';
