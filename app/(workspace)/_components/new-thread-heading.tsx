"use client";

import { Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectIcon } from "./project-icon";
import { type Project } from "@/modules/projects/contracts";

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
    <div className="px-3 pb-2.5 text-center max-md:px-0 max-md:pb-2">
      <h1
        className="text-3xl leading-snug font-normal tracking-tight text-balance text-foreground max-md:text-2xl short:text-2xl"
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
                    className="inline max-w-full rounded-sm align-baseline font-medium wrap-anywhere hover:bg-accent"
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
        className="mt-2.5 text-sm text-muted-foreground hover:text-secondary-foreground"
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
