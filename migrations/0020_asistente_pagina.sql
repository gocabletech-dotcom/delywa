CREATE TABLE `asistente_conversaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`mensajes` integer DEFAULT 0 NOT NULL,
	`soporte` integer DEFAULT false NOT NULL,
	`convirtio` integer DEFAULT false NOT NULL,
	`creado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`visto` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asistente_conversaciones_token_unique` ON `asistente_conversaciones` (`token`);--> statement-breakpoint
CREATE INDEX `asistente_conv_creado_idx` ON `asistente_conversaciones` (`creado`);--> statement-breakpoint
CREATE TABLE `asistente_mensajes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conv_id` integer NOT NULL,
	`rol` text NOT NULL,
	`texto` text NOT NULL,
	`tema` text,
	`creado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`conv_id`) REFERENCES `asistente_conversaciones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `asistente_msj_conv_idx` ON `asistente_mensajes` (`conv_id`);--> statement-breakpoint
CREATE INDEX `asistente_msj_creado_idx` ON `asistente_mensajes` (`creado`);--> statement-breakpoint
CREATE TABLE `asistente_respuestas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pregunta` text NOT NULL,
	`respuesta` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`usos` integer DEFAULT 0 NOT NULL,
	`creado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
