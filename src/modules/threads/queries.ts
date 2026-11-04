import "server-only";
import type { ModelChoice } from "./domain/model-choice";
import type { Thread } from "./domain/thread";
import { sampleModelCatalog } from "./infra/sample.model-catalog";
import { sampleSeedThreads } from "./infra/sample.seed-threads";

/** The signed-in user's threads. Sample sessions until threads are stored per owner. */
export async function listThreads(): Promise<Thread[]> {
  return sampleSeedThreads;
}

export async function listModelChoices(): Promise<ModelChoice[]> {
  return sampleModelCatalog;
}
