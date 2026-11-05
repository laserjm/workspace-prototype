"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { useChat } from "@ai-sdk/react";
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
}: {
  thread: Thread;
  models: ModelChoice[];
  onFork: (target: ForkTarget) => void;
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

  const inFlight = status === "submitted" || status === "streaming";
  const last = messages.at(-1);
  let responseIndex = 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-6",
        thread.scope &&
          "gap-5.5 py-6.5 overscroll-contain [scrollbar-width:thin] max-md:pt-5.5",
      )}
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <
          PINNED_DISTANCE;
      }}
    >
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
      <p className="whitespace-pre-wrap wrap-anywhere">{text}</p>
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
