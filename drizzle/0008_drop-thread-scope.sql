-- The thread scope is gone (#62): a question's attached items travel on its message. No backfill.
ALTER TABLE "threads" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "threads" DROP COLUMN "record_ids";