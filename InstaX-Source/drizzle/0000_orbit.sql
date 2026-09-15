CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`post` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX `idx_comments_post_created` ON `comments` (`post`,`created`);
--> statement-breakpoint
CREATE TABLE `follows` (
	`user` text NOT NULL,
	`target` text NOT NULL,
	PRIMARY KEY(`user`, `target`),
	FOREIGN KEY (`user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX `idx_follows_target` ON `follows` (`target`);
--> statement-breakpoint
CREATE TABLE `likes` (
	`user` text NOT NULL,
	`post` text NOT NULL,
	PRIMARY KEY(`user`, `post`),
	FOREIGN KEY (`user`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE INDEX `idx_likes_post` ON `likes` (`post`);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`author`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
CREATE INDEX `idx_posts_created` ON `posts` (`created`);
--> statement-breakpoint
CREATE INDEX `idx_posts_author_created` ON `posts` (`author`,`created`);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_handle_unique` ON `profiles` (`handle`);