import "server-only";
import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
  safeValidateUIMessages,
  stepCountIs,
  ToolLoopAgent,
  type GatewayModelId,
  type LanguageModel,
} from "ai";
import type { User } from "@/lib/auth";
import {
  attachedConnectionsOf,
  attachedItemsText,
  recordsDataSchemas,
} from "@/modules/records/contracts";
import { getAllowedConnections } from "@/modules/records/queries";
import { getSkills } from "@/modules/skills/queries";
import type {
  AgentModel,
  ChatOptions,
  WorkspaceMessageMetadata,
  WorkspaceUIMessage,
} from "./contracts";
import { instructionsFor, resolveContext, type AgentContext } from "./domain";
import { MessagesRejected } from "./errors";
import { models } from "./queries";
import { tools, toolsFor } from "./tools";

export type AgentRequest = {
  /** The model and skills, as the ids the browser sent. */
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

/**
 * What the adapter hands in (Rule 12): the language model behind a gateway id, built from the
 * env in lib/ai.ts, and the copy the browser reads when the model fails after the stream started.
 */
export type AgentServices = {
  languageModel: (id: GatewayModelId) => LanguageModel;
  describeError: (error: unknown) => string;
};

/** The streaming reply, and the model that answers it. */
export type AgentRun = { model: AgentModel; response: Response };

/** The server names the replies; the browser names its own messages. */
const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

/** A reply that was stopped or failed still needs an end time for its timing row. */
function withCompletedReply(messages: WorkspaceUIMessage[]): WorkspaceUIMessage[] {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || last.metadata?.completedAt) return messages;
  return [
    ...messages.slice(0, -1),
    { ...last, metadata: { ...last.metadata, completedAt: new Date().toISOString() } },
  ];
}

/** The workspace agent for one answer: its model, prompt and the tools it may call. */
function agentFor(context: AgentContext, model: LanguageModel) {
  return new ToolLoopAgent({
    id: "workspace",
    model,
    instructions: instructionsFor(context),
    tools,
    ...toolsFor(context),
    // Lets the model call a tool or two and then write its reply.
    stopWhen: stepCountIs(5),
  });
}

/**
 * Answers a conversation for the requester: resolves the model and skill from their ids (an
 * unknown one throws `ModelNotFound` or `SkillNotFound`), validates the conversation against the
 * tools (`MessagesRejected`), and streams the reply with start and finish timing in the message
 * metadata. The stream is read to its end on the server too (`consumeSseStream`), so `onEnd` gets
 * the reply even when the browser goes away.
 */
export async function runAgent(
  requester: User,
  { options, messages, signal, onEnd }: AgentRequest,
  { languageModel, describeError }: AgentServices,
): Promise<AgentRun> {
  const context = resolveContext(requester, options, { models, skills: await getSkills() });
  const { model, skill } = context;

  const validated = await safeValidateUIMessages<WorkspaceUIMessage>({
    messages,
    tools,
    dataSchemas: recordsDataSchemas,
  });
  if (!validated.success) throw new MessagesRejected(validated.error.message);
  // A connection the user no longer has, or that needs reconnecting, is left out silently: an
  // older question keeps its items, and the model says it cannot read them.
  const attachedAny = validated.data.some(
    (message) => attachedConnectionsOf(message).length > 0,
  );
  const answerContext: AgentContext = attachedAny
    ? { ...context, connections: await getAllowedConnections(requester, validated.data) }
    : context;

  const response = await createAgentUIStreamResponse({
    agent: agentFor(answerContext, languageModel(model.gateway)),
    uiMessages: validated.data,
    originalMessages: validated.data,
    // A question's attached items reach the model as reference lines, never their bodies.
    convertDataPart: attachedItemsText,
    generateMessageId,
    consumeSseStream: consumeStream,
    onEnd: async ({ messages: conversation }) => {
      try {
        await onEnd(withCompletedReply(conversation));
      } catch (error) {
        console.error("[runAgent] the conversation was not stored", error);
      }
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
        return { completedAt: new Date().toISOString() } satisfies WorkspaceMessageMetadata;
      }
      return undefined;
    },
    onError: (error) => {
      console.error("[runAgent]", error);
      return describeError(error);
    },
  });
  return { model, response };
}
