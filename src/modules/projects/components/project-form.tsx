"use client";

import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProjectAction } from "../actions";
import { PROJECT_NAME_MAX_LENGTH, type Project } from "../domain/project";

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
  const { execute, result, isPending } = useAction(createProjectAction, {
    onSuccess: ({ data }) => {
      if (!data?.ok) return;
      onNameChange("");
      onCreated(data.value);
    },
  });
  const refused =
    result.serverError || result.validationErrors || result.data?.ok === false;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        execute({ name });
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
        aria-invalid={refused ? true : undefined}
        aria-describedby={refused ? "project-name-error" : undefined}
      />
      {refused && (
        <p
          id="project-name-error"
          className="text-xs text-destructive-foreground"
          role="alert"
        >
          The project could not be created. Try again.
        </p>
      )}
      <Button
        type="submit"
        disabled={!name.trim() || isPending}
        className="mt-3 self-end"
      >
        {isPending ? "Creating…" : "Create project"}
      </Button>
    </form>
  );
}
