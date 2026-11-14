"use client";

import { createContext, useContext } from "react";
import type { SkillDetail } from "@/modules/skills/contracts";

export const SkillsContext = createContext<readonly SkillDetail[] | null>(null);

export function findSkill(skills: readonly SkillDetail[], id: string) {
  return skills.find((skill) => skill.id === id);
}

/** The skill catalogue the page loaded, provided by `SkillsProvider`. */
export function useSkills() {
  const skills = useContext(SkillsContext);
  if (!skills) throw new Error("useSkills is called outside SkillsProvider");
  return {
    skills,
    skillById(id: string): SkillDetail {
      const skill = findSkill(skills, id);
      if (!skill) throw new Error(`unknown skill '${id}'`);
      return skill;
    },
  };
}
