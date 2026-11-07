// How a thread's conversation grows and forks. The rules read only a message's id and role, so
// they hold for the chat's messages as they are stored.
import { notFound, type NotFound } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";

/** What the conversation rules need of a message; the chat's messages carry more. */
export type ConversationMessage = {
  id: string;
  role: "system" | "user" | "assistant";
};

/**
 * The conversation with `message` as its latest. A new message is appended. A message sent
 * again, as a regenerate does with the last question, takes its old place and drops what came
 * after it, the reply being regenerated included.
 */
export function withLatestMessage<M extends ConversationMessage>(
  messages: readonly M[],
  message: M,
): M[] {
  const index = messages.findIndex((item) => item.id === message.id);
  return [...(index === -1 ? messages : messages.slice(0, index)), message];
}

/**
 * Where a fork starts: the conversation through response `messageId` and which response that is
 * (0 for the first). Only a response can be forked from.
 */
export function forkPoint<M extends ConversationMessage>(
  messages: readonly M[],
  messageId: string,
): Result<{ messages: M[]; responseIndex: number }, NotFound> {
  const index = messages.findIndex((item) => item.id === messageId);
  if (index === -1 || messages[index]!.role !== "assistant")
    return err(notFound("Response", messageId));
  const through = messages.slice(0, index + 1);
  return ok({
    messages: through,
    responseIndex:
      through.filter((item) => item.role === "assistant").length - 1,
  });
}
