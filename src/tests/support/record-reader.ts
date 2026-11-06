// The record reader contract (ADR 0002, "The pattern a provider author follows"): what every
// provider's reader must do, run in its own records.test.ts against its fixtures, and for the
// bundled sample in integrations/providers.test.ts. Set up any fake system in a `beforeEach`
// before calling it.
import { expect, it } from "vitest";
import type { RecordReader } from "@/modules/integrations";

/** What a reader is handed; the type itself stays inside the integrations module. */
type Access = Parameters<RecordReader["listSources"]>[0];

export function describeRecordReader({
  reader,
  products,
  access,
}: {
  reader: RecordReader;
  /** The products the provider declares. */
  products: readonly string[];
  access: Access;
}) {
  it("lists sources with unique keys, each in a declared product", async () => {
    const sources = await reader.listSources(access);
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((source) => source.key)).size).toBe(
      sources.length,
    );
    for (const source of sources) expect(products).toContain(source.product);
  });

  it("reads back each source's records by id, in the source's order, without unknown ones", async () => {
    for (const source of await reader.listSources(access)) {
      const page = await reader.searchRecords(access, source.key, {});
      const ids = page!.records.map((record) => record.id);
      expect(new Set(ids).size).toBe(ids.length);
      const read = await reader.getRecords(access, source.key, [
        ...[...ids].reverse(),
        "no-such-record",
      ]);
      expect(read.map((record) => record.id)).toEqual(ids);
    }
  });

  it("has no source for an unknown key", async () => {
    expect(
      await reader.searchRecords(access, "no-such-source", {}),
    ).toBeUndefined();
    expect(await reader.getRecords(access, "no-such-source", ["1"])).toEqual(
      [],
    );
  });
}
