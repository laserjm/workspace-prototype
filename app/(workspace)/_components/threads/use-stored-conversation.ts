"use client";

import { useEffect, useState } from "react";
import type { WorkspaceUIMessage } from "@/modules/agent/contracts";

export type StoredConversation =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; messages: WorkspaceUIMessage[] };

/**
 * The thread's conversation as the database holds it, fetched from
 * `GET /api/threads/[id]/messages` each time the thread opens: the browser
 * keeps no copy between openings. A thread this page has just started has
 * nothing stored yet (`opensEmpty`, read once) and opens empty.
 */
export function useStoredConversation(threadId: string, opensEmpty: boolean) {
  const [empty] = useState(opensEmpty);
  const [attempt, setAttempt] = useState(0);
  const [conversation, setConversation] = useState<StoredConversation>(() =>
    empty ? { state: "ready", messages: [] } : { state: "loading" },
  );

  useEffect(() => {
    if (empty) return;
    const controller = new AbortController();
    fetch(`/api/threads/${threadId}/messages`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const messages: WorkspaceUIMessage[] = await response.json();
        setConversation({ state: "ready", messages });
      })
      .catch(() => {
        if (!controller.signal.aborted) setConversation({ state: "failed" });
      });
    return () => controller.abort();
  }, [threadId, attempt, empty]);

  return {
    conversation,
    reload() {
      setConversation({ state: "loading" });
      setAttempt((count) => count + 1);
    },
  };
}
