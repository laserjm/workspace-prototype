"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { type Thread } from "@/modules/threads/contracts";
import { isWakeDue, wake } from "@/modules/threads/contracts";

/** Wakes snoozed threads at their deadlines, and when the tab returns to the foreground. */
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
      const now = new Date();
      setThreads((previous) =>
        previous.some((thread) => isWakeDue(thread, now))
          ? previous.map((thread) =>
              isWakeDue(thread, now) ? wake(thread, now) : thread,
            )
          : previous,
      );
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
