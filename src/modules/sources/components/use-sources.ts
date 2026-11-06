"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { bug } from "@conventions/nextjs/core";
import { findSource, unavailableSource, type Source } from "../contracts";
import {
  loadingRecords,
  type RecordsLoad,
  type SourceRecordsStore,
} from "./source-records-store";

export const SourcesContext = createContext<{
  sources: readonly Source[];
  records: SourceRecordsStore;
} | null>(null);

function useSourcesContext() {
  return (
    useContext(SourcesContext) ??
    bug("useSources is called outside SourcesProvider")
  );
}

/** Nothing to read: the source is not among the user's. One value, so snapshots compare equal. */
const unavailable: RecordsLoad = { status: "failed" };

/** The sources the page loaded, provided by `SourcesProvider`. */
export function useSources() {
  const { sources, records } = useSourcesContext();
  return {
    sources,
    /**
     * The source with this id; a stand-in marked `unavailable` when the user no longer has it,
     * so a thread whose connection is gone still shows.
     */
    sourceById(id: string): Source {
      return findSource(sources, id) ?? unavailableSource(id);
    },
    /** A source's first page of records, loaded once per page; rejects when they do not load. */
    loadRecords(sourceId: string) {
      return records.load(sourceId);
    },
    /** Reads the source's next page onto the loaded ones. */
    loadMoreRecords(sourceId: string) {
      return records.loadMore(sourceId);
    },
  };
}

/** Lists a source's records, the first page when a view first needs them, and says how that went. */
export function useSourceRecords(sourceId: string): RecordsLoad {
  const { sources, records } = useSourcesContext();
  const known = Boolean(findSource(sources, sourceId));
  useEffect(() => {
    // A failed load shows as `failed`; nothing else waits for it here.
    if (known) records.load(sourceId).catch(() => undefined);
  }, [records, sourceId, known]);
  const load = useSyncExternalStore(
    records.subscribe,
    () => records.loadState(sourceId),
    () => loadingRecords,
  );
  return known ? load : unavailable;
}

/**
 * A thread's records by id, read fresh from the source once per page, wherever they are in it:
 * what the explorer and the context card show.
 */
export function useScopedRecords(
  sourceId: string,
  recordIds: readonly string[],
): RecordsLoad {
  const { sources, records } = useSourcesContext();
  const known = Boolean(findSource(sources, sourceId));
  // The ids as one value, so a new array with the same ids reads nothing again.
  const key = recordIds.join("\u0000");
  useEffect(() => {
    if (known)
      records
        .loadScoped(sourceId, key ? key.split("\u0000") : [])
        .catch(() => undefined);
  }, [records, sourceId, key, known]);
  const load = useSyncExternalStore(
    records.subscribe,
    () => records.scopedState(sourceId, recordIds),
    () => loadingRecords,
  );
  return known ? load : unavailable;
}
