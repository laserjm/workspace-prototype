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
const jira = aSource({ id: "sample:jira" });
const catalogs = {
  models: [opus],
  skills: [summary, riskReview],
  scopeSource: jira,
  // As listScopedRecords reads them: the named ones that exist, in the source's order.
  scopedRecords: [
    aSourceRecord({ id: "PLAT-124" }),
    aSourceRecord({ id: "PLAT-126" }),
  ],
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

  it("resolves the skill and the records the thread named", () => {
    const result = resolveContext(
      ana,
      {
        ...options,
        skillId: "risk-review",
        scope: { sourceId: "sample:jira", recordIds: ["PLAT-126", "PLAT-124"] },
      },
      catalogs,
    );
    if (!result.ok) throw new Error("expected a context");
    expect(result.value.skill).toBe(riskReview);
    expect(result.value.attached).toEqual({
      readable: true,
      source: jira,
      records: [
        expect.objectContaining({ id: "PLAT-124" }),
        expect.objectContaining({ id: "PLAT-126" }),
      ],
      recordCount: 2,
    });
  });

  it("attaches nothing when none of the named records exist", () => {
    const result = resolveContext(
      ana,
      { ...options, scope: { sourceId: "sample:jira", recordIds: ["GONE-1"] } },
      { ...catalogs, scopedRecords: [] },
    );
    expect(result.ok && result.value.attached).toBeUndefined();
  });

  it.each([
    { name: "source the user no longer has", change: { scopeSource: undefined } },
    { name: "source whose system did not answer", change: { scopedRecords: undefined } },
  ])("answers with a scope it cannot read, for a $name", ({ change }) => {
    const result = resolveContext(
      ana,
      { ...options, scope: { sourceId: "gone:repo", recordIds: ["#1", "#2"] } },
      { ...catalogs, ...change },
    );
    expect(result.ok && result.value.attached).toEqual({
      readable: false,
      recordCount: 2,
    });
  });

  it.each([
    { name: "model", change: { modelId: "gpt-0" }, entity: "Model", id: "gpt-0" },
    { name: "skill", change: { skillId: "poetry" }, entity: "Skill", id: "poetry" },
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
