"use client";

import { useRef, useState, type KeyboardEvent } from "react";
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
  type Connection,
  type ProviderChoice,
  type RecordSummary,
} from "@/modules/integrations";
import {
  applyPicks,
  canPick,
  isPicked,
  itemCount,
  MAX_ATTACHED_ITEMS,
  removeItem,
  togglePick,
  type AttachedConnection,
  type ConnectionRef,
} from "../contracts";
import { useRecordSearch } from "./use-record-search";

/** A connection the dialog can search: its provider declares records. */
type Searchable = { connection: Connection; provider: ProviderChoice };

const refOf = ({ connection }: Searchable): ConnectionRef => ({
  connectionId: connection.id,
  provider: connection.providerId,
  label: connection.accountLabel,
});

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
  const [connectionId, setConnectionId] = useState(
    () =>
      attached.find((entry) =>
        searchable.some(({ connection }) => connection.id === entry.connectionId),
      )?.connectionId ?? searchable[0]?.connection.id,
  );
  const shown = searchable.find(({ connection }) => connection.id === connectionId);
  const [picks, setPicks] = useState(attached);

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
            picks={picks}
            onPicks={setPicks}
            onApply={() => {
              onApply(applyPicks(picks, refOf(shown)));
              onClose();
            }}
            onCancel={onClose}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>No data sources connected yet</DialogTitle>
              <DialogDescription>
                Connect one to attach its records to your question. Your draft stays here.
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
                Connect a data source
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectionSearch({
  shown,
  searchable,
  onSwitch,
  picks,
  onPicks,
  onApply,
  onCancel,
}: {
  shown: Searchable;
  searchable: Searchable[];
  onSwitch: (connectionId: string) => void;
  picks: readonly AttachedConnection[];
  onPicks: (picks: readonly AttachedConnection[]) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { connection, provider } = shown;
  const records = provider.records!;
  const types = Object.entries(records.types);
  const [text, setText] = useState("");
  const [type, setType] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const search = useRecordSearch({
    connectionId: connection.id,
    text,
    type,
    includeClosed,
  });
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
          <small className="mt-1 block truncate text-3xs text-secondary-label">
            {search.reach ?? (search.error ? "" : "Reading what this connection reaches…")}
          </small>
        </div>
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
          className="flex min-h-9 min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1.5 text-icon-muted focus-within:border-ring"
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
            aria-label={`Search ${pluralLabels(records)}`}
            className="min-w-24 flex-1 bg-transparent py-0.5 text-xs text-accent-foreground outline-none placeholder:text-placeholder"
            placeholder={picked.length ? "Add more…" : "Search titles and descriptions…"}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {search.loading && (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
          )}
        </div>
        <p className="text-3xs text-secondary-label">
          {text.trim()
            ? "Matches every word in titles and descriptions, best matches first."
            : "Most recently updated first. Type words to match titles and descriptions."}
        </p>
        <div className="flex items-center gap-3">
          {records.filters.includes("type") && types.length > 1 && (
            <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
              {[["", "All"] as const, ...types.map(([id, declared]) => [id, capitalized(declared.plural)] as const)].map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
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
        {search.error && (
          <p role="status" className="mt-2 text-2xs text-destructive-foreground">
            {search.error.message}
          </p>
        )}
        <div
          role="listbox"
          aria-multiselectable
          aria-label="Results"
          aria-busy={search.loading}
          className={cn(
            "mt-2 max-h-80 min-h-15 overflow-y-auto border-t border-border/60 transition-opacity",
            search.loading && "opacity-50",
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
                    {result.title}
                  </span>
                </span>
              </div>
            );
          })}
          {!search.loading && !search.error && search.results.length === 0 && (
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
