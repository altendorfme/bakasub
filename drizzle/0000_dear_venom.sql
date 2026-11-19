CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`media_type` text NOT NULL,
	`temperature` real NOT NULL,
	`prompt` text NOT NULL,
	`glossary` text DEFAULT '[]' NOT NULL,
	`copied_from` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presets_name_unique` ON `presets` (`name`);--> statement-breakpoint
CREATE TABLE `job_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_hash` text NOT NULL,
	`target_lang` text NOT NULL,
	`model` text NOT NULL,
	`prompt_hash` text DEFAULT '' NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_used_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_memory_key_uq` ON `job_memory` (`context_hash`,`target_lang`,`model`,`prompt_hash`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`batch_id` text,
	`status` text NOT NULL,
	`step` text,
	`spec` text NOT NULL,
	`progress` text NOT NULL,
	`artifacts` text NOT NULL,
	`result` text,
	`error` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_batch_idx` ON `jobs` (`batch_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`root` text,
	`options` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
