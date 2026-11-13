// What a question is about: the records the user attached, grouped by connection (ADR 0003 §1),
// and the schemas of the tools every provider answers (ADR 0003 §4).
// Browser-safe: types, the composer's attachment rules and the tool schemas, pure.
import { z } from "zod";
import type { Connection, RecordError, RecordSummary } from "@/modules/integrations";

/** At most this many items, and this many connections, go on one question. */
export const MAX_ATTACHED_ITEMS = 10;
export const MAX_ATTACHED_CONNECTIONS = 5;

/** How an item looked when it was attached: a chip draws from it and never fetches. */
export type ItemSnapshot = Pick<RecordSummary, "label" | "title" | "state">;

/** One record, by reference: its connection's provider parses the key. */
export type AttachedItem = {
  type: string;
  key: string;
  snapshot: ItemSnapshot;
};

/** A connection and the items attached from it; no items attaches the whole connection. */
export type AttachedConnection = {
  connectionId: string;
  /** The provider's id, e.g. "github". */
  provider: string;
  /** The connection's account, e.g. "@acme". */
  label: string;
  items: readonly AttachedItem[];
};

/** The connection an item or a whole-connection attachment comes from. */
export type ConnectionRef = Omit<AttachedConnection, "items">;

/** How an attachment names one of the user's connections. */
export const connectionRefOf = (connection: Connection): ConnectionRef => ({
  connectionId: connection.id,
  provider: connection.providerId,
  label: connection.accountLabel,
});

export function itemCount(attached: readonly AttachedConnection[]): number {
  return attached.reduce((sum, connection) => sum + connection.items.length, 0);
}

/**
 * How the composer names a draft's attachments: the items counted ("these 3 items", "this item"),
 * then the whole connections by name ("these 2 items and @beta", "@acme"). Nothing when nothing
 * is attached.
 */
export function attachedPhrase(attached: readonly AttachedConnection[]): string | undefined {
  const count = itemCount(attached);
  const names = [
    ...(count === 1 ? ["this item"] : count > 1 ? [`these ${count} items`] : []),
    ...attached.filter((connection) => connection.items.length === 0).map((connection) => connection.label),
  ];
  if (names.length <= 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function isPicked(
  attached: readonly AttachedConnection[],
  { connectionId, type, key }: Pick<RecordSummary, "connectionId" | "type" | "key">,
): boolean {
  return attached.some(
    (connection) =>
      connection.connectionId === connectionId &&
      connection.items.some((item) => item.type === type && item.key === key),
  );
}

/** Whether one more item from `connectionId` fits: 10 items, from at most 5 connections. */
export function canPick(
  attached: readonly AttachedConnection[],
  connectionId: string,
): boolean {
  if (itemCount(attached) >= MAX_ATTACHED_ITEMS) return false;
  return (
    attached.some((connection) => connection.connectionId === connectionId) ||
    attached.length < MAX_ATTACHED_CONNECTIONS
  );
}

/** Picks a search result, or unpicks it when it was picked. Over a limit, nothing changes. */
export function togglePick(
  attached: readonly AttachedConnection[],
  connection: ConnectionRef,
  result: RecordSummary,
): readonly AttachedConnection[] {
  if (isPicked(attached, result))
    return removeItem(attached, result.connectionId, result.type, result.key);
  if (!canPick(attached, connection.connectionId)) return attached;
  const item: AttachedItem = {
    type: result.type,
    key: result.key,
    snapshot: { label: result.label, title: result.title, state: result.state },
  };
  return attached.some((entry) => entry.connectionId === connection.connectionId)
    ? attached.map((entry) =>
        entry.connectionId === connection.connectionId
          ? { ...entry, items: [...entry.items, item] }
          : entry,
      )
    : [...attached, { ...connection, items: [item] }];
}

/** Removes one item; a connection goes with its last item, so no chip is left over. */
export function removeItem(
  attached: readonly AttachedConnection[],
  connectionId: string,
  type: string,
  key: string,
): readonly AttachedConnection[] {
  return attached.flatMap((connection) => {
    if (connection.connectionId !== connectionId) return [connection];
    const items = connection.items.filter(
      (item) => item.type !== type || item.key !== key,
    );
    return items.length ? [{ ...connection, items }] : [];
  });
}

export function removeConnection(
  attached: readonly AttachedConnection[],
  connectionId: string,
): readonly AttachedConnection[] {
  return attached.filter((connection) => connection.connectionId !== connectionId);
}

/**
 * What the attach dialog puts in the composer: the picks, by connection, or with nothing picked,
 * the whole connection it shows.
 */
export function applyPicks(
  picks: readonly AttachedConnection[],
  shown: ConnectionRef,
): readonly AttachedConnection[] {
  const withItems = picks.filter((connection) => connection.items.length > 0);
  return withItems.length ? withItems : [{ ...shown, items: [] }];
}

/**
 * The connection the attach dialog opens on, of those it can search, in their order: one already
 * attached, or else the first. A connection that needs reconnecting only when none works (#47).
 */
export function defaultConnectionId(
  connections: readonly Pick<Connection, "id" | "status">[],
  attached: readonly AttachedConnection[],
): string | undefined {
  const working = connections.filter((connection) => connection.status === "active");
  const candidates = working.length ? working : connections;
  return (
    candidates.find((connection) =>
      attached.some((entry) => entry.connectionId === connection.id),
    ) ?? candidates[0]
  )?.id;
}

// The tools every provider answers (ADR 0003 §4). Their schemas are here, so the chat can type
// their parts; `tools.ts` runs them on the server.

/** At most this many results of one search reach the model. */
export const MAX_SEARCH_RESULTS = 20;

const recordSummarySchema = z.object({
  connectionId: z.string(),
  type: z.string().describe("The provider's record type, e.g. issue or pull-request."),
  key: z
    .string()
    .describe("The record's reference within its connection, as the provider's guide writes keys."),
  label: z.string().describe("A short name to cite it by."),
  title: z.string(),
  state: z.string().describe("Its state now, as the provider's guide names them."),
  updatedAt: z.string().describe("When it last changed, ISO 8601."),
  where: z.string().describe("Where it lives, such as its repository and number."),
}) satisfies z.ZodType<RecordSummary>;

const recordErrorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("no_access") }),
  z.object({ kind: z.literal("needs_reconnect") }),
  z.object({ kind: z.literal("rate_limited"), retryAt: z.string() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("invalid_query"), message: z.string() }),
]) satisfies z.ZodType<RecordError>;

/** What the model may ask `search_records` for. */
export const searchRecordsInputSchema = z.object({
  connectionId: z
    .string()
    .min(1)
    .max(100)
    .describe("The connection to search: a connectionId from the connections you may use."),
  query: z
    .string()
    .max(256)
    .describe(
      "The search, in the provider's own syntax as its guide explains it: words, and the provider's qualifiers. Empty lists what involves the user first, then the most recently updated.",
    ),
  type: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe("Only records of this type, e.g. issue or pull-request. Every type when left out."),
  includeClosed: z
    .boolean()
    .optional()
    .describe(
      "Also find closed records (closed, merged, not planned). Only open ones when left out, unless the query names a state itself.",
    ),
});
export type SearchRecordsInput = z.infer<typeof searchRecordsInputSchema>;

/** The best matches, at most `MAX_SEARCH_RESULTS`, and how many there are; or why there are none. */
export const searchRecordsOutputSchema = z.union([
  z.object({
    results: z.array(recordSummarySchema).max(MAX_SEARCH_RESULTS),
    total: z.number().optional().describe("How many records match, of which `results` are the first."),
  }),
  z.object({ error: recordErrorSchema }),
]);
export type SearchRecordsOutput = z.infer<typeof searchRecordsOutputSchema>;
