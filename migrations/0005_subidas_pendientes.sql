CREATE TABLE `subidas_pendientes` (
	`token` text PRIMARY KEY NOT NULL,
	`clave` text NOT NULL,
	`content_type` text NOT NULL,
	`max_bytes` integer NOT NULL,
	`ip` text,
	`usada` integer DEFAULT false NOT NULL,
	`expira_en` integer NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subidas_pendientes_ip_fecha_idx` ON `subidas_pendientes` (`ip`,`fecha_creacion`);