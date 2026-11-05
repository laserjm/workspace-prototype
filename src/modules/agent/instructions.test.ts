import { describe, expect, it } from "vitest";
import { aSkill } from "@/tests/factories/skill";
import { aSource, aSourceRecord } from "@/tests/factories/source";
import { baseInstructions, instructionsFor } from "./instructions";
import type { AgentModel } from "./models";

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};

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
  it("is the base instructions alone without a skill or records", () => {
    expect(instructionsFor({ model: opus })).toBe(baseInstructions);
  });

  it("adds the skill, then the attached records", () => {
    const skill = aSkill({ name: "Risk review", instructions: "List risks." });
    const record = aSourceRecord({ id: "PLAT-124" });
    const source = aSource({ records: [record] });
    const prompt = instructionsFor({
      model: opus,
      skill,
      attached: { source, records: [record], recordCount: 1 },
    });
    expect(prompt.startsWith(baseInstructions)).toBe(true);
    expect(prompt).toContain("# Skill: Risk review\n\nList risks.");
    expect(prompt.indexOf("# Skill:")).toBeLessThan(
      prompt.indexOf("# Source records"),
    );
    expect(prompt).toContain("### PLAT-124:");
  });
});
