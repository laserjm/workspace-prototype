"use client";

import type { ReactNode } from "react";
import type { Skill } from "../contracts";
import { SkillsContext } from "./use-skills";

export function SkillsProvider({
  skills,
  children,
}: {
  skills: Skill[];
  children: ReactNode;
}) {
  return <SkillsContext value={skills}>{children}</SkillsContext>;
}
