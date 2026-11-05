import type { Thread } from "@/modules/threads";

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
