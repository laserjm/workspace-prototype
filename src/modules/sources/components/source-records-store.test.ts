import { describe, expect, it, vi } from "vitest";
import { aSourceRecord } from "@/tests/factories/source";
import type { RecordPage } from "../contracts";
import {
  SourceRecordsStore,
  type RecordsRequest,
} from "./source-records-store";

const fetchOf = (answer: (request: RecordsRequest) => RecordPage) =>
  vi.fn(async (_sourceId: string, request: RecordsRequest) => answer(request));

describe("SourceRecordsStore", () => {
  it("loads a source's first page once and shares it", async () => {
    const records = [aSourceRecord({ id: "PLAT-1" })];
    const fetch = fetchOf(() => ({ records }));
    const store = new SourceRecordsStore(fetch);

    expect(store.loadState("sample:jira")).toEqual({ status: "loading" });
    const [first, second] = await Promise.all([
      store.load("sample:jira"),
      store.load("sample:jira"),
    ]);
    expect(first).toBe(records);
    expect(second).toBe(records);
    expect(await store.load("sample:jira")).toBe(records);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("sample:jira", {});
    expect(store.loadState("sample:jira")).toEqual({ status: "ready", records });
  });

  it("says a load failed, and tries again on the next one", async () => {
    const records = [aSourceRecord()];
    const fetch = vi
      .fn<(sourceId: string, request: RecordsRequest) => Promise<RecordPage>>()
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockResolvedValueOnce({ records });
    const store = new SourceRecordsStore(fetch);
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.load("sample:jira")).rejects.toThrow("HTTP 500");
    expect(store.loadState("sample:jira")).toEqual({ status: "failed" });
    expect(await store.load("sample:jira")).toBe(records);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalled();
  });

  it("reads the next page onto the loaded ones, until there is none", async () => {
    const fetch = fetchOf(({ cursor }) =>
      cursor === "2"
        ? { records: [aSourceRecord({ id: "#2" }), aSourceRecord({ id: "#1" })] }
        : { records: [aSourceRecord({ id: "#3" }), aSourceRecord({ id: "#2" })], nextCursor: "2" },
    );
    const store = new SourceRecordsStore(fetch);
    await store.load("c:acme/app");
    expect(store.loadState("c:acme/app")).toMatchObject({ nextCursor: "2" });

    await store.loadMore("c:acme/app");
    const state = store.loadState("c:acme/app");
    expect(state.status === "ready" && state.records.map((record) => record.id)).toEqual(
      ["#3", "#2", "#1"],
    );
    expect(state).not.toHaveProperty("nextCursor");
    await store.loadMore("c:acme/app");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the loaded pages when the next one fails", async () => {
    const records = [aSourceRecord({ id: "#3" })];
    const fetch = vi
      .fn<(sourceId: string, request: RecordsRequest) => Promise<RecordPage>>()
      .mockResolvedValueOnce({ records, nextCursor: "2" })
      .mockRejectedValueOnce(new Error("HTTP 502"));
    const store = new SourceRecordsStore(fetch);
    await store.load("c:acme/app");
    await store.loadMore("c:acme/app");
    expect(store.loadState("c:acme/app")).toEqual({
      status: "ready",
      records,
      nextCursor: "2",
    });
  });

  it("reads a scope's records by id, apart from the pages, once per set of ids", async () => {
    const fetch = fetchOf(({ ids }) => ({
      records: (ids ?? []).map((id) => aSourceRecord({ id })),
    }));
    const store = new SourceRecordsStore(fetch);

    expect(store.scopedState("c:acme/app", ["#7", "#9"])).toEqual({ status: "loading" });
    await store.loadScoped("c:acme/app", ["#7", "#9"]);
    await store.loadScoped("c:acme/app", ["#7", "#9"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("c:acme/app", { ids: ["#7", "#9"] });
    expect(store.scopedState("c:acme/app", ["#7", "#9"])).toMatchObject({
      status: "ready",
      records: [{ id: "#7" }, { id: "#9" }],
    });
    // Another scope of the same source is another read; the pages are untouched.
    expect(store.scopedState("c:acme/app", ["#7"])).toEqual({ status: "loading" });
    expect(store.loadState("c:acme/app")).toEqual({ status: "loading" });
  });
});
