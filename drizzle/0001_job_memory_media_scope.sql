DROP INDEX `job_memory_key_uq`;--> statement-breakpoint
ALTER TABLE `job_memory` ADD `media_scope` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `job_memory_key_uq` ON `job_memory` (`context_hash`,`target_lang`,`model`,`prompt_hash`,`media_scope`);