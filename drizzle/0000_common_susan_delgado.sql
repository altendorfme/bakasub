CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`glossary` text DEFAULT '[]' NOT NULL,
	`target_lang` text DEFAULT 'pt-BR' NOT NULL,
	`temperature` real DEFAULT 0.3 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_unique` ON `profiles` (`name`);--> statement-breakpoint
CREATE TABLE `job_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_hash` text NOT NULL,
	`target_lang` text NOT NULL,
	`model` text NOT NULL,
	`glossary_hash` text DEFAULT '' NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_used_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_memory_key_uq` ON `job_memory` (`context_hash`,`target_lang`,`model`,`glossary_hash`);--> statement-breakpoint
CREATE INDEX `job_memory_last_used_idx` ON `job_memory` (`last_used_at`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`ciphertext` blob NOT NULL,
	`iv` blob NOT NULL,
	`tag` blob NOT NULL,
	`key_version` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vault_keys` (
	`version` integer PRIMARY KEY NOT NULL,
	`wrapped` blob NOT NULL,
	`protection` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
