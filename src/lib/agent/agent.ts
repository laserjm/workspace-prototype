import "server-only";

import { stepCountIs, ToolLoopAgent } from "ai";
import { getModel, models } from "@/lib/chat/models";
import { chatOptionsSchema } from "@/lib/chat/request";
import { getSkill } from "@/lib/workspace/skill-data";
import { buildSourceContext } from "./context";
import { instructions } from "./instructions";
import { tools } from "./tools";

/**
 * The workspace agent. Each request passes the selected model, skill, and
 * records as call options; `prepareCall` turns them into the model and prompt.
 */
export const workspaceAgent = new ToolLoopAgent({
  id: "workspace",
  // Replaced on every call; required by the constructor.
  model: models[0].gateway,
  instructions,
  tools,
  // Lets the model call html_render and then write its reply.
  stopWhen: stepCountIs(5),
  callOptionsSchema: chatOptionsSchema,
  prepareCall: ({ options, ...settings }) => {
    const skill = options.skillId ? getSkill(options.skillId) : undefined;
    return {
      ...settings,
      model: getModel(options.modelId).gateway,
      instructions: [
        instructions,
        skill && `# Skill: ${skill.name}\n\n${skill.instructions}`,
        options.scope && buildSourceContext(options.scope),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  },
});

export type WorkspaceAgent = typeof workspaceAgent;
