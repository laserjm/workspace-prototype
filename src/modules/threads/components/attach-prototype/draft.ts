// PROTOTYPE, throwaway. The composer's draft of attached items: per connection, zero or more
// items. A connection with no items is "ask about the connection itself" (focus, not fence).
import { useState } from "react";
import { LIMIT } from "./fixtures";

export type Attachment = { connectionId: string; keys: string[] };
export type Draft = Attachment[];

export const itemCount = (draft: Draft) => draft.reduce((sum, entry) => sum + entry.keys.length, 0);
export const hasKey = (draft: Draft, connectionId: string, key: string) =>
  draft.some((entry) => entry.connectionId === connectionId && entry.keys.includes(key));

export function useDraft(initial: Draft = []) {
  const [draft, setDraft] = useState<Draft>(initial);

  function upsert(connectionId: string, change: (keys: string[]) => string[]) {
    setDraft((current) => {
      const found = current.find((entry) => entry.connectionId === connectionId);
      if (!found) return [...current, { connectionId, keys: change([]) }];
      return current.map((entry) => (entry === found ? { ...entry, keys: change(entry.keys) } : entry));
    });
  }

  return {
    draft,
    setDraft,
    count: itemCount(draft),
    full: itemCount(draft) >= LIMIT,
    has: (connectionId: string, key: string) => hasKey(draft, connectionId, key),
    toggle(connectionId: string, key: string) {
      if (hasKey(draft, connectionId, key)) upsert(connectionId, (keys) => keys.filter((k) => k !== key));
      else if (itemCount(draft) < LIMIT) upsert(connectionId, (keys) => [...keys, key]);
    },
    add(connectionId: string, key: string) {
      if (!hasKey(draft, connectionId, key) && itemCount(draft) < LIMIT) upsert(connectionId, (keys) => [...keys, key]);
    },
    /** Attach the connection with no items. */
    attachConnection(connectionId: string) {
      upsert(connectionId, (keys) => keys);
    },
    /** Remove one item; the connection stays attached (now with zero items) until removed itself. */
    remove(connectionId: string, key?: string) {
      setDraft((current) =>
        key === undefined
          ? current.filter((entry) => entry.connectionId !== connectionId)
          : current
              .map((entry) => (entry.connectionId === connectionId ? { ...entry, keys: entry.keys.filter((k) => k !== key) } : entry))
              // Removing the last item chip removes the connection too: no surprise leftover chip.
              .filter((entry) => entry.connectionId !== connectionId || entry.keys.length > 0),
      );
    },
    clear: () => setDraft([]),
  };
}

export type DraftApi = ReturnType<typeof useDraft>;
