CREATE TABLE "battle_queue" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_results" (
	"id" text PRIMARY KEY NOT NULL,
	"battle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"side" text NOT NULL,
	"result" text NOT NULL,
	"elo_before" integer NOT NULL,
	"elo_after" integer NOT NULL,
	"xp_awarded" integer NOT NULL,
	"streak_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_results_battle_user_unique" UNIQUE("battle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "battle_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"battle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"side" text NOT NULL,
	"language" text NOT NULL,
	"code" text NOT NULL,
	"at_seconds" integer NOT NULL,
	"tests_passed" integer NOT NULL,
	"tests_total" integer NOT NULL,
	"passed_all" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'challenged' NOT NULL,
	"source" text NOT NULL,
	"player_a_id" text NOT NULL,
	"player_b_id" text NOT NULL,
	"problem_id" text,
	"time_limit_seconds" integer DEFAULT 1800 NOT NULL,
	"ready_deadline" timestamp with time zone,
	"go_at" timestamp with time zone,
	"winner_side" text,
	"outcome" text,
	"forfeit_reason" text,
	"telemetry" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "elo" integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "battle_games" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "battle_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "battle_queue" ADD CONSTRAINT "battle_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_results" ADD CONSTRAINT "battle_results_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_results" ADD CONSTRAINT "battle_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_submissions" ADD CONSTRAINT "battle_submissions_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_submissions" ADD CONSTRAINT "battle_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_player_a_id_users_id_fk" FOREIGN KEY ("player_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_player_b_id_users_id_fk" FOREIGN KEY ("player_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;