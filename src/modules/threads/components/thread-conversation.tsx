"use client";

import type { ReactNode } from "react";
import { ChevronDown, GitFork } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordCountLabel, SourceIcon, useSources } from "@/modules/sources";
import type { ModelChoice } from "../domain/model-choice";
import { shelfOf, type Thread } from "../domain/thread";
import { ThreadMessages, type ForkTarget } from "./thread-messages";
import { formatWakeTime } from "./time-format";

/**
 * The centred column a conversation's content sits in. The conversation itself
 * spans the canvas, so the message list scrolls with its bar at the canvas
 * edge while the messages keep this width (as T3 Code's chat content lane).
 */
function conversationLane(inSourceSession: boolean) {
  // A source session shares the canvas with the source panel.
  return inSourceSession
    ? "mx-auto w-full max-w-230 px-8 max-desktop:px-5.5 max-md:px-4 3xl:px-12"
    : "mx-auto w-[min(var(--workspace-composer-width),calc(100%-4rem))] max-desktop:w-[calc(100%-3rem)] max-md:w-[calc(100%-1.75rem)]";
}

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
  const lane = conversationLane(!!thread.scope);
  // The rows above and below the message list reserve the same scrollbar
  // gutters as the list, so all three lanes resolve to one width even where
  // the browser draws classic (space-taking) scrollbars.
  const gutters = cn(
    "shrink-0 overflow-hidden [scrollbar-gutter:stable_both-edges]",
    thread.scope && "[scrollbar-width:thin]",
  );
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-1 flex-col pb-12 max-md:pb-11",
        !thread.scope && "pt-25 max-md:pt-42",
      )}
    >
      <div className={gutters}>
        <div className={lane}>
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
        </div>
      </div>
      <ThreadMessages
        key={`conversation:${thread.id}`}
        thread={thread}
        models={models}
        onFork={onFork}
        laneClassName={lane}
      />
      <div className={gutters}>
        <div className={lane}>{composer}</div>
      </div>
    </div>
  );
}
