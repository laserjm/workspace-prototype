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
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectIcon } from "@/modules/projects";
import { recordCountLabel, SourceIcon, useSources } from "@/modules/sources";
import type { Thread } from "../contracts";
import { shelfOf, snoozePresets } from "../placement";
import { ProviderIcon } from "./provider-icon";
import { ThreadContextCard } from "./thread-context-card";
import { formatAge, formatWakeTime } from "./time-format";

// Shown on hover, focus, while the snooze menu is open, and always on touch screens.
const revealed =
  "group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-data-menu-open/row:pointer-events-auto group-data-menu-open/row:opacity-100 touch:pointer-events-auto touch:opacity-100";
// The project row makes room for the actions, and the age gives way to them.
const roomForActions =
  "group-hover/row:pr-28 group-focus-within/row:pr-28 group-data-menu-open/row:pr-28 touch:pr-28";
const hiddenForActions =
  "group-hover/row:hidden group-focus-within/row:hidden group-data-menu-open/row:hidden touch:hidden";
const rowAction =
  "inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-sm bg-transparent text-2xs text-icon-muted hover:bg-accent hover:text-secondary-foreground disabled:opacity-40 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:stroke-[1.6]";

export function ThreadRow({
  thread,
  projectName,
  active,
  working,
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
  /** A response is in flight. */
  working: boolean;
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
  const restoreLabel = shelf === "snoozed" ? "Wake thread" : "Un-settle thread";
  return (
    <div
      className="group/row relative mb-1 rounded-md"
      data-thread-id={thread.id}
      data-menu-open={snoozeOpen || undefined}
    >
      <Tooltip.Root disabled={snoozeOpen}>
        <Tooltip.Trigger
          delay={500}
          closeDelay={150}
          render={<button type="button" />}
          className={cn(
            "block w-full min-w-0 rounded-md p-2 text-left transition-colors duration-120 4xl:py-2.5",
            active && "bg-sidebar-row-selected shadow-xs",
            "group-hover/row:bg-sidebar-row-hover group-data-menu-open/row:bg-sidebar-row-hover",
          )}
          aria-label={thread.title}
          aria-current={active ? "page" : undefined}
          onClick={onSelect}
        >
          <span
            className={cn(
              "flex min-w-0 items-center gap-2 text-xs text-secondary-label",
              roomForActions,
            )}
          >
            {source ? (
              <SourceIcon icon={source.icon} size="xs" />
            ) : (
              <ProjectIcon />
            )}
            <span className="min-w-0 flex-1 truncate">{projectName}</span>
            <span
              className={cn(
                "ml-auto shrink-0",
                thread.wokeAt &&
                  "inline-flex items-center gap-1 text-violet-950/65 dark:text-violet-300",
                hiddenForActions,
              )}
              // The age is relative to the clock; server and browser may differ by a minute.
              suppressHydrationWarning
            >
              {working ? (
                "Working…"
              ) : thread.wokeAt ? (
                <>
                  <AlarmClock aria-hidden="true" className="size-3.5" />
                  Woke
                </>
              ) : shelf === "settled" ? (
                "Settled"
              ) : shelf === "snoozed" ? (
                <Clock aria-label="Snoozed" className="size-3.5" />
              ) : (
                formatAge(thread.createdAt, new Date())
              )}
            </span>
          </span>
          <span className="mt-1 block truncate text-sm text-accent-foreground">
            {thread.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-secondary-label">
            <span className="min-w-0 flex-1 truncate">
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
            className="z-55 outline-none"
          >
            <Tooltip.Popup className="max-h-[min(var(--available-height),37.5rem)] w-87.5 max-w-[min(var(--available-width),calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-popover/95 shadow-popover outline-none backdrop-blur-lg">
              <ThreadContextCard thread={thread} projectName={projectName} />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
      <div
        className={cn(
          "pointer-events-none absolute top-1.5 right-1.5 flex h-6 items-center gap-px opacity-0",
          revealed,
        )}
      >
        <button
          type="button"
          className={cn(rowAction, "w-6")}
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
                    className={cn(rowAction, "size-6")}
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
              <DropdownMenuContent
                align="end"
                className="w-70 max-w-[calc(100vw-1.5rem)]"
              >
                <p className="px-2 py-1 text-2xs text-secondary-label">
                  Snooze until
                </p>
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
                    <span className="ml-auto text-2xs text-secondary-label">
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
              className={cn(rowAction, "px-1")}
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
              className={cn(rowAction, "w-6")}
              aria-label={`${restoreLabel}: ${thread.title}`}
              title={restoreLabel}
              onClick={onRestore}
            >
              {shelf === "snoozed" ? <AlarmClockOff /> : <Undo2 />}
            </button>
            {shelf === "snoozed" && (
              <button
                type="button"
                className={cn(rowAction, "w-6")}
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
