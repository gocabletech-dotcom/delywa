CREATE TABLE `delivery_adelantos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`colmado_id` integer NOT NULL,
	`monto` numeric NOT NULL,
	`motivo` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`respuesta` text,
	`metodo_pago` text,
	`resuelto_por` text,
	`resuelto_at` integer,
	`pago_id` integer,
	`ajuste_id` integer,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `delivery_adelantos_delivery_idx` ON `delivery_adelantos` (`delivery_id`,`estado`);--> statement-breakpoint
CREATE INDEX `delivery_adelantos_colmado_idx` ON `delivery_adelantos` (`colmado_id`,`estado`);