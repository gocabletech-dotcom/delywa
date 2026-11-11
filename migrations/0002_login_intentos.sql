CREATE TABLE `login_intentos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clave` text NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_intentos_clave_fecha_idx` ON `login_intentos` (`clave`,`fecha`);