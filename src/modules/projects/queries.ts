import "server-only";
import type { OwnerRequester } from "@conventions/nextjs/core";
import type { Project } from "./domain/project";
import { projectRepository } from "./infra/project.repository";

/** The signed-in user's projects, oldest first. */
export async function listProjects(
  requester: OwnerRequester,
): Promise<Project[]> {
  return projectRepository.listByOwner(requester.ownerId);
}

/** One of the user's projects, or null when they have none with this id. */
export async function findProject(
  requester: OwnerRequester,
  id: string,
): Promise<Project | null> {
  return projectRepository.findById(requester.ownerId, id);
}
