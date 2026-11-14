import { describe, expect, it } from "vitest";
import { insertProject, insertUser } from "@/test/factories";
import { getProject, getProjectByName, getProjects } from "./queries";

describe("getProjects", () => {
  it("lists the requester's projects, oldest first", async () => {
    const owner = await insertUser();
    const first = await insertProject(owner, { name: "first" });
    const second = await insertProject(owner, { name: "second" });

    expect(await getProjects(owner)).toEqual([first, second]);
  });

  it("lists none of someone else's projects", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    await insertProject(owner);

    expect(await getProjects(other)).toEqual([]);
  });
});

describe("getProject", () => {
  it("answers one of the requester's projects", async () => {
    const owner = await insertUser();
    const project = await insertProject(owner);

    expect(await getProject(owner, project.id)).toEqual(project);
  });

  it("answers null for someone else's project", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const project = await insertProject(owner);

    expect(await getProject(other, project.id)).toBeNull();
  });

  it("answers null for a malformed id", async () => {
    const owner = await insertUser();

    expect(await getProject(owner, "not-a-uuid")).toBeNull();
  });
});

describe("getProjectByName", () => {
  it("finds the requester's project by its name, and nobody else's", async () => {
    const owner = await insertUser();
    const other = await insertUser();
    const project = await insertProject(owner, { name: "battery management" });

    expect(await getProjectByName(owner, "battery management")).toEqual(project);
    expect(await getProjectByName(other, "battery management")).toBeNull();
  });
});
