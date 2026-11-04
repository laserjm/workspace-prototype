// The prototype answers from the records in scope without a model. A skill picks the kind of
// answer; without one, the prompt does. A model call replaces this with a port in application/.

export type SampleResponseKind = "summary" | "risks" | "next-steps";

const KIND_OF_SKILL: Record<string, SampleResponseKind> = {
  summary: "summary",
  "risk-review": "risks",
  "action-plan": "next-steps",
};

export function sampleResponseKind(
  prompt: string,
  skillId?: string,
): SampleResponseKind {
  const ofSkill = skillId ? KIND_OF_SKILL[skillId] : undefined;
  if (ofSkill) return ofSkill;
  if (/risk|block|attention/i.test(prompt)) return "risks";
  if (/next|action|follow.?up/i.test(prompt)) return "next-steps";
  return "summary";
}

/** Whether the sample answers what was asked, or falls back to a summary with a note. */
export function isSampleAnswerable(prompt: string, skillId?: string) {
  return (
    Boolean(skillId) ||
    /summ[ar]+y|summar|overview|risk|block|attention|next|action|follow.?up/i.test(
      prompt,
    )
  );
}
