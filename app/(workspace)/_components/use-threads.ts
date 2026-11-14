"use client";

import { useState } from "react";
import { callAction } from "@/lib/actions/client";
import type { Result } from "@/lib/result";
import type { ModelProvider } from "@/modules/agent/contracts";
import {
  forkThreadAction,
  placeThreadAction,
  startThreadAction,
} from "@/modules/threads/actions";
import {
  continueThread,
  countTurn,
  type SnoozeTimeInPast,
  type StartThreadInput,
  type Thread,
  type ThreadChange,
  type ThreadPlacement,
  type ThreadStillWorking,
} from "@/modules/threads/contracts";
import {
  acknowledgeWake,
  placementOf,
  restore,
  settle,
  snooze,
  withPlacement,
} from "@/modules/threads/placement";
import { useSnoozeWake } from "./use-snooze-wake";

/**
 * The user's threads in this browser. A new thread and a fork are stored on the server first.
 * Settle, snooze, restore, undo and acknowledging a wake show at once through a domain function
 * and are then stored; a thread the server would not change goes back where it was, and
 * `onPlacementNotStored` says so. A snooze wakes here at its deadline, and the server reads it as
 * woken from then on. The conversation is not here: the open thread's chat loads it from the
 * server (`ThreadConversation`); a thread only counts the questions it is sent.
 */
export function useThreads(
  initialThreads: Thread[],
  { onPlacementNotStored }: { onPlacementNotStored?: () => void } = {},
) {
  const [threads, setThreads] = useState(initialThreads);
  useSnoozeWake(threads, setThreads);

  function update(id: string, change: (thread: Thread) => Thread) {
    setThreads((previous) =>
      previous.map((thread) => (thread.id === id ? change(thread) : thread)),
    );
  }

  /** Stores a change already shown; `before` is the thread as it was. */
  function store(before: Thread, change: ThreadChange) {
    void callAction(placeThreadAction, { threadId: before.id, change }).then(
      (result) => {
        if (result.ok) return;
        update(before.id, (latest) =>
          withPlacement(latest, placementOf(before)),
        );
        onPlacementNotStored?.();
      },
    );
  }

  function find(id: string) {
    return threads.find((thread) => thread.id === id);
  }

  return {
    threads,

    settleThread(id: string) {
      const before = find(id);
      if (!before) return;
      update(id, (thread) => settle(thread, new Date()));
      store(before, { kind: "settle" });
    },

    snoozeThread(
      thread: Thread,
      until: Date,
      working: boolean,
    ): Result<Thread, SnoozeTimeInPast | ThreadStillWorking> {
      const result = snooze(thread, until, new Date(), working);
      if (result.ok) {
        update(thread.id, (latest) =>
          withPlacement(latest, { snoozedUntil: result.value.snoozedUntil }),
        );
        store(thread, { kind: "snooze", until: until.toISOString() });
      }
      return result;
    },

    restoreThread(id: string) {
      const before = find(id);
      if (!before) return;
      update(id, restore);
      store(before, { kind: "restore" });
    },

    /** Puts a thread back where it was before a settle, snooze or restore. */
    returnThread(id: string, placement: ThreadPlacement) {
      const before = find(id);
      if (!before) return;
      update(id, (thread) => withPlacement(thread, placement));
      store(before, { kind: "return", placement });
    },

    acknowledgeWake(id: string) {
      const before = find(id);
      if (!before?.wokeAt) return;
      update(id, acknowledgeWake);
      store(before, { kind: "acknowledgeWake" });
    },

    /** Stores the thread, then lists it. Null when the server refused or could not be reached. */
    async startThread(input: StartThreadInput): Promise<Thread | null> {
      const started = await callAction(startThreadAction, input);
      if (!started.ok) return null;
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

    /** Counts a question sent in the thread; the server counts it from the stored messages. */
    countTurn(id: string, attachmentCount: number) {
      update(id, (thread) => countTurn(thread, attachmentCount));
    },

    /**
     * Stores a fork through response `throughMessageId`, then lists it. Null when the server
     * refused (the response is not stored yet) or could not be reached.
     */
    async forkThread(
      thread: Thread,
      throughMessageId: string,
    ): Promise<Thread | null> {
      const forked = await callAction(forkThreadAction, {
        fromThreadId: thread.id,
        id: crypto.randomUUID(),
        throughMessageId,
      });
      if (!forked.ok) return null;
      setThreads((previous) => [forked.value, ...previous]);
      return forked.value;
    },
  };
}
