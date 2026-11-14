import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { aConversation, insertMessages, insertThread, insertUser } from "@/test/factories";
import { placementOf } from "./contracts";
import { getThread, getThreadMessages, getThreads } from "./queries";

const anHourAgo = () => new Date(Date.now() - 3_600_000);
const inAnHour = () => new Date(Date.now() + 3_600_000);

describe("getThreads", () => {
  it("lists the requester's threads newest first", async () => {
    const ana = await insertUser();
    const older = await insertThread(ana, { createdAt: new Date("2026-11-03T11:05:00.000Z") });
    const newer = await insertThread(ana, { createdAt: new Date("2026-11-04T11:05:00.000Z") });
    expect((await getThreads(ana)).map((thread) => thread.id)).toEqual([newer.id, older.id]);
  });

  it("lists a thread with the questions and attachments of its stored conversation", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    const [first, ...rest] = aConversation;
    if (!first) throw new Error("aConversation is empty");
    await insertMessages(ana, thread, [
      { ...first, metadata: { attachments: ["plan.pdf", "notes.md"] } },
      ...rest,
    ]);
    expect(await getThreads(ana)).toEqual([
      expect.objectContaining({ id: thread.id, turnCount: 2, attachmentCount: 2 }),
    ]);
  });

  it("reads a snooze whose time has come as woken at its deadline", async () => {
    const ana = await insertUser();
    const snoozedUntil = anHourAgo();
    await insertThread(ana, { snoozedUntil });
    const [thread] = await getThreads(ana);
    expect(thread && placementOf(thread)).toEqual({
      settledAt: undefined,
      snoozedUntil: undefined,
      wokeAt: snoozedUntil.toISOString(),
    });
  });

  it("does not list another user's threads", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    await insertThread(ana);
    expect(await getThreads(ana)).toHaveLength(1);
    expect(await getThreads(ben)).toEqual([]);
  });

  // The thread scope is gone (#62): what a question is about travels on its message. No query
  // can show a column it does not select, so this reads the schema.
  it("reads threads stored without a scope", async () => {
    const columns = await db().execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'threads'`,
    );
    const names = [...columns].map((column) => column.column_name);
    expect(names).toContain("title");
    expect(names).not.toContain("source_id");
    expect(names).not.toContain("record_ids");
  });
});

describe("getThread", () => {
  it("reads one of the requester's threads as stored, a due snooze still snoozed", async () => {
    const ana = await insertUser();
    const snoozedUntil = anHourAgo();
    const forkedFrom = { threadId: randomUUID(), title: "Sprint 24 summary", responseIndex: 1 };
    const thread = await insertThread(ana, { title: "Fork: Sprint 24 summary", snoozedUntil, forkedFrom });
    expect(await getThread(ana, thread.id)).toMatchObject({
      id: thread.id,
      projectId: null,
      title: "Fork: Sprint 24 summary",
      provider: "claude",
      snoozedUntil: snoozedUntil.toISOString(),
      forkedFrom,
      turnCount: 0,
      attachmentCount: 0,
    });
  });

  it("reads a settled thread as settled", async () => {
    const ana = await insertUser();
    const settledAt = new Date("2026-11-04T09:00:00.000Z");
    const thread = await insertThread(ana, { settledAt, snoozedUntil: null });
    const read = await getThread(ana, thread.id);
    expect(read && placementOf(read)).toEqual({
      settledAt: settledAt.toISOString(),
      snoozedUntil: undefined,
      wokeAt: undefined,
    });
  });

  it("returns null for another user's thread", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await insertThread(ana, { snoozedUntil: inAnHour() });
    expect(await getThread(ben, thread.id)).toBeNull();
  });

  it("returns null for a thread that is not there", async () => {
    const ana = await insertUser();
    expect(await getThread(ana, randomUUID())).toBeNull();
  });

  it("returns null for an id that is not a uuid", async () => {
    const ana = await insertUser();
    expect(await getThread(ana, "thread-1")).toBeNull();
  });
});

describe("getThreadMessages", () => {
  it("reads a thread's conversation in order, metadata included", async () => {
    const ana = await insertUser();
    const thread = await insertThread(ana);
    await insertMessages(ana, thread, aConversation);
    expect(await getThreadMessages(ana, thread.id)).toEqual(aConversation);
  });

  it("reads nothing of another user's thread", async () => {
    const ana = await insertUser();
    const ben = await insertUser();
    const thread = await insertThread(ana);
    await insertMessages(ana, thread, aConversation);
    expect(await getThreadMessages(ben, thread.id)).toBeNull();
  });

  it("reads nothing for an id that is not a uuid", async () => {
    const ana = await insertUser();
    expect(await getThreadMessages(ana, "thread-1")).toBeNull();
  });
});
