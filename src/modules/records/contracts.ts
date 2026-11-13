// What a question is about: the records the user attached, grouped by connection (ADR 0003 §1).
// Browser-safe: types and the composer's attachment rules, pure.
import type { Connection, RecordSummary } from "@/modules/integrations";

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

export function itemCount(attached: readonly AttachedConnection[]): number {
  return attached.reduce((sum, connection) => sum + connection.items.length, 0);
}

/**
 * How the composer's suggestion names a draft's attachments: "these 3 items", "this item", or the
 * whole connections by name ("@acme and @beta"). Nothing when nothing is attached.
 */
export function attachedPhrase(attached: readonly AttachedConnection[]): string | undefined {
  const count = itemCount(attached);
  if (count === 1) return "this item";
  if (count > 1) return `these ${count} items`;
  const labels = attached.map((connection) => connection.label);
  if (labels.length <= 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
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
