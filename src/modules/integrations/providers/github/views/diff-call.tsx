"use client";

import type { ReactNode } from "react";
import { FileDiff } from "lucide-react";
import type { RecordSummary } from "../../../contracts";
import { recordErrorWords } from "../../../components/record-error-words";
import { useIntegrations } from "../../../components/use-integrations";
import type { GithubPullRequestDiffInput, GithubPullRequestDiffOutput } from "../diff";
import { counted } from "./parts";

/**
 * One `github_pull_request_diff` call in a reply, as one quiet line: "Read the diff of web#42
 * (12 files)", or of one file "in web#42", the pull request drawn by `recordChip` (the records
 * module's chip, which opens its view); or why it could not be read.
 */
export function GithubPullRequestDiffCall({
  state,
  input,
  output,
  errorText,
  recordChip,
}: {
  state: "reading" | "done" | "failed";
  input?: Partial<GithubPullRequestDiffInput>;
  output?: GithubPullRequestDiffOutput;
  errorText?: string;
  /** Draws the pull request as a chip; given by the chat, which may import the records module. */
  recordChip: (summary: RecordSummary) => ReactNode;
}) {
  const { connections } = useIntegrations();
  const what = `the diff of ${input?.path ? `${input.path} in ` : ""}`;
  const key = input?.key ?? "a pull request";

  if (state === "failed")
    return (
      <p className="mt-1 mb-3 text-xs text-destructive-foreground">
        Could not read {what}
        {key}. {errorText}
      </p>
    );
  if (state === "reading" || !output)
    return (
      <p className="mt-1 mb-3 flex items-center gap-1.5 text-xs text-secondary-label" role="status">
        <FileDiff aria-hidden className="size-3 shrink-0" />
        <span>
          Reading {what}
          {key}…
        </span>
      </p>
    );
  if ("error" in output)
    return (
      <p className="mt-1 mb-3 flex items-center gap-1.5 text-xs text-secondary-label">
        <FileDiff aria-hidden className="size-3 shrink-0" />
        <span>
          Could not read {what}
          {key}: {recordErrorWords(output.error, "GitHub", "it was not found")}
        </span>
      </p>
    );
  const connected = connections.some((candidate) => candidate.id === output.summary.connectionId);
  const path = input?.path;
  const line =
    path !== undefined && output.files.length === 0
      ? `Found no changed file at ${path} in`
      : `Read ${what}`;
  return (
    <p className="mt-1 mb-3 flex flex-wrap items-center gap-1.5 text-xs text-secondary-label [&+&]:-mt-2">
      <FileDiff aria-hidden className="size-3 shrink-0" />
      <span>{line}</span>
      {connected ? recordChip(output.summary) : <span>{output.summary.label}</span>}
      {path === undefined && <span>({counted(output.fileCount, "file")})</span>}
    </p>
  );
}
