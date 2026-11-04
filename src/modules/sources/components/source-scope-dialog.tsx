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
          <SourceIcon id={source.id} />
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
                  : allRecordIds(source),
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
                  {record.id} <RecordStatusBadge status={record.status} />
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
          <Button disabled={!selected.length} onClick={() => onApply(selected)}>
            Use {recordCountLabel(source, selected.length)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
