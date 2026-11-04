import "server-only";
import { err, ok } from "@conventions/nextjs/core";
import {
  createAgentUIStreamResponse,
  stepCountIs,
  ToolLoopAgent,
  TypeValidationError,
} from "ai";
import { z } from "zod";
import type { ResponseAgent } from "../application/ports";
import type { WorkspaceMessageMetadata } from "../contracts";
import { aiGatewayModelCatalog } from "./ai-gateway.model-catalog";
import {
  instructionsFor,
  workspaceInstructions,
} from "./ai-gateway.instructions";
import { aiSdkHtmlRenderTool } from "./ai-sdk.html-render-tool";

/** Every tool the agent can call. Keys are the names the model sees. */
const tools = { html_render: aiSdkHtmlRenderTool };

/**
 * The workspace agent on the Vercel AI Gateway. Each call passes the gateway model id and the
 * full instructions as call options; `prepareCall` turns them into the model and prompt.
 */
const workspaceAgent = new ToolLoopAgent({
  id: "workspace",
  // Replaced on every call; required by the constructor.
  model: aiGatewayModelCatalog[0].gateway,
  instructions: workspaceInstructions,
  tools,
  // Lets the model call html_render and then write its reply.
  stopWhen: stepCountIs(5),
  callOptionsSchema: z.object({
    gateway: z.string(),
    instructions: z.string(),
  }),
  prepareCall: ({ options, ...settings }) => ({
    ...settings,
    model: options.gateway,
    instructions: options.instructions,
  }),
});

/** Streams the agent's reply with start and finish timing in the message metadata. */
export const aiGatewayResponseAgent: ResponseAgent = {
  async answer({ model, skill, attached, messages, signal }) {
    try {
      // Validates the messages against the agent's tools before streaming.
      const response = await createAgentUIStreamResponse({
        agent: workspaceAgent,
        uiMessages: messages,
        options: {
          gateway: model.gateway,
          instructions: instructionsFor(skill, attached),
        },
        abortSignal: signal,
        messageMetadata: ({ part }) => {
          if (part.type === "start") {
            return {
              startedAt: new Date().toISOString(),
              modelId: model.id,
              skillId: skill?.id,
            } satisfies WorkspaceMessageMetadata;
          }
          if (part.type === "finish") {
            return {
              completedAt: new Date().toISOString(),
            } satisfies WorkspaceMessageMetadata;
          }
          return undefined;
        },
        onError: (error) => {
          console.error("[api/chat]", error);
          return "The model request failed. Try again.";
        },
      });
      return ok(response);
    } catch (error) {
      if (error instanceof TypeValidationError) {
        return err({
          _tag: "ValidationFailed",
          issues: [{ path: "messages", message: error.message }],
        });
      }
      throw error;
    }
  },
};
