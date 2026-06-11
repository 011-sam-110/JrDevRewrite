ALTER TABLE "battles" ADD COLUMN "flag_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "flagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "review_outcome" text;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "battle_strikes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "battle_banned_until" timestamp with time zone;