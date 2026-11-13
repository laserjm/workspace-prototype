"use client";

import { BookOpen } from "lucide-react";
import { recordErrorWords, useIntegrations } from "@/modules/integrations";
import { connectionRefOf, type ReadRecordInput, type ReadRecordOutput } from "../contracts";
import { AttachedItemChip } from "./attached-item-chip";
import { useRecordPanel } from "./record-panel-provider";

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
  const panel = useRecordPanel();
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
  const ref = connection && connectionRefOf(connection);
  const item = read && {
    type: read.summary.type,
    key: read.summary.key,
    snapshot: { label: read.summary.label, title: read.summary.title, state: read.summary.state },
  };
  const line =
    state === "reading" || !output
      ? `Reading ${what}…`
      : "error" in output
        ? `Could not read ${what}: ${recordErrorWords(output.error, providerName, "it was not found")}`
        : ref && item
          ? "Read"
          : `Read ${read?.summary.label ?? what}`;
  return (
    <p
      className="mt-1 mb-3 flex flex-wrap items-center gap-1.5 text-xs text-secondary-label [&+&]:-mt-2"
      role={state === "reading" ? "status" : undefined}
    >
      <BookOpen aria-hidden className="size-3 shrink-0" />
      <span>{line}</span>
      {ref && item && (
        <AttachedItemChip
          connection={ref}
          item={item}
          onOpen={() => panel.open({ connection: ref, item })}
        />
      )}
    </p>
  );
}
