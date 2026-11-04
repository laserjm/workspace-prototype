// The ready-made sessions the prototype starts with, one per sample source. Their scopes name
// every record of the source in `modules/sources/infra/sample.source-catalog.ts`.
import type { Thread } from "../domain/thread";

export const sampleSeedThreads: Thread[] = [
  {
    id: "jira-sprint-summary",
    project: "workspace-prototype",
    title: "Sprint 24 summary",
    branch: "main",
    age: "2h",
    provider: "claude",
    prompt: "Create a summary of these 5 tickets.",
    scope: {
      sourceId: "jira",
      recordIds: ["PLAT-124", "PLAT-125", "PLAT-126", "PLAT-127", "PLAT-128"],
    },
    responseTiming: {
      startedAt: "2026-11-03T11:05:00.000Z",
      completedAt: "2026-11-03T11:06:46.000Z",
    },
  },
  {
    id: "confluence-knowledge-review",
    project: "workspace-prototype",
    title: "Review platform knowledge",
    branch: "main",
    age: "5h",
    provider: "claude",
    prompt: "Summarize these 3 pages and their key decisions.",
    scope: {
      sourceId: "confluence",
      recordIds: ["DOC-201", "DOC-202", "DOC-203"],
    },
    responseTiming: {
      startedAt: "2026-11-03T08:30:00.000Z",
      completedAt: "2026-11-03T08:30:42.000Z",
    },
  },
  {
    id: "codebeamer-release-readiness",
    project: "workspace-prototype",
    title: "Release 2.4 risks",
    branch: "main",
    age: "1d",
    provider: "claude",
    prompt: "What are the risks in these 4 items?",
    scope: {
      sourceId: "codebeamer",
      recordIds: ["REQ-401", "REQ-402", "TEST-403", "REQ-404"],
    },
    responseTiming: {
      startedAt: "2026-11-02T14:10:00.000Z",
      completedAt: "2026-11-02T14:11:12.000Z",
    },
  },
];
