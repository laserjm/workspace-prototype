import { z } from "zod";

/** Skill activation as this browser stores it: the ids of the active skills. Entries that are not strings are dropped. */
export const storedSkillIdsSchema = z
  .array(z.unknown())
  .transform((ids) => ids.filter((id): id is string => typeof id === "string"));
export type StoredSkillIds = z.infer<typeof storedSkillIdsSchema>;
