import "server-only";
import type { GatewayModelId } from "ai";
import type { GatewayModel } from "../application/ports";

/**
 * The models the workspace offers. The browser only ever sends `id`; the server resolves
 * `gateway` from this allowlist, so a browser cannot pick any model.
 */
export const aiGatewayModelCatalog = [
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
] satisfies (GatewayModel & { gateway: GatewayModelId })[];
