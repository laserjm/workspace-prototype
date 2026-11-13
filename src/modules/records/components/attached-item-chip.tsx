"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderMark, RecordKindMark, useIntegrations } from "@/modules/integrations";
import type { AttachedItem, ConnectionRef } from "../contracts";

/** The same look as a file chip in the composer. */
const chipClassName =
  "inline-flex max-w-72 items-center gap-1.5 rounded-sm border border-border bg-muted px-2 py-1 text-2xs text-muted-foreground";

/**
 * An attached item, drawn from its snapshot (kind mark, `web#482`, title), or with no item a
 * whole connection, dashed. It never fetches. Once its connection is removed, it is muted and
 * says so.
 */
export function AttachedItemChip({
  connection,
  item,
  onRemove,
}: {
  connection: ConnectionRef;
  item?: AttachedItem;
  onRemove?: () => void;
}) {
  const { providers, connections } = useIntegrations();
  const removed = !connections.some((candidate) => candidate.id === connection.connectionId);
  const providerName =
    providers.find((provider) => provider.id === connection.provider)?.name ??
    connection.provider;
  const name = item ? item.snapshot.label : `${providerName} · ${connection.label}`;
  return (
    <span
      className={cn(chipClassName, !item && "border-dashed", removed && "opacity-60")}
      title={
        removed
          ? `${name}: connection removed`
          : item
            ? item.snapshot.title
            : `${name}: the agent may search it`
      }
    >
      {item ? (
        <RecordKindMark
          providerId={connection.provider}
          type={item.type}
          state={item.snapshot.state}
        />
      ) : (
        <ProviderMark providerId={connection.provider} />
      )}
      <span className="shrink-0 font-medium text-secondary-foreground">{name}</span>
      <span className="truncate">{item ? item.snapshot.title : "· whole connection"}</span>
      {removed && (
        <span className="shrink-0 text-3xs text-secondary-label">Connection removed</span>
      )}
      {onRemove && (
        <button
          type="button"
          className="flex shrink-0 rounded-xs"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}
