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
import { ProjectIcon } from "@/modules/projects";
import { recordCountLabel, SourceIcon, useSources } from "@/modules/sources";
import { snoozePresets } from "../domain/snooze";
import { shelfOf, type Thread } from "../domain/thread";
import { ProviderIcon } from "./provider-icon";
import { ThreadContextCard } from "./thread-context-card";
import { formatAge, formatWakeTime } from "./time-format";
import { useThreadWorking } from "./use-chat-store";

export function ThreadRow({
  thread,
  projectName,
  active,
  onSelect,
  onSettle,
  onRestore,
  onSnooze,
  onCustomSnooze,
  onContext,
}: {
  thread: Thread;
  /** The thread's project, or "No project". */
  projectName: string;
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
  const { sourceById } = useSources();
  const source = thread.scope ? sourceById(thread.scope.sourceId) : undefined;
  const shelf = shelfOf(thread);
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
              <SourceIcon id={thread.scope.sourceId} />
            ) : (
              <ProjectIcon />
            )}
            <span className="thread-project-name">{projectName}</span>
            <span
              className={`thread-age ${thread.wokeAt ? "thread-woke" : ""}`}
              // The age is relative to the clock; server and browser may differ by a minute.
              suppressHydrationWarning
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
                formatAge(thread.createdAt, new Date())
              )}
            </span>
          </span>
          <span className="thread-title">{thread.title}</span>
          <span className="thread-meta">
            <span className="thread-branch">
              {thread.snoozedUntil
                ? formatWakeTime(thread.snoozedUntil)
                : source && thread.scope
                  ? `${source.name} · ${recordCountLabel(source, thread.scope.recordIds.length)}`
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
              <ThreadContextCard thread={thread} projectName={projectName} />
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
