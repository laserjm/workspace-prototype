import { randomUUID } from "node:crypto";
import type { WorkspaceUIMessage } from "@/modules/agent";
import type { StartThreadInput, Thread } from "@/modules/threads";

export function aThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: null,
    title: "Sprint 24 summary",
    branch: "main",
    createdAt: "2026-11-03T11:05:00.000Z",
    provider: "claude",
    scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125"] },
    ...overrides,
  };
}

/** The first message of a new thread, under a fresh id, as the browser sends it. */
export function aNewThread(
  overrides: Partial<StartThreadInput> = {},
): StartThreadInput {
  return {
    id: randomUUID(),
    projectId: null,
    prompt: "Summarize these tickets",
    provider: "claude",
    scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125"] },
    ...overrides,
  };
}

/** Two questions and their replies, with the metadata the chat stores. */
export const aConversation: WorkspaceUIMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Summarize these tickets" }],
    metadata: { createdAt: "2026-11-05T09:00:00.000Z" },
  },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "Two tickets are blocked." }],
    metadata: { modelId: "opus", completedAt: "2026-11-05T09:00:05.000Z" },
  },
  {
    id: "u2",
    role: "user",
    parts: [{ type: "text", text: "Which ones?" }],
  },
  {
    id: "a2",
    role: "assistant",
    parts: [{ type: "text", text: "PLAT-124 and PLAT-125." }],
  },
];
