import "server-only";
// The facts that stop a thread's use case. The adapters map them to copy or a status.

/** Missing and not-owned look the same, so ownership isn't leaked. */
export class ThreadNotFound extends Error {
  override readonly name = "ThreadNotFound";

  constructor(readonly threadId: string) {
    super(`Thread ${threadId} not found`);
  }
}

/** The project a new thread names is not the requester's, or not there. */
export class ProjectNotFound extends Error {
  override readonly name = "ProjectNotFound";

  constructor(readonly projectId: string) {
    super(`Project ${projectId} not found`);
  }
}

/** The id the browser picked for a new thread or fork is taken: a resend, or another user's. */
export class ThreadIdTaken extends Error {
  override readonly name = "ThreadIdTaken";

  constructor(readonly threadId: string) {
    super(`Thread id ${threadId} is taken`);
  }
}

/** A fork names a message that is not one of the thread's responses (not stored yet). */
export class ResponseNotFound extends Error {
  override readonly name = "ResponseNotFound";

  constructor(readonly messageId: string) {
    super(`Response ${messageId} not found`);
  }
}

/** A snooze must end in the future. */
export class SnoozeTimeInPast extends Error {
  override readonly name = "SnoozeTimeInPast";

  constructor(readonly until: string) {
    super(`The snooze time ${until} has passed`);
  }
}

/** A new question attaches a connection that is not the requester's: forged or stale. */
export class ForeignConnectionAttached extends Error {
  override readonly name = "ForeignConnectionAttached";

  constructor(readonly connectionIds: readonly string[]) {
    super(`Connections not the requester's: ${connectionIds.join(", ")}`);
  }
}

/**
 * Every fact a thread's use cases throw. An adapter maps them with a `switch` on
 * `name` that ends in a `never` check, so a new class here fails to compile until every adapter
 * has said what it means. test/errors.test.ts checks that the list is complete.
 */
export const threadErrors = [
  ThreadNotFound,
  ProjectNotFound,
  ThreadIdTaken,
  ResponseNotFound,
  SnoozeTimeInPast,
  ForeignConnectionAttached,
] as const;
export type ThreadError = InstanceType<(typeof threadErrors)[number]>;

/** Whether `error` is one of threadErrors; anything else an adapter rethrows as a bug. */
export function isThreadError(error: unknown): error is ThreadError {
  return threadErrors.some((type) => error instanceof type);
}
