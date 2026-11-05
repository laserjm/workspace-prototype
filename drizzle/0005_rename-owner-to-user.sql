-- Owned rows name their user as `user_id`, like sessions and accounts (ARCHITECTURE.md "Data
-- ownership"). Renames only: no data is rewritten, and the references follow their columns.
ALTER TABLE "projects" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "threads" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "thread_messages" RENAME COLUMN "owner_id" TO "user_id";--> statement-breakpoint
ALTER INDEX "projects_owner_id_name_key" RENAME TO "projects_user_id_name_key";--> statement-breakpoint
ALTER TABLE "projects" RENAME CONSTRAINT "projects_id_owner_id_key" TO "projects_id_user_id_key";--> statement-breakpoint
ALTER TABLE "threads" RENAME CONSTRAINT "threads_project_id_owner_id_fkey" TO "threads_project_id_user_id_fkey";--> statement-breakpoint
ALTER INDEX "threads_owner_id_created_at_idx" RENAME TO "threads_user_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "threads" RENAME CONSTRAINT "threads_id_owner_id_key" TO "threads_id_user_id_key";--> statement-breakpoint
ALTER TABLE "thread_messages" RENAME CONSTRAINT "thread_messages_thread_id_owner_id_fkey" TO "thread_messages_thread_id_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "projects" RENAME CONSTRAINT "projects_owner_id_users_id_fk" TO "projects_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "threads" RENAME CONSTRAINT "threads_owner_id_users_id_fk" TO "threads_user_id_users_id_fk";
