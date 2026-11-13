"use client";

import { Search } from "lucide-react";
import { useIntegrations, waitLabel, type RecordError } from "@/modules/integrations";
import { connectionRefOf, type SearchRecordsInput, type SearchRecordsOutput } from "../contracts";
import { AttachedItemChip } from "./attached-item-chip";
import { useRecordPanel } from "./record-panel-provider";

/** How many results show as chips; the rest are counted. */
const CHIPS_SHOWN = 3;

/** Why a search found nothing, in words. */
function errorWords(error: RecordError, providerName: string): string {
  switch (error.kind) {
    case "not_found":
      return "the connection was not found";
    case "no_access":
      return "this thread has no access to that connection";
    case "needs_reconnect":
      return `${providerName} refused the connection’s token; connect it again in Settings`;
    case "rate_limited":
      return `${providerName}’s rate limit is reached, try again in ${waitLabel(error.retryAt)}`;
    case "unreachable":
      return `${providerName} could not be reached`;
    case "invalid_query":
      return `${providerName} could not run the search: ${error.message}`;
  }
}

const resultCount = (count: number) => `${count} ${count === 1 ? "result" : "results"}`;

/**
 * One `search_records` call in a reply, as one quiet line: which connection the agent searched for
 * what, and how many results, or why it found none. The first few results are chips that open their
 * record view (as a view tab, never under Attached), then "+N".
 */
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
  const { providers, connections } = useIntegrations();
  const panel = useRecordPanel();
  const connection = connections.find((candidate) => candidate.id === input?.connectionId);
  const providerName =
    providers.find((provider) => provider.id === connection?.providerId)?.name ?? "The provider";
  const where = connection?.accountLabel ?? "a connection";
  const query = input?.query?.trim();
  const what = `${where}${query ? ` for “${query}”` : ""}`;

  if (state === "failed")
    return (
      <p className="mt-1 mb-3 text-xs text-destructive-foreground">
        Could not search {what}. {errorText}
      </p>
    );
  const found = output && "results" in output ? output : undefined;
  const results = found?.results ?? [];
  const count = found ? (found.total ?? results.length) : 0;
  const line =
    state === "searching" || !output
      ? `Searching ${what}…`
      : "error" in output
        ? `Could not search ${what}: ${errorWords(output.error, providerName)}`
        : `Searched ${what}: ${resultCount(count)}`;
  const ref = connection && connectionRefOf(connection);
  const more = count - CHIPS_SHOWN;
  return (
    <div className="mt-1 mb-3 text-xs text-secondary-label [&+&]:-mt-2">
      <p
        className="flex items-start gap-1.5"
        role={state === "searching" ? "status" : undefined}
      >
        <Search aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span>{line}</span>
      </p>
      {ref && results.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-4.5">
          {results.slice(0, CHIPS_SHOWN).map((result) => {
            const item = {
              type: result.type,
              key: result.key,
              snapshot: { label: result.label, title: result.title, state: result.state },
            };
            return (
              <AttachedItemChip
                key={`${result.type}:${result.key}`}
                connection={ref}
                item={item}
                onOpen={() => panel.open({ connection: ref, item })}
              />
            );
          })}
          {more > 0 && <span>+{more}</span>}
        </div>
      )}
    </div>
  );
}
