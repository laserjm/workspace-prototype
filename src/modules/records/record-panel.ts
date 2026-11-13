// The record panel's state for one thread (ADR 0003 §2, #40, #51): which record views are open,
// which one is shown, whether the panel is, and whether the user rearranged it since their last
// question. Browser-safe and pure; `RecordPanelProvider` keeps it per thread in `localStorage`.
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
  /** In the order they opened, as their tabs. */
  views: readonly OpenView[];
  /** The view shown; none shows the Attached tab. */
  activeId: string | null;
  shown: boolean;
  /** The user opened, focused or closed something, or hid the panel, since their last question. */
  rearranged: boolean;
};

export const viewIdOf = (kind: string, connectionId: string, key: string) =>
  `${kind}:${connectionId}:${key}`;

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

/** Opens a record's view, or focuses it when it is open, and shows the panel: a chip's click. */
export function openView(state: PanelState, target: ViewTarget): PanelState {
  return {
    views: withViews(state.views, [target]),
    activeId: viewOf(target).id,
    shown: true,
    rearranged: true,
  };
}

/**
 * Opens the items a question just sent. The first takes focus and a hidden panel shows on a wide
 * screen, unless the user rearranged the panel since their last question; then they open as tabs
 * and nothing else changes. Either way the question starts a new "since".
 */
export function openSent(
  state: PanelState,
  targets: readonly ViewTarget[],
  { wide }: { wide: boolean },
): PanelState {
  const takeFocus = !state.rearranged && targets.length > 0;
  return {
    views: withViews(state.views, targets),
    activeId: takeFocus ? viewOf(targets[0]!).id : state.activeId,
    shown: state.shown || (takeFocus && wide),
    rearranged: false,
  };
}

/** Shows one view, or with none the Attached tab. */
export function focusView(state: PanelState, id: string | null): PanelState {
  const known = id === null || state.views.some((view) => view.id === id);
  return known ? { ...state, activeId: id, rearranged: true } : state;
}

/** Closes a view; when it was shown, its neighbour shows, and after the last one Attached. */
export function closeView(state: PanelState, id: string): PanelState {
  const index = state.views.findIndex((view) => view.id === id);
  if (index < 0) return state;
  const views = state.views.filter((view) => view.id !== id);
  const activeId =
    state.activeId === id ? (views[Math.min(index, views.length - 1)]?.id ?? null) : state.activeId;
  return { ...state, views, activeId, rearranged: true };
}

/** Shows or hides the panel; hiding it rearranges it, so the next question does not show it again. */
export function setShown(state: PanelState, shown: boolean): PanelState {
  return { ...state, shown, rearranged: state.rearranged || !shown };
}

// --- Stored per thread in this browser ---

/** The version the panel is stored in; a state stored in another one starts afresh. */
const VERSION = 1;

const openViewSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  provider: z.string(),
  type: z.string(),
  key: z.string(),
  snapshot: z.object({ label: z.string(), title: z.string(), state: z.string() }),
});

const storedSchema = z.object({
  version: z.literal(VERSION),
  views: z.array(z.unknown()),
  activeId: z.unknown(),
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
 * stored panel, is nothing; a view that does not read is dropped, each view is kept once, and a
 * focus on a view that is gone shows Attached.
 */
export function restorePanel(stored: unknown): PanelState | undefined {
  const parsed = storedSchema.safeParse(stored);
  if (!parsed.success) return undefined;
  const views: OpenView[] = [];
  for (const candidate of parsed.data.views) {
    const view = openViewSchema.safeParse(candidate);
    if (view.success && !views.some((open) => open.id === view.data.id)) views.push(view.data);
  }
  const { activeId, shown, rearranged } = parsed.data;
  return {
    views,
    activeId: views.some((view) => view.id === activeId) ? (activeId as string) : null,
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
  return { views: [], activeId: null, shown: wide && hasAttached, rearranged: false };
}
