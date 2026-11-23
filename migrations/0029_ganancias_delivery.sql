CREATE TABLE `pago_delivery_ajustes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pago_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`monto` numeric NOT NULL,
	`motivo` text,
	`usuario` text,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`pago_id`) REFERENCES `pagos_delivery`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pago_delivery_ajustes_pago_idx` ON `pago_delivery_ajustes` (`pago_id`);--> statement-breakpoint
ALTER TABLE `deliveries` ADD `envio_es_del_delivery` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos_delivery` ADD `envio_calculado` numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos_delivery` ADD `ajustes_total` numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `pagos_delivery` ADD `metodo_pago` text;--> statement-breakpoint
ALTER TABLE `pagos_delivery` ADD `comprobante_url` text;--> statement-breakpoint
ALTER TABLE `pagos_delivery` ADD `recibido_at` integer;--> statement-breakpoint
ALTER TABLE `pedidos` ADD `propina` numeric;