"use client";

import { Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectIcon, type Project } from "@/modules/projects";

/** "What would you like to know in <project>?", with the project as a picker. */
export function NewThreadHeading({
  projectId,
  projects,
  onProject,
  onAddProject,
}: {
  projectId: string | null;
  projects: Project[];
  onProject: (projectId: string | null) => void;
  onAddProject: () => void;
}) {
  const project = projects.find((item) => item.id === projectId)?.name;
  return (
    <div className="draft-heading">
      <h1
        aria-label={
          project
            ? `What would you like to know in ${project}?`
            : "What should we work on?"
        }
      >
        {project ? (
          <>
            What would you like to know in{" "}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="heading-project"
                    aria-label="Choose project"
                  />
                }
              >
                <span>{project}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72" align="center">
                {projects.map(({ id, name }) => (
                  <DropdownMenuItem key={id} onClick={() => onProject(id)}>
                    <ProjectIcon />
                    <span className="truncate">{name}</span>
                    {id === projectId && <Check className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onAddProject}>
                  <Plus />
                  Add a project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ?
          </>
        ) : (
          "What should we work on?"
        )}
      </h1>
      <button
        type="button"
        className="start-without-project"
        // A user without projects adds their first one.
        onClick={() =>
          project
            ? onProject(null)
            : projects[0]
              ? onProject(projects[0].id)
              : onAddProject()
        }
      >
        {project ? "or start without a project" : "or choose a project"}
      </button>
    </div>
  );
}
