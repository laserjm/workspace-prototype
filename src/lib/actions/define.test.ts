import { notFound, redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { err, ok } from "@/lib/result";
import { createActions } from "./define";

const requester = { userId: "ana" };
const nameSchema = z.object({ name: z.string().min(1) });

function setUp(signedIn: typeof requester | null = requester) {
  const log = vi.fn();
  const handler = vi.fn(
    async (input: { name: string }, context: { requester: typeof requester }) =>
      ok({ greeted: input.name, by: context.requester.userId }),
  );
  const { action, publicAction } = createActions({
    getRequester: async () => signedIn,
    log,
  });
  return { log, handler, action, publicAction };
}

describe("action", () => {
  it("runs the handler with the parsed input and the requester", async () => {
    const { action, handler } = setUp();
    const greet = action(nameSchema, handler);
    expect(await greet({ name: "Ben" })).toEqual(
      ok({ greeted: "Ben", by: "ana" }),
    );
    expect(handler).toHaveBeenCalledWith({ name: "Ben" }, { requester });
  });

  it("passes the handler's refusal through as is", async () => {
    const { action } = setUp();
    const refuse = action(nameSchema, async () => err({ _tag: "NameTaken" as const }));
    expect(await refuse({ name: "Ben" })).toEqual(err({ _tag: "NameTaken" }));
  });

  it("answers a visitor SignedOut before reading the input", async () => {
    const { action, handler } = setUp(null);
    const greet = action(nameSchema, handler);
    // Invalid input too: a visitor learns nothing about the nameSchema.
    expect(await greet({ name: "" })).toEqual(err({ _tag: "SignedOut" }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers input that does not match the nameSchema ValidationFailed, with dotted paths", async () => {
    const { action } = setUp();
    const handler = vi.fn(async () => ok("placed"));
    const place = action(
      z.object({ change: z.object({ until: z.iso.datetime() }) }),
      handler,
    );
    expect(await place({ change: { until: "soon" } })).toEqual(
      err({
        _tag: "ValidationFailed",
        issues: [{ path: "change.until", message: expect.any(String) }],
      }),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers Unexpected with a trace id for what the handler threw, and logs it", async () => {
    const { action, log } = setUp();
    const failure = new Error("database down");
    const fail = action(nameSchema, async () => {
      throw failure;
    });
    const result = await fail({ name: "Ben" });
    expect(log).toHaveBeenCalledOnce();
    const [traceId, logged] = log.mock.calls[0]!;
    expect(logged).toBe(failure);
    expect(result).toEqual(err({ _tag: "Unexpected", traceId }));
  });

  it("answers Unexpected when the session cannot be read", async () => {
    const log = vi.fn();
    const { action } = createActions({
      getRequester: async () => {
        throw new Error("auth unavailable");
      },
      log,
    });
    expect(await action(nameSchema, async () => ok(1))({ name: "Ben" })).toEqual(
      err({ _tag: "Unexpected", traceId: expect.any(String) }),
    );
    expect(log).toHaveBeenCalledOnce();
  });

  it.each([
    { name: "redirect", call: () => redirect("/sign-in") },
    { name: "notFound", call: () => notFound() },
  ])("lets Next.js's $name through", async ({ call }) => {
    const { action, log } = setUp();
    const navigate = action(nameSchema, async () => call());
    await expect(navigate({ name: "Ben" })).rejects.toThrow();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("publicAction", () => {
  it("runs without a session", async () => {
    const { publicAction } = setUp(null);
    const echo = publicAction(nameSchema, async (input) => ok(input.name));
    expect(await echo({ name: "Ben" })).toEqual(ok("Ben"));
  });

  it("still validates the input", async () => {
    const { publicAction } = setUp(null);
    const echo = publicAction(nameSchema, async (input) => ok(input.name));
    expect(await echo({ name: "" })).toMatchObject(
      err({ _tag: "ValidationFailed" }),
    );
  });
});
