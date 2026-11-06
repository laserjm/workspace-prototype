import type { User } from "@/lib/auth/user";
import { notFound, type NotFound } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import type { Skill } from "@/modules/skills";
import type { Source, SourceRecord } from "@/modules/sources";
import type { ChatOptions } from "./contracts";
import type { AgentModel } from "./models";

/** The records a thread attached, resolved on the server from their ids. */
export type AttachedRecords =
  | {
      readable: true;
      source: Source;
      records: SourceRecord[];
      /** How many records the thread named; the label says "5 tickets" even if one is gone. */
      recordCount: number;
    }
  /** The source is gone or its system did not answer: the agent is told so, and reads nothing. */
  | { readable: false; recordCount: number };

/** What one answer runs with: who asks, the model, and the skill and records it is grounded in. */
export type AgentContext = {
  /** The signed-in user the answer is for; tools read only what is theirs. */
  user: User;
  model: AgentModel;
  /** The skill the user picked for this message: its instructions are in the prompt. */
  skill?: Skill;
  /** The other skills switched on in this browser: the agent may load one (`load_skill`). */
  offeredSkills: Skill[];
  attached?: AttachedRecords;
};

export type Catalogs = {
  models: readonly AgentModel[];
  skills: readonly Skill[];
  /** The scope's source, found among the user's; none when it is gone. */
  scopeSource?: Source;
  /** The scope's records, read for the user; `undefined` when they could not be read. */
  scopedRecords?: readonly SourceRecord[];
};

/**
 * Resolves the ids the browser sent against the server's catalogues, so the prompt only ever
 * holds what the server offers. An unknown model or skill is a `NotFound`; a scope that cannot be
 * read is not, so a thread whose connection is gone can still be answered.
 */
export function resolveContext(
  user: User,
  options: ChatOptions,
  { models, skills, scopeSource, scopedRecords }: Catalogs,
): Result<AgentContext, NotFound> {
  const model = models.find((item) => item.id === options.modelId);
  if (!model) return err(notFound("Model", options.modelId));

  const skill = options.skillId
    ? skills.find((item) => item.id === options.skillId)
    : undefined;
  if (options.skillId && !skill) return err(notFound("Skill", options.skillId));

  // A stale id from browser storage is no reason to refuse the message: it is left out.
  const switchedOn = options.skillIds ?? [];
  const offeredSkills = skills.filter(
    (item) => switchedOn.includes(item.id) && item.id !== skill?.id,
  );

  const base = { user, model, skill, offeredSkills };
  if (!options.scope) return ok(base);
  const { recordIds } = options.scope;
  // A thread whose connection is gone still answers; the agent says it cannot read the records.
  if (!scopeSource || !scopedRecords)
    return ok({
      ...base,
      attached: { readable: false, recordCount: recordIds.length },
    });
  const records = scopedRecords.filter((record) =>
    recordIds.includes(record.id),
  );
  // A scope whose records are all gone adds no context, as if none was attached.
  if (records.length === 0) return ok(base);
  return ok({
    ...base,
    attached: {
      readable: true,
      source: scopeSource,
      records,
      recordCount: recordIds.length,
    },
  });
}
