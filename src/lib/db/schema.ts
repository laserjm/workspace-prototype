// The schema source of truth (code-first). Tables are `export const <nouns>Table =
// pgTable("<nouns>", …)` and enums `<noun>StatusEnum = pgEnum("<noun>_status", …)`;
// after a change, `pnpm db:generate --name <verb>-<what>` writes the migration to drizzle/.
// Only lib/db/ and a module's queries and writes import drizzle-orm.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---- Sign-in (Better Auth, ARCHITECTURE.md "Sign-in: Better Auth against Keycloak") ------------
// Better Auth reads and writes these four tables through its Drizzle adapter
// (lib/auth/auth.ts); the app reads them only through `getUser()`. Property names are the
// fields Better Auth expects; columns are snake_case. Users are created in Keycloak and land here
// on their first sign-in.

/**
 * One row per person who has signed in. `id` is their Keycloak `sub`, which is the `UserId`.
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
// name `user_id` in every query; deleting a user deletes what they own.

/** A user's project. Names are unique per owner. */
export const projectsTable = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_user_id_name_key").on(table.userId, table.name),
    // The target of threads' (project_id, user_id) reference.
    unique("projects_id_user_id_key").on(table.id, table.userId),
  ],
);

/**
 * A user's thread. `project_id` is null for a thread without a project. The reference includes
 * `user_id`, so a thread can only belong to a project of the same owner. The browser picks `id`
 * (its chat needs it before the server answers). A fork names the thread and response it was
 * forked from: a snapshot, not a reference, so the fork reads the same if its origin changes.
 * Placement: at most one of `settled_at`, `snoozed_until` and `woke_at` is set; none is active.
 * A snooze whose time has passed reads as woken at `snoozed_until`, so nothing writes at the
 * deadline. The conversation is in `thread_messages`.
 */
export const threadsTable = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    sourceId: text("source_id"),
    recordIds: text("record_ids").array(),
    forkedFromThreadId: uuid("forked_from_thread_id"),
    forkedFromTitle: text("forked_from_title"),
    forkedFromResponseIndex: integer("forked_from_response_index"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    wokeAt: timestamp("woke_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "threads_one_placement",
      sql`num_nonnulls(${table.settledAt}, ${table.snoozedUntil}, ${table.wokeAt}) <= 1`,
    ),
    foreignKey({
      name: "threads_project_id_user_id_fkey",
      columns: [table.projectId, table.userId],
      foreignColumns: [projectsTable.id, projectsTable.userId],
    }),
    index("threads_user_id_created_at_idx").on(table.userId, table.createdAt),
    // The target of thread_messages' (thread_id, user_id) reference.
    unique("threads_id_user_id_key").on(table.id, table.userId),
  ],
);

/**
 * One message of a thread's conversation, as the AI SDK's `UIMessage`: `parts` and `metadata`
 * are stored as the chat streamed them. `id` is the AI SDK's message id, unique within its
 * thread, so a fork copies messages without renaming them. The reference includes `user_id`,
 * so a message can only belong to a thread of the same owner; deleting the thread deletes it.
 */
export const threadMessagesTable = pgTable(
  "thread_messages",
  {
    threadId: uuid("thread_id").notNull(),
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    position: integer("position").notNull(),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "thread_messages_pkey",
      columns: [table.threadId, table.id],
    }),
    unique("thread_messages_thread_id_position_key").on(
      table.threadId,
      table.position,
    ),
    foreignKey({
      name: "thread_messages_thread_id_user_id_fkey",
      columns: [table.threadId, table.userId],
      foreignColumns: [threadsTable.id, threadsTable.userId],
    }).onDelete("cascade"),
  ],
);

// ---- Connections (ARCHITECTURE.md "Integrations are provider folders") -------------------------
// A user's links to the systems the workspace connects to. The secret is in its own table, which
// only modules/integrations/vault.ts reads or writes (ESLint), so listing connections never
// touches it.

export const connectionAuthKindEnum = pgEnum("connection_auth_kind", [
  "token",
  "basic",
]);

/** `needs_reconnect`: the provider refused the stored credential; the user connects again. */
export const connectionStatusEnum = pgEnum("connection_status", [
  "active",
  "needs_reconnect",
]);

/**
 * One user's link to one account of a provider at one address. Connecting the same account
 * again updates the row (`connections_user_id_provider_id_base_url_account_ref_key`).
 */
export const connectionsTable = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    /** The API address: https://api.github.com, a GitHub Enterprise or codebeamer instance. */
    baseUrl: text("base_url").notNull(),
    /** The provider's stable id for the account, e.g. GitHub's numeric user id. */
    accountRef: text("account_ref").notNull(),
    /** Who it is connected as, e.g. "@micha". */
    accountLabel: text("account_label").notNull(),
    authKind: connectionAuthKindEnum("auth_kind").notNull(),
    status: connectionStatusEnum("status").notNull().default("active"),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    /** When the credential stops working, if the provider says. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("connections_user_id_provider_id_base_url_account_ref_key").on(
      table.userId,
      table.providerId,
      table.baseUrl,
      table.accountRef,
    ),
    // The target of connection_secrets' (connection_id, user_id) reference.
    unique("connections_id_user_id_key").on(table.id, table.userId),
  ],
);

/**
 * A connection's credential, AES-256-GCM encrypted (`vault.ts`): `iv` and `ciphertext` (with its
 * tag) in base64, under the key `key_version` names, bound to the connection and user. Deleting
 * the connection deletes it.
 */
export const connectionSecretsTable = pgTable(
  "connection_secrets",
  {
    connectionId: uuid("connection_id").primaryKey(),
    userId: text("user_id").notNull(),
    keyVersion: integer("key_version").notNull(),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "connection_secrets_connection_id_user_id_fkey",
      columns: [table.connectionId, table.userId],
      foreignColumns: [connectionsTable.id, connectionsTable.userId],
    }).onDelete("cascade"),
  ],
);
