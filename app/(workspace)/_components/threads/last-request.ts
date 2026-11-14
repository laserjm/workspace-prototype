import type { WorkspaceUIMessage } from "@/modules/agent/contracts";

/**
 * What the conversation's latest question asked for, read from the stored messages: the model
 * (a question stored before it named one falls back to the model that answered) and the skill.
 * A retry asks again with them, and the composer starts with that skill.
 */
export function lastRequest(messages: readonly WorkspaceUIMessage[]): {
  modelId?: string;
  skillId?: string;
} {
  const index = messages.findLastIndex((message) => message.role === "user");
  if (index === -1) return {};
  const question = messages[index]!.metadata;
  const reply = messages
    .slice(index + 1)
    .find((message) => message.role === "assistant")?.metadata;
  return {
    modelId: question?.modelId ?? reply?.modelId,
    skillId: question?.skillId,
  };
}
