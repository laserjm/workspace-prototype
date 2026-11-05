import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/lib/result";

const assign = vi.fn();

beforeEach(() => {
  vi.resetModules(); // a fresh "signing in once" flag per test
  vi.stubGlobal("window", {
    location: {
      pathname: "/threads/t-1",
      search: "?view=board",
      hash: "#r2",
      assign,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

async function load() {
  return (await import("./client")).callAction;
}

describe("callAction", () => {
  it("answers with the action's Result", async () => {
    const callAction = await load();
    expect(await callAction(async (n: number) => ok(n * 2), 21)).toEqual(ok(42));
    expect(
      await callAction(async () => err({ _tag: "NameTaken" as const }), undefined),
    ).toEqual(err({ _tag: "NameTaken" }));
    expect(assign).not.toHaveBeenCalled();
  });

  it("answers Unreachable when the call fails on the way, instead of throwing", async () => {
    const callAction = await load();
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await callAction(offline, undefined)).toEqual(
      err({ _tag: "Unreachable" }),
    );
  });

  it("sends the browser to sign in and back to this page on SignedOut, once", async () => {
    const callAction = await load();
    const ended = async () => err({ _tag: "SignedOut" as const });
    expect(await callAction(ended, undefined)).toEqual(err({ _tag: "SignedOut" }));
    await callAction(ended, undefined);
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(
      "/sign-in?returnTo=%2Fthreads%2Ft-1%3Fview%3Dboard%23r2",
    );
  });
});
