// Use case: a user sends the first message of a new thread, in one of their projects or in none.
import {
  defineUseCase,
  err,
  notFound,
  ok,
  type NotFound,
  type OwnerRequester,
} from "@conventions/nextjs/core";
import type { StartThreadInput } from "../contracts";
import type { ScopeHasNoRecords } from "../domain/errors";
import {
  createScope,
  startThread as start,
  type Thread,
} from "../domain/thread";
import type { Clock, ProjectDirectory, ThreadRepository } from "./ports";

export type StartThreadDeps = {
  requester: OwnerRequester;
  threads: ThreadRepository;
  projects: ProjectDirectory;
  clock: Clock;
};

export const startThread = defineUseCase<
  StartThreadInput,
  Thread,
  NotFound | ScopeHasNoRecords,
  StartThreadDeps
>(async (input, { requester, threads, projects, clock }) => {
  // Another user's project is answered like a missing one: its id reveals nothing.
  if (input.projectId && !(await projects.exists(input.projectId)))
    return err(notFound("Project", input.projectId));
  const scope = input.scope
    ? createScope(input.scope.sourceId, input.scope.recordIds)
    : undefined;
  if (scope && !scope.ok) return scope;
  const thread = start({ ...input, scope: scope?.value }, clock.now());
  await threads.save(requester.ownerId, thread);
  return ok(thread);
});
