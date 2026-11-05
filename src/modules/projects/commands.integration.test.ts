import { expect, it } from "vitest";
import { OwnerId } from "@conventions/nextjs/core";
import {
  assertIsolation,
  describeIntegration,
} from "@conventions/nextjs/testing";
import { composeStack } from "@/tests/support/compose-stack";
import { withOwners } from "@/tests/support/owners";
import { aRequester } from "@/tests/factories/requester";
import { createProject } from "./commands";
import { listProjects } from "./queries";

// Command-level: the commands and queries against the compose Postgres, with a requester built
// here instead of a session. Stands in for the use case's unit test and the repository's
// integration test (NX-TEST-01, NX-TEST-02; ARCHITECTURE.md "Command tests").
describeIntegration(
  "projects commands",
  () => {
    const ana = aRequester("test-projects-ana");
    const ben = aRequester("test-projects-ben");
    withOwners(ana.userId, ben.userId);

    it("adds a project under its trimmed name and lists it", async () => {
      const result = await createProject(ana, {
        name: "  battery management ",
      });
      expect(result).toEqual({
        ok: true,
        value: { id: expect.any(String), name: "battery management" },
      });
      expect(await listProjects(ana)).toContainEqual(result.ok && result.value);
    });

    it("answers a name the user already uses with that project", async () => {
      const first = await createProject(ana, { name: "enterprise-platform" });
      const again = await createProject(ana, { name: "enterprise-platform" });
      expect(again).toEqual(first);
      const named = (await listProjects(ana)).filter(
        (project) => project.name === "enterprise-platform",
      );
      expect(named).toHaveLength(1);
    });

    it("refuses a blank name", async () => {
      expect(await createProject(ana, { name: "   " })).toEqual({
        ok: false,
        error: { _tag: "ProjectNameMissing" },
      });
    });

    // Ben adding a project under Ana's name gets his own; Ana's stays hers alone.
    assertIsolation({
      name: "createProject, listProjects",
      ownerA: OwnerId(ana.userId),
      ownerB: OwnerId(ben.userId),
      arrange: (owner) =>
        createProject(aRequester(owner), { name: "isolated" }),
      read: async (owner) =>
        (await listProjects(aRequester(owner))).filter(
          (project) => project.name === "isolated",
        ),
      change: (owner) => createProject(aRequester(owner), { name: "isolated" }),
    });
  },
  { when: composeStack },
);
