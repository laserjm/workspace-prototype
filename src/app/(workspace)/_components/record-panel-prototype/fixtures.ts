// PROTOTYPE, throwaway (wayfinder: "How the right-hand panel hosts several record views").
// Canned records and a canned conversation. Nothing here is fetched.

export type ViewKind =
  | "github.issue-view"
  | "github.pull-request-view"
  | "confluence.page-view";

type Base = {
  /** The view's id: kind-prefixed, like T3 Code's surfaces, so opening twice focuses. */
  id: string;
  kind: ViewKind;
  title: string;
  url: string;
  /** Simulates a record the connection cannot read. */
  fails?: string;
};

export type IssueRecord = Base & {
  kind: "github.issue-view";
  repository: string;
  number: number;
  state: "open" | "closed" | "not planned";
  author: string;
  opened: string;
  labels: string[];
  assignees: string[];
  body: string;
  comments: { author: string; when: string; body: string }[];
};

export type PullRequestRecord = Base & {
  kind: "github.pull-request-view";
  repository: string;
  number: number;
  state: "open" | "draft" | "merged" | "closed";
  author: string;
  opened: string;
  head: string;
  base: string;
  additions: number;
  deletions: number;
  reviews: { author: string; verdict: "approved" | "changes requested" | "commented" }[];
  statuses: { context: string; state: "success" | "failure" | "pending" }[];
  files: { path: string; additions: number; deletions: number }[];
  body: string;
  comments: { author: string; when: string; body: string }[];
};

export type PageRecord = Base & {
  kind: "confluence.page-view";
  space: string;
  breadcrumb: string[];
  author: string;
  updated: string;
  body: string;
};

export type PanelRecord = IssueRecord | PullRequestRecord | PageRecord;

const REPO = "laserjm/workspace-prototype";
const hash = (n: number) => "#" + n;

export const RECORDS: Record<string, PanelRecord> = {
  "github.issue:27": {
    id: "github.issue:27",
    kind: "github.issue-view",
    repository: REPO,
    number: 27,
    title: "Integrations, phase 3: GitHub records, re-assess toward on-demand tools",
    url: "https://github.com/laserjm/workspace-prototype/issues/27",
    state: "open",
    author: "laserjm",
    opened: "Nov 6",
    labels: ["enhancement", "need-more-info"],
    assignees: ["laserjm"],
    body: `The first attempt fetched the records **upfront** and pushed them into the model's input.

## Proposed direction

- Selecting a repository only sets the thread's source and grant. Nothing is fetched.
- Tools for the attached source: search it, read one item in full.
- Attaching specific records is optional ("focus on these").

## Open questions

- [ ] Generic record tools, or GitHub's read-only MCP tools?
- [ ] Do we cache or use ETags for the repository list and records?`,
    comments: [
      {
        author: "laserjm",
        when: "Nov 8",
        body: `Phase 4 depends on how this one is cut, see ${hash(28)}.`,
      },
      {
        author: "ana-weber",
        when: "Nov 10",
        body: "The rollout plan in Confluence assumes on-demand reads. Linking it here.",
      },
    ],
  },
  "github.pr:35": {
    id: "github.pr:35",
    kind: "github.pull-request-view",
    repository: REPO,
    number: 35,
    title: "Drop the @conventions/nextjs package for helpers the app owns",
    url: "https://github.com/laserjm/workspace-prototype/pull/35",
    state: "merged",
    author: "laserjm",
    opened: "Nov 11",
    head: "chore/drop-conventions-package",
    base: "main",
    additions: 412,
    deletions: 1290,
    reviews: [{ author: "ana-weber", verdict: "approved" }],
    statuses: [
      { context: "ci/lint", state: "success" },
      { context: "ci/typecheck", state: "success" },
      { context: "ci/test", state: "success" },
    ],
    files: [
      { path: "src/lib/result.ts", additions: 38, deletions: 0 },
      { path: "src/lib/errors.ts", additions: 74, deletions: 0 },
      { path: "src/lib/db/client.ts", additions: 22, deletions: 9 },
      { path: "tests/support/integration.ts", additions: 61, deletions: 4 },
      { path: "package.json", additions: 1, deletions: 3 },
      { path: "pnpm-lock.yaml", additions: 216, deletions: 1274 },
    ],
    body: `The project owns its runtime helpers now: \`Result\`, the standard errors, \`violatedConstraint\`, \`withTransaction\` and the integration-test helpers.

They do what the app uses and no more.`,
    comments: [
      { author: "ana-weber", when: "Nov 11", body: "Nice cut. One statement timeout is all we use." },
    ],
  },
  "github.issue:1182": {
    id: "github.issue:1182",
    kind: "github.issue-view",
    repository: "acme/platform",
    number: 1182,
    title: "Release train blocked on SSO callback",
    url: "https://github.com/acme/platform/issues/1182",
    state: "open",
    author: "unknown",
    opened: "",
    labels: [],
    assignees: [],
    body: "",
    comments: [],
    fails: "Resource not accessible by personal access token. The token has no access to acme/platform.",
  },
  "github.pr:34": {
    id: "github.pr:34",
    kind: "github.pull-request-view",
    repository: REPO,
    number: 34,
    title: "Key the conversation apart from the source explorer beside it",
    url: "https://github.com/laserjm/workspace-prototype/pull/34",
    state: "open",
    author: "laserjm",
    opened: "Nov 10",
    head: "feat/drop-chat-store",
    base: "main",
    additions: 188,
    deletions: 342,
    reviews: [
      { author: "ana-weber", verdict: "changes requested" },
      { author: "tom-k", verdict: "commented" },
    ],
    statuses: [
      { context: "ci/lint", state: "success" },
      { context: "ci/test", state: "pending" },
    ],
    files: [
      { path: "src/app/(workspace)/_components/workspace-shell.tsx", additions: 41, deletions: 77 },
      { path: "src/modules/threads/components/use-thread-chat.ts", additions: 63, deletions: 120 },
      { path: "src/modules/threads/components/use-stored-conversation.ts", additions: 84, deletions: 0 },
    ],
    body: "Each thread's chat opens with the conversation the database holds. The browser keeps no conversation between openings.",
    comments: [
      { author: "ana-weber", when: "Nov 10", body: "The explorer still remounts on fork. Can we key it by the bare id?" },
    ],
  },
  "confluence.page:rollout": {
    id: "confluence.page:rollout",
    kind: "confluence.page-view",
    space: "ENG",
    breadcrumb: ["Engineering", "Integrations"],
    title: "Integrations rollout plan",
    url: "https://acme.atlassian.net/wiki/spaces/ENG/pages/4410",
    author: "Ana Weber",
    updated: "Nov 9",
    body: `## Goal

Ship GitHub as the first live provider by the end of the quarter, then Atlassian.

## Phases

| Phase | Scope | Owner |
| --- | --- | --- |
| 3 | GitHub records, on-demand tools | Michael |
| 4 | Vendor tools over MCP | Michael |
| 5 | OAuth: GitHub App, Atlassian 3LO | Ana |

## Risks

- Fine-grained tokens cannot read check runs; CI state waits for the GitHub App.
- Search is limited to 30 requests a minute per user.`,
  },
};

/** The canned conversation: what each question attached, and what its reply links. */
export const MESSAGES = [
  {
    question: "What's blocking the integrations release?",
    attached: ["github.issue:27", "github.pr:35", "github.issue:1182"],
    replyLinks: ["github.pr:34"],
  },
  {
    question: "Does the rollout plan agree with that?",
    attached: ["confluence.page:rollout"],
    replyLinks: [],
  },
] as const;

export function shortLabel(record: PanelRecord) {
  return record.kind === "confluence.page-view" ? record.title : hash(record.number);
}
