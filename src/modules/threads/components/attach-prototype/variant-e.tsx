"use client";
// PROTOTYPE, throwaway. Variants E and F, "Simple dialog": the shape of today's
// SourceScopeDialog (title, connection, one search field, a list, one button), with no facets.
//
// E · Typeahead + list: typing (or just focusing) the field opens suggestions under it; a pick
//     joins the "Attached" list below, which shows each item in full with a remove button.
// F · Chips in the field: the field holds the picks as chips (Backspace removes the last); the
//     list below IS the live result list, with checkboxes, like today's dialog.
//
// Both: one field that matches title, number (`482`, `#482`), repository and label; two quiet
// toggles (type, include closed); suggestions "involving you" before typing; Attach applies,
// and with nothing picked the button asks about the connection itself.
import { Fragment, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { ago, CONNECTIONS, connectionById, ITEMS, itemByKey, LIMIT, VIEWER, type Connection, type Item } from "./fixtures";
import { useDraft, type DraftApi } from "./draft";
import { ConnectionIcon, ItemMark, Labels, Segmented } from "./parts";

type Mode = "list" | "chips";
type Kind = "any" | "issue" | "pr";

export function VariantEEntry({ draft, mode }: { draft: DraftApi; mode: Mode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cn(inlineTriggerClassName, "shrink-0 py-1")} onClick={() => setOpen(true)}>
        <Plus />
        <span>{draft.draft.length ? "Change data sources" : "Choose a data source"}</span>
      </button>
      {open && <SimpleAttachDialog draft={draft} mode={mode} onClose={() => setOpen(false)} />}
    </>
  );
}

// --- matching ---------------------------------------------------------------------------------

const words = (query: string) => query.toLowerCase().replace(/#/g, " ").split(/\s+/).filter(Boolean);

function matches(item: Item, query: string) {
  const haystack = `${item.title} ${item.repo} ${item.number} ${item.labels.join(" ")}`.toLowerCase();
  return words(query).every((word) => (/^\d+$/.test(word) ? String(item.number).startsWith(word) : haystack.includes(word)));
}

const involvesViewer = (item: Item) =>
  item.author === VIEWER || item.assignees.includes(VIEWER) || item.reviewRequested.includes(VIEWER);

function find(connectionId: string, query: string, kind: Kind, includeClosed: boolean) {
  const pool = ITEMS.filter(
    (item) =>
      item.connectionId === connectionId &&
      (kind === "any" || item.kind === kind) &&
      (includeClosed || item.state === "open" || item.state === "draft" || item.state === "current"),
  );
  if (!query.trim()) {
    // Before typing: what involves you first, then the rest, both by last update.
    return [...pool].sort((a, b) => Number(involvesViewer(b)) - Number(involvesViewer(a)) || a.updated - b.updated);
  }
  return pool.filter((item) => matches(item, query)).sort((a, b) => a.updated - b.updated);
}

/** Bolds the typed words in a title. */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = words(query).filter((word) => !/^\d+$/.test(word));
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 ? (
          <mark key={index} className="bg-transparent font-semibold text-foreground">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const where = (item: Item) => (item.kind === "page" ? item.repo : `${item.repo} #${item.number}`);

// --- the dialog -------------------------------------------------------------------------------

function SimpleAttachDialog({ draft, mode, onClose }: { draft: DraftApi; mode: Mode; onClose: () => void }) {
  const local = useDraft(draft.draft);
  const [connectionId, setConnectionId] = useState(draft.draft[0]?.connectionId ?? CONNECTIONS[0].id);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("any");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [popup, setPopup] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const connection = connectionById(connectionId);
  const github = connection.provider === "github";
  const noun = github ? "issues and pull requests" : "pages";
  const results = find(connectionId, query, github ? kind : "any", includeClosed);
  const shown = mode === "list" ? results.slice(0, 7) : results;
  const picked = local.draft.flatMap((entry) =>
    entry.keys.map((key) => itemByKey(entry.connectionId, key)).filter((item): item is Item => !!item),
  );

  function toggle(item: Item) {
    local.toggle(item.connectionId, item.key);
    if (mode === "list") {
      setQuery("");
      setActive(0);
    }
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPopup(true);
      setActive((index) => Math.min(index + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = shown[active];
      if (item && (popup || mode === "chips")) toggle(item);
    } else if (event.key === "Escape" && popup && mode === "list") {
      // First Escape closes the suggestions, the second the dialog.
      event.preventDefault();
      event.stopPropagation();
      setPopup(false);
    } else if (event.key === "Backspace" && !query && mode === "chips" && picked.length) {
      const last = picked[picked.length - 1];
      local.remove(last.connectionId, last.key);
    }
  }

  const field = (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1.5 text-icon-muted focus-within:border-ring",
        mode === "chips" && "min-h-9 cursor-text",
      )}
      onClick={() => input.current?.focus()}
    >
      <Search size={15} className="shrink-0" />
      {mode === "chips" &&
        picked.map((item) => (
          <span key={`${item.connectionId}:${item.key}`} className="inline-flex max-w-48 items-center gap-1 rounded-xs bg-accent py-0.5 pr-0.5 pl-1.5 text-2xs text-secondary-foreground">
            <ItemMark item={item} className="size-3" />
            <span className="truncate">{item.kind === "page" ? item.title : `${item.repo.split("/").pop()}#${item.number}`}</span>
            <button
              type="button"
              aria-label={`Remove ${item.title}`}
              className="rounded-xs p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                local.remove(item.connectionId, item.key);
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      <input
        ref={input}
        autoFocus
        role="combobox"
        aria-expanded={mode === "list" ? popup : undefined}
        aria-controls={listId}
        aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-xs text-accent-foreground outline-none placeholder:text-placeholder"
        placeholder={picked.length && mode === "chips" ? "Add more…" : github ? "Search by title, number or repository…" : "Search pages…"}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setPopup(true);
        }}
        onFocus={() => setPopup(true)}
        onBlur={() => setPopup(false)}
        onKeyDown={onKeyDown}
      />
      {query && (
        <button type="button" aria-label="Clear search" className="rounded-xs p-0.5 hover:text-foreground" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery("")}>
          <X size={13} />
        </button>
      )}
    </div>
  );

  const toggles = github && (
    <div className="flex items-center gap-3">
      <Segmented
        value={kind}
        onChange={(value) => {
          setKind(value);
          setActive(0);
        }}
        options={[
          { value: "any", label: "All" },
          { value: "issue", label: "Issues" },
          { value: "pr", label: "Pull requests" },
        ]}
      />
      <label className="flex items-center gap-1.5 text-2xs text-secondary-label">
        <input type="checkbox" className="size-3.5 accent-blue-600" checked={includeClosed} onChange={(event) => setIncludeClosed(event.target.checked)} />
        Include closed
      </label>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Attach {noun}</DialogTitle>
          <DialogDescription>Pick what your question is about. You can attach up to {LIMIT}.</DialogDescription>
        </DialogHeader>

        <ConnectionRow connection={connection} onChange={(id) => { setConnectionId(id); setQuery(""); setActive(0); }} />

        <div className="flex flex-col gap-2.5">
          {mode === "list" ? (
            <div className="relative">
              {field}
              {popup && (
                <Suggestions
                  id={listId}
                  items={shown}
                  total={results.length}
                  query={query}
                  active={active}
                  full={local.full}
                  isPicked={(item) => local.has(item.connectionId, item.key)}
                  onHover={setActive}
                  onPick={toggle}
                  noun={noun}
                />
              )}
            </div>
          ) : (
            field
          )}
          {toggles}
        </div>

        {mode === "list" ? (
          <AttachedList items={picked} onRemove={(item) => local.remove(item.connectionId, item.key)} onClear={local.clear} connection={connection} />
        ) : (
          <ResultList
            id={listId}
            items={shown}
            query={query}
            active={active}
            full={local.full}
            isPicked={(item) => local.has(item.connectionId, item.key)}
            onToggle={toggle}
            count={local.count}
            noun={noun}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="max-w-60 text-3xs leading-normal text-secondary-label">
            {local.count
              ? `The agent reads these first and can still search ${connection.name}.`
              : `With nothing picked, the agent searches ${connection.name} when it needs to.`}
          </span>
          <Button
            onClick={() => {
              draft.setDraft(local.count ? local.draft.filter((entry) => entry.keys.length) : [{ connectionId, keys: [] }]);
              onClose();
            }}
          >
            {local.count ? `Attach ${local.count} ${local.count === 1 ? "item" : "items"}` : `Ask about ${connection.name}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionRow({ connection, onChange }: { connection: Connection; onChange: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
        <ConnectionIcon connection={connection} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-xs font-medium">{connection.name}</strong>
        <small className="mt-1 block text-3xs text-secondary-label">{connection.reach}</small>
      </div>
      {CONNECTIONS.length > 1 && (
        <label className="relative flex items-center text-2xs text-blue-600 dark:text-blue-300">
          <span className="pr-4">Switch</span>
          <ChevronDown className="pointer-events-none absolute right-0 size-3" />
          <select aria-label="Connection" className="absolute inset-0 cursor-pointer opacity-0" value={connection.id} onChange={(event) => onChange(event.target.value)}>
            {CONNECTIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function Option({
  id,
  item,
  query,
  active,
  picked,
  disabled,
  checkbox,
  onHover,
  onPick,
}: {
  id: string;
  item: Item;
  query: string;
  active: boolean;
  picked: boolean;
  disabled: boolean;
  checkbox?: boolean;
  onHover?: () => void;
  onPick: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={picked}
      aria-disabled={disabled && !picked}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={onHover}
      onClick={() => (!disabled || picked) && onPick()}
      className={cn(
        "flex cursor-pointer items-center gap-3 px-2 py-2",
        active && "bg-accent",
        checkbox && "border-b border-border/60 px-1 py-3 hover:bg-accent/50",
        disabled && !picked && "cursor-not-allowed opacity-45",
      )}
    >
      {checkbox ? (
        <input type="checkbox" readOnly tabIndex={-1} className="size-3.75 shrink-0 accent-blue-600" checked={picked} disabled={disabled && !picked} />
      ) : (
        <ItemMark item={item} />
      )}
      <span className="min-w-0 flex-1">
        <small className="flex items-center gap-1.5 text-3xs text-muted-foreground">
          {checkbox && <ItemMark item={item} className="size-3" />}
          {where(item)} · {item.state} · {ago(item.updated)}
          <Labels labels={item.labels} max={2} />
        </small>
        <span className={cn("block truncate text-xs text-secondary-foreground", checkbox ? "mt-1.5" : "mt-0.5")}>
          <Highlight text={item.title} query={query} />
        </span>
      </span>
      {!checkbox && picked && <Check className="size-3.5 shrink-0 text-blue-600 dark:text-blue-300" />}
    </div>
  );
}

function Suggestions({
  id,
  items,
  total,
  query,
  active,
  full,
  isPicked,
  onHover,
  onPick,
  noun,
}: {
  id: string;
  items: Item[];
  total: number;
  query: string;
  active: number;
  full: boolean;
  isPicked: (item: Item) => boolean;
  onHover: (index: number) => void;
  onPick: (item: Item) => void;
  noun: string;
}) {
  return (
    <div id={id} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-popover">
      <p className="px-2 pt-2 pb-1 text-3xs font-medium text-muted-foreground">{query ? "Matches" : "Suggested · involving you first"}</p>
      <div className="max-h-72 overflow-y-auto">
        {items.map((item, index) => (
          <Option
            key={item.key}
            id={`${id}-${index}`}
            item={item}
            query={query}
            active={index === active}
            picked={isPicked(item)}
            disabled={full}
            onHover={() => onHover(index)}
            onPick={() => onPick(item)}
          />
        ))}
        {!items.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">No {noun} match “{query}”.</p>}
      </div>
      <Hint>
        {full ? `${LIMIT} of ${LIMIT} attached. Remove one to add another.` : total > items.length ? `${items.length} of ${total} · keep typing to narrow` : "↑↓ to move · Enter to add · Esc to close"}
      </Hint>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="border-t border-border bg-muted/50 px-2 py-1.5 text-3xs text-muted-foreground">{children}</p>;
}

function AttachedList({ items, onRemove, onClear, connection }: { items: Item[]; onRemove: (item: Item) => void; onClear: () => void; connection: Connection }) {
  return (
    <div>
      <div className="flex justify-between text-2xs text-secondary-label">
        <span>
          {items.length ? `${items.length} attached` : "Nothing attached yet"}
          <span className="text-muted-foreground"> · up to {LIMIT}</span>
        </span>
        {items.length > 0 && (
          <button type="button" className="text-blue-600 dark:text-blue-300" onClick={onClear}>
            Remove all
          </button>
        )}
      </div>
      <ul className="mt-2 max-h-72 min-h-40 overflow-y-auto border-t border-border/60">
        {items.map((item) => (
          <li key={`${item.connectionId}:${item.key}`} className="group flex items-center gap-3 border-b border-border/60 px-1 py-3 animate-in fade-in-0 slide-in-from-top-1">
            <ItemMark item={item} />
            <span className="min-w-0 flex-1">
              <small className="block text-3xs text-muted-foreground">
                {item.connectionId !== connection.id && `${connectionById(item.connectionId).name} · `}
                {where(item)} · {item.state}
              </small>
              <span className="mt-1 block truncate text-xs text-secondary-foreground">{item.title}</span>
            </span>
            <button type="button" aria-label={`Remove ${item.title}`} className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => onRemove(item)}>
              <X size={14} />
            </button>
          </li>
        ))}
        {!items.length && (
          <li className="px-6 py-10 text-center text-xs leading-relaxed text-muted-foreground">
            Search above and pick from the suggestions.
            <br />
            Or attach nothing and just ask about {connection.name}.
          </li>
        )}
      </ul>
    </div>
  );
}

function ResultList({
  id,
  items,
  query,
  active,
  full,
  isPicked,
  onToggle,
  count,
  noun,
}: {
  id: string;
  items: Item[];
  query: string;
  active: number;
  full: boolean;
  isPicked: (item: Item) => boolean;
  onToggle: (item: Item) => void;
  count: number;
  noun: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-2xs text-secondary-label">
        <span>{query ? `${items.length} matching` : "Involving you first, then recently updated"}</span>
        <span className={cn(full && "text-warning-foreground")}>
          {count} of {LIMIT} picked
        </span>
      </div>
      <div id={id} role="listbox" aria-multiselectable className="mt-2 max-h-80 min-h-15 overflow-y-auto border-t border-border/60">
        {items.map((item, index) => (
          <Option key={item.key} id={`${id}-${index}`} checkbox item={item} query={query} active={index === active && !!query} picked={isPicked(item)} disabled={full} onPick={() => onToggle(item)} />
        ))}
        {!items.length && <p className="py-6 text-center text-xs text-muted-foreground">No {noun} match “{query}”.</p>}
      </div>
    </div>
  );
}
