CREATE TABLE `avisos_enviados` (
	`clave` text PRIMARY KEY NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bitacora` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`usuario` text,
	`rol` text,
	`colmado_id` integer,
	`accion` text NOT NULL,
	`detalle` text,
	`ip` text,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bitacora_fecha_idx` ON `bitacora` (`fecha`);--> statement-breakpoint
CREATE INDEX `bitacora_colmado_idx` ON `bitacora` (`colmado_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `codigos_correo` (
	`email` text PRIMARY KEY NOT NULL,
	`codigo_hash` text NOT NULL,
	`expira` integer NOT NULL,
	`intentos` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dispositivos` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`nombre` text,
	`creado` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`visto` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `dispositivos_user_idx` ON `dispositivos` (`user_id`);--> statement-breakpoint
CREATE TABLE `errores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ref` text NOT NULL,
	`origen` text DEFAULT 'api' NOT NULL,
	`metodo` text,
	`ruta` text,
	`mensaje` text,
	`pila` text,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `errores_fecha_idx` ON `errores` (`fecha`);--> statement-breakpoint
CREATE TABLE `recuperaciones` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expira` integer NOT NULL,
	`usado` integer DEFAULT false NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `respaldos` (
	`dia` text PRIMARY KEY NOT NULL,
	`estado` text DEFAULT 'en_curso' NOT NULL,
	`tablas` text NOT NULL,
	`tabla_actual` integer DEFAULT 0 NOT NULL,
	`ultimo_rowid` integer DEFAULT 0 NOT NULL,
	`parte` integer DEFAULT 0 NOT NULL,
	`filas` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`inicio` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`fin` integer,
	`error` text
);
