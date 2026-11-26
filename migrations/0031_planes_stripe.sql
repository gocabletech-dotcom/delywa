CREATE TABLE `stripe_eventos` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text,
	`modo` text,
	`creado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stripe_facturas` (
	`id` text PRIMARY KEY NOT NULL,
	`colmado_id` integer,
	`numero` text,
	`estado` text,
	`motivo` text,
	`plan` text,
	`moneda` text DEFAULT 'usd' NOT NULL,
	`total` numeric DEFAULT '0' NOT NULL,
	`pagado` numeric DEFAULT '0' NOT NULL,
	`pendiente` numeric DEFAULT '0' NOT NULL,
	`comision` numeric,
	`neto` numeric,
	`reembolsado` numeric DEFAULT '0' NOT NULL,
	`periodo_inicio` integer,
	`periodo_fin` integer,
	`creada` integer,
	`pagada_en` integer,
	`intentos` integer DEFAULT 0 NOT NULL,
	`error` text,
	`correo` text,
	`url` text,
	`pdf` text,
	`modo` text DEFAULT 'prueba' NOT NULL,
	`actualizado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stripe_facturas_colmado_idx` ON `stripe_facturas` (`colmado_id`);--> statement-breakpoint
CREATE INDEX `stripe_facturas_creada_idx` ON `stripe_facturas` (`creada`);--> statement-breakpoint
ALTER TABLE `colmados` ADD `cortesia` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `planes` ADD `funciones` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `planes` ADD `moneda` text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `planes` ADD `precio_anual` numeric;--> statement-breakpoint
ALTER TABLE `planes` ADD `visible` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `planes` ADD `stripe_producto` text;--> statement-breakpoint
ALTER TABLE `planes` ADD `stripe_precio` text;--> statement-breakpoint
ALTER TABLE `planes` ADD `stripe_precio_anual` text;--> statement-breakpoint
ALTER TABLE `planes` ADD `stripe_producto_real` text;--> statement-breakpoint
ALTER TABLE `planes` ADD `stripe_precio_real` text;--> statement-breakpoint
ALTER TABLE `planes` ADD `stripe_precio_anual_real` text;--> statement-breakpoint
ALTER TABLE `suscripciones` ADD `stripe_cliente` text;--> statement-breakpoint
ALTER TABLE `suscripciones` ADD `stripe_suscripcion` text;--> statement-breakpoint
ALTER TABLE `suscripciones` ADD `modo` text DEFAULT 'prueba' NOT NULL;--> statement-breakpoint
ALTER TABLE `suscripciones` ADD `periodo` text DEFAULT 'mes' NOT NULL;--> statement-breakpoint
ALTER TABLE `suscripciones` ADD `cancela_al_final` integer DEFAULT false NOT NULL;