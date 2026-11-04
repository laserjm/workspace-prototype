"use client";

import { useState } from "react";
import type { Result } from "@conventions/nextjs/core";
import type { SnoozeTimeInPast, ThreadStillWorking } from "../domain/errors";
import {
  acknowledgeWake,
  continueThread,
  forkThread,
  restore,
  settle,
  snooze,
  startThread,
  withPlacement,
  type ModelProvider,
  type NewThread,
  type Thread,
  type ThreadPlacement,
} from "../domain/thread";
import { useSnoozeWake } from "./use-snooze-wake";

/**
 * The threads of this browser session. Every change goes through a domain function; the
 * session keeps them in memory until threads are stored per owner. Conversations live in
 * the `ChatStore`; `working` comes from there.
 */
export function useThreads(initialThreads: Thread[]) {
  const [threads, setThreads] = useState(initialThreads);
  useSnoozeWake(threads, setThreads);

  function update(id: string, change: (thread: Thread) => Thread) {
    setThreads((previous) =>
      previous.map((thread) => (thread.id === id ? change(thread) : thread)),
    );
  }

  return {
    threads,

    settleThread(id: string) {
      update(id, (thread) => settle(thread, new Date()));
    },

    snoozeThread(
      thread: Thread,
      until: Date,
      working: boolean,
    ): Result<Thread, SnoozeTimeInPast | ThreadStillWorking> {
      const result = snooze(thread, until, new Date(), working);
      if (result.ok)
        update(thread.id, (latest) =>
          withPlacement(latest, { snoozedUntil: result.value.snoozedUntil }),
        );
      return result;
    },

    restoreThread(id: string) {
      update(id, restore);
    },

    /** Puts a thread back where it was before a settle, snooze or restore. */
    returnThread(id: string, placement: ThreadPlacement) {
      update(id, (thread) => withPlacement(thread, placement));
    },

    acknowledgeWake(id: string) {
      update(id, acknowledgeWake);
    },

    startThread(input: NewThread) {
      const thread = startThread(input);
      setThreads((previous) => [thread, ...previous]);
      return thread;
    },

    continueThread(
      thread: Thread,
      provider: ModelProvider,
      working: boolean,
    ): Result<Thread, ThreadStillWorking> {
      const result = continueThread(thread, provider, working);
      if (result.ok)
        update(thread.id, (latest) => {
          const next = continueThread(latest, provider, working);
          return next.ok ? next.value : latest;
        });
      return result;
    },

    forkThread(thread: Thread, responseIndex: number) {
      const fork = forkThread(thread, responseIndex, crypto.randomUUID());
      setThreads((previous) => [fork, ...previous]);
      return fork;
    },
  };
}
