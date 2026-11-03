import { defaultScope, type SourceScope } from "./source-data";
import type { ResponseTiming } from "./response-timing";
import type { SkillId } from "./skill-data";

export type ProjectKind =
  "rocket" | "chart" | "conventions" | "automation" | "workspace";

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
  provider?: "claude" | "openai";
  prompt?: string;
  attachments?: string[];
  skillId?: SkillId;
  responseTiming: ResponseTiming;
  followUps?: {
    text: string;
    attachments: string[];
    skillId?: SkillId;
    responseTiming: ResponseTiming;
  }[];
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
    prompt: "Create a summary of these 5 tickets.",
    scope: defaultScope("jira"),
    responseTiming: {
      startedAt: "2026-11-03T11:05:00.000Z",
      completedAt: "2026-11-03T11:06:46.000Z",
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
    prompt: "Summarize these 3 pages and their key decisions.",
    scope: defaultScope("confluence"),
    responseTiming: {
      startedAt: "2026-11-03T08:30:00.000Z",
      completedAt: "2026-11-03T08:30:42.000Z",
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
    prompt: "What are the risks in these 4 items?",
    scope: defaultScope("codebeamer"),
    responseTiming: {
      startedAt: "2026-11-02T14:10:00.000Z",
      completedAt: "2026-11-02T14:11:12.000Z",
    },
  },
];

export const initialProjects = [
  "workspace-prototype",
  "enterprise-platform",
  "battery-management",
];

export const models = [
  {
    id: "opus",
    label: "Opus 5.5",
    effort: "High",
    provider: "claude" as const,
  },
  {
    id: "sonnet",
    label: "Sonnet 5.5",
    effort: "High",
    provider: "claude" as const,
  },
  { id: "gpt", label: "GPT-6.1", effort: "High", provider: "openai" as const },
];
