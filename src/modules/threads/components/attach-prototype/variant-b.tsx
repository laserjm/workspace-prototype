"use client";
// PROTOTYPE, throwaway. Variant B, "Query palette": a palette above the composer whose input IS
// the GitHub search query. Quick toggles and completions edit the query text; picks land in the
// composer immediately (no apply step).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { CONNECTIONS, connectionById, facets, parseQuery, search, toQuery } from "./fixtures";
import type { DraftApi } from "./draft";
import { ConnectionIcon, DraftChips, ItemRow, LimitNote, QueryLine } from "./parts";

const TOGGLES = [
  { token: "is:issue", label: "Issues" },
  { token: "is:pr", label: "Pull requests" },
  { token: "is:open", label: "Open" },
  { token: "assignee:@me", label: "Assigned to me" },
  { token: "review-requested:@me", label: "Review requested" },
  { token: "author:@me", label: "Mine" },
];

const hasToken = (raw: string, token: string) => raw.split(/\s+/).includes(token);
const toggleToken = (raw: string, token: string) =>
  hasToken(raw, token) ? raw.split(/\s+/).filter((t) => t && t !== token).join(" ") + " " : `${raw.trimEnd()} ${token} `.trimStart();

export function VariantB({ draft }: { draft: DraftApi }) {
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(CONNECTIONS[0].id);
  const [raw, setRaw] = useState("is:open ");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const connection = connectionById(connectionId);
  const filter = parseQuery(raw);
  const results = search(connectionId, filter);
  const { labels, people } = facets(connectionId);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Completions for the qualifier being typed.
  const last = raw.endsWith(" ") ? "" : (raw.split(/\s+/).pop() ?? "");
  const match = /^(repo|label|author|assignee|review-requested|is):(.*)$/.exec(last);
  const completions = match
    ? ({
        repo: connection.repos,
        label: labels,
        author: ["@me", ...people],
        assignee: ["@me", ...people],
        "review-requested": ["@me", ...people],
        is: ["issue", "pr", "open", "closed", "merged"],
      }[match[1]] ?? []).filter((value) => value.startsWith(match[2]) && value !== match[2])
    : [];

  function complete(value: string) {
    setRaw(raw.slice(0, raw.length - last.length) + `${match![1]}:${value} `);
    input.current?.focus();
  }

  if (!open)
    return (
      <button type="button" className={cn(inlineTriggerClassName, "shrink-0 py-1")} onClick={() => setOpen(true)}>
        <Search />
        <span>Search issues, pull requests and pages…</span>
        <kbd className="ml-1 rounded-xs border border-border px-1 font-mono text-4xs">⌘K</kbd>
      </button>
    );

  return (
    <>
      <button type="button" className={cn(inlineTriggerClassName, "shrink-0 py-1 text-foreground")} onClick={() => setOpen(false)}>
        <Search />
        <span>Searching {connection.name}</span>
      </button>
      <div className="absolute inset-x-0 bottom-full z-40 mb-2 flex max-h-[min(460px,62svh)] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-popover">
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-2">
          <label className="relative flex items-center gap-1 rounded-md bg-muted py-1 pr-5 pl-1.5 text-2xs text-secondary-foreground">
            <ConnectionIcon connection={connection} />
            <select
              aria-label="Connection"
              className="appearance-none bg-transparent outline-none"
              value={connectionId}
              onChange={(event) => {
                setConnectionId(event.target.value);
                setActive(0);
              }}
            >
              {CONNECTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1 size-3" />
          </label>
          <input
            ref={input}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-placeholder"
            placeholder="is:pr review-requested:@me checkout"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Tab" && completions.length) {
                event.preventDefault();
                complete(completions[0]);
              } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (!draft.draft.length) draft.attachConnection(connectionId);
                setOpen(false);
              } else if (event.key === "Enter") {
                event.preventDefault();
                const item = results[active];
                if (item) draft.toggle(connectionId, item.key);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
          />
          <button type="button" aria-label="Close" className="rounded-sm p-1 text-muted-foreground hover:bg-accent" onClick={() => setOpen(false)}>
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
          {completions.length ? (
            <>
              <span className="text-3xs text-muted-foreground">{match![1]}:</span>
              {completions.slice(0, 8).map((value, index) => (
                <button key={value} type="button" onClick={() => complete(value)} className={cn("rounded-sm border border-border px-1.5 font-mono text-3xs hover:bg-accent", index === 0 && "border-ring")}>
                  {value}
                  {index === 0 && <span className="ml-1 text-muted-foreground">⇥</span>}
                </button>
              ))}
            </>
          ) : (
            <>
              {connection.provider === "github" &&
                TOGGLES.map((toggle) => (
                  <button
                    key={toggle.token}
                    type="button"
                    onClick={() => {
                      setRaw(toggleToken(raw, toggle.token));
                      input.current?.focus();
                    }}
                    className={cn("rounded-full border border-border px-2 text-3xs leading-5", hasToken(raw, toggle.token) ? "border-blue-600 bg-blue-600 text-white" : "text-muted-foreground hover:bg-accent")}
                  >
                    {toggle.label}
                  </button>
                ))}
              <span className="mx-1 h-3 w-px bg-border" />
              {connection.repos.map((repo) => (
                <button
                  key={repo}
                  type="button"
                  onClick={() => {
                    setRaw(toggleToken(raw, `repo:${repo}`));
                    input.current?.focus();
                  }}
                  className={cn("rounded-full border border-dashed border-border px-2 text-3xs leading-5", hasToken(raw, `repo:${repo}`) ? "border-solid border-blue-600 bg-blue-600 text-white" : "text-muted-foreground hover:bg-accent")}
                >
                  {repo.split("/").pop()}
                </button>
              ))}
            </>
          )}
        </div>
        {draft.draft.length > 0 && (
          <div className="flex items-start gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
            <span className="mt-1 shrink-0 text-3xs text-muted-foreground">In your question</span>
            <DraftChips draft={draft.draft} withTitle={false} onRemove={draft.remove} />
          </div>
        )}
        <div role="listbox" aria-multiselectable className="min-h-0 flex-1 overflow-y-auto py-1">
          {results.map((item, index) => (
            <ItemRow
              key={item.key}
              item={item}
              checkbox={false}
              active={index === active}
              checked={draft.has(connectionId, item.key)}
              disabled={draft.full}
              onToggle={() => {
                setActive(index);
                draft.toggle(connectionId, item.key);
                input.current?.focus();
              }}
            />
          ))}
          {!results.length && <p className="p-6 text-center text-xs text-muted-foreground">No results for this query.</p>}
        </div>
        <footer className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-3xs text-muted-foreground">
          <span>↑↓ move · ⏎ pick · ⇥ complete · esc close</span>
          <span className="flex-1" />
          <LimitNote count={draft.count} />
          {!draft.draft.some((entry) => entry.connectionId === connectionId) && (
            <button
              type="button"
              className="text-info-foreground"
              onClick={() => {
                draft.attachConnection(connectionId);
                setOpen(false);
              }}
            >
              ⌘⏎ ask {connection.name} without items
            </button>
          )}
        </footer>
        <div className="border-t border-border bg-muted/40 px-3 py-1">
          <QueryLine query={toQuery(filter, connection)} />
        </div>
      </div>
    </>
  );
}
