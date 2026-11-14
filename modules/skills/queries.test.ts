import { describe, expect, it } from "vitest";
import { getSkills, parseSkill } from "./queries";

const skillMd = (frontmatter: string, body = "Do the thing.") =>
  `---\n${frontmatter}\n---\n\n${body}\n`;
const valid = [
  "name: Summary",
  "description: An overview.",
  "output: Overview",
  "prompt: Create a summary of",
  "enabledByDefault: true",
  "order: 1",
].join("\n");

describe("getSkills", () => {
  it("reads every SKILL.md, in order", async () => {
    const skills = await getSkills();
    expect(skills.map((skill) => skill.id)).toEqual([
      "summary",
      "risk-review",
      "action-plan",
    ]);
    expect(skills[2]).toMatchObject({
      name: "Action plan",
      enabledByDefault: false,
      instructions: expect.stringMatching(/^Collect the recorded next step/),
    });
  });
});

describe("parseSkill", () => {
  it("takes the id from the folder and the instructions from the body", () => {
    expect(parseSkill("./catalog/summary/SKILL.md", skillMd(valid))).toEqual({
      order: 1,
      skill: {
        id: "summary",
        name: "Summary",
        description: "An overview.",
        output: "Overview",
        prompt: "Create a summary of",
        enabledByDefault: true,
        instructions: "Do the thing.",
      },
    });
  });

  it("keeps a colon inside a value", () => {
    const text = skillMd(valid.replace("An overview.", "Status: open or done."));
    expect(
      parseSkill("./catalog/summary/SKILL.md", text).skill.description,
    ).toBe("Status: open or done.");
  });

  it.each([
    { name: "no frontmatter", text: "Do the thing." },
    { name: "a missing field", text: skillMd(valid.replace("order: 1", "")) },
    { name: "an unknown field", text: skillMd(`${valid}\nicon: star`) },
    { name: "a flag that is not true or false", text: skillMd(valid.replace("true", "yes")) },
    { name: "empty instructions", text: skillMd(valid, "") },
  ])("refuses a file with $name, naming it", ({ text }) => {
    expect(() => parseSkill("./catalog/summary/SKILL.md", text)).toThrow(
      "./catalog/summary/SKILL.md",
    );
  });
});
