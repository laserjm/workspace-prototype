import "server-only";
import type { GatewayModelId } from "ai";
import type { ModelChoice } from "./contracts";

/** A model the workspace offers, with the id the AI Gateway knows it by. Server-side only. */
export type AgentModel = ModelChoice & { gateway: GatewayModelId };

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

/** The models the composer offers, without their gateway ids. */
export async function listModelChoices(): Promise<ModelChoice[]> {
  return models.map(({ id, label, effort, provider }) => ({
    id,
    label,
    effort,
    provider,
  }));
}
