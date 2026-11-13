"use client";

// `github.issue-view`, body only: the frame around it (kind mark, where, state, title, refresh,
// open, close) belongs to the record panel. Bodies and comments are Markdown, drawn by the shared
// renderer, which shows raw HTML as text.
import type { ReactNode } from "react";
import { Markdown } from "@/components/ui/markdown";
import type { RecordViewProps } from "../../../record-views";
import { githubIssueDetailSchema, type GithubIssueDetail } from "../records";

const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dayOf = (iso: string) => day.format(new Date(iso));

function Meta({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 py-px text-3xs">
      {children}
    </span>
  );
}

function Comments({ detail }: { detail: GithubIssueDetail }) {
  const { comments, commentCount } = detail;
  if (commentCount === 0) return null;
  const more = commentCount - comments.length;
  return (
    <section className="mt-5">
      <h4 className="mb-2 text-3xs font-medium tracking-wide text-muted-foreground uppercase">
        {commentCount === 1 ? "1 comment" : `${commentCount} comments`}
      </h4>
      <ul className="flex flex-col gap-2">
        {comments.map((comment) => (
          <li key={comment.id} className="rounded-md border border-border/70 px-2.5 py-2">
            <div className="mb-1 text-3xs text-muted-foreground">
              <span className="font-medium text-secondary-foreground">{comment.author}</span> ·{" "}
              {dayOf(comment.createdAt)}
            </div>
            <Markdown text={comment.body || "_No text._"} className="text-xs" />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="mt-2 text-2xs text-muted-foreground">+ {more} more on GitHub</p>
      )}
    </section>
  );
}

/** An issue's description and first 100 comments; also a pull request's until it has its own view. */
export default function IssueView({ detail }: RecordViewProps) {
  const parsed = githubIssueDetailSchema.safeParse(detail);
  if (!parsed.success)
    return <p className="text-2xs text-muted-foreground">This issue could not be shown.</p>;
  const issue = parsed.data;
  return (
    <>
      <Meta>
        <span>
          <span className="text-secondary-foreground">{issue.author}</span> opened{" "}
          {dayOf(issue.createdAt)}
        </span>
        {issue.labels.map((label) => (
          <Label key={label.name}>{label.name}</Label>
        ))}
        {issue.assignees.length > 0 && <span>· assigned to {issue.assignees.join(", ")}</span>}
      </Meta>
      {issue.body ? (
        <Markdown text={issue.body} className="text-xs" />
      ) : (
        <p className="text-xs text-muted-foreground italic">No description.</p>
      )}
      <Comments detail={issue} />
    </>
  );
}
