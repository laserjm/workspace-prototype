import type { Thread } from "@/modules/threads";

const finished = {
  startedAt: "2026-11-03T11:05:00.000Z",
  completedAt: "2026-11-03T11:06:46.000Z",
};

export function aThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    project: "workspace-prototype",
    title: "Sprint 24 summary",
    branch: "main",
    age: "2h",
    provider: "claude",
    prompt: "Create a summary of these 5 tickets.",
    scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125"] },
    responseTiming: finished,
    ...overrides,
  };
}

/** A thread whose latest response is still being prepared. */
export function aWorkingThread(overrides: Partial<Thread> = {}): Thread {
  return aThread({
    responseTiming: {
      startedAt: "2026-11-04T09:00:00.000Z",
      completedAt: null,
    },
    ...overrides,
  });
}
