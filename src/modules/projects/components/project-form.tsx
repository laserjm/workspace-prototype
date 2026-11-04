"use client";

import { Button } from "@/components/ui/button";

export function ProjectForm({
  name,
  onNameChange,
  onCreate,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onCreate: (name: string) => void;
}) {
  return (
    <form
      className="workspace-dialog-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onCreate(name);
      }}
    >
      <label htmlFor="project-name">Project name</label>
      <input
        id="project-name"
        autoFocus
        placeholder="my-workspace"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        maxLength={80}
        required
      />
      <Button type="submit" disabled={!name.trim()}>
        Create project
      </Button>
    </form>
  );
}
