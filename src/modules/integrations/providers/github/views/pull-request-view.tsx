"use client";

// `github.pull-request-view`, body only, laid out for review (#61): where it merges and whether it
// can, the description, the changed files, CI, the reviews and the conversation. The frame around
// it belongs to the record panel. Bodies are Markdown, drawn by the shared renderer.
import type { ComponentType, ReactNode } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleX,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestDraft,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import type { RecordViewProps } from "../../../record-views";
import { githubPullRequestDetailSchema, type GithubPullRequestDetail } from "../records";
import { Byline, Comments, counted, dayOf, Description, Note, Opened, Section } from "./parts";

// States only identify, so they take Tailwind's palette, as the record marks do.
const TONE = {
  good: "text-emerald-600 dark:text-emerald-400",
  bad: "text-red-600 dark:text-red-400",
  waiting: "text-amber-600 dark:text-amber-400",
  done: "text-violet-600 dark:text-violet-400",
  quiet: "text-muted-foreground",
} as const;
type Tone = keyof typeof TONE;

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** An icon and a line of text in a tone. */
function Status({ icon: Mark, tone, children }: { icon: Icon; tone: Tone; children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <Mark aria-hidden className={cn("mt-px size-3.5 shrink-0", TONE[tone])} />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** What GitHub's `mergeable_state` says about an open pull request. */
const MERGEABLE: Record<string, { icon: Icon; tone: Tone; text: (base: string) => string }> = {
  clean: { icon: CircleCheck, tone: "good", text: () => "Ready to merge" },
  has_hooks: { icon: CircleCheck, tone: "good", text: () => "Ready to merge; hooks run on merge" },
  unstable: {
    icon: TriangleAlert,
    tone: "waiting",
    text: () => "Can be merged, but checks are failing or still running",
  },
  behind: {
    icon: TriangleAlert,
    tone: "waiting",
    text: (base) => `Behind ${base}: update the branch before merging`,
  },
  blocked: {
    icon: CircleMinus,
    tone: "bad",
    text: () => "Blocked by required reviews, checks or branch protection",
  },
  dirty: { icon: CircleX, tone: "bad", text: (base) => `Has conflicts with ${base}` },
  draft: { icon: GitPullRequestDraft, tone: "quiet", text: () => "Draft: not ready to merge yet" },
};

function MergeState({ merge }: { merge: GithubPullRequestDetail["merge"] }) {
  let line: ReactNode;
  if (merge.merged)
    line = (
      <Status icon={GitMerge} tone="done">
        Merged into <Branch name={merge.base} />
        {merge.mergedBy && ` by ${merge.mergedBy}`}
        {merge.mergedAt && ` on ${dayOf(merge.mergedAt)}`}
      </Status>
    );
  else if (merge.closed)
    line = (
      <Status icon={GitPullRequestClosed} tone="bad">
        Closed without merging
      </Status>
    );
  else {
    const known = MERGEABLE[merge.mergeableState];
    line = known ? (
      <Status icon={known.icon} tone={known.tone}>
        {known.text(merge.base)}
      </Status>
    ) : (
      <Status icon={CircleDashed} tone="quiet">
        GitHub is still working out whether it can be merged
      </Status>
    );
  }
  return (
    <div className="mt-1 mb-4 flex flex-col gap-1 rounded-md border border-border/70 px-2.5 py-2 text-xs">
      {line}
      <span className="pl-5 text-2xs text-muted-foreground">
        {counted(merge.commits, "commit")} ·{" "}
        <span className={TONE.good}>+{merge.additions}</span>{" "}
        <span className={TONE.bad}>−{merge.deletions}</span>
      </span>
    </div>
  );
}

function Branch({ name }: { name: string }) {
  return (
    <code className="rounded bg-muted px-1 py-px font-mono text-3xs text-secondary-foreground">
      {name}
    </code>
  );
}

/** One letter per file status, as GitHub's own lists mark them. */
const FILE_STATUS: Record<string, { mark: string; tone: Tone; label: string }> = {
  added: { mark: "A", tone: "good", label: "Added" },
  removed: { mark: "D", tone: "bad", label: "Deleted" },
  modified: { mark: "M", tone: "waiting", label: "Modified" },
  renamed: { mark: "R", tone: "done", label: "Renamed" },
  copied: { mark: "C", tone: "done", label: "Copied" },
  changed: { mark: "M", tone: "waiting", label: "Changed" },
  unchanged: { mark: "·", tone: "quiet", label: "Unchanged" },
};

function ChangedFiles({ detail }: { detail: GithubPullRequestDetail }) {
  const { files, fileCount } = detail;
  const more = fileCount - files.length;
  return (
    <Section title={counted(fileCount, "changed file")}>
      {files.length === 0 ? (
        <Note>No changed files.</Note>
      ) : (
        <ul className="flex flex-col rounded-md border border-border/70 py-1">
          {files.map((file) => {
            const status = FILE_STATUS[file.status] ?? { mark: "?", tone: "quiet", label: file.status };
            const name = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
            return (
              <li key={file.path} className="flex items-center gap-2 px-2.5 py-0.5 text-2xs">
                <span
                  title={status.label}
                  className={cn("w-2.5 shrink-0 font-mono text-3xs font-medium", TONE[status.tone])}
                >
                  {status.mark}
                </span>
                <span title={name} className="min-w-0 flex-1 truncate font-mono text-secondary-foreground">
                  {name}
                </span>
                <span className="shrink-0 font-mono text-3xs tabular-nums">
                  <span className={TONE.good}>+{file.additions}</span>{" "}
                  <span className={TONE.bad}>−{file.deletions}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && <Note>+ {counted(more, "more file")} on GitHub</Note>}
    </Section>
  );
}

/** How a run or a status went, as an icon in a tone. */
function outcomeOf(state: string): { icon: Icon; tone: Tone; label: string } {
  switch (state) {
    case "success":
      return { icon: CircleCheck, tone: "good", label: "Succeeded" };
    case "failure":
    case "error":
    case "timed_out":
    case "startup_failure":
      return { icon: CircleX, tone: "bad", label: state === "timed_out" ? "Timed out" : "Failed" };
    case "cancelled":
    case "skipped":
    case "neutral":
    case "stale":
      return { icon: CircleMinus, tone: "quiet", label: state[0]!.toUpperCase() + state.slice(1) };
    case "action_required":
      return { icon: TriangleAlert, tone: "waiting", label: "Action required" };
    case "in_progress":
      return { icon: LoaderCircle, tone: "waiting", label: "In progress" };
    default:
      return { icon: CircleDot, tone: "waiting", label: "Pending" };
  }
}

function Outcome({ state }: { state: string }) {
  const { icon: Mark, tone, label } = outcomeOf(state);
  return <Mark aria-label={label} className={cn("mt-px size-3.5 shrink-0", TONE[tone])} />;
}

const EVENT: Record<string, string> = { pull_request: "pull request", push: "push" };

function ActionsRuns({ actions }: { actions: GithubPullRequestDetail["ci"]["actions"] }) {
  if (!actions.readable) return <Note>Give the token Actions: read to see CI.</Note>;
  if (actions.runs.length === 0) return <Note>No GitHub Actions runs.</Note>;
  const more = actions.total - actions.runs.length;
  return (
    <>
      <ul className="flex flex-col gap-1">
        {actions.runs.map((run) => (
          <li key={run.id} className="flex items-start gap-1.5 text-2xs">
            <Outcome state={run.conclusion ?? run.status} />
            <a
              href={run.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-secondary-foreground hover:underline"
              title={run.title}
            >
              {run.name}
            </a>
            <span className="shrink-0 text-3xs text-muted-foreground">
              on {EVENT[run.event] ?? run.event}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <Note>+ {counted(more, "more run")} on GitHub</Note>}
    </>
  );
}

function CommitStatuses({ statuses }: { statuses: GithubPullRequestDetail["ci"]["statuses"] }) {
  if (!statuses.readable) return <Note>Give the token Commit statuses: read to see commit statuses.</Note>;
  if (statuses.statuses.length === 0) return <Note>No commit statuses.</Note>;
  return (
    <ul className="flex flex-col gap-1">
      {statuses.statuses.map((status) => (
        <li key={status.id} className="flex items-start gap-1.5 text-2xs">
          <Outcome state={status.state} />
          <span className="min-w-0 flex-1">
            <span className="text-secondary-foreground">{status.context}</span>
            {status.description && (
              <span className="text-muted-foreground"> · {status.description}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** CI for the head commit, labelled as exactly what it is: not every check. */
function Ci({ ci }: { ci: GithubPullRequestDetail["ci"] }) {
  return (
    <Section title="GitHub Actions and commit statuses">
      <p className="mb-2 text-3xs text-muted-foreground">
        For the head commit <code className="font-mono">{ci.headSha.slice(0, 7)}</code>
      </p>
      <div className="flex flex-col gap-2">
        <ActionsRuns actions={ci.actions} />
        <CommitStatuses statuses={ci.statuses} />
      </div>
    </Section>
  );
}

const REVIEW_STATE: Record<string, { label: string; tone: Tone }> = {
  APPROVED: { label: "approved", tone: "good" },
  CHANGES_REQUESTED: { label: "requested changes", tone: "bad" },
  COMMENTED: { label: "reviewed", tone: "quiet" },
  DISMISSED: { label: "review dismissed", tone: "quiet" },
  PENDING: { label: "review pending", tone: "waiting" },
};

function Reviews({ detail }: { detail: GithubPullRequestDetail }) {
  const { reviews, reviewCommentCount } = detail;
  const shownComments = reviews.reduce((sum, review) => sum + review.comments.length, 0);
  const more = reviewCommentCount - shownComments;
  return (
    <Section title={reviews.length ? counted(reviews.length, "review") : "Reviews"}>
      {reviews.length === 0 ? (
        <Note>No reviews yet.</Note>
      ) : (
        <ul className="flex flex-col gap-2">
          {reviews.map((review) => {
            const state = REVIEW_STATE[review.state] ?? { label: review.state.toLowerCase(), tone: "quiet" };
            return (
              <li key={review.id} className="rounded-md border border-border/70 px-2.5 py-2">
                <Byline author={review.author} at={review.submittedAt}>
                  <span className={TONE[state.tone]}>{state.label}</span>
                </Byline>
                {review.body && <Markdown text={review.body} className="text-xs" />}
                {review.comments.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5 border-l-2 border-border/70 pl-2">
                    {review.comments.map((comment) => (
                      <li key={comment.id}>
                        <div className="mb-0.5 truncate font-mono text-3xs text-muted-foreground">
                          {comment.path}
                          {comment.line !== undefined && `:${comment.line}`}
                        </div>
                        <Markdown text={comment.body || "_No text._"} className="text-xs" />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && <Note>+ {counted(more, "more review comment")} on GitHub</Note>}
    </Section>
  );
}

/** A pull request laid out for review. */
export default function PullRequestView({ detail }: RecordViewProps) {
  const parsed = githubPullRequestDetailSchema.safeParse(detail);
  if (!parsed.success)
    return <p className="text-2xs text-muted-foreground">This pull request could not be shown.</p>;
  const pull = parsed.data;
  return (
    <>
      <Opened detail={pull}>
        <span className="flex items-center gap-1">
          · <Branch name={pull.merge.head} /> into <Branch name={pull.merge.base} />
        </span>
      </Opened>
      <MergeState merge={pull.merge} />
      <Description body={pull.body} />
      <ChangedFiles detail={pull} />
      <Ci ci={pull.ci} />
      <Reviews detail={pull} />
      <Comments detail={pull} />
    </>
  );
}
