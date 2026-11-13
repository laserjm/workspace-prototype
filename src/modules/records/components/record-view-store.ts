"use client";

import { err, ok, type Result } from "@/lib/result";
import type { RecordError, RecordRead } from "@/modules/integrations";

/** Which record a view reads. */
export type ViewRecordRef = { id: string; connectionId: string; type: string; key: string };

/** Why a view's record did not load, as the detail route said, with the record's page if known. */
export type ViewError = {
  kind: RecordError["kind"];
  message: string;
  retryAt?: string;
  url?: string;
};

export type ViewLoad =
  | { status: "loading" }
  | { status: "ready"; read: RecordRead; refreshing: boolean }
  | { status: "failed"; error: ViewError };

/** Reads a view's record; never rejects. */
export type FetchRecord = (view: ViewRecordRef) => Promise<Result<RecordRead, ViewError>>;

/** Until a view's record is here; one value, so snapshots compare equal. */
const loading: ViewLoad = { status: "loading" };

const UNREACHABLE: ViewError = {
  kind: "unreachable",
  message: "The record could not be loaded. Try again.",
};

/** One record from the detail route, with the user's connection. */
const fetchRecord: FetchRecord = async ({ connectionId, type, key }) => {
  try {
    const response = await fetch(
      `/api/connections/${encodeURIComponent(connectionId)}/records/${encodeURIComponent(type)}/${encodeURIComponent(key)}`,
    );
    const body = await response.json().catch(() => undefined);
    if (response.ok && body?.summary) return ok(body as RecordRead);
    return err(typeof body?.error?.kind === "string" ? (body.error as ViewError) : UNREACHABLE);
  } catch {
    return err(UNREACHABLE);
  }
};

/**
 * The records the panel's views show, by view id, for the page's lifetime (ADR 0003 §3). A view
 * reads its record the first time it is shown (`load`) and not again until it is refreshed or
 * retried (`refresh`); reads in flight are shared. Lives outside React state, which follows it
 * through `subscribe`.
 */
export class RecordViewStore {
  #loads = new Map<string, ViewLoad>();
  #pending = new Map<string, Promise<void>>();
  #listeners = new Set<() => void>();
  #fetch: FetchRecord;

  constructor(fetch: FetchRecord = fetchRecord) {
    this.#fetch = fetch;
  }

  /** Reads the view's record unless it has been read, or is being read. */
  load(view: ViewRecordRef) {
    if (this.#loads.has(view.id) || this.#pending.has(view.id)) return;
    this.#read(view);
  }

  /** Reads the view's record again, showing what it has meanwhile; a refusal shows loading. */
  refresh(view: ViewRecordRef) {
    if (this.#pending.has(view.id)) return;
    this.#read(view);
  }

  state = (id: string): ViewLoad => this.#loads.get(id) ?? loading;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #read(view: ViewRecordRef) {
    const current = this.#loads.get(view.id);
    this.#set(
      view.id,
      current?.status === "ready" ? { ...current, refreshing: true } : loading,
    );
    const request = this.#fetch(view).then((read) => {
      this.#pending.delete(view.id);
      this.#set(
        view.id,
        read.ok
          ? { status: "ready", read: read.value, refreshing: false }
          : { status: "failed", error: read.error },
      );
    });
    this.#pending.set(view.id, request);
  }

  #set(id: string, state: ViewLoad) {
    this.#loads.set(id, state);
    for (const listener of this.#listeners) listener();
  }
}
