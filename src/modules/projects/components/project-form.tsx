"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ProjectForm({
  onCreate,
}: {
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="workspace-dialog-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onCreate(name);
        setName("");
      }}
    >
      <label htmlFor="project-name">Project name</label>
      <input
        id="project-name"
        autoFocus
        placeholder="my-workspace"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={80}
        required
      />
      <Button type="submit" disabled={!name.trim()}>
        Create project
      </Button>
    </form>
  );
}
