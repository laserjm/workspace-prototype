import { defaultScope, type SourceScope } from "./source-data";

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
  provider?: "claude" | "openai";
  prompt?: string;
  attachments?: string[];
  followUps?: { text: string; attachments: string[] }[];
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
