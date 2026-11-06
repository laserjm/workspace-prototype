"use client";

import { createContext, useContext } from "react";
import { bug } from "@conventions/nextjs/core";
import type { Connection, ProviderChoice } from "../contracts";

export type Integrations = {
  providers: readonly ProviderChoice[];
  connections: readonly Connection[];
  /** Adds a connection the server stored, or puts it in place of the one with its id. */
  putConnection(connection: Connection): void;
  removeConnection(id: string): void;
};

export const IntegrationsContext = createContext<Integrations | null>(null);

/** The providers and the user's connections, provided by `IntegrationsProvider`. */
export function useIntegrations() {
  return (
    useContext(IntegrationsContext) ??
    bug("useIntegrations is called outside IntegrationsProvider")
  );
}
