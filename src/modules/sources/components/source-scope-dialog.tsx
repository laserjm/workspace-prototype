"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { allRecordIds, recordCountLabel } from "../domain/source";
import { RecordStatusBadge } from "./record-status-badge";
import { noResultsClassName } from "./source-explorer";
import { SourceIcon } from "./source-icon";
import { useSources } from "./use-sources";

/** Chooses which of a source's records a thread may use; at least one. */
export function SourceScopeDialog({
  sourceId,
  recordIds,
  onApply,
  onClose,
}: {
  sourceId: string;
  recordIds: string[];
  onApply: (recordIds: string[]) => void;
  onClose: () => void;
}) {
  const source = useSources().sourceById(sourceId);
  const [selected, setSelected] = useState(recordIds);
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
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-4 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Choose {source.name} {source.plural}
          </DialogTitle>
          <DialogDescription>
            Select the records this thread can use. Sample data from{" "}
            {source.workspace}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2.5">
          <SourceIcon id={source.id} />
          <div>
            <strong className="block text-xs font-medium">
              {source.collection}
            </strong>
            <small className="mt-1 block text-3xs text-secondary-label">
              {source.location} · Demo workspace
            </small>
          </div>
        </div>
        <label className="flex min-w-0 items-center gap-2 rounded-sm border border-border bg-card px-2 py-2 text-icon-muted focus-within:border-ring">
          <Search size={15} className="shrink-0" />
          <input
            className="w-full min-w-0 bg-transparent text-xs text-accent-foreground outline-none placeholder:text-placeholder"
            type="search"
            placeholder={`Find ${source.plural}…`}
            aria-label={`Find ${source.plural}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex justify-between text-2xs text-secondary-label">
          <span>
            {selected.length} of {source.records.length} selected
          </span>
          <button
            type="button"
            className="text-blue-600 dark:text-blue-300"
            onClick={() =>
              setSelected(
                selected.length === source.records.length
                  ? []
                  : allRecordIds(source),
              )
            }
          >
            {selected.length === source.records.length
              ? "Clear selection"
              : "Select all"}
          </button>
        </div>
        <div className="max-h-80 min-h-15 overflow-y-auto border-t border-border/60">
          {records.map((record) => (
            <label
              key={record.id}
              className="flex cursor-pointer items-center gap-3 border-b border-border/60 px-1 py-3 hover:bg-accent/50"
            >
              <input
                type="checkbox"
                className="size-3.75 shrink-0 accent-blue-600"
                checked={selected.includes(record.id)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, record.id]
                      : previous.filter((id) => id !== record.id),
                  )
                }
              />
              <span className="min-w-0">
                <small className="flex items-center gap-2 text-3xs text-muted-foreground">
                  {record.id} <RecordStatusBadge status={record.status} />
                </small>
                <strong className="mt-1.5 block text-xs font-normal text-secondary-foreground">
                  {record.title}
                </strong>
              </span>
            </label>
          ))}
          {!records.length && (
            <p className={noResultsClassName}>No matching {source.plural}.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 max-md:items-end">
          <span className="max-w-45 text-3xs leading-normal text-secondary-label max-md:max-w-32.5">
            Only selected records enter this thread.
          </span>
          <Button disabled={!selected.length} onClick={() => onApply(selected)}>
            Use {recordCountLabel(source, selected.length)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
