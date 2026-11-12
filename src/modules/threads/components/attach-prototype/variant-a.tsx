"use client";
// PROTOTYPE, throwaway. Variant A, "Dialog + facets": a modal with the connections and the
// facets on the left, the results on the right, and a tray that applies on "Attach".
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { CONNECTIONS, EMPTY_FILTER, facets, search, toQuery, VIEWER, type Filter } from "./fixtures";
import { useDraft, type DraftApi } from "./draft";
import { ConnectionIcon, DraftChips, FacetSelect, ItemRow, LimitNote, QueryLine, Segmented } from "./parts";

export function VariantAEntry({ draft }: { draft: DraftApi }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cn(inlineTriggerClassName, "shrink-0 py-1")} onClick={() => setOpen(true)}>
        <Plus />
        <span>{draft.draft.length ? "Attach more" : "Attach issues, pull requests or pages"}</span>
      </button>
      {open && <AttachDialog draft={draft} onClose={() => setOpen(false)} />}
    </>
  );
}

function AttachDialog({ draft, onClose }: { draft: DraftApi; onClose: () => void }) {
  // The dialog edits a copy; the composer only changes on "Attach".
  const local = useDraft(draft.draft);
  const [connectionId, setConnectionId] = useState(draft.draft[0]?.connectionId ?? CONNECTIONS[0].id);
  const [filters, setFilters] = useState<Record<string, Filter>>({});
  const connection = CONNECTIONS.find((entry) => entry.id === connectionId)!;
  const filter = filters[connectionId] ?? EMPTY_FILTER;
  const set = (change: Partial<Filter>) => setFilters((all) => ({ ...all, [connectionId]: { ...filter, ...change } }));
  const results = search(connectionId, filter);
  const { labels, people } = facets(connectionId);
  const github = connection.provider === "github";
  const peopleOptions = [{ value: "@me", label: `Me (${VIEWER})` }, ...people.filter((p) => p !== VIEWER).map((p) => ({ value: p, label: p }))];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(680px,90svh)] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 pt-5 pb-3">
          <DialogTitle>Attach to your question</DialogTitle>
          <DialogDescription>
            Pick items to ask about, or none to let the agent search the connection.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-3 max-md:hidden">
            <section>
              <h3 className="mb-1.5 px-1 text-3xs font-medium tracking-wide text-muted-foreground uppercase">Connection</h3>
              {CONNECTIONS.map((entry) => {
                const picked = local.draft.find((d) => d.connectionId === entry.id)?.keys.length ?? 0;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setConnectionId(entry.id)}
                    className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60", entry.id === connectionId && "bg-accent")}
                  >
                    <ConnectionIcon connection={entry} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-secondary-foreground">{entry.name}</span>
                      <span className="block text-3xs text-muted-foreground">{entry.reach}</span>
                    </span>
                    {picked > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-4xs leading-4 text-white">{picked}</span>}
                  </button>
                );
              })}
            </section>
            <section>
              <h3 className="mb-1.5 px-1 text-3xs font-medium tracking-wide text-muted-foreground uppercase">
                {github ? "Repository" : "Space"}
              </h3>
              {connection.repos.map((repo) => (
                <label key={repo} className="flex items-center gap-2 rounded-md px-2 py-1 text-2xs text-secondary-foreground hover:bg-accent/60">
                  <input
                    type="checkbox"
                    className="accent-blue-600"
                    checked={filter.repos.includes(repo)}
                    onChange={(event) => set({ repos: event.target.checked ? [...filter.repos, repo] : filter.repos.filter((r) => r !== repo) })}
                  />
                  {repo}
                </label>
              ))}
              <p className="px-2 pt-1 text-4xs text-muted-foreground">None ticked: all of them ({connection.scope || "every space"}).</p>
            </section>
            {github && (
              <section className="flex flex-col gap-2 px-1">
                <label className="flex flex-col gap-1 text-3xs text-muted-foreground">
                  State
                  <select className="h-7 rounded-md border border-border bg-card px-1.5 text-2xs text-secondary-foreground" value={filter.state} onChange={(event) => set({ state: event.target.value as Filter["state"] })}>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="merged">Merged</option>
                    <option value="draft">Draft</option>
                    <option value="any">Any</option>
                  </select>
                </label>
                <FacetSelect label="Author" value={filter.author} options={peopleOptions} onChange={(author) => set({ author })} />
                <FacetSelect label="Assignee" value={filter.assignee} options={peopleOptions} onChange={(assignee) => set({ assignee })} />
                <FacetSelect label="Review requested from" value={filter.reviewRequested} options={peopleOptions} onChange={(reviewRequested) => set({ reviewRequested })} />
                <div className="flex flex-col gap-1 text-3xs text-muted-foreground">
                  Labels (all of)
                  <div className="flex flex-wrap gap-1">
                    {labels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => set({ labels: filter.labels.includes(label) ? filter.labels.filter((l) => l !== label) : [...filter.labels, label] })}
                        className={cn("rounded-full border border-border px-1.5 text-4xs leading-4.5", filter.labels.includes(label) ? "border-blue-600 bg-blue-600 text-white" : "text-muted-foreground hover:bg-accent")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" className="self-start text-3xs text-info-foreground" onClick={() => set(EMPTY_FILTER)}>
                  Reset filters
                </button>
              </section>
            )}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-col gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2">
                {github && (
                  <Segmented
                    value={filter.type}
                    onChange={(type) => set({ type })}
                    options={[
                      { value: "any", label: "All" },
                      { value: "issue", label: "Issues" },
                      { value: "pr", label: "Pull requests" },
                    ]}
                  />
                )}
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 focus-within:border-ring">
                  <Search className="size-3.5 shrink-0 text-icon-muted" />
                  <input
                    autoFocus
                    className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-placeholder"
                    placeholder={github ? "Search titles and bodies, or #number" : "Search pages"}
                    value={filter.text}
                    onChange={(event) => set({ text: event.target.value })}
                  />
                </label>
                {github && (
                  <select className="h-7 rounded-md border border-border bg-card px-1.5 text-2xs" value={filter.sort} onChange={(event) => set({ sort: event.target.value as Filter["sort"] })}>
                    <option value="updated">Recently updated</option>
                    <option value="created">Newest</option>
                    <option value="comments">Most commented</option>
                  </select>
                )}
              </div>
              <QueryLine query={toQuery(filter, connection)} />
            </div>
            <div role="listbox" aria-multiselectable className="min-h-0 flex-1 overflow-y-auto">
              {results.map((item) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  checked={local.has(connectionId, item.key)}
                  disabled={local.full}
                  onToggle={() => local.toggle(connectionId, item.key)}
                />
              ))}
              {!results.length && <p className="p-6 text-center text-xs text-muted-foreground">Nothing matches. Loosen a filter.</p>}
            </div>
            <footer className="flex flex-col gap-2 border-t border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs text-secondary-foreground">
                  {local.count ? `${local.count} selected` : "Nothing selected"}
                  {local.draft.length > 1 && ` across ${local.draft.length} connections`}
                </span>
                <LimitNote count={local.count} />
              </div>
              <DraftChips draft={local.draft} withTitle={false} onRemove={local.remove} className="max-h-16 overflow-y-auto" />
              <div className="flex items-center justify-end gap-2">
                {local.count === 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      draft.setDraft([...local.draft.filter((d) => d.connectionId !== connectionId), { connectionId, keys: [] }]);
                      onClose();
                    }}
                  >
                    Ask about {connection.name} without items
                  </Button>
                )}
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  disabled={!local.count && !draft.draft.length}
                  onClick={() => {
                    draft.setDraft(local.draft);
                    onClose();
                  }}
                >
                  {local.count ? `Attach ${local.count}` : "Remove all"}
                </Button>
              </div>
            </footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
