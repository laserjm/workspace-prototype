"use client";

import { Check, Database } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { SourceIcon } from "./source-icon";
import { useSources } from "./use-sources";

export function SourcePicker({
  selected,
  onSelect,
  onClear,
}: {
  selected?: string;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const { sources, sourceById } = useSources();
  const selectedSource = selected ? sourceById(selected) : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(inlineTriggerClassName, "shrink-0 py-1")}
            aria-label={
              selectedSource
                ? `Choose source, ${selectedSource.name}`
                : "Choose a source"
            }
          />
        }
      >
        {selectedSource ? (
          <SourceIcon id={selectedSource.id} size="plain" />
        ) : (
          <Database />
        )}
        <span>{selectedSource ? selectedSource.name : "Choose a source"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          Choose a data source
        </p>
        {sources.map((source) => (
          <DropdownMenuItem
            key={source.id}
            onClick={() => onSelect(source.id)}
            className="gap-2.5 py-2"
          >
            <SourceIcon id={source.id} size="md" />
            <span>
              <strong className="block text-xs font-medium">
                {source.name}
              </strong>
              <small className="mt-1 block text-3xs text-secondary-label">
                {source.description}
              </small>
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
