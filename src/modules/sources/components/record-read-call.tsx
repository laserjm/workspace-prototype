"use client";

import { FileText } from "lucide-react";
import type { GetRecordInput, GetRecordOutput } from "../contracts";

/** One `get_record` call in a reply: which attached record the agent read in full. */
export function RecordReadCall({
  state,
  input,
  output,
  errorText,
}: {
  state: "reading" | "done" | "failed";
  input?: Partial<GetRecordInput>;
  output?: GetRecordOutput;
  errorText?: string;
}) {
  const id = output?.id ?? input?.id ?? "a record";
  if (state === "failed")
    return (
      <p className="mt-1 mb-3 text-xs text-destructive-foreground">
        Could not read {id}. {errorText}
      </p>
    );
  const comments = output?.comments.length ?? 0;
  return (
    <p
      className="mt-1 mb-3 flex items-start gap-1.5 text-xs text-secondary-label [&+&]:-mt-2"
      role={state === "reading" ? "status" : undefined}
    >
      <FileText aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        {state === "reading" || !output
          ? `Reading ${id}…`
          : `Read ${output.id}: ${output.title}${
              comments ? ` · ${comments} ${comments === 1 ? "comment" : "comments"}` : ""
            }`}
      </span>
    </p>
  );
}
