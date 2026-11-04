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
          <SourceIcon id={source.id} />
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
