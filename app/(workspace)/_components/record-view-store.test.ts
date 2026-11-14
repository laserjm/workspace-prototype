import { describe, expect, it, vi } from "vitest";
import type { RecordRead } from "@/modules/integrations/contracts";
import { RecordViewStore, type FetchRecord, type ViewRecordRef } from "./record-view-store";

const ok = <T,>(value: T) => ({ ok: true as const, value });
const err = <E,>(error: E) => ({ ok: false as const, error });

const VIEW: ViewRecordRef = {
  id: "github.issue-view:acme:acme/web#1",
  connectionId: "acme",
  type: "issue",
  key: "acme/web#1",
};

function aRead(title = "Login times out"): RecordRead {
  return {
    summary: {
      connectionId: "acme",
      type: "issue",
      key: "acme/web#1",
      label: "web#1",
      title,
      state: "open",
      updatedAt: "2026-11-13T10:00:00Z",
      where: "acme/web #1",
      url: "https://github.com/acme/web/issues/1",
    },
    detail: { body: "…" },
  };
}

/** A fetch whose answers the test hands out one by one. */
function deferredFetch() {
  const pending: ((answer: Awaited<ReturnType<FetchRecord>>) => void)[] = [];
  const fetch = vi.fn<FetchRecord>(
    () => new Promise((resolve) => pending.push(resolve)),
  );
  return { fetch, answer: (value: Awaited<ReturnType<FetchRecord>>) => pending.shift()!(value) };
}

describe("RecordViewStore", () => {
  it("reads a view's record once, however often it is shown", async () => {
    const { fetch, answer } = deferredFetch();
    const store = new RecordViewStore(fetch);
    expect(store.state(VIEW.id)).toEqual({ status: "loading" });

    store.load(VIEW);
    store.load(VIEW);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(VIEW);
    const read = aRead();
    answer(ok(read));
    await vi.waitFor(() => expect(store.state(VIEW.id)).toEqual({ status: "ready", read, refreshing: false }));

    store.load(VIEW);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reads again on refresh, keeping what it shows until the answer comes, once for two refreshes", async () => {
    const { fetch, answer } = deferredFetch();
    const store = new RecordViewStore(fetch);
    store.load(VIEW);
    const first = aRead();
    answer(ok(first));
    await vi.waitFor(() => expect(store.state(VIEW.id).status).toBe("ready"));

    store.refresh(VIEW);
    store.refresh(VIEW);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.state(VIEW.id)).toEqual({ status: "ready", read: first, refreshing: true });
    const second = aRead("Login times out after 30 s");
    answer(ok(second));
    await vi.waitFor(() =>
      expect(store.state(VIEW.id)).toEqual({ status: "ready", read: second, refreshing: false }),
    );
  });

  it("keeps a refusal until a retry, which reads again", async () => {
    const { fetch, answer } = deferredFetch();
    const store = new RecordViewStore(fetch);
    const listener = vi.fn();
    store.subscribe(listener);
    store.load(VIEW);
    const refusal = { kind: "not_found" as const, message: "Not there.", url: "https://github.com/acme/web/issues/1" };
    answer(err(refusal));
    await vi.waitFor(() => expect(store.state(VIEW.id)).toEqual({ status: "failed", error: refusal }));
    expect(listener).toHaveBeenCalled();

    store.load(VIEW);
    expect(fetch).toHaveBeenCalledTimes(1);
    store.refresh(VIEW);
    expect(store.state(VIEW.id)).toEqual({ status: "loading" });
    answer(ok(aRead()));
    await vi.waitFor(() => expect(store.state(VIEW.id).status).toBe("ready"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps each view's record apart", async () => {
    const { fetch, answer } = deferredFetch();
    const store = new RecordViewStore(fetch);
    const other = { ...VIEW, id: "github.issue-view:beta:acme/web#1", connectionId: "beta" };
    store.load(VIEW);
    store.load(other);
    expect(fetch).toHaveBeenCalledTimes(2);
    answer(ok(aRead("acme's")));
    answer(err({ kind: "no_access", message: "No." }));
    await vi.waitFor(() => expect(store.state(other.id).status).toBe("failed"));
    expect(store.state(VIEW.id)).toMatchObject({ status: "ready", read: { summary: { title: "acme's" } } });
  });
});
