CREATE TABLE `jerga_aprendizaje` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pais_id` integer NOT NULL,
	`tipo_negocio` text NOT NULL,
	`jerga` text NOT NULL,
	`producto_identificado` text NOT NULL,
	`colmado_id` integer NOT NULL,
	`veces_usado` integer DEFAULT 1 NOT NULL,
	`fecha_creacion` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ultimo_uso` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`pais_id`) REFERENCES `paises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jerga_aprendizaje_uq` ON `jerga_aprendizaje` (`pais_id`,`tipo_negocio`,`jerga`,`producto_identificado`,`colmado_id`);--> statement-breakpoint
CREATE INDEX `jerga_aprendizaje_grupo_idx` ON `jerga_aprendizaje` (`pais_id`,`tipo_negocio`,`jerga`);--> statement-breakpoint
ALTER TABLE `plantillas_jerga` ADD `origen` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `plantillas_jerga` ADD `colmados_aprendida` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plantillas_jerga` ADD `veces_usado` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `plantillas_jerga_tipo_pais_idx` ON `plantillas_jerga` (`tipo_negocio`,`pais_id`);