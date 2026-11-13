// The record panel's state for one thread (ADR 0003 §2, #40, #51, #66): which record views are
// open, which one is pinned above the tabs, which one is shown below them, whether the panel is,
// and whether the user rearranged it since their last question. Browser-safe and pure;
// `RecordPanelProvider` keeps it per thread in `localStorage`.
// Like the other pure rules here it imports `integrations` as types only: the view kind comes in
// as data, derived by the components with `viewKindOf`.
import { z } from "zod";
import type { AttachedItem, ConnectionRef, ItemSnapshot } from "./contracts";

/**
 * A record to open in a view: an attached item, with its connection and the view kind it opens
 * in (`viewKindOf(provider, type)`, e.g. `github.issue-view`).
 */
export type ViewTarget = { kind: string; connection: ConnectionRef; item: AttachedItem };

/** An open record view: enough to draw its tab without fetching. */
export type OpenView = {
  /** `<viewKind>:<connectionId>:<key>`, so two connections that see one record never collide. */
  id: string;
  connectionId: string;
  provider: string;
  type: string;
  key: string;
  /** How the record looked where it was opened from, until its view has read it. */
  snapshot: ItemSnapshot;
};

export type PanelState = {
  /** In the order they opened, as their tabs; the pinned view keeps its place but has no tab. */
  views: readonly OpenView[];
  /** The view shown below the tabs, never the pinned one; none shows the Attached tab. */
  activeId: string | null;
  /** The view pinned to the top half of the panel, one at a time; none when nothing is pinned. */
  pinnedId: string | null;
  shown: boolean;
  /**
   * The user opened, focused, closed, pinned or unpinned something, or hid the panel, since their
   * last question.
   */
  rearranged: boolean;
};

export const viewIdOf = (kind: string, connectionId: string, key: string) =>
  `${kind}:${connectionId}:${key}`;

/** The views that have a tab: every open view but the pinned one, in their order. */
export const tabsOf = (state: Pick<PanelState, "views" | "pinnedId">) =>
  state.views.filter((view) => view.id !== state.pinnedId);

function viewOf({ kind, connection, item }: ViewTarget): OpenView {
  return {
    id: viewIdOf(kind, connection.connectionId, item.key),
    connectionId: connection.connectionId,
    provider: connection.provider,
    type: item.type,
    key: item.key,
    snapshot: item.snapshot,
  };
}

/** The views with each target's view after them, once each. */
function withViews(views: readonly OpenView[], targets: readonly ViewTarget[]) {
  const opened = [...views];
  for (const view of targets.map(viewOf))
    if (!opened.some((open) => open.id === view.id)) opened.push(view);
  return opened;
}

/**
 * The view to show once `id` leaves the tabs (closed or pinned): the nearest tab after it, else
 * before it, passing over `pinnedId`; none shows Attached.
 */
function neighbourOf(views: readonly OpenView[], id: string, pinnedId: string | null) {
  const index = views.findIndex((view) => view.id === id);
  const isTab = (view: OpenView) => view.id !== id && view.id !== pinnedId;
  const after = views.slice(index + 1).find(isTab);
  const before = views.slice(0, Math.max(index, 0)).findLast(isTab);
  return (after ?? before)?.id ?? null;
}

/**
 * Opens a record's view, or focuses it when it is open, and shows the panel: a chip's click. A
 * pinned view is shown above already, so the view below stays.
 */
export function openView(state: PanelState, target: ViewTarget): PanelState {
  const id = viewOf(target).id;
  return {
    ...state,
    views: withViews(state.views, [target]),
    activeId: id === state.pinnedId ? state.activeId : id,
    shown: true,
    rearranged: true,
  };
}

/**
 * Opens the items a question just sent. The first takes focus and a hidden panel shows on a wide
 * screen, unless the user rearranged the panel since their last question; then they open as tabs
 * and nothing else changes. A first item that is pinned is shown above already, so the view below
 * stays. Either way the question starts a new "since".
 */
export function openSent(
  state: PanelState,
  targets: readonly ViewTarget[],
  { wide }: { wide: boolean },
): PanelState {
  const takeFocus = !state.rearranged && targets.length > 0;
  const firstId = targets[0] ? viewOf(targets[0]).id : null;
  return {
    ...state,
    views: withViews(state.views, targets),
    activeId: takeFocus && firstId !== state.pinnedId ? firstId : state.activeId,
    shown: state.shown || (takeFocus && wide),
    rearranged: false,
  };
}

/** A message of the thread as the panel follows it: a question carries the items it attached. */
export type FollowedMessage = { id: string; role: string; targets: readonly ViewTarget[] };

/**
 * The panel once the conversation reads `messages`, of which it had seen those in `seen` (#51):
 * each question it had not seen opens its items, in order (`openSent`). Replies open nothing, and
 * so does Try again, which asks a question the panel has seen again: the panel stays exactly as it
 * is, the same state, and the user's "since" goes on.
 */
export function followConversation(
  state: PanelState,
  {
    seen,
    messages,
    wide,
  }: { seen: ReadonlySet<string>; messages: readonly FollowedMessage[]; wide: boolean },
): PanelState {
  return messages
    .filter((message) => message.role === "user" && !seen.has(message.id))
    .reduce((current, question) => openSent(current, question.targets, { wide }), state);
}

/**
 * Shows one view below the tabs, or with none the Attached tab. Not the pinned view: it has no
 * tab.
 */
export function focusView(state: PanelState, id: string | null): PanelState {
  const known = id === null || state.views.some((view) => view.id === id);
  return known && id !== state.pinnedId ? { ...state, activeId: id, rearranged: true } : state;
}

/**
 * Closes a view; when it was shown, its neighbour among the tabs shows, and after the last one
 * Attached. Closing the pinned view unpins it.
 */
export function closeView(state: PanelState, id: string): PanelState {
  if (!state.views.some((view) => view.id === id)) return state;
  return {
    ...state,
    views: state.views.filter((view) => view.id !== id),
    activeId:
      state.activeId === id ? neighbourOf(state.views, id, state.pinnedId) : state.activeId,
    pinnedId: state.pinnedId === id ? null : state.pinnedId,
    rearranged: true,
  };
}

/**
 * Pins an open view to the top half of the panel (#66), above the tabs and the view shown below
 * them. One at a time: a view pinned before returns to the tabs. When the view pinned now was the
 * one shown below, the view pinned before shows in its place, or else its neighbour among the tabs.
 */
export function pinView(state: PanelState, id: string): PanelState {
  if (!state.views.some((view) => view.id === id) || state.pinnedId === id) return state;
  const activeId =
    state.activeId !== id
      ? state.activeId
      : (state.pinnedId ?? neighbourOf(state.views, id, state.pinnedId));
  return { ...state, activeId, pinnedId: id, rearranged: true };
}

/** Returns the pinned view to the tabs, where it is shown, so it stays in sight. */
export function unpinView(state: PanelState): PanelState {
  if (state.pinnedId === null) return state;
  return { ...state, activeId: state.pinnedId, pinnedId: null, rearranged: true };
}

/** Shows or hides the panel; hiding it rearranges it, so the next question does not show it again. */
export function setShown(state: PanelState, shown: boolean): PanelState {
  return { ...state, shown, rearranged: state.rearranged || !shown };
}

// --- Stored per thread in this browser ---

/**
 * The version the panel is stored in: 2 adds the pin (#66). Version 1 is migrated with nothing
 * pinned; a state stored in any other version starts afresh.
 */
const VERSION = 2;

const openViewSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  provider: z.string(),
  type: z.string(),
  key: z.string(),
  snapshot: z.object({ label: z.string(), title: z.string(), state: z.string() }),
});

const storedSchema = z.object({
  version: z.union([z.literal(1), z.literal(VERSION)]),
  views: z.array(z.unknown()),
  activeId: z.unknown(),
  /** Version 1 has none: it pinned nothing. */
  pinnedId: z.unknown().optional(),
  shown: z.unknown(),
  rearranged: z.unknown(),
});

export type StoredPanel = Omit<PanelState, "views"> & {
  version: typeof VERSION;
  views: OpenView[];
};

export function storedPanel(state: PanelState): StoredPanel {
  return { version: VERSION, ...state, views: [...state.views] };
}

/**
 * The panel as it was stored, read defensively: a state of another version, or one that is not a
 * stored panel, is nothing; version 1 pinned nothing. A view that does not read is dropped, each
 * view is kept once, a pin on a view that is gone is dropped, and a focus on a view that is gone or
 * pinned shows Attached.
 */
export function restorePanel(stored: unknown): PanelState | undefined {
  const parsed = storedSchema.safeParse(stored);
  if (!parsed.success) return undefined;
  const views: OpenView[] = [];
  for (const candidate of parsed.data.views) {
    const view = openViewSchema.safeParse(candidate);
    if (view.success && !views.some((open) => open.id === view.data.id)) views.push(view.data);
  }
  const { activeId, pinnedId, shown, rearranged } = parsed.data;
  const isOpen = (id: unknown): id is string => views.some((view) => view.id === id);
  const pinned = isOpen(pinnedId) ? pinnedId : null;
  return {
    views,
    activeId: isOpen(activeId) && activeId !== pinned ? activeId : null,
    pinnedId: pinned,
    shown: shown === true,
    rearranged: rearranged === true,
  };
}

/**
 * A thread's panel when it opens: as stored, or else open on a wide screen when the thread has
 * attached items. Below desktop width it is a sheet over the conversation and always starts hidden.
 */
export function initialPanelState({
  stored,
  wide,
  hasAttached,
}: {
  stored: unknown;
  wide: boolean;
  hasAttached: boolean;
}): PanelState {
  const restored = restorePanel(stored);
  if (restored) return { ...restored, shown: wide && restored.shown };
  return {
    views: [],
    activeId: null,
    pinnedId: null,
    shown: wide && hasAttached,
    rearranged: false,
  };
}
