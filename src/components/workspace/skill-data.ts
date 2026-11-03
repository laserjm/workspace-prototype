export type SkillId = "summary" | "risk-review" | "action-plan";

export const skills = [
  {
    id: "summary" as const,
    name: "Summary",
    description:
      "Turn selected records into a concise, source-linked overview.",
    output: "Overview, status breakdown, and citations",
    instructions:
      "Summarize each selected record, show the status breakdown, and cite the source. Use only the records in the thread’s scope.",
    prompt: "Create a summary of these",
  },
  {
    id: "risk-review" as const,
    name: "Risk review",
    description: "Surface blockers, dependencies, and what needs attention.",
    output: "Recorded risks and dependencies with citations",
    instructions:
      "Review the selected records for explicit risks and dependencies. Include only recorded risks, cite each record, and report when none are recorded.",
    prompt: "Review the risks in these",
  },
  {
    id: "action-plan" as const,
    name: "Action plan",
    description:
      "Bring the next steps from your source records into one place.",
    output: "Next steps grouped by source record",
    instructions:
      "Collect the recorded next step for every selected record and cite its source. Do not invent tasks or change the source system.",
    prompt: "Create an action plan for these",
  },
];

export const defaultEnabledSkills: SkillId[] = ["summary", "risk-review"];

export function getSkill(id: SkillId) {
  return skills.find((skill) => skill.id === id)!;
}

export function isSkillId(id: unknown): id is SkillId {
  return skills.some((skill) => skill.id === id);
}
