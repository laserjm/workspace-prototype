import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { OwnerId } from "@conventions/nextjs/core";
import {
  assertIsolation,
  describeIntegration,
} from "@conventions/nextjs/testing";
import { createProject } from "@/modules/projects/server";
import { composeStack } from "@/tests/support/compose-stack";
import { withOwners } from "@/tests/support/owners";
import { aRequester } from "@/tests/factories/requester";
import { startThread } from "./commands";
import type { StartThreadInput } from "./contracts";
import { listThreads } from "./queries";

function aNewThread(
  overrides: Partial<StartThreadInput> = {},
): StartThreadInput {
  return {
    id: randomUUID(),
    projectId: null,
    prompt: "Summarize these tickets",
    provider: "claude",
    scope: { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125"] },
    ...overrides,
  };
}

async function aProjectOf(requester: ReturnType<typeof aRequester>) {
  const project = await createProject(requester, { name: "workspace" });
  if (!project.ok) throw new Error("the project was not created");
  return project.value.id;
}

// Command-level: the commands and queries against the compose Postgres, with a requester built
// here instead of a session. Stands in for the use case's unit test and the repository's
// integration test (ARCHITECTURE.md "Command tests", Deviations).
describeIntegration(
  "threads commands",
  () => {
    const ana = aRequester("test-threads-ana");
    const ben = aRequester("test-threads-ben");
    withOwners(ana.userId, ben.userId);

    it("starts a thread without a project, titled by its first message", async () => {
      const input = aNewThread();
      const result = await startThread(ana, input);
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          id: input.id,
          projectId: null,
          title: "Summarize these tickets",
          provider: "claude",
          scope: input.scope,
        }),
      });
      expect(await listThreads(ana)).toContainEqual(result.ok && result.value);
    });

    it("starts a thread in one of the user's projects", async () => {
      const projectId = await aProjectOf(ana);
      const result = await startThread(ana, aNewThread({ projectId }));
      expect(result.ok && result.value.projectId).toBe(projectId);
    });

    it("refuses another user's project as if it did not exist", async () => {
      const projectId = await aProjectOf(ben);
      const input = aNewThread({ projectId });
      expect(await startThread(ana, input)).toEqual({
        ok: false,
        error: { _tag: "NotFound", entity: "Project", id: projectId },
      });
      const stored = (await listThreads(ana)).map((thread) => thread.id);
      expect(stored).not.toContain(input.id);
    });

    // Ben sending a thread id Ana already uses is refused; her thread stays as it was.
    const isolated = aNewThread();
    assertIsolation({
      name: "startThread, listThreads",
      ownerA: OwnerId(ana.userId),
      ownerB: OwnerId(ben.userId),
      arrange: (owner) => startThread(aRequester(owner), isolated),
      read: async (owner) =>
        (await listThreads(aRequester(owner))).filter(
          (thread) => thread.id === isolated.id,
        ),
      change: (owner) =>
        startThread(aRequester(owner), { ...isolated, prompt: "Taken over" }),
    });
  },
  { when: composeStack },
);
