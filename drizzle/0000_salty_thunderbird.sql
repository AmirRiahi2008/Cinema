CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`object_key` text,
	`subtitle_key` text,
	`mime` text DEFAULT 'video/mp4' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_room` ON `media` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`room_id` text NOT NULL,
	`seat` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text DEFAULT 'moon' NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`last_seen` integer NOT NULL,
	`typing_until` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`room_id`, `seat`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_token` ON `members` (`token_hash`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`seat` text NOT NULL,
	`text` text NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`client_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_room` ON `messages` (`room_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_client` ON `messages` (`room_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`mood` text DEFAULT 'amber' NOT NULL,
	`invite_hash` text,
	`shared_control` integer DEFAULT 1 NOT NULL,
	`media_id` text,
	`position` real DEFAULT 0 NOT NULL,
	`playing` integer DEFAULT 0 NOT NULL,
	`rate` real DEFAULT 1 NOT NULL,
	`playback_at` integer NOT NULL,
	`playback_revision` integer DEFAULT 0 NOT NULL,
	`actor` text DEFAULT 'host' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upload_parts` (
	`upload_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL,
	`bytes` integer NOT NULL,
	PRIMARY KEY(`upload_id`, `part_number`),
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`object_key` text NOT NULL,
	`multipart_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `uploads_room` ON `uploads` (`room_id`);