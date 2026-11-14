import "server-only";
// What stops an answer before it starts: an id the server's catalogues do not hold, or messages
// the agent does not accept. The adapter maps them to a 400.

/** The browser named a model the workspace does not offer. */
export class ModelNotFound extends Error {
  constructor(readonly modelId: string) {
    super(`No model ${modelId} is offered`);
    this.name = "ModelNotFound";
  }
}

/** The browser named a skill the catalogue does not hold. */
export class SkillNotFound extends Error {
  constructor(readonly skillId: string) {
    super(`No skill ${skillId} in the catalogue`);
    this.name = "SkillNotFound";
  }
}

/** The conversation does not validate against the tools and data parts the agent knows. */
export class MessagesRejected extends Error {
  constructor(reason: string) {
    super(`The conversation was rejected: ${reason}`);
    this.name = "MessagesRejected";
  }
}
