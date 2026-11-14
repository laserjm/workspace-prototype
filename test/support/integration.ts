import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

let stackUp: boolean | undefined;

/**
 * True when the compose Postgres runs (`pnpm stack:up`). The tests expect its database migrated
 * (`pnpm db:migrate`).
 */
function composeStack(): boolean {
  if (stackUp === undefined) {
    try {
      execSync("docker compose exec -T postgres pg_isready -q", { stdio: "ignore" });
      stackUp = true;
    } catch {
      stackUp = false;
    }
  }
  return stackUp;
}

/**
 * `describe` for tests that need the compose Postgres. Skips with the reason in the title when
 * the stack is down, so a run without it never passes silently.
 */
export function describeIntegration(name: string, fn: () => void): void {
  if (composeStack()) describe(name, fn);
  else describe.skip(`${name} (skipped: the compose stack is down — pnpm stack:up)`, fn);
}

export type IsolationCase<Owner extends string> = {
  /** Names the actions and queries under test; part of the test titles. */
  name?: string;
  /** Two distinct users' ids. */
  ownerA: Owner;
  ownerB: Owner;
  /** Creates the rows `owner` owns. Called with `ownerA`. */
  arrange: (owner: Owner) => Promise<unknown>;
  /**
   * What `owner` reads of the arranged rows: a row, a list, a map or a count. Nothing is `null`,
   * `undefined`, `0`, `false`, or an empty array, map or set.
   */
  read: (owner: Owner) => Promise<unknown>;
  /** The write `owner` attempts on the arranged rows. Called with `ownerB`; a refusal or a throw is fine. */
  change: (owner: Owner) => Promise<unknown>;
};

const nothing = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === 0 ||
  value === false ||
  (Array.isArray(value) && value.length === 0) ||
  ((value instanceof Map || value instanceof Set) && value.size === 0);

/**
 * Registers the two tests every module with owned data runs (ARCHITECTURE.md, "Integration
 * tests"): another user's rows can be neither read nor changed. Call it inside
 * `describeIntegration`.
 */
export function assertIsolation<Owner extends string>(c: IsolationCase<Owner>): void {
  const label = c.name ? ` (${c.name})` : "";
  it(`does not return another user’s rows${label}`, async () => {
    await c.arrange(c.ownerA);
    expect(
      nothing(await c.read(c.ownerA)),
      "the owner reads their own rows back; otherwise the case proves nothing",
    ).toBe(false);
    expect(nothing(await c.read(c.ownerB)), "another user reads nothing").toBe(true);
  });
  it(`does not change another user’s rows${label}`, async () => {
    await c.arrange(c.ownerA);
    const before = await c.read(c.ownerA);
    await Promise.resolve()
      .then(() => c.change(c.ownerB))
      .catch(() => undefined);
    expect(await c.read(c.ownerA)).toEqual(before);
  });
}
