import type { Thread } from "@/modules/threads";

export function aThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    project: "workspace-prototype",
    title: "Sprint 24 summary",
    branch: "main",
    age: "2h",
    provider: "claude",
    scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125"] },
    sample: {
      prompt: "Create a summary of these 5 tickets.",
      responseTiming: {
        startedAt: "2026-11-03T11:05:00.000Z",
        completedAt: "2026-11-03T11:06:46.000Z",
      },
    },
    ...overrides,
  };
}
