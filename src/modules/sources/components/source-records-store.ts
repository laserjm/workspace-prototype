"use client";

import type { RecordPage, SourceRecord } from "../contracts";

export type RecordsLoad =
  | { status: "loading" }
  | { status: "failed" }
  | {
      status: "ready";
      records: SourceRecord[];
      /** Set while the source has more records; `loadMore` reads them. */
      nextCursor?: string;
      loadingMore?: boolean;
    };

/** Until a source's records are here; one value, so snapshots compare equal. */
export const loadingRecords: RecordsLoad = { status: "loading" };
const failed: RecordsLoad = { status: "failed" };

/** What the store asks the server for: a page after `cursor`, or the records with these `ids`. */
export type RecordsRequest = { cursor?: string; ids?: readonly string[] };
export type FetchRecords = (
  sourceId: string,
  request: RecordsRequest,
) => Promise<RecordPage>;

/** A page or a scope's records from the server, read with the user's connection. */
const fetchRecords: FetchRecords = async (sourceId, { cursor, ids }) => {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  for (const id of ids ?? []) params.append("id", id);
  const response = await fetch(
    `/api/sources/${encodeURIComponent(sourceId)}/records?${params}`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const pagesKey = (sourceId: string) => `pages\u0000${sourceId}`;
const scopedKey = (sourceId: string, ids: readonly string[]) =>
  `scoped\u0000${sourceId}\u0000${ids.join("\u0000")}`;

/**
 * Holds what the page has read of each source, for the lifetime of the page: its pages, loaded
 * the first time a view lists the source (`load`, then `loadMore`), and a thread's records by id
 * (`loadScoped`), which may be on any page. A failed load is tried again the next time. Lives
 * outside React state, like `ChatStore`, so a handler can wait for records (`load` resolves).
 */
export class SourceRecordsStore {
  #loads = new Map<string, RecordsLoad>();
  #pending = new Map<string, Promise<SourceRecord[]>>();
  #listeners = new Set<() => void>();
  #fetch: FetchRecords;

  constructor(fetch = fetchRecords) {
    this.#fetch = fetch;
  }

  /** The source's first page (and any loaded after it); rejects when it does not load. */
  load(sourceId: string): Promise<SourceRecord[]> {
    return this.#read(pagesKey(sourceId), () => this.#fetch(sourceId, {}));
  }

  /** Reads the source's next page onto the loaded ones; nothing when there is none. */
  async loadMore(sourceId: string): Promise<void> {
    const key = pagesKey(sourceId);
    const current = this.#loads.get(key);
    if (current?.status !== "ready" || !current.nextCursor || current.loadingMore)
      return;
    this.#set(key, { ...current, loadingMore: true });
    try {
      const page = await this.#fetch(sourceId, { cursor: current.nextCursor });
      const known = new Set(current.records.map((record) => record.id));
      this.#set(key, {
        status: "ready",
        records: [
          ...current.records,
          ...page.records.filter((record) => !known.has(record.id)),
        ],
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      });
    } catch {
      // The loaded pages stay; the button offers the next one again.
      this.#set(key, current);
    }
  }

  /** The records with these ids that the source still has, read fresh once per page. */
  loadScoped(sourceId: string, ids: readonly string[]): Promise<SourceRecord[]> {
    return this.#read(scopedKey(sourceId, ids), () =>
      this.#fetch(sourceId, { ids }),
    );
  }

  loadState = (sourceId: string): RecordsLoad =>
    this.#loads.get(pagesKey(sourceId)) ?? loadingRecords;

  scopedState = (sourceId: string, ids: readonly string[]): RecordsLoad =>
    this.#loads.get(scopedKey(sourceId, ids)) ?? loadingRecords;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #read(key: string, request: () => Promise<RecordPage>) {
    const current = this.#loads.get(key);
    if (current?.status === "ready") return Promise.resolve(current.records);
    const pending = this.#pending.get(key);
    if (pending) return pending;
    this.#set(key, loadingRecords);
    const read = request()
      .then(
        ({ records, nextCursor }) => {
          this.#set(key, {
            status: "ready",
            records,
            ...(nextCursor ? { nextCursor } : {}),
          });
          return records;
        },
        (error: unknown) => {
          this.#set(key, failed);
          throw error;
        },
      )
      .finally(() => this.#pending.delete(key));
    this.#pending.set(key, read);
    return read;
  }

  #set(key: string, state: RecordsLoad) {
    this.#loads.set(key, state);
    for (const listener of this.#listeners) listener();
  }
}
