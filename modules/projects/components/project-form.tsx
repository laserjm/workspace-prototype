"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/actions/client";
import { errorMessage } from "@/lib/actions/messages";
import { createProjectAction } from "../actions";
import { PROJECT_NAME_MAX_LENGTH, type Project } from "../contracts";

/** Adds a project; a name the user already uses selects that project. */
export function ProjectForm({
  name,
  onNameChange,
  onCreated,
}: {
  /** Held by the caller, so the name survives closing the dialog. */
  name: string;
  onNameChange: (name: string) => void;
  onCreated: (project: Project) => void;
}) {
  const create = useAction(createProjectAction, {
    onSuccess: (project) => {
      onNameChange("");
      onCreated(project);
    },
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        void create.run({ name });
      }}
    >
      <label htmlFor="project-name" className="text-xs font-medium">
        Project name
      </label>
      <Input
        id="project-name"
        autoFocus
        placeholder="my-workspace"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        maxLength={PROJECT_NAME_MAX_LENGTH}
        required
        aria-invalid={create.error ? true : undefined}
        aria-describedby={create.error ? "project-name-error" : undefined}
      />
      {create.error && (
        <p
          id="project-name-error"
          className="text-xs text-destructive-foreground"
          role="alert"
        >
          {errorMessage(create.error, {
            ProjectNameMissing: "Give the project a name.",
            Conflict: "A project with this name was just added. Try again.",
          })}
        </p>
      )}
      <Button
        type="submit"
        disabled={!name.trim() || create.pending}
        className="mt-3 self-end"
      >
        {create.pending ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
