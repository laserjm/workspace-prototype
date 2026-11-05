"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { FileText } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import type { WorkspaceUIMessage } from "../contracts";
import type { ModelChoice } from "../domain/model-choice";
import type { Thread } from "../domain/thread";
import { attachmentChipClassName } from "./attachment-chip";
import { LiveResponse } from "./live-response";
import { useChatStore, useConversationLoad } from "./use-chat-store";

export type ForkTarget = { messageId: string; responseIndex: number };

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
      className="conversation-messages"
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
        <p className="conversation-loading" role="status">
          Loading the conversation…
        </p>
      )}
      {load === "failed" && messages.length === 0 && (
        <div className="response-error" role="alert">
          <span>The conversation could not be loaded.</span>
          <button type="button" onClick={() => void store.load(thread.id)}>
            Try again
          </button>
        </div>
      )}
      {error && !inFlight && (
        <div className="response-error" role="alert">
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
}: {
  text: string;
  attachments?: string[];
}) {
  return (
    <div className="user-message">
      <p>{text}</p>
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
