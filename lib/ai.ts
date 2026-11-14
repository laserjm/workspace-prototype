// The one place that knows how the app reaches its models: the Vercel AI Gateway, with the key
// from the env. The agent module gets the models from the adapter (Rule 12), so it never reads
// the env and its tests hand in a mock model.
import "server-only";
import { createGateway, type GatewayModelId, type LanguageModel } from "ai";
import { aiEnv } from "./env";

let gateway: ReturnType<typeof createGateway> | undefined;

/** The gateway's model with this id, through a provider built on first use. */
export function gatewayModel(id: GatewayModelId): LanguageModel {
  gateway ??= createGateway({ apiKey: aiEnv().AI_GATEWAY_API_KEY });
  return gateway(id);
}
