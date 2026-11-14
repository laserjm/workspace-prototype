import { z } from "zod";

/** Instructions a user can apply to a message. */
export type Skill = {
  id: string;
  name: string;
  description: string;
  output: string;
  instructions: string;
  /** Opening of the example prompt, completed with what is attached: "… these 3 items." */
  prompt: string;
  enabledByDefault: boolean;
};

export function findSkill(skills: readonly Skill[], id: string) {
  return skills.find((skill) => skill.id === id);
}

export function defaultSkillIds(skills: readonly Skill[]) {
  return skills
    .filter((skill) => skill.enabledByDefault)
    .map((skill) => skill.id);
}

/** The ids that name a skill in the catalogue, each once, in the given order. */
export function knownSkillIds(
  skills: readonly Skill[],
  ids: readonly string[],
) {
  return [...new Set(ids)].filter((id) => findSkill(skills, id));
}

/** Activates an inactive skill or deactivates an active one. */
export function toggleSkill(enabledIds: readonly string[], id: string) {
  return enabledIds.includes(id)
    ? enabledIds.filter((item) => item !== id)
    : [...enabledIds, id];
}

export function activeSkills(
  skills: readonly Skill[],
  enabledIds: readonly string[],
) {
  return skills.filter((skill) => enabledIds.includes(skill.id));
}

/** Skill activation as this browser stores it: the ids of the active skills. Entries that are not strings are dropped. */
export const storedSkillIdsSchema = z
  .array(z.unknown())
  .transform((ids) => ids.filter((id): id is string => typeof id === "string"));
export type StoredSkillIds = z.infer<typeof storedSkillIdsSchema>;

/** What the model asks `load_skill` for: one of the skills the prompt lists. */
export const loadSkillInputSchema = z.object({
  id: z.string().min(1).max(100).describe("The id of a skill from the list."),
});
export type LoadSkillInput = z.infer<typeof loadSkillInputSchema>;

export const loadSkillOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
});
export type LoadSkillOutput = z.infer<typeof loadSkillOutputSchema>;
