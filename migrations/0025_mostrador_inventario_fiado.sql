CREATE TABLE `fiado_cuentas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`nombre` text NOT NULL,
	`telefono` text,
	`limite` numeric,
	`saldo` numeric DEFAULT '0' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`notas` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ultimo_movimiento` integer,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fiado_cuentas_colmado_idx` ON `fiado_cuentas` (`colmado_id`);--> statement-breakpoint
CREATE TABLE `fiado_movimientos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cuenta_id` integer NOT NULL,
	`colmado_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`monto` numeric NOT NULL,
	`pedido_id` integer,
	`metodo_pago` text,
	`nota` text,
	`usuario` text,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `fiado_cuentas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fiado_movimientos_cuenta_idx` ON `fiado_movimientos` (`cuenta_id`,`fecha`);--> statement-breakpoint
ALTER TABLE `menu_productos` ADD `inventario_minimo` integer;--> statement-breakpoint
ALTER TABLE `pedidos` ADD `origen` text;