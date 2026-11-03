"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Database,
  Layers,
  Search,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getSource,
  sources,
  type SourceId,
  type SourceScope,
} from "./source-data";

export function SourceMark({ id }: { id: SourceId }) {
  const Icon =
    id === "jira" ? Layers : id === "confluence" ? BookOpen : Workflow;
  return (
    <span className={`source-mark source-mark-${id}`} aria-hidden>
      <Icon />
    </span>
  );
}

export function SourceChoices({
  selected,
  onSelect,
}: {
  selected?: SourceId;
  onSelect: (id: SourceId) => void;
}) {
  return (
    <div
      className="enterprise-source-choices"
      aria-label="Choose a data source"
    >
      {sources.map((source) => (
        <button
          type="button"
          key={source.id}
          className={`enterprise-source-choice ${selected === source.id ? "source-choice-selected" : ""}`}
          aria-pressed={selected === source.id}
          onClick={() => onSelect(source.id)}
        >
          <SourceMark id={source.id} />
          <span>
            <strong>{source.name}</strong>
            <small>{source.description}</small>
          </span>
          {selected === source.id && (
            <Check className="source-choice-check" size={14} />
          )}
        </button>
      ))}
    </div>
  );
}

export function SourcePicker({
  selected,
  onSelect,
  onClear,
}: {
  selected?: SourceId;
  onSelect: (id: SourceId) => void;
  onClear: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="permission-trigger source-picker-trigger"
            aria-label={
              selected
                ? `Choose source, ${getSource(selected).name}`
                : "Choose a source"
            }
          />
        }
      >
        {selected ? <SourceMark id={selected} /> : <Database />}
        <span>{selected ? getSource(selected).name : "Choose a source"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="source-picker-menu w-72">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Choose a data source
        </p>
        {sources.map((source) => (
          <DropdownMenuItem
            key={source.id}
            onClick={() => onSelect(source.id)}
            className="source-picker-menu-item"
          >
            <SourceMark id={source.id} />
            <span>
              <strong>{source.name}</strong>
              <small>{source.description}</small>
            </span>
            {selected === source.id && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
        {selected && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>
              <Database />
              Use no data source
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
          Sample workspaces. Choose records after selecting a source.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SourceContext({
  scope,
  onClick,
  showSource = true,
}: {
  scope: SourceScope;
  onClick: () => void;
  showSource?: boolean;
}) {
  const source = getSource(scope.sourceId);
  return (
    <button
      type="button"
      className="composer-source-context"
      onClick={onClick}
      aria-label={`View scope: ${source.name}, ${scope.recordIds.length} ${source.plural}`}
    >
      {showSource && (
        <>
          <SourceMark id={source.id} />
          <strong>{source.name}</strong>
          <span className="scope-divider">/</span>
        </>
      )}
      <span className="scope-collection">{source.collection}</span>
      <span className="scope-count">
        {scope.recordIds.length}{" "}
        {scope.recordIds.length === 1 ? source.singular : source.plural}
      </span>
      <ChevronDown size={13} />
    </button>
  );
}

export function ScopeDialog({
  scope,
  onApply,
  onClose,
}: {
  scope: SourceScope;
  onApply: (scope: SourceScope) => void;
  onClose: () => void;
}) {
  const source = getSource(scope.sourceId);
  const [selected, setSelected] = useState(scope.recordIds);
  const [query, setQuery] = useState("");
  const records = source.records.filter((record) =>
    `${record.id} ${record.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="workspace-dialog scope-dialog sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Choose {source.name} {source.plural}
          </DialogTitle>
          <DialogDescription>
            Select the records this thread can use. Sample data from{" "}
            {source.workspace}.
          </DialogDescription>
        </DialogHeader>
        <div className="scope-project">
          <SourceMark id={source.id} />
          <div>
            <strong>{source.collection}</strong>
            <small>{source.location} · Demo workspace</small>
          </div>
        </div>
        <label className="source-search">
          <Search size={15} />
          <input
            type="search"
            placeholder={`Find ${source.plural}…`}
            aria-label={`Find ${source.plural}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="scope-selection-toolbar">
          <span>
            {selected.length} of {source.records.length} selected
          </span>
          <button
            type="button"
            onClick={() =>
              setSelected(
                selected.length === source.records.length
                  ? []
                  : source.records.map((record) => record.id),
              )
            }
          >
            {selected.length === source.records.length
              ? "Clear selection"
              : "Select all"}
          </button>
        </div>
        <div className="scope-records">
          {records.map((record) => (
            <label key={record.id} className="scope-record">
              <input
                type="checkbox"
                checked={selected.includes(record.id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, record.id]
                      : previous.filter((id) => id !== record.id),
                  )
                }
              />
              <span>
                <small>
                  {record.id}{" "}
                  <span
                    className={`record-status status-${record.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {record.status}
                  </span>
                </small>
                <strong>{record.title}</strong>
              </span>
            </label>
          ))}
          {!records.length && (
            <p className="source-no-results">No matching {source.plural}.</p>
          )}
        </div>
        <div className="scope-dialog-footer">
          <span>Only selected records enter this thread.</span>
          <Button
            disabled={!selected.length}
            onClick={() =>
              onApply({ sourceId: source.id, recordIds: selected })
            }
          >
            Use {selected.length}{" "}
            {selected.length === 1 ? source.singular : source.plural}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
