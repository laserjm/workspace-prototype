"use client";

import { useState } from "react";
import type { ModelProvider } from "@/modules/agent/contracts";
import {
  acknowledgeWake,
  continueThread,
  countTurn,
  placementOf,
  restore,
  settle,
  snooze,
  snoozeRefusal,
  withPlacement,
  type StartThreadInput,
  type ThreadListItem,
  type ThreadChange,
  type ThreadPlacement,
} from "@/modules/threads/contracts";
import { forkThreadAction, placeThreadAction, startThreadAction } from "../actions";
import { callAction, isRefusal } from "./use-action";
import { useSnoozeWake } from "./use-snooze-wake";

/**
 * The user's threads in this browser. A new thread and a fork are stored on the server first.
 * Settle, snooze, restore, undo and acknowledging a wake show at once through a rule from the
 * module's contracts and are then stored; a thread the server would not change goes back where
 * it was, and
 * `onPlacementNotStored` says so. A snooze wakes here at its deadline, and the server reads it as
 * woken from then on. The conversation is not here: the open thread's chat loads it from the
 * server (`ThreadPanel`); a thread only counts the questions it is sent.
 */
export function useThreads(
  initialThreads: ThreadListItem[],
  { onPlacementNotStored }: { onPlacementNotStored?: () => void } = {},
) {
  const [threads, setThreads] = useState(initialThreads);
  useSnoozeWake(threads, setThreads);

  function update(id: string, change: (thread: ThreadListItem) => ThreadListItem) {
    setThreads((previous) =>
      previous.map((thread) => (thread.id === id ? change(thread) : thread)),
    );
  }

  /** Stores a change already shown; `before` is the thread as it was. */
  function store(before: ThreadListItem, change: ThreadChange) {
    void callAction(placeThreadAction, { threadId: before.id, change }).then(
      (answer) => {
        if (!isRefusal(answer)) return;
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

    /** Snoozes the thread until `until`; why not, when it can't be (`snoozeRefusal`). */
    snoozeThread(thread: ThreadListItem, until: Date, working: boolean) {
      const refused = snoozeRefusal(until, new Date(), working);
      if (refused) return refused;
      const { snoozedUntil } = snooze(thread, until);
      update(thread.id, (latest) => withPlacement(latest, { snoozedUntil }));
      store(thread, { kind: "snooze", until: until.toISOString() });
      return undefined;
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
    async startThread(input: StartThreadInput): Promise<ThreadListItem | null> {
      const started = await callAction(startThreadAction, input);
      if (isRefusal(started)) return null;
      setThreads((previous) => [started, ...previous]);
      return started;
    },

    /** Asking again; the caller sends only when no response is in flight. */
    continueThread(thread: ThreadListItem, provider: ModelProvider) {
      update(thread.id, (latest) => continueThread(latest, provider));
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
      thread: ThreadListItem,
      throughMessageId: string,
    ): Promise<ThreadListItem | null> {
      const forked = await callAction(forkThreadAction, {
        fromThreadId: thread.id,
        id: crypto.randomUUID(),
        throughMessageId,
      });
      if (isRefusal(forked)) return null;
      setThreads((previous) => [forked, ...previous]);
      return forked;
    },
  };
}
