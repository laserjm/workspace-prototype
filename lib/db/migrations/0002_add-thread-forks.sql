ALTER TABLE "threads" ADD COLUMN "forked_from_thread_id" uuid;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "forked_from_title" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "forked_from_response_index" integer;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_id_owner_id_key" UNIQUE("id","owner_id");