CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`status` text NOT NULL,
	`analyst_id` text,
	`turn` integer DEFAULT 0 NOT NULL,
	`pending_action` text,
	`handoff` text,
	`user_messages` integer DEFAULT 0 NOT NULL,
	`low_confidence` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE INDEX `conversations_employee_idx` ON `conversations` (`employee_id`);--> statement-breakpoint
CREATE INDEX `conversations_status_idx` ON `conversations` (`status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`author_id` text,
	`author_name` text,
	`author_team` text,
	`content` text NOT NULL,
	`widgets` text DEFAULT '[]' NOT NULL,
	`trace` text,
	`model_messages` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`);