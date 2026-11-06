import { describe, expect, it } from "vitest";
import { aSkill } from "@/tests/factories/skill";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import { aUser } from "@/tests/factories/user";
import type { AgentModel } from "./models";
import { tools, toolsFor } from "./tools";

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};
const user = aUser("ana");

describe("tools", () => {
  // Stored conversations hold these names and every send validates against them. Adding a
  // tool adds a name here; renaming or removing one would break the threads that called it.
  it("keeps every tool name a stored conversation may hold", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "html_render",
      "load_skill",
      "search_records",
    ]);
  });
});

describe("toolsFor", () => {
  it("offers only html_render without attached records or skills to load", () => {
    expect(toolsFor({ user, model: opus, offeredSkills: [] })).toEqual({
      activeTools: ["html_render"],
      toolsContext: {
        search_records: { scope: undefined },
        load_skill: { skillIds: [] },
      },
    });
  });

  it("offers load_skill over the skills to load", () => {
    const offeredSkills = [aSkill({ id: "risk-review" }), aSkill({ id: "action-plan" })];
    expect(toolsFor({ user, model: opus, offeredSkills })).toMatchObject({
      activeTools: ["html_render", "load_skill"],
      toolsContext: { load_skill: { skillIds: ["risk-review", "action-plan"] } },
    });
  });

  it("offers search_records over the attached records", () => {
    const records = [aSourceRecord({ id: "PLAT-124" }), aSourceRecord({ id: "PLAT-126" })];
    const source = aSource({ id: "jira", records });
    expect(
      toolsFor({
        user,
        model: opus,
        offeredSkills: [],
        attached: { source, records, recordCount: 3 },
      }),
    ).toMatchObject({
      activeTools: ["html_render", "search_records"],
      toolsContext: {
        search_records: { scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-126"] } },
      },
    });
  });
});
