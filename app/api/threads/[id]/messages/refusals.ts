import "server-only";
// How the thread messages route answers what a use case threw: a status with `{ error }`
// (CONVENTIONS.md, Errors). One refusal per module, each a `switch` that ends in a `never`
// check, so a new error class fails to compile here until it has a status; what is not the
// module's is rethrown. `thrownResponse` adds the visitor and the bug every route answers.
import { SignedOut } from "@/lib/auth";
import * as threads from "@/modules/threads";

export const noStore = { "Cache-Control": "private, no-store" };

export function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: noStore });
}

/** The status for a thread's refusal. */
export function threadRefusal(error: unknown): Response {
  if (!threads.isThreadError(error)) throw error;
  switch (error.name) {
    case "ThreadNotFound":
      return errorResponse(404, "Thread not found.");
    case "ForeignConnectionAttached":
      return errorResponse(400, "Invalid chat request.");
    // The writes behind the workspace's actions throw these; nothing this route calls does.
    case "ProjectNotFound":
    case "ThreadIdTaken":
    case "ResponseNotFound":
    case "SnoozeTimeInPast":
      return bug(error);
    default:
      return unmapped(error);
  }
}

/** The status for a refusal of the agent, which a thread's answer runs. */
export function agentRefusal(error: unknown): Response {
  if (!threads.isAgentError(error)) throw error;
  switch (error.name) {
    case "MessagesRejected":
      return errorResponse(400, "Invalid chat messages.");
    case "ModelNotFound":
    case "SkillNotFound":
      return errorResponse(400, "Invalid chat request.");
    default:
      return unmapped(error);
  }
}

/** What was thrown: a visitor, a module's refusal, or a bug, logged. */
export function thrownResponse(error: unknown): Response {
  if (error instanceof SignedOut) return errorResponse(401, "Sign in to continue.");
  if (threads.isThreadError(error)) return threadRefusal(error);
  if (threads.isAgentError(error)) return agentRefusal(error);
  return bug(error);
}

function bug(error: unknown): Response {
  console.error("[api/threads/messages]", error);
  return errorResponse(500, "Something went wrong on the server. Try again in a moment.");
}

/** The compiler's half of the `switch`: reached only by an error class with no case. */
function unmapped(error: never): never {
  throw error;
}
