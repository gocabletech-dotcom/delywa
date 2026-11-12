CREATE TABLE `bot_no_entendidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`colmado_id` integer NOT NULL,
	`texto` text NOT NULL,
	`resuelto_con_ia` integer DEFAULT false NOT NULL,
	`fecha` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bot_no_entendidos_fecha_idx` ON `bot_no_entendidos` (`fecha`);--> statement-breakpoint
CREATE TABLE `bot_registro` (
	`dia` text NOT NULL,
	`colmado_id` integer NOT NULL,
	`mensajes` integer DEFAULT 0 NOT NULL,
	`con_ia` integer DEFAULT 0 NOT NULL,
	`sin_entender` integer DEFAULT 0 NOT NULL,
	`notas_de_voz` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`dia`, `colmado_id`)
);
--> statement-breakpoint
ALTER TABLE `chat_web_mensajes` ADD `opciones` text;