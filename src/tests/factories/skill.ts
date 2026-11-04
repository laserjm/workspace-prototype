import type { Skill } from "@/modules/skills";

export function aSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "summary",
    name: "Summary",
    description: "A sample skill.",
    output: "Overview",
    instructions: "Summarize the records.",
    prompt: "Create a summary of these",
    enabledByDefault: true,
    ...overrides,
  };
}
