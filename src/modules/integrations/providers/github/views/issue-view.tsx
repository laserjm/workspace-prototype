"use client";

// `github.issue-view`, body only: the frame around it (kind mark, where, state, title, refresh,
// open, close) belongs to the record panel. Bodies and comments are Markdown, drawn by the shared
// renderer, which shows raw HTML as text.
import type { RecordViewProps } from "../../../record-views";
import { githubIssueDetailSchema } from "../records";
import { Comments, Description, Opened } from "./parts";

/** An issue's description and first 100 comments. */
export default function IssueView({ detail }: RecordViewProps) {
  const parsed = githubIssueDetailSchema.safeParse(detail);
  if (!parsed.success)
    return <p className="text-2xs text-muted-foreground">This issue could not be shown.</p>;
  const issue = parsed.data;
  return (
    <>
      <Opened detail={issue} />
      <Description body={issue.body} />
      <Comments detail={issue} />
    </>
  );
}
