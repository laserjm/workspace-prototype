import { describe, expect, it } from "vitest";
import { aSkill, aUser } from "@/test/factories";
import type { AgentModel, ChatOptions } from "./contracts";
import { baseInstructions, instructionsFor, resolveContext } from "./domain";
import { ModelNotFound, SkillNotFound } from "./errors";

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
      user: ana,
      model: opus,
      skill: undefined,
      offeredSkills: [],
    });
  });

  it("resolves the skill the question named", () => {
    const context = resolveContext(ana, { ...options, skillId: "risk-review" }, catalogs);
    expect(context.skill).toBe(riskReview);
  });

  it.each([
    { name: "model", change: { modelId: "gpt-0" }, error: ModelNotFound, id: "gpt-0" },
    { name: "skill", change: { skillId: "poetry" }, error: SkillNotFound, id: "poetry" },
  ])("refuses an unknown $name", ({ change, error, id }) => {
    expect(() => resolveContext(ana, { ...options, ...change }, catalogs)).toThrow(error);
    expect(() => resolveContext(ana, { ...options, ...change }, catalogs)).toThrow(id);
  });

  it("offers the switched-on skills but the picked one, in the catalogue's order, without stale ids", () => {
    const context = resolveContext(
      ana,
      {
        ...options,
        skillId: "summary",
        skillIds: ["risk-review", "gone", "summary"],
      },
      catalogs,
    );
    expect(context.offeredSkills).toEqual([riskReview]);
  });
});

describe("baseInstructions", () => {
  it("is the workspace instructions, then the formatting ones, from the .md files", () => {
    expect(baseInstructions).toMatch(/^# Identity\n/);
    expect(baseInstructions.indexOf("# How to answer")).toBeLessThan(
      baseInstructions.indexOf("# Formatting"),
    );
    expect(baseInstructions).toContain("call html_render");
  });
});

describe("instructionsFor", () => {
  it("is the base instructions alone without a skill or connections", () => {
    expect(instructionsFor({ user: ana, model: opus, offeredSkills: [] })).toBe(
      baseInstructions,
    );
  });

  it("adds the skill after the base instructions", () => {
    const skill = aSkill({ name: "Risk review", instructions: "List risks." });
    const prompt = instructionsFor({ user: ana, model: opus, skill, offeredSkills: [] });
    expect(prompt.startsWith(baseInstructions)).toBe(true);
    expect(prompt).toContain("# Skill: Risk review\n\nList risks.");
  });

  it("lists the skills to load by id, name and description, after the picked one", () => {
    const prompt = instructionsFor({
      user: ana,
      model: opus,
      skill: aSkill({ id: "summary", name: "Summary" }),
      offeredSkills: [
        aSkill({
          id: "risk-review",
          name: "Risk review",
          description: "Surface blockers.",
          instructions: "Loaded on demand.",
        }),
      ],
    });
    expect(prompt).toContain("# Skills you can load");
    expect(prompt).toContain("- risk-review (Risk review): Surface blockers.");
    expect(prompt).not.toContain("Loaded on demand.");
    expect(prompt.indexOf("# Skill: Summary")).toBeLessThan(
      prompt.indexOf("# Skills you can load"),
    );
  });
});
