import { describe, expect, it, vi } from "vitest";
import { aSourceRecord } from "@/tests/factories/source";
import { SourceRecordsStore } from "./source-records-store";

describe("SourceRecordsStore", () => {
  it("loads a source's records once and shares them", async () => {
    const records = [aSourceRecord({ id: "PLAT-1" })];
    const fetch = vi.fn(async () => records);
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
    expect(store.loadState("sample:jira")).toEqual({ status: "ready", records });
  });

  it("says a load failed, and tries again on the next one", async () => {
    const records = [aSourceRecord()];
    const fetch = vi
      .fn<(sourceId: string) => Promise<typeof records>>()
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockResolvedValueOnce(records);
    const store = new SourceRecordsStore(fetch);
    const listener = vi.fn();
    store.subscribe(listener);

    await expect(store.load("sample:jira")).rejects.toThrow("HTTP 500");
    expect(store.loadState("sample:jira")).toEqual({ status: "failed" });
    expect(await store.load("sample:jira")).toBe(records);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalled();
  });
});
