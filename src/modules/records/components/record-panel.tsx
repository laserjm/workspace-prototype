"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  Paperclip,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import {
  RecordKindMark,
  RecordStateBadge,
  RecordViewBody,
  useIntegrations,
  viewKindOf,
  waitLabel,
} from "@/modules/integrations";
import {
  attachedByQuestion,
  attachedConnectionsOf,
  type MessageWithParts,
} from "../attached-items";
import type { AttachedConnection } from "../contracts";
import { viewIdOf, type OpenView } from "../record-panel";
import { AttachDialog } from "./attach-dialog";
import { useRecordPanel } from "./record-panel-provider";
import type { ViewError, ViewLoad } from "./record-view-store";
import { ResizablePanel } from "./resizable-panel";

type PanelMessage = MessageWithParts & { id: string };

/** A view's record as the store holds it, read the first time the view is shown. */
function useViewLoad(view: OpenView): ViewLoad {
  const { store } = useRecordPanel();
  return useSyncExternalStore(
    store.subscribe,
    () => store.state(view.id),
    () => store.state(view.id),
  );
}

/**
 * Opens the items of each question the thread sends from now on: a question already in the
 * conversation when the panel mounts, or one asked again by Try again, opens nothing.
 */
function useOpenSentQuestions(messages: readonly PanelMessage[]) {
  const { openSent } = useRecordPanel();
  const seen = useRef<Set<string>>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(messages.map((message) => message.id));
      return;
    }
    for (const message of messages) {
      if (seen.current.has(message.id)) continue;
      seen.current.add(message.id);
      if (message.role === "user") openSent(attachedConnectionsOf(message));
    }
  }, [messages, openSent]);
}

/**
 * The right-hand panel of an open thread (ADR 0003 §2): a fixed Attached tab listing what the
 * thread's questions attached, and a tab per open record view, of which only the shown one renders
 * and reads its record. Beside the conversation on a wide screen, resizable; below desktop width
 * a sheet over it. Renders nothing while hidden, but sets the thread's panel up and opens what
 * each new question attached.
 */
export function RecordPanel({
  messages,
  draft,
  onDraftChange,
  onConnect,
}: {
  /** The thread's conversation. */
  messages: readonly PanelMessage[];
  /** The composer's attached items, which the empty Attached tab's dialog changes. */
  draft: readonly AttachedConnection[];
  onDraftChange: Dispatch<SetStateAction<readonly AttachedConnection[]>>;
  /** Leads to Settings → Data sources, to connect or reconnect. */
  onConnect: () => void;
}) {
  const panel = useRecordPanel();
  const groups = attachedByQuestion(messages);
  const hasAttached = groups.length > 0;
  const { state, ensure, wide } = panel;
  useLayoutEffect(() => {
    if (!state) ensure(hasAttached);
  }, [state, ensure, hasAttached]);
  useOpenSentQuestions(messages);
  const [attaching, setAttaching] = useState(false);

  if (!state?.shown) return null;
  const active = state.views.find((view) => view.id === state.activeId);
  const content = (
    <div id="record-panel" className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-stretch border-b border-border">
        <div
          role="tablist"
          aria-label="Record views"
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!active}
            onClick={() => panel.focus(null)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-r border-border px-3 text-2xs text-muted-foreground",
              !active && "bg-accent text-accent-foreground",
            )}
          >
            <Paperclip className="size-3.5" /> Attached
          </button>
          {state.views.map((view) => (
            <ViewTab key={view.id} view={view} active={view.id === active?.id} />
          ))}
        </div>
        <div className="flex shrink-0 items-center px-1.5">
          <IconButton label="Hide record panel" onClick={() => panel.setShown(false)}>
            <PanelRightClose />
          </IconButton>
        </div>
      </div>
      {active ? (
        <RecordViewFrame key={active.id} view={active} onConnect={onConnect} />
      ) : (
        <AttachedList groups={groups} openIds={state.views.map((view) => view.id)}>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-2xs text-muted-foreground">
            <p>Nothing attached yet. Attach issues and pull requests to read them here.</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-secondary-foreground hover:bg-accent"
              onClick={() => setAttaching(true)}
            >
              <Plus className="size-3.5" /> Choose a data source
            </button>
          </div>
        </AttachedList>
      )}
      {attaching && (
        <AttachDialog
          attached={draft}
          onApply={onDraftChange}
          onClose={() => setAttaching(false)}
          onConnect={onConnect}
        />
      )}
    </div>
  );
  if (wide) return <ResizablePanel>{content}</ResizablePanel>;
  return (
    <>
      <button
        type="button"
        aria-label="Hide record panel"
        className="absolute inset-0 z-25 bg-black/15"
        onClick={() => panel.setShown(false)}
      />
      <aside
        aria-label="Record panel"
        className="absolute inset-y-0 right-0 z-30 w-[min(30rem,88vw)] border-l border-border shadow-popover"
      >
        {content}
      </aside>
    </>
  );
}

/** The header's button that shows or hides the open thread's record panel. */
export function RecordPanelToggle() {
  const { state, setShown } = useRecordPanel();
  const shown = state?.shown ?? false;
  return (
    <IconButton
      label={shown ? "Hide record panel" : "Show record panel"}
      aria-pressed={shown}
      onClick={() => setShown(!shown)}
    >
      <PanelRight />
    </IconButton>
  );
}

/** A view's tab: its kind mark in its state's tone and its short label; closes on hover or middle-click. */
function ViewTab({ view, active }: { view: OpenView; active: boolean }) {
  const panel = useRecordPanel();
  const load = useViewLoad(view);
  const state = load.status === "ready" ? load.read.summary.state : view.snapshot.state;
  return (
    <div
      role="tab"
      aria-selected={active}
      className={cn(
        "group/tab flex max-w-40 shrink-0 items-center gap-1 border-r border-border pr-1 pl-2.5 text-2xs",
        active ? "bg-background text-secondary-foreground" : "bg-muted/40 text-muted-foreground",
      )}
      title={view.snapshot.title}
      onMouseDown={(event) => {
        // A middle press would start scrolling the page instead.
        if (event.button === 1) event.preventDefault();
      }}
      onAuxClick={(event) => {
        if (event.button === 1) panel.close(view.id);
      }}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-1.5 py-2"
        onClick={() => panel.focus(view.id)}
      >
        <RecordKindMark providerId={view.provider} type={view.type} state={state} />
        <span className="truncate">{view.snapshot.label}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${view.snapshot.label}`}
        className="rounded-sm p-0.5 opacity-0 group-hover/tab:opacity-100 hover:bg-accent focus-visible:opacity-100 touch:opacity-100"
        onClick={() => panel.close(view.id)}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/** The thread's attached items, grouped by the question that attached them; `children` when none. */
function AttachedList({
  groups,
  openIds,
  children,
}: {
  groups: ReturnType<typeof attachedByQuestion<PanelMessage>>;
  openIds: readonly string[];
  children: ReactNode;
}) {
  const panel = useRecordPanel();
  if (!groups.length) return children;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [scrollbar-width:thin]">
      {groups.map(({ message, question, items }) => (
        <div key={message.id}>
          <div className="mb-1 flex items-center gap-1.5 px-1 text-3xs text-muted-foreground">
            <MessageSquare className="size-3 shrink-0" />
            <span className="truncate">{question || "Question"}</span>
          </div>
          <ul className="flex flex-col">
            {items.map(({ connection, item }) => {
              const id = viewIdOf(
                viewKindOf(connection.provider, item.type),
                connection.connectionId,
                item.key,
              );
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => panel.open({ connection, item })}
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent"
                  >
                    <RecordKindMark
                      providerId={connection.provider}
                      type={item.type}
                      state={item.snapshot.state}
                    />
                    <span className="shrink-0 text-muted-foreground">{item.snapshot.label}</span>
                    <span className="min-w-0 flex-1 truncate">{item.snapshot.title}</span>
                    {openIds.includes(id) && (
                      <span className="size-1.5 shrink-0 rounded-full bg-ring" title="Open" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The frame every record view shares (kind mark, where, live state, title, refresh, open on the
 * provider's site, close) around its provider's body. It reads the record the first time it is
 * shown, and again only on refresh.
 */
function RecordViewFrame({ view, onConnect }: { view: OpenView; onConnect: () => void }) {
  const panel = useRecordPanel();
  const { providers, connections } = useIntegrations();
  const providerName = providers.find((provider) => provider.id === view.provider)?.name ?? view.provider;
  const removed = !connections.some((connection) => connection.id === view.connectionId);
  const load = useViewLoad(view);
  const { store } = panel;
  useEffect(() => {
    if (!removed) store.load(view);
  }, [removed, store, view]);

  const summary = load.status === "ready" ? load.read.summary : undefined;
  const url = summary?.url ?? (load.status === "failed" ? load.error.url : undefined);
  const state = summary?.state ?? view.snapshot.state;
  const busy = load.status === "loading" || (load.status === "ready" && load.refreshing);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 items-start gap-2 px-4 pt-3.5 pb-3">
        <RecordKindMark providerId={view.provider} type={view.type} state={state} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-3xs text-muted-foreground">
            <span className="truncate">{summary?.where ?? view.snapshot.label}</span>
            <RecordStateBadge providerId={view.provider} type={view.type} state={state} />
          </div>
          <strong className="mt-0.5 block text-sm leading-snug font-medium text-secondary-foreground">
            {summary?.title ?? view.snapshot.title}
          </strong>
        </div>
        <div className="-mt-0.5 flex shrink-0 items-center">
          {!removed && (
            <IconButton label="Refresh" disabled={busy} onClick={() => store.refresh(view)}>
              {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            </IconButton>
          )}
          {url && !removed && (
            <IconButton
              label={`Open on ${providerName}`}
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink />
            </IconButton>
          )}
          <IconButton label="Close view" onClick={() => panel.close(view.id)}>
            <X />
          </IconButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60 px-4 py-3.5 text-xs [scrollbar-width:thin]">
        {removed ? (
          <p className="text-2xs text-muted-foreground">
            This record’s connection was removed, so it can’t be read here.
          </p>
        ) : load.status === "ready" ? (
          <RecordViewBody
            kind={viewKindOf(view.provider, view.type)}
            detail={load.read.detail}
            fallback={<ViewSkeleton />}
          />
        ) : load.status === "failed" ? (
          <ViewRefusal
            error={load.error}
            providerName={providerName}
            onRetry={() => store.refresh(view)}
            onConnect={onConnect}
          />
        ) : (
          <ViewSkeleton />
        )}
      </div>
    </div>
  );
}

function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" role="status" aria-label="Loading">
      {["w-4/5", "w-full", "w-3/5", "w-11/12", "w-2/5"].map((width) => (
        <span key={width} className={cn("h-2.5 rounded-sm bg-muted motion-safe:animate-pulse", width)} />
      ))}
    </div>
  );
}

const actionClassName = "rounded-md border border-border px-2 py-1 hover:bg-accent";

/** Why a view's record did not load, and what can be done: retry, reconnect or look on the site. */
function ViewRefusal({
  error,
  providerName,
  onRetry,
  onConnect,
}: {
  error: ViewError;
  providerName: string;
  onRetry: () => void;
  onConnect: () => void;
}) {
  const reconnect = error.kind === "needs_reconnect";
  const message = {
    not_found: `${providerName} has no such record, or this connection can’t see it.`,
    no_access: `This connection’s token is not allowed to read it.`,
    needs_reconnect: `${providerName} refused this connection’s token. Connect it again.`,
    rate_limited: `${providerName}’s rate limit is reached. Try again in ${error.retryAt ? waitLabel(error.retryAt) : "a moment"}.`,
    unreachable: `${providerName} could not be reached.`,
    invalid_query: error.message,
  }[error.kind];
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-border bg-muted/40 p-3" role="alert">
      <span className="flex items-center gap-1.5 font-medium text-secondary-foreground">
        <TriangleAlert className="size-3.5 text-warning-foreground" />
        Can’t read this record
      </span>
      <p className="text-2xs text-muted-foreground">{message}</p>
      <div className="flex gap-2 text-2xs">
        {reconnect && (
          <button type="button" className={actionClassName} onClick={onConnect}>
            Reconnect
          </button>
        )}
        <button type="button" className={actionClassName} onClick={onRetry}>
          Retry
        </button>
        {!reconnect && error.url && (
          <a className={actionClassName} href={error.url} target="_blank" rel="noreferrer">
            Open on {providerName}
          </a>
        )}
      </div>
    </div>
  );
}
