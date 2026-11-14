"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ConnectionListItem, ProviderChoice } from "@/modules/integrations/contracts";
import { IntegrationsContext } from "./use-integrations";

/**
 * The providers and the user's connections the page loaded. An action answers with what it
 * stored, which goes into this state (ARCHITECTURE.md, "Stored projects, threads…").
 */
export function IntegrationsProvider({
  providers,
  connections: initialConnections,
  children,
}: {
  providers: ProviderChoice[];
  connections: ConnectionListItem[];
  children: ReactNode;
}) {
  const [connections, setConnections] = useState(initialConnections);
  const value = useMemo(
    () => ({
      providers,
      connections,
      putConnection(connection: ConnectionListItem) {
        setConnections((previous) =>
          previous.some((item) => item.id === connection.id)
            ? previous.map((item) => (item.id === connection.id ? connection : item))
            : [...previous, connection],
        );
      },
      removeConnection(id: string) {
        setConnections((previous) => previous.filter((item) => item.id !== id));
      },
    }),
    [providers, connections],
  );
  return <IntegrationsContext value={value}>{children}</IntegrationsContext>;
}
