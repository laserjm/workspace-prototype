import { describe, expect, it } from "vitest";
import { aSkill } from "@/test/factories/skill";
import { aUser } from "@/test/factories/user";
import type { AgentModel } from "./models";
import { tools, toolsFor } from "./tools";

/** Whether `input` is a valid call of the tool, as the stored conversation is validated. */
async function accepts(name: keyof typeof tools, input: unknown) {
  const schema = tools[name].inputSchema as { "~standard": { validate(value: unknown): unknown } };
  const result = (await schema["~standard"].validate(input)) as { issues?: unknown };
  return !result.issues;
}

const opus: AgentModel = {
  id: "opus",
  label: "Opus 5.5",
  effort: "High",
  provider: "claude",
  gateway: "anthropic/claude-opus-5.5",
};
const user = aUser("ana");

describe("tools", () => {
  // Stored conversations hold these names and every send validates against them. Adding a
  // tool adds a name here; renaming or removing one would break the threads that called it.
  it("keeps every tool name a stored conversation may hold", () => {
    expect(Object.keys(tools).sort()).toEqual([
      "github_pull_request_diff",
      "html_render",
      "load_skill",
      "read_record",
      "search_records",
    ]);
  });

  it("reads a pull request's diff by its connection and key, one file by its path", async () => {
    const pullRequest = { connectionId: "c1", key: "acme/web#42" };
    expect(await accepts("github_pull_request_diff", pullRequest)).toBe(true);
    expect(await accepts("github_pull_request_diff", { ...pullRequest, path: "src/a.ts" })).toBe(true);
    expect(await accepts("github_pull_request_diff", { key: "acme/web#42" })).toBe(false);
  });

  it("reads one record by its connection, type and key", async () => {
    expect(
      await accepts("read_record", { connectionId: "c1", type: "issue", key: "acme/web#42" }),
    ).toBe(true);
    expect(await accepts("read_record", { connectionId: "c1", key: "acme/web#42" })).toBe(false);
  });

  // The name was reused with a new schema (#62): the scope's filters are gone.
  it("searches one connection with a query, not the old scope's filters", async () => {
    expect(await accepts("search_records", { connectionId: "c1", query: "label:bug" })).toBe(true);
    expect(await accepts("search_records", { status: "In review" })).toBe(false);
  });
});

describe("toolsFor", () => {
  it("offers only html_render without allowed connections or skills to load", () => {
    expect(toolsFor({ user, model: opus, offeredSkills: [] })).toEqual({
      activeTools: ["html_render"],
      toolsContext: {
        search_records: { user, connectionIds: [] },
        read_record: { user, connectionIds: [] },
        github_pull_request_diff: { user, connectionIds: [] },
        load_skill: { skillIds: [] },
      },
    });
  });

  it("offers load_skill over the skills to load", () => {
    const offeredSkills = [aSkill({ id: "risk-review" }), aSkill({ id: "action-plan" })];
    expect(toolsFor({ user, model: opus, offeredSkills })).toMatchObject({
      activeTools: ["html_render", "load_skill"],
      toolsContext: { load_skill: { skillIds: ["risk-review", "action-plan"] } },
    });
  });

  it("offers search_records and read_record over the connections the server allowed, and GitHub's tools over its", () => {
    const connection = (connectionId: string, provider = "github") => ({
      connectionId,
      provider,
      providerName: "GitHub",
      account: "@acme",
    });
    expect(
      toolsFor({
        user,
        model: opus,
        offeredSkills: [],
        connections: [connection("c1"), connection("c2"), connection("c3", "jira")],
      }),
    ).toMatchObject({
      activeTools: ["html_render", "search_records", "read_record", "github_pull_request_diff"],
      toolsContext: {
        search_records: { user, connectionIds: ["c1", "c2", "c3"] },
        read_record: { user, connectionIds: ["c1", "c2", "c3"] },
        github_pull_request_diff: { user, connectionIds: ["c1", "c2"] },
      },
    });
  });

  it("offers no record tool when every attached connection is gone", () => {
    expect(
      toolsFor({ user, model: opus, offeredSkills: [], connections: [] }).activeTools,
    ).toEqual(["html_render"]);
  });
});
