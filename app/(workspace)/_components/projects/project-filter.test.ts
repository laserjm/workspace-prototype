import { describe, expect, it } from "vitest";
import { projectInitials } from "./project-filter";

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
