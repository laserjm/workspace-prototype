// The provider contract, checked for every provider in the registry: what a new provider folder
// must satisfy before it ships (docs/adr/0002, "The pattern a provider author follows").
import { describe, expect, it } from "vitest";
import { RECORD_TONES } from "./contracts";
import { providers } from "./providers";
import { recordMarks } from "./record-views";

const access = { connectionId: "test", baseUrl: "" };

describe("providers", () => {
  it("have unique ids", () => {
    const ids = providers.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offer at least one way to connect", () => {
    for (const provider of providers)
      expect(provider.auth.length, provider.id).toBeGreaterThan(0);
  });

  it("say where their API lives and verify a credential, when one connects with one", () => {
    for (const provider of providers) {
      if (provider.auth.every((method) => method.kind === "none")) continue;
      expect(provider.baseUrl, provider.id).toBeDefined();
      expect(provider.verify, provider.id).toBeTypeOf("function");
      if (provider.baseUrl?.default)
        expect(provider.baseUrl.default, provider.id).toMatch(/^https:\/\/[^/]+.*[^/]$/);
    }
  });

  it("declare record types with labels and states, each state in a tone from the set", () => {
    for (const provider of providers) {
      if (!provider.records) continue;
      const types = Object.entries(provider.records.types);
      expect(types.length, provider.id).toBeGreaterThan(0);
      for (const [type, declared] of types) {
        expect(declared.singular, `${provider.id} ${type}`).not.toBe("");
        expect(declared.plural, `${provider.id} ${type}`).not.toBe("");
        expect(Object.keys(declared.states).length, `${provider.id} ${type}`).toBeGreaterThan(0);
        for (const [state, { tone }] of Object.entries(declared.states))
          expect(RECORD_TONES, `${provider.id} ${type} ${state}`).toContain(tone);
      }
    }
  });

  it("have a mark for each declared record type, and none for a type they do not declare", () => {
    for (const provider of providers) {
      const declared = Object.keys(provider.records?.types ?? {}).toSorted();
      const marks = recordMarks[provider.id];
      if (!provider.records) {
        expect(marks, provider.id).toBeUndefined();
        continue;
      }
      expect(marks?.provider, provider.id).toBeDefined();
      expect(Object.keys(marks?.types ?? {}).toSorted(), provider.id).toEqual(declared);
    }
    for (const id of Object.keys(recordMarks))
      expect(providers.map((provider) => provider.id)).toContain(id);
  });
});

describe.each(
  providers.flatMap((provider) =>
    provider.sources ? [{ id: provider.id, records: provider.sources }] : [],
  ),
)("the $id record reader", ({ records }) => {
  it("lists sources with unique keys, each in a declared product", async () => {
    const sources = await records.reader.listSources(access);
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((source) => source.key)).size).toBe(
      sources.length,
    );
    for (const source of sources)
      expect(Object.keys(records.products)).toContain(source.product);
  });

  it("reads back each source's records by id, in the source's order", async () => {
    for (const source of await records.reader.listSources(access)) {
      const page = await records.reader.searchRecords(access, source.key, {});
      const ids = page!.records.map((record) => record.id);
      const reversed = [...ids].reverse();
      const read = await records.reader.getRecords(access, source.key, [
        ...reversed,
        "no-such-record",
      ]);
      expect(read.map((record) => record.id)).toEqual(ids);
    }
  });

  it("has no source for an unknown key", async () => {
    expect(
      await records.reader.searchRecords(access, "no-such-source", {}),
    ).toBeUndefined();
    expect(
      await records.reader.getRecords(access, "no-such-source", ["1"]),
    ).toEqual([]);
  });
});
