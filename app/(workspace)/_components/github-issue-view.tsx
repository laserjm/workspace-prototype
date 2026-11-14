"use client";

// `github.issue-view`, body only: the frame around it (kind mark, where, state, title, refresh,
// open, close) belongs to the record panel. Bodies and comments are Markdown, drawn by the shared
// renderer, which shows raw HTML as text.
import type { RecordViewProps } from "./record-views";
import { githubIssueDetailSchema } from "@/modules/integrations/contracts";
import { GithubCommentList, GithubDescription, GithubOpenedRow } from "./github-view-parts";

/** An issue's description and first 100 comments. */
export default function GithubIssueView({ detail }: RecordViewProps) {
  const parsed = githubIssueDetailSchema.safeParse(detail);
  if (!parsed.success)
    return <p className="text-2xs text-muted-foreground">This issue could not be shown.</p>;
  const issue = parsed.data;
  return (
    <>
      <GithubOpenedRow detail={issue} />
      <GithubDescription body={issue.body} />
      <GithubCommentList detail={issue} />
    </>
  );
}
