CREATE TYPE "public"."connection_auth_kind" AS ENUM('token', 'basic');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('active', 'needs_reconnect');--> statement-breakpoint
CREATE TABLE "connection_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key_version" integer NOT NULL,
	"iv" text NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"base_url" text NOT NULL,
	"account_ref" text NOT NULL,
	"account_label" text NOT NULL,
	"auth_kind" "connection_auth_kind" NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_id_user_id_key" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "connection_secrets" ADD CONSTRAINT "connection_secrets_connection_id_user_id_fkey" FOREIGN KEY ("connection_id","user_id") REFERENCES "public"."connections"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_id_provider_id_base_url_account_ref_key" ON "connections" USING btree ("user_id","provider_id","base_url","account_ref");