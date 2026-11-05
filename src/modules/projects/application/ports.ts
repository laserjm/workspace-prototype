// Ports carry the business name (NX-NAME-30/31/34). Owned methods take the OwnerId first.
import type { OwnerId } from "@conventions/nextjs/core";
import type { Project } from "../domain/project";

export type ProjectRepository = {
  /** The owner's projects, oldest first. */
  listByOwner(ownerId: OwnerId): Promise<Project[]>;
  findById(ownerId: OwnerId, id: string): Promise<Project | null>;
  findByName(ownerId: OwnerId, name: string): Promise<Project | null>;
  /** Adds a project. Throws a `ConstraintViolation` when the owner already uses the name. */
  save(ownerId: OwnerId, name: string): Promise<Project>;
};
