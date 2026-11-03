"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronRight, Copy, GitFork } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IconButton } from "./icon-button";
import {
  formatResponseDuration,
  formatResponseTime,
  formatResponseTimeTooltip,
  type ResponseTiming,
} from "./response-timing";

export function ResponseTurn({
  timing,
  continuation,
  sourceLabel,
  onFork,
  children,
}: {
  timing: ResponseTiming;
  continuation: boolean;
  sourceLabel: string;
  onFork: () => void;
  children: ReactNode;
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
  const label = `${working ? "Working for" : continuation ? "Continued for" : "Worked for"} ${duration}`;

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
      await navigator.clipboard.writeText(bodyRef.current?.innerText ?? "");
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (resetCopyTimer.current) clearTimeout(resetCopyTimer.current);
    resetCopyTimer.current = setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <article
      className="source-response"
      aria-label="Sample assistant response"
      aria-busy={working}
    >
      <div className="response-work-group">
        <div className="response-duration-row">
          <button
            type="button"
            className="response-duration-toggle"
            aria-expanded={expanded}
            aria-controls={workId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span className={working ? "response-working-label" : ""}>
              {label}
            </span>
            <ChevronRight
              size={14}
              className={expanded ? "duration-chevron-open" : ""}
            />
          </button>
          <ResponseTimestamp
            timestamp={timing.startedAt}
            kind="Started"
            className="response-start-time"
          />
        </div>
        <div id={workId} className="response-work-details" hidden={!expanded}>
          <div>
            <span>Source</span>
            <strong>{sourceLabel}</strong>
          </div>
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
          <p>
            Sample response prepared locally from the selected records. No live
            services or AI provider are connected.
          </p>
        </div>
      </div>
      {working ? (
        <div className="response-preparing" role="status">
          <span className="response-preparing-dot" />
          Preparing a sample response from {sourceLabel}…
        </div>
      ) : (
        <div className="response-message">
          <div className="response-body" ref={bodyRef}>
            {children}
          </div>
          <div className="response-message-meta">
            <IconButton
              label={copyState === "copied" ? "Copied message" : "Copy message"}
              className="response-meta-button"
              onClick={copyMessage}
            >
              {copyState === "copied" ? <Check /> : <Copy />}
            </IconButton>
            <IconButton
              label="Fork from this response"
              className="response-meta-button"
              onClick={onFork}
            >
              <GitFork />
            </IconButton>
            <ResponseTimestamp
              timestamp={timing.completedAt!}
              kind="Completed"
              className="response-end-time"
            />
            <span className="response-copy-feedback" role="status">
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
