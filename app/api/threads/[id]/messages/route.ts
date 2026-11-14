import "server-only";
import { SignedOut } from "@/lib/auth";
import { gatewayModel } from "@/lib/ai";
import { chatOptionsInput } from "@/modules/agent/contracts";
import * as threads from "@/modules/threads";
import { answerThreadInput } from "@/modules/threads/contracts";

// Tool loops (html_render, then the reply) can outlast the platform default.
export const maxDuration = 300;

const noStore = { "Cache-Control": "private, no-store" };

function errorResponse(status: number, error: string) {
  return Response.json({ error }, { status, headers: noStore });
}

/** What was thrown: the refusals a thread's answer knows, a visitor, or a bug, logged. */
function thrownResponse(error: unknown): Response {
  if (error instanceof SignedOut) return errorResponse(401, "Sign in to continue.");
  if (error instanceof threads.ThreadNotFound) return errorResponse(404, "Thread not found.");
  if (error instanceof threads.MessagesRejected) return errorResponse(400, "Invalid chat messages.");
  if (
    error instanceof threads.ForeignConnectionAttached ||
    error instanceof threads.ModelNotFound ||
    error instanceof threads.SkillNotFound
  )
    return errorResponse(400, "Invalid chat request.");
  console.error("[api/threads/messages]", error);
  return errorResponse(500, "Something went wrong on the server. Try again in a moment.");
}

/** A stored thread's conversation, which the browser loads the first time the thread opens. */
export async function GET(_req: Request, ctx: RouteContext<"/api/threads/[id]/messages">) {
  const { id } = await ctx.params;
  try {
    return Response.json(await threads.getThreadMessages(id), { headers: noStore });
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
