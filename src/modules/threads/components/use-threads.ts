"use client";

import { useState } from "react";
import type { Result } from "@conventions/nextjs/core";
import type { SnoozeTimeInPast, ThreadStillWorking } from "../domain/errors";
import { forkThreadAction, startThreadAction } from "../actions";
import type { StartThreadInput } from "../contracts";
import {
  acknowledgeWake,
  continueThread,
  restore,
  settle,
  snooze,
  withPlacement,
  type ModelProvider,
  type Thread,
  type ThreadPlacement,
} from "../domain/thread";
import { useSnoozeWake } from "./use-snooze-wake";

/**
 * The user's threads in this browser. A new thread and a fork are stored on the server first.
 * Settle, snooze and wake are not stored yet: they go through a domain function and last for the
 * session. Conversations live in the `ChatStore`; `working` comes from there.
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

    /** Stores the thread, then lists it. Null when the server refused or could not be reached. */
    async startThread(input: StartThreadInput): Promise<Thread | null> {
      const result = await startThreadAction(input).catch(() => undefined);
      const started = result?.data;
      if (!started?.ok) return null;
      setThreads((previous) => [started.value, ...previous]);
      return started.value;
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

    /**
     * Stores a fork through response `throughMessageId`, then lists it. Null when the server
     * refused (the response is not stored yet) or could not be reached.
     */
    async forkThread(
      thread: Thread,
      throughMessageId: string,
    ): Promise<Thread | null> {
      const result = await forkThreadAction({
        fromThreadId: thread.id,
        id: crypto.randomUUID(),
        throughMessageId,
      }).catch(() => undefined);
      const forked = result?.data;
      if (!forked?.ok) return null;
      setThreads((previous) => [forked.value, ...previous]);
      return forked.value;
    },
  };
}
