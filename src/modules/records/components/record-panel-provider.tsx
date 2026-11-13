"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { bug } from "@/lib/errors";
import { viewKindOf } from "@/modules/integrations";
import { attachedConnectionsOf, type MessageWithParts } from "../attached-items";
import type { AttachedConnection, AttachedItem, ConnectionRef } from "../contracts";
import {
  closeView,
  focusView,
  followConversation,
  initialPanelState,
  openView,
  pinView,
  setShown,
  storedPanel,
  unpinView,
  type PanelState,
  type ViewTarget,
} from "../record-panel";
import { RecordViewStore } from "./record-view-store";

/** The workspace's desktop width; below it the panel is a sheet over the conversation. */
const WIDE = "(min-width: 1200px)";

function subscribeWide(listener: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Whether the window is at least desktop width (`desktop:` in globals.css). */
function useWideScreen() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

const storageKey = (threadId: string) => `workspace:record-panel:${threadId}`;

function readStored(threadId: string): unknown {
  try {
    const stored = window.localStorage.getItem(storageKey(threadId));
    return stored === null ? undefined : JSON.parse(stored);
  } catch {
    // Unavailable or unreadable storage starts the panel afresh.
    return undefined;
  }
}

function writeStored(threadId: string, state: PanelState) {
  try {
    window.localStorage.setItem(storageKey(threadId), JSON.stringify(storedPanel(state)));
  } catch {
    // The panel still works for this page without storage.
  }
}

/** A record to open, with its connection. */
type Openable = { connection: ConnectionRef; item: AttachedItem };

/** The record with the view kind it opens in. */
const targetOf = ({ connection, item }: Openable): ViewTarget => ({
  kind: viewKindOf(connection.provider, item.type),
  connection,
  item,
});

/** The items of a question's attached connections; a whole connection opens no view. */
const targetsOf = (attached: readonly AttachedConnection[]): ViewTarget[] =>
  attached.flatMap(({ items, ...connection }) =>
    items.map((item) => targetOf({ connection, item })),
  );

export type RecordPanelControls = {
  /** The open thread's panel; none before its conversation has loaded and nothing set it up. */
  state: PanelState | undefined;
  wide: boolean;
  store: RecordViewStore;
  /** Sets the thread's panel up once its conversation is here, as stored or from defaults. */
  ensure: (hasAttached: boolean) => void;
  /** Opens a record's view, or focuses it: a chip's click. */
  open: (record: Openable) => void;
  /**
   * Opens the items of each question in `messages` not in `seen`: what the thread sent since
   * (`followConversation` in record-panel.ts). Try again opens nothing.
   */
  follow: (
    seen: ReadonlySet<string>,
    messages: readonly (MessageWithParts & { id: string })[],
  ) => void;
  /** Shows a view, or with none the Attached tab. */
  focus: (id: string | null) => void;
  close: (id: string) => void;
  /** Pins a view to the top half, replacing the pin (`pinView` in record-panel.ts). */
  pin: (id: string) => void;
  /** Returns the pinned view to the tabs. */
  unpin: () => void;
  setShown: (shown: boolean) => void;
};

const RecordPanelContext = createContext<RecordPanelControls | null>(null);

/**
 * Holds the record panel of each thread this page opened, kept per thread in this browser's
 * `localStorage`, and the store of the records its views read, for the page's lifetime. Put it
 * around the header and the conversation of `threadId`, the open thread (none for a new one).
 */
export function RecordPanelProvider({
  threadId,
  children,
}: {
  threadId: string | null;
  children: ReactNode;
}) {
  const wide = useWideScreen();
  const [store] = useState(() => new RecordViewStore());
  const [panels, setPanels] = useState<Readonly<Record<string, PanelState>>>({});
  const state = threadId ? panels[threadId] : undefined;

  useEffect(() => {
    if (threadId && state) writeStored(threadId, state);
  }, [threadId, state]);

  const update = useCallback(
    (change: (state: PanelState) => PanelState, hasAttached = false) => {
      if (!threadId) return;
      setPanels((previous) => {
        const current =
          previous[threadId] ??
          initialPanelState({ stored: readStored(threadId), wide, hasAttached });
        const next = change(current);
        // An unchanged panel is not set again, so nothing renders or is stored for it.
        return next === previous[threadId] ? previous : { ...previous, [threadId]: next };
      });
    },
    [threadId, wide],
  );

  const value = useMemo(
    (): RecordPanelControls => ({
      state,
      wide,
      store,
      ensure: (hasAttached) => update((current) => current, hasAttached),
      open: (record) => update((current) => openView(current, targetOf(record))),
      follow: (seen, messages) =>
        update((current) =>
          followConversation(current, {
            seen,
            messages: messages.map((message) => ({
              id: message.id,
              role: message.role,
              targets: targetsOf(attachedConnectionsOf(message)),
            })),
            wide,
          }),
        ),
      focus: (id) => update((current) => focusView(current, id)),
      close: (id) => update((current) => closeView(current, id)),
      pin: (id) => update((current) => pinView(current, id)),
      unpin: () => update((current) => unpinView(current)),
      setShown: (shown) => update((current) => setShown(current, shown)),
    }),
    [state, wide, store, update],
  );
  return <RecordPanelContext value={value}>{children}</RecordPanelContext>;
}

/** The open thread's record panel, provided by `RecordPanelProvider`. */
export function useRecordPanel(): RecordPanelControls {
  return (
    useContext(RecordPanelContext) ??
    bug("useRecordPanel is called outside RecordPanelProvider")
  );
}
