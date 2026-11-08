"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type {
  ChatOptions,
  ModelChoice,
  WorkspaceUIMessage,
} from "@/modules/agent";
import type { Thread } from "../contracts";
import { lastRequest } from "./last-request";

/** A question as the composer sends it. */
export type Question = { text: string; attachments: string[] };

/** The first question of a thread this page started, which its chat sends when it opens. */
export type FirstQuestion = { question: Question; options: ChatOptions };

/** What the composer of an open thread can do with its conversation. */
export type ConversationControls = {
  /** False while the stored conversation is loading: a send now would show without it. */
  ready: boolean;
  /** A response is in flight. */
  busy: boolean;
  stop: () => void;
  send: (question: Question, options: ChatOptions) => void;
  /** The skill the latest question used, which the composer starts with. */
  lastSkillId?: string;
};

/** The controls of a conversation that is still loading. */
export const LOADING_CONTROLS: ConversationControls = {
  ready: false,
  busy: false,
  stop: () => undefined,
  send: () => undefined,
};

/**
 * The AI SDK chat of the open thread, as its message persistence describes it: it opens with
 * the stored conversation (`initialMessages`) and sends only its latest message, which the
 * server puts after the conversation it holds. The chat lives while the thread is open; leaving
 * the thread stops a response in flight, and the server stores it as it ended.
 */
export function useThreadChat({
  thread,
  models,
  enabledSkills,
  initialMessages,
  firstQuestion,
  onFirstQuestionSent,
  onWorkingChange,
}: {
  thread: Thread;
  models: ModelChoice[];
  enabledSkills: string[];
  initialMessages: WorkspaceUIMessage[];
  firstQuestion?: FirstQuestion;
  onFirstQuestionSent?: () => void;
  onWorkingChange: (working: boolean) => void;
}) {
  const [transport] = useState(
    () =>
      new DefaultChatTransport<WorkspaceUIMessage>({
        api: `/api/threads/${thread.id}/messages`,
        // The server holds the conversation; it needs only the latest message.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, message: messages.at(-1) },
        }),
      }),
  );
  const { messages, setMessages, status, error, sendMessage, regenerate, stop } =
    useChat<WorkspaceUIMessage>({
      id: thread.id,
      messages: initialMessages,
      transport,
      // The server stamps completedAt on a clean finish; stopped or failed
      // responses still need an end time for the timing row.
      onFinish: ({ message }) => {
        if (message.role !== "assistant" || message.metadata?.completedAt)
          return;
        const completedAt = new Date().toISOString();
        setMessages((current) =>
          current.map((item) =>
            item.id === message.id
              ? { ...item, metadata: { ...item.metadata, completedAt } }
              : item,
          ),
        );
      },
    });
  const busy = status === "submitted" || status === "streaming";

  function send(question: Question, options: ChatOptions) {
    void sendMessage(
      {
        text: question.text,
        metadata: {
          createdAt: new Date().toISOString(),
          attachments: question.attachments,
          modelId: options.modelId,
          skillId: options.skillId,
        },
      },
      { body: options },
    );
  }

  const reportWorking = useEffectEvent(onWorkingChange);
  useEffect(() => {
    reportWorking(busy);
    return () => reportWorking(false);
  }, [busy]);

  const sendFirstQuestion = useEffectEvent(() => {
    if (!firstQuestion) return;
    send(firstQuestion.question, firstQuestion.options);
    onFirstQuestionSent?.();
  });
  useEffect(() => {
    // A task later: in development React mounts effects twice, and useChat
    // stops its chat when it unmounts, which would cancel a send made in the
    // first mount. The cleanup cancels that one instead.
    const timer = setTimeout(sendFirstQuestion, 0);
    return () => clearTimeout(timer);
  }, []);

  const last = lastRequest(messages);
  return {
    messages,
    busy,
    error,
    /** Asks the latest question again, with the model and skill it asked for. */
    retry() {
      const modelId = last.modelId ?? models[0]?.id;
      if (!modelId) return;
      void regenerate({
        body: {
          modelId,
          skillId: last.skillId,
          skillIds: enabledSkills,
          scope: thread.scope,
        } satisfies ChatOptions,
      });
    },
    controls: {
      ready: true,
      busy,
      stop: () => void stop(),
      send,
      lastSkillId: last.skillId,
    } satisfies ConversationControls,
  };
}
