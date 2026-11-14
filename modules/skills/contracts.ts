// What the skills module gives: browser-safe, zod and types only.
import { z } from "zod";

/** Instructions a user can apply to a message. */
export type SkillDetail = {
  id: string;
  name: string;
  description: string;
  output: string;
  instructions: string;
  /** Opening of the example prompt, completed with what is attached: "… these 3 items." */
  prompt: string;
  enabledByDefault: boolean;
};

/** What the model asks `load_skill` for: one of the skills the prompt lists. */
export const loadSkillInput = z.object({
  id: z.string().min(1).max(100).describe("The id of a skill from the list."),
});
export type LoadSkillInput = z.infer<typeof loadSkillInput>;

export const loadSkillOutput = z.object({
  id: z.string(),
  name: z.string(),
  instructions: z.string(),
});
export type LoadSkillOutput = z.infer<typeof loadSkillOutput>;
