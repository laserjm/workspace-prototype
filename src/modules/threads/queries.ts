import "server-only";
import type { ModelChoice } from "./domain/model-choice";
import type { Thread } from "./domain/thread";
import { aiGatewayModelCatalog } from "./infra/ai-gateway.model-catalog";
import { sampleSeedThreads } from "./infra/sample.seed-threads";

/** The signed-in user's threads. Sample sessions until threads are stored per owner. */
export async function listThreads(): Promise<Thread[]> {
  return sampleSeedThreads;
}

/** The models the composer offers, without their gateway ids. */
export async function listModelChoices(): Promise<ModelChoice[]> {
  return aiGatewayModelCatalog.map(({ id, label, effort, provider }) => ({
    id,
    label,
    effort,
    provider,
  }));
}
