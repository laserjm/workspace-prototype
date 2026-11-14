import "server-only";
import { gatewayModel } from "@/lib/ai";
import { chatOptionsInput } from "@/modules/agent/contracts";
import * as threads from "@/modules/threads";
import { answerThreadInput } from "@/modules/threads/contracts";
import { errorResponse, noStore, thrownResponse } from "./thread-error";

// Tool loops (html_render, then the reply) can outlast the platform default.
export const maxDuration = 300;

/** A stored thread's conversation, which the browser loads the first time the thread opens. */
export async function GET(_req: Request, ctx: RouteContext<"/api/threads/[id]/messages">) {
  const { id } = await ctx.params;
  try {
    const messages = await threads.getThreadMessages(id);
    if (!messages) return errorResponse(404, "Thread not found.");
    return Response.json(messages, { headers: noStore });
  } catch (error) {
    return thrownResponse(error);
  }
}

/**
 * The thread's next message, answered with the response as a stream. Before the stream starts a
 * refusal is a status with `{ error }`; after it started, the error chunk's copy is
 * `describeError`'s.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/threads/[id]/messages">) {
  const { id } = await ctx.params;
  const body: unknown = await req.json().catch(() => undefined);
  const turn = answerThreadInput.safeParse(body);
  const options = chatOptionsInput.safeParse(body);
  if (!turn.success || !options.success) return errorResponse(400, "Invalid chat request.");
  try {
    const run = await threads.answerThread(
      id,
      { message: turn.data.message, options: options.data, signal: req.signal },
      { languageModel: gatewayModel, describeError: () => "The model request failed. Try again." },
    );
    return run.response;
  } catch (error) {
    return thrownResponse(error);
  }
}
