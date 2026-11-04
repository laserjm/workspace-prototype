"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { WorkspaceUIMessage } from "./message";
import type { ChatRequestOptions } from "./request";

/**
 * Holds one AI SDK `Chat` per thread for the lifetime of the page. Messages
 * are not persisted yet: a reload starts every live conversation over.
 *
 * Chats live outside React state so the workspace can start a stream for a
 * thread before its conversation view mounts, and so switching threads keeps
 * each conversation (plain `useChat({ id })` would drop it).
 */
export class ChatStore {
  #chats = new Map<string, Chat<WorkspaceUIMessage>>();
  #lastOptions = new Map<string, ChatRequestOptions>();
  #working = new Set<string>();
  #listeners = new Set<() => void>();

  getChat(threadId: string): Chat<WorkspaceUIMessage> {
    return this.#chats.get(threadId) ?? this.#create(threadId, []);
  }

  /** Messages for a thread without creating its chat. */
  peekMessages(threadId: string): WorkspaceUIMessage[] {
    return this.#chats.get(threadId)?.messages ?? [];
  }

  send(
    threadId: string,
    message: { text: string; attachments: string[] },
    options: ChatRequestOptions,
  ) {
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
      transport: new DefaultChatTransport({ api: "/api/chat" }),
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
    for (const listener of this.#listeners) listener();
  }
}

const ChatStoreContext = createContext<ChatStore | null>(null);

export function ChatStoreProvider({
  store,
  children,
}: {
  store: ChatStore;
  children: ReactNode;
}) {
  return <ChatStoreContext value={store}>{children}</ChatStoreContext>;
}

export function useChatStore(): ChatStore {
  const store = useContext(ChatStoreContext);
  if (!store) throw new Error("useChatStore needs a ChatStoreProvider.");
  return store;
}

/** Whether a thread has a response in flight. Pass `store` above the provider. */
export function useThreadWorking(
  threadId: string | undefined,
  store?: ChatStore,
): boolean {
  const contextStore = useContext(ChatStoreContext);
  const resolved = store ?? contextStore;
  if (!resolved) throw new Error("useThreadWorking needs a ChatStore.");
  return useSyncExternalStore(
    resolved.subscribe,
    () => (threadId ? resolved.isWorking(threadId) : false),
    () => false,
  );
}
