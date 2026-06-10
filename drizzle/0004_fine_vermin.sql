ALTER TABLE "entries" ADD COLUMN "repo_url" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "repo_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "video_id" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "video_playback_url" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "submitted_at" timestamp with time zone;