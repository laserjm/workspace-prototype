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
};

export const initialThreads: Thread[] = [
  {
    id: "issue-366",
    project: "laserjm/screenerhub2",
    kind: "rocket",
    title: "Resolve Issue 366",
    branch: "t3/issue-366",
    age: "",
    changes: 13,
    done: true,
    provider: "claude",
  },
  {
    id: "convention-migration",
    project: "laserjm/screener-hub",
    kind: "chart",
    title: "Plan Next.js Convention Migration",
    branch: "migration/nextjs-conventions",
    age: "1h",
    changes: 3,
    provider: "openai",
  },
  {
    id: "structural-guardrails",
    project: "conventions",
    kind: "conventions",
    title: "Structural Guardrails and Screen Architecture",
    branch: "main",
    age: "14h",
    changes: 7,
    provider: "claude",
  },
  {
    id: "review-guardrails",
    project: "conventions",
    kind: "conventions",
    title: "Review Structural Guardrails and Tooling",
    branch: "rebuild/profiles-and-tooling",
    age: "1d",
    changes: 7,
    provider: "claude",
  },
  {
    id: "api-architecture",
    project: "yt-automation",
    kind: "automation",
    title: "Document API Architecture as Linear Issues",
    branch: "main",
    age: "1d",
    provider: "claude",
  },
  {
    id: "module-architecture",
    project: "laserjm/screenerhub2",
    kind: "rocket",
    title: "Assess Deep Module Architecture",
    branch: "main",
    age: "1d",
    provider: "claude",
  },
];

export const initialProjects = [
  "workspace-prototype",
  "laserjm/screenerhub2",
  "laserjm/screener-hub",
  "conventions",
  "yt-automation",
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
