"use client";

import type { RecordPage } from "@/modules/integrations";
import type { SourceRecord } from "../contracts";

export type RecordsLoad =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; records: SourceRecord[] };

/** Until a source's records are here; one value, so snapshots compare equal. */
export const loadingRecords: RecordsLoad = { status: "loading" };
const failed: RecordsLoad = { status: "failed" };

/** A source's first page of records from the server, read with the user's connection. */
async function fetchRecords(sourceId: string): Promise<SourceRecord[]> {
  const response = await fetch(
    `/api/sources/${encodeURIComponent(sourceId)}/records`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const page: RecordPage = await response.json();
  return page.records;
}

/**
 * Holds each source's records for the lifetime of the page, loaded the first time a view needs
 * them (`load`). A failed load is tried again the next time. Lives outside React state, like
 * `ChatStore`, so a handler can wait for a source's records (`load` resolves with them).
 */
export class SourceRecordsStore {
  #loads = new Map<string, RecordsLoad>();
  #pending = new Map<string, Promise<SourceRecord[]>>();
  #listeners = new Set<() => void>();
  #fetch: (sourceId: string) => Promise<SourceRecord[]>;

  constructor(fetch = fetchRecords) {
    this.#fetch = fetch;
  }

  /** The source's records, from the server the first time; rejects when they do not load. */
  load(sourceId: string): Promise<SourceRecord[]> {
    const current = this.#loads.get(sourceId);
    if (current?.status === "ready") return Promise.resolve(current.records);
    const pending = this.#pending.get(sourceId);
    if (pending) return pending;
    this.#set(sourceId, loadingRecords);
    const request = this.#fetch(sourceId)
      .then(
        (records) => {
          this.#set(sourceId, { status: "ready", records });
          return records;
        },
        (error: unknown) => {
          this.#set(sourceId, failed);
          throw error;
        },
      )
      .finally(() => this.#pending.delete(sourceId));
    this.#pending.set(sourceId, request);
    return request;
  }

  loadState = (sourceId: string): RecordsLoad =>
    this.#loads.get(sourceId) ?? loadingRecords;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #set(sourceId: string, state: RecordsLoad) {
    this.#loads.set(sourceId, state);
    for (const listener of this.#listeners) listener();
  }
}
