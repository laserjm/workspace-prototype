"use client";
// PROTOTYPE, throwaway. The record views and their shared frame. The question is the host, so
// every variant renders these same views.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  BookOpen,
  CircleCheck,
  CircleDot,
  CircleSlash,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  GitPullRequestDraft,
  LoaderCircle,
  Pin,
  PinOff,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import {
  RECORDS,
  type IssueRecord,
  type PageRecord,
  type PanelRecord,
  type PullRequestRecord,
  type ViewKind,
} from "./fixtures";

// ---- The registry seam: a view kind is data plus a body component. -------------------------

type KindEntry<R extends PanelRecord> = {
  provider: string;
  Body: ComponentType<{ record: R }>;
};

export const VIEW_KINDS: {
  [K in ViewKind]: KindEntry<Extract<PanelRecord, { kind: K }>>;
} = {
  "github.issue-view": { provider: "GitHub", Body: IssueBody },
  "github.pull-request-view": { provider: "GitHub", Body: PullRequestBody },
  "confluence.page-view": { provider: "Confluence", Body: PageBody },
};

// ---- State marks ----------------------------------------------------------------------------

const TONE = {
  open: "text-emerald-600 dark:text-emerald-400",
  done: "text-violet-600 dark:text-violet-400",
  muted: "text-muted-foreground",
  danger: "text-red-600 dark:text-red-400",
  page: "text-sky-600 dark:text-sky-400",
} as const;

export function RecordMark({ record, className }: { record: PanelRecord; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  if (record.kind === "confluence.page-view") return <BookOpen className={cn(c, TONE.page)} />;
  if (record.kind === "github.issue-view") {
    if (record.state === "open") return <CircleDot className={cn(c, TONE.open)} />;
    if (record.state === "closed") return <CircleCheck className={cn(c, TONE.done)} />;
    return <CircleSlash className={cn(c, TONE.muted)} />;
  }
  if (record.state === "merged") return <GitMerge className={cn(c, TONE.done)} />;
  if (record.state === "draft") return <GitPullRequestDraft className={cn(c, TONE.muted)} />;
  if (record.state === "closed") return <GitPullRequest className={cn(c, TONE.danger)} />;
  return <GitPullRequest className={cn(c, TONE.open)} />;
}

function StateBadge({ record }: { record: PanelRecord }) {
  if (record.kind === "confluence.page-view")
    return <Badge className="text-sky-700 dark:text-sky-300">{record.space}</Badge>;
  const tone =
    record.state === "open"
      ? "border-emerald-200 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300"
      : record.state === "merged" || record.state === "closed"
        ? "border-violet-200 text-violet-700 dark:border-violet-400/30 dark:text-violet-300"
        : "text-muted-foreground";
  return <Badge className={tone}>{record.state}</Badge>;
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border px-1.5 py-px text-3xs capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---- The frame ------------------------------------------------------------------------------

/** A fake fetch: loading on mount and on refresh, then ready or failed. */
function useFakeLoad(record: PanelRecord, nonce: number) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    const timer = setTimeout(() => setStatus(record.fails ? "failed" : "ready"), 450);
    return () => {
      clearTimeout(timer);
      setStatus("loading");
    };
  }, [record, nonce]);
  return status;
}

export function ViewHeader({
  record,
  onClose,
  onRefresh,
  onPin,
  pinned,
  compact = false,
}: {
  record: PanelRecord;
  onClose?: () => void;
  onRefresh?: () => void;
  onPin?: () => void;
  pinned?: boolean;
  compact?: boolean;
}) {
  const where =
    record.kind === "confluence.page-view"
      ? record.breadcrumb.join(" / ")
      : `${record.repository} #${record.number}`;
  return (
    <div className={cn("flex min-w-0 items-start gap-2", compact ? "px-3 py-2" : "px-4 pt-3.5 pb-3")}>
      <RecordMark record={record} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-3xs text-muted-foreground">
          <span className="truncate">{where}</span>
          <StateBadge record={record} />
        </div>
        <strong
          className={cn(
            "mt-0.5 block font-medium text-secondary-foreground",
            compact ? "truncate text-xs" : "text-sm leading-snug",
          )}
        >
          {record.title}
        </strong>
      </div>
      <div className="-mt-0.5 flex shrink-0 items-center">
        {onPin && (
          <IconButton label={pinned ? "Unpin" : "Pin to top"} onClick={onPin} className="size-6">
            {pinned ? <PinOff /> : <Pin />}
          </IconButton>
        )}
        {onRefresh && (
          <IconButton label="Refresh" onClick={onRefresh} className="size-6">
            <RefreshCw />
          </IconButton>
        )}
        <IconButton
          label={`Open in ${VIEW_KINDS[record.kind].provider}`}
          className="size-6"
          onClick={() => window.open(record.url, "_blank", "noopener")}
        >
          <ExternalLink />
        </IconButton>
        {onClose && (
          <IconButton label="Close view" onClick={onClose} className="size-6">
            <X />
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** A view: the shared header, then loading, error or the kind's body. */
export function RecordView({
  id,
  onClose,
  onPin,
  pinned,
  showHeader = true,
  className,
}: {
  id: string;
  onClose?: () => void;
  onPin?: () => void;
  pinned?: boolean;
  showHeader?: boolean;
  className?: string;
}) {
  const record = RECORDS[id];
  const [nonce, setNonce] = useState(0);
  const status = useFakeLoad(record, nonce);
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {showHeader && (
        <ViewHeader
          record={record}
          onClose={onClose}
          onPin={onPin}
          pinned={pinned}
          onRefresh={() => setNonce((n) => n + 1)}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60 px-4 py-3.5 text-xs [scrollbar-width:thin]">
        {status === "loading" && <ViewSkeleton />}
        {status === "failed" && (
          <ViewError record={record} onRetry={() => setNonce((n) => n + 1)} />
        )}
        {status === "ready" && <KindBody record={record} />}
      </div>
    </div>
  );
}

function KindBody({ record }: { record: PanelRecord }) {
  switch (record.kind) {
    case "github.issue-view":
      return <IssueBody record={record} />;
    case "github.pull-request-view":
      return <PullRequestBody record={record} />;
    case "confluence.page-view":
      return <PageBody record={record} />;
  }
}

function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-label="Loading">
      <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
      {[80, 95, 60, 90, 40].map((w) => (
        <span key={w} className="h-2.5 rounded-sm bg-muted" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function ViewError({ record, onRetry }: { record: PanelRecord; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
      <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
        <TriangleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
        Can’t read this {record.kind === "github.pull-request-view" ? "pull request" : "issue"}
      </span>
      <p className="text-2xs text-muted-foreground">{record.fails}</p>
      <div className="flex gap-2 text-2xs">
        <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-accent" onClick={onRetry}>
          Retry
        </button>
        <a className="rounded-md border border-border px-2 py-1 hover:bg-accent" href={record.url} target="_blank" rel="noreferrer">
          Open on GitHub
        </a>
      </div>
    </div>
  );
}

// ---- Bodies ---------------------------------------------------------------------------------

function Meta({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 text-3xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}

function Comments({ comments }: { comments: { author: string; when: string; body: string }[] }) {
  if (!comments.length) return null;
  return (
    <Section title={`${comments.length} comments`}>
      <ul className="flex flex-col gap-2">
        {comments.map((comment, i) => (
          <li key={i} className="rounded-md border border-border/70 px-2.5 py-2">
            <div className="mb-1 text-3xs text-muted-foreground">
              <span className="font-medium text-secondary-foreground">{comment.author}</span> · {comment.when}
            </div>
            <Markdown text={comment.body} className="text-xs" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function IssueBody({ record }: { record: IssueRecord }) {
  return (
    <>
      <Meta>
        <span>
          <span className="text-secondary-foreground">{record.author}</span> opened {record.opened}
        </span>
        {record.labels.map((labelName) => (
          <Badge key={labelName} className="normal-case text-blue-700 dark:text-blue-300">
            {labelName}
          </Badge>
        ))}
        {record.assignees.length > 0 && <span>· assigned to {record.assignees.join(", ")}</span>}
      </Meta>
      <Markdown text={record.body} className="text-xs" />
      <Comments comments={record.comments} />
    </>
  );
}

function PullRequestBody({ record }: { record: PullRequestRecord }) {
  return (
    <>
      <Meta>
        <span>
          <span className="text-secondary-foreground">{record.author}</span> wants to merge{" "}
          <code className="rounded-sm bg-muted px-1">{record.head}</code> into{" "}
          <code className="rounded-sm bg-muted px-1">{record.base}</code>
        </span>
        <span className="text-emerald-700 dark:text-emerald-400">+{record.additions}</span>
        <span className="text-red-700 dark:text-red-400">−{record.deletions}</span>
      </Meta>
      <Markdown text={record.body} className="text-xs" />
      <Section title="Reviews">
        <ul className="flex flex-col gap-1">
          {record.reviews.map((review) => (
            <li key={review.author} className="flex items-center gap-1.5">
              <span className="text-secondary-foreground">{review.author}</span>
              <span
                className={cn(
                  "text-2xs",
                  review.verdict === "approved" && "text-emerald-700 dark:text-emerald-400",
                  review.verdict === "changes requested" && "text-red-700 dark:text-red-400",
                  review.verdict === "commented" && "text-muted-foreground",
                )}
              >
                {review.verdict}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Commit statuses">
        <ul className="flex flex-col gap-1">
          {record.statuses.map((status) => (
            <li key={status.context} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status.state === "success" && "bg-emerald-500",
                  status.state === "failure" && "bg-red-500",
                  status.state === "pending" && "bg-amber-400",
                )}
              />
              <span>{status.context}</span>
              <span className="text-2xs text-muted-foreground">{status.state}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-3xs text-muted-foreground">
          GitHub Actions check runs need a GitHub App; a fine-grained token reads commit statuses only.
        </p>
      </Section>
      <Section title={`${record.files.length} files changed`}>
        <ul className="flex flex-col gap-0.5 font-mono text-2xs">
          {record.files.map((file) => (
            <li key={file.path} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{file.path}</span>
              <span className="text-emerald-700 dark:text-emerald-400">+{file.additions}</span>
              <span className="text-red-700 dark:text-red-400">−{file.deletions}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Comments comments={record.comments} />
    </>
  );
}

function PageBody({ record }: { record: PageRecord }) {
  return (
    <>
      <Meta>
        <span>
          <span className="text-secondary-foreground">{record.author}</span> · updated {record.updated}
        </span>
      </Meta>
      <Markdown text={record.body} className="text-xs" />
    </>
  );
}
