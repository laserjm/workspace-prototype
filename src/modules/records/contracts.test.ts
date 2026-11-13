import { describe, expect, it } from "vitest";
import type { RecordSummary } from "@/modules/integrations";
import {
  applyPicks,
  attachedPhrase,
  canPick,
  defaultConnectionId,
  itemCount,
  removeConnection,
  removeItem,
  togglePick,
  type AttachedConnection,
} from "./contracts";

const acme = { connectionId: "c-acme", provider: "github", label: "@acme" };

const result = (number: number, connectionId = acme.connectionId): RecordSummary => ({
  connectionId,
  type: "issue",
  key: `acme/web#${number}`,
  label: `web#${number}`,
  title: `Issue ${number}`,
  state: "open",
  updatedAt: "2026-11-13T09:00:00Z",
  where: `acme/web #${number}`,
});

/** Picks results 1 to n of `connection`, one after another. */
function pickMany(
  n: number,
  connection = acme,
  from: readonly AttachedConnection[] = [],
) {
  return Array.from({ length: n }, (_, index) => index + 1).reduce<readonly AttachedConnection[]>(
    (picks, number) =>
      togglePick(picks, connection, result(number, connection.connectionId)),
    from,
  );
}

describe("picking items", () => {
  it("groups picks by connection, with the result's snapshot", () => {
    expect(togglePick([], acme, result(48))).toEqual([
      {
        ...acme,
        items: [
          {
            type: "issue",
            key: "acme/web#48",
            snapshot: { label: "web#48", title: "Issue 48", state: "open" },
          },
        ],
      },
    ]);
  });

  it("unpicks an item picked before", () => {
    const picks = togglePick(togglePick([], acme, result(1)), acme, result(2));
    expect(togglePick(picks, acme, result(1))[0]!.items.map((item) => item.key)).toEqual([
      "acme/web#2",
    ]);
  });

  it("stops at 10 items, and still lets one be unpicked", () => {
    const ten = pickMany(10);
    expect(itemCount(ten)).toBe(10);
    expect(canPick(ten, acme.connectionId)).toBe(false);
    expect(togglePick(ten, acme, result(11))).toBe(ten);
    expect(itemCount(togglePick(ten, acme, result(3)))).toBe(9);
  });

  it("stops at 5 connections", () => {
    const five = [1, 2, 3, 4, 5].reduce<readonly AttachedConnection[]>(
      (picks, n) => togglePick(picks, { ...acme, connectionId: `c-${n}` }, result(n, `c-${n}`)),
      [],
    );
    const sixth = { ...acme, connectionId: "c-6" };
    expect(canPick(five, "c-1")).toBe(true);
    expect(canPick(five, "c-6")).toBe(false);
    expect(togglePick(five, sixth, result(6, "c-6"))).toBe(five);
  });
});

describe("removing a chip", () => {
  it("removes the connection with its last item", () => {
    const two = pickMany(2);
    const one = removeItem(two, acme.connectionId, "issue", "acme/web#1");
    expect(one).toEqual([{ ...acme, items: [expect.objectContaining({ key: "acme/web#2" })] }]);
    expect(removeItem(one, acme.connectionId, "issue", "acme/web#2")).toEqual([]);
  });

  it("removes a whole connection", () => {
    expect(removeConnection([{ ...acme, items: [] }], acme.connectionId)).toEqual([]);
  });
});

describe("applying the dialog", () => {
  it("attaches the picks, leaving out connections picked nothing from", () => {
    const github2 = { ...acme, connectionId: "c-other", label: "@other" };
    const picks = [{ ...github2, items: [] }, ...pickMany(2)];
    expect(applyPicks(picks, github2)).toEqual(pickMany(2));
  });

  it("attaches the whole connection shown when nothing is picked", () => {
    expect(applyPicks([], acme)).toEqual([{ ...acme, items: [] }]);
    expect(applyPicks(removeItem(pickMany(1), acme.connectionId, "issue", "acme/web#1"), acme)).toEqual([
      { ...acme, items: [] },
    ]);
  });
});

describe("the connection the dialog opens on", () => {
  const working = (id: string) => ({ id, status: "active" as const });
  const broken = (id: string) => ({ id, status: "needs_reconnect" as const });
  const attachedFrom = (connectionId: string) => [{ ...acme, connectionId, items: [] }];

  it("is the one already attached, or else the first", () => {
    const connections = [working("c-1"), working("c-2")];
    expect(defaultConnectionId(connections, attachedFrom("c-2"))).toBe("c-2");
    expect(defaultConnectionId(connections, [])).toBe("c-1");
  });

  it("skips a broken connection while a working one exists", () => {
    expect(defaultConnectionId([broken("c-1"), working("c-2")], [])).toBe("c-2");
    expect(defaultConnectionId([broken("c-1"), working("c-2")], attachedFrom("c-1"))).toBe("c-2");
  });

  it("is a broken one when nothing works, the attached one first", () => {
    expect(defaultConnectionId([broken("c-1"), broken("c-2")], attachedFrom("c-2"))).toBe("c-2");
    expect(defaultConnectionId([broken("c-1"), broken("c-2")], [])).toBe("c-1");
  });

  it("is nothing without connections", () => {
    expect(defaultConnectionId([], [])).toBeUndefined();
  });
});

describe("what the composer calls the attached items", () => {
  it("counts the items", () => {
    expect(attachedPhrase(pickMany(3))).toBe("these 3 items");
    expect(attachedPhrase(pickMany(1))).toBe("this item");
  });

  it("names a whole connection, or several", () => {
    const beta = { ...acme, connectionId: "c-beta", label: "@beta" };
    expect(attachedPhrase([{ ...acme, items: [] }])).toBe("@acme");
    expect(attachedPhrase([{ ...acme, items: [] }, { ...beta, items: [] }])).toBe("@acme and @beta");
  });

  it("counts the items when items and a whole connection are attached", () => {
    const beta = { ...acme, connectionId: "c-beta", label: "@beta" };
    expect(attachedPhrase([...pickMany(2), { ...beta, items: [] }])).toBe("these 2 items");
  });

  it("is nothing when nothing is attached", () => {
    expect(attachedPhrase([])).toBeUndefined();
  });
});
