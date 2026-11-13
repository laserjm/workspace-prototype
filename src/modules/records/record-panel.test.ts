import { describe, expect, it } from "vitest";
import {
  closeView,
  focusView,
  initialPanelState,
  openSent,
  openView,
  restorePanel,
  setShown,
  storedPanel,
  viewIdOf,
  type PanelState,
  type ViewTarget,
} from "./record-panel";

const ACME = "8f0e1c5a-4b9d-4e2f-9a37-2c6d1e0b7f41";
const BETA = "2c6d1e0b-7f41-4b9d-8f0e-1c5a4e2f9a37";

/** An attached item of acme's GitHub connection, `web#<number>`. */
function issue(number: number, connectionId = ACME): ViewTarget {
  return {
    kind: "github.issue-view",
    connection: { connectionId, provider: "github", label: "@acme" },
    item: {
      type: "issue",
      key: `acme/web#${number}`,
      snapshot: { label: `web#${number}`, title: `Issue ${number}`, state: "open" },
    },
  };
}

const idOf = (target: ViewTarget) =>
  viewIdOf(target.kind, target.connection.connectionId, target.item.key);

const EMPTY: PanelState = { views: [], activeId: null, shown: true, rearranged: false };

const openIds = (state: PanelState) => state.views.map((view) => view.id);

describe("a view's id", () => {
  it("is its view kind, its connection and its key, so two connections never collide", () => {
    expect(idOf(issue(7))).toBe(`github.issue-view:${ACME}:acme/web#7`);
    expect(idOf(issue(7, BETA))).not.toBe(idOf(issue(7)));
  });
});

describe("opening a view", () => {
  it("opens it, focuses it and shows the panel", () => {
    const state = openView({ ...EMPTY, shown: false }, issue(1));
    expect(openIds(state)).toEqual([idOf(issue(1))]);
    expect(state.activeId).toBe(idOf(issue(1)));
    expect(state.shown).toBe(true);
    expect(state.views[0]).toMatchObject({
      connectionId: ACME,
      provider: "github",
      type: "issue",
      key: "acme/web#1",
      snapshot: { label: "web#1", title: "Issue 1", state: "open" },
    });
  });

  it("focuses a view that is already open instead of opening it twice", () => {
    const state = openView(openView(openView(EMPTY, issue(1)), issue(2)), issue(1));
    expect(openIds(state)).toEqual([idOf(issue(1)), idOf(issue(2))]);
    expect(state.activeId).toBe(idOf(issue(1)));
  });

  it("counts as rearranging the panel", () => {
    expect(openView(EMPTY, issue(1)).rearranged).toBe(true);
  });
});

describe("sending a question", () => {
  it("opens its items and focuses the first", () => {
    const state = openSent(EMPTY, [issue(1), issue(2)], { wide: true });
    expect(openIds(state)).toEqual([idOf(issue(1)), idOf(issue(2))]);
    expect(state.activeId).toBe(idOf(issue(1)));
  });

  it("opens what is not open yet, once, and focuses the first item even when it was open", () => {
    const before = openSent(EMPTY, [issue(1), issue(2)], { wide: true });
    const state = openSent(focusView(before, idOf(issue(2))), [], { wide: true });
    const after = openSent(state, [issue(2), issue(3)], { wide: true });
    expect(openIds(after)).toEqual([idOf(issue(1)), idOf(issue(2)), idOf(issue(3))]);
    expect(after.activeId).toBe(idOf(issue(2)));
  });

  it("opens its items without taking focus when the user rearranged the panel since their last question", () => {
    const reading = focusView(openSent(EMPTY, [issue(1), issue(2)], { wide: true }), idOf(issue(2)));
    expect(reading.rearranged).toBe(true);
    const state = openSent(reading, [issue(3)], { wide: true });
    expect(openIds(state)).toEqual([idOf(issue(1)), idOf(issue(2)), idOf(issue(3))]);
    expect(state.activeId).toBe(idOf(issue(2)));
    expect(state.rearranged).toBe(false);
  });

  it("takes focus again on the question after", () => {
    const reading = focusView(openSent(EMPTY, [issue(1)], { wide: true }), null);
    const state = openSent(openSent(reading, [issue(2)], { wide: true }), [issue(3)], { wide: true });
    expect(state.activeId).toBe(idOf(issue(3)));
  });

  it("shows a hidden panel on a wide screen, but not the sheet below desktop width", () => {
    const hidden = { ...EMPTY, shown: false };
    expect(openSent(hidden, [issue(1)], { wide: true }).shown).toBe(true);
    expect(openSent(hidden, [issue(1)], { wide: false }).shown).toBe(false);
    expect(openSent(hidden, [], { wide: true }).shown).toBe(false);
  });

  it("leaves a panel the user hid hidden, since hiding it rearranges it", () => {
    const hidden = setShown(openSent(EMPTY, [issue(1)], { wide: true }), false);
    expect(hidden.rearranged).toBe(true);
    const state = openSent(hidden, [issue(2)], { wide: true });
    expect(state.shown).toBe(false);
    expect(state.activeId).toBe(idOf(issue(1)));
  });
});

describe("closing a view", () => {
  const three = openSent(EMPTY, [issue(1), issue(2), issue(3)], { wide: true });

  it("focuses the neighbour after it, or before it when it was last", () => {
    const middle = closeView(focusView(three, idOf(issue(2))), idOf(issue(2)));
    expect(openIds(middle)).toEqual([idOf(issue(1)), idOf(issue(3))]);
    expect(middle.activeId).toBe(idOf(issue(3)));
    const last = closeView(focusView(three, idOf(issue(3))), idOf(issue(3)));
    expect(last.activeId).toBe(idOf(issue(2)));
  });

  it("keeps the focus where it was when another view closes", () => {
    expect(closeView(three, idOf(issue(3))).activeId).toBe(idOf(issue(1)));
  });

  it("shows Attached when the last view closes", () => {
    const state = closeView(openView(EMPTY, issue(1)), idOf(issue(1)));
    expect(state.views).toEqual([]);
    expect(state.activeId).toBeNull();
  });
});

describe("a thread's panel when it opens", () => {
  it("starts open on a wide screen when the thread has attached items, and hidden otherwise", () => {
    expect(initialPanelState({ stored: undefined, wide: true, hasAttached: true })).toEqual({
      views: [],
      activeId: null,
      shown: true,
      rearranged: false,
    });
    expect(initialPanelState({ stored: undefined, wide: true, hasAttached: false }).shown).toBe(false);
  });

  it("always starts hidden below desktop width", () => {
    expect(initialPanelState({ stored: undefined, wide: false, hasAttached: true }).shown).toBe(false);
    const stored = storedPanel(openView(EMPTY, issue(1)));
    expect(initialPanelState({ stored, wide: false, hasAttached: true }).shown).toBe(false);
  });

  it("opens as it was left", () => {
    const left = setShown(focusView(openSent(EMPTY, [issue(1), issue(2)], { wide: true }), idOf(issue(2))), true);
    const stored = JSON.parse(JSON.stringify(storedPanel(left)));
    expect(initialPanelState({ stored, wide: true, hasAttached: true })).toEqual(left);
    const hidden = JSON.parse(JSON.stringify(storedPanel(setShown(left, false))));
    expect(initialPanelState({ stored: hidden, wide: true, hasAttached: true }).shown).toBe(false);
  });
});

describe("the stored panel", () => {
  it("is versioned", () => {
    expect(storedPanel(EMPTY)).toMatchObject({ version: 1 });
  });

  it("starts afresh from a state an older version stored, or one it cannot read", () => {
    const fromPrototype = { openIds: [idOf(issue(1))], activeId: idOf(issue(1)), pinnedId: null };
    expect(restorePanel(fromPrototype)).toBeUndefined();
    expect(restorePanel({ version: 0, views: [] })).toBeUndefined();
    expect(restorePanel("{not json")).toBeUndefined();
    expect(restorePanel(null)).toBeUndefined();
    expect(restorePanel({ version: 1, views: "all" })).toBeUndefined();
  });

  it("keeps the views it can read and drops the rest, with a focus on a view it dropped", () => {
    const stored = storedPanel(openSent(EMPTY, [issue(1), issue(2)], { wide: true }));
    const broken = {
      ...stored,
      views: [{ ...stored.views[0], snapshot: 42 }, stored.views[1], stored.views[1]],
      shown: "yes",
    };
    expect(restorePanel(broken)).toEqual({
      views: [stored.views[1]],
      activeId: null,
      shown: false,
      rearranged: false,
    });
  });
});
