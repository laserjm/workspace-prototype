// Which skills this browser switched on: pure rules over the catalogue, kept by
// `useSkillPreferences` in localStorage.
import { z } from "zod";
import type { SkillDetail } from "@/modules/skills/contracts";

export function defaultSkillIds(skills: readonly SkillDetail[]) {
  return skills.filter((skill) => skill.enabledByDefault).map((skill) => skill.id);
}

/** The ids that name a skill in the catalogue, each once, in the given order. */
export function knownSkillIds(skills: readonly SkillDetail[], ids: readonly string[]) {
  return [...new Set(ids)].filter((id) => skills.some((skill) => skill.id === id));
}

/** Activates an inactive skill or deactivates an active one. */
export function toggleSkill(enabledIds: readonly string[], id: string) {
  return enabledIds.includes(id)
    ? enabledIds.filter((item) => item !== id)
    : [...enabledIds, id];
}

export function activeSkills(skills: readonly SkillDetail[], enabledIds: readonly string[]) {
  return skills.filter((skill) => enabledIds.includes(skill.id));
}

/** Skill activation as this browser stores it: the ids of the active skills. Entries that are not strings are dropped. */
export const storedSkillIds = z
  .array(z.unknown())
  .transform((ids) => ids.filter((id): id is string => typeof id === "string"));
