// Browser-safe public API of the projects module.
export type { Project, ProjectKind } from "./domain/project";
export { PROJECT_NAME_MAX_LENGTH, projectInitials } from "./domain/project";
export type { ProjectNameMissing } from "./domain/errors";
export { ProjectFilter } from "./components/project-filter";
export { ProjectForm } from "./components/project-form";
export { ProjectIcon } from "./components/project-icon";
