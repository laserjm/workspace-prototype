"use client";

import { Clock, Folder, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Thread } from "@/modules/threads/contracts";
import { shelfOf } from "@/modules/threads/placement";
import { formatWakeTime } from "./time-format";

/** "About this thread": its full title, project, shelf and how much its conversation holds. */
export function ThreadContextCard({
  thread,
  projectName,
  className,
}: {
  thread: Thread;
  projectName: string;
  className?: string;
}) {
  const shelf = shelfOf(thread);
  const turns = thread.turnCount;
  const attachments = thread.attachmentCount;
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
    </div>
  );
}
