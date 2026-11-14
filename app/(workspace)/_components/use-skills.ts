"use client";

import { createContext, useContext } from "react";
import { bug } from "@/lib/errors";
import { findSkill, type Skill } from "@/modules/skills/contracts";

export const SkillsContext = createContext<readonly Skill[] | null>(null);

/** The skill catalogue the page loaded, provided by `SkillsProvider`. */
export function useSkills() {
  const skills = useContext(SkillsContext);
  if (!skills) bug("useSkills is called outside SkillsProvider");
  return {
    skills,
    skillById(id: string) {
      return findSkill(skills, id) ?? bug(`unknown skill '${id}'`);
    },
  };
}
