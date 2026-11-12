// PROTOTYPE, throwaway. The open-view state every variant shares, so the variants differ only
// in layout. Kept per thread in memory (a module Map), so switching threads and back restores it.
import { useEffect, useReducer } from "react";
import { MESSAGES, RECORDS, shortLabel } from "./fixtures";

export type PanelState = {
  /** How many canned questions have been sent. */
  sent: number;
  openIds: string[];
  activeId: string | null;
  /** Variant D only: the view kept in the top pane. */
  pinnedId: string | null;
  log: string[];
};

export type PanelAction =
  | { type: "send"; index: number }
  | { type: "open"; id: string; from: "chip" | "list" }
  | { type: "focus"; id: string }
  | { type: "close"; id: string }
  | { type: "pin"; id: string | null }
  | { type: "reset" };

export const EMPTY: PanelState = {
  sent: 0,
  openIds: [],
  activeId: null,
  pinnedId: null,
  log: [],
};

const label = (id: string) => (RECORDS[id] ? shortLabel(RECORDS[id]) : id);

function upsert(openIds: string[], id: string) {
  return openIds.includes(id) ? openIds : [...openIds, id];
}

function reduce(state: PanelState, action: PanelAction): PanelState {
  const log = (line: string) => [line, ...state.log].slice(0, 6);
  switch (action.type) {
    case "send": {
      const message = MESSAGES[action.index];
      if (!message || state.sent > action.index) return state;
      let openIds = state.openIds;
      for (const id of message.attached) openIds = upsert(openIds, id);
      return {
        ...state,
        sent: action.index + 1,
        openIds,
        activeId: message.attached[0] ?? state.activeId,
        log: log(`sent question ${action.index + 1}: opened ${message.attached.map(label).join(", ")}`),
      };
    }
    case "open": {
      const existed = state.openIds.includes(action.id);
      return {
        ...state,
        openIds: upsert(state.openIds, action.id),
        activeId: action.id,
        log: log(`${action.from} ${label(action.id)}: ${existed ? "focused" : "opened"}`),
      };
    }
    case "focus":
      return { ...state, activeId: action.id };
    case "close": {
      const index = state.openIds.indexOf(action.id);
      const openIds = state.openIds.filter((id) => id !== action.id);
      const activeId =
        state.activeId === action.id
          ? (openIds[Math.min(index, openIds.length - 1)] ?? null)
          : state.activeId;
      return {
        ...state,
        openIds,
        activeId,
        pinnedId: state.pinnedId === action.id ? null : state.pinnedId,
        log: log(`closed ${label(action.id)}`),
      };
    }
    case "pin":
      return {
        ...state,
        pinnedId: action.id,
        activeId:
          action.id && state.activeId === action.id
            ? (state.openIds.find((id) => id !== action.id) ?? null)
            : state.activeId,
        log: log(action.id ? `pinned ${label(action.id)}` : "unpinned"),
      };
    case "reset":
      return EMPTY;
  }
}

const memory = new Map<string, PanelState>();

export function usePanelState(threadId: string) {
  const [state, dispatch] = useReducer(reduce, memory.get(threadId) ?? EMPTY);
  useEffect(() => {
    memory.set(threadId, state);
  }, [threadId, state]);
  return [state, dispatch] as const;
}

/** The attached items of the questions sent so far, by question. */
export function attachedByMessage(state: PanelState) {
  return MESSAGES.slice(0, state.sent).map((message, index) => ({
    index,
    question: message.question,
    ids: [...message.attached] as string[],
  }));
}
