CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`glossary` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_unique` ON `profiles` (`name`);--> statement-breakpoint
CREATE TABLE `job_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_hash` text NOT NULL,
	`target_lang` text NOT NULL,
	`model` text NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_memory_hash_lang_uq` ON `job_memory` (`context_hash`,`target_lang`);--> statement-breakpoint
CREATE INDEX `job_memory_updated_idx` ON `job_memory` (`updated_at`);