import { describe, expect, it } from "vitest";
import { nameProject, projectInitials } from "./contracts";

describe("nameProject", () => {
  it.each([
    { name: "b", expected: "b" },
    { name: "  battery management  ", expected: "battery management" },
  ])("names the project '$expected'", ({ name, expected }) => {
    expect(nameProject(name)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "   "])("refuses the blank name '%s'", (name) => {
    expect(nameProject(name)).toEqual({
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
