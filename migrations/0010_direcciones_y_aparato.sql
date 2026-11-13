CREATE TABLE `cliente_direcciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cliente_id` integer NOT NULL,
	`etiqueta` text NOT NULL,
	`direccion_texto` text,
	`latitud` text,
	`longitud` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ultima_actualizacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cliente_direcciones_cliente_etiqueta_uniq` ON `cliente_direcciones` (`cliente_id`,`etiqueta`);--> statement-breakpoint
ALTER TABLE `chat_web_sesiones` ADD `aparato` text;--> statement-breakpoint
ALTER TABLE `chat_web_sesiones` ADD `destino_guardado` text;