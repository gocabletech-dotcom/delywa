CREATE TABLE `aceptaciones_legales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`colmado_id` integer,
	`documento` text NOT NULL,
	`version` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aceptaciones_legales_user_idx` ON `aceptaciones_legales` (`user_id`);--> statement-breakpoint
CREATE INDEX `aceptaciones_legales_colmado_idx` ON `aceptaciones_legales` (`colmado_id`);