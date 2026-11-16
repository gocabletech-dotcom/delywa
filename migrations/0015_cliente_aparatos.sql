CREATE TABLE `cliente_aparatos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`telefono` text NOT NULL,
	`aparato` text NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`colmado_id`) REFERENCES `colmados`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cliente_aparatos_uniq` ON `cliente_aparatos` (`colmado_id`,`telefono`,`aparato`);