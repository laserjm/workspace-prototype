import { describe, expect, it } from "vitest";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import type { AgentModel } from "./models";
import { tools, toolsFor } from "./tools";

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};

describe("tools", () => {
  // Stored conversations hold these names and every send validates against them. Adding a
  // tool adds a name here; renaming or removing one would break the threads that called it.
  it("keeps every tool name a stored conversation may hold", () => {
    expect(Object.keys(tools).sort()).toEqual(["html_render", "search_records"]);
  });
});

describe("toolsFor", () => {
  it("offers only html_render without attached records", () => {
    expect(toolsFor({ model: opus })).toEqual({
      activeTools: ["html_render"],
      toolsContext: { search_records: { scope: undefined } },
    });
  });

  it("offers search_records over the attached records", () => {
    const records = [aSourceRecord({ id: "PLAT-124" }), aSourceRecord({ id: "PLAT-126" })];
    const source = aSource({ id: "jira", records });
    expect(
      toolsFor({ model: opus, attached: { source, records, recordCount: 3 } }),
    ).toEqual({
      activeTools: ["html_render", "search_records"],
      toolsContext: {
        search_records: { scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-126"] } },
      },
    });
  });
});
