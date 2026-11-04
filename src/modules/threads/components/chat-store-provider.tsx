"use client";

import type { ReactNode } from "react";
import type { ChatStore } from "./chat-store";
import { ChatStoreContext } from "./use-chat-store";

export function ChatStoreProvider({
  store,
  children,
}: {
  store: ChatStore;
  children: ReactNode;
}) {
  return <ChatStoreContext value={store}>{children}</ChatStoreContext>;
}
