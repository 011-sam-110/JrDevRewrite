CREATE TABLE "problems" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"statement_md" text NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text NOT NULL,
	"reference_language" text NOT NULL,
	"reference_solution" text NOT NULL,
	"hidden_tests" jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_slug_unique" UNIQUE("slug")
);
