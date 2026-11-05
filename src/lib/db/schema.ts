// The schema source of truth (code-first, NX-DB-01). Tables are `export const <nouns>Table =
// pgTable("<nouns>", …)` and enums `<noun>StatusEnum = pgEnum("<noun>_status", …)` (NX-DRZ-04);
// after a change, `pnpm db:generate --name <verb>-<what>` writes the migration to drizzle/.
// Only lib/db/ and modules/*/infra/ import drizzle-orm (NX-DRZ-01).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---- Sign-in (Better Auth, ARCHITECTURE.md "Sign-in: Better Auth against Keycloak") ------------
// Better Auth reads and writes these four tables through its Drizzle adapter
// (lib/auth/auth.ts); the app reads them only through `getRequester()`. Property names are the
// fields Better Auth expects; columns are snake_case. Users are created in Keycloak and land here
// on their first sign-in.

/**
 * One row per person who has signed in. `id` is their Keycloak `sub`, which is the `OwnerId`.
 * `keycloakSub` is how the `sub` reaches Better Auth's create hook (lib/auth/auth.ts); the check
 * keeps the two equal.
 */
export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    keycloakSub: text("keycloak_sub").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSignedInAt: timestamp("last_signed_in_at", { withTimezone: true }),
  },
  (table) => [
    check("users_id_is_keycloak_sub", sql`${table.id} = ${table.keycloakSub}`),
  ],
);

/** A signed-in browser. The cookie holds `token`; signing out deletes the row. */
export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/** The Keycloak identity behind a user, with Keycloak's tokens (refreshed by Better Auth). */
export const accountsTable = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_provider_id_account_id_key").on(
      table.providerId,
      table.accountId,
    ),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

/** Short-lived values: the OAuth state, PKCE verifier and nonce of a sign-in in progress. */
export const verificationsTable = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// ---- Owned data (ARCHITECTURE.md "Data ownership") ---------------------------------------------
// Every row names its owner, the signed-in user's `users.id` (their Keycloak `sub`). Repositories
// name `owner_id` in every query (NX-AUTH-03); deleting a user deletes what they own.

/** A user's project. Names are unique per owner. */
export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_owner_id_name_key").on(table.ownerId, table.name),
    // The target of threads' (project_id, owner_id) reference.
    unique("projects_id_owner_id_key").on(table.id, table.ownerId),
  ],
);

/**
 * A user's thread. `project_id` is null for a thread without a project. The reference includes
 * `owner_id`, so a thread can only belong to a project of the same owner. The browser picks `id`
 * (its chat needs it before the server answers). The conversation is not stored yet.
 */
export const threadsTable = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    sourceId: text("source_id"),
    recordIds: text("record_ids").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "threads_project_id_owner_id_fkey",
      columns: [table.projectId, table.ownerId],
      foreignColumns: [projectsTable.id, projectsTable.ownerId],
    }),
    index("threads_owner_id_created_at_idx").on(table.ownerId, table.createdAt),
  ],
);
