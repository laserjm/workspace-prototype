"use client";

import { createContext, useContext } from "react";
import type { ConnectionListItem, ProviderChoice } from "@/modules/integrations/contracts";

export type Integrations = {
  providers: readonly ProviderChoice[];
  connections: readonly ConnectionListItem[];
  /** Adds a connection the server stored, or puts it in place of the one with its id. */
  putConnection(connection: ConnectionListItem): void;
  removeConnection(id: string): void;
};

export const IntegrationsContext = createContext<Integrations | null>(null);

/** The providers and the user's connections, provided by `IntegrationsProvider`. */
export function useIntegrations() {
  const integrations = useContext(IntegrationsContext);
  if (!integrations) throw new Error("useIntegrations is called outside IntegrationsProvider");
  return integrations;
}
