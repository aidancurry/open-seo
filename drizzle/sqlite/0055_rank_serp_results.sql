CREATE TABLE `rank_serp_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`tracking_keyword_id` text NOT NULL,
	`keyword` text NOT NULL,
	`device` text NOT NULL,
	`position` integer NOT NULL,
	`domain` text NOT NULL,
	`url` text,
	`checked_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `rank_check_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_serp_results_run_keyword_device_position_idx` ON `rank_serp_results` (`run_id`,`tracking_keyword_id`,`device`,`position`);--> statement-breakpoint
CREATE INDEX `rank_serp_results_keyword_device_idx` ON `rank_serp_results` (`tracking_keyword_id`,`device`,`checked_at`);--> statement-breakpoint
CREATE INDEX `rank_serp_results_domain_idx` ON `rank_serp_results` (`domain`);