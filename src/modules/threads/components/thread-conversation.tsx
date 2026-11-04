"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Cable, ChevronDown, FileText, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordCountLabel, SourceIcon, useSources } from "@/modules/sources";
import { shelfOf, type Thread } from "../domain/thread";
import { SampleResponse } from "./sample-response";
import { formatWakeTime } from "./time-format";

/** An open thread: its placement, origin, source, messages and responses, then the composer. */
export function ThreadConversation({
  thread,
  composer,
  onRestore,
  onOpenThread,
  onViewSource,
  onOpenRecord,
  onFork,
  onExploreSources,
}: {
  thread: Thread;
  composer: ReactNode;
  onRestore: () => void;
  onOpenThread: (id: string) => void;
  onViewSource: () => void;
  onOpenRecord: (id: string) => void;
  onFork: (responseIndex: number) => void;
  onExploreSources: () => void;
}) {
  const { sourceById } = useSources();
  const source = thread.scope ? sourceById(thread.scope.sourceId) : undefined;
  const messagesRef = useRef<HTMLDivElement>(null);
  const followUpCount = thread.followUps?.length;

  useEffect(() => {
    const messages = messagesRef.current;
    if (messages)
      messages.scrollTop = followUpCount ? messages.scrollHeight : 0;
  }, [thread.id, followUpCount]);

  return (
    <div className="conversation-view">
      {shelfOf(thread) !== "active" && (
        <div className="thread-placement-banner">
          <span>
            {thread.snoozedUntil
              ? `Snoozed until ${formatWakeTime(thread.snoozedUntil)}`
              : "This session is settled."}
          </span>
          <button type="button" onClick={onRestore}>
            {thread.snoozedUntil ? "Wake now" : "Return to active"}
          </button>
        </div>
      )}
      {thread.forkedFrom && (
        <div className="thread-fork-origin">
          <GitFork size={12} />
          <span>Forked from</span>
          <button
            type="button"
            onClick={() => onOpenThread(thread.forkedFrom!.threadId)}
          >
            {thread.forkedFrom.title}
          </button>
          <span>· response {thread.forkedFrom.responseIndex + 1}</span>
        </div>
      )}
      {source && thread.scope && (
        <div className="session-context-heading">
          <SourceIcon id={source.id} />
          <div>
            <strong>{source.collection}</strong>
            <span>
              {recordCountLabel(source, thread.scope.recordIds.length)} ·
              Read-only sample snapshot
            </span>
          </div>
          <button type="button" onClick={onViewSource}>
            View source <ChevronDown size={12} />
          </button>
        </div>
      )}
      <div className="conversation-messages" ref={messagesRef}>
        <UserMessage
          text={thread.prompt ?? thread.title}
          attachments={thread.attachments ?? []}
        />
        {thread.scope && (
          <SampleResponse
            key={`${thread.id}:0`}
            scope={thread.scope}
            prompt={thread.prompt ?? thread.title}
            onOpenRecord={onOpenRecord}
            timing={thread.responseTiming}
            skillId={thread.skillId}
            onFork={() => onFork(0)}
          />
        )}
        {thread.followUps?.map((message, index) => (
          <Fragment key={index}>
            <UserMessage
              text={message.text}
              attachments={message.attachments}
            />
            {thread.scope && (
              <SampleResponse
                key={`${thread.id}:${index + 1}`}
                scope={thread.scope}
                prompt={message.text}
                onOpenRecord={onOpenRecord}
                timing={message.responseTiming}
                skillId={message.skillId}
                continuation
                onFork={() => onFork(index + 1)}
              />
            )}
          </Fragment>
        ))}
        {!thread.scope && (
          <div className="conversation-empty">
            <Cable />
            <h2>Bring your workspace into the conversation.</h2>
            <p>
              Connect a data source and an AI provider to continue. Your draft
              stays here for this session.
            </p>
            <Button variant="outline" onClick={onExploreSources}>
              Explore data sources
            </Button>
          </div>
        )}
      </div>
      {composer}
    </div>
  );
}

function UserMessage({
  text,
  attachments,
}: {
  text: string;
  attachments: string[];
}) {
  return (
    <div className="user-message">
      <p>{text}</p>
      {attachments.map((name, index) => (
        <span className="attachment-chip" key={`${name}-${index}`}>
          <FileText size={14} />
          {name}
        </span>
      ))}
    </div>
  );
}
