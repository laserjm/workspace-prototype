"use client";

import { ChevronDown } from "lucide-react";
import { recordCountLabel } from "../contracts";
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
      className="flex min-w-0 flex-1 items-center gap-2 border-l border-border pl-3 text-left text-2xs text-muted-foreground hover:text-foreground max-md:gap-1.5 max-md:pr-1 max-md:pl-2 max-md:text-3xs"
      onClick={onClick}
      aria-label={`View scope: ${source.name}, ${recordCount} ${source.plural}`}
    >
      {showSource && (
        <>
          <SourceIcon icon={source.icon} size="sm" />
          <strong className="font-medium text-accent-foreground">
            {source.name}
          </strong>
          <span className="text-muted-foreground/40 max-md:hidden group-data-[session=source]/main:hidden">
            /
          </span>
        </>
      )}
      {/* Phones drop the collection, except in a source session where it is the context. */}
      <span className="min-w-0 truncate max-md:hidden max-md:group-data-[session=source]/main:block">
        {source.collection}
      </span>
      <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 whitespace-nowrap max-md:text-3xs">
        {recordCountLabel(source, recordCount)}
      </span>
      <ChevronDown size={13} className="shrink-0" />
    </button>
  );
}
