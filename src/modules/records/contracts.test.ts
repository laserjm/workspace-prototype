import { describe, expect, it } from "vitest";
import type { RecordSummary } from "@/modules/integrations";
import {
  applyPicks,
  canPick,
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
