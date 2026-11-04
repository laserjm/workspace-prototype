import { z } from "zod";

/** Skill activation as this browser stores it: the ids of the active skills. */
export const storedSkillIdsSchema = z.array(z.string());
export type StoredSkillIds = z.infer<typeof storedSkillIdsSchema>;
