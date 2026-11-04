/** Instructions a user can apply to a message. */
export type Skill = {
  id: string;
  name: string;
  description: string;
  output: string;
  instructions: string;
  /** Opening of the example prompt, completed with the scope: "… these 5 tickets." */
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
