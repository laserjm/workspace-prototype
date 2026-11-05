import { notFound, type NotFound } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import type { Skill } from "@/modules/skills";
import type { Source, SourceRecord } from "@/modules/sources";
import type { ChatOptions } from "./contracts";
import type { AgentModel } from "./models";

/** The records a thread attached, resolved on the server from their ids. */
export type AttachedRecords = {
  source: Source;
  records: SourceRecord[];
  /** How many records the thread named; the label says "5 tickets" even if one is gone. */
  recordCount: number;
};

/** What one answer runs with: the model, and the skill and records it is grounded in. */
export type AgentContext = {
  model: AgentModel;
  skill?: Skill;
  attached?: AttachedRecords;
};

export type Catalogs = {
  models: readonly AgentModel[];
  skills: readonly Skill[];
  sources: readonly Source[];
};

/**
 * Resolves the ids the browser sent against the server's catalogues, so the prompt only ever
 * holds what the server offers. An unknown id is a `NotFound`.
 */
export function resolveContext(
  options: ChatOptions,
  { models, skills, sources }: Catalogs,
): Result<AgentContext, NotFound> {
  const model = models.find((item) => item.id === options.modelId);
  if (!model) return err(notFound("Model", options.modelId));

  const skill = options.skillId
    ? skills.find((item) => item.id === options.skillId)
    : undefined;
  if (options.skillId && !skill) return err(notFound("Skill", options.skillId));

  if (!options.scope) return ok({ model, skill });
  const { sourceId, recordIds } = options.scope;
  const source = sources.find((item) => item.id === sourceId);
  if (!source) return err(notFound("Source", sourceId));
  const records = source.records.filter((record) =>
    recordIds.includes(record.id),
  );
  // A scope whose records are all gone adds no context, as if none was attached.
  if (records.length === 0) return ok({ model, skill });
  return ok({
    model,
    skill,
    attached: { source, records, recordCount: recordIds.length },
  });
}
