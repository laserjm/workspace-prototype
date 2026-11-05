CREATE TABLE "thread_messages" (
	"thread_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_messages_pkey" PRIMARY KEY("thread_id","id"),
	CONSTRAINT "thread_messages_thread_id_position_key" UNIQUE("thread_id","position")
);
--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_owner_id_fkey" FOREIGN KEY ("thread_id","owner_id") REFERENCES "public"."threads"("id","owner_id") ON DELETE cascade ON UPDATE no action;