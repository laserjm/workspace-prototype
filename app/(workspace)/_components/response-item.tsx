"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Brain, Check, ChevronRight, Copy, GitFork } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IconButton } from "./icon-button";
import { cn } from "@/lib/utils";
import type { ResponseTiming } from "@/modules/threads/contracts";
import {
  formatResponseDuration,
  formatResponseTime,
  formatResponseTimeTooltip,
} from "./time-format";

// Shown on hover or focus of their group, and always on touch screens.
const revealOnWork =
  "pointer-events-none opacity-0 transition-opacity duration-150 group-focus-within/work:pointer-events-auto group-focus-within/work:opacity-100 group-hover/work:pointer-events-auto group-hover/work:opacity-100 touch:pointer-events-auto touch:opacity-100";
const revealOnMessage =
  "pointer-events-none opacity-0 transition-opacity duration-200 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100 touch:pointer-events-auto touch:opacity-100";
const metaButton =
  "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3.5";

/** The small dot beside a response or page that is still being prepared. */
export const preparingDotClassName =
  "size-1.25 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500";

/**
 * "Thinking…" with a brain, a bright window sweeping across it (`activity-shimmer`, as in T3
 * Code): the reply is working and nothing else on screen moves.
 */
function ThinkingIndicator() {
  const label = (
    <>
      <Brain aria-hidden className="size-3.5 shrink-0" />
      Thinking…
    </>
  );
  return (
    <div className="flex pt-px pb-3" role="status">
      <span className="relative inline-flex items-center gap-1.5 overflow-hidden text-2xs whitespace-nowrap text-secondary-label">
        {label}
        <span aria-hidden className="activity-shimmer pointer-events-none absolute inset-y-0 select-none">
          <span className="activity-shimmer-counter block h-full">
            <span className="activity-shimmer-aligned flex h-full items-center gap-1.5 text-foreground">
              {label}
            </span>
          </span>
        </span>
      </span>
    </div>
  );
}

export function ResponseItem({
  timing,
  continuation,
  onFork,
  children,
  label = "Assistant response",
  details = [],
  note,
  streaming = false,
  waiting = false,
  copyText,
}: {
  timing: ResponseTiming;
  continuation: boolean;
  onFork: () => void;
  children: ReactNode;
  label?: string;
  /** Rows shown above Started/Finished in the expanded work details. */
  details?: { label: string; value: string }[];
  note?: string;
  /** While working, show the partial response instead of the placeholder. */
  streaming?: boolean;
  /**
   * While working, nothing in the partial response moves (a tool has answered and the model reads
   * its result): "Thinking…" follows it.
   */
  waiting?: boolean;
  /** What Copy copies; without it, the response's visible text. */
  copyText?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.parse(timing.startedAt));
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const resetCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workId = useId();
  const working = timing.completedAt === null;
  const elapsed = Math.max(
    0,
    (timing.completedAt ? Date.parse(timing.completedAt) : now) -
      Date.parse(timing.startedAt),
  );
  const duration = working
    ? elapsed < 60_000
      ? `${Math.floor(elapsed / 1000)}s`
      : formatResponseDuration(Math.floor(elapsed / 1000) * 1000)
    : formatResponseDuration(elapsed);
  const durationLabel = `${working ? "Working for" : continuation ? "Continued for" : "Worked for"} ${duration}`;

  useEffect(() => {
    if (!working) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [working]);

  useEffect(
    () => () => {
      if (resetCopyTimer.current) clearTimeout(resetCopyTimer.current);
    },
    [],
  );

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(
        copyText ?? bodyRef.current?.innerText ?? "",
      );
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (resetCopyTimer.current) clearTimeout(resetCopyTimer.current);
    resetCopyTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <article className="shrink-0 pb-2" aria-label={label} aria-busy={working}>
      <div className="group/work mb-4 border-b border-border pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1 rounded-sm py-0.5 text-left hover:text-secondary-foreground"
            aria-expanded={expanded}
            aria-controls={workId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span>{durationLabel}</span>
            <ChevronRight
              size={14}
              strokeWidth={1.7}
              className={cn(
                "shrink-0 transition-transform duration-120",
                expanded && "rotate-90",
              )}
            />
          </button>
          <ResponseTimestamp
            timestamp={timing.startedAt}
            kind="Started"
            className={cn("ml-auto rounded-xs text-xs", revealOnWork)}
          />
        </div>
        <div
          id={workId}
          className="mt-2 border-l border-border pt-0.75 pb-1.25 pl-3 text-3xs text-muted-foreground/70 tabular-nums [&>div]:mb-2 [&>div]:flex [&>div]:items-center [&>div]:gap-3 [&>div>span]:w-10.5"
          hidden={!expanded}
        >
          {details.map((detail) => (
            <div key={detail.label}>
              <span>{detail.label}</span>
              <strong className="font-normal text-muted-foreground">
                {detail.value}
              </strong>
            </div>
          ))}
          <div>
            <span>Started</span>
            <time dateTime={timing.startedAt}>
              {formatResponseTime(timing.startedAt)}
            </time>
          </div>
          {timing.completedAt && (
            <div>
              <span>Finished</span>
              <time dateTime={timing.completedAt}>
                {formatResponseTime(timing.completedAt)}
              </time>
            </div>
          )}
          {note && (
            <p className="max-w-92.5 pt-1 leading-relaxed">{note}</p>
          )}
        </div>
      </div>
      {working && streaming ? (
        <div className="group/message">
          <div ref={bodyRef}>{children}</div>
          {waiting && <ThinkingIndicator />}
        </div>
      ) : working ? (
        <ThinkingIndicator />
      ) : (
        <div className="group/message">
          <div ref={bodyRef}>{children}</div>
          <div
            className={cn(
              "mt-2 flex min-h-7 items-center gap-2 text-placeholder tabular-nums",
              revealOnMessage,
            )}
          >
            <IconButton
              label={copyState === "copied" ? "Copied message" : "Copy message"}
              className={metaButton}
              onClick={copyMessage}
            >
              {copyState === "copied" ? <Check /> : <Copy />}
            </IconButton>
            <IconButton
              label="Fork from this response"
              className={metaButton}
              onClick={onFork}
            >
              <GitFork />
            </IconButton>
            <ResponseTimestamp
              timestamp={timing.completedAt!}
              kind="Completed"
              className="rounded-xs text-2xs"
            />
            <span className="text-3xs text-secondary-label" role="status">
              {copyState === "copied"
                ? "Copied"
                : copyState === "error"
                  ? "Could not copy. Try again or select the text."
                  : ""}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

function ResponseTimestamp({
  timestamp,
  kind,
  className,
}: {
  timestamp: string;
  kind: "Started" | "Completed";
  className: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            className={className}
            dateTime={timestamp}
            tabIndex={0}
            aria-label={`${kind} at ${formatResponseTime(timestamp)}`}
          />
        }
      >
        {formatResponseTime(timestamp)}
      </TooltipTrigger>
      <TooltipContent>
        {kind} at {formatResponseTimeTooltip(timestamp)}
      </TooltipContent>
    </Tooltip>
  );
}
