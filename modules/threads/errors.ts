import "server-only";
// The facts that stop a thread's use case. The adapters map them to copy or a status.

/** Missing and not-owned look the same, so ownership isn't leaked. */
export class ThreadNotFound extends Error {
  constructor(readonly threadId: string) {
    super(`Thread ${threadId} not found`);
    this.name = "ThreadNotFound";
  }
}

/** The project a new thread names is not the requester's, or not there. */
export class ProjectNotFound extends Error {
  constructor(readonly projectId: string) {
    super(`Project ${projectId} not found`);
    this.name = "ProjectNotFound";
  }
}

/** The id the browser picked for a new thread or fork is taken: a resend, or another user's. */
export class ThreadIdTaken extends Error {
  constructor(readonly threadId: string) {
    super(`Thread id ${threadId} is taken`);
    this.name = "ThreadIdTaken";
  }
}

/** A fork names a message that is not one of the thread's responses (not stored yet). */
export class ResponseNotFound extends Error {
  constructor(readonly messageId: string) {
    super(`Response ${messageId} not found`);
    this.name = "ResponseNotFound";
  }
}

/** A snooze must end in the future. */
export class SnoozeTimeInPast extends Error {
  constructor(readonly until: string) {
    super(`The snooze time ${until} has passed`);
    this.name = "SnoozeTimeInPast";
  }
}

/** A new question attaches a connection that is not the requester's: forged or stale. */
export class ForeignConnectionAttached extends Error {
  constructor(readonly connectionIds: readonly string[]) {
    super(`Connections not the requester's: ${connectionIds.join(", ")}`);
    this.name = "ForeignConnectionAttached";
  }
}
