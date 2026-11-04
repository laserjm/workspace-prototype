"use client";

import { useState } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  AlarmClock,
  AlarmClockOff,
  Check,
  Clock,
  Info,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Thread } from "./workspace-data";
import { ProjectIcon, ProviderIcon } from "./workspace-icons";
import { SourceMark } from "./source-picker";
import { getSource, scopeLabel } from "@/lib/workspace/source-data";
import {
  formatWakeTime,
  snoozePresets,
  threadShelf,
} from "./thread-lifecycle";
import { ThreadContextCard } from "./thread-context-card";
import { useThreadWorking } from "@/lib/chat/chat-store";

export function WorkspaceThreadRow({
  thread,
  active,
  onSelect,
  onSettle,
  onRestore,
  onSnooze,
  onCustomSnooze,
  onContext,
}: {
  thread: Thread;
  active: boolean;
  onSelect: () => void;
  onSettle: () => void;
  onRestore: () => void;
  onSnooze: (until: string) => void;
  onCustomSnooze: () => void;
  onContext: () => void;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [presets, setPresets] = useState<ReturnType<typeof snoozePresets>>([]);
  const shelf = threadShelf(thread);
  const working = useThreadWorking(thread.id);
  const restoreLabel = shelf === "snoozed" ? "Wake thread" : "Un-settle thread";
  return (
    <div
      className={`thread-row ${snoozeOpen ? "thread-row-menu-open" : ""}`}
      data-thread-id={thread.id}
    >
      <Tooltip.Root disabled={snoozeOpen}>
        <Tooltip.Trigger
          delay={500}
          closeDelay={150}
          render={<button type="button" />}
          className={`thread-item ${active ? "thread-item-active" : ""}`}
          aria-label={thread.title}
          aria-current={active ? "page" : undefined}
          onClick={onSelect}
        >
          <span className="thread-project-row">
            {thread.scope ? (
              <SourceMark id={thread.scope.sourceId} />
            ) : (
              <ProjectIcon kind={thread.kind} />
            )}
            <span className="thread-project-name">{thread.project}</span>
            <span
              className={`thread-age ${thread.wokeAt ? "thread-woke" : ""}`}
            >
              {working ? (
                "Working…"
              ) : thread.wokeAt ? (
                <>
                  <AlarmClock aria-hidden="true" />
                  Woke
                </>
              ) : shelf === "settled" ? (
                "Settled"
              ) : shelf === "snoozed" ? (
                <Clock aria-label="Snoozed" />
              ) : (
                thread.age
              )}
            </span>
          </span>
          <span className="thread-title">{thread.title}</span>
          <span className="thread-meta">
            <span className="thread-branch">
              {thread.snoozedUntil
                ? formatWakeTime(thread.snoozedUntil)
                : thread.scope
                  ? `${getSource(thread.scope.sourceId).name} · ${scopeLabel(thread.scope)}`
                  : thread.branch}
            </span>
            <ProviderIcon provider={thread.provider} />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner
            side="right"
            align="start"
            sideOffset={8}
            className="thread-context-positioner"
          >
            <Tooltip.Popup className="thread-context-popup">
              <ThreadContextCard thread={thread} />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <div className="thread-row-actions">
        <button
          type="button"
          className="thread-row-action thread-context-action"
          aria-label={`View context: ${thread.title}`}
          title="View session context"
          onClick={onContext}
        >
          <Info />
        </button>
        {shelf === "active" ? (
          <>
            <DropdownMenu
              open={snoozeOpen}
              onOpenChange={(open) => {
                setSnoozeOpen(open);
                if (open) setPresets(snoozePresets(new Date()));
              }}
            >
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="thread-row-action"
                    aria-label={`Snooze thread: ${thread.title}`}
                    title={
                      working
                        ? "Wait for the response to finish before snoozing"
                        : "Snooze thread"
                    }
                    disabled={working}
                  />
                }
              >
                <Clock />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="thread-snooze-menu">
                <p className="thread-snooze-heading">Snooze until</p>
                {presets.map((preset) => (
                  <DropdownMenuItem
                    key={preset.id}
                    onClick={() => {
                      const until =
                        preset.id === "minute" || preset.id === "hour"
                          ? snoozePresets(new Date()).find(
                              (item) => item.id === preset.id,
                            )!.until
                          : preset.until;
                      onSnooze(until.toISOString());
                    }}
                  >
                    <span>{preset.label}</span>
                    <span className="thread-snooze-time">
                      {formatWakeTime(preset.until.toISOString())}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCustomSnooze}>
                  <Clock />
                  Custom…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="thread-row-action thread-settle-action"
              aria-label={`Settle thread: ${thread.title}`}
              title="Settle thread"
              onClick={onSettle}
            >
              <Check />
              <span>Settle</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="thread-row-action"
              aria-label={`${restoreLabel}: ${thread.title}`}
              title={restoreLabel}
              onClick={onRestore}
            >
              {shelf === "snoozed" ? <AlarmClockOff /> : <Undo2 />}
            </button>
            {shelf === "snoozed" && (
              <button
                type="button"
                className="thread-row-action"
                aria-label={`Settle thread: ${thread.title}`}
                title="Settle thread"
                onClick={onSettle}
              >
                <Check />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
