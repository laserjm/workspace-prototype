"use client";

import { Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectIcon } from "@/modules/projects";

/** "What would you like to know in <project>?", with the project as a picker. */
export function NewThreadHeading({
  project,
  projects,
  onProject,
  onAddProject,
}: {
  project: string | null;
  projects: string[];
  onProject: (project: string | null) => void;
  onAddProject: () => void;
}) {
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
                {projects.map((name) => (
                  <DropdownMenuItem key={name} onClick={() => onProject(name)}>
                    <ProjectIcon />
                    <span className="truncate">{name}</span>
                    {name === project && <Check className="ml-auto" />}
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
        onClick={() => onProject(project ? null : "workspace-prototype")}
      >
        {project ? "or start without a project" : "or choose a project"}
      </button>
    </div>
  );
}
