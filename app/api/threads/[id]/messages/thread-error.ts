import "server-only";
// How the thread messages route answers what a use case threw: a status with `{ error }`. Every
// error the threads and agent modules can throw has a case, and each `switch` ends in a `never`
// check, so a new error class fails to compile here until it has a status. A visitor is told to
// sign in; anything else is a bug, logged.
import { SignedOut } from "@/lib/auth";
import * as threads from "@/modules/threads";

export const noStore = { "Cache-Control": "private, no-store" };

export function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: noStore });
}

/** What was thrown: the refusals a thread's answer knows, a visitor, or a bug, logged. */
export function thrownResponse(error: unknown): Response {
  if (error instanceof SignedOut) return errorResponse(401, "Sign in to continue.");
  if (threads.isThreadError(error)) {
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
  if (threads.isAgentError(error)) {
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
