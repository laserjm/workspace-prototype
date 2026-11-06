import { describe, expect, it } from "vitest";
import { aSkill } from "@/tests/factories/skill";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import { aUser } from "@/tests/factories/user";
import type { ChatOptions } from "./contracts";
import { resolveContext } from "./context";
import type { AgentModel } from "./models";

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};
const riskReview = aSkill({ id: "risk-review", name: "Risk review" });
const summary = aSkill({ id: "summary", name: "Summary" });
const jira = aSource({
  id: "jira",
  records: [
    aSourceRecord({ id: "PLAT-124" }),
    aSourceRecord({ id: "PLAT-125" }),
    aSourceRecord({ id: "PLAT-126" }),
  ],
});
const catalogs = {
  models: [opus],
  skills: [summary, riskReview],
  sources: [jira],
};
const options: ChatOptions = { modelId: "opus" };
const ana = aUser("ana");

describe("resolveContext", () => {
  it("resolves the user and the model, with no skill or records when none are named", () => {
    expect(resolveContext(ana, options, catalogs)).toEqual({
      ok: true,
      value: { user: ana, model: opus, skill: undefined, offeredSkills: [] },
    });
  });

  it("resolves the skill and only the records the thread named, in the source's order", () => {
    const result = resolveContext(
      ana,
      {
        ...options,
        skillId: "risk-review",
        scope: { sourceId: "jira", recordIds: ["PLAT-126", "PLAT-124"] },
      },
      catalogs,
    );
    if (!result.ok) throw new Error("expected a context");
    expect(result.value.skill).toBe(riskReview);
    expect(result.value.attached?.records.map((record) => record.id)).toEqual(
      ["PLAT-124", "PLAT-126"],
    );
    expect(result.value.attached?.recordCount).toBe(2);
  });

  it("attaches nothing when none of the named records exist", () => {
    const result = resolveContext(
      ana,
      { ...options, scope: { sourceId: "jira", recordIds: ["GONE-1"] } },
      catalogs,
    );
    expect(result.ok && result.value.attached).toBeUndefined();
  });

  it.each([
    { name: "model", change: { modelId: "gpt-0" }, entity: "Model", id: "gpt-0" },
    { name: "skill", change: { skillId: "poetry" }, entity: "Skill", id: "poetry" },
    {
      name: "source",
      change: { scope: { sourceId: "sharepoint", recordIds: ["X-1"] } },
      entity: "Source",
      id: "sharepoint",
    },
  ])("refuses an unknown $name", ({ change, entity, id }) => {
    expect(resolveContext(ana, { ...options, ...change }, catalogs)).toEqual({
      ok: false,
      error: { _tag: "NotFound", entity, id },
    });
  });

  it("offers the switched-on skills but the picked one, in the catalogue's order, without stale ids", () => {
    const result = resolveContext(
      ana,
      {
        ...options,
        skillId: "summary",
        skillIds: ["risk-review", "gone", "summary"],
      },
      catalogs,
    );
    expect(result.ok && result.value.offeredSkills).toEqual([riskReview]);
  });
});
