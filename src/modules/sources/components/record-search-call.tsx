"use client";

import { Search } from "lucide-react";
import type { SearchRecordsInput, SearchRecordsOutput } from "../contracts";

/** "status “In review”, owner “maya”": the filters the model asked for. */
function describeFilters(input: Partial<SearchRecordsInput> | undefined) {
  const filters = [
    input?.status && `status “${input.status}”`,
    input?.priority && `priority “${input.priority}”`,
    input?.owner?.trim() && `owner “${input.owner.trim()}”`,
    input?.text?.trim() && `“${input.text.trim()}”`,
  ].filter(Boolean);
  return filters.length > 0 ? ` for ${filters.join(", ")}` : "";
}

/** One `search_records` call in a reply: what the agent searched the attached records for. */
export function RecordSearchCall({
  state,
  input,
  output,
  errorText,
}: {
  state: "searching" | "done" | "failed";
  input?: Partial<SearchRecordsInput>;
  output?: SearchRecordsOutput;
  errorText?: string;
}) {
  const filters = describeFilters(input);
  if (state === "failed")
    return (
      <p className="mt-1 mb-3 text-xs text-destructive-foreground">
        Could not search the attached records{filters}. {errorText}
      </p>
    );
  const ids = output?.matches.map((match) => match.id).join(", ");
  return (
    <p
      className="mt-1 mb-3 flex items-start gap-1.5 text-xs text-secondary-label [&+&]:-mt-2"
      role={state === "searching" ? "status" : undefined}
    >
      <Search aria-hidden className="mt-0.5 size-3 shrink-0" />
      <span>
        {state === "searching" || !output
          ? `Searching the attached records${filters}…`
          : `Searched ${output.searched} attached records${filters}: ${
              output.matches.length === 0
                ? "none match"
                : `${output.matches.length} ${output.matches.length === 1 ? "matches" : "match"} (${ids})`
            }`}
      </span>
    </p>
  );
}
