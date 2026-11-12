"use client";
// PROTOTYPE, throwaway. Pieces every variant shares: marks, result rows, chips, the tray.
import { BookOpen, CircleCheck, CircleDot, GitMerge, GitPullRequest, GitPullRequestDraft, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { attachmentChipClassName } from "../attachment-chip";
import { ago, connectionById, itemByKey, LIMIT, shortRef, type Connection, type Item } from "./fixtures";
import type { Draft } from "./draft";

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-3.5 fill-current", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function ConnectionIcon({ connection, className }: { connection: Connection; className?: string }) {
  return connection.provider === "github" ? (
    <GithubMark className={className} />
  ) : (
    <BookOpen className={cn("size-3.5 text-blue-600 dark:text-sky-300", className)} />
  );
}

const TONE = {
  open: "text-emerald-600 dark:text-emerald-400",
  merged: "text-violet-600 dark:text-violet-400",
  closed: "text-red-600 dark:text-red-400",
  muted: "text-muted-foreground",
  page: "text-blue-600 dark:text-sky-300",
};

/** The kind icon in its state colour, as GitHub draws it. */
export function ItemMark({ item, className }: { item: Item; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  if (item.kind === "page") return <BookOpen className={cn(c, TONE.page)} />;
  if (item.kind === "issue")
    return item.state === "open" ? <CircleDot className={cn(c, TONE.open)} /> : <CircleCheck className={cn(c, TONE.merged)} />;
  if (item.state === "merged") return <GitMerge className={cn(c, TONE.merged)} />;
  if (item.state === "draft") return <GitPullRequestDraft className={cn(c, TONE.muted)} />;
  if (item.state === "closed") return <GitPullRequest className={cn(c, TONE.closed)} />;
  return <GitPullRequest className={cn(c, TONE.open)} />;
}

export function Labels({ labels, max = 3 }: { labels: string[]; max?: number }) {
  return (
    <>
      {labels.slice(0, max).map((label) => (
        <span key={label} className="rounded-full border border-border px-1.5 text-4xs leading-4 text-muted-foreground">
          {label}
        </span>
      ))}
      {labels.length > max && <span className="text-4xs text-muted-foreground">+{labels.length - max}</span>}
    </>
  );
}

/** One search result. `checkbox` for list-style pickers, plain for palette-style ones. */
export function ItemRow({
  item,
  checked,
  disabled,
  active,
  checkbox = true,
  showRepo = true,
  onToggle,
}: {
  item: Item;
  checked: boolean;
  disabled?: boolean;
  active?: boolean;
  checkbox?: boolean;
  showRepo?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      disabled={disabled && !checked}
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-45",
        active && "bg-accent",
        checked && !checkbox && "bg-info/10",
      )}
    >
      {checkbox && (
        <span
          className={cn(
            "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-input",
            checked && "border-blue-600 bg-blue-600 text-white",
          )}
        >
          {checked && <svg viewBox="0 0 12 12" className="size-2.5 fill-none stroke-current stroke-2"><path d="M2.5 6.5l2.2 2L9.5 3.5" /></svg>}
        </span>
      )}
      <ItemMark item={item} className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-secondary-foreground">{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-3xs text-muted-foreground">
          <span>
            {showRepo ? item.repo : ""}
            {item.kind !== "page" && ` #${item.number}`}
          </span>
          <span>· {item.kind === "page" ? `by ${item.author}` : `${item.state === "draft" ? "draft" : item.state} by ${item.author}`}</span>
          <span>· {ago(item.updated)}</span>
          {item.comments > 0 && (
            <span className="inline-flex items-center gap-0.5">
              · <MessageSquare className="size-2.5" />
              {item.comments}
            </span>
          )}
          <Labels labels={item.labels} />
        </span>
      </span>
      {!checkbox && checked && <span className="mt-0.5 text-3xs text-info-foreground">Selected</span>}
    </button>
  );
}

/** A chip for an attached item, or for a connection attached with no items. */
export function AttachedChip({
  connectionId,
  itemKey,
  onRemove,
  onClick,
  withTitle = true,
}: {
  connectionId: string;
  itemKey?: string;
  onRemove?: () => void;
  onClick?: () => void;
  withTitle?: boolean;
}) {
  const connection = connectionById(connectionId);
  const item = itemKey ? itemByKey(connectionId, itemKey) : undefined;
  const label = item ? shortRef(item) : connection.name;
  return (
    <span className={cn(attachmentChipClassName, "max-w-72", !item && "border-dashed")} title={item ? `${item.repo} #${item.number} · ${item.title}` : `${connection.name}: no items, the agent may search it`}>
      <button type="button" className="flex min-w-0 items-center gap-1.5" onClick={onClick} disabled={!onClick}>
        {item ? <ItemMark item={item} /> : <ConnectionIcon connection={connection} />}
        <span className="shrink-0 font-medium text-secondary-foreground">{label}</span>
        {item && withTitle && item.kind !== "page" && <span className="truncate">{item.title}</span>}
        {!item && <span className="truncate">· whole connection</span>}
      </button>
      {onRemove && (
        <button type="button" className="flex shrink-0 rounded-xs" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/** Every chip of a draft, grouped by connection only when there is more than one. */
export function DraftChips({
  draft,
  onRemove,
  onClick,
  withTitle,
  className,
}: {
  draft: Draft;
  onRemove?: (connectionId: string, key?: string) => void;
  onClick?: (connectionId: string, key?: string) => void;
  withTitle?: boolean;
  className?: string;
}) {
  if (!draft.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {draft.flatMap((entry) =>
        entry.keys.length
          ? entry.keys.map((key) => (
              <AttachedChip
                key={`${entry.connectionId}:${key}`}
                connectionId={entry.connectionId}
                itemKey={key}
                withTitle={withTitle}
                onRemove={onRemove && (() => onRemove(entry.connectionId, key))}
                onClick={onClick && (() => onClick(entry.connectionId, key))}
              />
            ))
          : [
              <AttachedChip
                key={entry.connectionId}
                connectionId={entry.connectionId}
                onRemove={onRemove && (() => onRemove(entry.connectionId))}
                onClick={onClick && (() => onClick(entry.connectionId))}
              />,
            ],
      )}
    </div>
  );
}

export function LimitNote({ count }: { count: number }) {
  return (
    <span className={cn("text-3xs tabular-nums", count >= LIMIT ? "text-warning-foreground" : "text-muted-foreground")}>
      {count} of {LIMIT}
      {count >= LIMIT && " · remove one to add another"}
    </span>
  );
}

export function QueryLine({ query, className }: { query: string; className?: string }) {
  return (
    <code className={cn("block truncate font-mono text-3xs text-muted-foreground", className)} title={query}>
      q = {query}
    </code>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-md border border-border bg-muted p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[5px] px-2 py-0.5 text-2xs text-muted-foreground",
            value === option.value && "bg-card text-secondary-foreground shadow-xs",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A compact select for one facet; "" means unset. */
export function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-3xs text-muted-foreground">
      {label}
      <select
        className="h-7 min-w-0 rounded-md border border-border bg-card px-1.5 text-2xs text-secondary-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Anyone</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
