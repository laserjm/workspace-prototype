"use client";

import { useEffect, useRef, useState } from "react";
import type { RecordSearchPage, RecordSummary } from "@/modules/integrations";

/** Typing settles for this long before the dialog searches. */
const PAUSE_MS = 250;

/** What the record routes answer when they refuse (`app/api/connections/…/record-error.ts`). */
export type SearchError = { kind: string; message: string; retryAt?: string };

export type SearchInput = {
  connectionId: string;
  text: string;
  /** One declared type; all when empty. */
  type: string;
  includeClosed: boolean;
};

type Answer = { ok: true; page: RecordSearchPage } | { ok: false; error: SearchError };

const UNREACHABLE: SearchError = {
  kind: "unreachable",
  message: "The server could not be reached. Check your connection and try again.",
};

async function fetchPage(
  { connectionId, text, type, includeClosed }: SearchInput,
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<Answer> {
  const params = new URLSearchParams({
    ...(text.trim() ? { q: text.trim() } : {}),
    ...(type ? { type } : {}),
    ...(includeClosed ? { closed: "1" } : {}),
    ...(cursor ? { cursor } : {}),
  });
  try {
    const response = await fetch(
      `/api/connections/${encodeURIComponent(connectionId)}/records?${params}`,
      { signal },
    );
    const body = await response.json().catch(() => undefined);
    if (response.ok) return { ok: true, page: body as RecordSearchPage };
    const error = (body as { error?: SearchError } | undefined)?.error;
    return { ok: false, error: typeof error === "object" ? error : UNREACHABLE };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

type Loaded = {
  /** The search this answers. */
  key: string;
  connectionId: string;
  results: RecordSummary[];
  next?: string;
  total?: number;
  reach?: string;
  error?: SearchError;
};

/**
 * Searches one connection's records as the dialog's field and toggles change, after a pause, and
 * pages on with `loadMore`. A newer search aborts the one in flight, so an older answer never
 * replaces a newer one. While a search runs, the last answer stays.
 */
export function useRecordSearch(input: SearchInput) {
  const { connectionId, text, type, includeClosed } = input;
  const key = JSON.stringify([connectionId, text.trim(), type, includeClosed]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const more = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const search = { connectionId, text, type, includeClosed };
    const timer = setTimeout(async () => {
      more.current?.abort();
      const answer = await fetchPage(search, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setLoadingMore(false);
      setLoaded(
        answer.ok
          ? { key, connectionId, ...answer.page }
          : { key, connectionId, results: [], error: answer.error },
      );
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, connectionId, text, type, includeClosed]);

  const current = loaded?.key === key ? loaded : undefined;
  // Another connection's answer is never shown, not even while this one loads.
  const shown = loaded?.connectionId === connectionId ? loaded : undefined;

  async function loadMore() {
    if (!current?.next || loadingMore) return;
    const controller = new AbortController();
    more.current = controller;
    setLoadingMore(true);
    const answer = await fetchPage(input, current.next, controller.signal);
    if (controller.signal.aborted) return;
    setLoadingMore(false);
    setLoaded((previous) => {
      if (previous?.key !== current.key) return previous;
      if (!answer.ok) return { ...previous, error: answer.error };
      const known = new Set(previous.results.map((result) => `${result.type}:${result.key}`));
      return {
        ...previous,
        ...answer.page,
        // The last page answers without `next`, which must not keep the one before.
        next: answer.page.next,
        error: undefined,
        results: [
          ...previous.results,
          ...answer.page.results.filter((result) => !known.has(`${result.type}:${result.key}`)),
        ],
      };
    });
  }

  return {
    loading: !current,
    results: shown?.results ?? [],
    total: shown?.total,
    reach: shown?.reach,
    error: shown?.error,
    hasMore: Boolean(current?.next),
    loadingMore,
    loadMore,
  };
}
