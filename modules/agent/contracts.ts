// What the agent module takes and gives: the models it offers, what a message carries, and the
// schemas of its `html_render` tool with the limits the client frame shares. Browser-safe: zod and
// types, and the pure rules the frame runs too (docs/adr/0007).
import type { GatewayModelId, UIMessage } from "ai";
import { z } from "zod";
import type {
  ReadRecordInput,
  ReadRecordOutput,
  RecordsDataTypes,
  SearchRecordsInput,
  SearchRecordsOutput,
} from "@/modules/records/contracts";
import type {
  GithubPullRequestDiffInput,
  GithubPullRequestDiffOutput,
} from "@/modules/integrations/contracts";
import type { LoadSkillInput, LoadSkillOutput } from "@/modules/skills/contracts";

export const MODEL_PROVIDERS = ["claude", "openai"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/** A model the composer offers. */
export type ModelChoice = {
  id: string;
  label: string;
  effort: string;
  provider: ModelProvider;
};

/** A model the workspace offers, with the id the AI Gateway knows it by. Server-side only. */
export type AgentModel = ModelChoice & { gateway: GatewayModelId };

/**
 * What the workspace sends alongside each message, as ids only. The agent resolves them
 * against the server's catalogues, so a browser cannot pick a model or skill it was not offered.
 * What a question is about travels on the message itself (`data-attached-items`).
 */
export const chatOptionsInput = z.object({
  modelId: z.string().min(1).max(100),
  skillId: z.string().min(1).max(100).optional(),
  /** The skills switched on in this browser: the agent may load one when a question fits it. */
  skillIds: z.array(z.string().min(1).max(100)).max(50).optional(),
});
export type ChatOptions = z.infer<typeof chatOptionsInput>;


// html_render: the limits the tool checks and the client frame keeps to.

export const HTML_RENDER_MIN_HEIGHT = 80;
export const HTML_RENDER_MAX_HEIGHT = 2000;
// The client fits the frame to the live page up to this height. It only stops a page that grows
// with its frame, since vh units are rejected by the tool.
export const HTML_RENDER_MAX_FIT_HEIGHT = 20_000;
export const HTML_RENDER_MAX_TITLE_LENGTH = 200;
export const HTML_RENDER_MAX_HTML_LENGTH = 512_000;
/** The reply column's width, which the tool's description tells the model. */
export const HTML_RENDER_COLUMN_WIDTH = 856;

export function clampHtmlRenderHeight(height: number): number {
  return Math.min(HTML_RENDER_MAX_HEIGHT, Math.max(HTML_RENDER_MIN_HEIGHT, Math.round(height)));
}

export function normalizeHtmlRenderTitle(title: string): string {
  return title.trim().slice(0, HTML_RENDER_MAX_TITLE_LENGTH) || "HTML";
}

/** The `html_render` tool: the model shows a self-contained HTML page above its reply. */
export const htmlRenderInput = z.object({
  html: z
    .string()
    .min(1)
    .max(HTML_RENDER_MAX_HTML_LENGTH)
    .describe("A complete, self-contained HTML document."),
  title: z.string().min(1).max(HTML_RENDER_MAX_TITLE_LENGTH),
  height: z
    .number()
    .int()
    .describe(
      `Estimated frame height in CSS pixels, ${HTML_RENDER_MIN_HEIGHT} to ${HTML_RENDER_MAX_HEIGHT}. The frame fits the page once it loads.`,
    ),
});
export type HtmlRenderInput = z.infer<typeof htmlRenderInput>;

export const htmlRenderOutput = z.object({
  title: z.string(),
  height: z.number(),
  message: z.string(),
});
export type HtmlRenderOutput = z.infer<typeof htmlRenderOutput>;

export type WorkspaceMessageMetadata = {
  /** User messages: when the message was sent. */
  createdAt?: string;
  /** User messages: attachment names (not yet uploaded to the model). */
  attachments?: string[];
  /** Assistant messages: stamped by the server on stream start and finish. */
  startedAt?: string;
  completedAt?: string;
  /**
   * User messages: the model and skill the question asked for, which a retry asks again.
   * Assistant messages: the ones that answered.
   */
  modelId?: string;
  skillId?: string;
};

/**
 * The tools as the browser sees them; keys are the names the model sees. Stored conversations
 * hold these names, so a tool is never renamed (see `tools.ts`, whose set this must match).
 */
export type WorkspaceUITools = {
  html_render: { input: HtmlRenderInput; output: HtmlRenderOutput };
  search_records: { input: SearchRecordsInput; output: SearchRecordsOutput };
  read_record: { input: ReadRecordInput; output: ReadRecordOutput };
  github_pull_request_diff: {
    input: GithubPullRequestDiffInput;
    output: GithubPullRequestDiffOutput;
  };
  load_skill: { input: LoadSkillInput; output: LoadSkillOutput };
};

/**
 * The data parts a message may carry, by name: a question's attached items
 * (`data-attached-items`). Stored conversations hold these names, so one is never renamed.
 */
export type WorkspaceUIDataTypes = RecordsDataTypes;

export type WorkspaceUIMessage = UIMessage<
  WorkspaceMessageMetadata,
  WorkspaceUIDataTypes,
  WorkspaceUITools
>;
