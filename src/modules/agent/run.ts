import "server-only";
import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
  safeValidateUIMessages,
  stepCountIs,
  ToolLoopAgent,
} from "ai";
import { z } from "zod";
import type { User } from "@/lib/auth/user";
import type { NotFound, ValidationFailed } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { listSkills } from "@/modules/skills/server";
import { findSource, listScopedRecords } from "@/modules/sources/server";
import { resolveContext, type AgentContext } from "./context";
import type {
  ChatOptions,
  WorkspaceMessageMetadata,
  WorkspaceUIMessage,
} from "./contracts";
import { baseInstructions, instructionsFor, promptFor } from "./instructions";
import { models, type AgentModel } from "./models";
import { tools, toolsFor } from "./tools";

export type AgentRequest = {
  /** The signed-in user the answer is for. */
  user: User;
  /** The model, skill and records, as the ids the browser sent. */
  options: ChatOptions;
  /** The conversation to answer, ending with the user's message; validated here. */
  messages: unknown[];
  signal?: AbortSignal;
  /**
   * Called once the reply ends, finished, stopped or failed, with the conversation including
   * it. The reply is complete even if the browser went away.
   */
  onEnd(messages: WorkspaceUIMessage[]): Promise<void>;
};

/** The streaming reply, and the model that answers it. */
export type AgentRun = { model: AgentModel; response: Response };

/**
 * The workspace agent on the Vercel AI Gateway. Each call passes the answer's context as its
 * call option; `prepareCall` turns it into the model, the prompt, the tools the answer may call
 * and what those tools know of the thread.
 */
const workspaceAgent = new ToolLoopAgent({
  id: "workspace",
  // Replaced on every call; required by the constructor.
  model: models[0]!.gateway,
  instructions: baseInstructions,
  tools,
  // Replaced on every call by toolsFor; no thread, no attached records.
  toolsContext: {
    search_records: {},
    get_record: {},
    load_skill: { skillIds: [] },
  },
  // Lets the model call a tool or two and then write its reply.
  stopWhen: stepCountIs(5),
  // Built on the server by resolveContext, never from the request, so it is not parsed again.
  callOptionsSchema: z.object({ context: z.custom<AgentContext>() }),
  prepareCall: ({ options: { context }, prompt, messages, ...settings }) => ({
    ...settings,
    model: context.model.gateway,
    instructions: instructionsFor(context),
    // The attached records, as data in a message of their own (instructions.ts).
    prompt: promptFor(prompt ?? messages, context),
    ...toolsFor(context),
  }),
});

/** What was read, or nothing when the source's system failed; the answer goes on without it. */
function orNothing<T>(read: Promise<T>, sourceId: string) {
  return read.catch((error: unknown) => {
    console.error(`[runAgent] the records of ${sourceId} were not read`, error);
    return undefined;
  });
}

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
 * Answers a conversation: resolves the model, skill and records from their ids (an unknown one
 * is a `NotFound`), validates the conversation against the tools, and streams the reply with
 * start and finish timing in the message metadata. The stream is read to its end on the server
 * too (`consumeSseStream`), so `onEnd` gets the reply even when the browser goes away.
 */
export async function runAgent({
  user,
  options,
  messages,
  signal,
  onEnd,
}: AgentRequest): Promise<Result<AgentRun, NotFound | ValidationFailed>> {
  const { scope } = options;
  const [skills, scopeSource, scopedRecords] = await Promise.all([
    listSkills(),
    scope && orNothing(findSource(user, scope.sourceId), scope.sourceId),
    scope && orNothing(listScopedRecords(user, scope), scope.sourceId),
  ]);
  const context = resolveContext(user, options, {
    models,
    skills,
    scopeSource,
    scopedRecords,
  });
  if (!context.ok) return context;
  const { model, skill } = context.value;

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
        console.error("[runAgent] the conversation was not stored", error);
      }
    },
    options: { context: context.value },
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
      console.error("[runAgent]", error);
      return "The model request failed. Try again.";
    },
  });
  return ok({ model, response });
}
