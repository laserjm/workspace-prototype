"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { bug } from "@conventions/nextjs/core";
import type { ChatStore } from "./chat-store";

export const ChatStoreContext = createContext<ChatStore | null>(null);

export function useChatStore(): ChatStore {
  const store = useContext(ChatStoreContext);
  if (!store) bug("useChatStore is called outside ChatStoreProvider");
  return store;
}

/** Whether a thread has a response in flight. Pass `store` above the provider. */
export function useThreadWorking(
  threadId: string | undefined,
  store?: ChatStore,
): boolean {
  const contextStore = useContext(ChatStoreContext);
  const resolved =
    store ?? contextStore ?? bug("useThreadWorking needs a ChatStore");
  return useSyncExternalStore(
    resolved.subscribe,
    () => (threadId ? resolved.isWorking(threadId) : false),
    () => false,
  );
}
