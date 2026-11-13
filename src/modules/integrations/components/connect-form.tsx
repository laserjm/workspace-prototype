"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/lib/actions/client";
import { errorMessage } from "@/lib/actions/messages";
import { connectAction } from "../actions";
import type { Connection, Credential, ProviderChoice } from "../contracts";

const fieldLabel = "text-xs font-medium text-secondary-foreground";
const fieldHelp = "text-2xs leading-relaxed text-muted-foreground";

/**
 * Connects to a provider: its sign-in methods' fields and, when it has one, its API address.
 * The provider checks the credential before anything is stored.
 */
export function ConnectForm({
  provider,
  onConnected,
  onCancel,
}: {
  provider: ProviderChoice;
  onConnected: (connection: Connection) => void;
  onCancel: () => void;
}) {
  const methods = provider.auth;
  const [methodIndex, setMethodIndex] = useState(0);
  const method = methods[methodIndex]!;
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl?.default ?? "");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const connect = useAction(connectAction, { onSuccess: onConnected });

  const credential: Credential =
    method.kind === "token"
      ? { kind: "token", token }
      : { kind: "basic", username, password };
  const complete =
    (method.kind === "token" ? token.trim() : username.trim() && password) &&
    (!provider.baseUrl || baseUrl.trim());
  const id = (field: string) => `connect-${provider.id}-${field}`;
  // Any issue with the address (not HTTPS, internal, not found) is the URL field's error; every
  // other error is the form's.
  const urlError =
    provider.baseUrl && connect.error?._tag === "ValidationFailed"
      ? connect.error.issues.find((issue) => issue.path === "baseUrl")?.message
      : undefined;

  return (
    <form
      className="mt-3 flex flex-col gap-3 border-t border-border pt-3"
      aria-label={`Connect ${provider.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!complete || connect.pending) return;
        void connect.run({
          providerId: provider.id,
          ...(provider.baseUrl ? { baseUrl: baseUrl.trim() } : {}),
          credential,
        });
      }}
    >
      {methods.length > 1 && (
        <div className="flex gap-1" role="group" aria-label="Sign-in method">
          {methods.map((item, index) => (
            <Button
              key={item.label}
              type="button"
              size="xs"
              variant={index === methodIndex ? "secondary" : "ghost"}
              aria-pressed={index === methodIndex}
              onClick={() => setMethodIndex(index)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      )}
      {provider.baseUrl && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("url")} className={fieldLabel}>
            {provider.baseUrl.label}
          </label>
          <Input
            id={id("url")}
            type="url"
            inputMode="url"
            placeholder={provider.baseUrl.placeholder}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            required
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? id("url-error") : undefined}
          />
          {urlError && (
            <p
              id={id("url-error")}
              className="text-xs text-destructive-foreground"
              role="alert"
            >
              {urlError}
            </p>
          )}
        </div>
      )}
      {method.kind === "token" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("token")} className={fieldLabel}>
            {method.label}
          </label>
          <Input
            id={id("token")}
            type="password"
            autoComplete="off"
            autoFocus
            placeholder={method.placeholder}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
          <p className={fieldHelp}>{method.help}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("username")} className={fieldLabel}>
              {method.usernameLabel}
            </label>
            <Input
              id={id("username")}
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("password")} className={fieldLabel}>
              {method.passwordLabel}
            </label>
            <Input
              id={id("password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className={fieldHelp}>{method.help}</p>
          </div>
        </>
      )}
      {connect.error && !urlError && (
        <p className="text-xs text-destructive-foreground" role="alert">
          {connect.error._tag === "CredentialRejected" ||
          connect.error._tag === "ProviderUnreachable" ||
          connect.error._tag === "RateLimited"
            ? connect.error.message
            : errorMessage(connect.error, {
                NotFound: `${provider.name} cannot be connected this way.`,
              })}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!complete || connect.pending}>
          {connect.pending ? "Checking…" : `Connect ${provider.name}`}
        </Button>
      </div>
      <p className={fieldHelp}>
        {provider.name} is asked who this belongs to before anything is stored.
        The {method.kind === "token" ? "token" : "password"} is stored
        encrypted and never shown again.
      </p>
    </form>
  );
}
