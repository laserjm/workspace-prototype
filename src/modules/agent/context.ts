import type { User } from "@/lib/auth/user";
import { notFound, type NotFound } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import type { AllowedConnection } from "@/modules/records/server";
import type { Skill } from "@/modules/skills";
import type { ChatOptions } from "./contracts";
import type { AgentModel } from "./models";

/** What one answer runs with: who asks, the model, the skills and the connections it may use. */
export type AgentContext = {
  /** The signed-in user the answer is for; tools read only what is theirs. */
  user: User;
  model: AgentModel;
  /** The skill the user picked for this message: its instructions are in the prompt. */
  skill?: Skill;
  /** The other skills switched on in this browser: the agent may load one (`load_skill`). */
  offeredSkills: Skill[];
  /**
   * The connections the answer may use, decided by the server from what the thread's questions
   * attached. Left out when the thread attached nothing; empty when none of it is usable.
   */
  connections?: AllowedConnection[];
};

export type Catalogs = {
  models: readonly AgentModel[];
  skills: readonly Skill[];
};

/**
 * Resolves the ids the browser sent against the server's catalogues, so the prompt only ever
 * holds what the server offers. An unknown id is a `NotFound`.
 */
export function resolveContext(
  user: User,
  options: ChatOptions,
  { models, skills }: Catalogs,
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

  return ok({ user, model, skill, offeredSkills });
}
