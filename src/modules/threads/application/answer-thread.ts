// Use case: defineUseCase pins (input, deps) => Promise<Result> (NX-LAYER-07, NX-ERR-01).
import {
  defineUseCase,
  err,
  notFound,
  type NotFound,
  type ValidationFailed,
} from "@conventions/nextjs/core";
import type { Skill } from "@/modules/skills";
import type { Source } from "@/modules/sources";
import type { ChatTurnDto } from "../contracts";
import type { AttachedRecords, GatewayModel, ResponseAgent } from "./ports";

export type AnswerThreadInput = ChatTurnDto & { signal?: AbortSignal };

export type AnswerThreadDeps = {
  models: readonly GatewayModel[];
  skills: readonly Skill[];
  sources: readonly Source[];
  agent: ResponseAgent;
};

/**
 * Answers the latest message of a thread. The request names the model, skill and records by
 * id; they are resolved here, so the prompt only ever holds what the server offers.
 */
export const answerThread = defineUseCase<
  AnswerThreadInput,
  Response,
  NotFound | ValidationFailed,
  AnswerThreadDeps
>(async (input, { models, skills, sources, agent }) => {
  const model = models.find((item) => item.id === input.modelId);
  if (!model) return err(notFound("Model", input.modelId));

  const skill = input.skillId
    ? skills.find((item) => item.id === input.skillId)
    : undefined;
  if (input.skillId && !skill) return err(notFound("Skill", input.skillId));

  let attached: AttachedRecords | undefined;
  if (input.scope) {
    const { sourceId, recordIds } = input.scope;
    const source = sources.find((item) => item.id === sourceId);
    if (!source) return err(notFound("Source", sourceId));
    const records = source.records.filter((record) =>
      recordIds.includes(record.id),
    );
    // A scope whose records are all gone adds no context, as if none was attached.
    if (records.length > 0)
      attached = { source, records, recordCount: recordIds.length };
  }

  return agent.answer({
    model,
    skill,
    attached,
    messages: input.messages,
    signal: input.signal,
  });
});
