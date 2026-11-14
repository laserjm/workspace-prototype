import "server-only";
import type { AgentModel, ModelChoice } from "./contracts";

/**
 * The models the workspace offers. The browser only ever sends `id`; the server resolves
 * `gateway` from this allowlist, so a browser cannot pick any model.
 */
export const models: readonly AgentModel[] = [
  {
    id: "haiku",
    label: "Haiku 5.5",
    effort: "High",
    provider: "claude",
    gateway: "anthropic/claude-haiku-5.5",
  },
  {
    id: "opus",
    label: "Opus 5.5",
    effort: "High",
    provider: "claude",
    gateway: "anthropic/claude-opus-5.5",
  },
  {
    id: "sonnet",
    label: "Sonnet 5.5",
    effort: "High",
    provider: "claude",
    gateway: "anthropic/claude-sonnet-5.5",
  },
  {
    id: "gpt",
    label: "GPT-6.1",
    effort: "High",
    provider: "openai",
    gateway: "openai/gpt-6.1-sol",
  },
];

/** The models the composer offers, without their gateway ids. Shared data, no owner. */
export async function getModelChoices(): Promise<ModelChoice[]> {
  return models.map(({ id, label, effort, provider }) => ({ id, label, effort, provider }));
}
