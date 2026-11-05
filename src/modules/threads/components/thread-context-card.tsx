"use client";

import { Clock, Folder, MessageSquare, Paperclip } from "lucide-react";
import {
  recordCountLabel,
  recordsIn,
  SourceIcon,
  useSources,
} from "@/modules/sources";
import { cn } from "@/lib/utils";
import { shelfOf, type Thread } from "../domain/thread";
import { formatWakeTime } from "./time-format";
import { useChatStore } from "./use-chat-store";

/** A thread's full title, project, shelf and the exact records it uses. */
export function ThreadContextCard({
  thread,
  projectName,
  className,
}: {
  thread: Thread;
  projectName: string;
  className?: string;
}) {
  const { sourceById } = useSources();
  const source = thread.scope ? sourceById(thread.scope.sourceId) : undefined;
  const records =
    source && thread.scope ? recordsIn(source, thread.scope.recordIds) : [];
  const shelf = shelfOf(thread);
  // Read on render: the card only renders while its tooltip is open.
  const userMessages = useChatStore()
    .peekMessages(thread.id)
    .filter((message) => message.role === "user");
  const turns = userMessages.length;
  const attachments = userMessages.reduce(
    (count, message) => count + (message.metadata?.attachments?.length ?? 0),
    0,
  );
  return (
    <div
      className={cn(
        "min-w-0 p-4 text-xs leading-normal text-muted-foreground",
        className,
      )}
    >
      <strong className="block text-sm font-semibold wrap-anywhere text-secondary-foreground">
        {thread.title}
      </strong>
      <div className="mt-3 grid gap-1.5 [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2 [&>span]:wrap-anywhere [&_svg]:size-3.5 [&_svg]:shrink-0">
        <span>
          <Folder aria-hidden="true" />
          {projectName}
        </span>
        <span>
          <MessageSquare aria-hidden="true" />
          {turns} {turns === 1 ? "turn" : "turns"} ·{" "}
          {shelf === "active"
            ? "Active"
            : shelf === "settled"
              ? "Settled"
              : "Snoozed"}
        </span>
        {thread.snoozedUntil && (
          <span>
            <Clock aria-hidden="true" />
            Returns {formatWakeTime(thread.snoozedUntil)}
          </span>
        )}
        {attachments > 0 && (
          <span>
            <Paperclip aria-hidden="true" />
            {attachments} {attachments === 1 ? "attachment" : "attachments"}
          </span>
        )}
      </div>
      {source && thread.scope ? (
        <div className="mt-3 border-t border-border pt-3">
          {/* thread-context-source-heading: workspace.css sizes the SourceIcon
              until it moves to utilities with the other source components. */}
          <div className="thread-context-source-heading flex items-center gap-2">
            <SourceIcon id={source.id} />
            <strong className="font-medium text-accent-foreground">
              {source.name}
            </strong>
            <span className="ml-auto text-secondary-label">
              {recordCountLabel(source, thread.scope.recordIds.length)}
            </span>
          </div>
          <p className="mt-1 text-2xs text-secondary-label">
            {source.collection}
          </p>
          <ul className="mt-2.5 grid max-h-70 list-none overflow-y-auto overscroll-contain p-0">
            {records.map((record) => (
              <li
                key={record.id}
                className="py-2 not-first:border-t not-first:border-border/60"
              >
                <div className="flex justify-between gap-2 text-3xs">
                  <span className="font-mono text-secondary-label">
                    {record.id}
                  </span>
                  <span>{record.status}</span>
                </div>
                <p className="mt-1 wrap-anywhere text-accent-foreground">
                  {record.title}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-3xs text-muted-foreground/70">
            Selected context · Read-only sample snapshot
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-3xs text-muted-foreground/70">
          No data source selected for this session.
        </p>
      )}
    </div>
  );
}
