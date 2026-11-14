import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  return (await import("./use-action")).callAction;
}

describe("callAction", () => {
  it("answers with the action's answer, refusals included", async () => {
    const callAction = await load();
    expect(await callAction(async (n: number) => ({ doubled: n * 2 }), 21)).toEqual({
      doubled: 42,
    });
    expect(await callAction(async () => ({ error: "Taken." }), undefined)).toEqual({
      error: "Taken.",
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("answers with copy when the call fails on the way, instead of throwing", async () => {
    const callAction = await load();
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await callAction(offline, undefined)).toEqual({
      error: expect.stringContaining("could not be answered"),
    });
  });

  it("sends the browser to sign in and back to this page when asked, once", async () => {
    const callAction = await load();
    const ended = async () => ({ error: "Session ended.", signIn: true as const });
    await callAction(ended, undefined);
    await callAction(ended, undefined);
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(
      "/api/sign-in?returnTo=%2Fthreads%2Ft-1%3Fview%3Dboard%23r2",
    );
  });
});
