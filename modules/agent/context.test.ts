import { describe, expect, it } from "vitest";
import { aSkill } from "@/test/factories/skill";
import { aUser } from "@/test/factories/user";
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
const catalogs = { models: [opus], skills: [summary, riskReview] };
const options: ChatOptions = { modelId: "opus" };
const ana = aUser("ana");

describe("resolveContext", () => {
  it("resolves the user and the model, with no skill when none is named", () => {
    expect(resolveContext(ana, options, catalogs)).toEqual({
      ok: true,
      value: { user: ana, model: opus, skill: undefined, offeredSkills: [] },
    });
  });

  it("resolves the skill the question named", () => {
    const result = resolveContext(ana, { ...options, skillId: "risk-review" }, catalogs);
    expect(result.ok && result.value.skill).toBe(riskReview);
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
