"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecordSearchPage } from "@/modules/integrations";

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
  signal?: AbortSignal,
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

/** One search's answer, with every page loaded so far. */
type Loaded = RecordSearchPage & {
  /** The search this answers: `(connection, q, toggles)`. */
  key: string;
  connectionId: string;
};

const keyOf = ({ connectionId, text, type, includeClosed }: SearchInput) =>
  JSON.stringify([connectionId, text.trim(), type, includeClosed]);

export type SearchCache = {
  get(key: string): Loaded | undefined;
  put(loaded: Loaded): void;
};

/**
 * The answers of the searches run while the attach dialog is open, by `(connection, q, toggles)`,
 * so going back to an earlier search is instant (#43). It goes with the dialog.
 */
export function useSearchCache(): SearchCache {
  const [answers, setAnswers] = useState<ReadonlyMap<string, Loaded>>(() => new Map());
  const put = useCallback(
    (loaded: Loaded) => setAnswers((previous) => new Map(previous).set(loaded.key, loaded)),
    [],
  );
  return useMemo(() => ({ get: (key) => answers.get(key), put }), [answers, put]);
}

/**
 * Searches one connection's records as the dialog's field and toggles change, after a pause, and
 * pages on with `loadMore`. A newer search aborts the one in flight, so an older answer never
 * replaces a newer one, and a search answered before comes from `cache` without asking again.
 * While a search runs, or when it fails, the last answer stays. A disabled search asks nothing.
 */
export function useRecordSearch(
  input: SearchInput,
  { cache, enabled, onError }: { cache: SearchCache; enabled: boolean; onError?: (error: SearchError) => void },
) {
  const { connectionId, text, type, includeClosed } = input;
  const key = keyOf(input);
  const current = cache.get(key);
  const cached = current !== undefined;
  const { put } = cache;
  // The last answer shown, which stays while a search runs or after it failed.
  const [lastKey, setLastKey] = useState<string>();
  if (current && lastKey !== key) setLastKey(key);
  const last = lastKey === undefined ? undefined : cache.get(lastKey);
  const shown = current ?? (last?.connectionId === connectionId ? last : undefined);
  const [failure, setFailure] = useState<{ key: string; error: SearchError }>();
  const error = failure?.key === key ? failure.error : undefined;
  const [loadingMore, setLoadingMore] = useState<string>();
  const reportError = useRef(onError);
  useEffect(() => {
    reportError.current = onError;
  });

  useEffect(() => {
    if (!enabled || cached) return;
    const controller = new AbortController();
    const search = { connectionId, text, type, includeClosed };
    const timer = setTimeout(async () => {
      const answer = await fetchPage(search, undefined, controller.signal);
      if (controller.signal.aborted) return;
      if (answer.ok) {
        put({ key, connectionId, ...answer.page });
        setFailure(undefined);
      } else {
        setFailure({ key, error: answer.error });
        reportError.current?.(answer.error);
      }
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, cached, put, key, connectionId, text, type, includeClosed]);

  async function loadMore() {
    if (!current?.next || loadingMore === key) return;
    const from = current;
    setLoadingMore(from.key);
    const answer = await fetchPage(input, from.next);
    setLoadingMore((loading) => (loading === from.key ? undefined : loading));
    if (!answer.ok) {
      setFailure({ key: from.key, error: answer.error });
      reportError.current?.(answer.error);
      return;
    }
    const known = new Set(from.results.map((result) => `${result.type}:${result.key}`));
    put({
      ...from,
      ...answer.page,
      // The last page answers without `next`, which must not keep the one before.
      next: answer.page.next,
      results: [
        ...from.results,
        ...answer.page.results.filter((result) => !known.has(`${result.type}:${result.key}`)),
      ],
    });
  }

  return {
    loading: enabled && !current && !error,
    results: shown?.results ?? [],
    total: current?.total,
    reach: shown?.reach,
    narrowedTo: shown?.narrowedTo,
    error,
    hasMore: Boolean(current?.next),
    loadingMore: loadingMore === key,
    loadMore,
  };
}
