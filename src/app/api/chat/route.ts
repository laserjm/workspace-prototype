import { createAgentUIStreamResponse, TypeValidationError } from "ai";
import { workspaceAgent } from "@/lib/agent/agent";
import type { WorkspaceMessageMetadata } from "@/lib/chat/message";
import { chatRequestSchema } from "@/lib/chat/request";

// Tool loops (html_render, then the reply) can outlast the platform default.
export const maxDuration = 300;

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

export async function POST(req: Request) {
  const body = chatRequestSchema.safeParse(
    await req.json().catch(() => undefined),
  );
  if (!body.success) return badRequest("Invalid chat request.");
  const { messages, modelId, skillId, scope } = body.data;

  try {
    // Validates the messages against the agent's tools before streaming.
    return await createAgentUIStreamResponse({
      agent: workspaceAgent,
      uiMessages: messages,
      options: { modelId, skillId, scope },
      abortSignal: req.signal,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return {
            startedAt: new Date().toISOString(),
            modelId,
            skillId,
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
  } catch (error) {
    if (error instanceof TypeValidationError) {
      return badRequest("Invalid chat messages.");
    }
    throw error;
  }
}
