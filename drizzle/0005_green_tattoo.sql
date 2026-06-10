ALTER TABLE "entries" ADD COLUMN "moderation_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "flag_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "flag_matches" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "reviewed_at" timestamp with time zone;