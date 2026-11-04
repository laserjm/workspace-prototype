"use client";

import type { ReactNode } from "react";
import { ChevronDown, GitFork } from "lucide-react";
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
  onOpenRecord,
  onFork,
}: {
  thread: Thread;
  models: ModelChoice[];
  composer: ReactNode;
  onRestore: () => void;
  onOpenThread: (id: string) => void;
  onViewSource: () => void;
  onOpenRecord: (id: string) => void;
  onFork: (target: ForkTarget) => void;
}) {
  const { sourceById } = useSources();
  const source = thread.scope ? sourceById(thread.scope.sourceId) : undefined;
  return (
    <div className="conversation-view">
      {shelfOf(thread) !== "active" && (
        <div className="thread-placement-banner">
          <span>
            {thread.snoozedUntil
              ? `Snoozed until ${formatWakeTime(thread.snoozedUntil)}`
              : "This session is settled."}
          </span>
          <button type="button" onClick={onRestore}>
            {thread.snoozedUntil ? "Wake now" : "Return to active"}
          </button>
        </div>
      )}
      {thread.forkedFrom && (
        <div className="thread-fork-origin">
          <GitFork size={12} />
          <span>Forked from</span>
          <button
            type="button"
            onClick={() => onOpenThread(thread.forkedFrom!.threadId)}
          >
            {thread.forkedFrom.title}
          </button>
          <span>· response {thread.forkedFrom.responseIndex + 1}</span>
        </div>
      )}
      {source && thread.scope && (
        <div className="session-context-heading">
          <SourceIcon id={source.id} />
          <div>
            <strong>{source.collection}</strong>
            <span>
              {recordCountLabel(source, thread.scope.recordIds.length)} ·
              Read-only sample snapshot
            </span>
          </div>
          <button type="button" onClick={onViewSource}>
            View source <ChevronDown size={12} />
          </button>
        </div>
      )}
      <ThreadMessages
        key={`conversation:${thread.id}`}
        thread={thread}
        models={models}
        onOpenRecord={onOpenRecord}
        onFork={onFork}
      />
      {composer}
    </div>
  );
}
