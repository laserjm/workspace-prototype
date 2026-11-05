import "server-only";
import type { User } from "@/lib/auth/user";
import { z } from "zod";
import type { WorkspaceUIMessage } from "./contracts";
import type { ModelChoice } from "./domain/model-choice";
import { wakeIfDue, type Thread } from "./domain/thread";
import { aiGatewayModelCatalog } from "./infra/ai-gateway.model-catalog";
import { threadRepository } from "./infra/thread.repository";

/** The signed-in user's threads, newest first, as they read now: a due snooze has woken. */
export async function listThreads(
  user: User,
): Promise<Thread[]> {
  const now = new Date();
  return (await threadRepository.listByUser(user.id)).map((thread) =>
    wakeIfDue(thread, now),
  );
}

/**
 * The conversation of one of the signed-in user's threads, in order. Empty for a thread they do
 * not have, as for one without messages, and for an id that is not a thread's.
 */
export async function listThreadMessages(
  user: User,
  threadId: string,
): Promise<WorkspaceUIMessage[]> {
  if (!z.uuid().safeParse(threadId).success) return [];
  return threadRepository.listMessages(user.id, threadId);
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
