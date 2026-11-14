"use client";

import { SkillIcon } from "./skill-icon";
import { findSkill, useSkills } from "./use-skills";

/** One `load_skill` call in a reply: which skill the agent chose to follow. */
export function SkillLoadCall({
  state,
  skillId,
  errorText,
}: {
  state: "loading" | "done" | "failed";
  skillId?: string;
  errorText?: string;
}) {
  const { skills } = useSkills();
  const skill = skillId ? findSkill(skills, skillId) : undefined;
  const name = skill ? `the “${skill.name}” skill` : "a skill";
  if (state === "failed")
    return (
      <p className="mt-1 mb-3 text-xs text-destructive-foreground">
        Could not load {name}. {errorText}
      </p>
    );
  return (
    <p
      className="mt-1 mb-3 flex items-center gap-1.5 text-xs text-secondary-label [&+&]:-mt-2 [&>svg]:size-3 [&>svg]:shrink-0"
      role={state === "loading" ? "status" : undefined}
    >
      <SkillIcon id={skill?.id} />
      {state === "loading" ? `Loading ${name}…` : `Using ${name}`}
    </p>
  );
}
