CREATE TABLE `bot_correcciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`dicho` text NOT NULL,
	`producto` text NOT NULL,
	`veces` integer DEFAULT 1 NOT NULL,
	`ultimo_pedido_id` integer,
	`estado` text DEFAULT 'esperando' NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_correcciones_uq` ON `bot_correcciones` (`colmado_id`,`dicho`,`producto`);--> statement-breakpoint
CREATE TABLE `ia_consumo` (
	`dia` text PRIMARY KEY NOT NULL,
	`neuronas` real DEFAULT 0 NOT NULL,
	`llamadas_texto` integer DEFAULT 0 NOT NULL,
	`notas_de_voz` integer DEFAULT 0 NOT NULL,
	`sin_cupo` integer DEFAULT 0 NOT NULL
);
