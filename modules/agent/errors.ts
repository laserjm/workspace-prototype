import "server-only";
// What stops an answer before it starts: an id the server's catalogues do not hold, or messages
// the agent does not accept. The adapter maps them to a 400.

/** The browser named a model the workspace does not offer. */
export class ModelNotFound extends Error {
  override readonly name = "ModelNotFound";

  constructor(readonly modelId: string) {
    super(`No model ${modelId} is offered`);
  }
}

/** The browser named a skill the catalogue does not hold. */
export class SkillNotFound extends Error {
  override readonly name = "SkillNotFound";

  constructor(readonly skillId: string) {
    super(`No skill ${skillId} in the catalogue`);
  }
}

/** The conversation does not validate against the tools and data parts the agent knows. */
export class MessagesRejected extends Error {
  override readonly name = "MessagesRejected";

  constructor(reason: string) {
    super(`The conversation was rejected: ${reason}`);
  }
}

/**
 * Every fact that stops an answer before it starts. An adapter maps them with a `switch` on
 * `name` that ends in a `never` check, so a new class here fails to compile until every adapter
 * has said what it means. test/errors.test.ts checks that the list is complete.
 */
export const agentErrors = [ModelNotFound, SkillNotFound, MessagesRejected] as const;
export type AgentError = InstanceType<(typeof agentErrors)[number]>;

/** Whether `error` is one of agentErrors; anything else an adapter rethrows as a bug. */
export function isAgentError(error: unknown): error is AgentError {
  return agentErrors.some((type) => error instanceof type);
}
