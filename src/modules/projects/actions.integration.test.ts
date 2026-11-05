import { expect, it, vi } from "vitest";
import { OwnerId } from "@conventions/nextjs/core";
import {
  assertIsolation,
  describeIntegration,
} from "@conventions/nextjs/testing";
import { composeStack } from "@/tests/support/compose-stack";
import { withOwners } from "@/tests/support/owners";
import { callAs } from "@/tests/support/session";
import { aRequester } from "@/tests/factories/requester";
import { createProjectAction } from "./actions";
import { PROJECT_NAME_MAX_LENGTH } from "./contracts";
import { listProjects } from "./queries";

vi.mock("@/lib/auth/requester", () => import("@/tests/support/session"));

// The actions as the browser calls them (sign-in, validation, the write) and the queries,
// against the compose Postgres with requesters built here (ARCHITECTURE.md "Command tests").
describeIntegration(
  "projects actions",
  () => {
    const ana = aRequester("test-projects-ana");
    const ben = aRequester("test-projects-ben");
    withOwners(ana.userId, ben.userId);

    it("adds a project under its trimmed name and lists it", async () => {
      const result = await callAs(ana, createProjectAction, {
        name: "  battery management ",
      });
      expect(result).toEqual({
        ok: true,
        value: { id: expect.any(String), name: "battery management" },
      });
      expect(await listProjects(ana)).toContainEqual(result.ok && result.value);
    });

    it("answers a name the user already uses with that project", async () => {
      const first = await callAs(ana, createProjectAction, {
        name: "enterprise-platform",
      });
      const again = await callAs(ana, createProjectAction, {
        name: "enterprise-platform",
      });
      expect(again).toEqual(first);
      const named = (await listProjects(ana)).filter(
        (project) => project.name === "enterprise-platform",
      );
      expect(named).toHaveLength(1);
    });

    it("refuses a blank name", async () => {
      expect(await callAs(ana, createProjectAction, { name: "   " })).toEqual({
        ok: false,
        error: { _tag: "ProjectNameMissing" },
      });
    });

    it("refuses a name longer than the form allows", async () => {
      expect(
        await callAs(ana, createProjectAction, {
          name: "x".repeat(PROJECT_NAME_MAX_LENGTH + 1),
        }),
      ).toEqual({
        ok: false,
        error: {
          _tag: "ValidationFailed",
          issues: [{ path: "name", message: expect.any(String) }],
        },
      });
    });

    it("refuses a visitor and stores nothing", async () => {
      expect(
        await callAs(null, createProjectAction, { name: "from a visitor" }),
      ).toEqual({ ok: false, error: { _tag: "SignedOut" } });
      const named = (await listProjects(ana)).filter(
        (project) => project.name === "from a visitor",
      );
      expect(named).toHaveLength(0);
    });

    // Ben adding a project under Ana's name gets his own; Ana's stays hers alone.
    assertIsolation({
      name: "createProjectAction, listProjects",
      ownerA: OwnerId(ana.userId),
      ownerB: OwnerId(ben.userId),
      arrange: (owner) =>
        callAs(aRequester(owner), createProjectAction, { name: "isolated" }),
      read: async (owner) =>
        (await listProjects(aRequester(owner))).filter(
          (project) => project.name === "isolated",
        ),
      change: (owner) =>
        callAs(aRequester(owner), createProjectAction, { name: "isolated" }),
    });
  },
  { when: composeStack },
);
