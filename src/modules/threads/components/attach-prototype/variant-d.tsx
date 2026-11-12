"use client";
// PROTOTYPE, throwaway. Variant D, "Browse sheet": a non-modal sheet on the right, like GitHub's
// own dashboard. Presets (assigned, review requested, created) and repositories come first;
// filters are secondary. Every tick writes straight into the composer below, which stays usable.
import { useState } from "react";
import { FolderGit2, Inbox, ListFilter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { CONNECTIONS, connectionById, EMPTY_FILTER, facets, PRESETS, search, toQuery, type Filter } from "./fixtures";
import type { DraftApi } from "./draft";
import { ConnectionIcon, ItemRow, LimitNote, QueryLine, Segmented } from "./parts";

type Place = { kind: "preset"; id: string } | { kind: "repo"; repo: string };

export function VariantD({ draft }: { draft: DraftApi }) {
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(CONNECTIONS[0].id);
  const [place, setPlace] = useState<Place>({ kind: "preset", id: "assigned" });
  const [refine, setRefine] = useState<Partial<Filter>>({});
  const [showFilters, setShowFilters] = useState(false);
  const connection = connectionById(connectionId);
  const github = connection.provider === "github";
  const placeFilter = (p: Place): Filter =>
    p.kind === "preset"
      ? { ...EMPTY_FILTER, ...(github ? PRESETS.find((preset) => preset.id === p.id)?.filter : {}) }
      : { ...EMPTY_FILTER, repos: [p.repo] };
  const filter: Filter = { ...placeFilter(place), ...refine };
  const results = search(connectionId, filter);
  const groups = Object.entries(Object.groupBy(results, (item) => item.repo));
  const { labels } = facets(connectionId);
  const presets = github ? PRESETS : PRESETS.filter((preset) => preset.id === "recent" || preset.id === "created");

  return (
    <>
      <button type="button" className={cn(inlineTriggerClassName, "shrink-0 py-1", open && "text-foreground")} onClick={() => setOpen(!open)}>
        <Inbox />
        <span>{open ? "Browsing" : "Browse issues and pull requests"}</span>
      </button>
      {open && (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(40rem,94vw)] border-l border-border bg-background shadow-popover" aria-label="Browse (prototype)">
          <nav className="flex w-48 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-sidebar p-2">
            <div className="flex flex-col gap-0.5">
              {CONNECTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setConnectionId(entry.id);
                    setPlace({ kind: "preset", id: entry.provider === "github" ? "assigned" : "recent" });
                    setRefine({});
                  }}
                  className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-left text-2xs", entry.id === connectionId ? "bg-sidebar-row-active text-foreground" : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover")}
                >
                  <ConnectionIcon connection={entry} className="size-3" />
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="px-2 text-4xs font-medium tracking-wide text-muted-foreground uppercase">For you</h3>
              {presets.map((preset) => {
                const p: Place = { kind: "preset", id: preset.id };
                const count = search(connectionId, placeFilter(p)).length;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setPlace(p);
                      setRefine({});
                    }}
                    className={cn("flex items-center justify-between rounded-md px-2 py-1 text-2xs", place.kind === "preset" && place.id === preset.id ? "bg-sidebar-row-active text-foreground" : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover")}
                  >
                    {preset.label}
                    <span className="text-4xs tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className="px-2 text-4xs font-medium tracking-wide text-muted-foreground uppercase">{github ? "Repositories" : "Spaces"}</h3>
              {connection.repos.map((repo) => (
                <button
                  key={repo}
                  type="button"
                  onClick={() => {
                    setPlace({ kind: "repo", repo });
                    setRefine({});
                  }}
                  className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-2xs", place.kind === "repo" && place.repo === repo ? "bg-sidebar-row-active text-foreground" : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover")}
                >
                  <FolderGit2 className="size-3 shrink-0" />
                  <span className="truncate">{repo.split("/").pop()}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex flex-col gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-sm font-medium">
                  {place.kind === "preset" ? PRESETS.find((p) => p.id === place.id)?.label : place.repo}
                </h2>
                <button type="button" aria-label="Close" className="rounded-sm p-1 text-muted-foreground hover:bg-accent" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2 py-1 focus-within:border-ring">
                  <Search className="size-3.5 shrink-0 text-icon-muted" />
                  <input className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-placeholder" placeholder="Filter by text or #number" value={refine.text ?? ""} onChange={(event) => setRefine({ ...refine, text: event.target.value })} />
                </label>
                {github && (
                  <Button variant={showFilters ? "secondary" : "ghost"} size="sm" onClick={() => setShowFilters(!showFilters)}>
                    <ListFilter /> Filters
                  </Button>
                )}
              </div>
              {github && showFilters && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented value={filter.type} onChange={(type) => setRefine({ ...refine, type })} options={[{ value: "any", label: "All" }, { value: "issue", label: "Issues" }, { value: "pr", label: "PRs" }]} />
                    <Segmented value={filter.state} onChange={(state) => setRefine({ ...refine, state })} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "any", label: "All" }]} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {labels.map((label) => {
                      const on = filter.labels.includes(label);
                      return (
                        <button key={label} type="button" onClick={() => setRefine({ ...refine, labels: on ? filter.labels.filter((l) => l !== label) : [...filter.labels, label] })} className={cn("rounded-full border border-border px-1.5 text-4xs leading-4.5", on ? "border-blue-600 bg-blue-600 text-white" : "text-muted-foreground hover:bg-accent")}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <QueryLine query={toQuery(filter, connection)} />
            </header>
            <div role="listbox" aria-multiselectable className="min-h-0 flex-1 overflow-y-auto">
              {groups.map(([repo, items]) => (
                <section key={repo}>
                  {place.kind === "preset" && <h4 className="sticky top-0 border-b border-border/60 bg-background/95 px-3 py-1 text-3xs font-medium text-muted-foreground">{repo}</h4>}
                  {items!.map((item) => (
                    <ItemRow key={item.key} item={item} showRepo={false} checked={draft.has(connectionId, item.key)} disabled={draft.full} onToggle={() => draft.toggle(connectionId, item.key)} />
                  ))}
                </section>
              ))}
              {!results.length && <p className="p-6 text-center text-xs text-muted-foreground">Nothing here.</p>}
            </div>
            <footer className="flex items-center gap-3 border-t border-border p-3">
              <span className="text-2xs text-secondary-foreground">{draft.count ? `${draft.count} in your next question` : "Tick items to add them to your question"}</span>
              <LimitNote count={draft.count} />
              <span className="flex-1" />
              {!draft.draft.some((entry) => entry.connectionId === connectionId) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    draft.attachConnection(connectionId);
                    setOpen(false);
                  }}
                >
                  Ask {connection.name} itself
                </Button>
              )}
              <Button size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </footer>
          </div>
        </aside>
      )}
    </>
  );
}
