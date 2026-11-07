"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { bug } from "@/lib/errors";
import type { ChatStore, ConversationLoad } from "./chat-store";

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

/** Loads the thread's stored conversation the first time it opens, and says how that went. */
export function useConversationLoad(threadId: string): ConversationLoad {
  const store = useChatStore();
  useEffect(() => {
    void store.load(threadId);
  }, [store, threadId]);
  return useSyncExternalStore(
    store.subscribe,
    () => store.loadState(threadId),
    () => "loading",
  );
}
