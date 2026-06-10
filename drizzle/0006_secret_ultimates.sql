CREATE TABLE "ballots" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"judge_user_id" text NOT NULL,
	"ranking" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ballot_pool_judge_unique" UNIQUE("pool_id","judge_user_id")
);
--> statement-breakpoint
CREATE TABLE "judging_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"pool_id" text NOT NULL,
	"judge_user_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "judging_assignment_unique" UNIQUE("pool_id","judge_user_id","entry_id")
);
--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_judge_user_id_users_id_fk" FOREIGN KEY ("judge_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_assignments" ADD CONSTRAINT "judging_assignments_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_assignments" ADD CONSTRAINT "judging_assignments_judge_user_id_users_id_fk" FOREIGN KEY ("judge_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judging_assignments" ADD CONSTRAINT "judging_assignments_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;