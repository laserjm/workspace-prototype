import { describe, expect, it } from "vitest";
import {
  closeView,
  focusView,
  followConversation,
  initialPanelState,
  openSent,
  openView,
  pinView,
  restorePanel,
  setShown,
  storedPanel,
  tabsOf,
  unpinView,
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

const EMPTY: PanelState = {
  views: [],
  activeId: null,
  pinnedId: null,
  shown: true,
  rearranged: false,
};

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

describe("following the conversation", () => {
  /** A question that attached `targets`, and a reply. */
  const question = (id: string, ...targets: ViewTarget[]) => ({ id, role: "user", targets });
  const reply = (id: string) => ({ id, role: "assistant", targets: [] });
  const ids = (messages: readonly { id: string }[]) => new Set(messages.map((message) => message.id));

  it("leaves the panel exactly as it is on Try again, which asks a question it has seen again", () => {
    // The answer to u2 failed; the user read #2 since, and Try again answers u2 anew.
    const before = [question("u1", issue(1)), reply("a1"), question("u2", issue(2))];
    const asked = openSent(openSent(EMPTY, [issue(1)], { wide: true }), [issue(2)], { wide: true });
    const reading = focusView(asked, idOf(issue(1)));
    const retried = [...before, reply("a2")];
    expect(followConversation(reading, { seen: ids(before), messages: retried, wide: true })).toBe(
      reading,
    );
  });

  // A fork is a new thread: its panel stored nothing, whatever the origin's holds, so it starts
  // open on Attached with nothing open (see "a thread's panel when it opens"). It copies u1 and a1.
  const copied = [question("u1", issue(1), issue(2)), reply("a1")];
  const fork = initialPanelState({ stored: undefined, wide: true, hasAttached: true });

  it("opens nothing for the questions a fork copied", () => {
    expect(followConversation(fork, { seen: ids(copied), messages: copied, wide: true })).toBe(fork);
  });

  it("opens and focuses the items of a fork's first new question", () => {
    const asked = [...copied, question("u2", issue(3)), reply("a2")];
    const state = followConversation(fork, { seen: ids(copied), messages: asked, wide: true });
    expect(openIds(state)).toEqual([idOf(issue(3))]);
    expect(state.activeId).toBe(idOf(issue(3)));
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
  it("starts open on a wide screen when the thread has attached items, as a fork does, and hidden otherwise", () => {
    expect(initialPanelState({ stored: undefined, wide: true, hasAttached: true })).toEqual({
      views: [],
      activeId: null,
      pinnedId: null,
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

describe("pinning a view", () => {
  const three = openSent(EMPTY, [issue(1), issue(2), issue(3)], { wide: true });
  const tabIds = (state: PanelState) => tabsOf(state).map((view) => view.id);

  it("pins it above the tabs, which no longer list it, and keeps it open", () => {
    const state = pinView(three, idOf(issue(3)));
    expect(state.pinnedId).toBe(idOf(issue(3)));
    expect(openIds(state)).toEqual([idOf(issue(1)), idOf(issue(2)), idOf(issue(3))]);
    expect(tabIds(state)).toEqual([idOf(issue(1)), idOf(issue(2))]);
    expect(state.activeId).toBe(idOf(issue(1)));
    expect(state.rearranged).toBe(true);
  });

  it("shows the neighbour among the tabs below when the shown view is pinned, and Attached after the last", () => {
    const pinned = pinView(focusView(three, idOf(issue(2))), idOf(issue(2)));
    expect(pinned.activeId).toBe(idOf(issue(3)));
    const alone = pinView(openView(EMPTY, issue(1)), idOf(issue(1)));
    expect(alone.activeId).toBeNull();
  });

  it("keeps one pin: pinning another returns the old one to the tabs, shown in its place when the new one was shown", () => {
    const first = pinView(three, idOf(issue(1)));
    expect(first.activeId).toBe(idOf(issue(2)));
    const second = pinView(first, idOf(issue(2)));
    expect(second.pinnedId).toBe(idOf(issue(2)));
    expect(tabIds(second)).toEqual([idOf(issue(1)), idOf(issue(3))]);
    expect(second.activeId).toBe(idOf(issue(1)));
    const third = pinView(focusView(first, idOf(issue(3))), idOf(issue(2)));
    expect(third.activeId).toBe(idOf(issue(3)));
  });

  it("ignores a view that is not open", () => {
    expect(pinView(three, idOf(issue(9)))).toBe(three);
  });

  it("unpins it back into the tabs, where it is shown", () => {
    const state = unpinView(pinView(three, idOf(issue(3))));
    expect(state.pinnedId).toBeNull();
    expect(tabIds(state)).toEqual([idOf(issue(1)), idOf(issue(2)), idOf(issue(3))]);
    expect(state.activeId).toBe(idOf(issue(3)));
    expect(unpinView(three)).toBe(three);
  });

  it("unpins a pinned view that closes, and keeps the view below", () => {
    const state = closeView(pinView(three, idOf(issue(1))), idOf(issue(1)));
    expect(state.pinnedId).toBeNull();
    expect(openIds(state)).toEqual([idOf(issue(2)), idOf(issue(3))]);
    expect(state.activeId).toBe(idOf(issue(2)));
  });

  it("closes the shown view to its neighbour among the tabs, passing over the pin", () => {
    const pinned = pinView(focusView(three, idOf(issue(1))), idOf(issue(2)));
    expect(pinned.activeId).toBe(idOf(issue(1)));
    expect(closeView(pinned, idOf(issue(1))).activeId).toBe(idOf(issue(3)));
    expect(closeView(closeView(pinned, idOf(issue(1))), idOf(issue(3))).activeId).toBeNull();
  });

  it("never gives the pinned view the focus below: it is shown above already", () => {
    const pinned = pinView(three, idOf(issue(2)));
    expect(focusView(pinned, idOf(issue(2)))).toBe(pinned);
    const opened = openView({ ...pinned, shown: false }, issue(2));
    expect(opened.activeId).toBe(idOf(issue(1)));
    expect(opened.shown).toBe(true);
    expect(opened.pinnedId).toBe(idOf(issue(2)));
  });

  it("lets a question's first item take the focus below unless it is pinned", () => {
    const pinned = openSent(pinView(three, idOf(issue(2))), [], { wide: true });
    expect(openSent(pinned, [issue(2), issue(4)], { wide: true }).activeId).toBe(idOf(issue(1)));
    expect(openSent(pinned, [issue(4), issue(2)], { wide: true }).activeId).toBe(idOf(issue(4)));
  });
});

describe("the stored panel", () => {
  it("is versioned", () => {
    expect(storedPanel(EMPTY)).toMatchObject({ version: 2 });
  });

  it("keeps the pin", () => {
    const left = pinView(openSent(EMPTY, [issue(1), issue(2)], { wide: true }), idOf(issue(2)));
    const stored = JSON.parse(JSON.stringify(storedPanel(left)));
    expect(initialPanelState({ stored, wide: true, hasAttached: true })).toEqual(left);
  });

  it("migrates what the version before stored, with nothing pinned", () => {
    const view = (number: number) => ({
      id: `github.issue-view:${ACME}:acme/web#${number}`,
      connectionId: ACME,
      provider: "github",
      type: "issue",
      key: `acme/web#${number}`,
      snapshot: { label: `web#${number}`, title: `Issue ${number}`, state: "open" },
    });
    // As version 1 wrote it, before there was a pin.
    const before = {
      version: 1,
      views: [view(1), view(2)],
      activeId: view(2).id,
      shown: true,
      rearranged: false,
    };
    expect(restorePanel(before)).toEqual({
      views: [view(1), view(2)],
      activeId: view(2).id,
      pinnedId: null,
      shown: true,
      rearranged: false,
    });
  });

  it("drops a pin on a view it does not hold, and a focus on the pinned view", () => {
    const stored = storedPanel(openSent(EMPTY, [issue(1), issue(2)], { wide: true }));
    expect(restorePanel({ ...stored, pinnedId: idOf(issue(9)) })?.pinnedId).toBeNull();
    expect(restorePanel({ ...stored, pinnedId: idOf(issue(1)) })).toMatchObject({
      pinnedId: idOf(issue(1)),
      activeId: null,
    });
  });

  it("starts afresh from a state an older version stored, or one it cannot read", () => {
    const fromPrototype = { openIds: [idOf(issue(1))], activeId: idOf(issue(1)), pinnedId: null };
    expect(restorePanel(fromPrototype)).toBeUndefined();
    expect(restorePanel({ version: 0, views: [] })).toBeUndefined();
    expect(restorePanel({ version: 3, views: [] })).toBeUndefined();
    expect(restorePanel("{not json")).toBeUndefined();
    expect(restorePanel(null)).toBeUndefined();
    expect(restorePanel({ version: 2, views: "all" })).toBeUndefined();
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
      pinnedId: null,
      shown: false,
      rearranged: false,
    });
  });
});
