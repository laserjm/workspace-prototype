import "server-only";
import { err, ok } from "@conventions/nextjs/core";
import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
  safeValidateUIMessages,
  stepCountIs,
  ToolLoopAgent,
} from "ai";
import { z } from "zod";
import type { ResponseAgent } from "../application/ports";
import type {
  WorkspaceMessageMetadata,
  WorkspaceUIMessage,
} from "../contracts";
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

/** The server names the replies; the browser names its own messages. */
const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

/** A reply that was stopped or failed still needs an end time for its timing row. */
function withCompletedReply(
  messages: WorkspaceUIMessage[],
): WorkspaceUIMessage[] {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || last.metadata?.completedAt) return messages;
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      metadata: { ...last.metadata, completedAt: new Date().toISOString() },
    },
  ];
}

/**
 * Streams the agent's reply with start and finish timing in the message metadata, and hands the
 * conversation with the reply to `onEnd`. The stream is read to its end on the server too
 * (`consumeSseStream`), so a reply is stored even when the browser goes away.
 */
export const aiGatewayResponseAgent: ResponseAgent = {
  async answer({ model, skill, attached, messages, signal, onEnd }) {
    // Validates the conversation against the agent's tools before streaming.
    const validated = await safeValidateUIMessages<WorkspaceUIMessage>({
      messages,
      tools,
    });
    if (!validated.success) {
      return err({
        _tag: "ValidationFailed",
        issues: [{ path: "messages", message: validated.error.message }],
      });
    }
    const response = await createAgentUIStreamResponse({
      agent: workspaceAgent,
      uiMessages: validated.data,
      originalMessages: validated.data,
      generateMessageId,
      consumeSseStream: consumeStream,
      onEnd: async ({ messages: conversation }) => {
        try {
          await onEnd(withCompletedReply(conversation));
        } catch (error) {
          console.error("[answerThread] the conversation was not stored", error);
        }
      },
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
        console.error("[answerThread]", error);
        return "The model request failed. Try again.";
      },
    });
    return ok(response);
  },
};
