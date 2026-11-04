"use client";

import { useEffect, useRef, useState } from "react";
import type { Result } from "@conventions/nextjs/core";
import type {
  ResponseNotFinished,
  SnoozeTimeInPast,
  ThreadStillWorking,
} from "../domain/errors";
import {
  acknowledgeWake,
  addFollowUp,
  completeResponse,
  forkThread,
  restore,
  settle,
  snooze,
  startThread,
  withPlacement,
  type NewFollowUp,
  type NewThread,
  type Thread,
  type ThreadPlacement,
} from "../domain/thread";
import { useSnoozeWake } from "./use-snooze-wake";

/** How long a sample response takes to prepare, so the running timer can be seen. */
const SAMPLE_PREPARATION_MS = 2400;

/**
 * The threads of this browser session. Every change goes through a domain function; the
 * session keeps them in memory until threads are stored per owner.
 */
export function useThreads(initialThreads: Thread[]) {
  const [threads, setThreads] = useState(initialThreads);
  const responseTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useSnoozeWake(threads, setThreads);

  useEffect(() => {
    const timers = responseTimers.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  function update(id: string, change: (thread: Thread) => Thread) {
    setThreads((previous) =>
      previous.map((thread) => (thread.id === id ? change(thread) : thread)),
    );
  }

  function prepareSampleResponse(threadId: string, responseIndex: number) {
    const timer = setTimeout(() => {
      responseTimers.current.delete(timer);
      update(threadId, (thread) =>
        completeResponse(thread, responseIndex, new Date()),
      );
    }, SAMPLE_PREPARATION_MS);
    responseTimers.current.add(timer);
  }

  return {
    threads,

    settleThread(id: string) {
      update(id, (thread) => settle(thread, new Date()));
    },

    snoozeThread(
      thread: Thread,
      until: Date,
    ): Result<Thread, SnoozeTimeInPast | ThreadStillWorking> {
      const result = snooze(thread, until, new Date());
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
      const thread = startThread(input, new Date());
      setThreads((previous) => [thread, ...previous]);
      if (thread.scope) prepareSampleResponse(thread.id, 0);
      return thread;
    },

    addFollowUp(
      thread: Thread,
      input: NewFollowUp,
    ): Result<Thread, ThreadStillWorking> {
      const now = new Date();
      const result = addFollowUp(thread, input, now);
      if (!result.ok) return result;
      update(thread.id, (latest) => {
        const next = addFollowUp(latest, input, now);
        return next.ok ? next.value : latest;
      });
      if (thread.scope)
        prepareSampleResponse(thread.id, (thread.followUps?.length ?? 0) + 1);
      return result;
    },

    forkThread(
      thread: Thread,
      responseIndex: number,
    ): Result<Thread, ResponseNotFinished> {
      const result = forkThread(thread, responseIndex, crypto.randomUUID());
      if (result.ok) setThreads((previous) => [result.value, ...previous]);
      return result;
    },
  };
}
