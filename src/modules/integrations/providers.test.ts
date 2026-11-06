// The provider contract, checked for every provider in the registry: what a new provider folder
// must satisfy before it ships (docs/adr/0002, "The pattern a provider author follows").
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeRecordReader } from "@/tests/support/record-reader";
import { providers } from "./providers";

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
});

// A bundled reader runs the contract here; a live one runs it in its own records.test.ts, against
// a fake of its system, which this checks is there.
describe.each(
  providers.flatMap((provider) =>
    provider.records?.snapshot ? [{ id: provider.id, records: provider.records }] : [],
  ),
)("the $id record reader", ({ records }) => {
  describeRecordReader({
    reader: records.reader,
    products: Object.keys(records.products),
    access,
  });
});

describe("live record readers", () => {
  it.each(
    providers.filter((provider) => provider.records && !provider.records.snapshot),
  )("$id runs the reader contract in its records.test.ts", ({ id }) => {
    const test = join(import.meta.dirname, "providers", id, "records.test.ts");
    expect(existsSync(test), test).toBe(true);
    expect(readFileSync(test, "utf8")).toContain("describeRecordReader(");
  });
});
