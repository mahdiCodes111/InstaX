CREATE TABLE `bookmarks` (
	`user` text NOT NULL,
	`post` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`user`, `post`),
	FOREIGN KEY (`user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX `idx_bookmarks_post` ON `bookmarks` (`post`);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`actor` text NOT NULL,
	`type` text NOT NULL,
	`post` text,
	`created` integer NOT NULL,
	`read` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recipient`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_created` ON `notifications` (`recipient`,`created`);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_read` ON `notifications` (`recipient`,`read`);