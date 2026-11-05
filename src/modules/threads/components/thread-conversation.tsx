"use client";

import type { ReactNode } from "react";
import { ChevronDown, GitFork } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordCountLabel, SourceIcon, useSources } from "@/modules/sources";
import type { ModelChoice } from "../domain/model-choice";
import { shelfOf, type Thread } from "../domain/thread";
import { ThreadMessages, type ForkTarget } from "./thread-messages";
import { formatWakeTime } from "./time-format";

/** An open thread: its placement, origin, source, messages and responses, then the composer. */
export function ThreadConversation({
  thread,
  models,
  composer,
  onRestore,
  onOpenThread,
  onViewSource,
  onFork,
}: {
  thread: Thread;
  models: ModelChoice[];
  composer: ReactNode;
  onRestore: () => void;
  onOpenThread: (id: string) => void;
  onViewSource: () => void;
  onFork: (target: ForkTarget) => void;
}) {
  const { sourceById } = useSources();
  const source = thread.scope ? sourceById(thread.scope.sourceId) : undefined;
  return (
    <div
      className={cn(
        "mx-auto flex h-full flex-col",
        // A source session shares the canvas with the source panel.
        thread.scope
          ? "max-w-230 min-w-0 flex-1 px-8 pb-12 max-desktop:px-5.5 max-md:px-4 max-md:pb-11 3xl:px-12"
          : "w-[min(var(--workspace-composer-width),calc(100%-4rem))] pt-25 pb-12 max-desktop:w-[calc(100%-3rem)] max-md:w-[calc(100%-1.75rem)] max-md:pt-42 max-md:pb-11",
      )}
    >
      {shelfOf(thread) !== "active" && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            {thread.snoozedUntil
              ? `Snoozed until ${formatWakeTime(thread.snoozedUntil)}`
              : "This session is settled."}
          </span>
          <button
            type="button"
            onClick={onRestore}
            className="font-medium text-secondary-foreground"
          >
            {thread.snoozedUntil ? "Wake now" : "Return to active"}
          </button>
        </div>
      )}
      {thread.forkedFrom && (
        <div className="flex shrink-0 items-center gap-1 overflow-hidden pt-3 text-3xs whitespace-nowrap text-muted-foreground/70">
          <GitFork size={12} />
          <span>Forked from</span>
          <button
            type="button"
            onClick={() => onOpenThread(thread.forkedFrom!.threadId)}
            className="truncate rounded-xs text-slate-500 hover:underline dark:text-slate-400"
          >
            {thread.forkedFrom.title}
          </button>
          <span>· response {thread.forkedFrom.responseIndex + 1}</span>
        </div>
      )}
      {source && thread.scope && (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border/60 py-4 max-md:py-3">
          <SourceIcon id={source.id} size="md" iconClassName="size-4" />
          <div className="min-w-0">
            <strong className="block truncate text-xs font-medium text-accent-foreground max-md:max-w-47.5 max-md:text-2xs">
              {source.collection}
            </strong>
            <span className="mt-0.5 block text-3xs text-secondary-label">
              {recordCountLabel(source, thread.scope.recordIds.length)} ·
              Read-only sample snapshot
            </span>
          </div>
          <button
            type="button"
            onClick={onViewSource}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-sm p-1 text-3xs text-secondary-label hover:text-foreground"
          >
            View source <ChevronDown size={12} />
          </button>
        </div>
      )}
      <ThreadMessages
        key={`conversation:${thread.id}`}
        thread={thread}
        models={models}
        onFork={onFork}
      />
      {composer}
    </div>
  );
}
