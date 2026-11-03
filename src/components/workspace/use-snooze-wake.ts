"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { Thread } from "./workspace-data";

export function useSnoozeWake(
  threads: Thread[],
  setThreads: Dispatch<SetStateAction<Thread[]>>,
) {
  useEffect(() => {
    const deadlines = threads
      .map((thread) => Date.parse(thread.snoozedUntil ?? ""))
      .filter(Number.isFinite);
    if (!deadlines.length) return;

    function wakeDueThreads() {
      const now = Date.now();
      setThreads((previous) => {
        let changed = false;
        const next = previous.map((thread) => {
          if (!thread.snoozedUntil || Date.parse(thread.snoozedUntil) > now)
            return thread;
          changed = true;
          return {
            ...thread,
            snoozedUntil: undefined,
            settledAt: undefined,
            wokeAt: new Date(now).toISOString(),
          };
        });
        return changed ? next : previous;
      });
    }

    // Schedule the nearest deadline precisely; long waits are capped to the JS timer limit.
    let timer: ReturnType<typeof setTimeout>;
    const nextDeadline = Math.min(...deadlines);
    function schedule() {
      timer = setTimeout(
        () => {
          wakeDueThreads();
          if (Date.now() < nextDeadline) schedule();
        },
        Math.min(Math.max(0, nextDeadline - Date.now()), 2_147_483_647),
      );
    }
    schedule();
    window.addEventListener("focus", wakeDueThreads);
    document.addEventListener("visibilitychange", wakeDueThreads);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", wakeDueThreads);
      document.removeEventListener("visibilitychange", wakeDueThreads);
    };
  }, [threads, setThreads]);
}
