"use server";
import "server-only";
// The workspace's server actions: parse → module → map errors. The modules bind the current
// user (Rule 1); this file speaks to the browser and owns the copy it shows. A refusal is
// `{ error }`; anything else thrown is a bug the browser reports as one (docs/adr/0004).
import { SignedOut } from "@/lib/auth";
import * as integrations from "@/modules/integrations";
import {
  connectInput,
  connectionInput,
  waitLabel,
  type ConnectionListItem,
} from "@/modules/integrations/contracts";
import * as projects from "@/modules/projects";
import * as threads from "@/modules/threads";
import {
  forkThreadInput,
  placeThreadInput,
  startThreadInput,
  type ThreadListItem,
} from "@/modules/threads/contracts";
import { createProjectInput, type ProjectListItem } from "@/modules/projects/contracts";

/**
 * An action's refusal: copy the user can read. `field`: the input field it is about. `gone`: the
 * thing the action named no longer exists, so the browser drops it. `signIn`: the session ended.
 */
export type Refusal = { error: string; field?: string; gone?: true; signIn?: true };

const signInAgain: Refusal = {
  error: "Your session has ended. Taking you to sign in…",
  signIn: true,
};

/** Runs a module call; a visitor is told to sign in rather than thrown at. */
async function signedIn<T>(run: () => Promise<T | Refusal>): Promise<T | Refusal> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SignedOut) return signInAgain;
    throw error;
  }
}

/** Adds a project; a name the user already uses answers with that project. */
export async function createProjectAction(
  input: unknown,
): Promise<ProjectListItem | Refusal> {
  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) return { error: "Give the project a name, up to 80 characters." };
  return signedIn(() => projects.createProject(parsed.data));
}

const WHERE = {
  loopback: "this server itself",
  private: "on a private network",
  "link-local": "on a link-local network",
} as const;

/** The copy for a provider's or a connection's refusal; anything else is a bug and rethrown. */
function connectionRefusal(error: unknown, credentialKind?: "token" | "basic"): Refusal {
  if (error instanceof integrations.ConnectionNotFound)
    return { error: "This connection no longer exists.", gone: true };
  if (error instanceof integrations.ProviderNotFound)
    return { error: "This provider cannot be connected this way." };
  if (error instanceof integrations.BaseUrlRefused) {
    const { host, reason, resolvedTo } = error;
    if (reason === "missing") return { error: "Enter the address of its API.", field: "baseUrl" };
    if (reason === "unresolved")
      return { error: `${host} could not be found. Check the address.`, field: "baseUrl" };
    const what = resolvedTo ? `${host} resolves to ${resolvedTo},` : `${host} is`;
    return {
      error: `${what} ${WHERE[reason]}. Enter an address on the internet.`,
      field: "baseUrl",
    };
  }
  if (error instanceof integrations.CredentialRejected)
    return {
      error:
        credentialKind === "basic"
          ? `${error.providerName} did not accept this username and password.`
          : `${error.providerName} did not accept this token. Check that it is complete and has not expired.`,
    };
  if (error instanceof integrations.ProviderRateLimited)
    return {
      error: `${error.providerName}'s rate limit is reached. Try again in ${waitLabel(error.retryAt)}.`,
    };
  if (error instanceof integrations.ProviderUnreachable)
    return {
      error: error.status
        ? `${error.providerName} answered with HTTP ${error.status}.`
        : `${error.providerName} at ${error.baseUrl} could not be reached.`,
    };
  throw error;
}

/**
 * Connects to a provider: it checks the credential and names the account before anything is
 * stored. Connecting the same account again updates it.
 */
export async function connectAction(input: unknown): Promise<ConnectionListItem | Refusal> {
  const parsed = connectInput.safeParse(input);
  if (!parsed.success) {
    const url = parsed.error.issues.find((issue) => issue.path[0] === "baseUrl");
    return url
      ? { error: "Enter an address that starts with https://.", field: "baseUrl" }
      : { error: "Check what you entered and try again." };
  }
  return signedIn(() =>
    integrations
      .connect(parsed.data)
      .catch((error: unknown) => connectionRefusal(error, parsed.data.credential.kind)),
  );
}

/** Asks the provider again whether the stored credential works, and records the answer. */
export async function testConnectionAction(
  input: unknown,
): Promise<ConnectionListItem | Refusal> {
  const parsed = connectionInput.safeParse(input);
  if (!parsed.success) return { error: "This connection no longer exists.", gone: true };
  return signedIn(() =>
    integrations
      .testConnection(parsed.data.connectionId)
      .catch((error: unknown) => connectionRefusal(error)),
  );
}

/** Removes a connection and its credential. */
export async function disconnectAction(input: unknown): Promise<{ id: string } | Refusal> {
  const parsed = connectionInput.safeParse(input);
  if (!parsed.success) return { error: "This connection no longer exists.", gone: true };
  return signedIn(() =>
    integrations
      .disconnect(parsed.data.connectionId)
      .catch((error: unknown) => connectionRefusal(error)),
  );
}

/** The copy for a thread's refusal; anything else is a bug and rethrown. */
function threadRefusal(error: unknown): Refusal {
  if (error instanceof threads.ThreadNotFound)
    return { error: "This thread no longer exists.", gone: true };
  if (error instanceof threads.ProjectNotFound)
    return { error: "This project no longer exists.", gone: true };
  if (error instanceof threads.ThreadIdTaken)
    return { error: "This thread was already started. Reload the page." };
  if (error instanceof threads.ResponseNotFound)
    return { error: "This response is not stored yet. Try again once it has finished." };
  if (error instanceof threads.SnoozeTimeInPast)
    return { error: "That time has passed. Choose another time.", field: "until" };
  throw error;
}

/**
 * Stores the new thread the user's first message starts, in one of their projects or in none.
 * The browser sends the message once this answers.
 */
export async function startThreadAction(input: unknown): Promise<ThreadListItem | Refusal> {
  const parsed = startThreadInput.safeParse(input);
  if (!parsed.success) return { error: "That message can't start a thread." };
  return signedIn(() => threads.startThread(parsed.data).catch(threadRefusal));
}

/** Stores a fork of one of the user's threads through one of its responses. */
export async function forkThreadAction(input: unknown): Promise<ThreadListItem | Refusal> {
  const parsed = forkThreadInput.safeParse(input);
  if (!parsed.success) return { error: "That response can't be forked." };
  return signedIn(() => threads.forkThread(parsed.data).catch(threadRefusal));
}

/** Settles, snoozes, restores or wakes one of the user's threads, or undoes that. */
export async function placeThreadAction(input: unknown): Promise<ThreadListItem | Refusal> {
  const parsed = placeThreadInput.safeParse(input);
  if (!parsed.success) return { error: "That change can't be made to a thread." };
  return signedIn(() => threads.placeThread(parsed.data).catch(threadRefusal));
}
