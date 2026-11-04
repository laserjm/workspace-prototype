import { describe, expect, it } from "vitest";
import { addProject, projectInitials } from "./project";

describe("addProject", () => {
  it.each([
    {
      projects: ["a"],
      name: "b",
      expected: { projects: ["a", "b"], name: "b" },
    },
    {
      projects: ["a"],
      name: "  b  ",
      expected: { projects: ["a", "b"], name: "b" },
    },
    {
      projects: ["a", "b"],
      name: "a",
      expected: { projects: ["a", "b"], name: "a" },
    },
  ])("adds '$name' to $projects", ({ projects, name, expected }) => {
    expect(addProject(projects, name)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "   "])("refuses the blank name '%s'", (name) => {
    expect(addProject(["a"], name)).toEqual({
      ok: false,
      error: { _tag: "ProjectNameMissing" },
    });
  });
});

describe("projectInitials", () => {
  it.each([
    { name: "workspace-prototype", initials: "WP" },
    { name: "battery management system", initials: "BM" },
    { name: "acme/platform_core", initials: "AP" },
    { name: "solo", initials: "S" },
  ])("abbreviates $name as $initials", ({ name, initials }) => {
    expect(projectInitials(name)).toBe(initials);
  });
});
