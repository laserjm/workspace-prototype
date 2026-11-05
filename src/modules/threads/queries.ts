import "server-only";
import type { OwnerRequester } from "@conventions/nextjs/core";
import type { ModelChoice } from "./domain/model-choice";
import type { Thread } from "./domain/thread";
import { aiGatewayModelCatalog } from "./infra/ai-gateway.model-catalog";
import { threadRepository } from "./infra/thread.repository";

/** The signed-in user's threads, newest first. */
export async function listThreads(
  requester: OwnerRequester,
): Promise<Thread[]> {
  return threadRepository.listByOwner(requester.ownerId);
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
