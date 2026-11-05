"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ChatOptions, WorkspaceUIMessage } from "@/modules/agent";

export type ConversationLoad = "loading" | "failed" | "ready";

/**
 * Holds one AI SDK `Chat` per thread for the lifetime of the page. The server
 * stores each conversation: a chat sends only its latest message, and a stored
 * thread's chat loads its messages the first time the thread opens (`load`).
 *
 * Chats live outside React state so the workspace can start a stream for a
 * thread before its conversation view mounts, and so switching threads keeps
 * each conversation (plain `useChat({ id })` would drop it).
 */
export class ChatStore {
  #chats = new Map<string, Chat<WorkspaceUIMessage>>();
  #lastOptions = new Map<string, ChatOptions>();
  #working = new Set<string>();
  /** Threads whose conversation is loading, failed to load, or is here. */
  #loads = new Map<string, ConversationLoad>();
  #listeners = new Set<() => void>();

  getChat(threadId: string): Chat<WorkspaceUIMessage> {
    return this.#chats.get(threadId) ?? this.#create(threadId, []);
  }

  /** Messages for a thread without creating its chat. */
  peekMessages(threadId: string): WorkspaceUIMessage[] {
    return this.#chats.get(threadId)?.messages ?? [];
  }

  /**
   * Loads a stored thread's conversation into its chat, once. A chat this page
   * started (a new thread, a fork) already has it.
   */
  async load(threadId: string) {
    const state = this.#loads.get(threadId);
    if (state === "loading" || state === "ready") return;
    this.#setLoad(threadId, "loading");
    try {
      const response = await fetch(`/api/threads/${threadId}/messages`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const messages: WorkspaceUIMessage[] = await response.json();
      const chat = this.getChat(threadId);
      // A send while loading wins; the server merges it with what it has.
      if (chat.messages.length === 0 && !this.isWorking(threadId))
        chat.messages = messages;
      this.#setLoad(threadId, "ready");
    } catch {
      this.#setLoad(threadId, "failed");
    }
  }

  loadState = (threadId: string): ConversationLoad =>
    this.#loads.get(threadId) ?? "loading";

  send(
    threadId: string,
    message: { text: string; attachments: string[] },
    options: ChatOptions,
  ) {
    if (!this.#loads.has(threadId)) this.#loads.set(threadId, "ready");
    const chat = this.getChat(threadId);
    this.#lastOptions.set(threadId, options);
    return this.#run(threadId, () =>
      chat.sendMessage(
        {
          text: message.text,
          metadata: {
            createdAt: new Date().toISOString(),
            attachments: message.attachments,
            skillId: options.skillId,
          },
        },
        { body: options },
      ),
    );
  }

  /** Regenerates the last response with the options of the last send. */
  retry(threadId: string) {
    const options = this.#lastOptions.get(threadId);
    if (!options) return Promise.resolve();
    const chat = this.getChat(threadId);
    return this.#run(threadId, () => chat.regenerate({ body: options }));
  }

  stop(threadId: string) {
    return this.#chats.get(threadId)?.stop();
  }

  /** Starts `toThreadId` with a copy of the source chat through one message. */
  fork(fromThreadId: string, toThreadId: string, throughMessageId?: string) {
    const messages = this.peekMessages(fromThreadId);
    const end = throughMessageId
      ? messages.findIndex((message) => message.id === throughMessageId) + 1
      : 0;
    this.#create(toThreadId, structuredClone(messages.slice(0, end)));
    this.#setLoad(toThreadId, "ready");
    const options = this.#lastOptions.get(fromThreadId);
    if (options) this.#lastOptions.set(toThreadId, options);
  }

  isWorking = (threadId: string) => this.#working.has(threadId);

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #create(threadId: string, messages: WorkspaceUIMessage[]) {
    const chat = new Chat<WorkspaceUIMessage>({
      id: threadId,
      messages,
      transport: new DefaultChatTransport({
        api: `/api/threads/${threadId}/messages`,
        // The server holds the conversation; it needs only the latest message.
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, message: messages.at(-1) },
        }),
      }),
      // The server stamps completedAt on a clean finish; stopped or failed
      // responses still need an end time for the timing row.
      onFinish: ({ message }) => {
        if (message.role !== "assistant" || message.metadata?.completedAt)
          return;
        chat.messages = chat.messages.map((item) =>
          item.id === message.id
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  completedAt: new Date().toISOString(),
                },
              }
            : item,
        );
      },
    });
    this.#chats.set(threadId, chat);
    return chat;
  }

  async #run(threadId: string, request: () => Promise<void>) {
    this.#setWorking(threadId, true);
    try {
      await request();
    } finally {
      this.#setWorking(threadId, false);
    }
  }

  #setWorking(threadId: string, working: boolean) {
    if (working) this.#working.add(threadId);
    else this.#working.delete(threadId);
    this.#notify();
  }

  #setLoad(threadId: string, state: ConversationLoad) {
    this.#loads.set(threadId, state);
    this.#notify();
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }
}
