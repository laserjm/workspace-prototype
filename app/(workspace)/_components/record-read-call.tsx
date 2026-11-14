"use client";

import { BookOpen } from "lucide-react";
import { recordErrorWords } from "./record-error-words";
import { useIntegrations } from "./use-integrations";
import type { ReadRecordInput, ReadRecordOutput } from "@/modules/records/contracts";
import { RecordChip } from "./record-chip";

/**
 * One `read_record` call in a reply, as one quiet line: "Read" and the record as a chip, which
 * opens its record view (as a view tab, never under Attached), or why it could not be read.
 */
export function RecordReadCall({
  state,
  input,
  output,
  errorText,
}: {
  state: "reading" | "done" | "failed";
  input?: Partial<ReadRecordInput>;
  output?: ReadRecordOutput;
  errorText?: string;
}) {
  const { providers, connections } = useIntegrations();
  const connection = connections.find((candidate) => candidate.id === input?.connectionId);
  const providerName =
    providers.find((provider) => provider.id === connection?.providerId)?.name ?? "The provider";
  const what = input?.key ?? "a record";

  if (state === "failed")
    return (
      <p className="mt-1 mb-3 text-xs text-destructive-foreground">
        Could not read {what}. {errorText}
      </p>
    );
  const read = output && "summary" in output ? output : undefined;
  const line =
    state === "reading" || !output
      ? `Reading ${what}…`
      : "error" in output
        ? `Could not read ${what}: ${recordErrorWords(output.error, providerName, "it was not found")}`
        : connection && read
          ? "Read"
          : `Read ${read?.summary.label ?? what}`;
  return (
    <p
      className="mt-1 mb-3 flex flex-wrap items-center gap-1.5 text-xs text-secondary-label [&+&]:-mt-2"
      role={state === "reading" ? "status" : undefined}
    >
      <BookOpen aria-hidden className="size-3 shrink-0" />
      <span>{line}</span>
      {connection && read && <RecordChip summary={read.summary} />}
    </p>
  );
}
