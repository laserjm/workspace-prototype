"use client";

import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";
import type { ModelChoice, WorkspaceUIMessage } from "@/modules/agent/contracts";
import { AttachedItemChip } from "./attached-item-chip";
import { attachedConnectionsOf } from "@/modules/records/contracts";
import { useRecordPanel } from "./record-panel-provider";
import { type AttachedConnection } from "@/modules/records/contracts";
import { attachmentChipClassName } from "./attachment-chip";
import { LiveResponseItem } from "./live-response-item";
import type { StoredConversation } from "./use-stored-conversation";

export type ForkTarget = { messageId: string; responseIndex: number };

const errorNotice =
  "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive-foreground [&>button]:rounded-sm [&>button]:border [&>button]:border-destructive/25 [&>button]:bg-card [&>button]:px-2.5 [&>button]:py-1 [&>button]:hover:bg-destructive/10";

// Keep following the stream while the reader is within this distance of the end.
const PINNED_DISTANCE = 80;

/** The thread's messages, as its chat holds them. */
export function ThreadMessageList({
  messages,
  inFlight,
  error,
  load,
  onReload,
  onRetry,
  models,
  onFork,
  laneClassName,
  fadeTop,
  leading,
}: {
  messages: WorkspaceUIMessage[];
  /** A response is in flight. */
  inFlight: boolean;
  /** Why the last response did not finish. */
  error?: Error;
  /** Where loading the stored conversation is. */
  load: StoredConversation["state"];
  onReload: () => void;
  onRetry: () => void;
  models: ModelChoice[];
  onFork: (target: ForkTarget) => void;
  /** The centred column the messages sit in; the list scrolls across the full width. */
  laneClassName: string;
  /** Nothing stays put above the list: it starts under the header and fades out there. */
  fadeTop: boolean;
  /** The first row of the list, which scrolls away with the messages. */
  leading?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(messages.length > 0);
  const lastUserId = messages.findLast(
    (message) => message.role === "user",
  )?.id;

  // Follow new messages and streamed text unless the reader scrolled up;
  // sending a message always returns to the end.
  const followedUserId = useRef(lastUserId);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (lastUserId !== followedUserId.current) {
      followedUserId.current = lastUserId;
      pinned.current = true;
    }
    if (pinned.current) element.scrollTop = element.scrollHeight;
  }, [messages, lastUserId]);

  // The composer floating over the end can grow (attachments, a skill hint),
  // which grows the space reserved below the messages: stay at the end.
  const laneRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const lane = laneRef.current;
    if (!scroller || !lane) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(lane, { box: "border-box" });
    return () => observer.disconnect();
  }, []);

  const last = messages.at(-1);
  let responseIndex = 0;

  return (
    <div
      // Full width, so the bar sits at the canvas edge. A stable gutter on
      // both edges keeps the messages centred when the bar appears.
      className={cn(
        "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]",
        fadeTop && "scroll-fade-top",
      )}
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <
          PINNED_DISTANCE;
      }}
    >
      <div
        ref={laneRef}
        // The end reserves the floating composer's height (--composer-height,
        // set by ThreadPanel), so the last message stops above it.
        className={cn(
          // Under a fading top the first row starts below the fade (1.5rem);
          // under a fixed row, a short gap is enough.
          "flex flex-col gap-6 pb-(--composer-height)",
          fadeTop ? "pt-6" : "pt-4 max-md:pt-3",
          laneClassName,
        )}
      >
        {leading}
        {messages.map((message, index) => {
          if (message.role === "user") {
            const reply = messages[index + 1];
            const awaitingReply = reply?.role !== "assistant";
            return (
              <Fragment key={message.id}>
                <UserMessage
                  text={textOf(message)}
                  attachments={message.metadata?.attachments}
                  attached={attachedConnectionsOf(message)}
                />
                {awaitingReply && inFlight && message === last && (
                  <LiveResponseItem
                    requestedAt={requestedAt(message)}
                    working
                    continuation={responseIndex > 0}
                    models={models}
                    onFork={() => undefined}
                  />
                )}
              </Fragment>
            );
          }
          if (message.role !== "assistant") return null;
          const currentIndex = responseIndex++;
          const request = messages[index - 1];
          return (
            <LiveResponseItem
              key={message.id}
              message={message}
              requestedAt={
                request ? requestedAt(request) : new Date().toISOString()
              }
              working={inFlight && message === last}
              continuation={currentIndex > 0}
              models={models}
              onFork={() =>
                onFork({
                  messageId: message.id,
                  responseIndex: currentIndex,
                })
              }
            />
          );
        })}
        {load === "loading" && messages.length === 0 && (
          <p className="text-xs text-secondary-label" role="status">
            Loading the conversation…
          </p>
        )}
        {load === "failed" && messages.length === 0 && (
          <div className={errorNotice} role="alert">
            <span>The conversation could not be loaded.</span>
            <button type="button" onClick={onReload}>
              Try again
            </button>
          </div>
        )}
        {error && !inFlight && (
          <div className={errorNotice} role="alert">
            <span>The response did not finish. {error.message}</span>
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({
  text,
  attachments,
  attached,
}: {
  text: string;
  attachments?: string[];
  /** The records and connections the question attached, drawn from their snapshots. */
  attached: readonly AttachedConnection[];
}) {
  const panel = useRecordPanel();
  return (
    <div className="max-w-4/5 self-end rounded-2xl rounded-br-sm bg-accent px-4.5 py-3 text-sm">
      <Markdown text={text} lineBreaks />
      {attachments?.map((name, index) => (
        <span
          className={`${attachmentChipClassName} mt-2`}
          key={`${name}-${index}`}
        >
          <FileText size={14} />
          {name}
        </span>
      ))}
      {attached.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attached.map((connection) =>
            connection.items.length ? (
              connection.items.map((item) => (
                <AttachedItemChip
                  key={`${connection.connectionId}:${item.type}:${item.key}`}
                  connection={connection}
                  item={item}
                  onOpen={() => panel.open({ connection, item })}
                />
              ))
            ) : (
              <AttachedItemChip key={connection.connectionId} connection={connection} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function textOf(message: WorkspaceUIMessage) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function requestedAt(message: WorkspaceUIMessage) {
  return message.metadata?.createdAt ?? new Date().toISOString();
}
