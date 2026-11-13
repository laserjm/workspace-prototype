"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { GitFork } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelChoice, WorkspaceUIMessage } from "@/modules/agent";
import { type Thread } from "../contracts";
import { shelfOf } from "../placement";
import { ThreadMessages, type ForkTarget } from "./thread-messages";
import { formatWakeTime } from "./time-format";
import { useStoredConversation } from "./use-stored-conversation";
import {
  LOADING_CONTROLS,
  useThreadChat,
  type ConversationControls,
  type FirstQuestion,
} from "./use-thread-chat";

/**
 * The centred column a conversation's content sits in. The conversation itself
 * spans the canvas, so the message list scrolls with its bar at the canvas
 * edge while the messages keep this width (as T3 Code's chat content lane).
 */
const conversationLane =
  "mx-auto w-[min(var(--workspace-composer-width),calc(100%-4rem))] max-desktop:w-[calc(100%-3rem)] max-md:w-[calc(100%-1.75rem)]";

type ThreadConversationProps = {
  thread: Thread;
  models: ModelChoice[];
  /** The skills switched on in this browser, which a retry passes on. */
  enabledSkills: string[];
  /** The composer, given what it can do with the conversation. */
  composer: (controls: ConversationControls) => ReactNode;
  /** The first question of a thread this page just started: it opens empty and sends it. */
  firstQuestion?: FirstQuestion;
  onFirstQuestionSent?: () => void;
  /** Whether a response is in flight; only the open thread can have one. */
  onWorkingChange: (working: boolean) => void;
  onRestore: () => void;
  onOpenThread: (id: string) => void;
  onFork: (target: ForkTarget) => void;
  /** What sits beside the conversation once it is here: the record panel. */
  panel: (messages: WorkspaceUIMessage[]) => ReactNode;
};

/**
 * An open thread: its placement, origin, messages and responses, then the composer, and once
 * its conversation is here, the record panel beside it.
 * It opens with the conversation the database holds; key it by the thread's id.
 */
export function ThreadConversation(props: ThreadConversationProps) {
  const { conversation, reload } = useStoredConversation(
    props.thread.id,
    Boolean(props.firstQuestion),
  );
  if (conversation.state === "ready")
    return (
      <LiveConversation {...props} initialMessages={conversation.messages} />
    );
  return (
    <ConversationLayout
      {...props}
      composer={props.composer(LOADING_CONTROLS)}
      list={(lane) => (
        <ThreadMessages
          {...lane}
          messages={[]}
          inFlight={false}
          load={conversation.state}
          onReload={reload}
          onRetry={() => undefined}
          models={props.models}
          onFork={props.onFork}
        />
      )}
    />
  );
}

/** The thread's chat, opened with its stored conversation. */
function LiveConversation({
  initialMessages,
  ...props
}: ThreadConversationProps & { initialMessages: WorkspaceUIMessage[] }) {
  const chat = useThreadChat({ ...props, initialMessages });
  return (
    <>
      <ConversationLayout
        {...props}
        composer={props.composer(chat.controls)}
        list={(lane) => (
          <ThreadMessages
            {...lane}
            messages={chat.messages}
            inFlight={chat.busy}
            error={chat.error}
            load="ready"
            onReload={() => undefined}
            onRetry={chat.retry}
            models={props.models}
            onFork={props.onFork}
          />
        )}
      />
      {props.panel(chat.messages)}
    </>
  );
}

/** Where the message list sits, which the layout works out. */
type ListLane = {
  laneClassName: string;
  fadeTop: boolean;
  leading: ReactNode;
};

function ConversationLayout({
  thread,
  composer,
  list,
  onRestore,
  onOpenThread,
}: {
  thread: Thread;
  composer: ReactNode;
  list: (lane: ListLane) => ReactNode;
  onRestore: () => void;
  onOpenThread: (id: string) => void;
}) {
  const conversationRef = useRef<HTMLDivElement>(null);
  const composerLayerRef = useRef<HTMLDivElement>(null);

  // The composer floats over the end of the message list. Its height (it grows
  // with attachments or a skill hint) becomes --composer-height, which the
  // list reserves at its end so the last message stops just above it.
  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    const layer = composerLayerRef.current;
    if (!conversation || !layer) return;
    const publish = () =>
      conversation.style.setProperty(
        "--composer-height",
        `${Math.ceil(layer.getBoundingClientRect().height)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);
  // "Forked from" opens the list and scrolls away with it, like T3 Code's
  // parent-thread line.
  const forkOrigin = thread.forkedFrom && (
    <div className="flex shrink-0 items-center gap-1 overflow-hidden text-3xs whitespace-nowrap text-muted-foreground/70">
      <GitFork size={12} />
      <span>Forked from</span>
      <button
        type="button"
        onClick={() => onOpenThread(thread.forkedFrom!.threadId)}
        className="truncate rounded-xs text-slate-500 hover:underline dark:text-slate-400"
      >
        {thread.forkedFrom.title}
      </button>
      <span>· response {thread.forkedFrom.responseIndex + 1}</span>
    </div>
  );
  // A parked thread's notice stays put under the header. Without it, the list
  // starts right under the header and fades out beneath it.
  const placed = shelfOf(thread) !== "active";
  // The rows above and below the message list reserve the same scrollbar
  // gutters as the list, so all three lanes resolve to one width even where
  // the browser draws classic (space-taking) scrollbars.
  const gutters = "shrink-0 overflow-hidden [scrollbar-gutter:stable_both-edges]";
  return (
    <div
      ref={conversationRef}
      className="relative flex h-full min-w-0 flex-1 flex-col"
    >
      {placed && (
        <div className={gutters}>
          <div className={conversationLane}>
            <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                {thread.snoozedUntil
                  ? `Snoozed until ${formatWakeTime(thread.snoozedUntil)}`
                  : "This session is settled."}
              </span>
              <button
                type="button"
                onClick={onRestore}
                className="font-medium text-secondary-foreground"
              >
                {thread.snoozedUntil ? "Wake now" : "Return to active"}
              </button>
            </div>
          </div>
        </div>
      )}
      {list({
        laneClassName: conversationLane,
        fadeTop: !placed,
        leading: forkOrigin,
      })}
      {/* Over the list's end: messages fade out in a short strip above the
          composer, then pass behind a solid backdrop. Only the composer
          itself takes clicks. */}
      <div
        ref={composerLayerRef}
        className={cn(
          gutters,
          "pointer-events-none absolute inset-x-0 bottom-0 z-10",
        )}
      >
        <div
          aria-hidden
          className="h-6 bg-linear-to-t from-background to-transparent"
        />
        <div className="bg-background pb-12 max-md:pb-11">
          <div className={cn("pointer-events-auto", conversationLane)}>{composer}</div>
        </div>
      </div>
    </div>
  );
}
