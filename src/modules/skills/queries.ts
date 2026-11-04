import "server-only";
import type { Skill } from "./domain/skill";
import { sampleSkillCatalog } from "./infra/sample.skill-catalog";

/** The skill catalogue. Shared data: no requester (NX-AUTH-05). */
export async function listSkills(): Promise<Skill[]> {
  return sampleSkillCatalog;
}
