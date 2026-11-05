// runAgent end to end on a mock model: the wiring from the context to the tools the model is
// offered and to what a tool's execute sees. No gateway, no network.
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceUIMessage } from "./contracts";
import { runAgent } from "./run";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finish = (unified: "stop" | "tool-calls") => ({
  type: "finish" as const,
  finishReason: { unified, raw: undefined },
  usage,
});
const step = (chunks: unknown[]) => ({
  stream: new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }),
});
const reply = () =>
  step([
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: "Two are in review." },
    { type: "text-end", id: "t1" },
    finish("stop"),
  ]);

const { model } = vi.hoisted(() => ({ model: { current: undefined as unknown } }));
vi.mock("./models", () => ({
  get models() {
    return [
      {
        id: "mock",
        label: "Mock",
        effort: "High",
        provider: "claude",
        gateway: model.current,
      },
    ];
  },
}));

/** Runs the agent to the end of its reply and answers the stored conversation. */
async function run(options: Parameters<typeof runAgent>[0]["options"]) {
  let stored: WorkspaceUIMessage[] = [];
  const result = await runAgent({
    options,
    messages: [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Which are in review?" }] },
    ],
    onEnd: async (messages) => {
      stored = messages;
    },
  });
  if (!result.ok) throw new Error(`refused: ${result.error._tag}`);
  await result.value.response.text();
  await vi.waitFor(() => expect(stored.length).toBe(2));
  return stored;
}

const toolNames = (mock: MockLanguageModelV4, call: number) =>
  (mock.doStreamCalls[call]?.tools ?? []).map((tool) => tool.name);

describe("runAgent", () => {
  it("offers only html_render without attached records", async () => {
    const mock = new MockLanguageModelV4({ doStream: [reply()] });
    model.current = mock;
    await run({ modelId: "mock" });
    expect(toolNames(mock, 0)).toEqual(["html_render"]);
  });

  it("lets the model search the attached records, and only those", async () => {
    const scope = { sourceId: "jira", recordIds: ["PLAT-124", "PLAT-125", "PLAT-127"] };
    const mock = new MockLanguageModelV4({
      doStream: [
        step([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "search_records",
            input: JSON.stringify({ text: "PLAT" }),
          },
          finish("tool-calls"),
        ]),
        reply(),
      ],
    });
    model.current = mock;
    const conversation = await run({ modelId: "mock", scope });

    expect(toolNames(mock, 0).sort()).toEqual(["html_render", "search_records"]);
    const search = conversation[1]?.parts.find(
      (part) => part.type === "tool-search_records",
    );
    expect(search).toMatchObject({ state: "output-available", output: { searched: 3 } });
    const found = search?.type === "tool-search_records" && search.output;
    expect(found && found.matches.map((match) => match.id)).toEqual(scope.recordIds);
    expect(conversation[1]?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Two are in review." }),
    );
  });

  it("lets the model load a switched-on skill it was offered", async () => {
    const mock = new MockLanguageModelV4({
      doStream: [
        step([
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "load_skill",
            input: JSON.stringify({ id: "risk-review" }),
          },
          finish("tool-calls"),
        ]),
        reply(),
      ],
    });
    model.current = mock;
    const conversation = await run({ modelId: "mock", skillIds: ["risk-review"] });

    expect(toolNames(mock, 0).sort()).toEqual(["html_render", "load_skill"]);
    expect(JSON.stringify(mock.doStreamCalls[0]?.prompt)).toContain(
      "- risk-review (Risk review): ",
    );
    expect(conversation[1]?.parts).toContainEqual(
      expect.objectContaining({
        type: "tool-load_skill",
        state: "output-available",
        output: expect.objectContaining({ id: "risk-review", name: "Risk review" }),
      }),
    );
  });
});
