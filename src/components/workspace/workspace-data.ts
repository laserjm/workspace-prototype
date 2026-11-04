import { defaultScope, type SourceScope } from "@/lib/workspace/source-data";
import type { ResponseTiming } from "./response-timing";
import type { SkillId } from "@/lib/workspace/skill-data";
import type { ModelProvider } from "@/lib/chat/models";

export type ProjectKind =
  "rocket" | "chart" | "conventions" | "automation" | "workspace";

/**
 * A seeded demo turn, answered locally from the selected sample records.
 * Live turns are not stored here: they live in the thread's chat (see
 * `@/lib/chat/chat-store`).
 */
export type SampleTurn = {
  prompt: string;
  attachments?: string[];
  skillId?: SkillId;
  responseTiming: ResponseTiming;
};

/** Sidebar and session metadata. Conversation content lives in the chat store. */
export type Thread = {
  id: string;
  project: string;
  kind: ProjectKind;
  title: string;
  branch: string;
  age: string;
  changes?: number;
  done?: boolean;
  settledAt?: string;
  snoozedUntil?: string;
  wokeAt?: string;
  provider?: ModelProvider;
  sample?: SampleTurn;
  forkedFrom?: { threadId: string; title: string; responseIndex: number };
  scope?: SourceScope;
};

export const initialThreads: Thread[] = [
  {
    id: "jira-sprint-summary",
    project: "workspace-prototype",
    kind: "workspace",
    title: "Sprint 24 summary",
    branch: "main",
    age: "2h",
    provider: "claude",
    scope: defaultScope("jira"),
    sample: {
      prompt: "Create a summary of these 5 tickets.",
      responseTiming: {
        startedAt: "2026-11-03T11:05:00.000Z",
        completedAt: "2026-11-03T11:06:46.000Z",
      },
    },
  },
  {
    id: "confluence-knowledge-review",
    project: "workspace-prototype",
    kind: "workspace",
    title: "Review platform knowledge",
    branch: "main",
    age: "5h",
    provider: "claude",
    scope: defaultScope("confluence"),
    sample: {
      prompt: "Summarize these 3 pages and their key decisions.",
      responseTiming: {
        startedAt: "2026-11-03T08:30:00.000Z",
        completedAt: "2026-11-03T08:30:42.000Z",
      },
    },
  },
  {
    id: "codebeamer-release-readiness",
    project: "workspace-prototype",
    kind: "workspace",
    title: "Release 2.4 risks",
    branch: "main",
    age: "1d",
    provider: "claude",
    scope: defaultScope("codebeamer"),
    sample: {
      prompt: "What are the risks in these 4 items?",
      responseTiming: {
        startedAt: "2026-11-02T14:10:00.000Z",
        completedAt: "2026-11-02T14:11:12.000Z",
      },
    },
  },
];

export const initialProjects = [
  "workspace-prototype",
  "enterprise-platform",
  "battery-management",
];
