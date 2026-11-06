"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { bug } from "@conventions/nextjs/core";
import { findSource, type Source } from "../contracts";
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

/** The sources the page loaded, provided by `SourcesProvider`. */
export function useSources() {
  const { sources, records } = useSourcesContext();
  return {
    sources,
    sourceById(id: string) {
      return findSource(sources, id) ?? bug(`unknown source '${id}'`);
    },
    /** A source's records, loaded once per page; rejects when they do not load. */
    loadRecords(sourceId: string) {
      return records.load(sourceId);
    },
  };
}

/** Loads a source's records the first time a view needs them, and says how that went. */
export function useSourceRecords(sourceId: string): RecordsLoad {
  const { records } = useSourcesContext();
  useEffect(() => {
    // A failed load shows as `failed`; nothing else waits for it here.
    records.load(sourceId).catch(() => undefined);
  }, [records, sourceId]);
  return useSyncExternalStore(
    records.subscribe,
    () => records.loadState(sourceId),
    () => loadingRecords,
  );
}
