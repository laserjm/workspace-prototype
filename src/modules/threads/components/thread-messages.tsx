"use client";

import { Fragment, useLayoutEffect, useRef, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import type { WorkspaceUIMessage } from "../contracts";
import type { ModelChoice } from "../domain/model-choice";
import type { Thread } from "../domain/thread";
import { attachmentChipClassName } from "./attachment-chip";
import { LiveResponse } from "./live-response";
import { useChatStore, useConversationLoad } from "./use-chat-store";

export type ForkTarget = { messageId: string; responseIndex: number };

const errorNotice =
  "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive-foreground [&>button]:rounded-sm [&>button]:border [&>button]:border-destructive/25 [&>button]:bg-card [&>button]:px-2.5 [&>button]:py-1 [&>button]:hover:bg-destructive/10";

// Keep following the stream while the reader is within this distance of the end.
const PINNED_DISTANCE = 80;

/** The thread's messages from its chat. */
export function ThreadMessages({
  thread,
  models,
  onFork,
  laneClassName,
  fadeTop,
  leading,
}: {
  thread: Thread;
  models: ModelChoice[];
  onFork: (target: ForkTarget) => void;
  /** The centred column the messages sit in; the list scrolls across the full width. */
  laneClassName: string;
  /** Nothing stays put above the list: it starts under the header and fades out there. */
  fadeTop: boolean;
  /** The first row of the list, which scrolls away with the messages. */
  leading?: ReactNode;
}) {
  const store = useChatStore();
  const load = useConversationLoad(thread.id);
  const { messages, status, error } = useChat({
    chat: store.getChat(thread.id),
  });
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

  const inFlight = status === "submitted" || status === "streaming";
  const last = messages.at(-1);
  let responseIndex = 0;

  return (
    <div
      // Full width, so the bar sits at the canvas edge. A stable gutter on
      // both edges keeps the messages centred when the bar appears.
      className={cn(
        "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]",
        thread.scope && "overscroll-contain [scrollbar-width:thin]",
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
        // set by ThreadConversation), so the last message stops above it.
        className={cn(
          // Under a fading top the first row starts below the fade (1.5rem);
          // under a fixed row, a short gap is enough.
          "flex flex-col gap-6 pb-(--composer-height)",
          fadeTop ? "pt-6" : "pt-4 max-md:pt-3",
          thread.scope && "gap-5.5",
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
                  inSession={!!thread.scope}
                  text={textOf(message)}
                  attachments={message.metadata?.attachments}
                />
                {awaitingReply && inFlight && message === last && (
                  <LiveResponse
                    requestedAt={requestedAt(message)}
                    working
                    continuation={responseIndex > 0}
                    scope={thread.scope}
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
            <LiveResponse
              key={message.id}
              message={message}
              requestedAt={
                request ? requestedAt(request) : new Date().toISOString()
              }
              working={inFlight && message === last}
              continuation={currentIndex > 0}
              scope={thread.scope}
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
            <button type="button" onClick={() => void store.load(thread.id)}>
              Try again
            </button>
          </div>
        )}
        {error && !inFlight && (
          <div className={errorNotice} role="alert">
            <span>The response did not finish. {error.message}</span>
            <button type="button" onClick={() => void store.retry(thread.id)}>
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
  inSession,
}: {
  text: string;
  attachments?: string[];
  inSession: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-4/5 self-end rounded-2xl rounded-br-sm bg-accent px-4.5 py-3 text-sm",
        inSession && "max-w-[88%] px-4 text-secondary-foreground",
      )}
    >
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
