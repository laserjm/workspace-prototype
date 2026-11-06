"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Columns3,
  ExternalLink,
  List,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import {
  RECORD_STATUSES,
  recordCountLabel,
  sourceAccessLabel,
  sourceOriginLabel,
  updatedLabel,
  type RecordPriority,
  type SourceRecord,
} from "../contracts";
import { RecordStatusBadge } from "./record-status-badge";
import { ResizableSourcePanel } from "./resizable-source-panel";
import { SourceIcon } from "./source-icon";
import { useScopedRecords, useSources } from "./use-sources";

const PRIORITY_DOTS: Record<RecordPriority, string> = {
  High: "bg-red-300 dark:bg-red-400",
  Medium: "bg-amber-300 dark:bg-amber-400",
  Low: "bg-emerald-300 dark:bg-emerald-400",
};

// Bugs are red, tasks and test cases blue, pull requests violet, everything else green.
function issueTypeTone(type: string) {
  if (type === "Bug") return "bg-red-400";
  if (type === "Task" || type === "Test case") return "bg-blue-400";
  if (type === "Pull request") return "bg-violet-400";
  return "bg-emerald-500/80";
}

function PriorityDot({ priority }: { priority: RecordPriority }) {
  return (
    <span
      className={cn(
        "inline-block size-1.25 shrink-0 rounded-full",
        PRIORITY_DOTS[priority],
      )}
    />
  );
}

function OwnerAvatar({ owner }: { owner: string }) {
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-5xs text-muted-foreground">
      {owner
        .split(" ")
        .map((part) => part[0])
        .join("")}
    </span>
  );
}

/** The records a thread uses, as a list, a board or one record's details. */
export function SourceExplorer({
  sourceId,
  recordIds,
  selectedId,
  onSelect,
  onClose,
}: {
  sourceId: string;
  recordIds: string[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const isDrawer = useSyncExternalStore(
    subscribeToViewport,
    getDrawerSnapshot,
    () => false,
  );
  const source = useSources().sourceById(sourceId);
  const unavailable = source.availability === "unavailable";
  // The thread's records by id, wherever they are in the source.
  const load = useScopedRecords(sourceId, recordIds);
  const records = load.status === "ready" ? load.records : [];
  const selected = records.find((record) => record.id === selectedId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [view, setView] = useState("list");
  const filtered = records.filter(
    (record) =>
      `${record.id} ${record.title} ${record.owner ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "All statuses" || record.status === status),
  );
  const content = (
    <aside
      id="source-explorer"
      className={cn(
        "flex size-full min-w-0 shrink-0 flex-col overflow-hidden bg-background text-xs leading-normal",
        !isDrawer && "border-l border-border",
      )}
      aria-label={`${source.name} source explorer`}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-3">
        <SourceIcon icon={source.icon} />
        <div className="min-w-0">
          <strong className="block text-sm font-medium text-secondary-foreground">
            {source.name}
          </strong>
          <small className="mt-px block truncate text-3xs text-muted-foreground">
            {source.workspace}
          </small>
        </div>
        <span className="ml-auto max-w-40 shrink-0 truncate rounded-sm border border-border bg-muted px-1.5 py-0.5 text-3xs whitespace-nowrap text-muted-foreground">
          {sourceOriginLabel(source)}
        </span>
        <IconButton
          label="Close source explorer"
          onClick={onClose}
          className="h-6 w-5.5 [&_svg:not([class*='size-'])]:size-3.75"
        >
          <X />
        </IconButton>
      </div>
      <div className="shrink-0 truncate border-b border-border/60 px-4 pb-3 text-3xs text-muted-foreground/70">
        {source.location}
      </div>
      {selected ? (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-7.5 [scrollbar-width:thin]"
          key={selected.id}
        >
          <button
            type="button"
            className="mb-5.5 inline-flex items-center gap-1.5 rounded-xs text-3xs text-muted-foreground hover:text-secondary-foreground"
            onClick={() => onSelect(null)}
          >
            <ArrowLeft size={14} />
            All {source.plural}
          </button>
          <div className="flex items-center gap-1.5 text-3xs text-muted-foreground/70">
            <span>{selected.type}</span>
            <ChevronRight size={12} />
            <strong className="font-medium text-muted-foreground">
              {selected.id}
            </strong>
          </div>
          <h2 className="mt-2 mb-3 text-xl leading-snug font-medium tracking-tight text-secondary-foreground">
            {selected.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <RecordStatusBadge
              status={selected.status}
              className="px-2 py-0.75 text-3xs"
            />
            {selected.statusLabel && (
              <span className="text-3xs text-muted-foreground">
                {selected.statusLabel}
              </span>
            )}
            {selected.url && (
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-3xs text-muted-foreground hover:text-secondary-foreground"
              >
                Open in {source.system}
                <ExternalLink size={12} />
              </a>
            )}
          </div>
          <dl className="my-6 flex flex-col gap-3 border-y border-border/60 py-5 [&>div]:flex [&>div]:items-center [&>div]:gap-2.5 [&_dd]:flex [&_dd]:items-center [&_dd]:gap-1.5 [&_dd]:text-2xs [&_dd]:text-accent-foreground [&_dt]:w-19 [&_dt]:shrink-0 [&_dt]:text-3xs [&_dt]:text-muted-foreground/70">
            <div>
              <dt>Assignee</dt>
              <dd>
                {selected.owner ? (
                  <>
                    <OwnerAvatar owner={selected.owner} />
                    {selected.owner}
                  </>
                ) : (
                  "Unassigned"
                )}
              </dd>
            </div>
            {selected.priority && (
              <div>
                <dt>Priority</dt>
                <dd>
                  <PriorityDot priority={selected.priority} />
                  {selected.priority}
                </dd>
              </div>
            )}
            <div>
              <dt>Updated</dt>
              <dd>{updatedLabel(selected.updated)}</dd>
            </div>
            {Object.entries(selected.fields ?? {}).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="min-w-0 wrap-anywhere">{updatedLabel(value)}</dd>
              </div>
            ))}
            <div>
              <dt>Collection</dt>
              <dd className="min-w-0 wrap-anywhere">{source.collection}</dd>
            </div>
          </dl>
          <h3 className={detailHeading}>Description</h3>
          <p className={cn(detailText, "whitespace-pre-wrap wrap-anywhere")}>
            {selected.description || "No description."}
          </p>
          {selected.risk && (
            <div className="my-5 rounded-md border border-warning/25 bg-warning/5 p-3">
              <strong className="text-3xs font-medium text-warning-foreground/80">
                Needs attention
              </strong>
              <p className="mt-1 text-2xs text-warning-foreground/70">
                {selected.risk}
              </p>
            </div>
          )}
          {selected.nextStep && (
            <>
              <h3 className={detailHeading}>Next step</h3>
              <p className={detailText}>{selected.nextStep}</p>
            </>
          )}
          <div className="mt-7 flex items-center gap-1.5 text-3xs text-muted-foreground/70">
            <ShieldCheck size={14} />
            Included in this thread’s context
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0 px-4 pt-6 pb-4">
            <span className="text-4xs font-semibold tracking-widest text-muted-foreground/70">
              {source.collectionPath}
            </span>
            <h2 className="mt-2 text-lg font-medium tracking-tight text-secondary-foreground">
              {source.collection}
            </h2>
            <p className="mt-1 text-2xs text-muted-foreground">
              {recordCountLabel(source, recordIds.length)} in this conversation
            </p>
          </div>
          <div
            className="flex shrink-0 gap-4.5 border-b border-border/60 px-4 [&>button]:-mb-px [&>button]:flex [&>button]:items-center [&>button]:gap-1.5 [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-px [&>button]:pb-2.5 [&>button]:text-2xs [&>button]:text-muted-foreground [&>button]:aria-pressed:border-accent-foreground [&>button]:aria-pressed:text-secondary-foreground"
            role="group"
            aria-label="Source view"
          >
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={14} />
              {source.listLabel}
            </button>
            {source.hasBoard && (
              <button
                type="button"
                aria-pressed={view === "board"}
                onClick={() => setView("board")}
              >
                <Columns3 size={14} />
                Board
              </button>
            )}
          </div>
          <div className="flex shrink-0 gap-2 px-4 pt-4 pb-2.5">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5 text-icon-muted focus-within:border-ring">
              <Search size={14} className="shrink-0" />
              <input
                className="w-full min-w-0 bg-transparent text-2xs text-accent-foreground outline-none placeholder:text-placeholder"
                aria-label={`Search ${source.name} records`}
                placeholder={`Search ${source.plural}…`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter source by status"
              className="w-27 rounded-sm border border-border bg-card px-1 text-3xs text-muted-foreground"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option>All statuses</option>
              {RECORD_STATUSES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="flex shrink-0 items-center px-4 pb-2.5 text-3xs text-muted-foreground/70">
            {filtered.length} of {records.length} {source.plural}
            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
              {load.status === "ready" && <Check size={12} />}
              {unavailable ? "Not connected" : LOAD_LABELS[load.status]}
            </span>
          </div>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3.5 pb-5 [scrollbar-width:thin]",
              view === "board" && "gap-4",
            )}
          >
            {view === "board"
              ? RECORD_STATUSES.map((column) => (
                  <section
                    key={column}
                    className="flex flex-col gap-2 rounded-sm bg-sidebar p-2"
                  >
                    <h3 className="flex items-center gap-1.5 px-0.5 pb-1 text-3xs font-medium tracking-wider text-muted-foreground uppercase">
                      {column}
                      <span className="ml-auto">
                        {
                          filtered.filter((record) => record.status === column)
                            .length
                        }
                      </span>
                    </h3>
                    {filtered
                      .filter((record) => record.status === column)
                      .map((record) => (
                        <RecordCard
                          key={record.id}
                          record={record}
                          onClick={() => onSelect(record.id)}
                        />
                      ))}
                  </section>
                ))
              : filtered.map((record) => (
                  <RecordCard
                    key={record.id}
                    record={record}
                    onClick={() => onSelect(record.id)}
                  />
                ))}
            {load.status === "ready" && !filtered.length && (
              <p className={noResultsClassName}>
                {records.length
                  ? `No matching ${source.plural}. Try another search or status.`
                  : `None of this thread’s ${source.plural} exist any more.`}
              </p>
            )}
            {unavailable ? (
              <p className={noResultsClassName}>
                This thread’s source is no longer connected. Connect it again
                under Settings → Sources to read its records.
              </p>
            ) : (
              load.status === "failed" && (
                <p className={noResultsClassName}>
                  The {source.plural} could not be loaded. Close and open the
                  explorer to try again.
                </p>
              )
            )}
          </div>
        </>
      )}
      <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border/60 px-2 py-3 text-3xs text-muted-foreground/70">
        <ShieldCheck size={13} />
        <span>
          {source.availability === "snapshot"
            ? `${sourceAccessLabel(source)} · No live connection`
            : sourceAccessLabel(source)}
        </span>
      </div>
    </aside>
  );
  if (isDrawer)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          // A full-height drawer on the right instead of a centred dialog.
          className="top-0 right-0 bottom-0 left-auto block h-svh w-[min(420px,100%)] max-w-full translate-x-0 translate-y-0 overflow-hidden rounded-none p-0 sm:max-w-full data-closed:animate-none! data-open:animate-none!"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {source.name} source explorer
          </DialogTitle>
          <DialogDescription className="sr-only">
            Inspect the records this conversation uses.
          </DialogDescription>
          {content}
        </DialogContent>
      </Dialog>
    );
  return <ResizableSourcePanel>{content}</ResizableSourcePanel>;
}

const LOAD_LABELS = {
  loading: "Loading…",
  failed: "Not loaded",
  ready: "Loaded",
} as const;

const detailHeading = "mt-5 mb-2 text-xs font-medium text-accent-foreground";
const detailText = "text-xs leading-loose text-muted-foreground";

/** The empty state of a filtered record list. */
export const noResultsClassName =
  "px-3 py-6 text-center text-xs text-muted-foreground";

function subscribeToViewport(callback: () => void) {
  const media = window.matchMedia("(max-width: 1100px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDrawerSnapshot() {
  return window.matchMedia("(max-width: 1100px)").matches;
}

function RecordCard({
  record,
  onClick,
}: {
  record: SourceRecord;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="block w-full shrink-0 rounded-md border border-border/60 bg-card p-3 text-left hover:border-ring/50 hover:bg-muted"
      onClick={onClick}
      aria-label={`Open ${record.id}: ${record.title}`}
    >
      <div className="flex items-center gap-1.5 text-3xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex size-3 items-center justify-center rounded-xs text-3xs text-white",
            issueTypeTone(record.type),
          )}
        >
          {record.type === "Bug" ? "●" : "✓"}
        </span>
        <span>{record.id}</span>
        <RecordStatusBadge status={record.status} className="ml-auto" />
      </div>
      <strong className="mt-2 block text-xs leading-relaxed font-medium text-secondary-foreground">
        {record.title}
      </strong>
      <div className="mt-3 flex items-center gap-1 text-3xs text-muted-foreground/70">
        {record.priority ? (
          <>
            <PriorityDot priority={record.priority} />
            {record.priority}
          </>
        ) : (
          <span>{record.statusLabel ?? record.type}</span>
        )}
        {record.owner && (
          <>
            <span className="ml-auto">{record.owner}</span>
            <OwnerAvatar owner={record.owner} />
          </>
        )}
      </div>
    </button>
  );
}
