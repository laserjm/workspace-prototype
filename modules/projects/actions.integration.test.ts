import { expect, it, vi } from "vitest";
import {
  assertIsolation,
  describeIntegration,
} from "@/test/support/integration";
import { withUsers } from "@/test/support/users";
import { callAs } from "@/test/support/session";
import { aUser } from "@/test/factories/user";
import { createProjectAction } from "./actions";
import { PROJECT_NAME_MAX_LENGTH } from "./contracts";
import { listProjects } from "./queries";

vi.mock("@/lib/auth/session", () => import("@/test/support/session"));

// The actions as the browser calls them (sign-in, validation, the write) and the queries,
// against the compose Postgres with requesters built here (ARCHITECTURE.md "Integration tests").
describeIntegration(
  "projects actions",
  () => {
    const ana = aUser("test-projects-ana");
    const ben = aUser("test-projects-ben");
    withUsers(ana.id, ben.id);

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
      ownerA: ana.id,
      ownerB: ben.id,
      arrange: (owner) =>
        callAs(aUser(owner), createProjectAction, { name: "isolated" }),
      read: async (owner) =>
        (await listProjects(aUser(owner))).filter(
          (project) => project.name === "isolated",
        ),
      change: (owner) =>
        callAs(aUser(owner), createProjectAction, { name: "isolated" }),
    });
  },
);
