"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/actions/client";
import { errorMessage } from "@/lib/actions/messages";
import { disconnectAction, testConnectionAction } from "../actions";
import {
  expiryLabel,
  type Connection,
  type ProviderChoice,
} from "../contracts";
import { ConnectForm } from "./connect-form";
import { useIntegrations } from "./use-integrations";

/** Settings → Data sources: every provider, the user's connections to it, and connecting one. */
export function SourcesSettingsPanel() {
  const { providers, connections, putConnection } = useIntegrations();
  const [connecting, setConnecting] = useState<string | null>(null);
  return (
    <section aria-label="Data sources settings">
      <h2 className="text-base font-medium text-foreground">Data sources</h2>
      <p className="mt-1 text-xs text-muted-foreground max-md:text-2xs">
        The systems your threads can read from.
      </p>
      <p className="my-3.5 text-2xs leading-relaxed text-muted-foreground">
        Each connection is yours alone. Its token is checked with the system,
        stored encrypted, and never shown again.
      </p>
      <div className="flex flex-col gap-2.5">
        {providers.map((provider) => {
          const own = connections.filter(
            (connection) => connection.providerId === provider.id,
          );
          return (
            <article
              key={provider.id}
              className="rounded-lg border border-border p-3.5 max-md:p-3"
              aria-label={provider.name}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-secondary-foreground">
                    {provider.name}
                  </h3>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {provider.description}
                  </p>
                </div>
                {connecting !== provider.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConnecting(provider.id)}
                  >
                    <Plus />
                    {own.length ? "Add account" : "Connect"}
                  </Button>
                )}
              </div>
              {own.length > 0 && (
                <ul className="mt-3 flex list-none flex-col gap-2 p-0">
                  {own.map((connection) => (
                    <ConnectionRow
                      key={connection.id}
                      connection={connection}
                      provider={provider}
                    />
                  ))}
                </ul>
              )}
              {connecting === provider.id && (
                <ConnectForm
                  provider={provider}
                  onConnected={(connection) => {
                    putConnection(connection);
                    setConnecting(null);
                  }}
                  onCancel={() => setConnecting(null)}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** One connection: who it is, whether it works, and testing or removing it. */
function ConnectionRow({
  connection,
  provider,
}: {
  connection: Connection;
  provider: ProviderChoice;
}) {
  const { putConnection, removeConnection } = useIntegrations();
  const test = useAction(testConnectionAction, { onSuccess: putConnection });
  const disconnect = useAction(disconnectAction, {
    onSuccess: ({ id }) => removeConnection(id),
    // Already gone on the server: take it off the list too.
    onError: (error) => {
      if (error._tag === "NotFound") removeConnection(connection.id);
    },
  });
  const healthy = connection.status === "active";
  const error = test.error ?? disconnect.error;
  return (
    <li className="flex flex-col gap-1.5 rounded-md bg-muted/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-secondary-foreground">
          {healthy ? (
            <CircleCheck className="size-3.5 shrink-0 text-success" />
          ) : (
            <CircleAlert className="size-3.5 shrink-0 text-warning" />
          )}
          <span className="truncate font-medium">{connection.accountLabel}</span>
        </span>
        <span className="text-2xs text-muted-foreground">
          {healthy
            ? [
                connection.baseUrl === provider.baseUrl?.default
                  ? null
                  : connection.baseUrl,
                connection.expiresAt
                  ? expiryLabel(connection.expiresAt, new Date())
                  : "Does not expire",
              ]
                .filter(Boolean)
                .join(" · ")
            : `${provider.name} no longer accepts this token. Connect again to replace it.`}
        </span>
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="xs"
            disabled={test.pending || disconnect.pending}
            onClick={() => void test.run({ connectionId: connection.id })}
          >
            {test.pending ? "Testing…" : "Test"}
          </Button>
          <Button
            variant="destructive"
            size="xs"
            disabled={test.pending || disconnect.pending}
            onClick={() => void disconnect.run({ connectionId: connection.id })}
          >
            {disconnect.pending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </span>
      </div>
      {error && error._tag !== "NotFound" && (
        <p className="text-2xs text-destructive-foreground" role="alert">
          {error._tag === "ProviderUnreachable" || error._tag === "RateLimited"
            ? error.message
            : errorMessage(error)}
        </p>
      )}
    </li>
  );
}
