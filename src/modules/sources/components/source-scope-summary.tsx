"use client";

import { ChevronDown } from "lucide-react";
import { recordCountLabel } from "../domain/source";
import { SourceIcon } from "./source-icon";
import { useSources } from "./use-sources";

/** The source, collection and record count a thread or draft uses; opens the scope. */
export function SourceScopeSummary({
  sourceId,
  recordCount,
  onClick,
  showSource = true,
}: {
  sourceId: string;
  recordCount: number;
  onClick: () => void;
  showSource?: boolean;
}) {
  const source = useSources().sourceById(sourceId);
  return (
    <button
      type="button"
      className="composer-source-context"
      onClick={onClick}
      aria-label={`View scope: ${source.name}, ${recordCount} ${source.plural}`}
    >
      {showSource && (
        <>
          <SourceIcon id={source.id} />
          <strong>{source.name}</strong>
          <span className="scope-divider">/</span>
        </>
      )}
      <span className="scope-collection">{source.collection}</span>
      <span className="scope-count">
        {recordCountLabel(source, recordCount)}
      </span>
      <ChevronDown size={13} />
    </button>
  );
}
