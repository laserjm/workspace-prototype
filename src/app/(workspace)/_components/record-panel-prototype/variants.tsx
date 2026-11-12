"use client";
// PROTOTYPE, throwaway. Four structurally different hosts for the same open views.
import { useEffect, useRef, useState, type Dispatch } from "react";
import { ChevronDown, ChevronRight, List, MessageSquare, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECORDS, shortLabel } from "./fixtures";
import { attachedByMessage, type PanelAction, type PanelState } from "./panel-state";
import { RecordMark, RecordView, ViewHeader } from "./views";

type VariantProps = { state: PanelState; dispatch: Dispatch<PanelAction> };

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-2xs text-muted-foreground">
      {text}
    </div>
  );
}

/** The thread's attached items, grouped by the question that attached them. */
function AttachedList({
  state,
  dispatch,
  dense = false,
}: VariantProps & { dense?: boolean }) {
  const groups = attachedByMessage(state);
  if (!groups.length) return <Empty text="Nothing attached yet. Send a question with items to see them here." />;
  return (
    <div className={cn("flex flex-col overflow-y-auto", dense ? "gap-2 p-2" : "gap-3 p-3")}>
      {groups.map((group) => (
        <div key={group.index}>
          <div className="mb-1 flex items-center gap-1.5 px-1 text-3xs text-muted-foreground">
            <MessageSquare className="size-3" />
            <span className="truncate">{group.question}</span>
          </div>
          <ul className="flex flex-col">
            {group.ids.map((id) => {
              const record = RECORDS[id];
              const open = state.openIds.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "open", id, from: "list" })}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent",
                      state.activeId === id && "bg-accent",
                    )}
                  >
                    <RecordMark record={record} />
                    <span className="shrink-0 text-muted-foreground">{shortLabel(record)}</span>
                    <span className="min-w-0 flex-1 truncate">{record.title}</span>
                    {open && <span className="size-1.5 shrink-0 rounded-full bg-ring" title="Open" />}
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

// ---- A: Tabs (T3 Code's model) ---------------------------------------------------------------

export function VariantTabs({ state, dispatch }: VariantProps) {
  const [listActive, setListActive] = useState(false);
  const showList = listActive || !state.activeId;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-border [scrollbar-width:none]">
        <button
          type="button"
          onClick={() => setListActive(true)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-r border-border px-3 text-2xs text-muted-foreground",
            showList && "bg-accent text-accent-foreground",
          )}
        >
          <Paperclip className="size-3.5" /> Attached
        </button>
        {state.openIds.map((id) => {
          const record = RECORDS[id];
          const active = !showList && state.activeId === id;
          return (
            <div
              key={id}
              className={cn(
                "group/tab flex max-w-40 shrink-0 items-center gap-1.5 border-r border-border pr-1 pl-2.5 text-2xs",
                active ? "bg-background text-secondary-foreground" : "bg-muted/40 text-muted-foreground",
              )}
              onAuxClick={(event) => event.button === 1 && dispatch({ type: "close", id })}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5"
                onClick={() => {
                  setListActive(false);
                  dispatch({ type: "focus", id });
                }}
              >
                <RecordMark record={record} />
                <span className="truncate">{shortLabel(record)}</span>
              </button>
              <button
                type="button"
                aria-label="Close tab"
                className="rounded-sm p-0.5 opacity-0 group-hover/tab:opacity-100 hover:bg-accent"
                onClick={() => dispatch({ type: "close", id })}
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {showList ? (
        <AttachedList state={state} dispatch={(action) => { setListActive(false); dispatch(action); }} />
      ) : (
        <RecordView
          key={state.activeId}
          id={state.activeId!}
          className="flex-1"
          onClose={() => dispatch({ type: "close", id: state.activeId! })}
        />
      )}
    </div>
  );
}

// ---- B: Stack of collapsible views ------------------------------------------------------------

export function VariantStack({ state, dispatch }: VariantProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const refs = useRef<Record<string, HTMLElement | null>>({});
  // Newest first, so what was just sent or clicked is on top.
  const ordered = [...state.openIds].reverse();

  useEffect(() => {
    if (!state.activeId) return;
    refs.current[state.activeId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.activeId]);

  const groups = attachedByMessage(state);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {groups.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2">
          {groups.map((group) => (
            <div key={group.index} className="flex min-w-0 flex-wrap items-center gap-1">
              <span className="mr-1 max-w-32 truncate text-3xs text-muted-foreground" title={group.question}>
                Q{group.index + 1}
              </span>
              {group.ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => dispatch({ type: "open", id, from: "list" })}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs hover:bg-accent"
                >
                  <RecordMark record={RECORDS[id]} className="size-3" />
                  {shortLabel(RECORDS[id])}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {!ordered.length ? (
        <Empty text="No open views." />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-muted/30 p-2">
          {ordered.map((id) => {
            // The active view is always expanded; the others keep what the user chose.
            const isActive = state.activeId === id;
            const isCollapsed = !isActive && (collapsed[id] ?? false);
            return (
              <article
                key={id}
                ref={(node) => {
                  refs.current[id] = node;
                }}
                className={cn(
                  "flex shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-background",
                  state.activeId === id && "ring-1 ring-ring",
                )}
                onClick={() => state.activeId !== id && dispatch({ type: "focus", id })}
              >
                <div className="flex items-start">
                  <button
                    type="button"
                    aria-label={isCollapsed ? "Expand" : "Collapse"}
                    disabled={isActive}
                    className="mt-3 ml-2 rounded-sm p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCollapsed((current) => ({ ...current, [id]: !isCollapsed }));
                    }}
                  >
                    {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <ViewHeader record={RECORDS[id]} compact onClose={() => dispatch({ type: "close", id })} />
                  </div>
                </div>
                {!isCollapsed && (
                  <RecordView id={id} showHeader={false} className="max-h-112" />
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- C: Rail of open views + one view --------------------------------------------------------

export function VariantRail({ state, dispatch }: VariantProps) {
  const [listOpen, setListOpen] = useState(false);
  const groups = attachedByMessage(state);
  // Open views, grouped by the question that attached them; reply-linked ones last.
  const attachedIds = new Set(groups.flatMap((group) => group.ids));
  const railGroups = [
    ...groups.map((group) => group.ids.filter((id) => state.openIds.includes(id))),
    state.openIds.filter((id) => !attachedIds.has(id)),
  ].filter((ids) => ids.length);
  const showList = listOpen || !state.activeId;
  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/40 py-2">
        <button
          type="button"
          aria-label="Attached items"
          onClick={() => setListOpen((open) => !open)}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent",
            showList && "bg-accent text-accent-foreground",
          )}
        >
          <List className="size-4" />
        </button>
        {railGroups.map((ids, groupIndex) => (
          <div key={groupIndex} className="flex flex-col items-center gap-1 border-t border-border/70 pt-1">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                title={RECORDS[id].title}
                onClick={() => {
                  setListOpen(false);
                  dispatch({ type: "focus", id });
                }}
                className={cn(
                  "relative flex size-8 flex-col items-center justify-center rounded-md hover:bg-accent",
                  !showList && state.activeId === id && "bg-background shadow-xs ring-1 ring-border",
                )}
              >
                <RecordMark record={RECORDS[id]} />
                <span className="max-w-8 truncate text-5xs text-muted-foreground">{shortLabel(RECORDS[id])}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {showList ? (
          <AttachedList state={state} dispatch={(action) => { setListOpen(false); dispatch(action); }} />
        ) : (
          <RecordView
            key={state.activeId}
            id={state.activeId!}
            className="flex-1"
            onClose={() => dispatch({ type: "close", id: state.activeId! })}
          />
        )}
      </div>
    </div>
  );
}

// ---- D: Pinned view on top, the active one below ---------------------------------------------

export function VariantSplit({ state, dispatch }: VariantProps) {
  const others = state.openIds.filter((id) => id !== state.pinnedId);
  const activeId = state.activeId && state.activeId !== state.pinnedId ? state.activeId : (others[0] ?? null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {state.pinnedId && (
        <div className="flex min-h-0 flex-1 basis-0 flex-col border-b-2 border-border">
          <RecordView
            key={`pinned:${state.pinnedId}`}
            id={state.pinnedId}
            className="flex-1"
            pinned
            onPin={() => dispatch({ type: "pin", id: null })}
            onClose={() => dispatch({ type: "close", id: state.pinnedId! })}
          />
        </div>
      )}
      <div className="flex min-h-0 flex-1 basis-0 flex-col">
        {others.length > 0 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:none]">
            {others.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => dispatch({ type: "focus", id })}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-2xs text-muted-foreground hover:bg-accent",
                  activeId === id && "bg-accent text-accent-foreground",
                )}
              >
                <RecordMark record={RECORDS[id]} className="size-3" />
                {shortLabel(RECORDS[id])}
              </button>
            ))}
          </div>
        )}
        {activeId ? (
          <RecordView
            key={activeId}
            id={activeId}
            className="flex-1"
            onPin={() => dispatch({ type: "pin", id: activeId })}
            onClose={() => dispatch({ type: "close", id: activeId })}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <AttachedList state={state} dispatch={dispatch} />
          </div>
        )}
      </div>
    </div>
  );
}

export const VARIANTS = [
  { key: "A", name: "Tabs", Component: VariantTabs },
  { key: "B", name: "Stack", Component: VariantStack },
  { key: "C", name: "Rail", Component: VariantRail },
  { key: "D", name: "Pinned + active", Component: VariantSplit },
] as const;
