// Use case: a user adds a project by name. A name they already use selects that project
// instead of adding it twice.
import {
  defineUseCase,
  ok,
  type OwnerRequester,
} from "@conventions/nextjs/core";
import type { CreateProjectInput } from "../contracts";
import type { ProjectNameMissing } from "../domain/errors";
import { nameProject, type Project } from "../domain/project";
import type { ProjectRepository } from "./ports";

export type CreateProjectDeps = {
  requester: OwnerRequester;
  projects: ProjectRepository;
};

export const createProject = defineUseCase<
  CreateProjectInput,
  Project,
  ProjectNameMissing,
  CreateProjectDeps
>(async (input, { requester, projects }) => {
  const name = nameProject(input.name);
  if (!name.ok) return name;
  const existing = await projects.findByName(requester.ownerId, name.value);
  if (existing) return ok(existing);
  return ok(await projects.save(requester.ownerId, name.value));
});
