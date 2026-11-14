import { describe, expect, it } from "vitest";
import { aSkill } from "@/test/factories";
import { aUser } from "@/test/factories/user";
import { baseInstructions, instructionsFor } from "./instructions";
import type { AgentModel } from "./models";

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};
const user = aUser("ana");

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
    expect(instructionsFor({ user, model: opus, offeredSkills: [] })).toBe(
      baseInstructions,
    );
  });

  it("adds the skill after the base instructions", () => {
    const skill = aSkill({ name: "Risk review", instructions: "List risks." });
    const prompt = instructionsFor({ user, model: opus, skill, offeredSkills: [] });
    expect(prompt.startsWith(baseInstructions)).toBe(true);
    expect(prompt).toContain("# Skill: Risk review\n\nList risks.");
  });

  it("lists the skills to load by id, name and description, after the picked one", () => {
    const prompt = instructionsFor({
      user,
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
