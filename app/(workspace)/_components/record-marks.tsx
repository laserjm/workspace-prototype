"use client";

import { FileText, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type RecordTone } from "@/modules/integrations/contracts";
import { providerViews } from "./record-views";
import { useIntegrations } from "./use-integrations";

// Record states only identify, so they take Tailwind's palette (ARCHITECTURE.md, "Styling").
const TONE_CLASS: Record<RecordTone, string> = {
  open: "text-emerald-600 dark:text-emerald-400",
  draft: "text-zinc-500 dark:text-zinc-400",
  done: "text-violet-600 dark:text-violet-400",
  closed: "text-red-600 dark:text-red-400",
  neutral: "text-muted-foreground",
};

/** A record type's kind mark, in the colour of its state's declared tone. */
export function RecordKindMark({
  providerId,
  type,
  state,
  className,
}: {
  providerId: string;
  type: string;
  state: string;
  className?: string;
}) {
  const { providers } = useIntegrations();
  const records = providers.find((provider) => provider.id === providerId)?.records;
  const Mark = providerViews[providerId]?.types[type]?.icon ?? FileText;
  return (
    <Mark
      aria-hidden
      className={cn("size-3.5 shrink-0", TONE_CLASS[toneOf(records, type, state)], className)}
    />
  );
}

/** A provider's mark, in the text colour. */
export function ProviderMark({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
  const Mark = providerViews[providerId]?.icon ?? Plug;
  return <Mark aria-hidden className={cn("size-3.5 shrink-0", className)} />;
}

// The badge's border and text take the tone's palette colour, as the mark does.
const BADGE_CLASS: Record<RecordTone, string> = {
  open: "border-emerald-200 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300",
  draft: "border-zinc-200 text-zinc-600 dark:border-zinc-400/30 dark:text-zinc-300",
  done: "border-violet-200 text-violet-700 dark:border-violet-400/30 dark:text-violet-300",
  closed: "border-red-200 text-red-700 dark:border-red-400/30 dark:text-red-300",
  neutral: "border-border text-muted-foreground",
};

/** A record's state as a small badge: its declared label in its tone; the raw state if undeclared. */
export function RecordStateBadge({
  providerId,
  type,
  state,
  className,
}: {
  providerId: string;
  type: string;
  state: string;
  className?: string;
}) {
  const { providers } = useIntegrations();
  const records = providers.find((provider) => provider.id === providerId)?.records;
  const label = records?.types[type]?.states[state]?.label ?? state;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-3xs",
        BADGE_CLASS[toneOf(records, type, state)],
        className,
      )}
    >
      {label}
    </span>
  );
}
