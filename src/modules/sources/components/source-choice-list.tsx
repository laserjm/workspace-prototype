"use client";

import { Check } from "lucide-react";
import { SourceIcon } from "./source-icon";
import { useSources } from "./use-sources";

export function SourceChoiceList({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const { sources } = useSources();
  return (
    <div
      className="grid grid-cols-1 gap-2.5 max-md:gap-2"
      aria-label="Choose a data source"
    >
      {sources.map((source) => (
        <button
          type="button"
          key={source.id}
          className="relative flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-card p-3 text-left transition-[border-color,box-shadow] duration-120 hover:border-blue-200 hover:shadow-xs aria-pressed:border-blue-400 aria-pressed:bg-blue-50/50 aria-pressed:ring-1 aria-pressed:ring-blue-400/10 max-md:gap-2 max-md:px-2.5 max-md:py-3 dark:hover:border-blue-400/40 dark:aria-pressed:bg-blue-400/10"
          aria-pressed={selected === source.id}
          onClick={() => onSelect(source.id)}
        >
          <SourceIcon
            icon={source.icon}
            className="max-md:size-7"
            iconClassName="max-md:size-4"
          />
          <span className="min-w-0">
            <strong className="block text-sm font-medium text-secondary-foreground max-md:text-2xs">
              {source.name}
            </strong>
            <small className="mt-0.5 block text-2xs leading-normal text-secondary-label">
              {source.description}
            </small>
          </span>
          {selected === source.id && (
            <Check
              className="absolute top-2 right-2 text-blue-600 dark:text-blue-300"
              size={14}
            />
          )}
        </button>
      ))}
    </div>
  );
}
