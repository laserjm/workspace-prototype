"use client";

// What GitHub's issue and pull request views share: the meta line, labels, section headings and
// the conversation's comments.
import type { ReactNode } from "react";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";
import type { GithubIssueDetail } from "@/modules/integrations/contracts";

const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
export const dayOf = (iso: string) => day.format(new Date(iso));

/** `1 comment`, `3 comments`. */
export const counted = (count: number, singular: string) =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;

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

/** Who opened it, when, its labels and assignees. */
export function Opened({
  detail,
  children,
}: {
  detail: GithubIssueDetail;
  /** More, after the date: a pull request's branches. */
  children?: ReactNode;
}) {
  return (
    <Meta>
      <span>
        <span className="text-secondary-foreground">{detail.author}</span> opened{" "}
        {dayOf(detail.createdAt)}
      </span>
      {children}
      {detail.labels.map((label) => (
        <Label key={label.name}>{label.name}</Label>
      ))}
      {detail.assignees.length > 0 && <span>· assigned to {detail.assignees.join(", ")}</span>}
    </Meta>
  );
}

export function Description({ body }: { body: string }) {
  return body ? (
    <Markdown text={body} className="text-xs" />
  ) : (
    <p className="text-xs text-muted-foreground italic">No description.</p>
  );
}

/** A titled part of a view. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-2 text-3xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** A quiet line under a list: what GitHub has beyond it, or why it is empty. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-2xs text-muted-foreground">{children}</p>;
}

/** `+ 3 more files on GitHub`, when GitHub has more than the view shows. */
export function MoreOnGitHub({ count, noun }: { count: number; noun: string }) {
  return count > 0 ? <Note>+ {counted(count, noun)} on GitHub</Note> : null;
}

/** A bordered box: a comment, a review, the merge state. */
export function Card({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "li";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("rounded-md border border-border/70 px-2.5 py-2", className)}>{children}</Tag>
  );
}

/** Who wrote something, and when. */
export function Byline({ author, at, children }: { author: string; at?: string; children?: ReactNode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-1 text-3xs text-muted-foreground">
      <span className="font-medium text-secondary-foreground">{author}</span>
      {children}
      {at && <span>· {dayOf(at)}</span>}
    </div>
  );
}

/** The conversation's first 100 comments, and how many more GitHub has. */
export function Comments({ detail }: { detail: GithubIssueDetail }) {
  const { comments, commentCount } = detail;
  if (commentCount === 0) return null;
  const more = commentCount - comments.length;
  return (
    <Section title={counted(commentCount, "comment")}>
      <ul className="flex flex-col gap-2">
        {comments.map((comment) => (
          <Card as="li" key={comment.id}>
            <Byline author={comment.author} at={comment.createdAt} />
            <Markdown text={comment.body || "_No text._"} className="text-xs" />
          </Card>
        ))}
      </ul>
      <MoreOnGitHub count={more} noun="more comment" />
    </Section>
  );
}
