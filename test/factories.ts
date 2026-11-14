// Arrange helpers: raw inserts, so a test never depends on a command it isn't testing. Every
// call makes fresh rows; tests never share data (Testing §3, §4).
import { randomUUID } from "node:crypto";
import { UserId, type User } from "@/lib/auth";
import { db, withTransaction } from "@/lib/db/client";
import {
  connectionsTable,
  projectsTable,
  threadMessagesTable,
  threadsTable,
  usersTable,
} from "@/lib/db/schema";
import { writeSecret } from "@/lib/db/vault";
import type { WorkspaceUIMessage } from "@/modules/agent/contracts";
import type { ConnectionListItem, Credential } from "@/modules/integrations/contracts";
import type { StartThreadInput, Thread } from "@/modules/threads/contracts";
import type { SkillDetail } from "@/modules/skills/contracts";

/** A signed-up user, as their first sign-in stores them: the id is their Keycloak `sub`. */
export async function insertUser(): Promise<User> {
  const id = `test-${randomUUID()}`;
  const [user] = await db()
    .insert(usersTable)
    .values({ id, keycloakSub: id, name: id, email: `${id}@test.invalid` })
    .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email });
  if (!user) throw new Error("The insert returned no user");
  return { ...user, id: UserId(user.id) };
}

export async function insertProject(owner: User, values: { name?: string } = {}) {
  const [project] = await db()
    .insert(projectsTable)
    .values({ userId: owner.id, name: values.name ?? `project-${randomUUID()}` })
    .returning({ id: projectsTable.id, name: projectsTable.name });
  if (!project) throw new Error("The insert returned no project");
  return project;
}

/** A skill as the catalogue holds them; the catalogue is files, so this builds the DTO. */
export function aSkill(overrides: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: "summary",
    name: "Summary",
    description: "A test skill.",
    output: "Overview",
    instructions: "Summarize the records.",
    prompt: "Create a summary of these",
    enabledByDefault: true,
    ...overrides,
  };
}

/**
 * A stored connection with its credential in the vault, as `connect` leaves one: GitHub at
 * api.github.com by default, with a fake token that only recorded answers accept.
 */
export async function insertConnection(
  owner: User,
  values: Partial<Omit<ConnectionListItem, "id">> & { credential?: Credential } = {},
): Promise<ConnectionListItem> {
  const { credential = { kind: "token", token: "github_pat_test" }, ...row } = values;
  return withTransaction(async (tx) => {
    const [connection] = await tx
      .insert(connectionsTable)
      .values({
        userId: owner.id,
        providerId: row.providerId ?? "github",
        baseUrl: row.baseUrl ?? "https://api.github.com",
        accountRef: randomUUID(),
        accountLabel: row.accountLabel ?? "@laserjm",
        authKind: credential.kind,
        status: row.status ?? "active",
        scopes: row.scopes ?? [],
        expiresAt: row.expiresAt ?? null,
        lastVerifiedAt: row.lastVerifiedAt ?? new Date("2026-11-13T09:00:00Z"),
      })
      .returning({
        id: connectionsTable.id,
        providerId: connectionsTable.providerId,
        accountLabel: connectionsTable.accountLabel,
        status: connectionsTable.status,
        baseUrl: connectionsTable.baseUrl,
        scopes: connectionsTable.scopes,
        expiresAt: connectionsTable.expiresAt,
        lastVerifiedAt: connectionsTable.lastVerifiedAt,
      });
    if (!connection) throw new Error("The insert returned no connection");
    await writeSecret(tx, owner.id, connection.id, credential);
    return connection;
  });
}

/** A stored thread; placement and fork columns as given, active and unforked by default. */
export async function insertThread(
  owner: User,
  values: {
    projectId?: string | null;
    title?: string;
    provider?: string;
    createdAt?: Date;
    settledAt?: Date | null;
    snoozedUntil?: Date | null;
    wokeAt?: Date | null;
    forkedFrom?: { threadId: string; title: string; responseIndex: number };
  } = {},
): Promise<{ id: string; title: string }> {
  const [thread] = await db()
    .insert(threadsTable)
    .values({
      id: randomUUID(),
      userId: owner.id,
      projectId: values.projectId ?? null,
      title: values.title ?? "Sprint 24 summary",
      provider: values.provider ?? "claude",
      createdAt: values.createdAt ?? new Date(),
      settledAt: values.settledAt ?? null,
      snoozedUntil: values.snoozedUntil ?? null,
      wokeAt: values.wokeAt ?? null,
      forkedFromThreadId: values.forkedFrom?.threadId ?? null,
      forkedFromTitle: values.forkedFrom?.title ?? null,
      forkedFromResponseIndex: values.forkedFrom?.responseIndex ?? null,
    })
    .returning({ id: threadsTable.id, title: threadsTable.title });
  if (!thread) throw new Error("The insert returned no thread");
  return thread;
}

/** Stores `messages` as the thread's conversation, in order. */
export async function insertMessages(
  owner: User,
  thread: { id: string },
  messages: readonly WorkspaceUIMessage[],
) {
  if (messages.length === 0) return;
  await db()
    .insert(threadMessagesTable)
    .values(
      messages.map((message, position) => ({
        threadId: thread.id,
        userId: owner.id,
        id: message.id,
        position,
        role: message.role,
        parts: message.parts,
        metadata: message.metadata ?? null,
      })),
    );
}

/** A thread as the browser holds it, for the pure rules' tests. */
export function aThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: null,
    title: "Sprint 24 summary",
    branch: "main",
    createdAt: "2026-11-03T11:05:00.000Z",
    provider: "claude",
    turnCount: 0,
    attachmentCount: 0,
    ...overrides,
  };
}

/** The first message of a new thread, under a fresh id, as the browser sends it. */
export function aNewThread(overrides: Partial<StartThreadInput> = {}): StartThreadInput {
  return {
    id: randomUUID(),
    projectId: null,
    prompt: "Summarize these tickets",
    provider: "claude",
    ...overrides,
  };
}

/** Two questions and their replies, with the metadata the chat stores. */
export const aConversation: WorkspaceUIMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Summarize these tickets" }],
    metadata: { createdAt: "2026-11-05T09:00:00.000Z" },
  },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "Two tickets are blocked." }],
    metadata: { modelId: "opus", completedAt: "2026-11-05T09:00:05.000Z" },
  },
  {
    id: "u2",
    role: "user",
    parts: [{ type: "text", text: "Which ones?" }],
  },
  {
    id: "a2",
    role: "assistant",
    parts: [{ type: "text", text: "PLAT-124 and PLAT-125." }],
  },
];

/** A user as a pure rule's test names one; nothing is stored. */
export function aUser(id = "user-a"): User {
  return { id: UserId(id), name: id, email: `${id}@test.invalid` };
}
