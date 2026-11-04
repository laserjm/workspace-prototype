import type { GatewayModelId } from "ai";

/**
 * Models the workspace offers. The client only ever sends `id`; the server
 * resolves `gateway` from this allowlist, so a browser cannot pick any model.
 */
export const models = [
  {
    id: "opus",
    label: "Opus 5.5",
    effort: "High",
    provider: "claude",
    gateway: "anthropic/claude-opus-5.5",
  },
  {
    id: "sonnet",
    label: "Sonnet 5.5",
    effort: "High",
    provider: "claude",
    gateway: "anthropic/claude-sonnet-5.5",
  },
  {
    id: "gpt",
    label: "GPT-6.1",
    effort: "High",
    provider: "openai",
    gateway: "openai/gpt-6.1-sol",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  effort: string;
  provider: "claude" | "openai";
  gateway: GatewayModelId;
}[];

export type WorkspaceModel = (typeof models)[number];
export type ModelId = WorkspaceModel["id"];
export type ModelProvider = WorkspaceModel["provider"];

export const modelIds = models.map((model) => model.id) as [
  ModelId,
  ...ModelId[],
];

export function getModel(id: ModelId): WorkspaceModel {
  return models.find((model) => model.id === id)!;
}
