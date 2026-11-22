CREATE TABLE `compra_lineas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`compra_id` integer NOT NULL,
	`descripcion` text NOT NULL,
	`menu_producto_id` integer,
	`cantidad` real NOT NULL,
	`unidades_por_paquete` integer DEFAULT 1 NOT NULL,
	`costo` numeric NOT NULL,
	`total` numeric NOT NULL,
	`unidades_sumadas` integer DEFAULT 0 NOT NULL,
	`costo_unitario` numeric,
	FOREIGN KEY (`compra_id`) REFERENCES `compras`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compra_lineas_compra_idx` ON `compra_lineas` (`compra_id`);--> statement-breakpoint
CREATE TABLE `compra_pagos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`compra_id` integer NOT NULL,
	`monto` numeric NOT NULL,
	`metodo` text NOT NULL,
	`nota` text,
	`usuario` text,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`compra_id`) REFERENCES `compras`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `compra_pagos_compra_idx` ON `compra_pagos` (`compra_id`);--> statement-breakpoint
CREATE TABLE `compras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`suplidor_id` integer NOT NULL,
	`factura` text,
	`ncf` text,
	`fecha` text NOT NULL,
	`subtotal` numeric DEFAULT '0' NOT NULL,
	`itbis` numeric DEFAULT '0' NOT NULL,
	`descuento` numeric DEFAULT '0' NOT NULL,
	`total` numeric NOT NULL,
	`forma_pago` text NOT NULL,
	`vence` text,
	`saldo` numeric DEFAULT '0' NOT NULL,
	`estado` text DEFAULT 'registrada' NOT NULL,
	`foto_url` text,
	`notas` text,
	`usuario` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`suplidor_id`) REFERENCES `suplidores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `compras_colmado_fecha_idx` ON `compras` (`colmado_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `compras_suplidor_idx` ON `compras` (`suplidor_id`);--> statement-breakpoint
CREATE TABLE `producto_costos` (
	`menu_producto_id` integer PRIMARY KEY NOT NULL,
	`costo` numeric NOT NULL,
	`actualizado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`menu_producto_id`) REFERENCES `menu_productos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `suplidor_equivalencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`suplidor_id` integer NOT NULL,
	`descripcion` text NOT NULL,
	`menu_producto_id` integer NOT NULL,
	`unidades_por_paquete` integer DEFAULT 1 NOT NULL,
	`veces` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`suplidor_id`) REFERENCES `suplidores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`menu_producto_id`) REFERENCES `menu_productos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suplidor_equivalencias_uq` ON `suplidor_equivalencias` (`suplidor_id`,`descripcion`);--> statement-breakpoint
CREATE TABLE `suplidores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`nombre` text NOT NULL,
	`rnc` text,
	`telefono` text,
	`vendedor` text,
	`dias_credito` integer,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suplidores_colmado_idx` ON `suplidores` (`colmado_id`);