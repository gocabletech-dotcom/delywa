CREATE TABLE `ofertas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`texto` text NOT NULL,
	`hasta` integer NOT NULL,
	`activa` integer DEFAULT true NOT NULL,
	`aviso` text,
	`aviso_cursor` integer DEFAULT 0 NOT NULL,
	`avisados` integer DEFAULT 0 NOT NULL,
	`creado_por` text,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ofertas_colmado_idx` ON `ofertas` (`colmado_id`,`hasta`);--> statement-breakpoint
CREATE TABLE `push_suscripciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`tipo` text NOT NULL,
	`colmado_id` integer NOT NULL,
	`user_id` text,
	`telefono` text,
	`ofertas` integer DEFAULT true NOT NULL,
	`fallos` integer DEFAULT 0 NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_suscripciones_endpoint_unique` ON `push_suscripciones` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_suscripciones_colmado_idx` ON `push_suscripciones` (`colmado_id`,`tipo`);