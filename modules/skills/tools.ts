import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { loadSkillInput, loadSkillOutput } from "./contracts";
import { getSkills } from "./queries";

/**
 * The agent's way into this module (docs/adr/0005). The prompt lists the skills the
 * user switched on by name and description only; the model loads one's instructions when a
 * question needs it. Keys are stored in conversations, so a tool is never renamed.
 */
export const skillTools = {
  load_skill: tool({
    description:
      "Load the instructions of one of the skills listed under “Skills you can load”, then follow them in your reply. Load a skill only when the question fits its description.",
    inputSchema: loadSkillInput,
    outputSchema: loadSkillOutput,
    contextSchema: z.object({ skillIds: z.array(z.string()) }),
    // The ids come from the server: the skills this user switched on, never the model's choice.
    async execute({ id }, { context }) {
      const skill = context.skillIds.includes(id)
        ? (await getSkills()).find((item) => item.id === id)
        : undefined;
      if (!skill) throw new Error(`No skill "${id}" can be loaded here.`);
      return { id: skill.id, name: skill.name, instructions: skill.instructions };
    },
  }),
};
