import { z } from "zod";
import { modelIds } from "./models";
import { skillIds } from "@/lib/workspace/skill-data";
import { sourceIds } from "@/lib/workspace/source-data";

/**
 * What the workspace sends alongside each message, as ids only. The server
 * resolves them; they are also the agent's call options.
 */
export const chatOptionsSchema = z.object({
  modelId: z.enum(modelIds),
  skillId: z.enum(skillIds).optional(),
  scope: z
    .object({
      sourceId: z.enum(sourceIds),
      recordIds: z.array(z.string().min(1).max(100)).max(100),
    })
    .optional(),
});

/**
 * The POST body of /api/chat. `id` and `messages` come from the AI SDK chat
 * transport. Messages are validated separately against the agent's tools.
 */
export const chatRequestSchema = chatOptionsSchema.extend({
  id: z.string().min(1).max(200),
  messages: z.array(z.unknown()).min(1).max(200),
});

export type ChatRequestOptions = z.infer<typeof chatOptionsSchema>;
