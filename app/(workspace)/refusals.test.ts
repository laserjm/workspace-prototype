// The copy each module error answers with, and that anything else is rethrown as a bug. No Next:
// refusals.ts is plain functions over the error classes.
import { describe, expect, it } from "vitest";
import { SignedOut } from "@/lib/auth";
import * as integrations from "@/modules/integrations";
import * as threads from "@/modules/threads";
import { connectionRefusal, signedIn, threadRefusal } from "./refusals";

describe("connectionRefusal", () => {
  it.each([
    [new integrations.ConnectionNotFound("c1"), { error: "This connection no longer exists.", gone: true }],
    [new integrations.ProviderNotFound("jira"), { error: "This provider cannot be connected this way." }],
    [
      new integrations.BaseUrlRefused("", "missing"),
      { error: "Enter the address of its API.", field: "baseUrl" },
    ],
    [
      new integrations.BaseUrlRefused("ghe.example", "unresolved"),
      { error: "ghe.example could not be found. Check the address.", field: "baseUrl" },
    ],
    [
      new integrations.BaseUrlRefused("ghe.example", "private", "10.0.0.4"),
      {
        error: "ghe.example resolves to 10.0.0.4, on a private network. Enter an address on the internet.",
        field: "baseUrl",
      },
    ],
    [
      new integrations.BaseUrlRefused("localhost", "loopback"),
      {
        error: "localhost is this server itself. Enter an address on the internet.",
        field: "baseUrl",
      },
    ],
    [
      new integrations.ProviderUnreachable("GitHub", "https://api.github.com", 502),
      { error: "GitHub answered with HTTP 502." },
    ],
    [
      new integrations.ProviderUnreachable("GitHub", "https://api.github.com"),
      { error: "GitHub at https://api.github.com could not be reached." },
    ],
  ])("answers %s with its copy", (error, refusal) => {
    expect(connectionRefusal(error)).toEqual(refusal);
  });

  it("names a rejected token or password by how the user connected", () => {
    const rejected = new integrations.CredentialRejected("GitHub");
    expect(connectionRefusal(rejected, "token").error).toBe(
      "GitHub did not accept this token. Check that it is complete and has not expired.",
    );
    expect(connectionRefusal(rejected, "basic").error).toBe(
      "GitHub did not accept this username and password.",
    );
  });

  it("says when to try again after a rate limit", () => {
    const retryAt = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(connectionRefusal(new integrations.ProviderRateLimited("GitHub", retryAt)).error).toMatch(
      /^GitHub's rate limit is reached\. Try again in .+\.$/,
    );
  });

  it("rethrows what is not the module's", () => {
    const bug = new Error("boom");
    expect(() => connectionRefusal(bug)).toThrow(bug);
    expect(() => connectionRefusal(new threads.ThreadNotFound("t1"))).toThrow(threads.ThreadNotFound);
  });
});

describe("threadRefusal", () => {
  it.each([
    [new threads.ThreadNotFound("t1"), { error: "This thread no longer exists.", gone: true }],
    [new threads.ProjectNotFound("p1"), { error: "This project no longer exists.", gone: true }],
    [new threads.ThreadIdTaken("t1"), { error: "This thread was already started. Reload the page." }],
    [
      new threads.ResponseNotFound("m1"),
      { error: "This response is not stored yet. Try again once it has finished." },
    ],
    [
      new threads.SnoozeTimeInPast("2026-01-01T00:00:00Z"),
      { error: "That time has passed. Choose another time.", field: "until" },
    ],
  ])("answers %s with its copy", (error, refusal) => {
    expect(threadRefusal(error)).toEqual(refusal);
  });

  it("rethrows what no action can cause, and what is not the module's", () => {
    expect(() => threadRefusal(new threads.ForeignConnectionAttached(["c1"]))).toThrow(
      threads.ForeignConnectionAttached,
    );
    expect(() => threadRefusal(new integrations.ConnectionNotFound("c1"))).toThrow(integrations.ConnectionNotFound);
  });
});

describe("signedIn", () => {
  it("answers a visitor with sign-in, and passes the module's answer through", async () => {
    await expect(signedIn(() => Promise.reject(new SignedOut()))).resolves.toEqual({
      error: "Your session has ended. Taking you to sign in…",
      signIn: true,
    });
    await expect(signedIn(() => Promise.resolve({ id: "p1" }))).resolves.toEqual({ id: "p1" });
  });

  it("lets a bug through", async () => {
    await expect(signedIn(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
  });
});
