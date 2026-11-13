"use client";

import { FileText, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneOf, type RecordTone } from "../contracts";
import { recordMarks } from "../record-views";
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
  const Mark = recordMarks[providerId]?.types[type] ?? FileText;
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
  const Mark = recordMarks[providerId]?.provider ?? Plug;
  return <Mark aria-hidden className={cn("size-3.5 shrink-0", className)} />;
}
