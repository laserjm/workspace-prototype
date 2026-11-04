"use client";

import { Clock, Folder, MessageSquare, Paperclip } from "lucide-react";
import {
  recordCountLabel,
  recordsIn,
  SourceIcon,
  useSources,
} from "@/modules/sources";
import { shelfOf, type Thread } from "../domain/thread";
import { formatWakeTime } from "./time-format";

/** A thread's full title, project, shelf and the exact records it uses. */
export function ThreadContextCard({ thread }: { thread: Thread }) {
  const { sourceById } = useSources();
  const source = thread.scope ? sourceById(thread.scope.sourceId) : undefined;
  const records =
    source && thread.scope ? recordsIn(source, thread.scope.recordIds) : [];
  const shelf = shelfOf(thread);
  const turns = 1 + (thread.followUps?.length ?? 0);
  const attachments =
    (thread.attachments?.length ?? 0) +
    (thread.followUps?.reduce(
      (count, turn) => count + turn.attachments.length,
      0,
    ) ?? 0);
  return (
    <div className="thread-context-card">
      <strong className="thread-context-title">{thread.title}</strong>
      <div className="thread-context-meta">
        <span>
          <Folder aria-hidden="true" />
          {thread.project}
        </span>
        <span>
          <MessageSquare aria-hidden="true" />
          {turns} {turns === 1 ? "turn" : "turns"} ·{" "}
          {shelf === "active"
            ? "Active"
            : shelf === "settled"
              ? "Settled"
              : "Snoozed"}
        </span>
        {thread.snoozedUntil && (
          <span>
            <Clock aria-hidden="true" />
            Returns {formatWakeTime(thread.snoozedUntil)}
          </span>
        )}
        {attachments > 0 && (
          <span>
            <Paperclip aria-hidden="true" />
            {attachments} {attachments === 1 ? "attachment" : "attachments"}
          </span>
        )}
      </div>
      {source && thread.scope ? (
        <div className="thread-context-source">
          <div className="thread-context-source-heading">
            <SourceIcon id={source.id} />
            <strong>{source.name}</strong>
            <span>
              {recordCountLabel(source, thread.scope.recordIds.length)}
            </span>
          </div>
          <p className="thread-context-collection">{source.collection}</p>
          <ul className="thread-context-records">
            {records.map((record) => (
              <li key={record.id}>
                <div>
                  <span>{record.id}</span>
                  <span>{record.status}</span>
                </div>
                <p>{record.title}</p>
              </li>
            ))}
          </ul>
          <p className="thread-context-note">
            Selected context · Read-only sample snapshot
          </p>
        </div>
      ) : (
        <p className="thread-context-note">
          No data source selected for this session.
        </p>
      )}
    </div>
  );
}
