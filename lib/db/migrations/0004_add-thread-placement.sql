ALTER TABLE "threads" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "woke_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_one_placement" CHECK (num_nonnulls("threads"."settled_at", "threads"."snoozed_until", "threads"."woke_at") <= 1);