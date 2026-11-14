// What the server decides about attached items, against the test database: which connections an
// answer may use, and which a new question may not attach.
import { describe, expect, it } from "vitest";
import type { ConnectionListItem } from "@/modules/integrations/contracts";
import { insertConnection, insertUser } from "@/test/factories";
import { ATTACHED_ITEMS_PART, type MessageWithParts } from "./contracts";
import { getAllowedConnections, getForeignConnectionIds } from "./queries";

/** How a question attaches a connection, with or without items. */
const attaching = (connectionId: string, items: unknown[] = []) => ({
  connectionId,
  provider: "github",
  label: "@laserjm",
  items,
});

/** A question attaching these connections. */
const question = (...connections: ReturnType<typeof attaching>[]): MessageWithParts => ({
  role: "user",
  parts: [
    { type: "text", text: "What is open?" },
    { type: ATTACHED_ITEMS_PART, data: { connections } },
  ],
});

const issue = {
  type: "issue",
  key: "laserjm/workspace-fixtures#6",
  snapshot: { label: "workspace-fixtures#6", title: "Status page", state: "open" },
};

/** The connection as the agent's prompt names it. */
const allowed = (connection: ConnectionListItem) => ({
  connectionId: connection.id,
  provider: "github",
  providerName: "GitHub",
  account: connection.accountLabel,
  guide: expect.stringMatching(/\S/),
});

describe("getAllowedConnections", () => {
  it("allows each connection the thread's questions attached, once, in the order first attached", async () => {
    const owner = await insertUser();
    const first = await insertConnection(owner, { accountLabel: "@first" });
    const second = await insertConnection(owner, { accountLabel: "@second" });

    const connections = await getAllowedConnections(owner, [
      question(attaching(second.id, [issue])),
      { role: "assistant", parts: [{ type: "text", text: "Two are open." }] },
      question(attaching(first.id), attaching(second.id)),
    ]);

    expect(connections).toEqual([allowed(second), allowed(first)]);
  });

  it("allows nothing when no question attached anything", async () => {
    const owner = await insertUser();
    await insertConnection(owner);

    expect(await getAllowedConnections(owner, [])).toEqual([]);
    expect(
      await getAllowedConnections(owner, [
        { role: "user", parts: [{ type: "text", text: "Hello" }] },
      ]),
    ).toEqual([]);
  });

  it("allows nothing an answer attached, only what questions did", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);

    expect(
      await getAllowedConnections(owner, [{ ...question(attaching(connection.id)), role: "assistant" }]),
    ).toEqual([]);
  });

  it("leaves out someone else's connection", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const mine = await insertConnection(owner);
    const theirs = await insertConnection(other);

    expect(
      await getAllowedConnections(owner, [question(attaching(theirs.id), attaching(mine.id))]),
    ).toEqual([allowed(mine)]);
  });

  it("leaves out a connection that needs reconnecting", async () => {
    const owner = await insertUser();
    const active = await insertConnection(owner);
    const refused = await insertConnection(owner, { status: "needs_reconnect" });

    expect(
      await getAllowedConnections(owner, [question(attaching(refused.id), attaching(active.id))]),
    ).toEqual([allowed(active)]);
  });

  it("leaves out a connection that is gone, and one whose provider is gone", async () => {
    const owner = await insertUser();
    const retired = await insertConnection(owner, { providerId: "retired-provider" });

    expect(
      await getAllowedConnections(owner, [
        question(attaching("00000000-0000-4000-8000-000000000000"), attaching(retired.id)),
      ]),
    ).toEqual([]);
  });

  it("allows nothing from a part with a malformed id", async () => {
    const owner = await insertUser();
    const connection = await insertConnection(owner);

    expect(
      await getAllowedConnections(owner, [
        question(attaching("no-such-connection"), attaching(connection.id)),
      ]),
    ).toEqual([]);
  });
});

describe("getForeignConnectionIds", () => {
  it("finds none when the question attaches only the requester's connections", async () => {
    const owner = await insertUser();
    const active = await insertConnection(owner);
    const refused = await insertConnection(owner, { status: "needs_reconnect" });

    expect(
      await getForeignConnectionIds(owner, question(attaching(active.id, [issue]), attaching(refused.id))),
    ).toEqual([]);
  });

  it("names someone else's connection", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const mine = await insertConnection(owner);
    const theirs = await insertConnection(other);

    expect(
      await getForeignConnectionIds(owner, question(attaching(mine.id), attaching(theirs.id))),
    ).toEqual([theirs.id]);
  });

  it("names a connection that is not there", async () => {
    const owner = await insertUser();
    const missing = "00000000-0000-4000-8000-000000000000";

    expect(await getForeignConnectionIds(owner, question(attaching(missing)))).toEqual([missing]);
  });

  it("finds none in a part with a malformed id, which validation refuses", async () => {
    const owner = await insertUser();

    expect(await getForeignConnectionIds(owner, question(attaching("no-such-connection")))).toEqual(
      [],
    );
  });

  it("finds none in a question that attaches nothing", async () => {
    const owner = await insertUser();

    expect(
      await getForeignConnectionIds(owner, { role: "user", parts: [{ type: "text", text: "Hi" }] }),
    ).toEqual([]);
  });
});
