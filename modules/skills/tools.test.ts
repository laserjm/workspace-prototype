import { describe, expect, it } from "vitest";
import { skillTools } from "./tools";

const loadSkill = (id: string, skillIds: string[]) =>
  skillTools.load_skill.execute(
    { id },
    { toolCallId: "call-1", messages: [], context: { skillIds } },
  );

describe("load_skill", () => {
  it("answers a switched-on skill's instructions", async () => {
    expect(await loadSkill("risk-review", ["risk-review"])).toEqual({
      id: "risk-review",
      name: "Risk review",
      instructions: expect.stringMatching(/^Review the selected records/),
    });
  });

  it.each([
    { name: "a skill the user did not switch on", id: "action-plan", skillIds: ["risk-review"] },
    { name: "an id no skill has", id: "poetry", skillIds: ["poetry"] },
  ])("refuses $name", async ({ id, skillIds }) => {
    await expect(loadSkill(id, skillIds)).rejects.toThrow(`No skill "${id}"`);
  });
});
