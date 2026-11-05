import "server-only";
// The module's use cases wired to what they run on (NX-LAYER-11), each taking the Requester its
// caller signed in as first. Commands trust their input's type; the action validated it.
import {
  conflict,
  ConstraintViolation,
  err,
  type OwnerRequester,
} from "@conventions/nextjs/core";
import { createProject as create } from "./application/create-project";
import type { CreateProjectInput } from "./contracts";
import { projectRepository } from "./infra/project.repository";

export async function createProject(
  requester: OwnerRequester,
  input: CreateProjectInput,
) {
  try {
    return await create(input, { requester, projects: projectRepository });
  } catch (error) {
    // Two requests added the same name at once: the unique index refused the second.
    if (error instanceof ConstraintViolation)
      return err(conflict(error.constraint));
    throw error;
  }
}
