"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  pluralLabels,
  ProviderMark,
  RecordKindMark,
  useIntegrations,
  waitLabel,
  type Connection,
  type ProviderChoice,
  type RecordSummary,
} from "@/modules/integrations";
import {
  applyPicks,
  canPick,
  connectionRefOf,
  defaultConnectionId,
  isPicked,
  itemCount,
  MAX_ATTACHED_ITEMS,
  removeItem,
  togglePick,
  type AttachedConnection,
  type ConnectionRef,
} from "../contracts";
import {
  useRecordSearch,
  useSearchCache,
  type SearchCache,
  type SearchError,
} from "./use-record-search";

/** A connection the dialog can search: its provider declares records. */
type Searchable = { connection: Connection; provider: ProviderChoice };

const refOf = ({ connection }: Searchable): ConnectionRef => connectionRefOf(connection);

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });
/** "3d ago", "yesterday": when a record last changed. */
function ago(iso: string, now = Date.now()) {
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

/** The typed words worth marking in a title, without leading marks: a digit, or 2 letters on. */
function markedWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter((word) => word.length > 1 || /^\d$/.test(word));
}

/** `title` with each typed word bold where a word of the title starts with it. */
function highlighted(title: string, words: readonly string[]): ReactNode {
  if (!words.length) return title;
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})`, "giu");
  return title.split(pattern).map((part, index) =>
    // split() puts the matches at the odd places.
    index % 2 ? <strong key={index} className="font-semibold text-foreground">{part}</strong> : part,
  );
}

/**
 * Picks records from the user's connections to attach to the question (ADR 0003 §1): one search
 * field holding the picks as chips, the provider's declared toggles and a checkbox list. It edits
 * a copy of what is attached, so Cancel or Esc changes nothing. With nothing picked, it attaches
 * the connection shown as a whole.
 */
export function AttachDialog({
  attached,
  onApply,
  onClose,
  onConnect,
}: {
  attached: readonly AttachedConnection[];
  onApply: (attached: readonly AttachedConnection[]) => void;
  onClose: () => void;
  /** Leads to where a connection is added, when there is none to search. */
  onConnect: () => void;
}) {
  const { providers, connections } = useIntegrations();
  const searchable = connections.flatMap((connection): Searchable[] => {
    const provider = providers.find((choice) => choice.id === connection.providerId);
    return provider?.records ? [{ connection, provider }] : [];
  });
  const [connectionId, setConnectionId] = useState(() =>
    defaultConnectionId(
      searchable.map(({ connection }) => connection),
      attached,
    ),
  );
  const cache = useSearchCache();
  const shown = searchable.find(({ connection }) => connection.id === connectionId);
  const [picks, setPicks] = useState(attached);
  // With nothing to search, the dialog offers the first provider that holds records.
  const invited = providers.find((provider) => provider.records);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* One column that may shrink, so a long title truncates instead of widening the grid. */}
      <DialogContent className="max-h-[calc(100svh-2rem)] grid-cols-[minmax(0,1fr)] gap-4 sm:max-w-xl">
        {shown?.provider.records ? (
          <ConnectionSearch
            // Toggles belong to one provider's declarations; a switch starts them afresh.
            key={shown.connection.id}
            shown={shown}
            searchable={searchable}
            onSwitch={setConnectionId}
            cache={cache}
            picks={picks}
            onPicks={setPicks}
            onApply={() => {
              onApply(applyPicks(picks, refOf(shown)));
              onClose();
            }}
            onCancel={onClose}
            onReconnect={() => {
              onClose();
              onConnect();
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>No data sources connected yet</DialogTitle>
              <DialogDescription>
                Connect one to attach its records to your question. Your draft stays in the
                composer.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  onConnect();
                }}
              >
                {invited ? `Connect ${invited.name}` : "Connect a data source"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "GitHub's search limit is reached, try again in 40 s", counting down. */
function RateLimitWait({ retryAt, provider }: { retryAt: string; provider: ProviderChoice }) {
  const [now, setNow] = useState(() => Date.now());
  const waiting = Date.parse(retryAt) > now;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  return waiting
    ? `${provider.name}'s search limit is reached, try again in ${waitLabel(retryAt, now)}.`
    : `${provider.name}'s search limit should have reset. Change the search to try again.`;
}

/** The one quiet line a refused search leaves above the results it keeps. */
function SearchErrorLine({
  error,
  needsReconnect,
  provider,
  onReconnect,
}: {
  error: SearchError | undefined;
  needsReconnect: boolean;
  provider: ProviderChoice;
  onReconnect: () => void;
}) {
  const retryAt = error?.kind === "rate_limited" ? error.retryAt : undefined;
  let line: ReactNode;
  if (needsReconnect || error?.kind === "needs_reconnect")
    line = (
      <button type="button" className="text-info-foreground hover:underline" onClick={onReconnect}>
        Reconnect {provider.name}
      </button>
    );
  // Keyed by the wait, so each wait counts down from its own start.
  else if (retryAt) line = <RateLimitWait key={retryAt} retryAt={retryAt} provider={provider} />;
  else if (error) line = error.message;
  else return null;
  return (
    <p role="status" className="mt-2 text-2xs text-secondary-label">
      {line}
    </p>
  );
}

function ConnectionSearch({
  shown,
  searchable,
  onSwitch,
  cache,
  picks,
  onPicks,
  onApply,
  onCancel,
  onReconnect,
}: {
  shown: Searchable;
  searchable: Searchable[];
  onSwitch: (connectionId: string) => void;
  cache: SearchCache;
  picks: readonly AttachedConnection[];
  onPicks: (picks: readonly AttachedConnection[]) => void;
  onApply: () => void;
  onCancel: () => void;
  /** Leads to Settings, where the connection is connected again. */
  onReconnect: () => void;
}) {
  const { connection, provider } = shown;
  const { putConnection } = useIntegrations();
  const needsReconnect = connection.status === "needs_reconnect";
  const records = provider.records!;
  const types = Object.entries(records.types);
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const search = useRecordSearch(
    { connectionId: connection.id, text, type, includeClosed },
    {
      cache,
      enabled: !needsReconnect,
      onError(error) {
        // The server marked it; the dialog and Settings now show it too.
        if (error.kind === "needs_reconnect")
          putConnection({ ...connection, status: "needs_reconnect" });
      },
    },
  );
  const words = markedWords(text);
  const ref = refOf(shown);
  const count = itemCount(picks);
  const picked = picks.flatMap((entry) =>
    entry.items.map((item) => ({ connection: entry, item })),
  );

  function toggle(result: RecordSummary) {
    onPicks(togglePick(picks, ref, result));
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const last = picked.at(-1);
    if (event.key === "Backspace" && !text && last)
      onPicks(removeItem(picks, last.connection.connectionId, last.item.type, last.item.key));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Attach {pluralLabels(records)}</DialogTitle>
        <DialogDescription>
          Pick what your question is about. You can attach up to {MAX_ATTACHED_ITEMS}.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
          <ProviderMark providerId={provider.id} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-xs font-medium">
            {provider.name} · {connection.accountLabel}
          </strong>
          {needsReconnect ? (
            <small className="mt-1 block text-3xs text-warning-foreground">Needs reconnecting</small>
          ) : (
            <small className="mt-1 block truncate text-3xs text-secondary-label">
              {search.reach ?? (search.error ? "" : "Reading what this connection reaches…")}
            </small>
          )}
        </div>
        {needsReconnect && (
          <Button variant="outline" size="xs" onClick={onReconnect}>
            Reconnect
          </Button>
        )}
        {searchable.length > 1 && (
          <label className="relative flex items-center text-2xs text-info-foreground">
            <span className="pr-4">Switch</span>
            <ChevronDown className="pointer-events-none absolute right-0 size-3" />
            <select
              aria-label="Connection"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={connection.id}
              onChange={(event) => onSwitch(event.target.value)}
            >
              {searchable.map((entry) => (
                <option key={entry.connection.id} value={entry.connection.id}>
                  {entry.provider.name} · {entry.connection.accountLabel}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <div
          className={cn(
            "flex min-h-9 min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1.5 text-icon-muted focus-within:border-ring",
            needsReconnect && "cursor-default",
          )}
          onClick={() => input.current?.focus()}
        >
          <Search size={15} className="shrink-0" />
          {picked.map(({ connection: from, item }) => (
            <span
              key={`${from.connectionId}:${item.type}:${item.key}`}
              className="inline-flex max-w-48 items-center gap-1 rounded-xs bg-accent py-0.5 pr-0.5 pl-1.5 text-2xs text-secondary-foreground"
              title={item.snapshot.title}
            >
              <RecordKindMark
                providerId={from.provider}
                type={item.type}
                state={item.snapshot.state}
                className="size-3"
              />
              <span className="truncate">{item.snapshot.label}</span>
              <button
                type="button"
                aria-label={`Remove ${item.snapshot.label}`}
                className="rounded-xs p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  onPicks(removeItem(picks, from.connectionId, item.type, item.key));
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            ref={input}
            autoFocus
            disabled={needsReconnect}
            aria-label={`Search ${pluralLabels(records)}`}
            className="min-w-24 flex-1 bg-transparent py-0.5 text-xs text-accent-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed"
            placeholder={picked.length ? "Add more…" : "Search titles and descriptions…"}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {search.loading && (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
          )}
        </div>
        <p className="text-3xs leading-normal text-secondary-label">
          {search.narrowedTo && text.trim() && (
            <>
              Narrowed to{" "}
              {search.narrowedTo.map((where, index) => (
                <span key={where}>
                  {index > 0 && ", "}
                  <span className="rounded-xs bg-accent px-1 py-px text-secondary-foreground">
                    {where}
                  </span>
                </span>
              ))}
              .{" "}
            </>
          )}
          {text.trim() ? records.hint.typing : records.hint.idle}
        </p>
        <div className="flex items-center gap-3">
          {records.filters.includes("type") && types.length > 1 && (
            <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
              {[["", "All"] as const, ...types.map(([id, declared]) => [id, capitalized(declared.plural)] as const)].map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={needsReconnect}
                    aria-pressed={type === value}
                    onClick={() => setType(value)}
                    className={cn(
                      "rounded-sm px-2 py-0.5 text-2xs text-muted-foreground",
                      type === value && "bg-card text-secondary-foreground shadow-xs",
                    )}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
          )}
          {records.filters.includes("includeClosed") && (
            <label className="flex items-center gap-1.5 text-2xs text-secondary-label">
              <input
                type="checkbox"
                className="size-3.5 accent-primary"
                disabled={needsReconnect}
                checked={includeClosed}
                onChange={(event) => setIncludeClosed(event.target.checked)}
              />
              Include closed
            </label>
          )}
        </div>
      </div>

      <div className="min-h-0">
        <div className="flex justify-between text-2xs text-secondary-label">
          <span className="flex items-center gap-1.5">
            {search.loading
              ? `Searching ${provider.name}…`
              : search.total === undefined
                ? ""
                : `${search.total} matching`}
          </span>
          <span className={cn(count >= MAX_ATTACHED_ITEMS && "text-warning-foreground")}>
            {count} of {MAX_ATTACHED_ITEMS} picked
          </span>
        </div>
        <SearchErrorLine
          error={search.error}
          needsReconnect={needsReconnect}
          provider={provider}
          onReconnect={onReconnect}
        />
        <div
          role="listbox"
          aria-multiselectable
          aria-label="Results"
          aria-busy={search.loading}
          className={cn(
            "mt-2 max-h-80 min-h-15 overflow-y-auto border-t border-border/60 transition-opacity",
            (search.loading || search.stale) && "opacity-50",
          )}
          onScroll={(event) => {
            const list = event.currentTarget;
            if (list.scrollHeight - list.scrollTop - list.clientHeight < 80)
              void search.loadMore();
          }}
        >
          {search.results.map((result) => {
            const checked = isPicked(picks, result);
            const disabled = !checked && !canPick(picks, connection.id);
            const state = records.types[result.type]?.states[result.state]?.label ?? result.state;
            return (
              <div
                key={`${result.type}:${result.key}`}
                role="option"
                aria-selected={checked}
                aria-disabled={disabled || undefined}
                onClick={() => !disabled && toggle(result)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-border/60 px-1 py-3 hover:bg-accent/50",
                  disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
                )}
              >
                <input
                  type="checkbox"
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="size-3.75 shrink-0 accent-primary"
                  checked={checked}
                  disabled={disabled}
                />
                <span className="min-w-0 flex-1">
                  <small className="flex items-center gap-1.5 text-3xs text-muted-foreground">
                    <RecordKindMark
                      providerId={provider.id}
                      type={result.type}
                      state={result.state}
                      className="size-3"
                    />
                    {result.where} · {state} · {ago(result.updatedAt)}
                  </small>
                  <span className="mt-1.5 block truncate text-xs text-secondary-foreground">
                    {highlighted(result.title, words)}
                  </span>
                </span>
              </div>
            );
          })}
          {!search.loading && !search.error && !needsReconnect && search.results.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nothing matches{text.trim() ? ` “${text.trim()}”` : ""}.
            </p>
          )}
          {search.hasMore && (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 py-2 text-2xs text-secondary-label hover:text-foreground"
              onClick={() => void search.loadMore()}
            >
              {search.loadingMore && <LoaderCircle className="size-3 animate-spin" />}
              {search.loadingMore ? "Loading more…" : "Load more"}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="max-w-60 text-3xs leading-normal text-secondary-label">
          {count
            ? `The agent reads these first and can still search ${connection.accountLabel}.`
            : `With nothing picked, the agent searches ${connection.accountLabel} when it needs to.`}
        </span>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onApply}>
            {count
              ? `Attach ${count} ${count === 1 ? "item" : "items"}`
              : `Ask about ${connection.accountLabel}`}
          </Button>
        </div>
      </div>
    </>
  );
}
