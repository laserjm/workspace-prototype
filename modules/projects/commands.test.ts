import { describe, expect, it } from "vitest";
import { insertProject, insertUser } from "@/test/factories";
import { createProject } from "./commands";
import { createProjectInput } from "./contracts";
import { getProjects } from "./queries";

describe("createProject", () => {
  it("adds a project under its trimmed name", async () => {
    const owner = await insertUser();

    const project = await createProject(
      owner,
      createProjectInput.parse({ name: "  battery management " }),
    );

    expect(project).toEqual({ id: expect.any(String), name: "battery management" });
    expect(await getProjects(owner)).toEqual([project]);
  });

  it("answers a name the requester already uses with that project", async () => {
    const owner = await insertUser();
    const existing = await insertProject(owner, { name: "enterprise-platform" });

    expect(await createProject(owner, { name: "enterprise-platform" })).toEqual(existing);
    expect(await getProjects(owner)).toEqual([existing]);
  });

  it("answers two requests for the same new name with one project", async () => {
    const owner = await insertUser();

    const [a, b] = await Promise.all([
      createProject(owner, { name: "at once" }),
      createProject(owner, { name: "at once" }),
    ]);

    expect(a).toEqual(b);
    expect(await getProjects(owner)).toEqual([a]);
  });

  it("gives someone else their own project under a name the requester uses", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const mine = await insertProject(owner, { name: "isolated" });

    const theirs = await createProject(other, { name: "isolated" });

    expect(theirs.id).not.toBe(mine.id);
    expect(await getProjects(owner)).toEqual([mine]);
  });
});

describe("createProjectInput", () => {
  it.each(["", "   ", "x".repeat(81)])("refuses the name '%s'", (name) => {
    expect(createProjectInput.safeParse({ name }).success).toBe(false);
  });
});
