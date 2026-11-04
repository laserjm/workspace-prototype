"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Columns3,
  List,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { IconButton } from "./icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceMark } from "./source-picker";
import { ResizableSourcePanel } from "./resizable-source-panel";
import {
  getSource,
  getScopedRecords,
  recordStatuses,
  scopeLabel,
  type SourceRecord,
  type SourceScope,
} from "@/lib/workspace/source-data";

export function RecordStatus({ record }: { record: SourceRecord }) {
  return (
    <span
      className={`record-status status-${record.status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {record.status}
    </span>
  );
}

export function SourceExplorer({
  scope,
  selectedId,
  onSelect,
  onClose,
}: {
  scope: SourceScope;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const isDrawer = useSyncExternalStore(
    subscribeToViewport,
    getDrawerSnapshot,
    () => false,
  );
  const source = getSource(scope.sourceId);
  const records = getScopedRecords(scope);
  const selected = records.find((record) => record.id === selectedId);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [view, setView] = useState("list");
  const filtered = records.filter(
    (record) =>
      `${record.id} ${record.title} ${record.owner}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "All statuses" || record.status === status),
  );
  const content = (
    <aside
      id="source-explorer"
      className="source-explorer"
      aria-label={`${source.name} source explorer`}
    >
      <div className="explorer-heading">
        <SourceMark id={source.id} />
        <div>
          <strong>{source.name}</strong>
          <small>{source.workspace}</small>
        </div>
        <span className="demo-badge">Sample data</span>
        <IconButton label="Close source explorer" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="explorer-location">{source.location}</div>
      {selected ? (
        <div className="record-detail" key={selected.id}>
          <button
            type="button"
            className="record-back"
            onClick={() => onSelect(null)}
          >
            <ArrowLeft size={14} />
            All {source.plural}
          </button>
          <div className="record-detail-key">
            <span>{selected.type}</span>
            <ChevronRight size={12} />
            <strong>{selected.id}</strong>
          </div>
          <h2>{selected.title}</h2>
          <RecordStatus record={selected} />
          <dl className="record-properties">
            <div>
              <dt>Assignee</dt>
              <dd>
                <span className="owner-avatar">
                  {selected.owner
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                {selected.owner}
              </dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>
                <span
                  className={`priority-dot priority-${selected.priority.toLowerCase()}`}
                />
                {selected.priority}
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{selected.updated}</dd>
            </div>
            <div>
              <dt>Collection</dt>
              <dd>{source.collection}</dd>
            </div>
          </dl>
          <h3>Description</h3>
          <p>{selected.description}</p>
          {selected.risk && (
            <div className="record-risk">
              <strong>Needs attention</strong>
              <p>{selected.risk}</p>
            </div>
          )}
          <h3>Next step</h3>
          <p>{selected.nextStep}</p>
          <div className="record-provenance">
            <ShieldCheck size={14} />
            Included in this thread’s source snapshot
          </div>
        </div>
      ) : (
        <>
          <div className="explorer-collection">
            <span>
              {source.id === "jira"
                ? "PROJECT / PLATFORM"
                : source.id === "confluence"
                  ? "SPACE / PLATFORM"
                  : "PROJECT / BATTERY MANAGEMENT"}
            </span>
            <h2>{source.collection}</h2>
            <p>{scopeLabel(scope)} in this conversation</p>
          </div>
          <div
            className="explorer-view-tabs"
            role="group"
            aria-label="Source view"
          >
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={14} />
              {source.id === "confluence" ? "Pages" : "List"}
            </button>
            {source.id === "jira" && (
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
          <div className="explorer-filters">
            <label className="source-search">
              <Search size={14} />
              <input
                aria-label={`Search ${source.name} records`}
                placeholder={`Search ${source.plural}…`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Filter source by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option>All statuses</option>
              {recordStatuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="explorer-results-count">
            {filtered.length} of {records.length} {source.plural}
            <span>
              <Check size={12} />
              Loaded
            </span>
          </div>
          <div
            className={`explorer-record-list ${view === "board" ? "explorer-board" : ""}`}
          >
            {view === "board"
              ? recordStatuses.map((column) => (
                  <section key={column} className="explorer-board-column">
                    <h3>
                      {column}
                      <span>
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
            {!filtered.length && (
              <p className="source-no-results">
                No matching {source.plural}. Try another search or status.
              </p>
            )}
          </div>
        </>
      )}
      <div className="explorer-footer">
        <ShieldCheck size={13} />
        <span>Read-only sample snapshot · No live connection</span>
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
          className="source-explorer-dialog"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {source.name} source explorer
          </DialogTitle>
          <DialogDescription className="sr-only">
            Inspect the selected sample records for this conversation.
          </DialogDescription>
          {content}
        </DialogContent>
      </Dialog>
    );
  return <ResizableSourcePanel>{content}</ResizableSourcePanel>;
}

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
      className="explorer-record"
      onClick={onClick}
      aria-label={`Open ${record.id}: ${record.title}`}
    >
      <div className="explorer-record-top">
        <span
          className={`issue-type issue-type-${record.type.toLowerCase().replaceAll(" ", "-")}`}
        >
          {record.type === "Bug" ? "●" : "✓"}
        </span>
        <span>{record.id}</span>
        <RecordStatus record={record} />
      </div>
      <strong>{record.title}</strong>
      <div className="explorer-record-bottom">
        <span
          className={`priority-dot priority-${record.priority.toLowerCase()}`}
        />
        {record.priority}
        <span className="record-owner">{record.owner}</span>
        <span className="owner-avatar">
          {record.owner
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </span>
      </div>
    </button>
  );
}
