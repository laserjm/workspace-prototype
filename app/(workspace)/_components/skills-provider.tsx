"use client";

import type { ReactNode } from "react";
import type { SkillDetail } from "@/modules/skills/contracts";
import { SkillsContext } from "./use-skills";

export function SkillsProvider({
  skills,
  children,
}: {
  skills: SkillDetail[];
  children: ReactNode;
}) {
  return <SkillsContext value={skills}>{children}</SkillsContext>;
}
