CREATE TABLE "pool_results" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"user_id" text NOT NULL,
	"placement" integer,
	"score" real DEFAULT 0 NOT NULL,
	"eligible_to_win" boolean NOT NULL,
	"submitted" boolean NOT NULL,
	"judged" boolean NOT NULL,
	"xp_awarded" integer NOT NULL,
	"rank_awarded" integer NOT NULL,
	"streak_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_results_pool_user_unique" UNIQUE("pool_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "pool_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pool_results" ADD CONSTRAINT "pool_results_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_results" ADD CONSTRAINT "pool_results_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_results" ADD CONSTRAINT "pool_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;