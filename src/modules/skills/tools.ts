import "server-only";
import { tool } from "ai";
import { z } from "zod";
import {
  findSkill,
  loadSkillInputSchema,
  loadSkillOutputSchema,
} from "./contracts";
import { listSkills } from "./queries";

/**
 * The agent's way into this module (see `sources/tools.ts`). The prompt lists the skills the
 * user switched on by name and description only; the model loads one's instructions when a
 * question needs it. Keys are stored in conversations, so a tool is never renamed.
 */
export const skillTools = {
  load_skill: tool({
    description:
      "Load the instructions of one of the skills listed under “Skills you can load”, then follow them in your reply. Load a skill only when the question fits its description.",
    inputSchema: loadSkillInputSchema,
    outputSchema: loadSkillOutputSchema,
    contextSchema: z.object({ skillIds: z.array(z.string()) }),
    // The ids come from the server: the skills this user switched on, never the model's choice.
    async execute({ id }, { context }) {
      const skill = context.skillIds.includes(id)
        ? findSkill(await listSkills(), id)
        : undefined;
      if (!skill) throw new Error(`No skill "${id}" can be loaded here.`);
      return { id: skill.id, name: skill.name, instructions: skill.instructions };
    },
  }),
};
