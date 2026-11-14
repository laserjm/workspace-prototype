import "server-only";
import { skillCatalog } from "./catalog";
import type { Skill } from "./contracts";

/** The skill catalogue. Shared data: no user. */
export async function listSkills(): Promise<Skill[]> {
  return skillCatalog;
}
